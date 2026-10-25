"use client"

/**
 * ver-mas — control de «Ver más» para listados paginados (F11).
 *
 * Los hooks de colección piden `pageSize=100`, así que una lista puede quedar
 * recortada aunque existan más filas. Antes se mitigaba avisando el recorte
 * (`components/pe/aviso-truncamiento.tsx`); con `hasMore`/`cargarMas` del hook
 * el recorte se resuelve: este botón dice cuántas filas se están viendo sobre el
 * total real del servidor y pide la página siguiente.
 *
 * Reglas:
 *   - Sin recorte (`mostrados >= total`) no renderiza nada: no hay ruido.
 *   - Es un `<button>` nativo (teclado y lectores de pantalla gratis).
 *   - `cargando` deshabilita el botón para que dos clicks seguidos no pidan dos
 *     veces la misma página.
 *   - No se usa para recortes locales (`slice`) de tablas o `Select`: ahí el
 *     total no existe en el servidor y el aviso de truncamiento sigue mandando.
 */
import * as React from "react"
import { IconChevronDown, IconLoader2 } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

export interface VerMasProps {
  /** Filas efectivamente en pantalla. */
  mostrados: number
  /** Filas que existen para esa misma consulta (total del servidor). */
  total: number
  /** Hay una página siguiente en vuelo. */
  cargando?: boolean
  /** Pide la página siguiente (el `cargarMas` del hook). */
  onCargarMas: () => void | Promise<void>
  className?: string
}

export function VerMas({
  mostrados,
  total,
  cargando = false,
  onCargarMas,
  className,
}: VerMasProps) {
  if (!Number.isFinite(total) || !Number.isFinite(mostrados)) return null
  if (mostrados >= total) return null

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 px-1 py-2",
        className
      )}
    >
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Mostrando {mostrados} de {total}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void onCargarMas()}
        disabled={cargando}
        aria-busy={cargando}
      >
        {cargando ? (
          <>
            <IconLoader2 className="mr-1 size-3.5 animate-spin" aria-hidden="true" />
            Cargando…
          </>
        ) : (
          <>
            Ver más
            <IconChevronDown className="ml-1 size-3.5" aria-hidden="true" />
          </>
        )}
      </Button>
    </div>
  )
}
