#!/usr/bin/env -S npx tsx
/**
 * seed-catalogo-nacional — asegura los ocho catálogos del país (F20 fase 2)
 * en TODAS las comunidades de la BD, no sólo la comunidad destino.
 *
 * Problema que ataca: `seed-db-from-data` siembra los maestros nacionales
 * sólo para la comunidad destino, así que (a) si la semilla incorpora un banco
 * nuevo, las comunidades existentes quedan con la copia vieja y nada lo
 * detecta, y (b) una comunidad nueva depende de que alguien se acuerde de
 * sembrarla. Este script recorre la base y hace upsert idempotente por id de
 * los ocho catálogos nacionales con la definición única de
 * `data/admin/maestros.ts` (la misma que resuelve `lib/maestros-nacionales.ts`).
 *
 * El catálogo nacional es GLOBAL por id: la clave primaria del maestro es
 * sólo `id`, así que `banco-estado` puede existir una sola vez en toda la base
 * y lo leen todas las comunidades (la ruta compone el where con
 * `lib/maestros-nacionales.ts`). Por eso el upsert sólo ASEGURA la existencia
 * (`update: {}`): no reasigna `comunidadId`, que queda como la etiqueta de la
 * primera comunidad que sembró la fila y ya no decide quién la ve.
 *
 * Qué hace y qué NO hace:
 *   - upsert idempotente por id: correr 2× no duplica ni cambia nada.
 *   - NO borra filas ni toca maestros que no son nacionales, ni las filas
 *     ocultadas (`MaestroOculto`): el ocultamiento es una marca aparte y
 *     resembrar el catálogo no la levanta.
 *
 * Uso (desde k0mp4ss_fe/apps/web):
 *   npm run db:catalogo-nacional [-- --comunidad-id=xxx]
 *
 * Alcance: todas las Comunidades de la BD. Con `--comunidad-id` (flag o env
 * `COMUNIDAD_ID`) sólo esa; la flag no crea la comunidad. Sin comunidades en
 * la base, sale con aviso y exit 0: no es un error que un local esté vacío.
 */
/* global process */
import { cargarUrlBase } from "../lib/database-url"

import { PrismaClient } from "@prisma/client"
import { asegurarCatalogoNacional } from "../lib/catalogo-nacional"

// El test del script importa la función desde acá: se reexporta la MISMA
// implementación que usa la ruta (no hay dos versiones del upsert).
export { asegurarCatalogoNacional }

function resolverComunidadId(): string | null {
  const flag = process.argv
    .find((a) => a.startsWith("--comunidad-id="))
    ?.slice("--comunidad-id=".length)
    ?.trim()
  if (flag) return flag
  const env = process.env.COMUNIDAD_ID?.trim()
  if (env) return env
  return null
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    datasourceUrl: cargarUrlBase(),
  })
  try {
    const comunidadId = resolverComunidadId()
    const comunidades = comunidadId
      ? await prisma.comunidad.findMany({
          where: { id: comunidadId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      : await prisma.comunidad.findMany({
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })

    if (comunidades.length === 0) {
      if (comunidadId) {
        throw new Error(`La comunidad "${comunidadId}" no existe en la BD.`)
      }
      console.log(
        "[catalogo-nacional] la BD no tiene comunidades: nada que asegurar. Se sembrará cuando exista la primera."
      )
      return
    }

    let total = 0
    for (const comunidad of comunidades) {
      const porTipo = await asegurarCatalogoNacional(prisma, comunidad.id)
      const filas = [...porTipo.values()].reduce((a, b) => a + b, 0)
      total += filas
      const detalle = [...porTipo.entries()]
        .map(([tipo, n]) => `${tipo}=${n}`)
        .join(", ")
      console.log(
        `[catalogo-nacional] ok comunidad=${comunidad.id} filas=${filas} (${detalle})`
      )
    }
    console.log(
      `[catalogo-nacional] total filas aseguradas=${total} en ${comunidades.length} comunidades. No se tocó ningún maestro propio ni filas ocultadas.`
    )
  } finally {
    await prisma.$disconnect()
  }
}

// `main()` sólo cuando se corre como script: al importarlo desde un test no debe
// conectarse ni salir con exit (vitest define VITEST).
if (!process.env.VITEST) {
  main().catch((e: unknown) => {
    console.error("[catalogo-nacional] error:", e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
