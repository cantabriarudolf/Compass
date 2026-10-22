"use client"

/**
 * use-certificados-ct — hooks SWR para certificados CT (BD-FUENTE-VERDAD Fase 5A).
 *
 * `create` no sale del `useCrudCollection` genérico porque el alta de un
 * certificado tiene un contrato extra: el folio `CT-####` y el código de
 * verificación los asigna el SERVIDOR, en una transacción por comunidad
 * (auditoría "funciones de palo" 2026-10-23 — antes se calculaban en el cliente
 * con `max+1` y dos pestañas emitían el mismo folio). El cliente, entonces, no
 * manda folio: necesita de vuelta el registro emitido para armar el PDF con el
 * folio y el código reales, en vez de inventarlos.
 */
import * as React from "react"
import { mutate as mutateGlobal } from "swr"
import { useCrudCollection, type CrudCollection } from "./use-crud-collection"
import type { CertificadoCT, CertificadoCTAlta } from "@/lib/schemas"
import type { StoreResult } from "@/lib/store"

const BASE = "/api/certificados-ct"

/** Resultado del alta: `ok` + el registro que devolvió el servidor (folio real). */
export type AltaCertificadoCT = StoreResult & { registro?: CertificadoCT }

export interface CertificadosCTCollection
  extends Omit<CrudCollection<CertificadoCT>, "create"> {
  /** Alta con folio/código asignados por el servidor. */
  create: (datos: CertificadoCTAlta) => Promise<AltaCertificadoCT>
}

export function useCertificadosCT(): CertificadosCTCollection {
  const coleccion = useCrudCollection<CertificadoCT>(BASE)

  const create = React.useCallback(
    async (datos: CertificadoCTAlta): Promise<AltaCertificadoCT> => {
      try {
        const res = await fetch(BASE, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(datos),
        })
        const cuerpo = (await res.json().catch(() => null)) as
          | (CertificadoCT & { error?: string })
          | null
        if (!res.ok) {
          return {
            ok: false,
            error: cuerpo?.error ?? `Error ${res.status} al emitir el certificado.`,
          }
        }
        // El servidor es la fuente del folio: revalidamos la colección para que
        // el historial muestre el número real.
        void mutateGlobal(
          (key) =>
            typeof key === "string" && (key === BASE || key.startsWith(`${BASE}?`))
        )
        return { ok: true, ...(cuerpo ? { registro: cuerpo } : {}) }
      } catch {
        return { ok: false, error: "Sin conexión con el servidor." }
      }
    },
    []
  )

  return { ...coleccion, create }
}
