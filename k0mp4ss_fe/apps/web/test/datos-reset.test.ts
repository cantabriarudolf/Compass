/**
 * @vitest-environment node
 *
 * `datos:reset` (S3 de la ventana `pe-paneles-bd`): la guarda de entorno del wipe de datos.
 *
 * El script no se prueba corriendo la receta (borraría la base de la suite): se prueba la
 * decisión, que es lo que impide que un `npm run` destruya producción. Los tres rechazos y el
 * único camino feliz, sin tocar el disco.
 */
import { describe, expect, it } from "vitest"
import { evaluarEntorno, resolverDatabaseUrl } from "../scripts/datos-reset.mjs"

const SQLITE_DEV = "file:./dev.db"

describe("datos:reset — guarda de entorno", () => {
  it("rechaza producción aunque la base parezca local", () => {
    const r = evaluarEntorno({ databaseUrl: SQLITE_DEV, appEnv: "production" })

    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/producción/)
  })

  it("rechaza el alias prod y el NODE_ENV de un build", () => {
    expect(evaluarEntorno({ databaseUrl: SQLITE_DEV, appEnv: "prod" }).ok).toBe(false)
    const porNodeEnv = evaluarEntorno({ databaseUrl: SQLITE_DEV, nodeEnv: "production" })
    expect(porNodeEnv.ok).toBe(false)
    expect(porNodeEnv.motivo).toMatch(/NODE_ENV/)
  })

  it("rechaza una base gestionada: DATABASE_URL tiene que ser file:", () => {
    const r = evaluarEntorno({
      databaseUrl: "postgresql://usuario:secreto@host:5432/compass",
      appEnv: "development",
    })

    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/backup:db\/restore:db/)
  })

  it("rechaza DATABASE_URL ausente", () => {
    const r = evaluarEntorno({ databaseUrl: "", appEnv: "development" })

    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/DATABASE_URL ausente/)
  })

  it("acepta la base SQLite de desarrollo y resuelve su ruta a prisma/", () => {
    const r = evaluarEntorno({
      databaseUrl: SQLITE_DEV,
      appEnv: "development",
      nodeEnv: "development",
    })

    expect(r.ok).toBe(true)
    expect(r.dbPath).toMatch(/prisma[\\/]dev\.db$/)
  })

  it("acepta una base descartable perf*.db (lane e2e)", () => {
    const r = evaluarEntorno({ databaseUrl: "file:./perf-e2e.db", appEnv: "development" })

    expect(r.ok).toBe(true)
    expect(r.dbPath).toMatch(/prisma[\\/]perf-e2e\.db$/)
  })
})

describe("datos:reset — de dónde sale DATABASE_URL", () => {
  it("el entorno gana sobre el archivo .env", () => {
    expect(
      resolverDatabaseUrl(
        { DATABASE_URL: "file:./perf-test.db" },
        ['DATABASE_URL="file:./dev.db"']
      )
    ).toBe("file:./perf-test.db")
  })

  it("sin variable en el entorno, lee el .env y le saca las comillas", () => {
    expect(resolverDatabaseUrl({}, ["ALGO=1\nDATABASE_URL=\"file:./dev.db\"\n"])).toBe(
      "file:./dev.db"
    )
  })

  it("sin variable ni archivo devuelve vacío (y la guarda rechaza)", () => {
    expect(resolverDatabaseUrl({}, [])).toBe("")
  })
})
