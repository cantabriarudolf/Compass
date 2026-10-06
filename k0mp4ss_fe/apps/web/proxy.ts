import { NextRequest, NextResponse } from "next/server"
import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

// Instancia edge-safe (sin Prisma): verifica el JWT de sesión en el borde.
// El provider Credentials + adapter viven solo en lib/auth.ts (runtime Node).
// Spread para que los defaults de Auth.js no muten la config compartida.
const { auth } = NextAuth({ ...authConfig })

const RUTAS_PUBLICAS = ["/ingresar", "/api/auth"]

type GlobalConCripto = typeof globalThis & {
  crypto?: {
    randomUUID?: () => string
    getRandomValues?: (arreglo: Uint8Array) => Uint8Array
  }
}

function generarNonce(): string {
  const g = globalThis as GlobalConCripto
  if (g.crypto?.randomUUID) {
    // randomUUID -> base64url (sin padding, URL-safe)
    return g.crypto.randomUUID().replace(/-/g, "").replace(/=/g, "")
  }
  if (g.crypto?.getRandomValues) {
    const a = new Uint8Array(16)
    g.crypto.getRandomValues(a)
    // base64url encoding
    let s = ""
    for (const b of a) s += String.fromCharCode(b)
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
  }
  // Entorno sin Web Crypto (no esperado en producción): fallback determinístico
  const arr = new Uint8Array(16)
  for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256)
  let s = ""
  for (const b of arr) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

// D-i: CSP en Report-Only mode. Nonce único por request via Web Crypto.
// Plan de activación enforcement: openspec/changes/sg-predeploy-headers/design.md
// (telemetría DevTools CSP violations, criterio 0 violations 7 días).
function cspEnforce(nonce: string): string {
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
    "report-uri /api/csp-report",
  ].join("; ")
}

type PeticionConAuth = NextRequest & { auth?: unknown }

// SAFETY: el tipo de `auth` de Auth.js no expone el envoltorio de forma
// utilizable en el edge; el cast solo fija la firma local
// (request con auth opcional) sin cambiar el comportamiento en runtime.
export default (
  auth as unknown as (
    manejador: (req: PeticionConAuth) => NextResponse
  ) => (req: NextRequest, evento?: unknown) => Response | Promise<Response>
)((request: PeticionConAuth) => {
  const nonce = generarNonce()
  const csp = cspEnforce(nonce)
  // Propaga nonce a downstream (handlers/server components) vía request headers
  try {
    request.headers.set("x-nonce", nonce)
    request.headers.set("x-csp-nonce", nonce)
  } catch {
    // Headers de solo lectura en este runtime: se continúa sin nonce.
  }

  const { pathname } = request.nextUrl
  let res: NextResponse
  if (
    RUTAS_PUBLICAS.some(
      (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`)
    )
  ) {
    res = NextResponse.next()
  } else {
    const protegida =
      pathname.startsWith("/admin") || pathname.startsWith("/api")
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
  } catch {
    // Respuesta inmutable en este runtime: se continúa sin inyectar nonce.
  }
  // Phase 1 (sg-csp-enforcement): conditional header name via CSP_ENFORCEMENT env var
  // true  -> Content-Security-Policy (enforcement)
  // false/unset -> Content-Security-Policy-Report-Only (default, safe for telemetry)
  const cspHeaderName =
    process.env.CSP_ENFORCEMENT === "true"
      ? "Content-Security-Policy"
      : "Content-Security-Policy-Report-Only"
  res.headers.set(cspHeaderName, csp)
  return res
})

export const config = {
  // D-i: matcher amplio para emitir CSP-Report-Only en toda respuesta (incluye públicas).
  // Auth solo protege /admin y /api; el resto pasa con CSP igual.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
