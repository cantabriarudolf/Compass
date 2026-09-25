"use client"

import * as React from "react"
// Datos de dominio vía API REST (BD fuente de verdad); store legacy deprecado.
import { usePersonas } from "@/lib/api/use-personas"
import { useVinculos } from "@/lib/api/use-vinculos"
import { useUnidades } from "@/lib/api/use-unidades"
import { useSolicitudesGE } from "@/lib/api/use-ge"
import { useMensajesBuzonCO } from "@/lib/api/use-co"
import { generarId } from "@/lib/id-utils"
import { ahoraISO, hoyISO } from "@/lib/date-utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  IconClipboardList,
  IconPlus,
  IconEye,
  IconCheck,
  IconFilter,
  IconGauge,
} from "@tabler/icons-react"
import type { EstadoSolicitudGE, SolicitudGE, TipoSolicitudGE } from "@/lib/schemas"

const TIPO_LABEL: Record<TipoSolicitudGE, string> = {
  insumos: "Insumos y Materiales",
  grabaciones: "Registro de Grabaciones (CCTV)",
  buzon: "Buzón Ciudadano",
}

const ESTADO_LABEL: Record<EstadoSolicitudGE, string> = {
  nuevo: "Nuevo",
  en_revision: "En Revisión",
  requiere_accion_vecino: "Requiere Acción Vecino",
  en_proceso: "En Proceso",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
}

const ESTADO_BADGE: Record<EstadoSolicitudGE, string> = {
  nuevo: "bg-sky-600 hover:bg-sky-700 text-white",
  en_revision: "bg-amber-500 hover:bg-amber-600 text-white",
  requiere_accion_vecino: "bg-destructive hover:bg-destructive text-white",
  en_proceso: "bg-violet-600 hover:bg-violet-700 text-white",
  resuelto: "bg-emerald-600 hover:bg-emerald-700 text-white",
  cerrado: "bg-muted text-muted-foreground",
}

interface FormNueva {
  tipo: TipoSolicitudGE
  titulo: string
  descripcion: string
  solicitantePersonaId: string
  unidadId: string
  registradoPorConserje: boolean
  fechaSuceso: string
  horaSuceso: string
  justificacion: string
  areaDestino: string
  materialSolicitado: string
  mensajeBuzonId: string
}

const FORM_NUEVA: FormNueva = {
  tipo: "grabaciones",
  titulo: "",
  descripcion: "",
  solicitantePersonaId: "",
  unidadId: "",
  registradoPorConserje: false,
  fechaSuceso: new Date().toISOString().slice(0, 10),
  horaSuceso: "12:00",
  justificacion: "",
  areaDestino: "",
  materialSolicitado: "",
  mensajeBuzonId: "",
}

