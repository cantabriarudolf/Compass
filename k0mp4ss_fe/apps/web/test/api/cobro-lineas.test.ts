/**
 * @vitest-environment node
 *
 * T5/T8 cobro-gastos-comunes-parametrico (S5) — el cobro FI como lista de conceptos.
 *
 * `lineas` nace opcional/`NULL` para no reescribir los cobros ya emitidos y
 * `lineasDeCobro` sintetiza la línea histórica cuando no hay líneas. T8 separa
 * los dos contratos: `CobroFISchema` es LECTURA (fila de la base, `lineas` puede
 * ser `NULL`) y `CobroFIEscrituraSchema` es ESCRITURA (`lineas: null` se
 * rechaza: un escritor no puede borrar el detalle mandando nulo). El invariante
 * «la suma del detalle = `montoBase`» vive en la escritura completa
 * (`CobroFIEscrituraCompletaSchema`), no en el esquema que todo lector parsea.
 * También se ejecuta la sentencia REAL de la migración sobre una base SQLite
 * temporal, fuera del worktree, para comprobar que agregó la columna sin tocar
 * filas existentes.
 */
import { describe, it, expect } from "vitest"
import { z } from "zod"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { PrismaClient } from "@prisma/client"
import {
  CobroFIEscrituraCompletaSchema,
  CobroFIEscrituraSchema,
  CobroFISchema,
} from "@/lib/schemas"
import { DESTINO_BASE } from "../db-descartable.setup"

/** La migración se ejecuta sobre SQLite; en el job PostgreSQL no se aplica (usa db push). */
const ES_SQLITE = DESTINO_BASE.archivo !== null

const ARCHIVO_MIGRACION = path.resolve(
  __dirname,
  "..",
  "..",
  "prisma/migrations/20261106000000_add_cobro_fi_lineas/migration.sql"
)

/** Cobro mínimo válido: el mismo shape que usan la emisión y los creadores legacy. */
function cobroBase(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "cob-t5-1",
    unidadId: "u-t5-1",
    periodo: "2026-11",
    concepto: "gasto_comun",
    origenModulo: "FI",
    origenRef: "egc-t5-1",
    fondoId: "fondo-gc-t5",
    descripcion: "Gasto Común 2026-11",
    montoBase: 60000,
    fechaCargo: "2026-11-01",
    fechaVencimiento: "2026-12-01",
    moras: [],
    pagos: [],
    diferencias: [],
    ...overrides,
  }
}

async function conBaseTemporal<T>(
  fn: (db: PrismaClient) => Promise<T>
): Promise<T> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cobro-lineas-t5-"))
  const db = new PrismaClient({
    datasourceUrl: `file:${path.join(dir, "migracion.db")}`,
  })
  try {
    return await fn(db)
  } finally {
    await db.$disconnect()
    rmSync(dir, { recursive: true, force: true })
  }
}

const MENSAJE_DETALLE_NULO =
  "El detalle del cobro no puede ser nulo: si el cobro no tiene detalle, omití las líneas."
const MENSAJE_SUMA = "Las líneas deben sumar exactamente el monto base."

/**
 * T8: cada contrato tiene que poder componerse sin trucos. Hoy
 * `CobroFISchema.partial()` existía solo porque un `Object.assign` se lo pegaba
 * a mano a un ZodEffects; `.extend`, `.pick` y `.shape` no. Se prueban los
 * cuatro sobre el contrato de lectura y sobre el de escritura.
 */
function componeComoSchemaDeObjeto(
  schema: typeof CobroFISchema | typeof CobroFIEscrituraSchema
): void {
  expect(schema.partial().safeParse({ descripcion: "solo el parche" }).success).toBe(
    true
  )
  const extendido = schema.extend({ nota: z.string() })
  expect(extendido.shape.nota.safeParse("x").success).toBe(true)
  const elegido = schema.pick({ montoBase: true })
  expect(elegido.safeParse({ montoBase: 60000 }).success).toBe(true)
  expect(schema.shape.montoBase.safeParse(60000).success).toBe(true)
}

