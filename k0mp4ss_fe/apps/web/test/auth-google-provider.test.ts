/* eslint-disable @typescript-eslint/no-explicit-any -- la config de NextAuth se captura sin tipos exportados */
/**
 * @vitest-environment node
 *
 * Tests TDD de la bandera `GOOGLE_PROVIDER_DISABLED` (change
 * `au-google-provider-disabled`): con `GOOGLE_PROVIDER_DISABLED=1`
 * (a) el fail-fast de credenciales en producción NO corre y
 * (b) el provider Google NO se registra (queda solo Credentials).
 *
 * El efecto es de module-load, así que cada test usa `vi.resetModules()` +
 * import dinámico de `@/lib/auth`. La config pasada a `NextAuth()` se captura
 * mockeando su export default (mismo patrón que
 * `test/auth/google-sso-callbacks.test.ts`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { estado, prismaMock } = vi.hoisted(() => ({
  estado: { config: null as any },
  prismaMock: {
    usuario: { findUnique: vi.fn() },
    membresia: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock, default: prismaMock }))

// Se conservan los exports reales (p. ej. CredentialsSignin) y solo se
// reemplaza el default para capturar la config sin inicializar Auth.js.
vi.mock("next-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth")>()
  return {
    ...actual,
    default: (config: unknown) => {
      estado.config = config
      return {
        handlers: { GET: vi.fn(), POST: vi.fn() },
        signIn: vi.fn(),
        signOut: vi.fn(),
        auth: vi.fn(async () => null),
      }
    },
  }
})

function idsProviders(): string[] {
  const lista = (estado.config?.providers ?? []) as Array<{ id?: string }>
  return lista.map((p) => p.id ?? "?")
}

/** Definiciones de entorno para aislar cada test de un env ambiental heredado. */
function sinBandera(): void {
  vi.stubEnv("GOOGLE_PROVIDER_DISABLED", "")
}

describe("GOOGLE_PROVIDER_DISABLED — fail-fast y registro del provider", () => {
  beforeEach(() => {
    vi.resetModules()
    estado.config = null
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("producción sin credenciales CON la bandera: no lanza y no registra Google", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("GOOGLE_CLIENT_ID", "")
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "")
    vi.stubEnv("GOOGLE_PROVIDER_DISABLED", "1")

    await expect(import("@/lib/auth")).resolves.toBeDefined()

    expect(idsProviders()).toEqual(["credentials"])
  })

  it("producción sin credenciales SIN la bandera: lanza y el mensaje nombra la bandera", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("GOOGLE_CLIENT_ID", "")
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "")
    sinBandera()

    await expect(import("@/lib/auth")).rejects.toThrow(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production"
    )
    await expect(import("@/lib/auth")).rejects.toThrow("GOOGLE_PROVIDER_DISABLED=1")
  })

  it("producción con credenciales presentes y sin bandera: carga y registra Google", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("GOOGLE_CLIENT_ID", "abc.apps.googleusercontent.com")
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret123")
    sinBandera()

    await expect(import("@/lib/auth")).resolves.toBeDefined()

    expect(idsProviders()).toEqual(["credentials", "google"])
  })

  it("la bandera manda aunque las credenciales estén presentes: no registra Google", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("GOOGLE_CLIENT_ID", "abc.apps.googleusercontent.com")
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret123")
    vi.stubEnv("GOOGLE_PROVIDER_DISABLED", "1")

    await expect(import("@/lib/auth")).resolves.toBeDefined()

    expect(idsProviders()).toEqual(["credentials"])
  })

  it("desarrollo sin credenciales y sin bandera: no lanza y registra Google (comportamiento actual)", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("GOOGLE_CLIENT_ID", "")
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "")
    sinBandera()

    await expect(import("@/lib/auth")).resolves.toBeDefined()

    expect(idsProviders()).toEqual(["credentials", "google"])
  })

  it("bandera con valor distinto de 1 no aplica el opt-out", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("GOOGLE_CLIENT_ID", "")
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "")
    vi.stubEnv("GOOGLE_PROVIDER_DISABLED", "0")

    await expect(import("@/lib/auth")).rejects.toThrow(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production"
    )
  })
})
