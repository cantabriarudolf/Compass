import { NextResponse, NextRequest } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

const BodySchema = z.object({
  password: z.string({ required_error: "La contraseña es obligatoria." }).min(1, "La contraseña es obligatoria."),
})

/**
 * POST /api/auth/2fa/disable — SERIE-PRODUCCION-FASE2 P3.
 * Desactiva 2FA previa confirmación con la contraseña actual. Elimina secreto
 * y backup codes, e invalida todas las sesiones (tokenVersion++, mecanismo P2)
 * porque es un cambio de seguridad sensible — el cliente debe re-loguear.
 */
export async function POST(request: NextRequest) {
  const sesion = await auth()
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }

  const body: unknown = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "La contraseña es obligatoria." }, { status: 400 })
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: sesion.user.id } })
  if (!usuario || !usuario.activo || !usuario.passwordHash) {
    return NextResponse.json({ error: "Usuario no encontrado o inactivo." }, { status: 401 })
  }
  if (!usuario.twoFactorEnabled) {
    return NextResponse.json({ error: "2FA no está activo." }, { status: 409 })
  }

  const passwordOk = await bcrypt.compare(parsed.data.password, usuario.passwordHash)
  if (!passwordOk) {
    logger.warn({ event: "2FA_DISABLE_FALLIDO", usuarioId: usuario.id }, "Contraseña incorrecta al desactivar 2FA")
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 })
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: {
      twoFactorSecret: null,
      twoFactorEnabled: false,
      twoFactorBackupCodes: null,
      tokenVersion: { increment: 1 },
    },
  })

  logger.info({ event: "2FA_DESACTIVADO", usuarioId: usuario.id }, "2FA desactivado, sesiones invalidadas")
  return NextResponse.json({ ok: true, sesionesInvalidadas: true })
}
