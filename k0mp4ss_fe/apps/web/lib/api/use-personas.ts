"use client"

/**
 * use-personas — hooks SWR para la colección MP (BD-FUENTE-VERDAD Fase 0).
 *
 - Lectura: GET /api/personas (con ?q= opcional) y GET /api/personas/[id].
 - Escritura: POST (upsert idempotente por id), PUT parcial y DELETE contra las
   mismas rutas; cada mutación revalida las claves SWR afectadas.
 - Contrato de mutación: Promise<StoreResult> ({ ok, error? }) para poder
   intercambiarse con las acciones legacy del store zustand.
 */
import useSWR, { mutate as mutateGlobal } from "swr"
import type { Persona } from "@/data/comunidad/personas"
import type { StoreResult } from "@/lib/store"
import { normalizarRun } from "@/lib/validacion-rut"

const LISTA = "/api/personas"

/**
 * Proyección de solo lectura para la operación de conserjería (F6).
 *
 * `/api/personas` está detrás de `mp`, que la conserjería no tiene: pedirle el padrón ahí devolvía
 * 403 y la búsqueda por RUN caía al padrón local del store. Esta ruta devuelve solo identidad y se
 * gobierna con `pe:bitacora`.
 */
const LISTA_OPERACION = "/api/pe/personas"

/** Identidad mínima que devuelve la proyección de operación. */
export interface PersonaOperacion {
  id: string
  rut: string
  nombreCompleto: string
}

/** Opción del selector de residente destino. */
export interface PersonaOpcion {
  id: string
  etiqueta: string
}

interface ColeccionOperacion {
  data: PersonaOperacion[]
  pageSize: number
  total: number
}

const claveItem = (id: string) => `${LISTA}/${id}`

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as T
}

interface ColeccionPersonas {
  data: Persona[]
  page: number
  pageSize: number
  total: number
}

/** Envía una mutación y traduce la respuesta HTTP a StoreResult. */
async function enviar(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown
): Promise<StoreResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
      return { ok: false, error: cuerpo?.error ?? `Error ${res.status} al llamar ${url}.` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." }
  }
}

/** Invalida (revalida) todas las claves SWR de la colección de personas. */
function invalidarPersonas(): void {
  void mutateGlobal(
    (key) => typeof key === "string" && (key === LISTA || key.startsWith(`${LISTA}?`))
  )
}

export interface UsePersonasResultado {
  personas: Persona[]
  /**
   * Total de personas que reporta el servidor para el filtro activo.
   *
   * La lista se pide con `pageSize=100`, así que `personas.length` puede ser
   * menor que `total`: el consumidor DEBE avisar en pantalla cuando
   * `total > personas.length` en vez de truncar en silencio (ver
   * `components/pe/aviso-truncamiento.tsx`).
   */
  total: number
  isLoading: boolean
  error: Error | null
  create: (persona: Partial<Persona>) => Promise<StoreResult>
  update: (id: string, parcial: Partial<Persona>) => Promise<StoreResult>
  remove: (id: string) => Promise<StoreResult>
}

/** Lista paginada de personas, filtrable por ?q= (nombreCompleto | rut | email). */
export function usePersonas(q?: string): UsePersonasResultado {
  const url = q && q.trim() ? `${LISTA}?q=${encodeURIComponent(q.trim())}&pageSize=100` : `${LISTA}?pageSize=100`
  const { data, error, isLoading, mutate } = useSWR<ColeccionPersonas, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })

  const create = async (persona: Partial<Persona>): Promise<StoreResult> => {
    const resultado = await enviar(LISTA, "POST", persona)
    if (resultado.ok) void mutate()
    return resultado
  }

  const update = async (id: string, parcial: Partial<Persona>): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "PUT", parcial)
    if (resultado.ok) {
      void mutateGlobal(claveItem(id))
      void mutate()
    }
    return resultado
  }

  const remove = async (id: string): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "DELETE")
    if (resultado.ok) void mutate()
    return resultado
  }

  return {
    personas: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error ?? null,
    create,
    update,
    remove,
  }
}

export interface UsePersonaResultado {
  persona: Persona | undefined
  isLoading: boolean
  error: Error | null
  update: (parcial: Partial<Persona>) => Promise<StoreResult>
  remove: () => Promise<StoreResult>
}

/** Detalle de una persona por id. */
export function usePersona(id: string): UsePersonaResultado {
  const url = id ? claveItem(id) : null
  const { data, error, isLoading, mutate } = useSWR<Persona, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })

  const update = async (parcial: Partial<Persona>): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "PUT", parcial)
    if (resultado.ok) {
      void mutate()
      invalidarPersonas()
    }
    return resultado
  }

  const remove = async (): Promise<StoreResult> => {
    const resultado = await enviar(claveItem(id), "DELETE")
    if (resultado.ok) invalidarPersonas()
    return resultado
  }

  return {
    persona: data,
    isLoading,
    error: error ?? null,
    update,
    remove,
  }
}

