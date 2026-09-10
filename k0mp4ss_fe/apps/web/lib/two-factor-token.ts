import { encode, decode } from "next-auth/jwt"

/**
 * SERIE-PRODUCCION-FASE2 P3 — token temporal de desafío 2FA.
 *
 * JWE (cifrado, no solo firmado) con AUTH_SECRET y salt propio, separado del
 * salt de la cookie de sesión. Vida corta (5 min). Contiene solo sub (Usuario.id)
 * y propósito fijo; decode de Auth.js NO valida exp, se verifica manual.
 */

export const DESAFIO_2FA_MAX_AGE_SEG = 5 * 60
const SALT_DESAFIO = "compass-2fa-challenge"
const PROPOSITO = "2fa-challenge"

function secreto(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error("AUTH_SECRET no configurado.")
  return s
}

interface DesafioPayload {
  sub?: string
  proposito?: string
  exp?: number
}

/** Crea un token de desafío para completar el login 2FA (válido 5 min). */
export async function crearDesafio2FA(usuarioId: string): Promise<string> {
  return encode({
    secret: secreto(),
    salt: SALT_DESAFIO,
    maxAge: DESAFIO_2FA_MAX_AGE_SEG,
    token: { sub: usuarioId, proposito: PROPOSITO },
  })
}

/**
 * Verifica un token de desafío. Retorna el Usuario.id si es válido y vigente,
 * null si está manipulado, expirado o tiene otro propósito.
 */
export async function verificarDesafio2FA(tempToken: string): Promise<string | null> {
  let payload: DesafioPayload | null
  try {
    payload = (await decode({ secret: secreto(), salt: SALT_DESAFIO, token: tempToken })) as DesafioPayload | null
  } catch {
    return null
  }
  if (!payload || payload.proposito !== PROPOSITO || typeof payload.sub !== "string" || !payload.sub) {
    return null
  }
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
    return null
  }
  return payload.sub
}
