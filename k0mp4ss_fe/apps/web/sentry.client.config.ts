/**
 * SERIE-PRODUCCION-FASE2 P5 — Sentry lado cliente (browser).
 * Cargado por Next vía withSentryConfig (next.config.mjs, solo con SENTRY_DSN).
 * Sin DSN el SDK queda deshabilitado (no-op).
 */
import * as Sentry from "@sentry/nextjs"
import { depurarObjeto } from "./lib/sentry"

const entorno = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "development"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
  environment: entorno,
  // Trazas: 100% en dev, 10% en prod (costo/volumen).
  tracesSampleRate: entorno === "production" ? 0.1 : 1.0,
  // PII: censura emails/RUTs/claves identificatorias antes de enviar.
  beforeSend(evento) {
    return depurarObjeto(evento) as typeof evento
  },
})
