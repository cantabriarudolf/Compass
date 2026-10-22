"use client"

/**
 * aviso-truncamiento — declara en pantalla cuando una lista de opciones está
 * recortada (saneamiento de truncamientos silenciosos).
 *
 * Los selects de personas y unidades recortan la lista para no montar cientos
 * de `SelectItem`, y varios hooks paginan con `pageSize=100` por defecto. El
 * límite está bien; el problema es que el usuario no se enteraba y podía
 * registrar una visita o una encomienda contra la unidad equivocada, o creer
 * que una persona no existe.
 *
 * Regla fija: si hay más registros de los que se muestran, el usuario tiene
 * que verlo. No se sube el límite ni se reescriben los selects como búsqueda
 * server-side.
 *
 * Tono: no hay `alert` en `@workspace/ui`, así que se usa el aviso inline
 * ámbar que ya es convención del repo (ver `app/operaciones/proveedores/page.tsx`
 * y `components/comunidad/formulario-vinculo.tsx`) con los iconos de Tabler.
 */
import * as React from "react"
import { IconInfoCircle } from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"

/** Cantidad máxima de opciones que se montan en un `Select` de personas/unidades. */
export const LIMITE_SELECT = 100

export function AvisoTruncamiento({
  mostrados,
  total,
  className,
}: {
  /** Filas efectivamente renderizadas en la lista. */
  mostrados: number
  /** Filas que existen (o que reporta el servidor) para esa misma lista. */
  total: number
  className?: string
}) {
  if (!Number.isFinite(total) || !Number.isFinite(mostrados)) return null
  if (total <= mostrados) return null

  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs leading-snug text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
        className
      )}
    >
      <IconInfoCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        Mostrando {mostrados} de {total} — refiná la búsqueda para ver el resto.
      </span>
    </p>
  )
}
