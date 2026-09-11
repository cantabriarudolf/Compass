/**
 * SERIE-PRODUCCION P3 — Instrumentación de Next.js (apps/web/instrumentation.ts).
 *
 * Next.js carga este módulo una vez por proceso de servidor (stable desde
 * Next 15; no requiere flag en next.config.mjs en Next 16).
 *
 * - register(): inicializa el logger (pino) al arranque del runtime Node.
 * - onRequestError(): hook oficial para errores no capturados en requests;
 *   loguea method + path + error.message SIN PII (nunca headers ni query).
 * - logRequest(): helper para logging de método + path + status. El hook
 *   global "por request" no existe en instrumentation.ts; el punto natural
 *   es proxy.ts (middleware), que está fuera del alcance P3 — heredado a
 *   P4/P6 (ver 00-plan.md).
 */
import type { Instrumentation } from "next"

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("./lib/logger")
    logger.info({ service: "compass" }, "[instrumentation] runtime nodejs inicializado")
  }
}

type RequestInfo = { path?: string; method?: string }

/** Logging de ciclo de request: método + path + status, sin PII. */
export function logRequest(metodo: string, path: string, status: number): void {
  // Import perezoso para no acoplar el helper al arranque del módulo.
  import("./lib/logger").then(({ logger }) => {
    logger.info({ req: { method: metodo, path } }, `[http] ${metodo} ${path} ${status}`)
  })
}

export async function onRequestError(
  error: unknown,
  request: RequestInfo,
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { logger } = await import("./lib/logger")
  // P5: errores no capturados también van a Sentry (no-op sin SENTRY_DSN)
  const { capturarError } = await import("./lib/sentry")
  capturarError(error, { method: request?.method, path: request?.path })
  const mensaje = error instanceof Error ? error.message : String(error)
  logger.error(
    {
      err: { message: mensaje },
      req: { method: request?.method, path: request?.path },
    },
    "[instrumentation] error no capturado en request",
  )
}

// El tipo Instrumentation valida la forma de los hooks en tiempo de compilación.
export type { Instrumentation }
