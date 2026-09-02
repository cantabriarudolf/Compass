/* eslint-disable @typescript-eslint/no-explicit-any -- fake de sesión Auth.js */
/**
 * Helper de tests: minta cookies de sesión Auth.js reales (JWE) con la misma
 * derivación de llave que @auth/core (HKDF secret+salt), para ejercitar la
 * verificación real de auth()/proxy sin pasar por el flujo HTTP de login.
 * Salt = nombre de la cookie de sesión (dev/http → "authjs.session-token").
 */
import { encode } from "@auth/core/jwt"

export const NOMBRE_COOKIE_SESION = "authjs.session-token"
export const MAX_AGE_SESION = 30 * 24 * 60 * 60

export interface PayloadSesion {
  sub: string
  email?: string
}

export async function mintarSesion(payload: PayloadSesion): Promise<string> {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET debe estar definido antes de mintar sesión")
  return encode({
    token: { sub: payload.sub, email: payload.email, name: payload.email ?? null } as any,
    secret,
    salt: NOMBRE_COOKIE_SESION,
    maxAge: MAX_AGE_SESION,
  })
}

export async function cookieSesionAuthjs(payload: PayloadSesion): Promise<string> {
  return `${NOMBRE_COOKIE_SESION}=${await mintarSesion(payload)}`
}
