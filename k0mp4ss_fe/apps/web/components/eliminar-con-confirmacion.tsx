"use client"

/**
 * eliminar-con-confirmacion — la guarda única de las bajas de pantalla.
 *
 * Decisión registrada (`odd/tasks/borrados-con-guarda.md`, L5): la guarda se
 * exige en el **punto donde se monta el botón destructivo**, no en los hooks de
 * `lib/api/` (que son transporte puro, sin el nombre de la entidad ni la
 * consecuencia a mano). Para que eso no termine en 17 copias del trío
 * `{entidad, ocupado, handler}`, esta pieza envuelve el botón de icono y monta
 * `ConfirmarEliminacion` por dentro: sigue habiendo **un solo diálogo** en el
 * repo y ninguna pantalla lo monta crudo.
 *
 * Contrato:
 *
 *   · el click en la papelera NO borra: abre el diálogo con `titulo` (la
 *     entidad concreta) y `consecuencia` (qué se pierde, nunca un «¿estás
 *     seguro?» vacío);
 *   · confirmar marca `ocupado` y llama `onEliminar` una sola vez (el segundo
 *     click con la baja en vuelo no dispara otra baja, ni siquiera antes del
 *     re-render que deshabilita el botón del diálogo);
 *   · `ok` cierra el diálogo; `!ok` lo deja abierto y muestra `error` **dentro
 *     del diálogo** (el overlay tapa el banner de la pantalla) además de
 *     reportarlo por `onError`: el motivo literal del servidor es lo que el
 *     usuario tiene que leer antes de decidir.
 *
 * El disparador es el mismo idiom de papelera de los paneles PE (`Button`
 * `size="icon" variant="ghost"` con `IconTrash`), y exige `ariaLabel`: un botón
 * de sólo icono sin nombre accesible no se puede usar con lector de pantalla.
 */
import * as React from "react"
import { Button } from "@workspace/ui/components/button"
import { IconTrash } from "@tabler/icons-react"
import { ConfirmarEliminacion } from "@/components/confirmar-eliminacion"

/** Lo que devuelve la baja de `onEliminar` (mismo contrato que `StoreResult`). */
export type ResultadoBorrado = { ok: boolean; error?: string }

export interface EliminarConConfirmacionProps {
  /** Nombre concreto de lo que se elimina, ej. «Eliminar la encomienda de Starken». */
  titulo: string
  /** Qué se pierde al confirmar. Obligatorio: el diálogo nunca pregunta en el vacío. */
  consecuencia: string
  /** Ejecuta la baja. Devuelve `ok:false` con el motivo literal si el servidor rechaza. */
  onEliminar: () => Promise<ResultadoBorrado>
  /** El disparador es de sólo icono: su nombre accesible sale de acá. */
  ariaLabel: string
  /** Apaga el disparador sin desmontarlo (la pantalla sigue decidiendo cuándo ofrecerlo). */
  disabled?: boolean
  /** Recibe el motivo del rechazo tal cual lo devolvió el servidor. */
  onError?: (mensaje: string) => void
  /**
   * Texto del botón destructivo. Por defecto «Eliminar»; una baja lógica que
   * archiva se confirma con su verbo («Archivar»), no con uno que mienta sobre
   * lo que el servidor hace.
   */
  etiquetaConfirmar?: string
  /**
   * Texto visible del disparador. Sin él el disparador es la papelera de icono;
   * con él se dibuja un botón con la palabra (el verbo) a la vista, para las
   * pantallas donde la baja ya se anunciaba con texto y no con un icono.
   */
  etiqueta?: string
}

export function EliminarConConfirmacion({
  titulo,
  consecuencia,
  onEliminar,
  ariaLabel,
  disabled = false,
  onError,
  etiquetaConfirmar,
  etiqueta,
}: EliminarConConfirmacionProps) {
  const [abierto, setAbierto] = React.useState(false)
  const [ocupado, setOcupado] = React.useState(false)
  // Motivo del rechazo, para leerlo dentro del diálogo. Se limpia al abrir.
  const [error, setError] = React.useState("")
  // Ref, no sólo el estado: entre el click y el re-render que deshabilita el
  // botón del diálogo hay una ventana en la que un segundo click todavía entra.
  const enVuelo = React.useRef(false)

  const confirmar = async () => {
    if (enVuelo.current) return
    enVuelo.current = true
    setOcupado(true)
    try {
      const resultado = await onEliminar()
      if (resultado.ok) {
        setAbierto(false)
        setError("")
      } else {
        // El diálogo NO se cierra: el usuario tiene que leer el motivo literal
        // del servidor y decidir con esa información.
        // Un rechazo sin texto no puede llegar mudo al diálogo: si el servidor no
        // explica el motivo, se dice eso mismo en vez de dejar la línea vacía.
        const motivo =
          resultado.error?.trim() || "La baja no se completó y el servidor no explicó el motivo."
        setError(motivo)
        onError?.(motivo)
      }
    } catch {
      // Una promesa rechazada no es un resultado: sin esto el diálogo quedaba
      // abierto con el motivo vacío y nadie se enteraba de la baja que no fue.
      const motivo = "No se pudo completar la baja: la pantalla no recibió respuesta del servidor."
      setError(motivo)
      onError?.(motivo)
    } finally {
      enVuelo.current = false
      setOcupado(false)
    }
  }

  const abrir = () => {
    setError("")
    setAbierto(true)
  }

  return (
    <>
      {etiqueta ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-destructive"
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={abrir}
        >
          <IconTrash className="size-3.5" />
          {etiqueta}
        </Button>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={abrir}
        >
          <IconTrash className="size-4" />
        </Button>
      )}
      <ConfirmarEliminacion
        abierto={abierto}
        titulo={titulo}
        consecuencia={consecuencia}
        ocupado={ocupado}
        error={error}
        etiquetaConfirmar={etiquetaConfirmar}
        onConfirmar={() => void confirmar()}
        onCancelar={() => setAbierto(false)}
      />
    </>
  )
}
