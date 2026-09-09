import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { authConfig } from "@/lib/auth.config"
import { AdapterPrismaCompass } from "@/lib/auth-adapter"
import { excedeIntentos, registrarFallo, limpiarIntentos } from "@/lib/rate-limit"
import { validarPassword, MENSAJE_PASSWORD_INVALIDA } from "@/lib/password-policy"

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
 * Hash bcrypt de una password inexistente (cost 10). Se usa como comparación
 * dummy cuando el usuario no existe, para igualar el tiempo de respuesta y no
 * filtrar existencia de emails por timing (SEC-012, D-iv).
 */
const HASH_DUMMY = "$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5B0G1S3kQvPzEmg8BkSxTQhxnWJmK"

function claveIp(request: Request): string {
  const bruto = request.headers.get("x-forwarded-for") ?? "local"
  return bruto.split(",")[0]!.trim() || "local"
}

/**
 * authorize de Auth.js (AU §3): valida contra BD con bcrypt, aplica rate limit
 * persistente D-v, valida password policy, y retorna el usuario con id de BD.
 *
 * SERIE-PRODUCCION-FASE2 P2: añadida validación de password policy.
 */
async function autorizarCredenciales(
  credentials: Partial<Record<"email" | "password", unknown>>,
  request: Request
): Promise<{ id: string; email: string } | null> {
  const email =
    typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : ""
  const password = typeof credentials.password === "string" ? credentials.password : ""
  if (!email || !password) throw new CredencialesInvalidas()

  // P2: validar password policy
  const { valido } = validarPassword(password)
  if (!valido) throw new PasswordDebil()

  const claves = [claveIp(request), `email:${email}`]

  for (const clave of claves) {
    if (await excedeIntentos(clave)) throw new LimiteIntentos()
  }

  const usuario = await prisma.usuario.findUnique({ where: { email } })
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const { handlers, auth, signIn, signOut }: any = NextAuth({
  ...authConfig,
  adapter: AdapterPrismaCompass(prisma),
  providers: [
    Credentials({
      credentials: { email: { label: "Correo electrónico" }, password: { label: "Contraseña" } },
      authorize: autorizarCredenciales,
    }),
  ],
  callbacks: {
    async jwt({ token, trigger }: { token: Record<string, unknown> & { roles?: string[]; tokenVersion?: number }; trigger?: string }) {
      if (token.sub) {
        const necesitaRefresh = !Array.isArray(token.roles) || trigger === "update"
        if (necesitaRefresh) {
          try {
            const usuario = await prisma.usuario.findUnique({
              where: { id: token.sub as string },
              select: { tokenVersion: true },
            })
            // P2: invalidar sesión si tokenVersion cambió
            if (usuario && typeof usuario.tokenVersion === "number") {
              if (token.tokenVersion !== undefined && token.tokenVersion !== usuario.tokenVersion) {
                // Sesión invalidada — retornar token vacío para forzar re-login
                return { sub: "" } as any
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
