/**
 * @vitest-environment node
 *
 * Integridad de titularidad — la semilla de demo y el chequeo, contra una base REAL.
 *
 * Por qué una base propia en un directorio temporal: `scripts/seed-db-from-data.ts`
 * escribe ids globales (`p-1`, `u-A-101`, `tipo-a`, `afp-habitat`…) y la suite
 * comparte una sola base descartable entre archivos. Correr la semilla sobre esa
 * base podría mover filas de otra prueba en paralelo. Acá se migra una base
 * SQLite nueva en `mkdtemp` y se borra al terminar; el `DATABASE_URL` se pasa por
 * entorno a cada script.
 *
 * Lo que fija:
 *   1. la semilla de demo deja CERO unidades sin propietario vigente (166/166),
 *   2. el chequeo de integridad y el lector del panel coinciden en el número,
 *   3. con el fixture roto aplicado aparecen las DOS causas (nunca declarado y
 *      vínculo cerrado sin reemplazo) y el modo estricto sale distinto de cero,
 *   4. al quitar el fixture vuelve a cero y el modo estricto sale 0.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { spawnSync, type SpawnSyncReturns } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { PrismaClient } from "@prisma/client"
import { leerTitularidad } from "@/app/admin/metricas/_titularidad"

const APP_DIR = path.resolve(__dirname, "..", "..")
const COMUNIDAD = "integridad-titular-com-a"
/** Otra comunidad que toma para sí el id de una unidad del fixture. */
const COMUNIDAD_OTRA = "integridad-titular-com-b"
/** Unidad del fixture cuyo id ya fue tomado por la OTRA comunidad. */
const U_AJENA = "u-INT-01"
const VINCULO_AJENO = "integridad-vinculo-ajeno"
const SCHEMA = "prisma/schema.sqlite.prisma"

let directorio = ""
let urlBase = ""
let prisma: PrismaClient

/** Corre un script con la base temporal en `DATABASE_URL`. */
function correr(
  args: string[],
  dbUrl: string = urlBase
): SpawnSyncReturns<string> {
  return spawnSync("npx", args, {
    cwd: APP_DIR,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: dbUrl },
    timeout: 120_000,
  })
}

/** Corre el chequeo de integridad y devuelve su salida con el código observado. */
function correrChequeo(extra: string[] = []): {
  estado: number | null
  salida: string
} {
  const r = correr([
    "vite-node",
    "scripts/check-unidades-sin-propietario.ts",
    `--comunidad-id=${COMUNIDAD}`,
    ...extra,
  ])
  return { estado: r.status, salida: `${r.stdout ?? ""}${r.stderr ?? ""}` }
}

/** El total que imprime el chequeo (`sin propietario vigente: N`). */
function totalDelChequeo(salida: string): number {
  const match = /sin propietario vigente: (\d+)/.exec(salida)
  expect(match, `la salida no declara el total:\n${salida}`).not.toBeNull()
  return Number(match?.[1])
}

beforeAll(async () => {
  directorio = mkdtempSync(path.join(os.tmpdir(), "compass-titularidad-"))
  urlBase = `file:${path.join(directorio, "titularidad.db")}`

  const migracion = correr(["prisma", "migrate", "deploy", `--schema=${SCHEMA}`])
  expect(
    migracion.status,
    `migrate deploy falló:\n${migracion.stdout ?? ""}${migracion.stderr ?? ""}`
  ).toBe(0)

  prisma = new PrismaClient({ datasourceUrl: urlBase })
  await prisma.comunidad.create({
    data: { id: COMUNIDAD, nombre: "Comunidad Integridad Titularidad", slug: "integridad-titular" },
  })

  const semilla = correr([
    "vite-node",
    "scripts/seed-db-from-data.ts",
    `--comunidad-id=${COMUNIDAD}`,
  ])
  expect(
    semilla.status,
    `la semilla falló:\n${semilla.stdout ?? ""}${semilla.stderr ?? ""}`
  ).toBe(0)
}, 180_000)

afterAll(async () => {
  await prisma?.$disconnect()
  if (directorio) rmSync(directorio, { recursive: true, force: true })
})
describe("integridad de titularidad — semilla de demo completa", () => {
  it("la semilla deja las 166 unidades con propietario vigente", async () => {
    const titularidad = await leerTitularidad(COMUNIDAD, prisma)
    expect(titularidad.evaluadas).toBe(166)
    expect(titularidad.total).toBe(0)
    expect(titularidad.porCausa).toEqual({
      nunca_declarado: 0,
      vinculo_cerrado_sin_reemplazo: 0,
    })
  })

  it("el conteo del panel es el del chequeo (mismo número, no dos verdades)", async () => {
    const titularidad = await leerTitularidad(COMUNIDAD, prisma)
    const { estado, salida } = correrChequeo()
    expect(estado).toBe(0)
    expect(totalDelChequeo(salida)).toBe(titularidad.total)
  })
})

