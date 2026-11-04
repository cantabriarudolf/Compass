/**
 * @vitest-environment node
 *
 * T5 cobro-gastos-comunes-parametrico (S5) — el cobro FI como lista de conceptos.
 *
 * Este corte es aditivo: `lineas` nace opcional/`NULL` para no reescribir los
 * cobros ya emitidos, `lineasDeCobro` sintetiza la línea histórica cuando no
 * hay líneas y la migración solo agrega la columna. Aquí se fija el invariante
 * (las líneas presentes suman exactamente `montoBase`) y se ejecuta la
 * sentencia REAL de la migración sobre una base SQLite temporal, fuera del
 * worktree, para comprobar que agrega la columna sin tocar filas existentes.
 */
import { describe, it, expect } from "vitest"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { PrismaClient } from "@prisma/client"
import { CobroFISchema } from "@/lib/schemas"
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

describe("CobroFISchema — lineas opcionales con suma exacta (S5)", () => {
  it("acepta el cobro legacy sin lineas y con lineas nulas", () => {
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

  it("rechaza lineas cuya suma difiere de montoBase", () => {
    for (const lineas of [
      [{ concepto: "gasto_comun", monto: 59999 }],
      [
        { concepto: "gasto_comun", monto: 50000 },
        { concepto: "multa_in", monto: 10001 },
      ],
    ]) {
      const res = CobroFISchema.safeParse(cobroBase({ lineas }))
      expect(res.success).toBe(false)
      if (!res.success) {
        const issue = res.error.issues.find(
          (i) => i.path.join(".") === "lineas"
        )
        expect(issue?.message).toBe(
          "Las líneas deben sumar exactamente el monto base."
        )
      }
    }
  })

  it("rechaza lineas vacías y líneas con monto no positivo", () => {
    const vacias = CobroFISchema.safeParse(cobroBase({ lineas: [] }))
    expect(vacias.success).toBe(false)
    if (!vacias.success) {
      expect(
        vacias.error.issues.some((i) => i.path.join(".") === "lineas")
      ).toBe(true)
    }

    for (const monto of [0, -1]) {
      const res = CobroFISchema.safeParse(
        cobroBase({ lineas: [{ concepto: "gasto_comun", monto }] })
      )
      expect(res.success).toBe(false)
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
