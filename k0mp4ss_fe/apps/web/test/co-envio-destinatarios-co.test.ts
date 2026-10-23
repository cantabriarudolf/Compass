/**
 * @vitest-environment node
 *
 * S8 — `EnvioDestinatarioCO` es la única fuente de pertenencia y lectura:
 * el backfill desde las columnas JSON (`destinatarios`, `lecturas`) es idempotente
 * y el modelo existe en los DOS schemas (Postgres y SQLite), porque el CI corre
 * la suite contra el schema SQLite.
 *
 * El backfill vive en la migración SQL; este test lo ejecuta tal cual está escrito
 * (entre las marcas `@backfill:start` / `@backfill:end`) sobre la base descartable,
 * dos veces, y verifica los conteos. La ruta PostgreSQL está en
 * `prisma/backfill/envio_destinatarios_co.pg.sql` (dialecto distinto) y aquí solo
 * se verifica que exista y sea idempotente por construcción (`ON CONFLICT DO NOTHING`).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { prisma } from "@/lib/prisma"

const APP_DIR = path.resolve(__dirname, "..")
const PRISMA_DIR = path.join(APP_DIR, "prisma")
const MIGRACION_SQLITE = path.join(
  PRISMA_DIR,
  "migrations",
  "20261024000000_add_envio_destinatarios_co",
  "migration.sql"
)
const BACKFILL_PG = path.join(PRISMA_DIR, "backfill", "envio_destinatarios_co.pg.sql")

const MARCA_INICIO = "-- @backfill:start"
const MARCA_FIN = "-- @backfill:end"

/** Extrae el statement de backfill de la migración (SQLite) tal como se aplica en producción. */
function sentenciaBackfillSqlite(): string {
  const sql = readFileSync(MIGRACION_SQLITE, "utf8")
  const inicio = sql.indexOf(MARCA_INICIO)
  const fin = sql.indexOf(MARCA_FIN)
  if (inicio < 0 || fin < 0 || fin < inicio) {
    throw new Error(
      `la migración no delimita el backfill con ${MARCA_INICIO} / ${MARCA_FIN}`
    )
  }
  return sql
    .slice(inicio + MARCA_INICIO.length, fin)
    .trim()
    .replace(/;\s*$/u, "")
}

describe("S8 — schemas: el modelo existe en Postgres y en SQLite", () => {
  const schemas = [
    { nombre: "schema.prisma (Postgres)", ruta: path.join(PRISMA_DIR, "schema.prisma") },
    { nombre: "schema.sqlite.prisma (CI)", ruta: path.join(PRISMA_DIR, "schema.sqlite.prisma") },
  ]

  for (const schema of schemas) {
    it(`${schema.nombre} declara EnvioDestinatarioCO con unicidad, índice y cascade`, () => {
      const texto = readFileSync(schema.ruta, "utf8")
      const bloque = texto.match(/model EnvioDestinatarioCO \{[\s\S]*?\n\}/u)?.[0]
      expect(bloque).toBeDefined()
      expect(bloque).toContain('@@map("envio_destinatarios_co")')
      expect(bloque).toContain("@@unique([envioId, personaId])")
      expect(bloque).toContain("@@index([personaId])")
      expect(bloque).toContain("onDelete: Cascade")
      expect(bloque).toContain("leidoEn")
      expect(bloque).toContain("unidadId")
      // La relación es obligatoria: sin el lado inverso Prisma no valida el schema.
      const envio = texto.match(/model EnvioCO \{[\s\S]*?\n\}/u)?.[0]
      expect(envio).toContain("EnvioDestinatarioCO[]")
    })
  }
})