export interface UsePersonasOperacionResultado {
  personas: PersonaOperacion[]
  /**
   * Total de personas que reporta el servidor para el scope activo.
   *
   * La lista se pide con `pageSize=100`, así que `personas.length` puede ser menor que `total`:
   * el consumidor DEBE avisar en pantalla cuando `total > personas.length` en vez de truncar en
   * silencio (ver `components/pe/aviso-truncamiento.tsx`).
   */
  total: number
  isLoading: boolean
  error: Error | null
}

/**
 * Padrón completo de personas de la operación, paginado al tope del selector.
 *
 * Pega en `GET /api/pe/personas?pageSize=100`, la proyección de solo lectura gobernada por
 * `pe:bitacora` (el padrón de `mp` le devuelve 403 a la conserjería). Mismo patrón que
 * `usePersonas`, pero sin mutaciones: los padrones de la operación son de solo lectura.
 */
export function usePersonasOperacion(): UsePersonasOperacionResultado {
  const url = `${LISTA_OPERACION}?pageSize=100`
  const { data, error, isLoading } = useSWR<ColeccionOperacion, Error>(url, fetcher, {
    revalidateOnFocus: true,
  })

  return {
    personas: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error ?? null,
  }
}

/**
 * Resuelve una persona del padrón por RUN (PE-visitas, escaneo del QR de la
 * cédula).
 *
 * Pide el filtro exacto `?rut=` de la ruta (scoping de comunidad y ABAC del
 * residente siguen viviendo en el servidor) y confirma en cliente el match
 * normalizado, porque el RUN puede estar guardado con puntos o sin ellos.
 *
 * Devuelve `null` si el padrón no tiene ese RUN; propaga el error de red/HTTP
 * para que el panel de visitas pueda caer al padrón local en vez de bloquear
 * la operación.
 */
export async function buscarPersonaPorRun(run: string): Promise<PersonaOperacion | null> {
  const canonico = normalizarRun(run)
  if (!canonico) return null
  const coleccion = await fetcher<ColeccionOperacion>(
    `${LISTA_OPERACION}?rut=${encodeURIComponent(canonico)}`
  )
  return coleccion.data.find((p) => normalizarRun(p.rut) === canonico) ?? null
}

/**
 * Busca personas para el selector de «Residente destino» de la bitácora PE (F6).
 *
 * Devuelve opciones con el nombre completo como etiqueta: es lo que ve el conserje y lo que la
 * fila del día muestra. Propaga el error para que el selector lo declare.
 */
export async function buscarPersonas(q: string): Promise<PersonaOpcion[]> {
  const termino = q.trim()
  if (!termino) return []
  const coleccion = await fetcher<ColeccionOperacion>(
    `${LISTA_OPERACION}?q=${encodeURIComponent(termino)}&pageSize=25`
  )
  return (coleccion.data ?? []).map((p) => ({ id: p.id, etiqueta: p.nombreCompleto }))
}

/**
 * Tope de la lista cerrada `?ids=` de la ruta (`MAXIMO_IDS` en
 * `app/api/pe/personas/route.ts`). Lotes mayores se parten en varias peticiones.
 */
const LOTE_NOMBRES = 50

/**
 * Resuelve los nombres completos de una lista cerrada de personas por id (F6, rótulos del día).
 *
 * Pega en `GET /api/pe/personas?ids=…` y devuelve `{ id: nombreCompleto }`. Tolerante a fallos:
 * cualquier error de red o HTTP devuelve `{}` y la fila sigue mostrando el id, como hasta hoy,
 * en vez de romper el panel. Deduplica y parte en lotes de 50 si la lista pasa el tope.
 */
export async function nombresDePersonas(ids: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unicos.length === 0) return {}

  const nombres: Record<string, string> = {}
  for (let inicio = 0; inicio < unicos.length; inicio += LOTE_NOMBRES) {
    const lote = unicos.slice(inicio, inicio + LOTE_NOMBRES)
    try {
      const coleccion = await fetcher<ColeccionOperacion>(
        `${LISTA_OPERACION}?ids=${encodeURIComponent(lote.join(","))}`
      )
      for (const p of coleccion.data ?? []) {
        nombres[p.id] = p.nombreCompleto
      }
    } catch {
      // Sin red o con error HTTP: la fila sigue mostrando el id, no se rompe la pantalla.
      return {}
    }
  }
  return nombres
}
