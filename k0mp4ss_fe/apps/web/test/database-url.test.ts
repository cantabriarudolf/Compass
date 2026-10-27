/**
 * @vitest-environment node
 *
 * database-url — resolución de `DATABASE_URL` para los scripts de datos
 * (`seed:mocks`, `db:catalogo-nacional`, `db:punto-cero`, `db:fondos-fi`).
 *
 * Por qué existe (2026-10-27): las cuatro scripts leían `process.env.DATABASE_URL`,
 * que bajo `vite-node` trae el valor de `.env.local` (`file:./dev.db`) inyectado
 * por Vite; `dotenv.config()` no pisa lo ya presente, así que el cliente Prisma
 * generado para Postgres recibía una URL de SQLite y moría con
 * «the URL must start with the protocol postgresql://». Encima, la línea
 * `DATABASE_URL` de `.env` se había corrompido al pegar la URL de Neon sobre la
 * vieja de SQLite.
 *
 * Contrato que fija este archivo:
 *   1. se descartan las comillas que envuelven el valor (clase de corrupción de hoy),
 *   2. un valor con dos `DATABASE_URL=` adentro se rechaza con un mensaje que
 *      nombra el archivo y el protocolo esperado, y **nunca** el valor,
 *   3. la URL elegida tiene que servirle al cliente Prisma generado
 *      (postgres o sqlite); si nada sirve, se aborta en vez de adivinar,
 *   4. el entorno sólo cede ante `.env` cuando su valor es el que declara un
 *      archivo `.env*` (el default de desarrollo), no cuando lo exportó el
 *      arnés (CI, e2e, la suite): ahí se aborta para no escribir en otra base.
 */
import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  cargarUrlBase,
  ErrorUrlBase,
  normalizarValorEnv,
  proveedorDeUrl,
  proveedorDelClienteGenerado,
  resolverUrlBase,
  type ArchivoEnv,
} from "../lib/database-url"

const PG = "postgresql://usuario:secreto-123@host.neon.tech/neondb?sslmode=require"
const ARCHIVOS_PG: ArchivoEnv[] = [{ nombre: ".env", contenido: `DATABASE_URL="${PG}"` }]
const ARCHIVOS_SQLITE: ArchivoEnv[] = [
  { nombre: ".env.local", contenido: `DATABASE_URL="file:./dev.db"` },
]

describe("proveedorDeUrl", () => {
  it("reconoce las dos formas de Postgres y el archivo SQLite", () => {
    expect(proveedorDeUrl(PG)).toBe("postgresql")
    expect(proveedorDeUrl("postgres://u:p@h/db")).toBe("postgresql")
    expect(proveedorDeUrl("file:./dev.db")).toBe("sqlite")
  })

  it("no inventa proveedor para lo que no es una base", () => {
    expect(proveedorDeUrl("https://host/db")).toBeNull()
    expect(proveedorDeUrl("")).toBeNull()
  })
})

describe("normalizarValorEnv", () => {
  it("quita las comillas que envuelven el valor, dobles o simples", () => {
    expect(normalizarValorEnv(`"${PG}"`)).toBe(PG)
    expect(normalizarValorEnv(`'file:./dev.db'`)).toBe("file:./dev.db")
  })

  it("recorta espacios y deja intacto el valor sin comillas", () => {
    expect(normalizarValorEnv(`  ${PG}  `)).toBe(PG)
  })

  it("no inventa comillas donde no las hay (una comilla suelta no se toca)", () => {
    expect(normalizarValorEnv(`"${PG}`)).toBe(`"${PG}`)
  })
})

