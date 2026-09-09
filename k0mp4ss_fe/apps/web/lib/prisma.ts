import { PrismaClient } from "@prisma/client"

// Singleton para evitar múltiples instancias en dev con HMR.
// En producción (Vercel + Neon PostgreSQL), usar Prisma Accelerate para
// connection pooling. Ver SERIE-PRODUCCION-FASE2 P1.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
    // log: ["query"] // útil en desarrollo si se necesita
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export default prisma
