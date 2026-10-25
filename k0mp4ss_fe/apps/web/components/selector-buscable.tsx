"use client"

/**
 * selector-buscable — combobox de búsqueda en el servidor (F6).
 *
 * Los `Select` de personas/unidades montan como máximo `LIMITE_SELECT` opciones:
 * con 300 unidades el usuario no podía encontrar la que buscaba. Este componente
 * reemplaza el select por un campo de búsqueda: el consumidor provee
 * `buscar(q)` (el mismo componente sirve para personas y para unidades) y el
 * término viaja a la API, que resuelve el filtro sobre TODA la colección.
 *
 * Contrato de interacción:
 * - Debounce de 300 ms y mínimo 2 caracteres (no se dispara una request por tecla).
 * - Cada término nuevo invalida las respuestas en vuelo: una respuesta vieja que
 *   llega tarde se descarta (evita resultados fuera de orden).
 * - El valor seleccionado se muestra siempre, aunque la búsqueda actual no lo
 *   devuelva (el usuario nunca pierde de vista qué eligió).
 * - Navegable con teclado (flechas + Enter + Escape), con roles combobox/listbox
 *   y foco visible.
 *
 * El kit no tiene `popover` ni `command`, así que la lista se posiciona con un
 * contenedor relativo; el markup reutiliza `Input` y `Label` de `@workspace/ui`.
 */
import * as React from "react"
import { IconLoader2, IconSearch, IconX } from "@tabler/icons-react"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"

/** Opción mínima que el selector sabe mostrar; la etiqueta es la que ve el usuario. */
export interface Opcion {
  id: string
  etiqueta: string
}

const DEBOUNCE_MS = 300
const MINIMO_CARACTERES = 2

export interface SelectorBuscableProps {
  /** id de la opción seleccionada ("" = sin selección). */
  valorId: string
  /** Etiqueta legible del valor actual; si falta se muestra el id. */
  valorEtiqueta?: string
  /** Recibe la opción elegida, o `null` cuando se quita la selección. */
  onSeleccionar: (opcion: Opcion | null) => void
  /** Búsqueda en el servidor provista por el consumidor. */
  buscar: (q: string) => Promise<Opcion[]>
  placeholder?: string
  /** Etiqueta visible del campo (asociada al input con htmlFor). */
  etiqueta?: string
  /** Texto del estado vacío; por defecto `Sin resultados para "<q>".` */
  vacio?: string
  className?: string
}

