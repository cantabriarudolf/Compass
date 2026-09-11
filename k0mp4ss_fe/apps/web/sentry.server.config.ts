/**
 * SERIE-PRODUCCION-FASE2 P5 — Sentry lado servidor (runtime Node).
 * Cargado por Next vía withSentryConfig (next.config.mjs, solo con SENTRY_DSN).
 */
import * as Sentry from "@sentry/nextjs"
import { depurarObjeto } from "./lib/sentry"

const entorno = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: entorno,
  tracesSampleRate: entorno === "production" ? 0.1 : 1.0,
  beforeSend(evento) {
    return depurarObjeto(evento) as typeof evento
  },
})
