import { NextResponse, NextRequest } from "next/server"
import { z } from "zod"
import { prismaCifrado as prisma } from "@/lib/prisma-cifrado"
import { logger } from "@/lib/logger"
import { excedeIntentos, registrarFallo, limpiarIntentos } from "@/lib/rate-limit"
import { verificarDesafio2FA } from "@/lib/two-factor-token"
import { verificarCodigo2FA } from "@/lib/two-factor"
import { acunarCookieSesion } from "@/lib/two-factor-session"

export const dynamic = "force-dynamic"

const BodySchema = z.object({
  tempToken: z.string({ required_error: "Token temporal requerido." }).min(1, "Token temporal requerido."),
  codigo: z.string({ required_error: "El código es obligatorio." }).trim().min(1, "El código es obligatorio."),
})

function claveIp(request: NextRequest): string {
  const bruto = request.headers.get("x-forwarded-for") ?? "local"
  return bruto.split(",")[0]!.trim() || "local"
}

/**
 * POST /api/auth/2fa/verify — SERIE-PRODUCCION-FASE2 P3.
 * Segunda fase del login con 2FA: valida el desafío (JWE 5 min) + TOTP.
 * Si ambos son válidos acuña la cookie de sesión Auth.js (24h, P2) y la
 * retorna como Set-Cookie — equivale a un login normal completado.
 */
export async function POST(request: NextRequest) {
  const claveGlobal = `2fa-verify-ip:${claveIp(request)}`
  if (await excedeIntentos(claveGlobal)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espere unos minutos." },
      { status: 429 }
    )
  }

  const body: unknown = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Código inválido." }, { status: 401 })
  }

  const usuarioId = await verificarDesafio2FA(parsed.data.tempToken)
  if (!usuarioId) {
    await registrarFallo(claveGlobal)
    return NextResponse.json({ error: "Desafío expirado o inválido. Inicie sesión de nuevo." }, { status: 401 })
  }

  const clave = `2fa-verify:${usuarioId}`
  if (await excedeIntentos(clave)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espere unos minutos." },
      { status: 429 }
    )
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } })
  if (!usuario || !usuario.activo || !usuario.twoFactorEnabled || !usuario.twoFactorSecret) {
    await registrarFallo(clave)
    return NextResponse.json({ error: "Código inválido." }, { status: 401 })
  }

  if (!verificarCodigo2FA(usuario.twoFactorSecret, parsed.data.codigo)) {
    await registrarFallo(clave)
    logger.warn({ event: "2FA_VERIFY_FALLIDO", usuarioId: usuario.id }, "Código TOTP inválido en login")
    return NextResponse.json({ error: "Código inválido." }, { status: 401 })
  }

  await limpiarIntentos(clave)
  await limpiarIntentos(claveGlobal)
  const cookie = await acunarCookieSesion(usuario.id, usuario.email, request.url)
  logger.info({ event: "2FA_LOGIN_OK", usuarioId: usuario.id }, "Login con 2FA completado")

  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  })
}
