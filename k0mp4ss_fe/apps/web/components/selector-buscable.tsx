"use client"

/**
 * selector-buscable — combobox de búsqueda en el servidor (F6).
 *
 * Los `Select` de personas/unidades montan como máximo `LIMITE_SELECT` opciones:
 * con 300 unidades el usuario no podía encontrar la que buscaba. Este componente
 * reemplaza el select por un campo de búsqueda: el consumidor provee
 * `buscar(q, { page })` (el mismo componente sirve para personas y para unidades) y el
 * término viaja a la API, que resuelve el filtro sobre TODA la colección.
 *
 * Contrato de interacción:
 * - Debounce de 300 ms y mínimo 2 caracteres (no se dispara una request por tecla).
 * - Cada término nuevo invalida las respuestas en vuelo: una respuesta vieja que
 *   llega tarde se descarta (evita resultados fuera de orden).
 * - Las filas de la consulta anterior siguen en pantalla mientras la nueva está en
 *   vuelo, y el indicador de carga vive en una franja de alto fijo: la lista no se
 *   vacía ni salta de tamaño mientras se espera.
 * - La búsqueda se puede recorrer hasta el final: si `buscar` responde
 *   `{ opciones, hayMas }`, la lista ofrece «Cargar más resultados» (también con la
 *   flecha abajo sobre la última fila). El consumidor decide la página; el
 *   componente solo pide la siguiente y acumula sin duplicar ids.
 * - El valor seleccionado se muestra siempre, aunque la búsqueda actual no lo
 *   devuelva (el usuario nunca pierde de vista qué eligió).
 * - Navegable con teclado (flechas + Enter + Escape), con roles combobox/listbox
 *   y foco visible. Elegir o limpiar no mueve el foco fuera del input (`onMouseDown`
 *   con `preventDefault`): sin eso el navegador desplaza la página al cerrar la lista.
 * - El término se puede limpiar con el botón «Limpiar búsqueda» del propio campo.
 *
 * Modo estático (retrocompatible): un consumidor que ya tiene la lista en memoria pasa
 * `opciones` y ningún `buscar`; el filtro se hace en el cliente, sin red y sin debounce.
 * Para listas grandes ese modo vuelve a truncar (solo ve la página que recibió): la
 * búsqueda canónica es la del servidor.
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

/** Página de resultados: `hayMas` habilita «Cargar más resultados». */
export interface PaginaOpciones {
  opciones: Opcion[]
  hayMas: boolean
}

/** Lo que puede devolver `buscar`: una lista suelta (sin paginar) o una página. */
export type ResultadoBusqueda = Opcion[] | PaginaOpciones

/** Contexto de la consulta; `page` empieza en 1. */
export interface ContextoBusqueda {
  page: number
}

const DEBOUNCE_MS = 300
const MINIMO_CARACTERES = 2

/** Normaliza para comparar en el modo estático: sin mayúsculas ni tildes. */
function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

/** Acepta las dos formas de respuesta de `buscar` y las reduce a una página. */
function aPagina(resultado: ResultadoBusqueda): PaginaOpciones {
  if (Array.isArray(resultado)) return { opciones: resultado, hayMas: false }
  return { opciones: resultado.opciones, hayMas: resultado.hayMas }
}

