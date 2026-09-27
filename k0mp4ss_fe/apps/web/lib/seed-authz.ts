/* eslint-disable @typescript-eslint/no-explicit-any -- seed idempotente idéntico al patrón QA Lab; clientes Prisma tipados en runtime */
import type { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

/**
 * Password TEST de los usuarios de seed (AU §3 P5): dato de demo en BD,
 * no una credencial de entorno. Documentada en el manual de autenticación.
 */
// SERIE-PRODUCCION-FASE2 P2: password debe cumplir policy (8+ chars, mayúscula, minúscula, número)
export const PASSWORD_TEST = "Test1234!"

export interface SeedAuthzResult {
  ok: boolean
  comunidades: { id: string; nombre: string; slug: string }[]
  usuarios: { email: string; rol: string; comunidadId: string }[]
  counts: { comunidades: number; usuarios: number; membresias: number }
}

/**
 * seedUsuariosMembresias — crea 2 comunidades + 6 usuarios TEST con membresías
 * y passwordHash bcrypt (login vía Auth.js credentials, AU §3 P5).
 * Idempotente: upsert por id/slug/email y membresia unique.
 * Orden canónico de membresías idéntico a scripts/seed-authz.mjs: admin-a
 * ÚLTIMA por createdAt para scope comunidad-a (withComunidadScope, take:1).
 * Usuarios: admin@test.cl (admin A+B), comite/conserjeria/residente/
 * mantencion@test.cl (solo A), arrendatario@test.cl (login rol residente,
 * ficha p-arrendatario-1 + vínculo v-arrendatario-1 en comunidad-a).
 * Comunidad A: comunidad-a (Comunidad Los Aromos TEST)
 * Comunidad B: comunidad-b (Comunidad Las Palmas TEST)
 * Cada usuario queda vinculado por membresia a su comunidad; admin en ambas para probar aislamiento A/B.
 * Llamado desde qa-lab (fase AU, requiere sesión admin) y desde tests con client temporal.
 * Primer arranque sin usuarios: `npm run seed:authz` (scripts/seed-authz.mjs).
 */
export async function seedUsuariosMembresias(client?: PrismaClient): Promise<SeedAuthzResult> {
  const { prisma: defaultPrisma } = await import("./prisma")
  // SAFETY: el client opcional de tests expone el mismo delegate Prisma;
  // el cast solo relaja el tipado porque los modelos se acceden vía `as any`.
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

  const passwordHash = await bcrypt.hash(PASSWORD_TEST, 10)

  const usuariosData = [
    { id: "usuario-admin", email: "admin@test.cl", personaId: "p-5", activo: true, passwordHash },
    { id: "usuario-comite", email: "comite@test.cl", personaId: "p-6", activo: true, passwordHash },
    { id: "usuario-conserjeria", email: "conserjeria@test.cl", personaId: "p-4", activo: true, passwordHash },
    { id: "usuario-residente", email: "residente@test.cl", personaId: "p-3", activo: true, passwordHash },
    { id: "usuario-mantencion", email: "mantencion@test.cl", personaId: "p-7", activo: true, passwordHash },
    { id: "usuario-arrendatario", email: "arrendatario@test.cl", personaId: "p-arrendatario-1", activo: true, passwordHash },
  ]

  for (const u of usuariosData) {
    await (prisma as any).usuario.upsert({
      where: { email: u.email },
      update: { personaId: u.personaId, activo: u.activo, passwordHash: u.passwordHash },
      create: u,
    })
  }

  // Membresías: orden canónico idéntico a scripts/seed-authz.mjs — el scope
  // es la ÚLTIMA membresía por createdAt (withComunidadScope, take:1),
  // admin-a va ÚLTIMA para scope comunidad-a (cuentas-funcionales.md §3.4).
  // No reordenar sin actualizar ese documento.
  const membresiasData = [
    { usuarioId: "usuario-admin", comunidadId: "comunidad-b", rol: "administrador" },
    { usuarioId: "usuario-comite", comunidadId: "comunidad-a", rol: "comite" },
    { usuarioId: "usuario-conserjeria", comunidadId: "comunidad-a", rol: "conserjeria" },
    { usuarioId: "usuario-residente", comunidadId: "comunidad-a", rol: "residente" },
    { usuarioId: "usuario-mantencion", comunidadId: "comunidad-a", rol: "mantencion" },
    { usuarioId: "usuario-arrendatario", comunidadId: "comunidad-a", rol: "residente" },
    { usuarioId: "usuario-admin", comunidadId: "comunidad-a", rol: "administrador" },
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

  // Determinismo P1 (SERIE-E2E-FULL-VERDE): reescribir createdAt en orden
  // canónico (admin-a ÚLTIMA) — espejo del fix en scripts/seed-authz.mjs.
  const baseTs = Date.now()
  for (const [i, m] of membresiasData.entries()) {
    const row = await (prisma as any).membresia.findFirst({
      where: { usuarioId: m.usuarioId, comunidadId: m.comunidadId },
    })
    if (row) {
      await (prisma as any).membresia.update({
    where: { id: row.id },
    data: { createdAt: new Date(baseTs + i * 1000) },
      })
    }
  }

  // Ficha del inquilino + vínculo arrendatario vigente (first-wins, espejo
  // de scripts/seed-authz.mjs: no se pisa si ya existe).
  const personaArr = await (prisma as any).persona.findUnique({ where: { id: "p-arrendatario-1" } })
  if (!personaArr) {
    await (prisma as any).persona.create({
      data: {
    id: "p-arrendatario-1",
    comunidadId: "comunidad-a",
    rut: "11.111.111-1",
    nombreCompleto: "Daniela Fuenzalida Soto",
    nombres: "Daniela",
    apellidos: "Fuenzalida Soto",
    email: "arrendatario@test.cl",
    telefonoMovil: "+56 9 5555 1212",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["residente"],
    permiteCreacionManualCV: false,
      },
    })
  }
  const vincArr = await (prisma as any).vinculoUnidad.findUnique({ where: { id: "v-arrendatario-1" } })
  if (!vincArr) {
    await (prisma as any).vinculoUnidad.create({
      data: {
    id: "v-arrendatario-1",
    comunidadId: "comunidad-a",
    personaId: "p-arrendatario-1",
    unidadId: "u-A-101",
    rol: "arrendatario",
    fechaInicio: "2024-03-01",
    fechaFin: null,
    estadoOcupacionPropiedad: "arrendada",
    permiteVerFinanzas: false,
      },
    })
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
