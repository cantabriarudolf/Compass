"use client"

/**
 * Panel de la alerta de reservas — cola de autorización del administrador.
 *
 * Pedido del owner: además de los elementos, el administrador necesita una
 * opción que le avise qué reservas esperan su autorización, porque hoy la lista
 * de reservas de Operaciones es interminable y no dice qué hacer con cada fila.
 *
 * Diseño (lo que el pedido exige explícitamente):
 * - ACOTA: dos combobox canónicos (`components/selector-buscable.tsx`) filtran
 *   por solicitante y por unidad. El término viaja al servidor
 *   (`/api/personas?q=`, `/api/unidades?q=`) y el panel pide la lista YA
 *   filtrada a `/api/ra/reservas/solicitadas?...`; nunca se filtra un arreglo
 *   precargado, que es exactamente el defecto que se está corrigiendo.
 * - PAGINA: tandas de 10 con «Ver más» (el total lo reporta el servidor). Una
 *   tabla sin límite es el otro síntoma que el owner señaló.
 * - COMPACTA Y OBVIA: una tarjeta por solicitud con quién pide, para qué
 *   unidad, qué elemento, cuándo y cuánto, y las dos acciones a la vista.
 * - Solo lista lo `solicitada`: autorizar (→ confirmada) o rechazar
 *   (→ cancelada con motivo) salen de la cola al instante.
 *
 * Todas las mutaciones son las rutas RA (`/api/ra/reservas/[id]/autorizar` y
 * `/rechazar`): acá no hay lógica de negocio duplicada ni cambios de esquema.
 */
import * as React from "react"
import useSWR from "swr"
import { VerMas } from "@/components/ver-mas"
import {
  SelectorBuscable,
  type ContextoBusqueda,
  type Opcion,
  type ResultadoBusqueda,
} from "@/components/selector-buscable"
import { etiquetaUnidad, type UnidadBuscable } from "@/lib/unidades-destino"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  IconCalendarEvent,
  IconCircleCheck,
  IconClockHour4,
  IconLoader2,
  IconUser,
  IconBuildingSkyscraper,
} from "@tabler/icons-react"

/** Cola de autorización (solo `solicitada`), paginada y filtrable. */
const LISTA = "/api/ra/reservas/solicitadas"
/**
 * Base de las ACCIONES sobre una reserva (`/{id}/autorizar`, `/{id}/rechazar`).
 * No es la misma que `LISTA`: la cola es una lectura propia del panel, mientras
 * que autorizar y rechazar son las rutas de la reserva.
 */
const RESERVA = "/api/ra/reservas"
/** Tanda chica: el panel muestra pocas solicitudes y crece con «Ver más». */
const PAGE_SIZE = 10
/** Opciones por búsqueda en los combobox (el servidor pagina por su cuenta). */
const PAGE_SIZE_BUSQUEDA = 10

/** Fila ya resuelta por el servidor: sin FKs crudas en la pantalla. */
interface SolicitudRA {
  id: string
  folio: string
  elementoId: string
  elementoNombre: string
  solicitantePersonaId: string
  solicitanteNombre: string
  unidadId: string | null
  unidadEtiqueta: string
  fecha: string
  horaInicio: string
  horaFin: string
  montoTarifa: number
  montoGarantia: number
}

interface PaginaSolicitudes {
  data: SolicitudRA[]
  page: number
  pageSize: number
  total: number
}

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(cuerpo?.error ?? `Error ${res.status} al consultar ${url}.`)
  }
  return (await res.json()) as T
}

/** Envía una acción y traduce la respuesta a un mensaje legible. */
async function accion(
  url: string,
  body?: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      ...(body !== undefined
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    })
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null
      return { ok: false, error: cuerpo?.error ?? `No se pudo completar la acción (HTTP ${res.status}).` }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." }
  }
}

/** Búsqueda de solicitantes en el servidor (`?q=` sobre nombre, RUT y email). */
async function buscarSolicitantes(
  q: string,
  contexto: ContextoBusqueda
): Promise<ResultadoBusqueda> {
  const params = new URLSearchParams({
    q,
    page: String(contexto.page),
    pageSize: String(PAGE_SIZE_BUSQUEDA),
  })
  const coleccion = await fetcher<{
    data: { id: string; nombreCompleto: string }[]
    total: number
    pageSize: number
  }>(`/api/personas?${params.toString()}`)
  const opciones: Opcion[] = coleccion.data.map((p) => ({
    id: p.id,
    etiqueta: p.nombreCompleto,
  }))
  return {
    opciones,
    hayMas: contexto.page * coleccion.pageSize < coleccion.total,
  }
}