export default function SolicitudesPage() {
  const { personas, isLoading: cPersonas } = usePersonas()
  const { vinculos, isLoading: cVinculos } = useVinculos()
  const { items: unidades, isLoading: cUnidades } = useUnidades()
  const {
items: solicitudesGE,
isLoading: cSolicitudes,
create: crearSolicitudApi,
update: actualizarSolicitudApi,
  } = useSolicitudesGE()
  const { items: mensajesBuzonCO, isLoading: cBuzon } = useMensajesBuzonCO()
  const cargandoAPI = cPersonas || cVinculos || cUnidades || cSolicitudes || cBuzon

  // Mock-first: sin mapeo sesión→persona se simula quién opera (conserje/residente) o administración.
  const [vista, setVista] = React.useState<"administrador" | "vecino">("administrador")
  const [actuandoComo, setActuandoComo] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  // Filtros de la grilla.
  const [fDesde, setFDesde] = React.useState("")
  const [fHasta, setFHasta] = React.useState("")
  const [fUnidad, setFUnidad] = React.useState("todas")
  const [fSolicitante, setFSolicitante] = React.useState("")
  const [fTipo, setFTipo] = React.useState<"todas" | TipoSolicitudGE>("todas")

      const [detalleId, setDetalleId] = React.useState<string | null>(null)
      const [comentarioTexto, setComentarioTexto] = React.useState("")
      const [nueva, setNueva] = React.useState<FormNueva | null>(null)

      // El detalle se deriva de la colección SWR: cada PUT revalida y el diálogo
      // refleja el ticket actualizado sin estado duplicado.
      const detalle = React.useMemo(
        () => solicitudesGE.find(s => s.id === detalleId) ?? null,
        [solicitudesGE, detalleId]
      )

  const nombrePersona = (id?: string) => {
    if (!id) return "—"
    const p = personas.find(x => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }
  const refUnidad = (id?: string) => {
    if (!id) return "—"
    const u = unidades.find(x => x.id === id)
    return u ? `${u.etiqueta} ${u.numero}` : id
  }

  const unidadVigenteDe = (personaId: string): string => {
    const v = vinculos.find(x => x.personaId === personaId && !x.fechaFin)
    return v?.unidadId ?? ""
  }

  const filtradas = solicitudesGE.filter(s => {
    if (vista === "vecino" && s.solicitantePersonaId !== (actuandoComo || personas[0]?.id)) return false
    if (s.estado !== "cerrado" || vista === "administrador") {
      // admin ve todo; vecino solo lo suyo (ya filtrado arriba)
    }
    if (fTipo !== "todas" && s.tipo !== fTipo) return false
    if (fUnidad !== "todas" && s.unidadId !== fUnidad) return false
    if (fDesde && s.fechaCreacion < fDesde) return false
    if (fHasta && s.fechaCreacion > fHasta) return false
    if (fSolicitante.trim()) {
      const nombre = nombrePersona(s.solicitantePersonaId).toLowerCase()
      if (!nombre.includes(fSolicitante.trim().toLowerCase())) return false
    }
    return true
  })

  // Vista resumen: los 10 registros más recientes primero.
  const recientes = [...filtradas].reverse().slice(0, 10)

  const contadores = ESTADO_LABEL ? (Object.keys(ESTADO_LABEL) as EstadoSolicitudGE[]).map(e => ({
    estado: e,
    total: solicitudesGE.filter(s => s.estado === e).length,
  })) : []

  // SLA: horas promedio creación → cierre (tickets resueltos/cerrados con historial).
  const slaPromedio = React.useMemo(() => {
    const conFin = solicitudesGE.filter(s => ["resuelto", "cerrado"].includes(s.estado))
    if (conFin.length === 0) return null
    const horas = conFin.map(s => {
      const inicio = s.historialEstados.find(h => h.a === "nuevo")?.fecha
      const fin = s.historialEstados.filter(h => ["resuelto", "cerrado"].includes(h.a)).at(-1)?.fecha
      if (!inicio || !fin) return null
      return (new Date(fin).getTime() - new Date(inicio).getTime()) / 3_600_000
    }).filter((h): h is number => h !== null)
    if (horas.length === 0) return null
    return horas.reduce((a, b) => a + b, 0) / horas.length
  }, [solicitudesGE])

      const abrirDetalle = async (ticket: SolicitudGE) => {
        setError(null)
        setDetalleId(ticket.id)
        setComentarioTexto("")
        // Workflow automático: primera lectura de administración → En Revisión.
        if (vista === "administrador" && ticket.estado === "nuevo") {
          const r = await actualizarSolicitudApi(ticket.id, {
            estado: "en_revision",
            historialEstados: [
              ...ticket.historialEstados,
              { de: ticket.estado, a: "en_revision", fecha: ahoraISO() },
            ],
          })
          if (!r.ok) setError(r.error ?? "No se pudo abrir el ticket.")
        }
      }

      /** Comentario + transición automática de estado (espejo de responderSolicitudGE legacy) vía PUT parcial. */
      const enviarComentario = async (autorRol: "administracion" | "solicitante") => {
        if (!detalle) return
        if (comentarioTexto.trim().length === 0) {
          setError("El comentario no puede estar vacío.")
          return
        }
        if (["resuelto", "cerrado"].includes(detalle.estado)) {
          setError(`No se puede comentar un ticket ${detalle.estado}.`)
          return
        }
        let nuevoEstado: EstadoSolicitudGE = detalle.estado
        if (
          autorRol === "administracion" &&
          ["en_revision", "en_proceso"].includes(detalle.estado)
        ) {
          nuevoEstado = "requiere_accion_vecino"
        } else if (
          autorRol === "solicitante" &&
          detalle.estado === "requiere_accion_vecino"
        ) {
          nuevoEstado = "en_proceso"
        }
        const r = await actualizarSolicitudApi(detalle.id, {
          estado: nuevoEstado,
          comentarios: [
            ...detalle.comentarios,
            {
              id: generarId("com"),
              autorRol,
              texto: comentarioTexto.trim(),
              fecha: ahoraISO(),
            },
          ],
          ...(nuevoEstado !== detalle.estado
            ? {
                historialEstados: [
                  ...detalle.historialEstados,
                  { de: detalle.estado, a: nuevoEstado, fecha: ahoraISO() },
                ],
              }
            : {}),
        })
        if (!r.ok) { setError(r.error ?? "No se pudo comentar."); return }
        setComentarioTexto("")
      }

      const resolver = async () => {
        if (!detalle) return
        if (comentarioTexto.trim().length === 0) {
          setError("La resolución es obligatoria para resolver el ticket.")
          return
        }
        if (detalle.estado === "cerrado") {
          setError("El ticket ya está cerrado.")
          return
        }
        const r = await actualizarSolicitudApi(detalle.id, {
          estado: "resuelto",
          resolucion: comentarioTexto.trim(),
          historialEstados: [
            ...detalle.historialEstados,
            { de: detalle.estado, a: "resuelto", fecha: ahoraISO() },
          ],
        })
        if (!r.ok) { setError(r.error ?? "No se pudo resolver."); return }
        setDetalleId(null)
        setComentarioTexto("")
      }

      const cerrar = async () => {
        if (!detalle) return
        if (detalle.estado !== "resuelto") {
          setError("Solo un ticket Resuelto puede pasar a Cerrado.")
          return
        }
        const r = await actualizarSolicitudApi(detalle.id, {
          estado: "cerrado",
          fechaCierre: hoyISO(),
          historialEstados: [
            ...detalle.historialEstados,
            { de: "resuelto", a: "cerrado", fecha: ahoraISO() },
          ],
        })
        if (!r.ok) { setError(r.error ?? "No se pudo cerrar."); return }
        setDetalleId(null)
      }

  const crearSolicitud = async () => {
    if (!nueva) return
    setError(null)
    const solicitante = nueva.solicitantePersonaId || (vista === "vecino" ? (actuandoComo || personas[0]?.id) : undefined)
    const unidadAuto = solicitante ? unidadVigenteDe(solicitante) : ""
    const unidadFinal = nueva.registradoPorConserje ? nueva.unidadId : (unidadAuto || nueva.unidadId || undefined)

    // Folio GE-#### calculado en cliente (misma regla que la acción legacy del store).
    const numeros = solicitudesGE
      .map(s => Number.parseInt(s.folio.replace(/^GE-/, ""), 10))
      .filter((n) => Number.isFinite(n))
    const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1

    const r = await crearSolicitudApi({
      id: generarId("sol"),
      folio: `GE-${String(siguiente).padStart(4, "0")}`,
      tipo: nueva.tipo,
      titulo: nueva.titulo,
      descripcion: nueva.descripcion,
      solicitantePersonaId: solicitante,
      unidadId: unidadFinal || undefined,
      estado: "nuevo",
      fechaCreacion: hoyISO(),
      comentarios: [],
      detalleGrabaciones: nueva.tipo === "grabaciones"
        ? { fechaSuceso: nueva.fechaSuceso, horaSuceso: nueva.horaSuceso, justificacion: nueva.justificacion }
        : undefined,
      detalleInsumos: nueva.tipo === "insumos"
        ? { areaDestino: nueva.areaDestino, materialSolicitado: nueva.materialSolicitado }
        : undefined,
      mensajeBuzonId: nueva.tipo === "buzon" ? nueva.mensajeBuzonId : undefined,
      historialEstados: [],
    })
    if (!r.ok) { setError(r.error ?? "No se pudo crear la solicitud."); return }
    setNueva(null)
  }

  if (cargandoAPI) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="h-64 rounded-lg bg-muted/30" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><IconClipboardList className="size-6" /> Solicitudes</h1>
          <p className="text-sm text-muted-foreground">Motor de tickets: insumos, grabaciones CCTV y buzón ciudadano, con workflow automático y SLA.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Vista:</Label>
            <Select value={vista} onValueChange={v => setVista(v as "administrador" | "vecino")}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="administrador">Administración</SelectItem>
                <SelectItem value="vecino">Vecino</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {vista === "vecino" && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Actuar como</Label>
              <Select value={actuandoComo || personas[0]?.id || ""} onValueChange={setActuandoComo}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {personas.filter(p => p.estadoCuenta === "activa").map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nombres} {p.apellidos}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={() => { setNueva({ ...FORM_NUEVA }); setError(null) }}>
            <IconPlus className="size-4 mr-1" /> Enviar Solicitud
          </Button>
        </div>
      </div>

      {/* Mini-dashboard: volumen por estado + SLA */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><IconGauge className="size-4" /> Panel de Control</CardTitle>
          <CardDescription>Volumen segmentado por estado y rendimiento SLA de resolución.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {contadores.map(c => (
            <Badge key={c.estado} variant="outline" className={`gap-1 border-transparent px-2 py-1 text-xs ${ESTADO_BADGE[c.estado]}`}>
              {ESTADO_LABEL[c.estado]}: {c.total}
            </Badge>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            SLA promedio resolución: {slaPromedio === null ? "sin datos" : `${slaPromedio.toFixed(1)} h`}
          </span>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Grilla */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bandeja de entrada</CardTitle>
          <CardDescription>Los 10 registros más recientes que cumplen el filtro.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-3">
            <IconFilter className="mb-2 size-4 text-muted-foreground" />
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" className="w-36" value={fDesde} onChange={e => setFDesde(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" className="w-36" value={fHasta} onChange={e => setFHasta(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unidad</Label>
              <Select value={fUnidad} onValueChange={setFUnidad}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.etiqueta} {u.numero}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Solicitante</Label>
              <Input className="w-40" value={fSolicitante} onChange={e => setFSolicitante(e.target.value)} placeholder="Nombre…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo de gestión</Label>
              <Select value={fTipo} onValueChange={v => setFTipo(v as typeof fTipo)}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las gestiones</SelectItem>
                  {(Object.keys(TIPO_LABEL) as TipoSolicitudGE[]).map(t => (
                    <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {recientes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin solicitudes para este filtro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">ID Ticket</th>
                    <th className="py-2 pr-3 font-medium">Tipo</th>
                    <th className="py-2 pr-3 font-medium">Fecha</th>
                    <th className="py-2 pr-3 font-medium">Unidad</th>
                    <th className="py-2 pr-3 font-medium">Estado breve</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {recientes.map(t => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{t.folio}</td>
                      <td className="py-2 pr-3">{TIPO_LABEL[t.tipo]}</td>
                      <td className="py-2 pr-3">{t.fechaCreacion}</td>
                      <td className="py-2 pr-3">{refUnidad(t.unidadId)}</td>
                      <td className="py-2 pr-3"><Badge className={`${ESTADO_BADGE[t.estado]} text-[10px]`}>{ESTADO_LABEL[t.estado]}</Badge></td>
                      <td className="py-2">
                        <Button size="sm" variant="ghost" onClick={() => abrirDetalle(t)}><IconEye className="size-4 mr-1" /> Ver</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalle del ticket */}
      <Dialog open={!!detalle} onOpenChange={v => { if (!v) { setDetalleId(null); setComentarioTexto("") } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detalle.folio}
                  <Badge className={`${ESTADO_BADGE[detalle.estado]} text-[10px]`}>{ESTADO_LABEL[detalle.estado]}</Badge>
                </DialogTitle>
                <DialogDescription>{TIPO_LABEL[detalle.tipo]} · {nombrePersona(detalle.solicitantePersonaId)} · Unidad {refUnidad(detalle.unidadId)}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 text-sm">
                <div>
                  <p className="font-medium">{detalle.titulo}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{detalle.descripcion}</p>
                </div>

                {detalle.detalleGrabaciones && (
                  <div className="rounded-md border p-2 text-xs">
                    <p className="font-medium uppercase tracking-wide text-muted-foreground mb-1">Detalle CCTV</p>
                    <p>Suceso: {detalle.detalleGrabaciones.fechaSuceso} a las {detalle.detalleGrabaciones.horaSuceso}</p>
                    <p className="mt-1 text-muted-foreground">{detalle.detalleGrabaciones.justificacion}</p>
                  </div>
                )}
                {detalle.detalleInsumos && (
                  <div className="rounded-md border p-2 text-xs">
                    <p className="font-medium uppercase tracking-wide text-muted-foreground mb-1">Insumos (catálogo pendiente a IR)</p>
                    <p>{detalle.detalleInsumos.materialSolicitado} — destino: {detalle.detalleInsumos.areaDestino}</p>
                  </div>
                )}
                {detalle.mensajeBuzonId && (
                  <p className="rounded-md border-l-2 border-primary/50 bg-muted/30 p-2 text-xs">
                    Vinculado al ticket ciudadano {mensajesBuzonCO.find(m => m.id === detalle.mensajeBuzonId)?.folio ?? detalle.mensajeBuzonId} del buzón CO.
                  </p>
                )}

                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Trazabilidad ({detalle.comentarios.length})</p>
                  {detalle.comentarios.length === 0 && <p className="text-xs text-muted-foreground">Sin comentarios aún.</p>}
                  <div className="flex flex-col gap-2">
                    {detalle.comentarios.map(c => (
                      <div key={c.id} className={`rounded-md border-l-2 p-2 text-xs ${c.autorRol === "administracion" ? "border-primary/60 bg-muted/30" : "border-sky-400/60 bg-sky-50/40 dark:bg-sky-950/20"}`}>
                        <p className="font-medium">{c.autorRol === "administracion" ? "Administración" : nombrePersona(detalle.solicitantePersonaId)} · {c.fecha.slice(0, 16).replace("T", " ")}</p>
                        <p>{c.texto}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {detalle.historialEstados.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Historial de estados</p>
                    <ul className="list-disc pl-5 text-xs text-muted-foreground">
                      {detalle.historialEstados.map((h, i) => (
                        <li key={i}>{h.de ? `${ESTADO_LABEL[h.de]} → ` : ""}{ESTADO_LABEL[h.a]} · {h.fecha.slice(0, 16).replace("T", " ")}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {detalle.resolucion && (
                  <div className="rounded-md border border-emerald-300/60 bg-emerald-50/40 p-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/20">
                    <p className="font-medium">Resolución</p>
                    <p>{detalle.resolucion}</p>
                  </div>
                )}

                {!["resuelto", "cerrado"].includes(detalle.estado) && (
                  <div className="space-y-2 rounded-md border p-3">
                    <Label className="text-xs">Nuevo comentario</Label>
                    <textarea
                      rows={2}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={comentarioTexto}
                      onChange={e => setComentarioTexto(e.target.value)}
                      placeholder={vista === "administrador" ? "Responde o solicita más datos al vecino…" : "Responde a la administración…"}
                    />
                    <div className="flex flex-wrap gap-2">
                      {vista === "administrador" ? (
                        <>
                          <Button size="sm" variant="outline" disabled={comentarioTexto.trim().length === 0} onClick={() => enviarComentario("administracion")}>Pedir datos al vecino</Button>
                          <Button size="sm" disabled={comentarioTexto.trim().length === 0} onClick={resolver}><IconCheck className="size-4 mr-1" /> Resolver con este texto</Button>
                        </>
                      ) : (
                        <Button size="sm" disabled={comentarioTexto.trim().length === 0} onClick={() => enviarComentario("solicitante")}>Responder como vecino</Button>
                      )}
                    </div>
                  </div>
                )}
                {vista === "administrador" && detalle.estado === "resuelto" && (
                  <Button size="sm" variant="outline" onClick={cerrar}>Cerrar ticket (SLA)</Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Nueva solicitud */}
      <Dialog open={!!nueva} onOpenChange={v => { if (!v) setNueva(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {nueva && (
            <>
              <DialogHeader>
                <DialogTitle>Nueva solicitud</DialogTitle>
                <DialogDescription>Tipologías NSGC: insumos (área destino), grabaciones CCTV (suceso + justificación) y buzón CO.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de gestión</Label>
                  <Select value={nueva.tipo} onValueChange={v => setNueva({ ...nueva, tipo: v as TipoSolicitudGE })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TIPO_LABEL) as TipoSolicitudGE[]).map(t => (
                        <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {nueva.tipo === "buzon" ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Mensaje del buzón CO</Label>
                    <Select value={nueva.mensajeBuzonId} onValueChange={v => {
                      const m = mensajesBuzonCO.find(x => x.id === v)
                      setNueva({ ...nueva, mensajeBuzonId: v, titulo: m ? `[Buzón ${m.folio}] ${m.asunto}` : "", descripcion: m?.cuerpo ?? "" })
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecciona un mensaje…" /></SelectTrigger>
                      <SelectContent>
                        {mensajesBuzonCO.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.folio} · {m.asunto}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {mensajesBuzonCO.length === 0 && <p className="text-xs text-muted-foreground">No hay mensajes en el buzón CO.</p>}
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Título</Label>
                      <Input value={nueva.titulo} onChange={e => setNueva({ ...nueva, titulo: e.target.value })} placeholder="Resume la solicitud" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Descripción</Label>
                      <textarea
                        rows={2}
                        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={nueva.descripcion}
                        onChange={e => setNueva({ ...nueva, descripcion: e.target.value })}
                      />
                    </div>
                  </>
                )}

                {nueva.tipo !== "buzon" && (
                  <div className="space-y-2 rounded-md border p-3">
                    {vista === "vecino" ? (
                      <p className="text-xs text-muted-foreground">Tu unidad y nombre se autocompletan desde tu vínculo vigente{unidadVigenteDe(nueva.solicitantePersonaId || actuandoComo || personas[0]?.id || "") ? ` (${refUnidad(unidadVigenteDe(nueva.solicitantePersonaId || actuandoComo || personas[0]?.id || ""))})` : ""}. Si no tienes vínculo activo, indica la unidad.</p>
                    ) : (
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={nueva.registradoPorConserje} onChange={e => setNueva({ ...nueva, registradoPorConserje: e.target.checked })} />
                        La registra el personal de conserjería: obliga a vincular unidad/residente.
                      </label>
                    )}
                    {nueva.registradoPorConserje && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">Residente solicitante (opcional)</Label>
                          <Select value={nueva.solicitantePersonaId || "ninguno"} onValueChange={v => setNueva({ ...nueva, solicitantePersonaId: v === "ninguno" ? "" : v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ninguno">Sin residente asociado</SelectItem>
                              {personas.filter(p => p.estadoCuenta === "activa").map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.nombres} {p.apellidos}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Unidad vinculada *</Label>
                          <Select value={nueva.unidadId || "ninguna"} onValueChange={v => setNueva({ ...nueva, unidadId: v === "ninguna" ? "" : v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ninguna">Sin unidad…</SelectItem>
                              {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.etiqueta} {u.numero}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {nueva.tipo === "grabaciones" && (
                  <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Fecha del suceso *</Label>
                      <Input type="date" value={nueva.fechaSuceso} onChange={e => setNueva({ ...nueva, fechaSuceso: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Hora del suceso *</Label>
                      <Input type="time" value={nueva.horaSuceso} onChange={e => setNueva({ ...nueva, horaSuceso: e.target.value })} />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">Justificación extendida * (mínimo 20 caracteres)</Label>
                      <textarea
                        rows={3}
                        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={nueva.justificacion}
                        onChange={e => setNueva({ ...nueva, justificacion: e.target.value })}
                        placeholder="Motivo y contexto detallado de la revisión…"
                      />
                    </div>
                  </div>
                )}

                {nueva.tipo === "insumos" && (
                  <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Área de destino *</Label>
                      <Input value={nueva.areaDestino} onChange={e => setNueva({ ...nueva, areaDestino: e.target.value })} placeholder="Ej: Conserjería Torre A" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Material solicitado * (ref. IR)</Label>
                      <Input value={nueva.materialSolicitado} onChange={e => setNueva({ ...nueva, materialSolicitado: e.target.value })} placeholder="Ej: Guantes nitrilo caja x100" />
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNueva(null)}>Cancelar</Button>
                <Button onClick={crearSolicitud}>Enviar Solicitud</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
