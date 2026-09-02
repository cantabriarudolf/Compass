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
    console.warn("[csp-report] violation:", typeof parsed === "string" ? parsed.slice(0, 1000) : JSON.stringify(parsed).slice(0, 2000))
  } catch {
    // intencional: vacío por diseño
  }
  return new NextResponse(null, { status: 204 })
}

export async function GET() {
  return NextResponse.json({ ok: true, note: "CSP report sink (Report-Only). POST violations here. See design.md plan enforcement." })
}
