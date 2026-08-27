// Bootstrap AU §3 P5: seed dev de 2 comunidades + 5 usuarios TEST con passwordHash.
// Se usa en el PRIMER arranque (BD sin usuarios → Auth.js no permite login →
// fail-closed intencional). Idempotente; espejo de lib/seed-authz.ts.
// Uso: npm run seed:authz   (lee .env vía --env-file-if-exists)
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const PASSWORD_TEST = "test1234"

const comunidadesData = [
  { id: "comunidad-a", nombre: "Comunidad Los Aromos TEST", slug: "los-aromos-test" },
  { id: "comunidad-b", nombre: "Comunidad Las Palmas TEST", slug: "las-palmas-test" },
]

const membresiasData = [
  { usuarioId: "usuario-admin", comunidadId: "comunidad-a", rol: "administrador" },
  { usuarioId: "usuario-admin", comunidadId: "comunidad-b", rol: "administrador" },
  { usuarioId: "usuario-comite", comunidadId: "comunidad-a", rol: "comite" },
  { usuarioId: "usuario-conserjeria", comunidadId: "comunidad-a", rol: "conserjeria" },
  { usuarioId: "usuario-residente", comunidadId: "comunidad-a", rol: "residente" },
  { usuarioId: "usuario-mantencion", comunidadId: "comunidad-a", rol: "mantencion" },
]

async function main() {
  const prisma = new PrismaClient()
  try {
    const passwordHash = await bcrypt.hash(PASSWORD_TEST, 10)

    for (const c of comunidadesData) {
      await prisma.comunidad.upsert({
        where: { id: c.id },
        update: { nombre: c.nombre, slug: c.slug },
        create: c,
      })
      try {
        await prisma.comunidad.upsert({ where: { slug: c.slug }, update: {}, create: c })
      } catch {
        // ya existe por id
      }
    }

    const usuariosData = [
      { id: "usuario-admin", email: "admin@test.cl", personaId: "p-5", activo: true, passwordHash },
      { id: "usuario-comite", email: "comite@test.cl", personaId: "p-6", activo: true, passwordHash },
      { id: "usuario-conserjeria", email: "conserjeria@test.cl", personaId: "p-4", activo: true, passwordHash },
      { id: "usuario-residente", email: "residente@test.cl", personaId: "p-3", activo: true, passwordHash },
      { id: "usuario-mantencion", email: "mantencion@test.cl", personaId: "p-7", activo: true, passwordHash },
    ]
    for (const u of usuariosData) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { personaId: u.personaId, activo: u.activo, passwordHash: u.passwordHash },
        create: u,
      })
    }

    for (const m of membresiasData) {
      const existing = await prisma.membresia.findFirst({
        where: { usuarioId: m.usuarioId, comunidadId: m.comunidadId },
      })
      if (!existing) {
        await prisma.membresia.create({ data: m })
      } else if (existing.rol !== m.rol) {
        await prisma.membresia.update({ where: { id: existing.id }, data: { rol: m.rol } })
      }
    }

    const comunidades = await prisma.comunidad.count()
    const usuarios = await prisma.usuario.count()
    const membresias = await prisma.membresia.count()
    console.log(`Seed AU OK: ${comunidades} comunidades, ${usuarios} usuarios, ${membresias} membresías.`)
    console.log(`Login TEST: admin@test.cl / ${PASSWORD_TEST} (todos los usuarios TEST usan la misma password).`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error("[seed-authz] error", e)
  process.exit(1)
})
