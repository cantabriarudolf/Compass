"use client"

/**
 * use-avisos-cobro — el aviso de cobro en la app (F27).
 *
 * Lectura (`useAvisosCobro`): la ruta devuelve las filas con su `contenido`
 * CONGELADO y con `hash` ya calculada por el servidor. El hash no se calcula
 * acá a propósito: `lib/aviso-cobro` es de servidor (crypto + Prisma) y el
 * builder del PDF lo exige como parámetro del caller (ver `lib/pdf-utils`).
 * El alcance lo decide el servidor: el residente recibe solo los avisos de las
 * unidades donde tiene vínculo vigente.
 *
 * Acciones (`emitirAvisosCobro`, `entregarAvisoCobro`): son del ADMINISTRADOR
 * (`fi:gasto_comun`). Se separan a propósito porque también son dos momentos
 * distintos del papel: emitir lo congela una sola vez y entregar es un hecho
 * posterior y repetible. `postAccion` invalida la colección, así que la lista
 * del residente se refresca sin que la pantalla lo pida.
 */
import { useServerCollection } from "./use-server-collection"
import { postAccion } from "./use-crud-collection"
import type { AvisoCobro } from "@/lib/schemas"

/** Proyección de CF que el papel imprime (identidad, responsable y firma). */
export interface AvisoCobroDocumento {
  nombreComunidad: string
  direccionOficial: string
  rutComunidad: string
  administradorResponsable: string
  rutAdministrador: string
  firmaDigitalizadaUrl: string | null
}

/** La fila guardada + la huella de su contenido congelado. */
export interface AvisoCobroListado extends AvisoCobro {
  hash: string
}

export interface AvisosCobroRespuesta {
  data: AvisoCobroListado[]
  page: number
  pageSize: number
  total: number
  /** `null` = la comunidad no tiene CF: sin ella no hay papel que imprimir. */
  documento: AvisoCobroDocumento | null
}

export interface UseAvisosCobro {
  avisos: AvisoCobroListado[]
  documento: AvisoCobroDocumento | null
  total: number
  isLoading: boolean
  error: Error | null
}

const BASE = "/api/avisos-cobro"

export function useAvisosCobro(): UseAvisosCobro {
  const { data, error, isLoading } = useServerCollection<AvisosCobroRespuesta>(
    `${BASE}?pageSize=100`
  )
  return {
    avisos: data?.data ?? [],
    documento: data?.documento ?? null,
    total: data?.total ?? 0,
    isLoading,
    error: error ?? null,
  }
}

/** Resultado de emitir: los avisos que el servidor realmente creó. */
export interface EmitirAvisosResultado {
  ok: boolean
  error?: string
  avisos: AvisoCobro[]
}

/** Estado de un canal en la entrega (`entregado` en el visor, `pendiente` el correo). */
export interface CanalEntregaResultado {
  canal: "visor" | "email"
  estado: string
  motivo?: string
}

export interface EntregarAvisoResultado {
  ok: boolean
  error?: string
  folio?: string
  mensaje?: string
  canales?: {
    visor?: CanalEntregaResultado
    email?: CanalEntregaResultado
  }
}

/**
 * Emite los avisos de un período YA emitido en gasto común. El servidor es
 * quien decide: 409 si el período no tiene emisión o ya tiene aviso, 400 si los
 * totales de comunidad no son computables. La UI muestra ese motivo tal cual.
 */
export async function emitirAvisosCobro(
  periodo: string
): Promise<EmitirAvisosResultado> {
  const r = await postAccion(BASE, { periodo })
  if (!r.ok) return { ok: false, error: r.error, avisos: [] }
  const cuerpo = r.data as { avisos?: AvisoCobro[] } | null
  return { ok: true, avisos: cuerpo?.avisos ?? [] }
}

/** Entrega explícita de UN aviso al propietario vigente (nunca automática). */
export async function entregarAvisoCobro(
  avisoId: string
): Promise<EntregarAvisoResultado> {
  const r = await postAccion(`${BASE}/${avisoId}/entrega`, {})
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, ...(r.data as Omit<EntregarAvisoResultado, "ok">) }
}
