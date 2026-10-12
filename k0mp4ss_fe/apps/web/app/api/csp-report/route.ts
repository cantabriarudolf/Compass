import { NextResponse } from "next/server"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

/**
 * D-i sink report-only CSP violations (dev telemetría).
 * No bloquea; solo loguea para revisar antes de forzar enforcement.
 * En prod con PUBLIC_DOMAIN se enviaría a collector externo.
 *
 * Ruta pública (ver proxy.ts): el navegador no envía cookies de sesión en
 * report-uri, así que exigir auth dejaba la telemetría del gate de enforcement
 * en cero. Al ser anónima expone un vector de log flooding, mitigado con rate
 * limit en memoria: 60 POST/min por IP (mismo patrón que app/api/health/route.ts).
 * GET no se limita a propósito: es una lectura estática (sin escritura de logs
 * ni body del cliente) que usa el check e2e.
 */

const MAX_POR_VENTANA = 60
const VENTANA_MS = 60_000

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

export async function POST(request: Request) {
  const ahora = Date.now()
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "desconocida"
  if (excedeLimite(ip, ahora)) {
    // No se loguea el payload rechazado (evita log injection desde el sink anónimo).
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429 })
  }

  try {
    const body = await request.text()
    let parsed: unknown = body
    try {
      parsed = JSON.parse(body)
    } catch {
      // intencional: vacío por diseño
    }
    // P3 security audit: sanitizar — solo loguear campos estándar CSP, nunca el body completo
    // (evita log injection si un atacante envía POST crafted con PII/exfiltración).
    const report = (typeof parsed === "object" && parsed !== null)
      ? (parsed as Record<string, unknown>)["csp-report"] as Record<string, unknown> | undefined
      : undefined;
    const safe = report
      ? {
          "document-uri": report["document-uri"],
          "violated-directive": report["violated-directive"],
          "blocked-uri": report["blocked-uri"],
          "effective-directive": report["effective-directive"],
        }
      : { raw: (typeof parsed === "string" ? parsed : JSON.stringify(parsed)).slice(0, 200) };
    // P3: logging estructurado sin PII (safe ya solo trae campos estándar CSP).
    logger.warn({ csp: safe }, "[csp-report] violation")
  } catch {
    // intencional: vacío por diseño
  }
  return new NextResponse(null, { status: 204 })
}

export async function GET() {
  return NextResponse.json({ ok: true, note: "CSP report sink (P5: enforcement activo; report-uri sigue recibiendo telemetría)." })
}
