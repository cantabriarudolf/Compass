/**
 * test/db-descartable.test.ts — contrato de la base de la suite (change `test-db-descartable`).
 *
 * Fija que `npm test` nunca pueda resolver a `prisma/dev.db`: default descartable,
 * `DATABASE_URL` del entorno respetada, rutas relativas resueltas como las resuelve
 * Prisma, aborto explícito para cualquier vía que termine en `dev.db` y redirección
 * (documentada) en un runner efímero de CI.
 */
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  DB_DESCARTABLE_POR_DEFECTO,
  PRISMA_DIR,
  avisoRedireccion,
  esEntornoEfimero,
  mensajeDeAborto,
  resolverDestinoBaseDescartable,
  resolverDestinoSuite,
} from "./db-descartable.setup"

const APP_DIR = path.resolve(__dirname, "..")
const PERF_TEST = path.join(PRISMA_DIR, DB_DESCARTABLE_POR_DEFECTO)
const DEV_DB = path.join(PRISMA_DIR, "dev.db")

describe("resolución del destino de la suite", () => {
  it("sin DATABASE_URL usa la base descartable por defecto (nunca dev.db)", () => {
    const destino = resolverDestinoSuite({}, APP_DIR)
    expect(destino.origen).toBe("default")
    expect(destino.archivo).toBe(PERF_TEST)
    expect(destino.url).toBe(`file:${PERF_TEST}`)
    expect(destino.esDevDb).toBe(false)
    expect(mensajeDeAborto(destino)).toBeNull()
  })

  it("respeta la DATABASE_URL del entorno cuando no es dev.db", () => {
    const destino = resolverDestinoSuite(
      { DATABASE_URL: "file:./perf-local.db" },
      APP_DIR
    )
    expect(destino.origen).toBe("entorno")
    expect(destino.url).toBe("file:./perf-local.db")
    // Prisma resuelve `file:` relativo contra el directorio del schema.
    expect(destino.archivo).toBe(path.join(PRISMA_DIR, "perf-local.db"))
    expect(destino.esDevDb).toBe(false)
  })

  it("respeta una base no-file (PostgreSQL) sin tratarla como archivo", () => {
    const destino = resolverDestinoSuite(
      {
        DATABASE_URL:
          "postgresql://compass:compass@localhost:5432/compass_test",
      },
      APP_DIR
    )
    expect(destino.archivo).toBeNull()
    expect(destino.origen).toBe("entorno")
    expect(destino.esDevDb).toBe(false)
    expect(mensajeDeAborto(destino)).toBeNull()
  })

  it("acepta rutas absolutas y `file://`", () => {
    expect(
      resolverDestinoSuite({ DATABASE_URL: `file:${PERF_TEST}` }, APP_DIR)
        .archivo
    ).toBe(PERF_TEST)
    expect(
      resolverDestinoSuite({ DATABASE_URL: `file://${PERF_TEST}` }, APP_DIR)
        .archivo
    ).toBe(PERF_TEST)
  })
})

describe("guarda dura contra prisma/dev.db", () => {
  const rutasDev = [
    "file:./dev.db",
    "file:../prisma/dev.db",
    `file:${DEV_DB}`,
    `file:${path.join(PRISMA_DIR, "..", "prisma", "dev.db")}`,
    "file:./dev.db.backup-2026-10-05T09-26-15",
  ]

  it.each(rutasDev)("aborta con mensaje explícito para %s", (url) => {
    const destino = resolverDestinoSuite({ DATABASE_URL: url }, APP_DIR)
    expect(destino.esDevDb).toBe(true)
    const mensaje = mensajeDeAborto(destino)
    expect(mensaje).toContain("ABORTADO")
    expect(mensaje).toContain("prisma/dev.db")
    expect(avisoRedireccion(destino)).toBeNull()
  })

  it("sólo un runner efímero cambia el aborto por una redirección avisada", () => {
    const entornoCi = { DATABASE_URL: "file:./dev.db", CI: "true" }
    expect(esEntornoEfimero(entornoCi)).toBe(true)
    expect(esEntornoEfimero({})).toBe(false)
    const destino = resolverDestinoSuite(entornoCi, APP_DIR)
    expect(destino.origen).toBe("redirigido")
    expect(destino.esDevDb).toBe(false)
    expect(destino.archivo).toBe(PERF_TEST)
    expect(mensajeDeAborto(destino)).toBeNull()
    expect(avisoRedireccion(destino)).toContain("entorno efímero")
    // El aviso no aplica fuera de CI ni para una base sana.
    expect(avisoRedireccion(resolverDestinoSuite({}, APP_DIR))).toBeNull()
    expect(
      avisoRedireccion(
        resolverDestinoSuite(
          { DATABASE_URL: "file:./perf-x.db", CI: "true" },
          APP_DIR
        )
      )
    ).toBeNull()
  })
})

describe("contrato vivo de la corrida", () => {
  it("la suite corre contra la base descartable, no contra dev.db", () => {
    const destino = resolverDestinoSuite(process.env, APP_DIR)
    expect(destino.esDevDb).toBe(false)
    expect(destino.archivo).not.toBe(DEV_DB)
    // El setup ya fijó la URL efectiva de esta corrida (worker o proceso principal).
    expect(process.env.DATABASE_URL).toBe(destino.url)
    expect(process.env.DATABASE_URL).not.toContain("dev.db")
  })
})

describe("resolución cruda (referencia de las vías que abortan)", () => {
  it("devuelve `dev.db` tal cual para que la guarda decida", () => {
    const crudo = resolverDestinoBaseDescartable(
      { DATABASE_URL: "file:./dev.db" },
      APP_DIR
    )
    expect(crudo.esDevDb).toBe(true)
    expect(crudo.archivo).toBe(DEV_DB)
    expect(crudo.origen).toBe("entorno")
  })
})
