import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * D-i sink report-only CSP violations (dev telemetría).
 * No bloquea; solo loguea para revisar antes de forzar enforcement.
 * En prod con PUBLIC_DOMAIN se enviaría a collector externo.
 */
export async function POST(request: Request) {
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
    console.warn("[csp-report] violation:", JSON.stringify(safe))
  } catch {
    // intencional: vacío por diseño
  }
  return new NextResponse(null, { status: 204 })
}

export async function GET() {
  return NextResponse.json({ ok: true, note: "CSP report sink (Report-Only). POST violations here. See design.md plan enforcement." })
}
