/**
 * SERIE-PRODUCCION-FASE2 P5 — unit tests del puente Sentry (sin DSN = no-op).
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
  sentryActivo,
  redactarPII,
  depurarObjeto,
  capturarError,
  capturarMensaje,
} from "@/lib/sentry"

describe("P5 — lib/sentry (puente + redacción PII)", () => {
  beforeEach(() => {
    delete process.env.SENTRY_DSN
  })

  it("sin DSN está inactivo y capturar* son no-op que nunca lanzan", () => {
    expect(sentryActivo()).toBe(false)
    expect(() => capturarError(new Error("boom"), { email: "a@test.cl" })).not.toThrow()
    expect(() => capturarError("falla plana")).not.toThrow()
    expect(() => capturarMensaje("algo malo", "fatal")).not.toThrow()
  })

  it("con DSN se activa (el envío real lo hace el SDK)", () => {
    process.env.SENTRY_DSN = "https://x@sentry.io/1"
    expect(sentryActivo()).toBe(true)
    delete process.env.SENTRY_DSN
  })

  it("redactarPII censura emails y RUTs chilenos", () => {
    expect(redactarPII("falló login de juan.perez@test.cl")).toBe("falló login de [EMAIL]")
    expect(redactarPII("rut 12.345.678-9 inválido")).toBe("rut [RUT] inválido")
    expect(redactarPII("rut 12345678-k ok")).toBe("rut [RUT] ok")
    expect(redactarPII("rut 1-9 no es formato válido")).toBe("rut 1-9 no es formato válido")
    expect(redactarPII("sin datos sensibles")).toBe("sin datos sensibles")
  })

  it("depurarObjeto censura claves prohibidas y PII anidada", () => {
    const entrada = {
      email: "a@test.cl",
      usuario: { email: "b@test.cl", id: "u-1" },
      twoFactorSecret: "SECRETO",
      mensaje: "contactar a 12.345.678-9",
      lista: ["x@test.cl", "ok"],
      monto: 100,
    }
    const salida = depurarObjeto(entrada) as Record<string, unknown>
    expect(salida.email).toBe("[REDACTED]")
    expect((salida.usuario as Record<string, unknown>).email).toBe("[REDACTED]")
    expect((salida.usuario as Record<string, unknown>).id).toBe("u-1")
    expect(salida.twoFactorSecret).toBe("[REDACTED]")
    expect(salida.mensaje).toBe("contactar a [RUT]")
    expect(salida.lista).toEqual(["[EMAIL]", "ok"])
    expect(salida.monto).toBe(100)
  })
})
