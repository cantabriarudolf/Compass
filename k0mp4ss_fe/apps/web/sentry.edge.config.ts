/**
 * SERIE-PRODUCCION-FASE2 P5 — Sentry en el edge (proxy/middleware).
 * Sin DSN el SDK queda deshabilitado (no-op). Sin trazas en edge (costo).
 */
import * as Sentry from "@sentry/nextjs"
import { depurarObjeto } from "./lib/sentry"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
  tracesSampleRate: 0,
  beforeSend(evento) {
    return depurarObjeto(evento) as typeof evento
  },
})
