import type { PrismaClient } from "@prisma/client"

export interface SeedAuthzResult {
  ok: boolean
  comunidades: { id: string; nombre: string; slug: string }[]
  usuarios: { email: string; rol: string; comunidadId: string }[]
  counts: { comunidades: number; usuarios: number; membresias: number }
}

/**
 * seedUsuariosMembresias — crea 2 comunidades + 5 usuarios TEST con membresías
 * Idempotente: upsert por id/slug/email y membresia unique.
 * Comunidad A: comunidad-a (Comunidad Los Aromos TEST)
 * Comunidad B: comunidad-b (Comunidad Las Palmas TEST)
 * Usuarios: admin@test.cl (admin A+B), comite@test.cl (comite A), conserjeria@test.cl, residente@test.cl, mantencion@test.cl
 * Cada usuario queda vinculado por membresia a su comunidad; admin en ambas para probar aislamiento A/B.
 * Llamado desde qa-lab (fase AU) y desde tests con client temporal.
 */
export async function seedUsuariosMembresias(client?: PrismaClient): Promise<SeedAuthzResult> {
  const { prisma: defaultPrisma } = await import("./prisma")
  const prisma = (client ?? defaultPrisma) as unknown as PrismaClient

  // comunidades
  const comunidadesData = [
    { id: "comunidad-a", nombre: "Comunidad Los Aromos TEST", slug: "los-aromos-test" },
    { id: "comunidad-b", nombre: "Comunidad Las Palmas TEST", slug: "las-palmas-test" },
  ]

  for (const c of comunidadesData) {
    await (prisma as any).comunidad.upsert({
      where: { id: c.id },
      update: { nombre: c.nombre, slug: c.slug },
      create: c,
    })
    // slug unique también: si slug colisiona por id distinto, usa id como fallback
    try {
      await (prisma as any).comunidad.upsert({
        where: { slug: c.slug },
        update: {},
        create: c,
      })
    } catch {
      // ignore si ya existe por id upsert arriba
    }
  }

  const usuariosData = [
    { id: "usuario-admin", email: "admin@test.cl", personaId: "p-5", activo: true },
    { id: "usuario-comite", email: "comite@test.cl", personaId: "p-6", activo: true },
    { id: "usuario-conserjeria", email: "conserjeria@test.cl", personaId: "p-4", activo: true },
    { id: "usuario-residente", email: "residente@test.cl", personaId: "p-3", activo: true },
    { id: "usuario-mantencion", email: "mantencion@test.cl", personaId: "p-7", activo: true },
  ]

  for (const u of usuariosData) {
    await (prisma as any).usuario.upsert({
      where: { email: u.email },
      update: { personaId: u.personaId, activo: u.activo },
      create: u,
    })
  }

  // Membresías: admin en ambas, resto solo en A
  const membresiasData = [
    { usuarioId: "usuario-admin", comunidadId: "comunidad-a", rol: "administrador" },
    { usuarioId: "usuario-admin", comunidadId: "comunidad-b", rol: "administrador" },
    { usuarioId: "usuario-comite", comunidadId: "comunidad-a", rol: "comite" },
    { usuarioId: "usuario-conserjeria", comunidadId: "comunidad-a", rol: "conserjeria" },
    { usuarioId: "usuario-residente", comunidadId: "comunidad-a", rol: "residente" },
    { usuarioId: "usuario-mantencion", comunidadId: "comunidad-a", rol: "mantencion" },
    // Para probar que admin B no ve A: admin también en B ya cubierto
    // Añade residente también en B para test cross: residente@test.cl solo en A, no en B
  ]

  for (const m of membresiasData) {
    // find existing by unique
    const existing = await (prisma as any).membresia.findFirst({
      where: { usuarioId: m.usuarioId, comunidadId: m.comunidadId },
    })
    if (!existing) {
      await (prisma as any).membresia.create({ data: m })
    } else if (existing.rol !== m.rol) {
      await (prisma as any).membresia.update({ where: { id: existing.id }, data: { rol: m.rol } })
    }
  }

  const comunidades = await (prisma as any).comunidad.findMany({
    where: { id: { in: ["comunidad-a", "comunidad-b"] } },
  })
  const usuarios = await (prisma as any).usuario.findMany({
    where: { email: { in: usuariosData.map((u) => u.email) } },
  })
  const membresias = await (prisma as any).membresia.findMany({
    where: { comunidadId: { in: ["comunidad-a", "comunidad-b"] } },
  })

  return {
    ok: true,
    comunidades: comunidades.map((c: { id: string; nombre: string; slug: string }) => ({
      id: c.id,
      nombre: c.nombre,
      slug: c.slug,
    })),
    usuarios: membresias.map((m: { usuarioId: string; comunidadId: string; rol: string }) => {
      const u = usuarios.find((x: { id: string }) => x.id === m.usuarioId)
      return { email: u?.email ?? m.usuarioId, rol: m.rol, comunidadId: m.comunidadId }
    }),
    counts: { comunidades: comunidades.length, usuarios: usuarios.length, membresias: membresias.length },
  }
}
