"use client"

/**
 * use-directorio-emergencias — lectura del directorio de emergencias de la
 * comunidad (`/api/comunidad/directorio`, recurso `pe:directorio` ver).
 *
 * Existe porque el directorio NO se lee del maestro administrativo: ese maestro
 * (`/api/maestros/contactos-emergencia`) se gatea con `mp`, el permiso de todos
 * los maestros administrativos, y conserjería, residente y mantención no lo
 * tienen — leían 403 y veían el directorio vacío. La lectura angosta tiene su
 * propia puerta y su propio hook, y es SOLO lectura: administrar los contactos
 * sigue siendo un acto del administrador por el maestro (`useMaestros`).
 */
import useSWR from "swr"
import type { ContactoEmergencia } from "@/lib/schemas"

/** Puerta de lectura angosta: devuelve únicamente los contactos de emergencia. */
export const URL_DIRECTORIO_EMERGENCIAS = "/api/comunidad/directorio"

interface RespuestaDirectorio {
  data: ContactoEmergencia[]
  total: number
}

async function fetcher(url: string): Promise<RespuestaDirectorio> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as RespuestaDirectorio
}

export interface UseDirectorioEmergenciasResultado {
  data: ContactoEmergencia[]
  isLoading: boolean
  /** Error de la lectura: la pantalla lo dice en vez de pintar una tarjeta vacía. */
  error: Error | null
  /** Reintenta la lectura (botón «Reintentar» del estado de error). */
  refetch: () => void
}

export function useDirectorioEmergencias(): UseDirectorioEmergenciasResultado {
  const { data, error, isLoading, mutate } = useSWR<RespuestaDirectorio, Error>(
    URL_DIRECTORIO_EMERGENCIAS,
    fetcher,
    { revalidateOnFocus: true }
  )

  return {
    data: data?.data ?? [],
    isLoading,
    error: error ?? null,
    refetch: () => {
      void mutate()
    },
  }
}
