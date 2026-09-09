import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * SERIE-PRODUCCION P3 — GET /api/health — health check público (read-only).
 *
 * - No requiere autenticación: monitores/uptime checks (Vercel, UptimeRobot…)
 *   deben poder sondearlo sin sesión. No expone datos de dominio.
 * - checks.database: query liviana `SELECT 1` contra Prisma/SQLite.
 * - checks.auth: verifica que AUTH_SECRET esté configurado (no su valor).
 * - Degradado (algún check en error): status "degraded" + HTTP 503.
 * - Rate limit en memoria: 60 req/min por IP para evitar DoS accidental.
 *   En un deploy multi-instancia sería por instancia; el límite es de
 *   autoprotección, no de cuota (nota en 00-plan.md).
 */

const VERSION = "1.0.0"
const MAX_POR_VENTANA = 60
const VENTANA_MS = 60_000

type Checks = { database: "ok" | "error"; auth: "ok" | "error" }

/** Contador en memoria por IP (clave IP → { n, reset }). */
const contador = new Map<string, { n: number; reset: number }>()

function excedeLimite(ip: string, ahora: number): boolean {
  const registro = contador.get(ip)
  if (!registro || ahora >= registro.reset) {
    // Poda oportunista para que el Map no crezca sin límite.
    if (contador.size > 1000) contador.clear()
    contador.set(ip, { n: 1, reset: ahora + VENTANA_MS })
    return false
  }
  registro.n += 1
  return registro.n > MAX_POR_VENTANA
}

export async function GET(request: Request): Promise<NextResponse> {
  const ahora = Date.now()
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "desconocida"
  if (excedeLimite(ip, ahora)) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 })
  }

  const checks: Checks = { database: "ok", auth: "ok" }

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    checks.database = "error"
  }

  if (!process.env.AUTH_SECRET) {
    checks.auth = "error"
  }

  const degradado = checks.database !== "ok" || checks.auth !== "ok"
  const status = degradado ? "degraded" : "ok"

  if (degradado) {
    // Sin PII: solo el nombre de los checks en error.
    logger.warn({ checks }, "[health] check degradado")
  }

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      version: VERSION,
      checks,
    },
    { status: degradado ? 503 : 200 },
  )
}
