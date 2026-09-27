// Bootstrap AU §3 P5: seed dev de 2 comunidades + 6 usuarios TEST con passwordHash.
// Se usa en el PRIMER arranque (BD sin usuarios → Auth.js no permite login →
// fail-closed intencional). Idempotente; espejo de lib/seed-authz.ts.
// El 6to (arrendatario@test.cl) valida el perfil inquilino: login rol "residente"
// (no existe rol login arrendatario: ROLES son 5) + ficha propia con vínculo
// arrendatario vigente en comunidad-a (u-A-101, arrendada). Ver
// openspec/changes/roles-validacion-comunidad-a/cuentas-funcionales.md §2.
// Uso: npm run seed:authz   (lee .env vía --env-file-if-exists)
/* global process */
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const PASSWORD_TEST = "Test1234!"

const comunidadesData = [
  { id: "comunidad-a", nombre: "Comunidad Los Aromos TEST", slug: "los-aromos-test" },
  { id: "comunidad-b", nombre: "Comunidad Las Palmas TEST", slug: "las-palmas-test" },
]

const membresiasData = [
  // Orden intencional: el scope es la ÚLTIMA membresía por createdAt
  // (withComunidadScope, take:1). admin-a va ÚLTIMA para que el scope del
  // admin sea comunidad-a (diseño cuentas-funcionales.md §3.4). No reordenar
  // sin actualizar ese documento.
  { usuarioId: "usuario-admin", comunidadId: "comunidad-b", rol: "administrador" },
  { usuarioId: "usuario-comite", comunidadId: "comunidad-a", rol: "comite" },
  { usuarioId: "usuario-conserjeria", comunidadId: "comunidad-a", rol: "conserjeria" },
  { usuarioId: "usuario-residente", comunidadId: "comunidad-a", rol: "residente" },
  { usuarioId: "usuario-mantencion", comunidadId: "comunidad-a", rol: "mantencion" },
  // Inquilino: login rol residente (sin rol login propio), alcance comunidad-a.
  { usuarioId: "usuario-arrendatario", comunidadId: "comunidad-a", rol: "residente" },
  { usuarioId: "usuario-admin", comunidadId: "comunidad-a", rol: "administrador" },
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
      { id: "usuario-arrendatario", email: "arrendatario@test.cl", personaId: "p-arrendatario-1", activo: true, passwordHash },
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

        // Determinismo P1 (SERIE-E2E-FULL-VERDE): el scope es la ÚLTIMA
        // membresía por createdAt (withComunidadScope, take:1). El upsert de
        // arriba NO reordena filas existentes, así que restore+seed perdía
        // scope A. Esta pasada reescribe createdAt en orden canónico
        // (timestamps escalonados +1s, admin-a ÚLTIMA) — idempotente,
        // conserva id, y el desempate `id desc` nunca decide.
        const baseTs = Date.now()
        for (let i = 0; i < membresiasData.length; i++) {
          const m = membresiasData[i]
          const row = await prisma.membresia.findFirst({
            where: { usuarioId: m.usuarioId, comunidadId: m.comunidadId },
          })
          if (row) {
            await prisma.membresia.update({
              where: { id: row.id },
              data: { createdAt: new Date(baseTs + i * 1000) },
            })
          }
        }

        // Ficha del inquilino + vínculo arrendatario vigente (first-wins: no se pisa
        // si ya existe, para no clobberar ediciones manuales de validación).
        const personaArr = await prisma.persona.findUnique({ where: { id: "p-arrendatario-1" } })
        if (!personaArr) {
          await prisma.persona.create({
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
        const vincArr = await prisma.vinculoUnidad.findUnique({ where: { id: "v-arrendatario-1" } })
        if (!vincArr) {
          await prisma.vinculoUnidad.create({
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