describe("resolverUrlBase — qué URL gana", () => {
  it("usa la del entorno cuando sirve para el cliente generado", () => {
    const r = resolverUrlBase({
      entorno: { DATABASE_URL: PG },
      archivos: ARCHIVOS_SQLITE,
      proveedorEsperado: "postgresql",
    })
    expect(r.origen).toBe("entorno")
    expect(r.url).toBe(PG)
    // El valor del entorno no se descarta; lo que sobra (el SQLite de .env.local) sí se informa.
    expect(r.descartados.some((d: string) => d.startsWith("entorno"))).toBe(false)
  })

  it("descarta el SQLite de desarrollo heredado y toma el .env real (el bug de hoy)", () => {
    const r = resolverUrlBase({
      entorno: { DATABASE_URL: "file:./dev.db" },
      archivos: [...ARCHIVOS_PG, ...ARCHIVOS_SQLITE],
      proveedorEsperado: "postgresql",
    })
    expect(r.origen).toBe("env-file")
    expect(r.url).toBe(PG)
    expect(r.descartados.join(" ")).toContain(".env.local")
  })

  it("con cliente SQLite el file: del entorno sirve y gana (desarrollo local intacto)", () => {
    const r = resolverUrlBase({
      entorno: { DATABASE_URL: "file:./dev.db" },
      archivos: ARCHIVOS_PG,
      proveedorEsperado: "sqlite",
    })
    expect(r.origen).toBe("entorno")
    expect(r.url).toBe("file:./dev.db")
  })

  it("sin entorno, usa el .env del proyecto", () => {
    const r = resolverUrlBase({
      entorno: {},
      archivos: ARCHIVOS_PG,
      proveedorEsperado: "postgresql",
    })
    expect(r.origen).toBe("env-file")
    expect(r.url).toBe(PG)
  })

  it("se niega a redirigir cuando el entorno trae una base que el arnés exportó", () => {
    // `file:.../perf-test.db` no está declarada en ningún .env*: la puso la suite/CI.
    expect(() =>
      resolverUrlBase({
        entorno: { DATABASE_URL: "file:/tmp/perf-test.db" },
        archivos: [...ARCHIVOS_PG, ...ARCHIVOS_SQLITE],
        proveedorEsperado: "postgresql",
      })
    ).toThrow(ErrorUrlBase)
  })

  it("aborta si no hay ninguna URL", () => {
    expect(() =>
      resolverUrlBase({ entorno: {}, archivos: [], proveedorEsperado: "postgresql" })
    ).toThrow(/DATABASE_URL/)
  })
})

describe("resolverUrlBase — higiene del error", () => {
  it("rechaza la concatenación corrupta nombrando el archivo y el protocolo", () => {
    const corrupta = `DATABASE_URL="${PG}DATABASE_URL="file:./dev.db"channel_binding=require"`
    let atrapado: Error | null = null
    try {
      resolverUrlBase({
        entorno: {},
        archivos: [{ nombre: ".env", contenido: corrupta }],
        proveedorEsperado: "postgresql",
      })
    } catch (e) {
      atrapado = e as Error
    }
    expect(atrapado).toBeInstanceOf(ErrorUrlBase)
    expect(atrapado?.message).toContain(".env")
    expect(atrapado?.message).toContain("postgresql://")
    expect(atrapado?.message).toContain("DATABASE_URL=")
    // Nunca el valor: el mensaje se ve en logs y en la consola de CI.
    expect(atrapado?.message).not.toContain("secreto-123")
  })

  it("rechaza una URL de Postgres que no es válida para el cliente SQLite", () => {
    let atrapado: Error | null = null
    try {
      resolverUrlBase({
        entorno: { DATABASE_URL: PG },
        archivos: [],
        proveedorEsperado: "sqlite",
      })
    } catch (e) {
      atrapado = e as Error
    }
    expect(atrapado).toBeInstanceOf(ErrorUrlBase)
    expect(atrapado?.message).not.toContain("secreto-123")
  })
})

describe("cargarUrlBase — el cargador que usan los scripts", () => {
  it("deja la URL resuelta en process.env para que Prisma la vea igual", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "db-url-"))
    writeFileSync(path.join(dir, ".env"), `DATABASE_URL="${PG}"\n`)
    const original = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      const url = cargarUrlBase({ dirApp: dir, proveedorEsperado: "postgresql" })
      expect(url).toBe(PG)
      expect(process.env.DATABASE_URL).toBe(PG)
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = original
    }
  })
})

describe("proveedorDelClienteGenerado", () => {
  it("lee el provider del bloque datasource", () => {
    const schema = `datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}`
    expect(proveedorDelClienteGenerado(schema)).toBe("postgresql")
  })

  it("devuelve null si no hay bloque datasource o el provider no es de base", () => {
    expect(proveedorDelClienteGenerado("model A { id String @id }")).toBeNull()
    expect(proveedorDelClienteGenerado(`datasource db {\n  provider = "mysql"\n}`)).toBeNull()
  })
})