describe("CobroFISchema — contrato de LECTURA del cobro (S5)", () => {
  it("es un z.object composable: partial, extend, pick y shape funcionan", () => {
    componeComoSchemaDeObjeto(CobroFISchema)
  })

  it("acepta el cobro legacy sin lineas y con lineas nulas", () => {
    // La fila de la base guarda NULL donde el cobro es de una sola línea: el
    // lector no puede tratar eso como un cobro inválido.
    const sinLineas = CobroFISchema.safeParse(cobroBase())
    expect(sinLineas.success).toBe(true)
    if (sinLineas.success) expect(sinLineas.data.lineas).toBeUndefined()

    const nulas = CobroFISchema.safeParse(cobroBase({ lineas: null }))
    expect(nulas.success).toBe(true)
    if (nulas.success) expect(nulas.data.lineas).toBeNull()
  })

  it("acepta lineas presentes que suman exactamente montoBase", () => {
    const res = CobroFISchema.safeParse(
      cobroBase({
        lineas: [
          { concepto: "gasto_comun", monto: 50000 },
          { concepto: "multa_in", monto: 10000, fondoId: "fondo-multas-t5" },
        ],
      })
    )
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.lineas).toHaveLength(2)
      expect(res.data.lineas?.map((l) => l.monto)).toEqual([50000, 10000])
    }
  })

  it("acepta el cobro con dos líneas del mismo concepto imputadas a fondos distintos", () => {
    // Shape que emite la emisión del corte 2 de T5: gasto común al fondo GC y
    // recargo de reserva al fondo de reserva. El concepto no distingue las
    // líneas; el fondo de imputación sí.
    const res = CobroFISchema.safeParse(
      cobroBase({
        montoBase: 66000,
        lineas: [
          { concepto: "gasto_comun", monto: 60000, fondoId: "fondo-gc-t5" },
          { concepto: "gasto_comun", monto: 6000, fondoId: "fondo-res-t5" },
        ],
      })
    )
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.lineas?.map((l) => l.fondoId)).toEqual([
        "fondo-gc-t5",
        "fondo-res-t5",
      ])
    }
  })

  it("no juzga la suma: leer una fila no es escribirla", () => {
    // Si el invariante viviera acá, un lector no podría leer un cobro
    // descuadrado sin declararlo inválido. La coherencia se exige al escribir.
    const res = CobroFISchema.safeParse(
      cobroBase({ lineas: [{ concepto: "gasto_comun", monto: 59999 }] })
    )
    expect(res.success).toBe(true)
  })
})

describe("CobroFIEscrituraSchema — contrato de ESCRITURA (S5)", () => {
  it("es un z.object composable: partial, extend, pick y shape funcionan", () => {
    componeComoSchemaDeObjeto(CobroFIEscrituraSchema)
  })

  it("rechaza el detalle nulo: un escritor no puede borrar las líneas mandando null", () => {
    const res = CobroFIEscrituraSchema.safeParse(cobroBase({ lineas: null }))
    expect(res.success).toBe(false)
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path.join(".") === "lineas")
      expect(issue?.message).toBe(MENSAJE_DETALLE_NULO)
    }
    // Y también en el parche del PUT, que es donde se intentaría el borrado.
    const parche = CobroFIEscrituraSchema.partial().safeParse({ lineas: null })
    expect(parche.success).toBe(false)
  })

  it("acepta el cobro legacy: la ausencia de líneas es una sola línea histórica", () => {
    const res = CobroFIEscrituraSchema.safeParse(cobroBase())
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.lineas).toBeUndefined()
  })

  it("rechaza lineas vacías y líneas con monto no positivo", () => {
    const vacias = CobroFIEscrituraSchema.safeParse(cobroBase({ lineas: [] }))
    expect(vacias.success).toBe(false)
    if (!vacias.success) {
      expect(
        vacias.error.issues.some((i) => i.path.join(".") === "lineas")
      ).toBe(true)
    }

    for (const monto of [0, -1]) {
      const res = CobroFIEscrituraSchema.safeParse(
        cobroBase({ lineas: [{ concepto: "gasto_comun", monto }] })
      )
      expect(res.success).toBe(false)
    }
  })
})

describe("CobroFIEscrituraCompletaSchema — el invariante donde se escribe (S5)", () => {
  it("acepta las líneas que suman exactamente montoBase", () => {
    const res = CobroFIEscrituraCompletaSchema.safeParse(
      cobroBase({
        montoBase: 66000,
        lineas: [
          { concepto: "gasto_comun", monto: 60000, fondoId: "fondo-gc-t5" },
          { concepto: "gasto_comun", monto: 6000, fondoId: "fondo-res-t5" },
        ],
      })
    )
    expect(res.success).toBe(true)
  })

  it("acepta el cobro legacy sin detalle: la ausencia no contradice el total", () => {
    expect(CobroFIEscrituraCompletaSchema.safeParse(cobroBase()).success).toBe(true)
  })

  it("rechaza lineas cuya suma difiere de montoBase", () => {
    for (const lineas of [
      [{ concepto: "gasto_comun", monto: 59999 }],
      [
        { concepto: "gasto_comun", monto: 50000 },
        { concepto: "multa_in", monto: 10001 },
      ],
    ]) {
      const res = CobroFIEscrituraCompletaSchema.safeParse(cobroBase({ lineas }))
      expect(res.success).toBe(false)
      if (!res.success) {
        const issue = res.error.issues.find(
          (i) => i.path.join(".") === "lineas"
        )
        expect(issue?.message).toBe(MENSAJE_SUMA)
      }
    }
  })

  it("sigue rechazando el detalle nulo", () => {
    const res = CobroFIEscrituraCompletaSchema.safeParse(cobroBase({ lineas: null }))
    expect(res.success).toBe(false)
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path.join(".") === "lineas")
      expect(issue?.message).toBe(MENSAJE_DETALLE_NULO)
    }
  })
})

