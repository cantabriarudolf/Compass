"use client"

/** use-cv — hooks SWR para el Visor de Mensajes CV (Fase 4). */
import useSWR from "swr"
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { AvisoCV, PlantillaCV, PublicacionActaCV } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"
import { hoyISO } from "@/lib/date-utils"

const ACTAS_PUBLICADAS = "/api/cv/actas"

export function useAvisosCV(): CrudCollection<AvisoCV> {
  return useCrudCollection<AvisoCV>("/api/cv/avisos")
}

export function usePlantillasCV(): CrudCollection<PlantillaCV> {
  return useCrudCollection<PlantillaCV>("/api/cv/plantillas")
}

/**
 * avisosVencidos — avisos publicados cuyo `expiresAt` ya pasó (regla de la
 * caducidad del visor). Misma semántica que la acción legacy
 * `caducarAvisosCV` del store (`estado === "publicado"` + `expiresAt < hoy`);
 * el archivado lo hace el llamador con `update` del hook, contra
 * `PUT /api/cv/avisos/[id]` (contrato ya existente, igual que
 * `app/comunidad/visor`).
 */
export function avisosVencidos(items: AvisoCV[], hoy: string = hoyISO()): AvisoCV[] {
  return items.filter(
    (a) =>
      a.estado === "publicado" &&
      a.expiresAt !== undefined &&
      a.expiresAt !== "" &&
      a.expiresAt < hoy
  )
}

export interface UseActasPublicadasCVResultado {
  publicaciones: PublicacionActaCV[]
  /** Texto obligatorio de la vista general (lo dicta el servidor). */
  textoInformativo: string
  isLoading: boolean
  error: Error | null
  /** Publica la REFERENCIA del acta (idempotente: republicar no duplica). */
  publicar: (actaId: string) => Promise<StoreResult>
  /** Revierte la visibilidad y audita quién/cuándo. */
  despublicar: (actaId: string) => Promise<StoreResult>
}

async function publicarActa(url: string, method: "POST", body: unknown): Promise<StoreResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
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

/**
 * useActasPublicadasCV — actas GD publicadas en el visor POR REFERENCIA
 * (SERIE-FASE2 §V6). El servidor devuelve solo lo publicado y, si el rol es
 * residente, exige `residenteVeActas` vigente; acá no hay copia del acta, solo
 * la referencia y la vista general informativa.
 */
export function useActasPublicadasCV(): UseActasPublicadasCVResultado {
  const { data, error, isLoading, mutate } = useSWR<{
    data: PublicacionActaCV[]
    textoInformativo: string
    total: number
  }>(ACTAS_PUBLICADAS, async (url: string) => {
    const res = await fetch(url, { headers: { accept: "application/json" } })
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
    }
    return (await res.json()) as {
      data: PublicacionActaCV[]
      textoInformativo: string
      total: number
    }
  })

  const publicar = async (actaId: string): Promise<StoreResult> => {
    const resultado = await publicarActa(ACTAS_PUBLICADAS, "POST", { actaId })
    if (resultado.ok) void mutate()
    return resultado
  }

  const despublicar = async (actaId: string): Promise<StoreResult> => {
    const resultado = await publicarActa(
      `${ACTAS_PUBLICADAS}/${encodeURIComponent(actaId)}/despublicar`,
      "POST",
      {}
    )
    if (resultado.ok) void mutate()
    return resultado
  }

  return {
    publicaciones: data?.data ?? [],
    textoInformativo: data?.textoInformativo ?? "",
    isLoading,
    error: error ?? null,
    publicar,
    despublicar,
  }
}
