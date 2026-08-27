import { PrismaClient } from "@prisma/client"

// Singleton para evitar múltiples instancias en dev con HMR.
// Ver https://pris.ly/d/help-next-js-best-practices
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // log: ["query"] // útil en desarrollo si se necesita
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export default prisma