/** Búsqueda de unidades en el servidor (`?q=` sobre número, etiqueta y rol SII). */
async function buscarUnidadesPanel(
  q: string,
  contexto: ContextoBusqueda
): Promise<ResultadoBusqueda> {
  const params = new URLSearchParams({
    q,
    page: String(contexto.page),
    pageSize: String(PAGE_SIZE_BUSQUEDA),
  })
  const coleccion = await fetcher<{
    data: UnidadBuscable[]
    total: number
    pageSize: number
  }>(`/api/unidades?${params.toString()}`)
  const opciones: Opcion[] = coleccion.data.map((u) => ({
    id: u.id,
    etiqueta: etiquetaUnidad(u),
  }))
  return {
    opciones,
    hayMas: contexto.page * coleccion.pageSize < coleccion.total,
  }
}

/** Monto en pesos chilenos; 0 se lee como «sin cobro» en vez de «$0». */
function monto(valor: number): string {
  return valor > 0 ? `$${valor.toLocaleString("es-CL")}` : "Sin cobro"
}

/** Fecha ISO → `dd-mm-aaaa` (lo que se lee de un vistazo, sin ambigüedad de locale). */
function fechaLegible(iso: string): string {
  const [anio, mes, dia] = iso.split("-")
  return anio && mes && dia ? `${dia}-${mes}-${anio}` : iso
}

