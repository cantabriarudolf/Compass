/* eslint-disable @typescript-eslint/no-explicit-any -- la config de NextAuth se captura sin tipos exportados */
/**
 * @vitest-environment node
 *
 * Tests de integración (con mocks, sin OAuth real ni credenciales) de los
 * callbacks `signIn` / `jwt` de Google SSO definidos en `lib/auth.ts`.
 *
 * `lib/auth.ts` no exporta los callbacks, así que se intercepta la llamada a
 * `NextAuth(config)` mockeando el export default de "next-auth" y capturando
 * la config para invocar los callbacks directamente.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"

const { estado, prismaMock, rateLimitMock } = vi.hoisted(() => ({
  estado: { config: null as any },
  prismaMock: {
    usuario: { findUnique: vi.fn() },
    membresia: { findMany: vi.fn() },
  },
  rateLimitMock: {
    excedeIntentos: vi.fn(),
    registrarFallo: vi.fn(),
    limpiarIntentos: vi.fn(),
  },
}))

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock, default: prismaMock }))

vi.mock("@/lib/rate-limit", () => rateLimitMock)

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

type Callbacks = {
  signIn: (params: any) => Promise<boolean>
  jwt: (params: any) => Promise<any>
}

let callbacks: Callbacks

const CUENTA_GOOGLE = { provider: "google", type: "oidc" }

beforeAll(async () => {
  await import("@/lib/auth")
  callbacks = estado.config.callbacks as Callbacks
})

beforeEach(() => {
  vi.clearAllMocks()
  rateLimitMock.excedeIntentos.mockResolvedValue(false)
  rateLimitMock.registrarFallo.mockResolvedValue(undefined)
  rateLimitMock.limpiarIntentos.mockResolvedValue(undefined)
  prismaMock.usuario.findUnique.mockResolvedValue(null)
  prismaMock.membresia.findMany.mockResolvedValue([])
})

describe("signIn callback — Google SSO (filtro de autorización)", () => {
  it("captura la config de NextAuth y expone signIn/jwt", () => {
    expect(typeof callbacks.signIn).toBe("function")
    expect(typeof callbacks.jwt).toBe("function")
  })

  it("rechaza y registra fallo cuando el usuario no existe", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null)

    const permitido = await callbacks.signIn({
      user: { email: "nadie@comunidad.cl" },
      account: CUENTA_GOOGLE,
    })

    expect(permitido).toBe(false)
    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({
      where: { email: "nadie@comunidad.cl" },
    })
    expect(rateLimitMock.registrarFallo).toHaveBeenCalledWith("google:nadie@comunidad.cl")
    expect(rateLimitMock.limpiarIntentos).not.toHaveBeenCalled()
  })

  it("rechaza y registra fallo cuando el usuario existe pero no está activo", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: "u-inactivo",
      email: "inactivo@comunidad.cl",
      activo: false,
    })

    const permitido = await callbacks.signIn({
      user: { email: "inactivo@comunidad.cl" },
      account: CUENTA_GOOGLE,
    })

    expect(permitido).toBe(false)
    expect(rateLimitMock.registrarFallo).toHaveBeenCalledWith("google:inactivo@comunidad.cl")
    expect(rateLimitMock.limpiarIntentos).not.toHaveBeenCalled()
  })

  it("normaliza el email a minúsculas en la clave y en la consulta a BD", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null)

    await callbacks.signIn({
      user: { email: "Mayus@Comunidad.CL" },
      account: CUENTA_GOOGLE,
    })

    expect(rateLimitMock.excedeIntentos).toHaveBeenCalledWith("google:mayus@comunidad.cl")
    expect(rateLimitMock.registrarFallo).toHaveBeenCalledWith("google:mayus@comunidad.cl")
    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({
      where: { email: "mayus@comunidad.cl" },
    })
  })

  it("rechaza sin consultar BD cuando la clave google:<email> excede el rate limit", async () => {
    rateLimitMock.excedeIntentos.mockResolvedValue(true)

    const permitido = await callbacks.signIn({
      user: { email: "tope@comunidad.cl" },
      account: CUENTA_GOOGLE,
    })

    expect(permitido).toBe(false)
    expect(rateLimitMock.excedeIntentos).toHaveBeenCalledWith("google:tope@comunidad.cl")
    expect(prismaMock.usuario.findUnique).not.toHaveBeenCalled()
    expect(rateLimitMock.registrarFallo).not.toHaveBeenCalled()
    expect(rateLimitMock.limpiarIntentos).not.toHaveBeenCalled()
  })

  it("permite usuario activo y limpia los intentos previos de la clave", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: "u-activo",
      email: "activo@comunidad.cl",
      activo: true,
    })

    const permitido = await callbacks.signIn({
      user: { email: "activo@comunidad.cl" },
      account: CUENTA_GOOGLE,
    })

    expect(permitido).toBe(true)
    expect(rateLimitMock.excedeIntentos).toHaveBeenCalledWith("google:activo@comunidad.cl")
    expect(rateLimitMock.limpiarIntentos).toHaveBeenCalledWith("google:activo@comunidad.cl")
    expect(rateLimitMock.registrarFallo).not.toHaveBeenCalled()
  })

  it("rechaza sin tocar rate limit cuando el email viene vacío", async () => {
    const permitido = await callbacks.signIn({ user: {}, account: CUENTA_GOOGLE })

    expect(permitido).toBe(false)
    expect(rateLimitMock.excedeIntentos).not.toHaveBeenCalled()
    expect(rateLimitMock.registrarFallo).not.toHaveBeenCalled()
    expect(prismaMock.usuario.findUnique).not.toHaveBeenCalled()
  })

  it("no aplica el filtro Google a otros providers", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null)

    const permitido = await callbacks.signIn({
      user: { email: "x@comunidad.cl" },
      account: { provider: "credentials" },
    })

    expect(permitido).toBe(true)
    expect(rateLimitMock.excedeIntentos).not.toHaveBeenCalled()
    expect(rateLimitMock.registrarFallo).not.toHaveBeenCalled()
    expect(prismaMock.usuario.findUnique).not.toHaveBeenCalled()
  })
})

describe("jwt callback — mapeo de identidad Google", () => {
  it("mapea token.sub al Usuario.id de BD y copia tokenVersion en el primer login", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ id: "usuario-bd-1", tokenVersion: 7 })
    const token: any = { sub: "google-sub-abc", roles: [] }

    const salida = await callbacks.jwt({
      token,
      account: CUENTA_GOOGLE,
      user: { email: "sso@comunidad.cl" },
      trigger: "signIn",
    })

    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({
      where: { email: "sso@comunidad.cl" },
      select: { id: true, tokenVersion: true },
    })
    expect(salida.sub).toBe("usuario-bd-1")
    expect(salida.tokenVersion).toBe(7)
  })

  it("normaliza el email a minúsculas al buscar el usuario de BD", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ id: "usuario-bd-2", tokenVersion: 1 })
    const token: any = { sub: "google-sub-xyz", roles: [] }

    await callbacks.jwt({
      token,
      account: CUENTA_GOOGLE,
      user: { email: "Sso@Comunidad.CL" },
      trigger: "signIn",
    })

    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({
      where: { email: "sso@comunidad.cl" },
      select: { id: true, tokenVersion: true },
    })
  })

  it("deja el token intacto cuando el provider no es google", async () => {
    const token: any = { sub: "sub-1", roles: [] }

    const salida = await callbacks.jwt({
      token,
      account: { provider: "credentials" },
      user: { email: "x@comunidad.cl" },
      trigger: "signIn",
    })

    expect(prismaMock.usuario.findUnique).not.toHaveBeenCalled()
    expect(salida.sub).toBe("sub-1")
  })
})
