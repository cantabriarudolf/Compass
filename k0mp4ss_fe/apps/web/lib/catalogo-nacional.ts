/**
 * catalogo-nacional — asegura en la base los ocho catálogos del país (F46).
 *
 * Los catálogos nacionales **no son por comunidad**: la clave primaria del maestro
 * es sólo `id`, y el listado los ofrece a toda comunidad con
 * `OR [{comunidadId: la mía}, {id: {in: ids de la semilla}}]` (ver
 * `lib/maestros-nacionales.ts` y `app/api/maestros/[tipo]/route.ts`). Por eso una
 * comunidad recién creada **los ve** — pero sólo si las filas existen en la base.
 *
 * Hasta hoy las filas se creaban únicamente con `scripts/seed-catalogo-nacional.ts`,
 * que exige terminal y saber que el script existe: una base migrada y sin sembrar
 * dejaba a todo el país con AFP, salud, bancos, índices y feriados **en blanco**, y
 * sin AFP ni salud no hay liquidación, sin feriados el corte no computa el día
 * hábil y sin bancos no se concilia la cartola.
 *
 * Esta función es la fuente única que usan el script y la ruta
 * `POST /api/maestros/catalogo-nacional`. Es idempotente por id y no pisa nada:
 * `update: {}` deja la fila existente tal como está, así que no reasigna
 * `comunidadId` (que es sólo la etiqueta de quién la sembró primero), no toca los
 * maestros propios de cada comunidad y no levanta los ocultamientos (`MaestroOculto`).
 */
import type { PrismaClient } from "@prisma/client"
import {
  AFPS,
  BANCOS,
  CAJAS_FONDOS,
  FERIADOS,
  INDICES_AJUSTE,
  MUTUALES_CAJAS,
  PREVISIONES_SALUD,
  UNIDADES_MEDIDA,
} from "@/data/admin/maestros"

/**
 * Los ocho catálogos del país: tipo kebab-case (el que resuelve
 * `app/api/maestros/[tipo]/route.ts`) → filas de la semilla. Fuente única del
 * contenido: `data/admin/maestros.ts`; nada hardcodeado acá. El resto de maestros
 * (jornadas, couriers, categorías de inventario…) es propio de cada comunidad y no
 * entra a propósito.
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

/** Tipos que cubre el catálogo nacional, en el orden en que se aseguran. */
export const TIPOS_CATALOGO_NACIONAL = CATALOGOS.map((c) => c.tipo)

/**
 * Resultado del asegurado: las filas por tipo (lo que la semilla declara) y
 * `creadas`, que cuenta **sólo las filas que no existían**. La distinción importa
 * para no mentir: `update: {}` deja las existentes intactas, así que decir «38
 * aseguradas» cuando 37 ya estaban es un número que no cambia nada y confunde al
 * que lo lee (hallazgos R1-report-size y R3-reliability-3 de la revisión nativa).
 */
export interface ResultadoCatalogoNacional {
  porTipo: Map<string, number>
  creadas: number
}

/**
 * Upsert idempotente por id de los ocho catálogos. Devuelve las filas por tipo y
 * cuántas se crearon realmente.
 */
export async function asegurarCatalogoNacional(
  prisma: PrismaClient,
  comunidadId: string
): Promise<ResultadoCatalogoNacional> {
  const porTipo = new Map<string, number>(CATALOGOS.map((c) => [c.tipo, 0]))
  let creadas = 0
  for (const catalogo of CATALOGOS) {
    // SAFETY: los delegates de maestros comparten la firma upsert por id; el
    // runtime de Prisma valida el modelo contra la fila tipada de la semilla.
    const modelo = prisma[catalogo.modelo] as unknown as {
      upsert(args: {
        where: { id: string }
        update: Record<string, unknown>
        create: Record<string, unknown>
      }): Promise<unknown>
    }
    // Cuántas de estas filas ya existen: el resto es lo que este POST creó.
    const existentes = await (
      prisma[catalogo.modelo] as unknown as {
        findMany(args: {
          where: { id: { in: string[] } }
          select: { id: true }
        }): Promise<{ id: string }[]>
      }
    ).findMany({
      where: { id: { in: catalogo.filas.map((f) => f.id) } },
      select: { id: true },
    })
    creadas += catalogo.filas.length - existentes.length

    for (const fila of catalogo.filas) {
      // SAFETY: las filas de la semilla son uniones literales por catálogo; el
      // spread sólo necesita la forma genérica y Prisma valida los campos.
      const datos = fila as unknown as Record<string, unknown>
      await modelo.upsert({
        where: { id: fila.id },
        // Global por id: si la fila ya existe (sembrada por otra comunidad o por
        // una corrida anterior) se deja tal cual, sin reasignar comunidadId.
        update: {},
        create: { ...datos, comunidadId },
      })
    }
    porTipo.set(catalogo.tipo, catalogo.filas.length)
  }
  return { porTipo, creadas }
}
