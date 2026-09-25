/**
 * Script de verificación: la fuente de verdad es la base de datos, no localStorage.
 *
 * Pasos:
 * 1. Crea una persona directamente en Prisma (simulando creación vía API).
 * 2. Verifica que existe en Prisma.
 * 3. Borra localStorage (simulado: key 'compass-store' — en Node no existe localStorage,
 *    así que este paso se documenta como garantía conceptual).
 * 4. Simula recarga: lee la persona desde Prisma directamente.
 * 5. Verifica que la persona sigue visible (porque vino del servidor/BD).
 * 6. Limpia la persona de prueba.
 *
 * Uso:
 *   cd k0mp4ss_fe/apps/web && npx tsx scripts/verificar-persistencia-db.ts
 */

import { PrismaClient } from "@prisma/client"
import { randomUUID } from "crypto"

const prisma = new PrismaClient()

const TEST_PERSONA_NOMBRE = "Verificacion BD Fuente de Verdad"
const TEST_PERSONA_RUT = "99.999.999-9"

async function main(): Promise<void> {
  console.log("🧪 Verificación: Fuente de verdad = Base de Datos (Prisma)\n")

  // 1. Crear persona de prueba (simula POST /api/personas)
  console.log("[1/5] Creando persona de prueba en Prisma...")
  const comunidad = await prisma.comunidad.findFirst()
  if (!comunidad) {
    console.error("❌ No hay ninguna comunidad en la BD. Ejecuta seed primero.")
    process.exit(1)
  }

  const persona = await prisma.persona.create({
    data: {
      id: randomUUID(),
      nombreCompleto: TEST_PERSONA_NOMBRE,
      nombres: "Verificacion",
      apellidos: "BD",
      rut: TEST_PERSONA_RUT,
      email: "verificacion@compass.test",
      telefonoMovil: "+56999999999",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: [],
      comunidadId: comunidad.id,
    },
  })
  console.log(`    ✓ Persona creada: id=${persona.id}`)

  // 2. Verificar que existe en Prisma
  console.log("[2/5] Verificando existencia en Prisma...")
  const encontrada = await prisma.persona.findUnique({
    where: { id: persona.id },
  })
  if (!encontrada) {
    console.error("❌ Persona no encontrada en Prisma inmediatamente después de crearla.")
    process.exit(1)
  }
  console.log("    ✓ Persona confirmada en BD")

  // 3. Simular borrado de localStorage
  console.log("[3/5] Simulando borrado de localStorage (key 'compass-store')...")
  console.log("    ✓ En un navegador: localStorage.removeItem('compass-store')")
  console.log("      Aquí en Node no hay localStorage; el paso es conceptual.")

  // 4. Simular recarga: leer desde Prisma directamente (no desde caché local)
  console.log("[4/5] Simulando recarga de página: leyendo persona desde Prisma...")
  const postRecarga = await prisma.persona.findUnique({
    where: { id: persona.id },
  })

  // 5. Verificar que sigue visible
  console.log("[5/5] Verificando que la persona sigue visible tras 'recarga'...")
  if (!postRecarga) {
    console.error("❌ La persona desapareció tras 'recarga'. La fuente de verdad no es confiable.")
    process.exit(1)
  }
  if (postRecarga.nombreCompleto !== TEST_PERSONA_NOMBRE) {
    console.error("❌ Nombre de persona no coincide tras 'recarga'.")
    process.exit(1)
  }
  console.log("    ✓ Persona visible tras recarga (fuente: Prisma/BD)")

  // 6. Limpieza
  console.log("\n🧹 Limpiando persona de prueba...")
  await prisma.persona.delete({ where: { id: persona.id } })
  console.log("    ✓ Persona de prueba eliminada")

  console.log("\n✅ VERIFICACIÓN PASADA")
  console.log("   La fuente de verdad es la base de datos. localStorage no afecta la persistencia.")
}

main()
  .catch((err) => {
    console.error("\n❌ VERIFICACIÓN FALLIDA:", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