export function PanelReservas() {
  const [solicitante, setSolicitante] = React.useState<Opcion | null>(null)
  const [unidad, setUnidad] = React.useState<Opcion | null>(null)
  const [mensaje, setMensaje] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [enCurso, setEnCurso] = React.useState<string | null>(null)
  const [rechazando, setRechazando] = React.useState<SolicitudRA | null>(null)
  const [motivo, setMotivo] = React.useState("")

  /**
   * La lista la arma el SERVIDOR con los filtros como parámetros: la clave de
   * SWR cambia con el filtro, así que la consulta nueva reemplaza a la anterior
   * (no se filtra nada en el cliente).
   */
  const urlBase = React.useMemo(() => {
    const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) })
    if (solicitante) params.set("solicitanteId", solicitante.id)
    if (unidad) params.set("unidadId", unidad.id)
    return `${LISTA}?${params.toString()}`
  }, [solicitante, unidad])

  const { data, error: errorLista, isLoading, isValidating: isValidando, mutate } = useSWR<
    PaginaSolicitudes,
    Error
  >(urlBase, fetcher, { revalidateOnFocus: true, keepPreviousData: true })

  // Páginas pedidas con «Ver más», atadas a la URL que las produjo: si cambia el
  // filtro, las páginas viejas dejan de aplicar sin necesidad de un efecto.
  const [paginacion, setPaginacion] = React.useState<{
    url: string
    paginas: PaginaSolicitudes[]
  }>({ url: urlBase, paginas: [] })
  const [cargandoMas, setCargandoMas] = React.useState(false)
  const paginasExtra = React.useMemo(
    () => (paginacion.url === urlBase ? paginacion.paginas : []),
    [paginacion, urlBase]
  )

  const solicitudes = React.useMemo(
    () => [...(data?.data ?? []), ...paginasExtra.flatMap((p) => p.data)],
    [data, paginasExtra]
  )
  const total = data?.total ?? 0

  const cargarMas = async (): Promise<void> => {
    if (cargandoMas || solicitudes.length >= total) return
    const siguiente = (data?.page ?? 1) + paginasExtra.length + 1
    setCargandoMas(true)
    try {
      const pagina = await fetcher<PaginaSolicitudes>(`${urlBase}&page=${siguiente}`)
      setPaginacion((previa) => {
        const acumuladas = previa.url === urlBase ? previa.paginas : []
        if (acumuladas.some((p) => p.page === pagina.page)) return previa
        return { url: urlBase, paginas: [...acumuladas, pagina] }
      })
    } catch {
      // La página 1 ya expone su error por SWR; acá solo se corta la carga.
    } finally {
      setCargandoMas(false)
    }
  }

  /** Refresco tras una acción: se vuelve a pedir solo la primera página. */
  async function refrescar(): Promise<void> {
    setPaginacion({ url: urlBase, paginas: [] })
    await mutate()
  }

  async function autorizar(solicitud: SolicitudRA): Promise<void> {
    setError(null)
    setMensaje(null)
    setEnCurso(solicitud.id)
    try {
      const resultado = await accion(`${RESERVA}/${solicitud.id}/autorizar`)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setMensaje(`Reserva ${solicitud.folio} autorizada.`)
      await refrescar()
    } finally {
      setEnCurso(null)
    }
  }

  async function rechazar(): Promise<void> {
    if (!rechazando) return
    const solicitud = rechazando
    setError(null)
    setMensaje(null)
    setEnCurso(solicitud.id)
    try {
      const resultado = await accion(`${RESERVA}/${solicitud.id}/rechazar`, {
        motivo: motivo.trim(),
      })
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setMensaje(`Reserva ${solicitud.folio} rechazada.`)
      setRechazando(null)
      setMotivo("")
      await refrescar()
    } finally {
      setEnCurso(null)
    }
  }

  const hayFiltro = solicitante !== null || unidad !== null
  const sinDatos = !isLoading && !errorLista && solicitudes.length === 0

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reservas por autorizar</h1>
        <p className="text-sm text-muted-foreground">
          Cada solicitud de un elemento que exige autorización espera acá. Autorizala
          para confirmarla o rechazala indicando el motivo.
        </p>
      </div>

      {/* Filtros: los dos combobox buscan en el servidor, no en la página cargada. */}
      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
          <SelectorBuscable
            etiqueta="Solicitante"
            valorId={solicitante?.id ?? ""}
            valorEtiqueta={solicitante?.etiqueta}
            onSeleccionar={setSolicitante}
            buscar={buscarSolicitantes}
            placeholder="Nombre, RUT o email del solicitante…"
            vacio="Ningún solicitante coincide. Revisá el nombre o el RUT."
          />
          <SelectorBuscable
            etiqueta="Unidad"
            valorId={unidad?.id ?? ""}
            valorEtiqueta={unidad?.etiqueta}
            onSeleccionar={setUnidad}
            buscar={buscarUnidadesPanel}
            placeholder="Número, etiqueta o rol SII de la unidad…"
            vacio="Ninguna unidad coincide. Revisá el número o el rol SII."
          />
          {hayFiltro ? (
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSolicitante(null)
                  setUnidad(null)
                }}
              >
                Limpiar filtros
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        <Badge variant={total > 0 ? "default" : "secondary"}>
          {total} {total === 1 ? "solicitud" : "solicitudes"} por autorizar
        </Badge>
        {isValidando && !isLoading ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <IconLoader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Actualizando…
          </span>
        ) : null}
      </div>

      {mensaje ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
        >
          <IconCircleCheck className="size-4 shrink-0" aria-hidden="true" />
          {mensaje}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando solicitudes…</p>
      ) : null}

      {errorLista && !isLoading ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudieron cargar las solicitudes. Intentá de nuevo.
        </p>
      ) : null}

      {sinDatos ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-1 py-10 text-center">
            <IconCalendarEvent className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">No hay reservas esperando autorización.</p>
            <p className="text-xs text-muted-foreground">
              {hayFiltro
                ? "Ninguna solicitud coincide con este filtro. Probalo con otro solicitante o unidad."
                : "Cuando alguien reserve un elemento que exige autorización, aparece acá."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {solicitudes.length > 0 ? (
        <ul className="flex flex-col gap-3" aria-label="Solicitudes por autorizar">
          {solicitudes.map((solicitud) => (
            <li key={solicitud.id}>
              <Card>
                <CardHeader className="gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{solicitud.elementoNombre}</CardTitle>
                    <Badge variant="secondary">{solicitud.folio}</Badge>
                  </div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <IconClockHour4 className="size-3.5" aria-hidden="true" />
                    {fechaLegible(solicitud.fecha)} · {solicitud.horaInicio}–{solicitud.horaFin}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <dl className="grid gap-1 text-sm sm:grid-cols-3 sm:gap-6">
                    <div className="flex items-center gap-1.5">
                      <IconUser className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <dt className="text-xs text-muted-foreground">Solicitante</dt>
                      <dd className="font-medium">{solicitud.solicitanteNombre}</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <IconBuildingSkyscraper className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <dt className="text-xs text-muted-foreground">Unidad</dt>
                      <dd className="font-medium">{solicitud.unidadEtiqueta}</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <dt className="text-xs text-muted-foreground">Monto</dt>
                      <dd className="font-medium">
                        {monto(solicitud.montoTarifa)}
                        {solicitud.montoGarantia > 0
                          ? ` + garantía ${monto(solicitud.montoGarantia)}`
                          : ""}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      aria-label={`Autorizar la reserva ${solicitud.folio}`}
                      disabled={enCurso === solicitud.id}
                      onClick={() => void autorizar(solicitud)}
                    >
                      {enCurso === solicitud.id ? (
                        <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Autorizar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Rechazar la reserva ${solicitud.folio}`}
                      disabled={enCurso === solicitud.id}
                      onClick={() => {
                        setMensaje(null)
                        setError(null)
                        setMotivo("")
                        setRechazando(solicitud)
                      }}
                    >
                      Rechazar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      <VerMas
        mostrados={solicitudes.length}
        total={total}
        cargando={cargandoMas}
        onCargarMas={cargarMas}
      />

      {/* Rechazo: el motivo es obligatorio y queda en la reserva (JSON `cancelacion`). */}
      <Dialog
        open={rechazando !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setRechazando(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar reserva</DialogTitle>
            <DialogDescription>
              {rechazando
                ? `${rechazando.folio} · ${rechazando.elementoNombre} · ${rechazando.solicitanteNombre}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="motivo-rechazo">Motivo del rechazo</Label>
            <Input
              id="motivo-rechazo"
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder="Ej: el recinto ya está reservado para mantención."
            />
            <p className="text-xs text-muted-foreground">
              El motivo queda registrado en la reserva y lo ve quien la solicitó.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRechazando(null)}
            >
              Volver
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={motivo.trim().length < 3 || enCurso !== null}
              onClick={() => void rechazar()}
            >
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
