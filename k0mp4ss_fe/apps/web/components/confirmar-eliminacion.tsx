"use client"

/**
 * confirmar-eliminacion — diálogo de confirmación reutilizable para bajas.
 *
 * Cada pantalla armaba su propio `AlertDialog` (o, peor, borraba directo al
 * click) y el repo terminó con dos patrones distintos. Este componente fija uno
 * solo: título con la entidad concreta y una consecuencia obligatoria que dice
 * qué se pierde. No se admite un «¿estás seguro?» vacío: `consecuencia` es
 * requerida en la API.
 *
 * No maneja la llamada de red: sólo avisa con `onConfirmar`. Quien lo monta
 * decide cuándo cerrar (por eso el click de confirmar no cierra el diálogo) y
 * pasa `ocupado` mientras el DELETE está en vuelo, para que un doble click no
 * dispare dos bajas.
 */
import * as React from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"

export interface ConfirmarEliminacionProps {
  /** Controla la visibilidad: el padre la cierra al terminar la baja o al cancelar. */
  abierto: boolean
  /** Nombre concreto de lo que se elimina (no un genérico «este registro»). */
  titulo: string
  /** Qué se pierde al confirmar. Obligatorio: el diálogo nunca pregunta en el vacío. */
  consecuencia: string
  /** Texto del botón destructivo. */
  etiquetaConfirmar?: string
  /** El usuario confirmó: acá empieza la baja, que ejecuta el padre. */
  onConfirmar: () => void
  /** El usuario cerró el diálogo sin confirmar (Cancelar o Escape). */
  onCancelar: () => void
  /** Hay una baja en vuelo: el botón de confirmar queda deshabilitado. */
  ocupado?: boolean
}

export function ConfirmarEliminacion({
  abierto,
  titulo,
  consecuencia,
  etiquetaConfirmar = "Eliminar",
  onConfirmar,
  onCancelar,
  ocupado = false,
}: ConfirmarEliminacionProps) {
  return (
    <AlertDialog
      open={abierto}
      onOpenChange={(siguiente) => {
        if (!siguiente) onCancelar()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{consecuencia}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={ocupado}
            aria-busy={ocupado}
            onClick={(evento) => {
              // El cierre lo decide el padre cuando la baja termina: el cierre
              // automático de Radix dejaría el diálogo abierto a medias si el
              // DELETE tarda o si el servidor responde 409.
              evento.preventDefault()
              onConfirmar()
            }}
          >
            {etiquetaConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
