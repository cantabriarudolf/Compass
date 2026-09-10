import { NextResponse, NextRequest } from "next/server"
import { z } from "zod"
import { prismaCifrado as prisma } from "@/lib/prisma-cifrado"
import { logger } from "@/lib/logger"
import { excedeIntentos, registrarFallo, limpiarIntentos } from "@/lib/rate-limit"
import { verificarDesafio2FA } from "@/lib/two-factor-token"
import { consumirBackupCode, parsearBackupCodes } from "@/lib/two-factor"
import { acunarCookieSesion } from "@/lib/two-factor-session"

export const dynamic = "force-dynamic"

/** Umbral bajo el cual se advierte regenerar códigos de respaldo. */
export const UMBRAL_ADVERTENCIA_BACKUP = 3

const BodySchema = z.object({
  tempToken: z.string({ required_error: "Token temporal requerido." }).min(1, "Token temporal requerido."),
  codigo: z.string({ required_error: "El código es obligatorio." }).trim().min(1, "El código es obligatorio."),
})

function claveIp(request: NextRequest): string {
  const bruto = request.headers.get("x-forwarded-for") ?? "local"
  return bruto.split(",")[0]!.trim() || "local"
}

/**
 * POST /api/auth/2fa/backup — SERIE-PRODUCCION-FASE2 P3.
 * Login con código de respaldo (un solo uso): valida el desafío + consume el
 * código, acuña la sesión y reporta cuántos quedan (advierte si < 3).
 */
export async function POST(request: NextRequest) {
  const claveGlobal = `2fa-backup-ip:${claveIp(request)}`
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

  const clave = `2fa-backup:${usuarioId}`
  if (await excedeIntentos(clave)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espere unos minutos." },
      { status: 429 }
    )
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } })
  if (!usuario || !usuario.activo || !usuario.twoFactorEnabled) {
    await registrarFallo(clave)
    return NextResponse.json({ error: "Código inválido." }, { status: 401 })
  }

  const { valido, restantesJson } = await consumirBackupCode(
    usuario.twoFactorBackupCodes,
    parsed.data.codigo
  )
  if (!valido) {
    await registrarFallo(clave)
    logger.warn({ event: "2FA_BACKUP_FALLIDO", usuarioId: usuario.id }, "Código de respaldo inválido")
    return NextResponse.json({ error: "Código inválido." }, { status: 401 })
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { twoFactorBackupCodes: restantesJson },
  })
  await limpiarIntentos(clave)
  await limpiarIntentos(claveGlobal)

  const restantes = parsearBackupCodes(restantesJson).length
  const cookie = await acunarCookieSesion(usuario.id, usuario.email, request.url)
  logger.info(
    { event: "2FA_BACKUP_USADO", usuarioId: usuario.id, restantes },
    "Login con código de respaldo"
  )

  return new NextResponse(
    JSON.stringify({
      ok: true,
      codigosRestantes: restantes,
      advertencia:
        restantes < UMBRAL_ADVERTENCIA_BACKUP
          ? "Le quedan pocos códigos de respaldo. Regenere 2FA para obtener nuevos."
          : null,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
    }
  )
}
