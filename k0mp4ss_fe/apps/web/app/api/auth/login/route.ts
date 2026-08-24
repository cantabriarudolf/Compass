import { NextResponse } from "next/server"
import { cookieSesion, crearToken, credencialesValidas, excedeIntentos, registrarFallo, nuevaExpiracion } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }
  const email = typeof body.email === "string" ? body.email.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""
  if (!email || !password) {
    return NextResponse.json({ error: "Email y contraseña son obligatorios." }, { status: 400 })
  }
  if (secretoAusente()) {
    return NextResponse.json({ error: "AUTH_SECRET no configurado en el servidor." }, { status: 503 })
  }
  const clave = request.headers.get("x-forwarded-for") ?? "local"
  if (excedeIntentos(clave)) {
    return NextResponse.json({ error: "Demasiados intentos. Espere unos minutos." }, { status: 429 })
  }
  if (!credencialesValidas(email, password)) {
    registrarFallo(clave)
    return NextResponse.json({ error: "Credenciales inválidas." }, { status: 401 })
  }
  const respuesta = NextResponse.json({ ok: true })
  respuesta.cookies.set(cookieSesion(crearToken({ sub: email, exp: nuevaExpiracion() })))
  return respuesta
}

function secretoAusente(): boolean {
  const valor = process.env.AUTH_SECRET
  return !(valor && valor.length >= 16) && process.env.NODE_ENV === "production"
}
