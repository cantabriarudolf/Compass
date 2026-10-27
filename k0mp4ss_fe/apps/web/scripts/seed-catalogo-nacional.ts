#!/usr/bin/env -S npx tsx
/**
 * seed-catalogo-nacional — asegura los ocho catálogos del país (F20 fase 2)
 * en TODAS las comunidades de la BD, no sólo la comunidad destino.
 *
 * Problema que ataca: `seed-db-from-mocks` siembra los maestros nacionales
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
import {
  AFPS,
  BANCOS,
  CAJAS_FONDOS,
  FERIADOS,
  INDICES_AJUSTE,
  MUTUALES_CAJAS,
  PREVISIONES_SALUD,
  UNIDADES_MEDIDA,
} from "../data/admin/maestros"

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

/**
 * Los ocho catálogos del país: tipo kebab-case (el mismo que resuelve
 * `app/api/maestros/[tipo]/route.ts` y `CATALOGOS_NACIONALES`) → filas de la
 * semilla. Fuente única del contenido: `data/admin/maestros.ts`; nada
 * hardcodeado acá. El resto de maestros (jornadas, couriers, categorías de
 * inventario...) NO está acá a propósito: es propio de la comunidad.
 */
const CATALOGOS = [
  { tipo: "bancos", filas: BANCOS, modelo: "banco" },
  { tipo: "afps", filas: AFPS, modelo: "afp" },
  { tipo: "previsiones-salud", filas: PREVISIONES_SALUD, modelo: "previsionSalud" },
  { tipo: "mutuales-cajas", filas: MUTUALES_CAJAS, modelo: "mutualCaja" },
  { tipo: "feriados", filas: FERIADOS, modelo: "feriado" },
  { tipo: "indices-ajuste", filas: INDICES_AJUSTE, modelo: "indiceAjuste" },
  { tipo: "cajas-fondos", filas: CAJAS_FONDOS, modelo: "cajaFondo" },
  { tipo: "unidades-medida", filas: UNIDADES_MEDIDA, modelo: "unidadMedida" },
] as const

/**
 * Upsert idempotente por id de los ocho catálogos para una comunidad.
 * Devuelve los tipos asegurados con su cantidad de filas.
 */
export async function asegurarCatalogoNacional(
  prisma: PrismaClient,
  comunidadId: string
): Promise<Map<string, number>> {
  const porTipo = new Map<string, number>(CATALOGOS.map((c) => [c.tipo, 0]))
  for (const catalogo of CATALOGOS) {
    // SAFETY: delegates de maestros comparten la firma upsert por id; el
    // runtime de Prisma valida el modelo contra la fila tipada de la semilla.
    const modelo = prisma[catalogo.modelo] as unknown as {
      upsert(args: {
        where: { id: string }
        update: Record<string, unknown>
        create: Record<string, unknown>
      }): Promise<unknown>
    }
    for (const fila of catalogo.filas) {
      // SAFETY: las filas de la semilla son uniones literales por catálogo; el
      // spread sólo necesita la forma genérica y Prisma valida los campos.
      const datos = fila as unknown as Record<string, unknown>
      await modelo.upsert({
        where: { id: fila.id },
        // El catálogo es global por id: si la fila ya existe (sembrada antes
        // por otra comunidad o por una corrida anterior) se deja tal cual.
        update: {},
        create: { ...datos, comunidadId },
      })
    }
    porTipo.set(catalogo.tipo, catalogo.filas.length)
  }
  return porTipo
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