describe("chequeo de integridad — fixture roto aplicado y quitado", () => {
  it("detecta las dos causas y el modo estricto falla", async () => {
    const aplicar = correr([
      "vite-node",
      "scripts/fixture-integridad-titularidad.ts",
      `--comunidad-id=${COMUNIDAD}`,
      "--aplicar",
    ])
    expect(
      aplicar.status,
      `aplicar el fixture falló:\n${aplicar.stdout ?? ""}${aplicar.stderr ?? ""}`
    ).toBe(0)

    const titularidad = await leerTitularidad(COMUNIDAD, prisma)
    expect(titularidad.total).toBe(4)
    expect(titularidad.porCausa).toEqual({
      nunca_declarado: 3,
      vinculo_cerrado_sin_reemplazo: 1,
    })

    // Sin modo estricto informa y no falla: la demo puede contener el fixture.
    const normal = correrChequeo()
    expect(normal.estado).toBe(0)
    expect(totalDelChequeo(normal.salida)).toBe(titularidad.total)

    // En modo estricto el código de salida es el veredicto.
    const estricto = correrChequeo(["--strict"])
    expect(estricto.estado).toBe(1)
    expect(totalDelChequeo(estricto.salida)).toBe(4)
  }, 180_000)

  it("al quitar el fixture vuelve a cero y el modo estricto pasa", async () => {
    const quitar = correr([
      "vite-node",
      "scripts/fixture-integridad-titularidad.ts",
      `--comunidad-id=${COMUNIDAD}`,
      "--quitar",
    ])
    expect(
      quitar.status,
      `quitar el fixture falló:\n${quitar.stdout ?? ""}${quitar.stderr ?? ""}`
    ).toBe(0)

    const titularidad = await leerTitularidad(COMUNIDAD, prisma)
    expect(titularidad.total).toBe(0)
    const estricto = correrChequeo(["--strict"])
    expect(estricto.estado).toBe(0)
    expect(totalDelChequeo(estricto.salida)).toBe(0)
  }, 180_000)
})

describe("fixture roto — colisión de id con otra comunidad", () => {
  it("si el id del fixture ya existe en OTRA comunidad, --aplicar aborta y no toca nada", async () => {
    // La colisión se monta ACÁ (no en beforeAll): los applies/quitars de los
    // describe anteriores son legítimos y sólo en ESTE caso el id del fixture
    // ya fue tomado por otra comunidad.
    await prisma.comunidad.create({
      data: { id: COMUNIDAD_OTRA, nombre: "Comunidad Integridad Otra", slug: "integridad-otra" },
    })
    await prisma.unidad.create({
      data: {
        id: U_AJENA,
        comunidadId: COMUNIDAD_OTRA,
        microSectorId: "micro-ajeno",
        numero: "INT-01",
        etiqueta: "Unidad ajena",
        tipoUnidadId: "tipo-ajeno",
        metraje: 50,
        prorrateo: 1,
        rolSii: "",
        estadoId: "vacante",
        servicios: {},
      },
    })
    // La unidad ajena tiene un vínculo de propietario: una reasignación lo
    // dejaría huérfano (el daño que la guardia tiene que impedir).
    await prisma.vinculoUnidad.create({
      data: {
        id: VINCULO_AJENO,
        comunidadId: COMUNIDAD_OTRA,
        personaId: "persona-ajena",
        unidadId: U_AJENA,
        rol: "propietario",
        fechaInicio: "2020-01-01",
        fechaFin: null,
        permiteVerFinanzas: false,
      },
    })

    const aplicar = correr([
      "vite-node",
      "scripts/fixture-integridad-titularidad.ts",
      `--comunidad-id=${COMUNIDAD}`,
      "--aplicar",
    ])
    const salida = `${aplicar.stdout ?? ""}${aplicar.stderr ?? ""}`
    expect(aplicar.status, `aplicar debería abortar por colisión de id:\n${salida}`).not.toBe(0)
    // El error literal nombra el id y la comunidad dueña de la fila.
    expect(salida).toContain(U_AJENA)
    expect(salida).toContain(COMUNIDAD_OTRA)

    // La unidad ajena sigue siendo de SU comunidad y conserva su vínculo:
    // nada fue reasignado ni borrado.
    const despues = await prisma.unidad.findUnique({ where: { id: U_AJENA } })
    expect(despues?.comunidadId).toBe(COMUNIDAD_OTRA)
    const vinculoDespues = await prisma.vinculoUnidad.findUnique({
      where: { id: VINCULO_AJENO },
    })
    expect(vinculoDespues?.unidadId).toBe(U_AJENA)
    expect(vinculoDespues?.comunidadId).toBe(COMUNIDAD_OTRA)

    // Y la comunidad pedida quedó intacta: ni unidades nuevas ni cierre.
    const titularidad = await leerTitularidad(COMUNIDAD, prisma)
    expect(titularidad.total).toBe(0)
    expect(titularidad.evaluadas).toBe(166)
    const cierre = await prisma.vinculoUnidad.findFirst({
      where: { comunidadId: COMUNIDAD, fechaFin: "2099-12-31" },
    })
    expect(cierre).toBeNull()

    // Limpieza local: la comunidad colisionada no queda para ningún otro caso.
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: COMUNIDAD_OTRA } })
    await prisma.unidad.deleteMany({ where: { comunidadId: COMUNIDAD_OTRA } })
    await prisma.comunidad.deleteMany({ where: { id: COMUNIDAD_OTRA } })
  }, 120_000)
})
