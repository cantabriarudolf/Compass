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