describe("S8 — backfill desde las columnas JSON", () => {
  const comunidad = "co-dest-backfill"
  const envioTresLecturaUna = "co-dest-envio-a"
  const envioDosSinLecturas = "co-dest-envio-b"
  const envioDosDosLecturas = "co-dest-envio-c"
  const envios = [envioTresLecturaUna, envioDosSinLecturas, envioDosDosLecturas]

  beforeAll(async () => {
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad Backfill CO", slug: comunidad },
    })
    await prisma.envioCO.deleteMany({ where: { id: { in: envios } } })
    await prisma.envioCO.createMany({
      data: [
        {
          id: envioTresLecturaUna,
          comunidadId: comunidad,
          asunto: "Citación asamblea ordinaria",
          cuerpo: "Se cita a asamblea ordinaria.",
          fechaEnvio: "2026-10-01",
          destinatarios: [
            { personaId: "persona-1", unidadId: "unidad-101" },
            { personaId: "persona-2", unidadId: "unidad-102" },
            { personaId: "persona-3" },
          ],
          lecturas: ["persona-2"],
        },
        {
          id: envioDosSinLecturas,
          comunidadId: comunidad,
          asunto: "Corte de agua programado",
          cuerpo: "Corte de agua el sábado de 09:00 a 13:00.",
          fechaEnvio: "2026-10-05",
          destinatarios: [
            { personaId: "persona-1", unidadId: "unidad-101" },
            { personaId: "persona-4", unidadId: "unidad-104" },
          ],
          lecturas: [],
        },
        {
          id: envioDosDosLecturas,
          comunidadId: comunidad,
          asunto: "Resultado de votación",
          cuerpo: "Se informa el resultado de la votación del presupuesto.",
          fechaEnvio: "2026-10-10",
          destinatarios: [
            { personaId: "persona-2", unidadId: "unidad-102" },
            { personaId: "persona-3" },
          ],
          lecturas: ["persona-2", "persona-3"],
        },
      ],
    })
  })

  afterAll(async () => {
    try {
      await prisma.envioCO.deleteMany({ where: { id: { in: envios } } })
      await prisma.comunidad.delete({ where: { id: comunidad } })
    } catch {
      // intencional: limpieza best-effort
    }
  })

  it("inserta una fila por destinatario y marca leidoEn según lecturas", async () => {
    await prisma.$executeRawUnsafe(sentenciaBackfillSqlite())

    const filas = await prisma.envioDestinatarioCO.findMany({
      where: { envioId: { in: envios } },
      orderBy: [{ envioId: "asc" }, { personaId: "asc" }],
    })

    // 3 + 2 + 2 destinatarios en el JSON → 7 filas.
    expect(filas).toHaveLength(7)
    expect(filas.filter((f) => f.envioId === envioTresLecturaUna)).toHaveLength(3)
    expect(filas.filter((f) => f.envioId === envioDosSinLecturas)).toHaveLength(2)
    expect(filas.filter((f) => f.envioId === envioDosDosLecturas)).toHaveLength(2)

    // unidadId se copia cuando el snapshot lo trae; queda null cuando no.
    const persona3 = filas.find(
      (f) => f.envioId === envioTresLecturaUna && f.personaId === "persona-3"
    )
    expect(persona3?.unidadId).toBeNull()
    const persona1 = filas.find(
      (f) => f.envioId === envioTresLecturaUna && f.personaId === "persona-1"
    )
    expect(persona1?.unidadId).toBe("unidad-101")

    // leidoEn marcado exactamente para quien aparece en `lecturas`.
    const leidos = filas.filter((f) => f.leidoEn !== null)
    expect(leidos).toHaveLength(3)
    expect(
      leidos.map((f) => `${f.envioId}:${f.personaId}`).sort()
    ).toEqual(
      [
        `${envioTresLecturaUna}:persona-2`,
        `${envioDosDosLecturas}:persona-2`,
        `${envioDosDosLecturas}:persona-3`,
      ].sort()
    )
  }, 30_000)

  it("es idempotente: correrlo dos veces no duplica filas", async () => {
    const antes = await prisma.envioDestinatarioCO.count({
      where: { envioId: { in: envios } },
    })
    await prisma.$executeRawUnsafe(sentenciaBackfillSqlite())
    const despues = await prisma.envioDestinatarioCO.count({
      where: { envioId: { in: envios } },
    })

    expect(antes).toBe(7)
    expect(despues).toBe(antes)

    const leidos = await prisma.envioDestinatarioCO.count({
      where: { envioId: { in: envios }, leidoEn: { not: null } },
    })
    expect(leidos).toBe(3)
  }, 30_000)

  it("la ruta PostgreSQL del backfill existe y es idempotente por construcción", () => {
    expect(existsSync(BACKFILL_PG)).toBe(true)
    const sql = readFileSync(BACKFILL_PG, "utf8").toLowerCase()
    expect(sql).toContain("insert into")
    expect(sql).toContain("on conflict")
    expect(sql).toContain("do nothing")
  })
})
