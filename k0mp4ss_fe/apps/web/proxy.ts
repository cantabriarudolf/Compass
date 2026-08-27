import { NextResponse } from "next/server"
import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

// Instancia edge-safe (sin Prisma): verifica el JWT de sesión en el borde.
// El provider Credentials + adapter viven solo en lib/auth.ts (runtime Node).
// Spread para que los defaults de Auth.js no muten la config compartida.
const { auth } = NextAuth({ ...authConfig })

const RUTAS_PUBLICAS = ["/ingresar", "/api/auth"]

export default (auth as any)((request: any) => {
  const { pathname } = request.nextUrl
  if (RUTAS_PUBLICAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))) {
    return NextResponse.next()
  }
  const protegida = pathname.startsWith("/admin") || pathname.startsWith("/api")
  if (!protegida) return NextResponse.next()
  if (request.auth) return NextResponse.next()
  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }
  const url = request.nextUrl.clone()
  url.pathname = "/ingresar"
  url.search = `?next=${encodeURIComponent(pathname)}`
  return NextResponse.redirect(url)
})

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
}
