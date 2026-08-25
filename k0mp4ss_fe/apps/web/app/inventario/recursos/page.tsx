"use client"

import * as React from "react"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
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
  IconPackage,
  IconPlus,
  IconTool,
  IconAlertTriangle,
  IconKey,
  IconShirt,
  IconClipboardCheck,
} from "@tabler/icons-react"
import type {
  CategoriaRecursoIR,
  EstadoActivoIR,
  EstadoComodinIR,
  EstadoSolicitudInsumoIR,
  RecursoIR,
} from "@/lib/schemas"

const CATEGORIA_LABEL: Record<CategoriaRecursoIR, string> = {
  infraestructura: "Infraestructura",
  mobiliario: "Mobiliario y Herramientas",
  insumo: "Insumo / Consumible",
  epp: "EPP / Uniforme",
  acceso: "Llave / Credencial",
}

const ESTADO_ACTIVO_LABEL: Record<EstadoActivoIR, string> = {
  disponible: "Disponible",
  en_uso: "En Uso",
  reparacion: "Reparación",
  baja: "Baja",
}

const ESTADO_ACTIVO_BADGE: Record<EstadoActivoIR, string> = {
  disponible: "bg-emerald-600 hover:bg-emerald-700 text-white",
  en_uso: "bg-sky-600 hover:bg-sky-700 text-white",
  reparacion: "bg-amber-500 hover:bg-amber-600 text-white",
  baja: "bg-muted text-muted-foreground",
}

const ESTADO_SOLICITUD_LABEL: Record<EstadoSolicitudInsumoIR, string> = {
  pendiente: "Pendiente",
  entregada: "Entregada",
  rechazada: "Rechazada",
}

const COMODIN_LABEL: Record<EstadoComodinIR, string> = {
  no_comodin: "—",
  pendiente: "Decisión requerida",
  aprobada_creada: "Aprobado (creó artículo)",
  sustituida: "Sustituido",
  rechazada: "Rechazado",
}

interface FormRecurso {
  nombre: string
  categoria: CategoriaRecursoIR
  estadoActivo: EstadoActivoIR
  marca: string
  modelo: string
  microSectorId: string
  unidadId: string
  responsablePersonaId: string
  unidadMedidaId: string
  stock: number
  esCritico: boolean
  umbralCritico: string
  proveedor: string
  numeroFactura: string
  facturaUrl: string
  garantiaHasta: string
  talla: string
  renovacionMeses: string
  fichaTecnicaUrl: string
}

const FORM_RECURSO: FormRecurso = {
  nombre: "",
  categoria: "insumo",
  estadoActivo: "disponible",
  marca: "",
  modelo: "",
  microSectorId: "",
  unidadId: "",
  responsablePersonaId: "",
  unidadMedidaId: "",
  stock: 0,
  esCritico: false,
  umbralCritico: "",
  proveedor: "",
  numeroFactura: "",
  facturaUrl: "",
  garantiaHasta: "",
  talla: "",
  renovacionMeses: "",
  fichaTecnicaUrl: "",
}

const hoy = () => new Date().toISOString().slice(0, 10)

