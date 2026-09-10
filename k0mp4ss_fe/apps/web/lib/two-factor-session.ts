import { encode } from "next-auth/jwt"

/**
 * SERIE-PRODUCCION-FASE2 P3 — acuña la cookie de sesión Auth.js tras 2FA válido.
 *
 * Replica el JWE de sesión (AUTH_SECRET + salt = nombre de cookie) y las
 * opciones por defecto de Auth.js. El callback jwt de lib/auth.ts puebla
 * roles/tokenVersion en el primer auth() porque el token nace sin roles.
 * maxAge 24h (P2: JWT 24h con sliding refresh).
 */

export const SESION_2FA_MAX_AGE_SEG = 24 * 60 * 60

export function nombreCookieSesion(requestUrl: string): string {
  // Misma regla de Auth.js (init.js): secure si el protocolo del request es https.
  const seguro = new URL(requestUrl).protocol === "https:"
  return `${seguro ? "__Secure-" : ""}authjs.session-token`
}

/** Serializa Set-Cookie de sesión Auth.js para un usuario recién verificado por 2FA. */
export async function acunarCookieSesion(usuarioId: string, email: string, requestUrl: string): Promise<string> {
  const secreto = process.env.AUTH_SECRET
  if (!secreto) throw new Error("AUTH_SECRET no configurado.")
  const nombre = nombreCookieSesion(requestUrl)
  const token = await encode({
    secret: secreto,
    salt: nombre,
    maxAge: SESION_2FA_MAX_AGE_SEG,
    token: { sub: usuarioId, email },
  })
  const seguro = new URL(requestUrl).protocol === "https:"
  // JWE en base64url: sin ; ni espacios, seguro sin comillas.
  // Mismas opciones por defecto de Auth.js (cookie.js: sessionToken).
  return `${nombre}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESION_2FA_MAX_AGE_SEG}${seguro ? "; Secure" : ""}`
}
