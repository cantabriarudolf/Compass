import { createHmac, timingSafeEqual } from "node:crypto"

const COOKIE_NAME = "compass_session"
const SESSION_DIAS = 30
const MAX_INTENTOS = 10
const VENTANA_MS = 15 * 60 * 1000

export interface SesionPayload {
  sub: string
  exp: number
}

function secreto(): string | null {
  const valor = process.env.AUTH_SECRET
  if (valor && valor.length >= 16) return valor
  if (process.env.NODE_ENV !== "production") {
    return "compass-dev-secret-solo-desarrollo"
  }
  return null
}

function firmar(carga: string): string {
  return createHmac("sha256", secreto() ?? "sesion-invalida").update(carga).digest("base64url")
}

export function crearToken(sesion: SesionPayload): string {
  const carga = Buffer.from(JSON.stringify(sesion)).toString("base64url")
  return `${carga}.${firmar(carga)}`
}

export function verificarToken(token: string | undefined | null): SesionPayload | null {
  if (!token || !token.includes(".") || secreto() === null) return null
  const partes = token.split(".")
  const carga = partes[0]
  const firma = partes[1]
  if (!carga || !firma) return null
  const esperada = firmar(carga)
  const a = Buffer.from(firma)
  const b = Buffer.from(esperada)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const sesion = JSON.parse(Buffer.from(carga, "base64url").toString()) as SesionPayload
    if (typeof sesion.exp !== "number" || sesion.exp < Date.now()) return null
    if (typeof sesion.sub !== "string" || !sesion.sub) return null
    return sesion
  } catch {
    return null
  }
}

export function credencialesValidas(email: string, password: string): boolean {
  const emailEsperado = process.env.ADMIN_EMAIL ?? "admin@compass.local"
  const passwordEsperada = process.env.ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? null : "compass-dev")
  if (!passwordEsperada) return false
  return email === emailEsperado && password === passwordEsperada
}

const intentos = new Map<string, { count: number; resetAt: number }>()

export function excedeIntentos(clave: string): boolean {
  const registro = intentos.get(clave)
  if (!registro || registro.resetAt < Date.now()) return false
  return registro.count >= MAX_INTENTOS
}

export function registrarFallo(clave: string): void {
  const ahora = Date.now()
  const registro = intentos.get(clave)
  if (!registro || registro.resetAt < ahora) {
    intentos.set(clave, { count: 1, resetAt: ahora + VENTANA_MS })
    return
  }
  registro.count += 1
}

export function cookieSesion(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DIAS * 24 * 60 * 60,
  }
}

export const NOMBRE_COOKIE_SESION = COOKIE_NAME

export function nuevaExpiracion(): number {
  return Date.now() + SESSION_DIAS * 24 * 60 * 60 * 1000
}
