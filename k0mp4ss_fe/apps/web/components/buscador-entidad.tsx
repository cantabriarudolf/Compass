"use client"

/**
 * buscador-entidad — buscador de entidades con la consulta EN EL SERVIDOR (F36).
 *
 * Los `Select` de entidades montan la colección que el cliente ya trajo: si esa
 * colección viene paginada al tope (`pageSize=100`), quien quedó fuera de la
 * primera página no se puede elegir — y un certificado de residencia es un
 * documento legal sobre UNA persona. Este componente reemplaza el patrón: el
 * término viaja a un endpoint LIGERO (`GET {url}?q=…&page=…`), el servidor
 * resuelve el filtro sobre TODA la colección, y la respuesta declara el total
 * para que el recorte se vea («Mostrando N de M») y no se esconda.
 *
 * Contrato:
 *   · sin texto no hay petición — nunca carga la colección completa;
 *   · debounce de 300 ms y mínimo 2 caracteres: una tecla, una request;
 *   · cada término invalida las respuestas en vuelo (una respuesta vieja que
 *     llega tarde no pisa la búsqueda nueva);
 *   · «Cargar más resultados» pide la página siguiente y acumula sin duplicar;
 *   · la selección se expone como `{ id, etiqueta }` vía `onSeleccion` (y la fila
 *     completa como segundo argumento, para el consumidor que necesita más datos
 *     de la fila que la etiqueta);
 *   · la selección vigente se ve en el chip aunque la búsqueda actual no la
 *     devuelva, y quitarla entrega `null`/`null`;
 *   · navegable con teclado (flechas + Enter + Escape), con roles
 *     combobox/listbox y foco visible: elegir o limpiar no saca el foco del
 *     campo (`onMouseDown` con `preventDefault`) — la interacción replica la de
 *     `components/selector-buscable.tsx`, sin su modo estático: acá la lista SIEMPRE
 *     viene del servidor, porque el modo estático vuelve a truncar.
 *
 * Genérico por diseño: el consumidor declara el endpoint, cómo se lee el id y la
 * etiqueta de cada fila, y el componente no sabe nada del dominio. La migración
 * de las demás pantallas con listas truncadas puede montarlo sin tocarlo.
 */
import * as React from "react"
import { IconLoader2, IconSearch, IconX } from "@tabler/icons-react"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"

/** La selección que el componente expone: `{ id, etiqueta }` (F36). */
export interface EntidadSeleccion {
  id: string
  etiqueta: string
}

/** Envelope del endpoint ligero: `{ data, page, pageSize, total }`. */
interface ColeccionEntidades<Fila> {
  data?: Fila[]
  page?: number
  pageSize?: number
  total?: number
}

export interface BuscadorEntidadProps<Fila> {
  /** Endpoint ligero: responde `{ data, page, pageSize, total }` a `?q=&page=`. */
  url: string
  /** fila → id de la opción. */
  idDe: (fila: Fila) => string
  /** fila → etiqueta visible (es lo que ve y elige el usuario). */
  etiquetaDe: (fila: Fila) => string
  /** Selección vigente; `null` = sin selección. Se ve en el chip aunque la búsqueda no la devuelva. */
  seleccion?: EntidadSeleccion | null
  /** Recibe `{ id, etiqueta }` y la fila completa, o `null`/`null` al quitar la selección. */
  onSeleccion?: (seleccion: EntidadSeleccion | null, fila: Fila | null) => void
  /** Etiqueta visible del campo (asociada al input con htmlFor). */
  etiqueta?: string
  placeholder?: string
  /** Texto del estado vacío; por defecto `Sin resultados para "<q>".` */
  vacio?: string
  className?: string
}

const DEBOUNCE_MS = 300
const MINIMO_CARACTERES = 2