export function SelectorBuscable({
  valorId,
  valorEtiqueta,
  onSeleccionar,
  buscar,
  placeholder = "Buscar…",
  etiqueta,
  vacio,
  className,
}: SelectorBuscableProps) {
  const idBase = React.useId()
  const idInput = `${idBase}-input`
  const idLista = `${idBase}-lista`

  const [texto, setTexto] = React.useState("")
  const [abierto, setAbierto] = React.useState(false)
  const [cargando, setCargando] = React.useState(false)
  const [opciones, setOpciones] = React.useState<Opcion[]>([])
  const [error, setError] = React.useState(false)
  /** -1 = ninguna opción resaltada; la primera flecha abajo resalta la primera. */
  const [resaltado, setResaltado] = React.useState(-1)
  /** Último término cuya búsqueda terminó (distingue "vacío" de "buscando"). */
  const [consultado, setConsultado] = React.useState("")
  /** Secuencia de peticiones: las respuestas de una secuencia vieja se descartan. */
  const peticionRef = React.useRef(0)

  const buscarRef = React.useRef(buscar)
  React.useEffect(() => {
    buscarRef.current = buscar
  }, [buscar])

  const termino = texto.trim()

  /**
   * El reseteo de estado vive en el cambio de texto (no en el effect) para no
   * encadenar renders: el effect solo programa la consulta debounced.
   */
  function alCambiarTexto(next: string) {
    setTexto(next)
    setAbierto(true)
    setResaltado(-1)
    const siguiente = next.trim()
    if (siguiente.length < MINIMO_CARACTERES) {
      // Término corto o vacío: no se consulta y se cancelan las respuestas en vuelo.
      peticionRef.current += 1
      setOpciones([])
      setConsultado("")
      setError(false)
      setCargando(false)
      return
    }
    setCargando(true)
    setError(false)
  }

  React.useEffect(() => {
    if (termino.length < MINIMO_CARACTERES) return

    const secuencia = ++peticionRef.current
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const resultado = await buscarRef.current(termino)
          if (peticionRef.current !== secuencia) return
          setOpciones(resultado)
          setConsultado(termino)
          setResaltado(-1)
        } catch {
          if (peticionRef.current !== secuencia) return
          setOpciones([])
          setConsultado(termino)
          setError(true)
        } finally {
          if (peticionRef.current === secuencia) setCargando(false)
        }
      })()
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [termino])

  const mostrarLista = abierto && termino.length >= MINIMO_CARACTERES

  // El valor actual se muestra aunque la búsqueda no lo devuelva.
  const opcionesVisibles: Opcion[] = React.useMemo(() => {
    if (!valorId) return opciones
    if (opciones.some((o) => o.id === valorId)) return opciones
    return [{ id: valorId, etiqueta: valorEtiqueta ?? valorId }, ...opciones]
  }, [opciones, valorId, valorEtiqueta])

  const mostrarVacio =
    mostrarLista && !cargando && !error && consultado === termino && opciones.length === 0

  function elegir(opcion: Opcion) {
    onSeleccionar(opcion)
    setTexto("")
    setAbierto(false)
    setOpciones([])
    setConsultado("")
  }

  function alTeclear(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setAbierto(false)
      return
    }
    if (!mostrarLista) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setResaltado((i) => Math.min(i + 1, opcionesVisibles.length - 1))
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setResaltado((i) => Math.max(i - 1, 0))
      return
    }
    if (event.key === "Enter") {
      const opcion = opcionesVisibles[resaltado]
      if (!opcion) return
      event.preventDefault()
      elegir(opcion)
    }  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {etiqueta ? <Label htmlFor={idInput}>{etiqueta}</Label> : null}

      {valorId ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-sm">
          <span className="truncate">{valorEtiqueta ?? valorId}</span>
          <button
            type="button"
            aria-label="Quitar selección"
            className="ml-auto shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={() => onSeleccionar(null)}
          >
            <IconX className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setAbierto(false)
          }
        }}
      >
        <IconSearch
          className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={idInput}
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={
            mostrarLista && resaltado >= 0 && opcionesVisibles.length > 0
              ? `${idBase}-op-${resaltado}`
              : undefined
          }
          autoComplete="off"
          className="pl-7"
          placeholder={placeholder}
          value={texto}
          onChange={(event) => alCambiarTexto(event.target.value)}
          onFocus={() => {
            if (termino.length >= MINIMO_CARACTERES) setAbierto(true)
          }}
          onKeyDown={alTeclear}
        />

        {mostrarLista ? (
          <div
            id={idLista}
            role="listbox"
            aria-label={etiqueta ? `Resultados de ${etiqueta}` : "Resultados"}
            className="absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {cargando ? (
              <p className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                <IconLoader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Buscando…
              </p>
            ) : null}

            {!cargando && error ? (
              <p className="px-2 py-1.5 text-xs text-destructive">
                No se pudo buscar. Intentá de nuevo.
              </p>
            ) : null}

            {mostrarVacio ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {vacio ?? `Sin resultados para "${termino}".`}
              </p>
            ) : null}

            {!cargando && !error
              ? opcionesVisibles.map((opcion, indice) => (
                  <button
                    key={opcion.id}
                    id={`${idBase}-op-${indice}`}
                    type="button"
                    role="option"
                    aria-selected={opcion.id === valorId}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                      indice === resaltado ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setResaltado(indice)}
                    onClick={() => elegir(opcion)}
                  >
                    <span className="truncate">{opcion.etiqueta}</span>
                  </button>
                ))
              : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
