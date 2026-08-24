import { NextRequest, NextResponse } from "next/server"
import { NOMBRE_COOKIE_SESION, verificarToken } from "@/lib/auth"

const RUTAS_PUBLICAS = ["/ingresar", "/api/auth"]

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (RUTAS_PUBLICAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))) {
    return NextResponse.next()
  }
  const protegida = pathname.startsWith("/admin") || pathname.startsWith("/api")
  if (!protegida) return NextResponse.next()
  const sesion = verificarToken(request.cookies.get(NOMBRE_COOKIE_SESION)?.value)
  if (sesion) return NextResponse.next()
  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }
  const url = request.nextUrl.clone()
  url.pathname = "/ingresar"
  url.search = `?next=${encodeURIComponent(pathname)}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
}
