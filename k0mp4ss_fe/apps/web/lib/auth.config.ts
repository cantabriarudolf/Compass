import type { NextAuthConfig } from "next-auth"
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      roles?: string[]
    } & DefaultSession["user"]
  }
}

// JWT roles se tipa via (token as any).roles en lib/auth.ts para no acoplar edge-safe a JWT type.

/**
 * Configuración edge-safe de Auth.js (AU §3, P5).
 * NO importar aquí nada de Node/Prisma: proxy.ts (edge) construye su propia
 * instancia con esta configuración para verificar el JWT de sesión sin BD.
 * El provider Credentials (authorize con Prisma + bcrypt) vive solo en lib/auth.ts.
 */
export const authConfig = {
  // JWT para que proxy.ts (edge) verifique sin Prisma; el adapter vive server-side.
  // SERIE-PRODUCCION-FASE2 P2: sesión de 24h con sliding refresh (1h).
  // Antes: 30 días. Ahora: 24h de vida, se extiende 24h más si el usuario
  // está activo (cada 1h de actividad).
  session: { strategy: "jwt", maxAge: 24 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: "/ingresar", error: "/ingresar" },
  // Deploy self-hosted: sin esto Auth.js no confía en el Host en producción.
  trustHost: true,
  providers: [], // edge-safe; el provider real se agrega en lib/auth.ts (runtime Node)
  callbacks: {
    session({ session, token }) {
      // sub = Usuario.id en BD (AU §3.2); email para identificar en UI/logs.
      session.user.id = token.sub ?? ""
      if (token.email) session.user.email = token.email
      return session
    },
  },
} satisfies NextAuthConfig
