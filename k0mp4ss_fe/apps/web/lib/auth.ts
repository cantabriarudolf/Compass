import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { authConfig } from "@/lib/auth.config"
import { AdapterPrismaCompass } from "@/lib/auth-adapter"
import { excedeIntentos, registrarFallo, limpiarIntentos } from "@/lib/rate-limit"

/** Credenciales inválidas (password errónea, usuario inexistente/inactivo/sin hash). Mensaje genérico para no enumerar emails. */
export class CredencialesInvalidas extends CredentialsSignin {
  code = "credentials"
}

/** SG D-v: IP superó el límite de intentos persistente (10 fallos/15 min). */
export class LimiteIntentos extends CredentialsSignin {
  code = "rate_limited"
}

function claveIp(request: Request): string {
  return request.headers.get("x-forwarded-for") ?? "local"
}

/**
 * authorize de Auth.js (AU §3): valida contra BD con bcrypt, aplica rate limit
 * persistente D-v y retorna el usuario con id de BD (sub = Usuario.id).
 */
async function autorizarCredenciales(
  credentials: Partial<Record<"email" | "password", unknown>>,
  request: Request
): Promise<{ id: string; email: string } | null> {
  const email =
    typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : ""
  const password = typeof credentials.password === "string" ? credentials.password : ""
  if (!email || !password) throw new CredencialesInvalidas()

  const clave = claveIp(request)

  // D-v: fail-closed antes de tocar bcrypt (sin leak de timing ni gasto de CPU)
  if (await excedeIntentos(clave)) throw new LimiteIntentos()

  const usuario = await prisma.usuario.findUnique({ where: { email } })
  const hashValido =
    usuario?.passwordHash ? await bcrypt.compare(password, usuario.passwordHash) : false

  if (!usuario || !usuario.activo || !hashValido) {
    await registrarFallo(clave)
    throw new CredencialesInvalidas()
  }

  await limpiarIntentos(clave)
  return { id: usuario.id, email: usuario.email }
}

/**
 * Instancia Auth.js (Node) — AU §3 P5.
 * - handlers: rutas /api/auth/* (app/api/auth/[...nextauth]/route.ts)
 * - auth(): sesión en server components / route handlers
 * - signIn/signOut: server actions si se necesitan
 * La verificación edge (proxy.ts) usa lib/auth.config.ts sin Prisma.
 */
export const { handlers, auth, signIn, signOut }: any = NextAuth({
  ...authConfig,
  adapter: AdapterPrismaCompass(prisma),
  providers: [
    Credentials({
      credentials: { email: { label: "Correo electrónico" }, password: { label: "Contraseña" } },
      authorize: autorizarCredenciales,
    }),
  ],
})