export interface SelectorBuscableProps {
  /** id de la opción seleccionada ("" = sin selección). */
  valorId: string
  /** Etiqueta legible del valor actual; si falta se muestra el id. */
  valorEtiqueta?: string
  /** Recibe la opción elegida, o `null` cuando se quita la selección. */
  onSeleccionar: (opcion: Opcion | null) => void
  /**
   * Búsqueda en el servidor provista por el consumidor. Recibe el término y la página
   * pedida (1 = primera). Devolver `{ opciones, hayMas }` habilita «Cargar más resultados»;
   * devolver un arreglo mantiene el contrato de una sola página.
   */
  buscar?: (q: string, contexto: ContextoBusqueda) => Promise<ResultadoBusqueda>
  /** Lista estática (modo retrocompatible): se filtra en el cliente, sin red. */
  opciones?: readonly Opcion[]
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
  opciones,
  placeholder = "Buscar…",
  etiqueta,
  vacio,
  className,
}: SelectorBuscableProps) {
  const idBase = React.useId()
  const idInput = `${idBase}-input`
  const idLista = `${idBase}-lista`

  /** Con `buscar` la consulta va al servidor; sin él, el filtro es local (modo estático). */
  const servidor = typeof buscar === "function"

  const [texto, setTexto] = React.useState("")
  const [abierto, setAbierto] = React.useState(false)
  const [cargando, setCargando] = React.useState(false)
  const [cargandoMas, setCargandoMas] = React.useState(false)
  const [hayMas, setHayMas] = React.useState(false)
  /** Última página acumulada para el término vigente (`buscar` con paginación). */
  const [pagina, setPagina] = React.useState(1)
  const [filas, setFilas] = React.useState<Opcion[]>([])
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

  /** Filas base: las del servidor, o la lista recibida filtrada en el cliente. */
  const filasBase = React.useMemo(() => {
    if (servidor) return filas
    const lista = opciones ?? []
    const buscado = normalizarTexto(termino)
    if (!buscado) return [...lista]
    return lista.filter((opcion) => normalizarTexto(opcion.etiqueta).includes(buscado))
  }, [servidor, filas, opciones, termino])

  /**
   * El reseteo de estado vive en el cambio de texto (no en el effect) para no
   * encadenar renders: el effect solo programa la consulta debounced.
   */
  function alCambiarTexto(next: string) {
    setTexto(next)
    setAbierto(true)
    setResaltado(-1)
    if (!servidor) return

    const siguiente = next.trim()
    if (siguiente.length < MINIMO_CARACTERES) {
      // Término corto o vacío: no se consulta y se cancelan las respuestas en vuelo.
      peticionRef.current += 1
      setFilas([])
      setConsultado("")
      setError(false)
      setCargando(false)
      setCargandoMas(false)
      setHayMas(false)
      setPagina(1)
      return
    }
    // Las filas anteriores se conservan a propósito: la lista no parpadea mientras
    // la consulta nueva está en vuelo (`hayMas` sí se descarta: era de otro término).
    setHayMas(false)
    setCargando(true)
    setError(false)
  }

  React.useEffect(() => {
    if (!servidor) return
    if (termino.length < MINIMO_CARACTERES) return

    const secuencia = ++peticionRef.current
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const resultado = await buscarRef.current!(termino, { page: 1 })
          if (peticionRef.current !== secuencia) return
          const primera = aPagina(resultado)
          setFilas(primera.opciones)
          setHayMas(primera.hayMas)
          setPagina(1)
          setConsultado(termino)
          setResaltado(-1)
        } catch {
          if (peticionRef.current !== secuencia) return
          setFilas([])
          setConsultado(termino)
          setHayMas(false)
          setPagina(1)
          setError(true)
        } finally {
          if (peticionRef.current === secuencia) setCargando(false)
        }
      })()
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [termino, servidor])

  const mostrarLista = abierto && (servidor ? termino.length >= MINIMO_CARACTERES : filasBase.length > 0)

  // El valor actual se muestra aunque la búsqueda no lo devuelva.
  const opcionesVisibles: Opcion[] = React.useMemo(() => {
    if (!valorId) return filasBase
    if (filasBase.some((o) => o.id === valorId)) return filasBase
    return [{ id: valorId, etiqueta: valorEtiqueta ?? valorId }, ...filasBase]
  }, [filasBase, valorId, valorEtiqueta])

  /**
   * Vacío = la consulta vigente ya volvió sin filas. Se mide sobre las filas base
   * (no sobre `opcionesVisibles`): si hay un valor seleccionado, ese chip no debe
   * ocultar el «sin coincidencias».
   */
  const mostrarVacio =
    !cargando &&
    !error &&
    filasBase.length === 0 &&
    (servidor ? consultado === termino : termino.length > 0)

  /** Pide la página siguiente y la acumula; una respuesta de otro término se descarta. */
  async function alCargarMas() {
    if (!servidor || cargandoMas || !hayMas) return
    const secuencia = peticionRef.current
    const siguiente = pagina + 1
    setCargandoMas(true)
    try {
      const resultado = await buscarRef.current!(termino, { page: siguiente })
      if (peticionRef.current !== secuencia) return
      const nueva = aPagina(resultado)
      setFilas((previas) => {
        const vistos = new Set(previas.map((o) => o.id))
        return [...previas, ...nueva.opciones.filter((o) => !vistos.has(o.id))]
      })
      setHayMas(nueva.hayMas)
      setPagina(siguiente)
    } catch {
      if (peticionRef.current !== secuencia) return
      setError(true)
    } finally {
      setCargandoMas(false)
    }
  }

  function limpiarTexto() {
    alCambiarTexto("")
  }

  function elegir(opcion: Opcion) {
    onSeleccionar(opcion)
    // La selección invalida cualquier respuesta que siga en vuelo.
    peticionRef.current += 1
    setTexto("")
    setAbierto(false)
    setCargando(false)
    setCargandoMas(false)
    setFilas([])
    setConsultado("")
    setHayMas(false)
    setPagina(1)
    setError(false)
    setResaltado(-1)
  }

  function alTeclear(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setAbierto(false)
      return
    }
    if (!mostrarLista) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      const siguiente = Math.min(resaltado + 1, opcionesVisibles.length - 1)
      setResaltado(siguiente)
      // Última fila + más páginas: el teclado también alcanza el final de la búsqueda.
      if (siguiente === opcionesVisibles.length - 1 && hayMas && !cargando && !cargandoMas) {
        void alCargarMas()
      }
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
    }
  }

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
          className={cn("pl-7", texto ? "pr-7" : null)}
          placeholder={placeholder}
          value={texto}
          onChange={(event) => alCambiarTexto(event.target.value)}
          onFocus={() => {
            if (!servidor || termino.length >= MINIMO_CARACTERES) setAbierto(true)
          }}
          onKeyDown={alTeclear}
        />

        {texto ? (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            // `preventDefault` en mousedown: el foco se queda en el input, así limpiar
            // no desplaza la página ni obliga a volver a hacer clic para seguir tipeando.
            onMouseDown={(event) => event.preventDefault()}
            onClick={limpiarTexto}
          >
            <IconX className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}

        {mostrarLista ? (
          <div
            id={idLista}
            role="listbox"
            aria-label={etiqueta ? `Resultados de ${etiqueta}` : "Resultados"}
            className="absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {/*
              Franja de estado de alto fijo: el indicador de carga no empuja las filas
              anteriores, que siguen visibles mientras la consulta nueva está en vuelo.
            */}
            <div
              className="flex h-5 items-center gap-2 px-2 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {cargando ? (
                <>
                  <IconLoader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                  <span>Buscando…</span>
                </>
              ) : null}
            </div>

            {error ? (
              <p className="px-2 py-1.5 text-xs text-destructive">
                No se pudo buscar. Intentá de nuevo.
              </p>
            ) : null}

            {mostrarVacio ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {vacio ?? `Sin resultados para "${termino}".`}
              </p>
            ) : null}

            {!error
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

            {!error && hayMas ? (
              <button
                type="button"
                className="mt-1 w-full rounded-sm border-t px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void alCargarMas()}
                disabled={cargandoMas}
              >
                {cargandoMas ? "Cargando…" : "Cargar más resultados"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
