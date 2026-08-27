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

/**
 * Hash bcrypt de una password inexistente (cost 10). Se usa como comparación
 * dummy cuando el usuario no existe, para igualar el tiempo de respuesta y no
 * filtrar existencia de emails por timing (SEC-012, D-iv).
 */
const HASH_DUMMY = "$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5B0G1S3kQvPzEmg8BkSxTQhxnWJmK"

function claveIp(request: Request): string {
  // Primer hop del header (spoofable — por eso el rate limit también aplica por email).
  const bruto = request.headers.get("x-forwarded-for") ?? "local"
  return bruto.split(",")[0]!.trim() || "local"
}

/**
 * authorize de Auth.js (AU §3): valida contra BD con bcrypt, aplica rate limit
 * persistente D-v y retorna el usuario con id de BD (sub = Usuario.id).
 *
 * D-iv SEC-011: el límite se evalúa y registra sobre DOS claves — IP (x-forwarded-for,
 * spoofable rotando el header) y email normalizado (no spoofable al atacar una cuenta
 * concreta). Rotar IPs NO reinicia el contador de la cuenta víctima.
 */
async function autorizarCredenciales(
  credentials: Partial<Record<"email" | "password", unknown>>,
  request: Request
): Promise<{ id: string; email: string } | null> {
  const email =
    typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : ""
  const password = typeof credentials.password === "string" ? credentials.password : ""
  if (!email || !password) throw new CredencialesInvalidas()

  const claves = [claveIp(request), `email:${email}`]

  // D-v: fail-closed antes de tocar bcrypt (sin leak de timing ni gasto de CPU)
  for (const clave of claves) {
    if (await excedeIntentos(clave)) throw new LimiteIntentos()
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } })
  // SEC-012: comparar SIEMPRE un hash (real o dummy) para igualar timing.
  const hash = usuario?.passwordHash ?? HASH_DUMMY
  const hashValido = await bcrypt.compare(password, hash)

  if (!usuario || !usuario.activo || !usuario.passwordHash || !hashValido) {
    for (const clave of claves) {
      await registrarFallo(clave)
    }
    throw new CredencialesInvalidas()
  }

  for (const clave of claves) {
    await limpiarIntentos(clave)
  }
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
