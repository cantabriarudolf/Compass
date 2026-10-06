import type { JWT } from "next-auth/jwt"
import NextAuth, { CredentialsSignin, type Session } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { authConfig } from "@/lib/auth.config"
import { AdapterPrismaCompass } from "@/lib/auth-adapter"
import {
  excedeIntentos,
  registrarFallo,
  limpiarIntentos,
} from "@/lib/rate-limit"
import { validarPassword } from "@/lib/password-policy"

/**
 * Fail-fast validation for Google OAuth provider in production.
 * Runs at module load before NextAuth() initializes.
 * In development (NODE_ENV !== 'production'), empty-string fallback is allowed
 * so local dev works without Google Cloud credentials.
 */
if (process.env.NODE_ENV === 'production') {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production. ' +
      'Set them in your environment or disable the Google provider.'
    )
  }
}

/** Credenciales inválidas (password errónea, usuario inexistente/inactivo/sin hash). Mensaje genérico para no enumerar emails. */
export class CredencialesInvalidas extends CredentialsSignin {
  code = "credentials"
}

/** SG D-v: IP superó el límite de intentos persistente (10 fallos/15 min). */
export class LimiteIntentos extends CredentialsSignin {
  code = "rate_limited"
}

/** SERIE-PRODUCCION-FASE2 P2: password no cumple con la política de seguridad. */
export class PasswordDebil extends CredentialsSignin {
  code = "password_debil"
}

/**
 * SERIE-PRODUCCION-FASE2 P3: el usuario tiene 2FA activo y debe completar el
 * desafío TOTP (challenge → verify) en vez del login directo.
 */
export class Requiere2FA extends CredentialsSignin {
  code = "requiere_2fa"
}

/**
 * Hash bcrypt de una password inexistente (cost 10). Se usa como comparación
 * dummy cuando el usuario no existe, para igualar el tiempo de respuesta y no
 * filtrar existencia de emails por timing (SEC-012, D-iv).
 */
const HASH_DUMMY =
  "$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5B0G1S3kQvPzEmg8BkSxTQhxnWJmK"

function claveIp(request: Request): string {
  const bruto = request.headers.get("x-forwarded-for") ?? "local"
  return bruto.split(",")[0]!.trim() || "local"
}

export interface CredencialesVerificadas {
  id: string
  email: string
  twoFactorEnabled: boolean
}

/**
 * Valida email+password contra BD (bcrypt + rate limit D-v + password policy P2).
 * Comparte la lógica entre authorize de Auth.js y el challenge 2FA (P3) para
 * que ambos caminos apliquen idénticas defensas (sin oráculo de enumeración:
 * mensaje genérico + comparación dummy por timing).
 *
 * Lanza CredencialesInvalidas | PasswordDebil | LimiteIntentos.
 */
export async function verificarCredenciales(
  emailBruto: unknown,
  passwordBruto: unknown,
  clavesRateLimit: string[]
): Promise<CredencialesVerificadas> {
  const email =
    typeof emailBruto === "string" ? emailBruto.trim().toLowerCase() : ""
  const password = typeof passwordBruto === "string" ? passwordBruto : ""
  if (!email || !password) throw new CredencialesInvalidas()

  // P2: validar password policy
  const { valido } = validarPassword(password)
  if (!valido) throw new PasswordDebil()

  for (const clave of clavesRateLimit) {
    if (await excedeIntentos(clave)) throw new LimiteIntentos()
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } })
  const hash = usuario?.passwordHash ?? HASH_DUMMY
  const hashValido = await bcrypt.compare(password, hash)

  if (!usuario || !usuario.activo || !usuario.passwordHash || !hashValido) {
    for (const clave of clavesRateLimit) {
      await registrarFallo(clave)
    }
    throw new CredencialesInvalidas()
  }

  for (const clave of clavesRateLimit) {
    await limpiarIntentos(clave)
  }
  return {
    id: usuario.id,
    email: usuario.email,
    twoFactorEnabled: usuario.twoFactorEnabled,
  }
}

/**
 * authorize de Auth.js (AU §3): valida credenciales y retorna el usuario con id de BD.
 *
 * SERIE-PRODUCCION-FASE2 P2: añadida validación de password policy.
 * SERIE-PRODUCCION-FASE2 P3: usuarios con 2FA NO obtienen sesión aquí;
 * deben completar el flujo challenge → verify (Requiere2FA).
 */
async function autorizarCredenciales(
  credentials: Partial<Record<"email" | "password", unknown>>,
  request: Request
): Promise<{ id: string; email: string } | null> {
  const email =
    typeof credentials.email === "string"
      ? credentials.email.trim().toLowerCase()
      : ""
  const claves = [claveIp(request), `email:${email}`]
  const usuario = await verificarCredenciales(
    credentials.email,
    credentials.password,
    claves
  )
  if (usuario.twoFactorEnabled) throw new Requiere2FA()
  return { id: usuario.id, email: usuario.email }
}

const resultadoAuth = NextAuth({
  ...authConfig,
  adapter: AdapterPrismaCompass(prisma),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo electrónico" },
        password: { label: "Contraseña" },
      },
      authorize: autorizarCredenciales,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email?.toLowerCase()
        if (!email) return false
        const clave = `google:${email}`
        if (await excedeIntentos(clave)) return false
        const usuario = await prisma.usuario.findUnique({ where: { email } })
        if (!usuario || !usuario.activo) {
          await registrarFallo(clave)
          return false
        }
        await limpiarIntentos(clave)
      }
      return true
    },
            async jwt(params) {
              const { token, trigger, account, user } = params
      // Google SSO: mapear sub al Usuario.id de BD en el primer login
      if (account?.provider === "google" && user?.email) {
        const u = await prisma.usuario.findUnique({
          where: { email: user.email.toLowerCase() },
          select: { id: true, tokenVersion: true },
        })
            if (u) {
              token.sub = u.id
              if (typeof u.tokenVersion === "number") {
                token.tokenVersion = u.tokenVersion
              }
            }
      }
      if (token.sub) {
        const necesitaRefresh =
          !Array.isArray(token.roles) || trigger === "update"
        if (necesitaRefresh) {
          try {
            const usuario = await prisma.usuario.findUnique({
              where: { id: token.sub as string },
              select: { tokenVersion: true },
            })
            if (usuario && typeof usuario.tokenVersion === "number") {
              if (
                token.tokenVersion !== undefined &&
                token.tokenVersion !== usuario.tokenVersion
              ) {
                return { sub: "" } as JWT
              }
              token.tokenVersion = usuario.tokenVersion
            }
            const rows = await prisma.membresia.findMany({
              where: { usuarioId: token.sub },
              select: { rol: true },
            })
            token.roles = [...new Set(rows.map((r: { rol: string }) => r.rol))]
          } catch {
            token.roles = (token.roles as string[]) ?? []
          }
        }
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub ?? "")
        if (token.email) session.user.email = String(token.email)
        session.user.roles = (token.roles as string[]) ?? []
      }
      return session
    },
  },
})

export const { handlers, signIn, signOut } = resultadoAuth
// `auth` solo se usa como getter de sesión (17 usos `auth()` en app/); la
// sobrecarga wrapper de middleware vive en proxy.ts con instancia propia.
// Anotación explícita y portable: evita TS2742 (exigido por `declaration: true`
// del tsconfig base) sin recurrir a `any`.
export const auth: () => Promise<Session | null> = resultadoAuth.auth
