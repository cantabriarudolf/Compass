import type { Adapter, AdapterUser } from "next-auth/adapters"
import type { PrismaClient } from "@prisma/client"

type UsuarioRow = {
  id: string
  email: string
  personaId: string | null
  activo: boolean
  passwordHash: string | null
}

/**
 * Adapter de Auth.js sobre Prisma con los modelos P4 (`Usuario`/`Membresia`).
 *
 * Adaptación documentada (P5): `@auth/prisma-adapter` exige modelos
 * `User`/`Account`/`Session`/`VerificationToken` con campos
 * `emailVerified`/`name`/`image` que no existen en el schema; en lugar de
 * duplicar modelos ya migrados, se implementa el contrato `Adapter`
 * directamente contra `Usuario` (AU §3.1 "adapter de BD sobre los modelos
 * de P4"). Con estrategia JWT + solo provider credentials el flujo de login
 * no invoca el adapter (la sesión vive en el JWT); queda activo para uso
 * server-side y para un futuro OAuth (los métodos de Account/Session/
 * VerificationToken son no-op/null hasta que exista un provider OAuth).
 */
function aAdapterUser(usuario: UsuarioRow | null): AdapterUser | null {
  if (!usuario) return null
  return {
    id: usuario.id,
    email: usuario.email,
    emailVerified: null,
    name: null,
    image: null,
  }
}

export function AdapterPrismaCompass(prisma: PrismaClient): Adapter {
  return {
    createUser: async (data) => {
      const usuario = await prisma.usuario.create({
        data: { email: data.email },
      })
      return aAdapterUser(usuario as UsuarioRow)!
    },
    getUser: async (id) =>
      aAdapterUser((await prisma.usuario.findUnique({ where: { id } })) as UsuarioRow | null),
    getUserByEmail: async (email) =>
      aAdapterUser(
        (await prisma.usuario.findUnique({ where: { email } })) as UsuarioRow | null
      ),
    // Sin OAuth todavía: no hay tabla Account, no hay cuentas vinculadas.
    getUserByAccount: async () => null,
    updateUser: async ({ id, ...data }) => {
      const usuario = await prisma.usuario.update({
        where: { id },
        data: { email: data.email ?? undefined },
      })
      return aAdapterUser(usuario as UsuarioRow)!
    },
    deleteUser: async (id) =>
      aAdapterUser((await prisma.usuario.delete({ where: { id } })) as UsuarioRow)!,
    linkAccount: async () => undefined,
    unlinkAccount: async () => undefined,
    // Estrategia JWT: Auth.js no usa sesiones en BD.
    getSessionAndUser: async () => null,
    createSession: async () => {
      throw new Error("Estrategia JWT: sesiones en BD no soportadas")
    },
    updateSession: async () => null,
    deleteSession: async () => undefined,
    createVerificationToken: async () => null,
    useVerificationToken: async () => null,
  }
}
