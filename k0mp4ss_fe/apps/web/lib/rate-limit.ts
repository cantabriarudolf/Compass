import type { PrismaClient } from "@prisma/client"

export const MAX_INTENTOS = 10
export const VENTANA_MS = 15 * 60 * 1000

type PrismaLike = Pick<PrismaClient, "rateLimitAttempt">

let prismaPrometido: Promise<PrismaLike> | null = null

async function cliente(client?: PrismaClient): Promise<PrismaLike> {
  if (client) return client as PrismaLike
  prismaPrometido ??= import("./prisma").then((m) => m.prisma as unknown as PrismaLike)
  return prismaPrometido
}

/**
 * SG D-v — rate limit persistente en BD (reemplaza el Map en memoria de lib/auth.ts P1).
 * 10 fallos por clave (IP) en ventana de 15 minutos, leído desde Prisma:
 * sobrevive reinicios del proceso. Inyectable para tests.
 */
export async function excedeIntentos(clave: string, client?: PrismaClient): Promise<boolean> {
  const prisma = await cliente(client)
  const desde = new Date(Date.now() - VENTANA_MS)
  const total = await prisma.rateLimitAttempt.count({
    where: { clave, createdAt: { gte: desde } },
  })
  return total >= MAX_INTENTOS
}

export async function registrarFallo(clave: string, client?: PrismaClient): Promise<void> {
  const prisma = await cliente(client)
  // Limpieza oportunista: borra filas fuera de la ventana (tabla acotada).
  await prisma.rateLimitAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - VENTANA_MS) } },
  })
  await prisma.rateLimitAttempt.create({ data: { clave } })
}

export async function limpiarIntentos(clave: string, client?: PrismaClient): Promise<void> {
  const prisma = await cliente(client)
  await prisma.rateLimitAttempt.deleteMany({ where: { clave } })
}
