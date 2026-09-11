/**
 * SERIE-PRODUCCION-FASE2 P5 — puente hacia Sentry (observabilidad de errores).
 *
 * Diseño:
 * - Sin `SENTRY_DSN` el SDK nunca se inicializa y todo es no-op (la app
 *   funciona idéntica; el owner activa Sentry solo configurando el DSN).
 * - Carga perezosa del SDK (`import()` dinámico) para no acoplar el bundle
 *   edge ni los tests al paquete @sentry/nextjs.
 * - Redacción PII antes de enviar: emails, RUT chilenos y campos de usuario
 *   se censuran en `beforeSend` y en `redactarPII` (mensajes del logger).
 */

/** true si hay DSN configurado (Sentry activo). */
export function sentryActivo(): boolean {
  return typeof process.env.SENTRY_DSN === "string" && process.env.SENTRY_DSN.length > 0
}

// Email genérico + RUT chileno (12.345.678-9, 12345678-9, con k/K).
const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const RE_RUT = /\b\d{1,2}(?:\.?\d{3}){2}-[\dkK]\b/g

/** Censura emails y RUTs en un texto (nunca viajan a Sentry). */
export function redactarPII(texto: string): string {
  return texto.replace(RE_EMAIL, "[EMAIL]").replace(RE_RUT, "[RUT]")
}

interface ObjetoPlano {
  [clave: string]: unknown
}

/** Claves que nunca se envían (identificadores directos). */
const CLAVES_PROHIBIDAS = new Set([
  "email",
  "rut",
  "nombreCompleto",
  "nombres",
  "apellidos",
  "password",
  "passwordHash",
  "twoFactorSecret",
  "cookie",
  "authorization",
  "token",
  "csrfToken",
])

/** Recorre un objeto y censura claves prohibidas + PII en strings. */
export function depurarObjeto(valor: unknown): unknown {
  if (typeof valor === "string") return redactarPII(valor)
  if (Array.isArray(valor)) return valor.map(depurarObjeto)
  if (valor !== null && typeof valor === "object") {
    const salida: ObjetoPlano = {}
    for (const [clave, sub] of Object.entries(valor as ObjetoPlano)) {
      salida[clave] = CLAVES_PROHIBIDAS.has(clave) ? "[REDACTED]" : depurarObjeto(sub)
    }
    return salida
  }
  return valor
}

/**
 * Envía un error a Sentry (no-op sin DSN; nunca lanza).
 * `contexto` extra se depura de PII antes de adjuntarlo.
 */
export function capturarError(error: unknown, contexto?: Record<string, unknown>): void {
  if (!sentryActivo()) return
  const contextoLimpio =
    contexto !== undefined ? (depurarObjeto(contexto) as Record<string, unknown>) : undefined
  import("@sentry/nextjs")
    .then(({ captureException }) => {
      const err = error instanceof Error ? error : new Error(redactarPII(String(error)))
      captureException(err, contextoLimpio !== undefined ? { extra: contextoLimpio } : undefined)
    })
    .catch(() => {
      // intencional: observabilidad nunca rompe el flujo principal
    })
}

/**
 * Envía un mensaje a Sentry (nivel error/fatal del logger; no-op sin DSN).
 */
export function capturarMensaje(mensaje: string, nivel: "error" | "fatal" = "error"): void {
  if (!sentryActivo()) return
  import("@sentry/nextjs")
    .then(({ captureMessage }) => {
      captureMessage(redactarPII(mensaje), nivel)
    })
    .catch(() => {
      // intencional: vacío por diseño
    })
}
