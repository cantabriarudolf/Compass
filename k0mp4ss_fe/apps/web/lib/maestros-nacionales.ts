/**
 * maestros-nacionales — catálogos del país que se ofrecen a toda comunidad (F20).
 *
 * Fase 1 (decisión del owner 2026-10-26): los ocho catálogos nacionales se
 * OFRECEN con opción de ocultar o agregar; son de SOLO LECTURA (el servidor
 * corta con 403 todo PUT/DELETE sobre una fila nacional) y el ocultamiento es
 * una fila aparte en `MaestroOculto` (la nacional nunca se modifica).
 *
 * LOS IDS SALEN DE LA SEMILLA: se resuelven contra las listas de
 * `data/admin/maestros.ts`, las mismas que siembra `scripts/seed-db-from-mocks.ts`
 * (upsert idempotente por id determinista: afp-habitat, banco-estado, f-1, etc.).
 * Nada está hardcodeado acá: si la semilla cambia, `esNacional` cambia con ella.
 *
 * FASE 2 (diferida, ver F20): movería estas filas a una tabla global compartida
 * (sin comunidadId) para que dejen de duplicarse por comunidad; entonces este
 * módulo resolvería contra esa tabla en vez de las listas de semilla.
 */
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
 * Los ocho tipos kebab-case con catálogo nacional, los mismos que resuelve
 * `app/api/maestros/[tipo]/route.ts` (MODELOS_MAESTRO). El resto de colecciones
 * (categorías de inventario, jornadas, couriers, ...) sigue siendo propio de la
 * comunidad: se edita y se borra como siempre.
 */
export const CATALOGOS_NACIONALES = [
  "bancos",
  "afps",
  "previsiones-salud",
  "mutuales-cajas",
  "feriados",
  "indices-ajuste",
  "cajas-fondos",
  "unidades-medida",
] as const

export type TipoNacional = (typeof CATALOGOS_NACIONALES)[number]

/** Mensaje estándar del guard 403 sobre una fila nacional (PUT/DELETE). */
export const MENSAJE_NACIONAL_PROTEGIDO =
  "Es un catálogo nacional: podés ocultarlo o agregar una entrada propia, no editarlo."
/** Mensaje estándar del guard 403 de borrado sobre una fila nacional. */
export const MENSAJE_NACIONAL_NO_BORRABLE =
  "Es un catálogo nacional: podés ocultarlo o agregar una entrada propia, no borrarlo."

/** Ids de la semilla por tipo: fuente única de verdad del catálogo nacional. */
const IDS_NACIONALES = {
  bancos: BANCOS.map((b) => b.id),
  afps: AFPS.map((a) => a.id),
  "previsiones-salud": PREVISIONES_SALUD.map((p) => p.id),
  "mutuales-cajas": MUTUALES_CAJAS.map((m) => m.id),
  feriados: FERIADOS.map((f) => f.id),
  "indices-ajuste": INDICES_AJUSTE.map((i) => i.id),
  "cajas-fondos": CAJAS_FONDOS.map((c) => c.id),
  "unidades-medida": UNIDADES_MEDIDA.map((u) => u.id),
} satisfies Record<TipoNacional, readonly string[]>

/** ¿El tipo de colección admite ocultamiento (es catálogo nacional)? */
export function esTipoNacional(tipo: string): tipo is TipoNacional {
  return (CATALOGOS_NACIONALES as readonly string[]).includes(tipo)
}

/**
 * Los ids de la semilla para un tipo de catálogo nacional ([] en un tipo que
 * no lo es). El padre del catálogo es el `id`: el país es uno solo igual para
 * todas las comunidades (ver cómo lo compone `app/api/maestros/[tipo]/route.ts`).
 */
export function idsNacionales(tipo: string): readonly string[] {
  if (!esTipoNacional(tipo)) return []
  return IDS_NACIONALES[tipo]
}

/**
 * ¿La fila (tipo, id) pertenece al catálogo nacional de la semilla?
 * Falso para tipos no nacionales y para cualquier id que la semilla no siembre:
 * una entrada creada por el administrador nunca es nacional (los ids de la
 * semilla tienen espacio de nombre propio: afp-habitat, banco-estado, f-1...).
 */
export function esNacional(tipo: string, id: string): boolean {
  if (!esTipoNacional(tipo)) return false
  return IDS_NACIONALES[tipo].includes(id)
}
