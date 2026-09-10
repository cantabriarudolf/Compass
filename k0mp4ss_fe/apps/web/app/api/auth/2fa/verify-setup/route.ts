import { NextResponse, NextRequest } from "next/server"
import { z } from "zod"
import { prismaCifrado as prisma } from "@/lib/prisma-cifrado"
import { auth } from "@/lib/auth"
import { logger } from "@/lib/logger"
import { excedeIntentos, registrarFallo, limpiarIntentos } from "@/lib/rate-limit"
import {
  verificarCodigo2FA,
  generarBackupCodes,
  hashearBackupCodes,
} from "@/lib/two-factor"

export const dynamic = "force-dynamic"

const BodySchema = z.object({
  codigo: z.string({ required_error: "El código es obligatorio." }).trim().min(1, "El código es obligatorio."),
})

/**
 * POST /api/auth/2fa/verify-setup — SERIE-PRODUCCION-FASE2 P3.
 * Confirma el enrolamiento: verifica el TOTP de 6 dígitos contra el secreto
 * pendiente; si es válido activa 2FA y retorna los backup codes (una sola vez).
 * Intentos limitados (10/15min por usuario) contra fuerza bruta del TOTP.
 */
export async function POST(request: NextRequest) {
  const sesion = await auth()
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }

  const clave = `2fa-setup:${sesion.user.id}`
  if (await excedeIntentos(clave)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espere unos minutos." },
      { status: 429 }
    )
  }

  const body: unknown = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "El código es obligatorio." }, { status: 400 })
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: sesion.user.id } })
  if (!usuario || !usuario.activo) {
    return NextResponse.json({ error: "Usuario no encontrado o inactivo." }, { status: 401 })
  }
  if (usuario.twoFactorEnabled) {
    return NextResponse.json({ error: "2FA ya está activo." }, { status: 409 })
  }
  if (!usuario.twoFactorSecret) {
    return NextResponse.json(
      { error: "Sin enrolamiento pendiente. Genere un secreto primero." },
      { status: 400 }
    )
  }

  if (!verificarCodigo2FA(usuario.twoFactorSecret, parsed.data.codigo)) {
    await registrarFallo(clave)
    logger.warn({ event: "2FA_SETUP_FALLIDO", usuarioId: usuario.id }, "Código TOTP inválido en enrolamiento")
    return NextResponse.json({ error: "Código inválido." }, { status: 401 })
  }

  const backupPlano = generarBackupCodes()
  const backupHash = await hashearBackupCodes(backupPlano)
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { twoFactorEnabled: true, twoFactorBackupCodes: backupHash },
  })
  await limpiarIntentos(clave)

  logger.info({ event: "2FA_ACTIVADO", usuarioId: usuario.id }, "2FA activado")
  // Texto plano una sola vez: el usuario debe guardarlos ahora.
  return NextResponse.json({ ok: true, backupCodes: backupPlano })
}
