import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { logger } from "@/lib/logger"
import { generarSecreto2FA } from "@/lib/two-factor"

export const dynamic = "force-dynamic"

/**
 * POST /api/auth/2fa/setup — SERIE-PRODUCCION-FASE2 P3.
 * Inicia el enrolamiento 2FA: genera secreto TOTP, lo guarda como pendiente
 * (twoFactorEnabled sigue false) y retorna el QR para Google Authenticator.
 * Requiere sesión. Si ya está activo → 409 (desactivar primero para rotar).
 */
export async function POST() {
  const sesion = await auth()
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: sesion.user.id } })
  if (!usuario || !usuario.activo) {
    return NextResponse.json({ error: "Usuario no encontrado o inactivo." }, { status: 401 })
  }
  if (usuario.twoFactorEnabled) {
    return NextResponse.json(
      { error: "2FA ya está activo. Desactívelo antes de generar un nuevo secreto." },
      { status: 409 }
    )
  }

  let secreto: Awaited<ReturnType<typeof generarSecreto2FA>>
  try {
    secreto = await generarSecreto2FA(usuario.email)
  } catch {
    return NextResponse.json({ error: "No fue posible iniciar el enrolamiento 2FA." }, { status: 500 })
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { twoFactorSecret: secreto.secretoBase32 },
  })

  logger.info({ event: "2FA_SETUP_INICIADO", usuarioId: usuario.id }, "Enrolamiento 2FA iniciado")
  return NextResponse.json({ otpauthUrl: secreto.otpauthUrl, qrDataUrl: secreto.qrDataUrl })
}
