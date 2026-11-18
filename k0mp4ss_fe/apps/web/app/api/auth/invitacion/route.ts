import { NextResponse, NextRequest } from "next/server"
import { MENSAJE_PASSWORD_INVALIDA, validarPassword } from "@/lib/password-policy"
import {
  definirPasswordConInvitacion,
  MENSAJE_INVITACION_INVALIDA,
} from "@/lib/invitacion-acceso"

export const dynamic = "force-dynamic"

/**
 * POST /api/auth/invitacion — la persona define su contraseña con el enlace (F42 · S4).
 *
 * Vive bajo `/api/auth/*` a propósito: quien abre la invitación NO tiene sesión
 * —la cuenta nace sin `passwordHash`, así que no puede entrar— y `/api/auth` es
 * el único prefijo que la compuerta de autenticación deja pasar sin sesión, el
 * mismo lugar donde viven `/api/auth/2fa/challenge` y `/api/auth/2fa/verify`.
 * Cambiar esta ruta a `/api/admin/*` la volvería inalcanzable (401 del proxy).
 *
 * No hay guard de rol porque no hay rol que exigir: el token es la credencial.
 * No devuelve datos de la cuenta, solo `{ ok: true }`: ni token, ni hash, ni
 * siquiera el correo (el enlace ya identifica a quien lo tiene).
 */
export async function POST(request: NextRequest) {
  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }

  const datos = (
    cuerpo !== null && typeof cuerpo === "object" ? cuerpo : {}
  ) as Record<string, unknown>
  const token = typeof datos.token === "string" ? datos.token.trim() : ""
  const password = typeof datos.password === "string" ? datos.password : ""

  if (!token || !password) {
    return NextResponse.json(
      { error: "token y contraseña requeridos" },
      { status: 400 }
    )
  }

  // La política es la que ya rige el login (`lib/password-policy.ts`), no una nueva.
  // Se evalúa antes de tocar la base: una contraseña débil no consume el enlace.
  if (!validarPassword(password).valido) {
    return NextResponse.json({ error: MENSAJE_PASSWORD_INVALIDA }, { status: 400 })
  }

  const resultado = await definirPasswordConInvitacion({ token, password })
  // Un solo rechazo para inventado, vencido y ya usado: la ruta no cuenta si el
  // token existió en algún momento.
  if (!resultado.ok) {
    return NextResponse.json({ error: MENSAJE_INVITACION_INVALIDA }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
