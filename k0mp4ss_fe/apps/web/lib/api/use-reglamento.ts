"use client"

/**
 * use-reglamento — versión del reglamento que gobierna el cobro del gasto común
 * (T4, cobro-gastos-comunes-parametrico S1/S3).
 *
 * Lectura: `GET /api/reglamento` devuelve la versión vigente del período (por
 * defecto, el mes en curso). El 404 del servidor **no** es un fallo de lectura:
 * es «la comunidad todavía no declaró», el estado que bloquea la emisión (S1),
 * así que el hook lo entrega como `version: null` en vez de error.
 *
 * Alta: `POST /api/reglamento` declara una versión nueva. Es append-only —no hay
 * PUT ni DELETE— y `id`/`version` los asigna el servidor, así que el hook manda
 * el cuerpo tal cual lo trae la pantalla (`NuevaVersionReglamento`). S9 (F35 A4):
 * ese cuerpo apunta al `Documento` legal del archivo (`documentoId`) y ya no
 * lleva una referencia de acta suelta; el servidor responde 400 si el documento
 * falta, no existe en la comunidad o no es legal.
 *
 * Contrato: `StoreResult`, el mismo del store y de los hooks vecinos, que es lo
 * que la página ya sabe manejar.
 */
import useSWR from "swr"
import { postAccion } from "./use-crud-collection"
import type { NuevaVersionReglamento, VersionReglamento } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

const BASE = "/api/reglamento"

async function fetcher(url: string): Promise<VersionReglamento | null> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (res.status === 404) return null
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(
      cuerpo?.error ?? `Error ${res.status} al consultar el reglamento.`
    )
  }
  return (await res.json()) as VersionReglamento
}

export interface ReglamentoHook {
  /** Versión que rige el período; `null` = todavía no hay ninguna declarada. */
  version: VersionReglamento | null
  isLoading: boolean
  /** Error de LECTURA. «Sin versión declarada» no es error: es `version: null`. */
  error: Error | null
  declararVersion: (nueva: NuevaVersionReglamento) => Promise<StoreResult>
}

export function useReglamento(periodo?: string): ReglamentoHook {
  const url = periodo ? `${BASE}?periodo=${encodeURIComponent(periodo)}` : BASE
  const { data, error, isLoading } = useSWR<VersionReglamento | null, Error>(
    url,
    fetcher,
    { revalidateOnFocus: true }
  )

  // `postAccion` ya revalida `/api/reglamento` (y sus variantes con `?periodo`),
  // así que la lectura se refresca sola con la versión recién declarada.
  const declararVersion = (nueva: NuevaVersionReglamento): Promise<StoreResult> =>
    postAccion(BASE, nueva)

  return {
    version: data ?? null,
    isLoading,
    error: error ?? null,
    declararVersion,
  }
}
