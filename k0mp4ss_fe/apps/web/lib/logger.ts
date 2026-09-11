/**
 * SERIE-PRODUCCION P3 — Logging estructurado (pino).
 *
 * - Desarrollo: pretty print vía pino-pretty (transport worker).
 * - Producción: JSON estructurado (ingestión en log aggregator; Vercel/monitoreo).
 * - Niveles: trace, debug, info, warn, error, fatal.
 * - Campos base: time (epoch ms), level, msg + base { service: "compass" }.
 * - Redacción PII: `email` (en cualquier objeto) se censura a "[REDACTED]".
 *   Regla del proyecto: en logs NUNCA se loguea email, RUT ni nombres completos;
 *   identificamos por ids internos (p. ej. usuario.id).
 */
import pino from "pino"
import { getAppEnv, type AppEnv } from "./env-guard"
import { capturarMensaje, depurarObjeto } from "./sentry"

export const SERVICE = "compass"

/** Nivel válido de pino para silenciar todo (útil en tests). */
export const NIVEL_SILENCIO = "silent"

const NIVELES_VALIDOS = new Set(["trace", "debug", "info", "warn", "error", "fatal", "silent"])

export type CrearLoggerOpciones = {
  /** Nivel pino (trace..fatal). Default: LOG_LEVEL env, o debug en dev / info en prod. */
  nivel?: string
  /** Pretty print (pino-pretty). Default: true solo en desarrollo (NODE_ENV=development). */
  pretty?: boolean
  /** Destino inyectable (tests). Si se omite, stdout. */
  destino?: pino.DestinationStream
  /** Entorno efectivo inyectable (tests). Default: getAppEnv(). */
  entorno?: AppEnv
}

function nivelPorDefecto(entorno: AppEnv): string {
  const deEnv = process.env.LOG_LEVEL
  if (deEnv && NIVELES_VALIDOS.has(deEnv)) return deEnv
  return entorno === "development" ? "debug" : "info"
}

export function crearLogger(opciones: CrearLoggerOpciones = {}): pino.Logger {
  const entorno = opciones.entorno ?? getAppEnv()
  const nivel = opciones.nivel ?? nivelPorDefecto(entorno)
  const pretty = opciones.pretty ?? entorno === "development"

  const opcionesPino: pino.LoggerOptions = {
    level: nivel,
    base: { service: SERVICE },
    // Redacción declarativa de PII: cualquier campo email/usuario.email en el
    // objeto de contexto se censura. Los msg nunca deben contener PII (regla).
    redact: {
      paths: ["email", "*.email", "*.*.email", "req.headers.cookie", "req.headers.authorization"],
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.epochTime,
  }

  if (pretty && !opciones.destino) {
    opcionesPino.transport = {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "service" },
    }
  }

  return pino(opcionesPino, opciones.destino)
}

/** Logger de la aplicación (singleton por proceso). */
export const logger = crearLogger()

/**
 * P5: error/fatal también van a Sentry (no-op sin SENTRY_DSN).
 * Solo el singleton lleva el hook; loggers de test (crearLogger) no.
 */
function mensajeParaSentry(args: unknown[]): string {
  const [primero, segundo] = args
  if (typeof segundo === "string") return segundo
  if (typeof primero === "string") return primero
  if (primero !== null && typeof primero === "object") {
    const err = (primero as { err?: { message?: unknown } }).err
    if (err !== undefined && typeof err.message === "string") return err.message
    try {
      return JSON.stringify(depurarObjeto(primero))
    } catch {
      return "[no serializable]"
    }
  }
  return String(primero)
}

for (const nivel of ["error", "fatal"] as const) {
  const original = logger[nivel].bind(logger) as (...args: never[]) => unknown
  logger[nivel] = ((...args: never[]) => {
    try {
      capturarMensaje(mensajeParaSentry(args), nivel)
    } catch {
      // intencional: observabilidad nunca rompe el log
    }
    return original(...args)
  }) as typeof logger.error
}
