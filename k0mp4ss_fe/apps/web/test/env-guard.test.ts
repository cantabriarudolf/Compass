import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  getAppEnv,
  isDevelopment,
  isProduction,
  isWriteApiEnabled,
  requireEnv,
} from "@/lib/env-guard"

describe("getAppEnv", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("NEXT_PUBLIC_APP_ENV tiene precedencia (production/prod/development/dev)", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production")
    expect(getAppEnv()).toBe("production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "prod")
    expect(getAppEnv()).toBe("production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development")
    expect(getAppEnv()).toBe("development")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "dev")
    expect(getAppEnv()).toBe("development")
  })

  it("cae a APP_ENV si NEXT_PUBLIC_APP_ENV no está seteada", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "")
    vi.stubEnv("APP_ENV", "production")
    expect(getAppEnv()).toBe("production")
  })

  it("cae a NODE_ENV si no hay APP_ENV ni NEXT_PUBLIC_APP_ENV", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "")
    vi.stubEnv("APP_ENV", "")
    vi.stubEnv("NODE_ENV", "production")
    expect(getAppEnv()).toBe("production")
    vi.stubEnv("NODE_ENV", "development")
    expect(getAppEnv()).toBe("development")
  })
})

describe("isWriteApiEnabled (endurecido SERIE-PRODUCCION P2)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("caso del bug corregido: NODE_ENV=production + NEXT_PUBLIC_APP_ENV=development → false", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development")
    expect(isWriteApiEnabled()).toBe(false)
  })

  it("NODE_ENV=production sin NEXT_PUBLIC_APP_ENV → false", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "")
    expect(isWriteApiEnabled()).toBe(false)
  })

  it("NODE_ENV=development + NEXT_PUBLIC_APP_ENV=production → false (forzado a producción)", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production")
    expect(isWriteApiEnabled()).toBe(false)
  })

  it("NODE_ENV=development sin forzar a producción → true (servidor dev real)", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "")
    expect(isWriteApiEnabled()).toBe(true)
  })

  it("runtime test (vitest) cuenta como desarrollo: NODE_ENV=test + NEXT_PUBLIC_APP_ENV=development → true", () => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development")
    expect(isWriteApiEnabled()).toBe(true)
  })
})

describe("isWriteApiEnabled (opt-in E2E_ALLOW_WRITE_APIS, doble candado)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("opt-in + NODE_ENV=production + NEXT_PUBLIC_APP_ENV=development → true (lane e2e)", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development")
    vi.stubEnv("E2E_ALLOW_WRITE_APIS", "1")
    expect(isWriteApiEnabled()).toBe(true)
  })

  it("NODE_ENV=production + NEXT_PUBLIC_APP_ENV=development sin opt-in → false (como hoy)", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development")
    vi.stubEnv("E2E_ALLOW_WRITE_APIS", "")
    expect(isWriteApiEnabled()).toBe(false)
  })

  it("opt-in con valor distinto de '1' no habilita", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development")
    vi.stubEnv("E2E_ALLOW_WRITE_APIS", "true")
    expect(isWriteApiEnabled()).toBe(false)
  })

  it("opt-in + NODE_ENV=production + NEXT_PUBLIC_APP_ENV=production → false (producción intacta)", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production")
    vi.stubEnv("E2E_ALLOW_WRITE_APIS", "1")
    expect(isWriteApiEnabled()).toBe(false)
  })

  it("opt-in + APP_ENV=production (sin NEXT_PUBLIC_APP_ENV) → false", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "")
    vi.stubEnv("APP_ENV", "production")
    vi.stubEnv("E2E_ALLOW_WRITE_APIS", "1")
    expect(isWriteApiEnabled()).toBe(false)
  })

  it("NODE_ENV=development → true sin opt-in (sin cambios)", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "")
    vi.stubEnv("E2E_ALLOW_WRITE_APIS", "")
    expect(isWriteApiEnabled()).toBe(true)
  })
})

describe("isProduction / isDevelopment", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("reflejan el entorno efectivo de la app", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production")
    expect(isProduction()).toBe(true)
    expect(isDevelopment()).toBe(false)

    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "development")
    expect(isProduction()).toBe(false)
    expect(isDevelopment()).toBe(true)
  })
})

describe("requireEnv", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("en producción lanza si la variable falta o está vacía", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production")
    expect(() => requireEnv("REQ_ENV_INEXISTENTE")).toThrow(/REQ_ENV_INEXISTENTE/)
    vi.stubEnv("REQ_ENV_INEXISTENTE", "")
    expect(() => requireEnv("REQ_ENV_INEXISTENTE")).toThrow(/REQ_ENV_INEXISTENTE/)
  })

  it("en producción devuelve el valor presente", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production")
    vi.stubEnv("REQ_ENV_INEXISTENTE", "valor-secreto")
    expect(requireEnv("REQ_ENV_INEXISTENTE")).toBe("valor-secreto")
  })

  it("en desarrollo devuelve '' sin lanzar si falta", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "")
    expect(requireEnv("REQ_ENV_INEXISTENTE")).toBe("")
  })
})