describe("lineasDeCobro — línea histórica sintética vs líneas reales", () => {
  it("sintetiza una sola línea con el concepto y montoBase del cobro legacy", async () => {
    const { lineasDeCobro } = await import("@/lib/cobro-lineas")
    expect(
      lineasDeCobro({ concepto: "gasto_comun", montoBase: 60000, lineas: null })
    ).toEqual([{ concepto: "gasto_comun", monto: 60000 }])
    expect(lineasDeCobro({ concepto: "multa_in", montoBase: 5000 })).toEqual([
      { concepto: "multa_in", monto: 5000 },
    ])
  })

  it("devuelve las líneas propias cuando el cobro ya las tiene", async () => {
    const { lineasDeCobro } = await import("@/lib/cobro-lineas")
    const reales = [
      { concepto: "gasto_comun" as const, monto: 50000 },
      {
        concepto: "multa_in" as const,
        monto: 10000,
        fondoId: "fondo-multas-t5",
      },
    ]
    expect(
      lineasDeCobro({
        concepto: "gasto_comun",
        montoBase: 60000,
        lineas: reales,
      })
    ).toEqual(reales)
  })

  it("nombra la contradicción contra montoBase sin tratar la ausencia como error", async () => {
    const { lineasContradicenMontoBase } = await import("@/lib/cobro-lineas")
    expect(lineasContradicenMontoBase(undefined, 60000)).toBe(false)
    expect(lineasContradicenMontoBase(null, 60000)).toBe(false)
    expect(
      lineasContradicenMontoBase(
        [{ concepto: "gasto_comun", monto: 60000 }],
        60000
      )
    ).toBe(false)
    expect(
      lineasContradicenMontoBase(
        [{ concepto: "gasto_comun", monto: 59999 }],
        60000
      )
    ).toBe(true)
    expect(lineasContradicenMontoBase([], 60000)).toBe(true)
  })
})

describe("migración add_cobro_fi_lineas — aditiva y sin backfill", () => {
  it.skipIf(!ES_SQLITE)(
    "agrega la columna lineas nullable y deja las filas existentes intactas",
    async () => {
      const sql = readFileSync(ARCHIVO_MIGRACION, "utf8")

      await conBaseTemporal(async (db) => {
        await db.$executeRawUnsafe(`
        CREATE TABLE "cobros_fi" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "comunidadId" TEXT NOT NULL,
          "montoBase" REAL NOT NULL,
          "moras" JSONB NOT NULL,
          "pagos" JSONB NOT NULL
        )
      `)
        await db.$executeRawUnsafe(`
        INSERT INTO "cobros_fi" ("id", "comunidadId", "montoBase", "moras", "pagos")
        VALUES
          ('cobro-legacy-1', 'comunidad-a', 60000, '[]', '[]'),
          ('cobro-legacy-2', 'comunidad-a', 12500.5, '[{"id":"mora-1"}]', '[]')
      `)

        const columnasAntes = await db.$queryRawUnsafe<{ name: string }[]>(
          `PRAGMA table_info("cobros_fi")`
        )
        expect(columnasAntes.map((c) => c.name)).not.toContain("lineas")

        const antes = await db.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT "id", "comunidadId", "montoBase", "moras", "pagos"
         FROM "cobros_fi" ORDER BY "id"`
        )

        await db.$executeRawUnsafe(sql)

        const columnasDespues = await db.$queryRawUnsafe<
          {
            name: string
            type: string
            notnull: number | bigint
            dflt_value: string | null
          }[]
        >(`PRAGMA table_info("cobros_fi")`)
        const columnaLineas = columnasDespues.find((c) => c.name === "lineas")
        expect(columnaLineas).toBeDefined()
        expect(String(columnaLineas?.type).toUpperCase()).toBe("JSONB")
        expect(Number(columnaLineas?.notnull)).toBe(0)
        expect(columnaLineas?.dflt_value).toBeNull()

        const despues = await db.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT "id", "comunidadId", "montoBase", "moras", "pagos", "lineas"
         FROM "cobros_fi" ORDER BY "id"`
        )
        expect(
          despues.map((fila) => ({
            id: fila.id,
            comunidadId: fila.comunidadId,
            montoBase: fila.montoBase,
            moras: fila.moras,
            pagos: fila.pagos,
          }))
        ).toEqual(antes)
        expect(despues.every((fila) => fila.lineas === null)).toBe(true)
      })
    }
  )
})
