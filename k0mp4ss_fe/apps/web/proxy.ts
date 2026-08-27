import { NextResponse } from "next/server"
import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

// Instancia edge-safe (sin Prisma): verifica el JWT de sesión en el borde.
// El provider Credentials + adapter viven solo en lib/auth.ts (runtime Node).
// Spread para que los defaults de Auth.js no muten la config compartida.
const { auth } = NextAuth({ ...authConfig })

const RUTAS_PUBLICAS = ["/ingresar", "/api/auth"]

function generarNonce(): string {
  try {
    const g: any = globalThis as any
    if (g.crypto?.randomUUID) return g.crypto.randomUUID().replace(/-/g, "")
    if (g.crypto?.getRandomValues) {
      const a = new Uint8Array(16)
      g.crypto.getRandomValues(a)
      let s = ""
      for (const b of a) s += b.toString(16).padStart(2, "0")
      return s
    }
  } catch {}
  return Math.random().toString(36).slice(2, 18) + Math.random().toString(36).slice(2, 18)
}

function cspReportOnly(nonce: string): string {
  // D-i: orígenes auditados — self, imágenes https/data/blob, YouTube embeds visor CV, fonts Google
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https:`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
    "font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
    "media-src 'self' https: data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ")
}

export default (auth as any)((request: any) => {
  const nonce = generarNonce()
  const csp = cspReportOnly(nonce)
  // Propaga nonce a downstream (handlers/server components) vía request headers
  try {
    request.headers.set("x-nonce", nonce)
    request.headers.set("x-csp-nonce", nonce)
  } catch {}

  const { pathname } = request.nextUrl
  let res: any
  if (RUTAS_PUBLICAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))) {
    res = NextResponse.next()
  } else {
    const protegida = pathname.startsWith("/admin") || pathname.startsWith("/api")
    if (!protegida) res = NextResponse.next()
    else if (request.auth) res = NextResponse.next()
    else if (pathname.startsWith("/api")) {
      res = NextResponse.json({ error: "No autenticado." }, { status: 401 })
    } else {
      const url = request.nextUrl.clone()
      url.pathname = "/ingresar"
      url.search = `?next=${encodeURIComponent(pathname)}`
      res = NextResponse.redirect(url)
    }
  }
  // Inyecta nonce en request para que Next lo vea como header del request
  try {
    res.headers.set("x-nonce", nonce)
    res.headers.set("x-csp-nonce", nonce)
  } catch {}
  res.headers.set("Content-Security-Policy-Report-Only", csp)
  // HSTS ya viene de next.config.mjs; CSP-RO es dinámico por request
  return res
})

export const config = {
  // D-i: matcher amplio para emitir CSP-Report-Only en toda respuesta (incluye públicas).
  // Auth solo protege /admin y /api; el resto pasa con CSP igual.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