export default function RecursosPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const activosIR = useCompassStore(s => s.activosIR)
  const solicitudesInsumoIR = useCompassStore(s => s.solicitudesInsumoIR)
  const entregasEPP = useCompassStore(s => s.entregasEPP)
  const personas = useCompassStore(s => s.personas)
  const unidades = useCompassStore(s => s.unidades)
  const microSectores = useCompassStore(s => s.microSectores)
  const unidadesMedida = useCompassStore(s => s.maestros.unidadesMedida)

  const [error, setError] = React.useState<string | null>(null)
  const [fCategoria, setFCategoria] = React.useState<"todas" | CategoriaRecursoIR>("todas")
  const [fEstado, setFEstado] = React.useState<"todos" | EstadoActivoIR>("todos")
  const [formRecurso, setFormRecurso] = React.useState<FormRecurso | null>(null)
  const [editandoId, setEditandoId] = React.useState<string | null>(null)

  // Nueva solicitud de insumo.
  const [nuevaSol, setNuevaSol] = React.useState<{
    solicitantePersonaId: string
    recursoInsumoId: string
    comodin: boolean
    descripcionArticulo: string
    justificacionComodin: string
    cantidad: string
    areaDestino: string
  } | null>(null)

  const [nuevaEntrega, setNuevaEntrega] = React.useState<{ recursoId: string; personaId: string; talla: string; estado: "nuevo" | "usado" | "renovar" } | null>(null)

  const nombrePersona = (id?: string) => {
    if (!id) return "—"
    const p = personas.find(x => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }
  const refUbicacion = (r: RecursoIR) => {
    if (r.unidadId) {
      const u = unidades.find(x => x.id === r.unidadId)
      return u ? `${u.etiqueta} ${u.numero}` : r.unidadId
    }
    if (r.microSectorId) return microSectores.find(m => m.id === r.microSectorId)?.nombre ?? r.microSectorId
    return "—"
  }

  const filtrados = activosIR.filter(r => {
    if (fCategoria !== "todas" && r.categoria !== fCategoria) return false
    if (fEstado !== "todos" && r.estadoActivo !== fEstado) return false
    return true
  })

  const criticosBajoUmbral = activosIR.filter(r => r.esCritico && r.umbralCritico !== undefined && r.stock <= r.umbralCritico!)
  const noDevueltos = activosIR.filter(r => r.categoria === "acceso" && r.asignacionActual && r.asignacionActual.fecha < hoy())
  const pendientes = solicitudesInsumoIR.filter(s => s.estado === "pendiente")
  const comodinesPendientes = pendientes.filter(s => s.estadoComodin === "pendiente")

  const guardarRecurso = () => {
    if (!formRecurso) return
    setError(null)
    const payload: RecursoIR = {
      id: editandoId ?? `ir-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      nombre: formRecurso.nombre,
      categoria: formRecurso.categoria,
      estadoActivo: formRecurso.estadoActivo,
      stock: formRecurso.stock,
      esCritico: formRecurso.esCritico,
      ...(formRecurso.marca ? { marca: formRecurso.marca } : {}),
      ...(formRecurso.modelo ? { modelo: formRecurso.modelo } : {}),
      ...(formRecurso.fichaTecnicaUrl ? { fichaTecnicaUrl: formRecurso.fichaTecnicaUrl } : {}),
      ...(formRecurso.microSectorId ? { microSectorId: formRecurso.microSectorId } : {}),
      ...(formRecurso.unidadId ? { unidadId: formRecurso.unidadId } : {}),
      ...(formRecurso.responsablePersonaId ? { responsablePersonaId: formRecurso.responsablePersonaId } : {}),
      ...(formRecurso.unidadMedidaId ? { unidadMedidaId: formRecurso.unidadMedidaId } : {}),
      ...(formRecurso.esCritico && formRecurso.umbralCritico !== "" ? { umbralCritico: Number(formRecurso.umbralCritico) } : {}),
      ...(formRecurso.proveedor || formRecurso.numeroFactura || formRecurso.facturaUrl || formRecurso.garantiaHasta
        ? {
            cargoFIReferencia: "pendiente" as const,
            ...(formRecurso.proveedor ? { proveedor: formRecurso.proveedor } : {}),
            ...(formRecurso.numeroFactura ? { numeroFactura: formRecurso.numeroFactura } : {}),
            ...(formRecurso.facturaUrl ? { facturaUrl: formRecurso.facturaUrl } : {}),
            ...(formRecurso.garantiaHasta ? { garantiaHasta: formRecurso.garantiaHasta } : {}),
          }
        : {}),
      ...(formRecurso.talla ? { talla: formRecurso.talla } : {}),
      ...(formRecurso.renovacionMeses !== "" ? { renovacionMeses: Number(formRecurso.renovacionMeses) } : {}),
    }
    const r = useCompassStore.getState().saveRecursoIR(payload)
    if (!r.ok) { setError(r.error ?? "No se pudo guardar el recurso."); return }
    setFormRecurso(null)
    setEditandoId(null)
  }

  const editarRecurso = (r: RecursoIR) => {
    setError(null)
    setEditandoId(r.id)
    setFormRecurso({
      ...FORM_RECURSO,
      nombre: r.nombre,
      categoria: r.categoria,
      estadoActivo: r.estadoActivo,
      marca: r.marca ?? "",
      modelo: r.modelo ?? "",
      microSectorId: r.microSectorId ?? "",
      unidadId: r.unidadId ?? "",
      responsablePersonaId: r.responsablePersonaId ?? "",
      unidadMedidaId: r.unidadMedidaId ?? "",
      stock: r.stock,
      esCritico: r.esCritico,
      umbralCritico: r.umbralCritico?.toString() ?? "",
      proveedor: r.proveedor ?? "",
      numeroFactura: r.numeroFactura ?? "",
      facturaUrl: r.facturaUrl ?? "",
      garantiaHasta: r.garantiaHasta ?? "",
      talla: r.talla ?? "",
      renovacionMeses: r.renovacionMeses?.toString() ?? "",
      fichaTecnicaUrl: r.fichaTecnicaUrl ?? "",
    })
  }

  const crearSolicitud = () => {
    if (!nuevaSol) return
    setError(null)
    const r = useCompassStore.getState().saveSolicitudInsumoIR({
      id: `si-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      folio: "",
      solicitantePersonaId: nuevaSol.solicitantePersonaId,
      recursoInsumoId: nuevaSol.comodin ? undefined : nuevaSol.recursoInsumoId,
      comodin: nuevaSol.comodin
        ? { descripcionArticulo: nuevaSol.descripcionArticulo, justificacion: nuevaSol.justificacionComodin }
        : undefined,
      estadoComodin: "no_comodin",
      cantidad: Number(nuevaSol.cantidad),
      areaDestino: nuevaSol.areaDestino,
      estado: "pendiente",
      fechaSolicitud: hoy(),
    })
    if (!r.ok) { setError(r.error ?? "No se pudo crear la solicitud."); return }
    setNuevaSol(null)
  }

  if (!hasHydrated) {
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
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><IconPackage className="size-6" /> Recursos y EPP</h1>
          <p className="text-sm text-muted-foreground">Activos, insumos con stock crítico, protección personal y llaves — vinculados a EF y al Maestro de Personas.</p>
        </div>
      </div>

      {/* Alarmas de reposición */}
      {criticosBajoUmbral.length > 0 && (
        <Card className="border-amber-400/60 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="flex flex-wrap items-center gap-3 pt-4 text-sm">
            <IconAlertTriangle className="size-5 text-amber-600" />
            <span className="font-medium">Alarma de reposición ({criticosBajoUmbral.length}):</span>
            {criticosBajoUmbral.map(r => (
              <Badge key={r.id} variant="outline">{r.nombre}: {r.stock} ≤ umbral {r.umbralCritico}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Tabs defaultValue="catalogo">
        <TabsList>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="solicitudes">
            Solicitudes{comodinesPendientes.length > 0 ? ` (${comodinesPendientes.length} ⚠)` : ""}
          </TabsTrigger>
          <TabsTrigger value="epp">EPP</TabsTrigger>
          <TabsTrigger value="accesos">Accesos</TabsTrigger>
        </TabsList>

        {/* Catálogo */}
        <TabsContent value="catalogo" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <Button onClick={() => { setEditandoId(null); setFormRecurso({ ...FORM_RECURSO }); setError(null) }}>
              <IconPlus className="size-4 mr-1" /> Nuevo recurso
            </Button>
            <Select value={fCategoria} onValueChange={v => setFCategoria(v as typeof fCategoria)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las naturalezas</SelectItem>
                {(Object.keys(CATEGORIA_LABEL) as CategoriaRecursoIR[]).map(c => (
                  <SelectItem key={c} value={c}>{CATEGORIA_LABEL[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fEstado} onValueChange={v => setFEstado(v as typeof fEstado)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                {(Object.keys(ESTADO_ACTIVO_LABEL) as EstadoActivoIR[]).map(e => (
                  <SelectItem key={e} value={e}>{ESTADO_ACTIVO_LABEL[e]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="pt-4">
              {filtrados.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin recursos para este filtro.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Código</th>
                        <th className="py-2 pr-3 font-medium">Nombre</th>
                        <th className="py-2 pr-3 font-medium">Naturaleza</th>
                        <th className="py-2 pr-3 font-medium">Ubicación</th>
                        <th className="py-2 pr-3 font-medium">Responsable</th>
                        <th className="py-2 pr-3 font-medium">Stock</th>
                        <th className="py-2 pr-3 font-medium">Estado</th>
                        <th className="py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.map(r => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">{r.codigo}</td>
                          <td className="py-2 pr-3">{r.nombre}{r.esCritico ? <span title="Stock crítico"> ⚠️</span> : null}</td>
                          <td className="py-2 pr-3">{CATEGORIA_LABEL[r.categoria]}</td>
                          <td className="py-2 pr-3">{refUbicacion(r)}</td>
                          <td className="py-2 pr-3">{nombrePersona(r.responsablePersonaId)}</td>
                          <td className="py-2 pr-3">{r.stock}{r.umbralCritico !== undefined ? ` / umbral ${r.umbralCritico}` : ""}</td>
                          <td className="py-2 pr-3"><Badge className={`${ESTADO_ACTIVO_BADGE[r.estadoActivo]} text-[10px]`}>{ESTADO_ACTIVO_LABEL[r.estadoActivo]}</Badge></td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-1">
                              <Select value={r.estadoActivo} onValueChange={v => useCompassStore.getState().cambiarEstadoRecursoIR(r.id, v as EstadoActivoIR)}>
                                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {(Object.keys(ESTADO_ACTIVO_LABEL) as EstadoActivoIR[]).map(e => (
                                    <SelectItem key={e} value={e}>{ESTADO_ACTIVO_LABEL[e]}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button size="sm" variant="ghost" onClick={() => editarRecurso(r)}>Editar</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Solicitudes */}
        <TabsContent value="solicitudes" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <Button onClick={() => setNuevaSol({ solicitantePersonaId: "", recursoInsumoId: "", comodin: false, descripcionArticulo: "", justificacionComodin: "", cantidad: "1", areaDestino: "" })}>
              <IconPlus className="size-4 mr-1" /> Nueva solicitud
            </Button>
            <span className="text-xs text-muted-foreground">El ciclo lo cierra administración/jefatura marcando la entrega.</span>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Gestión trazable de insumos</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {solicitudesInsumoIR.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin solicitudes registradas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Folio</th>
                        <th className="py-2 pr-3 font-medium">Solicitante</th>
                        <th className="py-2 pr-3 font-medium">Artículo</th>
                        <th className="py-2 pr-3 font-medium">Destino</th>
                        <th className="py-2 pr-3 font-medium">Estado</th>
                        <th className="py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...solicitudesInsumoIR].reverse().map(s => {
                        const recurso = activosIR.find(a => a.id === s.recursoInsumoId)
                        return (
                          <tr key={s.id} className="border-b last:border-0 align-top">
                            <td className="py-2 pr-3 font-mono text-xs">{s.folio}</td>
                            <td className="py-2 pr-3">{nombrePersona(s.solicitantePersonaId)}</td>
                            <td className="py-2 pr-3">
                              {recurso?.nombre ?? s.comodin?.descripcionArticulo ?? "—"}
                              <span className="block text-xs text-muted-foreground">×{s.cantidad}
                                {s.estadoComodin !== "no_comodin" ? ` · Comodín: ${COMODIN_LABEL[s.estadoComodin]}` : ""}
                              </span>
                            </td>
                            <td className="py-2 pr-3">{s.areaDestino}</td>
                            <td className="py-2 pr-3">
                              <Badge variant={s.estado === "pendiente" ? "outline" : s.estado === "entregada" ? "default" : "destructive"} className="text-[10px]">
                                {ESTADO_SOLICITUD_LABEL[s.estado]}
                              </Badge>
                            </td>
                            <td className="py-2">
                              {s.estado === "pendiente" && s.recursoInsumoId && (
                                <Button size="sm" variant="outline" onClick={() => {
                                  const r = useCompassStore.getState().entregarSolicitudInsumoIR(s.id)
                                  if (!r.ok) setError(r.error ?? "No se pudo entregar.")
                                }}>
                                  <IconClipboardCheck className="size-4 mr-1" /> Entregar
                                </Button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resolución de comodines */}
          {comodinesPendientes.map(s => (
            <Card key={s.id} className="border-destructive/40 bg-destructive/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><IconAlertTriangle className="size-4 text-destructive" /> Comodín {s.folio} requiere decisión</CardTitle>
                <CardDescription>
                  {nombrePersona(s.solicitantePersonaId)} pidió «{s.comodin?.descripcionArticulo}» ×{s.cantidad} para {s.areaDestino}. Justificación: {s.comodin?.justificacion}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 pt-0">
                <Button size="sm" onClick={() => {
                  const r = useCompassStore.getState().resolverComodinIR(s.id, "aprobar_crear")
                  if (!r.ok) setError(r.error ?? "No se pudo aprobar.")
                }}>Aprobar y crear en catálogo</Button>
                <Select onValueChange={v => {
                  const r = useCompassStore.getState().resolverComodinIR(s.id, "sustituir", { recursoSustitutoId: v })
                  if (!r.ok) setError(r.error ?? "No se pudo sustituir.")
                }}>
                  <SelectTrigger className="w-64"><SelectValue placeholder="Sustituir por artículo similar…" /></SelectTrigger>
                  <SelectContent>
                    {activosIR.filter(a => a.categoria === "insumo").map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.nombre} (stock {a.stock})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => {
                  const justificacion = window.prompt("Justificación del rechazo (obligatoria):")
                  if (!justificacion?.trim()) { setError("El rechazo exige justificación obligatoria."); return }
                  const r = useCompassStore.getState().resolverComodinIR(s.id, "rechazar", { justificacion })
                  if (!r.ok) setError(r.error ?? "No se pudo rechazar.")
                }}>Rechazar</Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* EPP */}
        <TabsContent value="epp" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <Button onClick={() => setNuevaEntrega({ recursoId: "", personaId: "", talla: "", estado: "nuevo" })}>
              <IconShirt className="size-4 mr-1" /> Registrar entrega EPP
            </Button>
            <span className="text-xs text-muted-foreground">Cada entrega individual alimenta el cumplimiento de Seguridad Laboral.</span>
          </div>
          <Card>
            <CardContent className="pt-4">
              {entregasEPP.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin entregas de EPP registradas.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">EPP</th>
                      <th className="py-2 pr-3 font-medium">Receptor</th>
                      <th className="py-2 pr-3 font-medium">Fecha</th>
                      <th className="py-2 pr-3 font-medium">Talla</th>
                      <th className="py-2 pr-3 font-medium">Próx. renovación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entregasEPP.map(e => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">{activosIR.find(a => a.id === e.recursoId)?.nombre ?? e.recursoId}</td>
                        <td className="py-2 pr-3">{nombrePersona(e.personaId)}</td>
                        <td className="py-2 pr-3">{e.fechaEntrega}</td>
                        <td className="py-2 pr-3">{e.talla ?? "—"}</td>
                        <td className={`py-2 pr-3 ${e.proximaRenovacion && e.proximaRenovacion < hoy() ? "font-medium text-destructive" : ""}`}>{e.proximaRenovacion ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Accesos */}
        <TabsContent value="accesos" className="flex flex-col gap-3">
          {noDevueltos.length > 0 && (
            <Card className="border-amber-400/60 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
              <CardContent className="flex flex-wrap items-center gap-2 pt-4 text-sm">
                <IconKey className="size-4 text-amber-600" />
                <span className="font-medium">Llaves/accesos no devueltos ({noDevueltos.length}):</span>
                {noDevueltos.map(r => <Badge key={r.id} variant="outline">{r.nombre} → {nombrePersona(r.asignacionActual!.personaId)} desde {r.asignacionActual!.fecha}</Badge>)}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">¿Quién tiene qué?</CardTitle>
              <CardDescription>Asignaciones vigentes de llaves físicas y credenciales vinculadas a unidades.</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const accesos = activosIR.filter(r => r.categoria === "acceso")
                if (accesos.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Sin llaves ni credenciales registradas. Créalas en el Catálogo.</p>
                return (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Elemento</th>
                        <th className="py-2 pr-3 font-medium">Unidad</th>
                        <th className="py-2 pr-3 font-medium">Asignado a</th>
                        <th className="py-2 pr-3 font-medium">Desde</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {accesos.map(a => (
                        <tr key={a.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">{a.nombre}</td>
                          <td className="py-2 pr-3">{refUbicacion(a)}</td>
                          <td className="py-2 pr-3">{a.asignacionActual ? nombrePersona(a.asignacionActual.personaId) : <span className="text-muted-foreground">Disponible</span>}</td>
                          <td className="py-2 pr-3">{a.asignacionActual?.fecha ?? "—"}</td>
                          <td className="py-2">
                            {a.asignacionActual ? (
                              <Button size="sm" variant="outline" onClick={() => {
                                const r = useCompassStore.getState().devolverAccesoIR(a.id)
                                if (!r.ok) setError(r.error ?? "No se pudo devolver.")
                              }}>Registrar devolución</Button>
                            ) : (
                              <Select onValueChange={v => {
                                const r = useCompassStore.getState().asignarAccesoIR(a.id, v)
                                if (!r.ok) setError(r.error ?? "No se pudo asignar.")
                              }}>
                                <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Asignar a…" /></SelectTrigger>
                                <SelectContent>
                                  {personas.filter(p => p.estadoCuenta === "activa").map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.nombres} {p.apellidos}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Formulario alta/edición de recurso */}
      <Dialog open={!!formRecurso} onOpenChange={v => { if (!v) { setFormRecurso(null); setEditandoId(null) } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {formRecurso && (
            <>
              <DialogHeader>
                <DialogTitle>{editandoId ? "Editar recurso" : "Nuevo recurso"}</DialogTitle>
                <DialogDescription>Naturaleza NSGC: infraestructura, mobiliario, insumo con stock crítico, EPP o llave/credencial.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Nombre *</Label>
                    <Input value={formRecurso.nombre} onChange={e => setFormRecurso({ ...formRecurso, nombre: e.target.value })} placeholder="Ej: Cloro bidón 5L" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Naturaleza</Label>
                    <Select value={formRecurso.categoria} onValueChange={v => setFormRecurso({ ...formRecurso, categoria: v as CategoriaRecursoIR })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(CATEGORIA_LABEL) as CategoriaRecursoIR[]).map(c => (
                          <SelectItem key={c} value={c}>{CATEGORIA_LABEL[c]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Marca</Label>
                    <Input value={formRecurso.marca} onChange={e => setFormRecurso({ ...formRecurso, marca: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Modelo</Label>
                    <Input value={formRecurso.modelo} onChange={e => setFormRecurso({ ...formRecurso, modelo: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Micro sector EF {formRecurso.categoria === "infraestructura" ? "*" : ""}</Label>
                    <Select value={formRecurso.microSectorId || "ninguno"} onValueChange={v => setFormRecurso({ ...formRecurso, microSectorId: v === "ninguno" ? "" : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguno">Ninguno</SelectItem>
                        {microSectores.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unidad EF {(formRecurso.categoria === "infraestructura" || formRecurso.categoria === "acceso") ? "(alternativa)" : ""}</Label>
                    <Select value={formRecurso.unidadId || "ninguna"} onValueChange={v => setFormRecurso({ ...formRecurso, unidadId: v === "ninguna" ? "" : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguna">Ninguna</SelectItem>
                        {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.etiqueta} {u.numero}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Responsable (MP)</Label>
                  <Select value={formRecurso.responsablePersonaId || "ninguno"} onValueChange={v => setFormRecurso({ ...formRecurso, responsablePersonaId: v === "ninguno" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguno">Sin responsable</SelectItem>
                      {personas.filter(p => p.estadoCuenta === "activa").map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nombres} {p.apellidos}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formRecurso.categoria === "insumo" && (
                  <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Unidad de medida</Label>
                      <Select value={formRecurso.unidadMedidaId || "ninguna"} onValueChange={v => setFormRecurso({ ...formRecurso, unidadMedidaId: v === "ninguna" ? "" : v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ninguna">Ninguna</SelectItem>
                          {unidadesMedida.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Stock inicial *</Label>
                      <Input type="number" min={0} value={formRecurso.stock} onChange={e => setFormRecurso({ ...formRecurso, stock: Number(e.target.value) })} />
                    </div>
                    <label className="flex items-center gap-2 text-xs md:col-span-2">
                      <input type="checkbox" checked={formRecurso.esCritico} onChange={e => setFormRecurso({ ...formRecurso, esCritico: e.target.checked })} />
                      Stock crítico: levanta Alarma de Reposición automática al llegar al umbral
                    </label>
                    {formRecurso.esCritico && (
                      <div className="space-y-1">
                        <Label className="text-xs">Umbral crítico *</Label>
                        <Input type="number" min={0} value={formRecurso.umbralCritico} onChange={e => setFormRecurso({ ...formRecurso, umbralCritico: e.target.value })} placeholder="Ej: 5" />
                      </div>
                    )}
                  </div>
                )}

                {formRecurso.categoria === "epp" && (
                  <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Talla</Label>
                      <Input value={formRecurso.talla} onChange={e => setFormRecurso({ ...formRecurso, talla: e.target.value })} placeholder="Ej: M" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Renovación cada (meses)</Label>
                      <Input type="number" min={1} value={formRecurso.renovacionMeses} onChange={e => setFormRecurso({ ...formRecurso, renovacionMeses: e.target.value })} placeholder="Ej: 6" />
                    </div>
                  </div>
                )}

                <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
                  <p className="md:col-span-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ingreso / compra (metadatos D1 · referencia FI pendiente)</p>
                  <div className="space-y-1">
                    <Label className="text-xs">Proveedor</Label>
                    <Input value={formRecurso.proveedor} onChange={e => setFormRecurso({ ...formRecurso, proveedor: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">N° factura</Label>
                    <Input value={formRecurso.numeroFactura} onChange={e => setFormRecurso({ ...formRecurso, numeroFactura: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">URL factura (D1)</Label>
                    <Input value={formRecurso.facturaUrl} onChange={e => setFormRecurso({ ...formRecurso, facturaUrl: e.target.value })} placeholder="https://…" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Garantía hasta</Label>
                    <Input type="date" value={formRecurso.garantiaHasta} onChange={e => setFormRecurso({ ...formRecurso, garantiaHasta: e.target.value })} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">URL ficha técnica (D1)</Label>
                    <Input value={formRecurso.fichaTecnicaUrl} onChange={e => setFormRecurso({ ...formRecurso, fichaTecnicaUrl: e.target.value })} placeholder="https://…" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setFormRecurso(null); setEditandoId(null) }}>Cancelar</Button>
                <Button onClick={guardarRecurso}><IconTool className="size-4 mr-1" /> Guardar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Nueva solicitud de insumo */}
      <Dialog open={!!nuevaSol} onOpenChange={v => { if (!v) setNuevaSol(null) }}>
        <DialogContent className="sm:max-w-lg">
          {nuevaSol && (
            <>
              <DialogHeader>
                <DialogTitle>Nueva solicitud de insumo</DialogTitle>
                <DialogDescription>Gestión operativa trazable: quién pide, qué tipo y para qué ubicación.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Solicitante *</Label>
                  <Select value={nuevaSol.solicitantePersonaId || ""} onValueChange={v => setNuevaSol({ ...nuevaSol, solicitantePersonaId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {personas.filter(p => p.estadoCuenta === "activa").map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nombres} {p.apellidos}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={nuevaSol.comodin} onChange={e => setNuevaSol({ ...nuevaSol, comodin: e.target.checked })} />
                  Artículo no catalogado (comodín): genera alerta crítica al administrador
                </label>
                {nuevaSol.comodin ? (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Descripción del artículo *</Label>
                      <Input value={nuevaSol.descripcionArticulo} onChange={e => setNuevaSol({ ...nuevaSol, descripcionArticulo: e.target.value })} placeholder="Ej: Escobillón industrial" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Justificación * (mínimo 20 caracteres)</Label>
                      <textarea
                        rows={2}
                        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={nuevaSol.justificacionComodin}
                        onChange={e => setNuevaSol({ ...nuevaSol, justificacionComodin: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-xs">Artículo del catálogo *</Label>
                    <Select value={nuevaSol.recursoInsumoId || ""} onValueChange={v => setNuevaSol({ ...nuevaSol, recursoInsumoId: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                      <SelectContent>
                        {activosIR.filter(a => a.categoria === "insumo").map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.nombre} (stock {a.stock})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Cantidad *</Label>
                    <Input type="number" min={1} value={nuevaSol.cantidad} onChange={e => setNuevaSol({ ...nuevaSol, cantidad: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Área destino *</Label>
                    <Input value={nuevaSol.areaDestino} onChange={e => setNuevaSol({ ...nuevaSol, areaDestino: e.target.value })} placeholder="Ej: Piso 1 Torre A" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNuevaSol(null)}>Cancelar</Button>
                <Button onClick={crearSolicitud}>Enviar solicitud</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Registrar entrega EPP */}
      <Dialog open={!!nuevaEntrega} onOpenChange={v => { if (!v) setNuevaEntrega(null) }}>
        <DialogContent className="sm:max-w-md">
          {nuevaEntrega && (
            <>
              <DialogHeader>
                <DialogTitle>Entrega individual de EPP</DialogTitle>
                <DialogDescription>Fecha, talla y estado del elemento entregado; renovación automática según ciclo.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Elemento EPP *</Label>
                  <Select value={nuevaEntrega.recursoId || ""} onValueChange={v => setNuevaEntrega({ ...nuevaEntrega, recursoId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {activosIR.filter(a => a.categoria === "epp").map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.nombre}{a.renovacionMeses ? ` (renovación ${a.renovacionMeses}m)` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Entregado a *</Label>
                  <Select value={nuevaEntrega.personaId || ""} onValueChange={v => setNuevaEntrega({ ...nuevaEntrega, personaId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                    <SelectContent>
                      {personas.filter(p => p.estadoCuenta === "activa").map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nombres} {p.apellidos}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Estado</Label>
                  <Select value={nuevaEntrega.estado} onValueChange={v => setNuevaEntrega({ ...nuevaEntrega, estado: v as typeof nuevaEntrega.estado })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nuevo">Nuevo</SelectItem>
                      <SelectItem value="usado">Usado</SelectItem>
                      <SelectItem value="renovar">Renovar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNuevaEntrega(null)}>Cancelar</Button>
                <Button onClick={() => {
                  if (!nuevaEntrega.recursoId || !nuevaEntrega.personaId) { setError("Selecciona elemento EPP y receptor."); return }
                  const r = useCompassStore.getState().registrarEntregaEPP({
                    id: `epp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                    recursoId: nuevaEntrega.recursoId,
                    personaId: nuevaEntrega.personaId,
                    fechaEntrega: hoy(),
                    estado: nuevaEntrega.estado,
                    ...(nuevaEntrega.talla ? { talla: nuevaEntrega.talla } : {}),
                  })
                  if (!r.ok) { setError(r.error ?? "No se pudo registrar."); return }
                  setNuevaEntrega(null)
                }}>Registrar entrega</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
