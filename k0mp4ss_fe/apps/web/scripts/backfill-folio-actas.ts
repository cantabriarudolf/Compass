#!/usr/bin/env -S npx tsx
/**
 * backfill-folio-actas — folia las actas GD que todavía no tienen folio
 * (Ley 21.442, art. 15: libro de actas foliado).
 *
 * La columna `folio` es aditiva y nullable (migración `add_actas_gd_folio`), así
 * que las actas históricas quedan en NULL cuando se despliega. Este script les
 * asigna el folio que les corresponde **sin tocar** las que ya lo tienen: el
 * folio, una vez asignado, es la cita del acta y renumerarlo rompería la cita.
 *
 * Reglas (las mismas del POST `/api/actas-gd`, `app/api/actas-gd/_folio.ts`):
 *   - formato `AD-<año>-<correlativo de 4 dígitos>`, año tomado de la fecha del acta;
 *   - correlativo por comunidad y año, continuando desde el mayor ya emitido;
 *   - orden de asignación dentro de la comunidad: fecha, después createdAt e id
 *     (el acta más antigua recibe el número más bajo del libro).
 *
 * Idempotente por construcción: sólo lee filas con `folio IS NULL` y escribe con
 * un `updateMany` condicionado a `folio IS NULL`, así que correrlo dos veces no
 * cambia ni una fila la segunda vez. Tampoco reescribe metadatos (`updatedAt`
 * avanza sólo en las filas que efectivamente se folian).
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npx vite-node scripts/backfill-folio-actas.ts             # escribe
 *   npx vite-node scripts/backfill-folio-actas.ts --dry-run   # sólo muestra
 *   npx vite-node scripts/backfill-folio-actas.ts --comunidad-id=xxx
 *
 * Nunca borra ni renumera: si una fila quedó sin folio, se resuelve en la
 * siguiente corrida.
 */
/* global process */
import { cargarUrlBase } from "../lib/database-url"
import { PrismaClient } from "@prisma/client"
import { anioDeFecha, siguienteFolioActa } from "../app/api/actas-gd/_folio"

/** Intentos por fila antes de dejarla para la siguiente corrida. */
const MAX_INTENTOS = 2

function leerFlag(prefijo: string): string | null {
  const flag = process.argv.find((arg) => arg.startsWith(`${prefijo}=`))
  return flag ? flag.slice(prefijo.length + 1).trim() || null : null
}

/** ¿El error es la colisión del índice único `(comunidadId, folio)`? */
function esConflictoDeFolio(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  )
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run")
  const comunidadId = leerFlag("--comunidad-id")

  const prisma = new PrismaClient({ datasourceUrl: cargarUrlBase() })
  try {
    const pendientes = await prisma.actaGD.findMany({
      where: { ...(comunidadId ? { comunidadId } : {}), folio: null },
      orderBy: [
        { comunidadId: "asc" },
        { fecha: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
      select: { id: true, comunidadId: true, fecha: true },
    })

    if (pendientes.length === 0) {
      console.log(
        "Backfill folio de actas: nada que hacer — todas las actas ya tienen folio (0 filas tocadas)."
      )
      return
    }

    // Folios ya emitidos, por comunidad: el backfill continúa desde el mayor.
    const emitidos = await prisma.actaGD.findMany({
      where: { folio: { not: null }, ...(comunidadId ? { comunidadId } : {}) },
      select: { comunidadId: true, folio: true },
    })
    const foliosPorComunidad = new Map<string, string[]>()
    for (const fila of emitidos) {
      if (!fila.folio) continue
      const lista = foliosPorComunidad.get(fila.comunidadId) ?? []
      lista.push(fila.folio)
      foliosPorComunidad.set(fila.comunidadId, lista)
    }

    console.log(
      `Backfill folio de actas: ${pendientes.length} acta(s) sin folio${dryRun ? " (dry-run: no se escribe nada)" : ""}.`
    )

    let asignados = 0
    let omitidos = 0
    for (const acta of pendientes) {
      const lista = foliosPorComunidad.get(acta.comunidadId) ?? []
      let folio = siguienteFolioActa(lista, anioDeFecha(acta.fecha))

      if (dryRun) {
        console.log(`${acta.id} → ${folio}`)
        lista.push(folio)
        foliosPorComunidad.set(acta.comunidadId, lista)
        asignados++
        continue
      }

      let escrito = false
      for (let intento = 1; intento <= MAX_INTENTOS && !escrito; intento++) {
        try {
          // Condicionado a `folio: null`: si otra escritura ya folió la fila,
          // este update no toca nada y el folio existente se respeta.
          const res = await prisma.actaGD.updateMany({
            where: { id: acta.id, folio: null },
            data: { folio },
          })
          if (res.count === 1) {
            escrito = true
            lista.push(folio)
            foliosPorComunidad.set(acta.comunidadId, lista)
            asignados++
            console.log(`${acta.id} → ${folio}`)
            break
          }
        } catch (e) {
          if (!esConflictoDeFolio(e)) throw e
          // Otra alta tomó el número entre la lectura y la escritura: se
          // recomputa desde los folios reales de la comunidad.
          const actuales = await prisma.actaGD.findMany({
            where: { comunidadId: acta.comunidadId, folio: { not: null } },
            select: { folio: true },
          })
          lista.length = 0
          for (const fila of actuales) if (fila.folio) lista.push(fila.folio)
          foliosPorComunidad.set(acta.comunidadId, lista)
          folio = siguienteFolioActa(lista, anioDeFecha(acta.fecha))
        }
      }
      if (!escrito) {
        omitidos++
        console.log(`${acta.id}: no se pudo asignar folio en esta corrida (se reintenta en la siguiente).`)
      }
    }

    console.log(
      `Backfill folio de actas: ${asignados} acta(s) foliada(s), ${omitidos} omitida(s).`
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e: unknown) => {
  console.error(
    "Backfill folio de actas: falló —",
    e instanceof Error ? e.message : e
  )
  process.exitCode = 1
})