export function BuscadorEntidad<Fila>({
  url,
  idDe,
  etiquetaDe,
  seleccion = null,
  onSeleccion,
  etiqueta,
  placeholder = "Buscar…",
  vacio,
  className,
}: BuscadorEntidadProps<Fila>) {
  const idBase = React.useId()
  const idInput = `${idBase}-input`
  const idLista = `${idBase}-lista`

  const [texto, setTexto] = React.useState("")
  const [abierto, setAbierto] = React.useState(false)
  const [cargando, setCargando] = React.useState(false)
  const [cargandoMas, setCargandoMas] = React.useState(false)
  /** Filas acumuladas del término vigente (página 1 + las que pidió «Cargar más»). */
  const [filas, setFilas] = React.useState<Fila[]>([])
  const [total, setTotal] = React.useState(0)
  const [pagina, setPagina] = React.useState(1)
  const [hayMas, setHayMas] = React.useState(false)
  const [error, setError] = React.useState(false)
  /** -1 = ninguna opción resaltada; la primera flecha abajo resalta la primera. */
  const [resaltado, setResaltado] = React.useState(-1)
  /** Último término cuya búsqueda terminó (distingue «vacío» de «buscando»). */
  const [consultado, setConsultado] = React.useState("")
  /** Secuencia de peticiones: las respuestas de una secuencia vieja se descartan. */
  const peticionRef = React.useRef(0)

  const termino = texto.trim()

  /**
   * Consulta el endpoint y aplica la respuesta si la secuencia sigue vigente.
   * Con `acumular` suma la página a las filas ya en pantalla, sin duplicar ids.
   */
  async function pedir(terminoConsulta: string, page: number, acumular: boolean): Promise<void> {
    const secuencia = peticionRef.current
    try {
      const query = new URLSearchParams({ q: terminoConsulta, page: String(page) })
      const res = await fetch(`${url}?${query}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      })
      if (peticionRef.current !== secuencia) return // llegó tarde: otro término mandó.
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const coleccion = (await res.json()) as ColeccionEntidades<Fila>
      if (peticionRef.current !== secuencia) return
      const data = Array.isArray(coleccion.data) ? coleccion.data : []
      const totalServidor = Number.isFinite(coleccion.total) ? (coleccion.total as number) : 0
      const previas = acumular ? filas : []
      const vistos = new Set(previas.map(idDe))
      const acumuladas = [...previas, ...data.filter((f) => !vistos.has(idDe(f)))]
      setFilas(acumuladas)
      setTotal(totalServidor)
      setPagina(page)
      setHayMas(acumuladas.length < totalServidor)
      setConsultado(terminoConsulta)
      setError(false)
    } catch {
      if (peticionRef.current !== secuencia) return
      setError(true)
      setConsultado(terminoConsulta)
    } finally {
      if (peticionRef.current === secuencia) setCargando(false)
    }
  }

  /**
   * El reseteo de estado vive en el cambio de texto (no en el effect): el effect
   * solo programa la consulta debounced.
   */
  function alCambiarTexto(next: string) {
    setTexto(next)
    setAbierto(true)
    setResaltado(-1)

    const siguiente = next.trim()
    if (siguiente.length < MINIMO_CARACTERES) {
      // Término corto o vacío: no se consulta y se cancelan las respuestas en vuelo.
      peticionRef.current += 1
      setFilas([])
      setTotal(0)
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
    setCargando(true)
    setError(false)
    setHayMas(false)
  }

  React.useEffect(() => {
    if (termino.length < MINIMO_CARACTERES) return

    // Un término nuevo invalida las respuestas en vuelo de la secuencia anterior.
    const secuencia = ++peticionRef.current
    const timer = setTimeout(() => {
      void pedir(termino, 1, false)
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
    // `pedir` se re-crea por render pero la consulta depende sólo del término y
    // del endpoint; incluiría en las deps funciones con identidad nueva por render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termino, url])

  const mostrarLista = abierto && termino.length >= MINIMO_CARACTERES

  /**
   * Vacío = la consulta vigente ya volvió sin filas. El chip de la selección no
   * tapa el «sin coincidencias»: se mide sobre las filas del servidor.
   */
  const mostrarVacio =
    !cargando && !error && filas.length === 0 && consultado === termino && termino.length >= MINIMO_CARACTERES

  /** Pide la página siguiente y la acumula; una respuesta de otro término se descarta. */
  async function alCargarMas() {
    if (cargandoMas || !hayMas) return
    setCargandoMas(true)
    try {
      await pedir(termino, pagina + 1, true)
    } finally {
      setCargandoMas(false)
    }
  }

  function elegir(fila: Fila) {
    onSeleccion?.({ id: idDe(fila), etiqueta: etiquetaDe(fila) }, fila)
    // La selección invalida cualquier respuesta que siga en vuelo.
    peticionRef.current += 1
    setTexto("")
    setAbierto(false)
    setCargando(false)
    setCargandoMas(false)
    setFilas([])
    setTotal(0)
    setConsultado("")
    setHayMas(false)
    setPagina(1)
    setError(false)
    setResaltado(-1)
  }

  function limpiarTexto() {
    alCambiarTexto("")
  }

  function alTeclear(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setAbierto(false)
      return
    }
    if (!mostrarLista) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      const siguiente = Math.min(resaltado + 1, filas.length - 1)
      setResaltado(siguiente)
      // Última fila + más páginas: el teclado también alcanza el final de la búsqueda.
      if (siguiente === filas.length - 1 && hayMas && !cargando && !cargandoMas) {
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
      const fila = filas[resaltado]
      if (!fila) return
      event.preventDefault()
      elegir(fila)
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {etiqueta ? <Label htmlFor={idInput}>{etiqueta}</Label> : null}

      {seleccion ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-sm">
          <span className="truncate">{seleccion.etiqueta}</span>
          <button
            type="button"
            aria-label="Quitar selección"
            className="ml-auto shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={() => onSeleccion?.(null, null)}
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
            mostrarLista && resaltado >= 0 && filas.length > 0 ? `${idBase}-op-${resaltado}` : undefined
          }
          autoComplete="off"
          className={cn("pl-7", texto ? "pr-7" : null)}
          placeholder={placeholder}
          value={texto}
          onChange={(event) => alCambiarTexto(event.target.value)}
          onFocus={() => {
            if (termino.length >= MINIMO_CARACTERES) setAbierto(true)
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
            <div className="flex h-5 items-center gap-2 px-2 text-xs text-muted-foreground" aria-live="polite">
              {cargando ? (
                <>
                  <IconLoader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                  <span>Buscando…</span>
                </>
              ) : !error && filas.length > 0 && consultado === termino ? (
                // El total se DECLARA: lo que se ve es una página, no la colección.
                <span>
                  Mostrando {filas.length} de {total}
                </span>
              ) : null}
            </div>

            {error ? (
              <p className="px-2 py-1.5 text-xs text-destructive">No se pudo buscar. Intentá de nuevo.</p>
            ) : null}

            {mostrarVacio ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {vacio ?? `Sin resultados para "${termino}".`}
              </p>
            ) : null}

            {!error
              ? filas.map((fila, indice) => (
                  <button
                    key={idDe(fila)}
                    id={`${idBase}-op-${indice}`}
                    type="button"
                    role="option"
                    aria-selected={seleccion?.id === idDe(fila)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                      indice === resaltado ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setResaltado(indice)}
                    onClick={() => elegir(fila)}
                  >
                    <span className="truncate">{etiquetaDe(fila)}</span>
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
