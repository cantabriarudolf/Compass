"use client"

import * as React from "react"
import { mutate as mutateGlobal } from "swr"
import { useTrabajosMT, useProyectosMT, verificarGarantiasMT } from "@/lib/api/use-mt"
import { useRecursosIR } from "@/lib/api/use-ir"
import { usePersonas } from "@/lib/api/use-personas"
import { useUnidades } from "@/lib/api/use-unidades"
import { useMicroSectores } from "@/lib/api/use-micro-sectores"
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
  IconTool,
  IconPlus,
  IconCalendarEvent,
  IconShieldCheck,
} from "@tabler/icons-react"
import type {
  EstadoPagoMT,
  EstadoTrabajoMT,
  PrioridadMT,
  ProyectoMT,
  TrabajoMT,
} from "@/lib/schemas"

const PRIORIDAD_LABEL: Record<PrioridadMT, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  emergencia: "Emergencia/Crítico",
}

const ESTADO_TRABAJO_LABEL: Record<EstadoTrabajoMT, string> = {
  planificado: "Planificado",
  en_curso: "En Curso",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
}

const ESTADO_TRABAJO_BADGE: Record<EstadoTrabajoMT, string> = {
  planificado: "bg-sky-600 hover:bg-sky-700 text-white",
  en_curso: "bg-amber-500 hover:bg-amber-600 text-white",
  finalizado: "bg-emerald-600 hover:bg-emerald-700 text-white",
  cancelado: "bg-muted text-muted-foreground",
}

const PAGO_LABEL: Record<EstadoPagoMT, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagado: "Pagado",
}

const ORIGEN_LABEL: Record<string, string> = {
  gasto_comun: "Gasto Común",
  fondo_reserva: "Fondo de Reserva",
  fondo_especial: "Fondo Especial",
  pendiente_definir: "Por definir",
}

const ESTADO_PROYECTO_LABEL: Record<ProyectoMT["estado"], string> = {
  planificado: "Planificado",
  en_ejecucion: "En Ejecución",
  completado: "Completado",
  descartado: "Descartado",
}

interface FormTrabajo {
  titulo: string
  descripcion: string
  unidadId: string
  microSectorId: string
  activoIRId: string
  responsablePersonaId: string
  proveedorNombre: string
  proveedorContacto: string
  prioridad: PrioridadMT
  fechaProgramada: string
  costoTotal: string
  origenFondos: "gasto_comun" | "fondo_reserva" | "fondo_especial" | "pendiente_definir"
  garantiaInicio: string
  garantiaFin: string
  esPreventivo: boolean
  periodicidadMeses: string
}

const FORM_TRABAJO: FormTrabajo = {
  titulo: "",
  descripcion: "",
  unidadId: "",
  microSectorId: "",
  activoIRId: "",
  responsablePersonaId: "",
  proveedorNombre: "",
  proveedorContacto: "",
  prioridad: "media",
  fechaProgramada: "",
  costoTotal: "",
  origenFondos: "gasto_comun",
  garantiaInicio: "",
  garantiaFin: "",
  esPreventivo: false,
  periodicidadMeses: "",
}

const hoy = () => new Date().toISOString().slice(0, 10)

export default function ProyectosPage() {
  // Lecturas de dominio vía hooks SWR (BD fuente de verdad).
  const { items: trabajosMT, isLoading: cargandoTrabajos, create: crearTrabajo, update: actualizarTrabajo } = useTrabajosMT()
  const { items: proyectosMT, isLoading: cargandoProyectos, create: crearProyecto, remove: eliminarProyecto } = useProyectosMT()
  const { personas, isLoading: cargandoPersonas } = usePersonas()
  const { items: unidades, isLoading: cargandoUnidades } = useUnidades()
  const { items: microSectores, isLoading: cargandoMicro } = useMicroSectores()
  const { items: activosIR, isLoading: cargandoRecursos } = useRecursosIR()
  const cargando = cargandoTrabajos || cargandoProyectos || cargandoPersonas || cargandoUnidades || cargandoMicro || cargandoRecursos

  const [error, setError] = React.useState<string | null>(null)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<FormTrabajo | null>(null)
  const [editandoId, setEditandoId] = React.useState<string | null>(null)

  const nombrePersona = (id?: string) => {
    if (!id) return "—"
    const p = personas.find(x => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }
  const refUbicacion = (t: TrabajoMT) => {
    if (t.unidadId) {
      const u = unidades.find(x => x.id === t.unidadId)
      if (u) return `${u.etiqueta} ${u.numero}`
    }
    if (t.microSectorId) return microSectores.find(m => m.id === t.microSectorId)?.nombre ?? t.microSectorId
    return "—"
  }

  const ordenados = [...trabajosMT].reverse()
  // Tablero preventivo: próximos vencimientos ordenados con vencidos destacados.
  const preventivos = trabajosMT
    .filter(t => t.preventivo && ["planificado", "en_curso"].includes(t.estado))
    .sort((a, b) => (a.fechaProgramada ?? "9999").localeCompare(b.fechaProgramada ?? "9999"))

  const guardarTrabajo = async (): Promise<void> => {
    if (!form) return
    setError(null)
    const payload: TrabajoMT = {
      id: editandoId ?? `mt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      folio: editandoId ? trabajosMT.find(t => t.id === editandoId)!.folio : `MT-${Date.now().toString(36).toUpperCase()}`,
      titulo: form.titulo,
      descripcion: form.descripcion,
      estado: editandoId ? trabajosMT.find(t => t.id === editandoId)!.estado : "planificado",
      prioridad: form.prioridad,
      costoTotal: Number(form.costoTotal || 0),
      origenFondos: form.origenFondos,
      estadoPago: "pendiente",
      alertaGarantiaEnviada: false,
      evidencias: [],
      cargoFIReferencia: "pendiente",
      ...(form.unidadId ? { unidadId: form.unidadId } : {}),
      ...(form.microSectorId ? { microSectorId: form.microSectorId } : {}),
      ...(form.activoIRId ? { activoIRId: form.activoIRId } : {}),
      ...(form.responsablePersonaId ? { responsablePersonaId: form.responsablePersonaId } : {}),
      ...(form.proveedorNombre ? { proveedor: { nombre: form.proveedorNombre, ...(form.proveedorContacto ? { contacto: form.proveedorContacto } : {}) } } : {}),
      ...(form.fechaProgramada ? { fechaProgramada: form.fechaProgramada } : {}),
      ...(form.garantiaInicio ? { garantiaInicio: form.garantiaInicio } : {}),
      ...(form.garantiaFin ? { garantiaFin: form.garantiaFin } : {}),
      ...(form.esPreventivo && form.periodicidadMeses !== "" ? { preventivo: { periodicidadMeses: Number(form.periodicidadMeses) } } : {}),
    }
    const r = editandoId
      ? await actualizarTrabajo(editandoId, payload)
      : await crearTrabajo({ ...payload, id: `mt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` })
    if (!r.ok) { setError(r.error ?? "No se pudo guardar el trabajo."); return }
    setForm(null)
    setEditandoId(null)
  }

  if (cargando) {
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
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><IconTool className="size-6" /> Mantenimiento y Proyectos</h1>
          <p className="text-sm text-muted-foreground">Trabajos y obras con garantías y pagos; prevención con ciclos automáticos; proyectos de largo plazo.</p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {msg && <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p>}

      <Tabs defaultValue="trabajos">
        <TabsList>
          <TabsTrigger value="trabajos">Trabajos</TabsTrigger>
          <TabsTrigger value="prevencion"><IconCalendarEvent className="size-4 mr-1" /> Prevención</TabsTrigger>
          <TabsTrigger value="proyectos">Proyectos</TabsTrigger>
        </TabsList>

        {/* Trabajos */}
        <TabsContent value="trabajos" className="flex flex-col gap-3">
          <div>
            <Button onClick={() => { setEditandoId(null); setForm({ ...FORM_TRABAJO }); setError(null) }}>
              <IconPlus className="size-4 mr-1" /> Nuevo trabajo
            </Button>
          </div>
          <Card>
            <CardContent className="pt-4">
              {ordenados.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin trabajos registrados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Folio</th>
                        <th className="py-2 pr-3 font-medium">Trabajo</th>
                        <th className="py-2 pr-3 font-medium">Ubicación</th>
                        <th className="py-2 pr-3 font-medium">Responsable</th>
                        <th className="py-2 pr-3 font-medium">Prioridad</th>
                        <th className="py-2 pr-3 font-medium">Estado</th>
                        <th className="py-2 pr-3 font-medium">Costo / Pago</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordenados.map(t => (
                        <tr key={t.id} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-3 font-mono text-xs">{t.folio}</td>
                          <td className="py-2 pr-3">
                            {t.titulo}
                            {t.preventivo && <Badge variant="outline" className="ml-1 text-[9px]">cada {t.preventivo.periodicidadMeses}m</Badge>}
                          </td>
                          <td className="py-2 pr-3">{refUbicacion(t)}</td>
                          <td className="py-2 pr-3">{t.responsablePersonaId ? nombrePersona(t.responsablePersonaId) : t.proveedor?.nombre}</td>
                          <td className="py-2 pr-3">{PRIORIDAD_LABEL[t.prioridad]}</td>
                          <td className="py-2 pr-3"><Badge className={`${ESTADO_TRABAJO_BADGE[t.estado]} text-[10px]`}>{ESTADO_TRABAJO_LABEL[t.estado]}</Badge></td>
                          <td className="py-2 pr-3">${t.costoTotal.toLocaleString("es-CL")}<span className="block text-xs text-muted-foreground">{PAGO_LABEL[t.estadoPago]}</span></td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-1">
                              {t.estado === "planificado" && (
                                <Button size="sm" variant="outline" onClick={async () => {
                                  // P2 E2E-FULL-VERDE: transición vía API REST (el store legacy
                                  // no ve los trabajos creados en BD y el Iniciar era no-op).
                                  // Se espera la revalidación SWR para que la fila refleje el
                                  // estado sin race (el GET tarda segundos bajo carga dev).
                                  const r = await actualizarTrabajo(t.id, { estado: "en_curso", fechaInicio: new Date().toISOString().slice(0, 10) })
                                  if (!r.ok) { setError(r.error ?? ""); return }
                                  await mutateGlobal("/api/mt/trabajos?pageSize=100")
                                }}>Iniciar</Button>
                              )}
                              {t.estado === "en_curso" && (
                                <Button size="sm" onClick={async () => {
                                  const r = await actualizarTrabajo(t.id, { estado: "finalizado", fechaTermino: new Date().toISOString().slice(0, 10) })
                                  if (!r.ok) { setError(r.error ?? ""); return }
                                  await mutateGlobal("/api/mt/trabajos?pageSize=100")
                                }}>Finalizar</Button>
                              )}
                              {["planificado", "en_curso"].includes(t.estado) && (
                                <Button size="sm" variant="ghost" onClick={async () => {
                                  const r = await actualizarTrabajo(t.id, { estado: "cancelado" })
                                  if (!r.ok) { setError(r.error ?? ""); return }
                                  await mutateGlobal("/api/mt/trabajos?pageSize=100")
                                }}>Cancelar</Button>
                              )}
                              <Select value={t.estadoPago} onValueChange={v => {
                                // Paridad con actualizarPagoTrabajoMT legacy: PUT parcial del trabajo.
                                void (async () => {
                                  const r = await actualizarTrabajo(t.id, { estadoPago: v as EstadoPagoMT })
                                  if (!r.ok) setError(r.error ?? "")
                                })()
                              }}>
                                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {(Object.keys(PAGO_LABEL) as EstadoPagoMT[]).map(p => (
                                    <SelectItem key={p} value={p}>{PAGO_LABEL[p]}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button size="sm" variant="ghost" onClick={() => editar(t)}>Editar</Button>
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

        {/* Prevención */}
        <TabsContent value="prevencion" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="outline" onClick={() => {
              void (async () => {
                const r = await verificarGarantiasMT()
                if (!r.ok) setError(r.error ?? "")
                else setMsg("Garantías verificadas: alertas nuevas notificadas a administración.")
              })()
            }}>
              <IconShieldCheck className="size-4 mr-1" /> Verificar garantías
            </Button>
            <span className="text-xs text-muted-foreground">Alerta garantías ≤30 días o vencidas (idempotente por trabajo).</span>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Próximos vencimientos de mantención obligatoria</CardTitle>
              <CardDescription>Ciclos generados automáticamente al finalizar cada mantención preventiva.</CardDescription>
            </CardHeader>
            <CardContent>
              {preventivos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin mantenciones preventivas programadas.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Folio</th>
                      <th className="py-2 pr-3 font-medium">Mantención</th>
                      <th className="py-2 pr-3 font-medium">Fecha programada</th>
                      <th className="py-2 pr-3 font-medium">Ciclo</th>
                      <th className="py-2 pr-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preventivos.map(t => {
                      const vencido = Boolean(t.fechaProgramada && t.fechaProgramada < hoy())
                      return (
                        <tr key={t.id} className={`border-b last:border-0 ${vencido ? "font-medium text-destructive" : ""}`}>
                          <td className="py-2 pr-3 font-mono text-xs">{t.folio}</td>
                          <td className="py-2 pr-3">{t.titulo}</td>
                          <td className="py-2 pr-3">{t.fechaProgramada ?? "—"}{vencido ? " ⚠️ vencido" : ""}</td>
                          <td className="py-2 pr-3">cada {t.preventivo!.periodicidadMeses} mes(es)</td>
                          <td className="py-2 pr-3">{ESTADO_TRABAJO_LABEL[t.estado]}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Proyectos */}
        <TabsContent value="proyectos" className="flex flex-col gap-3">
          <FormProyectos />
        </TabsContent>
      </Tabs>

      {/* Formulario trabajo */}
      <Dialog open={!!form} onOpenChange={v => { if (!v) { setForm(null); setEditandoId(null) } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {form && (
            <>
              <DialogHeader>
                <DialogTitle>{editandoId ? "Editar trabajo" : "Nuevo trabajo u obra"}</DialogTitle>
                <DialogDescription>Vincula la intervención a EF o al equipo crítico del catálogo IR; facturas como metadatos D1.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Título *</Label>
                  <Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: Mantención mensual Hidropack" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descripción técnica * (mínimo 20 caracteres)</Label>
                  <textarea
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.descripcion}
                    onChange={e => setForm({ ...form, descripcion: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Unidad EF *</Label>
                    <Select value={form.unidadId || "ninguna"} onValueChange={v => setForm({ ...form, unidadId: v === "ninguna" ? "" : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguna">Ninguna</SelectItem>
                        {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.etiqueta} {u.numero}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sub-sector EF (alternativa)</Label>
                    <Select value={form.microSectorId || "ninguno"} onValueChange={v => setForm({ ...form, microSectorId: v === "ninguno" ? "" : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguno">Ninguno</SelectItem>
                        {microSectores.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Equipo crítico del catálogo IR (opcional)</Label>
                  <Select value={form.activoIRId || "ninguno"} onValueChange={v => setForm({ ...form, activoIRId: v === "ninguno" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguno">Ninguno</SelectItem>
                      {activosIR.filter(a => ["infraestructura", "mobiliario"].includes(a.categoria)).map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.codigo} · {a.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Responsable interno (MP)</Label>
                    <Select value={form.responsablePersonaId || "ninguno"} onValueChange={v => setForm({ ...form, responsablePersonaId: v === "ninguno" ? "" : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguno">—</SelectItem>
                        {personas.filter(p => p.estadoCuenta === "activa").map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.nombres} {p.apellidos}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">…o proveedor externo *</Label>
                    <Input value={form.proveedorNombre} onChange={e => setForm({ ...form, proveedorNombre: e.target.value })} placeholder="Empresa TEST Ltda." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Prioridad</Label>
                    <Select value={form.prioridad} onValueChange={v => setForm({ ...form, prioridad: v as PrioridadMT })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PRIORIDAD_LABEL) as PrioridadMT[]).map(p => (
                          <SelectItem key={p} value={p}>{PRIORIDAD_LABEL[p]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha programada</Label>
                    <Input type="date" value={form.fechaProgramada} onChange={e => setForm({ ...form, fechaProgramada: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Costo total ($) *</Label>
                    <Input type="number" min={0} value={form.costoTotal} onChange={e => setForm({ ...form, costoTotal: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Origen de fondos (FI pendiente)</Label>
                    <Select value={form.origenFondos} onValueChange={v => setForm({ ...form, origenFondos: v as typeof form.origenFondos })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ORIGEN_LABEL) as (keyof typeof ORIGEN_LABEL)[]).map(o => (
                          <SelectItem key={o} value={o}>{ORIGEN_LABEL[o]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Garantía desde</Label>
                    <Input type="date" value={form.garantiaInicio} onChange={e => setForm({ ...form, garantiaInicio: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Garantía hasta</Label>
                    <Input type="date" value={form.garantiaFin} onChange={e => setForm({ ...form, garantiaFin: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-3 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={form.esPreventivo} onChange={e => setForm({ ...form, esPreventivo: e.target.checked })} />
                    Mantención preventiva: genera automáticamente el próximo ciclo al finalizar
                  </label>
                  {form.esPreventivo && (
                    <div className="space-y-1 md:w-48">
                      <Label className="text-xs">Periodicidad (meses) *</Label>
                      <Input type="number" min={1} value={form.periodicidadMeses} onChange={e => setForm({ ...form, periodicidadMeses: e.target.value })} placeholder="Hidropack: 1 · CCTV: 6" />
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setForm(null); setEditandoId(null) }}>Cancelar</Button>
                <Button onClick={guardarTrabajo}>Guardar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )

  function editar(t: TrabajoMT) {
    setError(null)
    setEditandoId(t.id)
    setForm({
      titulo: t.titulo,
      descripcion: t.descripcion,
      unidadId: t.unidadId ?? "",
      microSectorId: t.microSectorId ?? "",
      activoIRId: t.activoIRId ?? "",
      responsablePersonaId: t.responsablePersonaId ?? "",
      proveedorNombre: t.proveedor?.nombre ?? "",
      proveedorContacto: t.proveedor?.contacto ?? "",
      prioridad: t.prioridad,
      fechaProgramada: t.fechaProgramada ?? "",
      costoTotal: t.costoTotal.toString(),
      origenFondos: t.origenFondos,
      garantiaInicio: t.garantiaInicio ?? "",
      garantiaFin: t.garantiaFin ?? "",
      esPreventivo: Boolean(t.preventivo),
      periodicidadMeses: t.preventivo?.periodicidadMeses.toString() ?? "",
    })
  }

  function FormProyectos() {
    const [nuevoProyecto, setNuevoProyecto] = React.useState<{ nombre: string; presupuesto: string; plazo: string } | null>(null)
    return (
      <>
        <div>
          <Button onClick={() => setNuevoProyecto({ nombre: "", presupuesto: "", plazo: "" })}>
            <IconPlus className="size-4 mr-1" /> Nuevo proyecto
          </Button>
        </div>
        <Card>
          <CardContent className="pt-4">
            {proyectosMT.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin proyectos de largo plazo. Crea planes futuros con su cuota sugerida.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Proyecto</th>
                    <th className="py-2 pr-3 font-medium">Presupuesto</th>
                    <th className="py-2 pr-3 font-medium">Plazo</th>
                    <th className="py-2 pr-3 font-medium">Cuota sugerida/mes</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {proyectosMT.map(p => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        {p.nombre}
                        <span className="block text-xs text-muted-foreground">{ESTADO_PROYECTO_LABEL[p.estado]}</span>
                      </td>
                      <td className="py-2 pr-3">${p.presupuestoEstimado.toLocaleString("es-CL")}</td>
                      <td className="py-2 pr-3">{p.plazoMeses} meses{p.fechaObjetivo ? ` · objetivo ${p.fechaObjetivo}` : ""}</td>
                      <td className="py-2 pr-3 font-medium">${Math.round(p.presupuestoEstimado / p.plazoMeses).toLocaleString("es-CL")}</td>
                      <td className="py-2">
                        <Button size="sm" variant="ghost" onClick={async () => {
                          const r = await eliminarProyecto(p.id)
                          if (!r.ok) setError(r.error ?? "")
                        }}>Eliminar</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!nuevoProyecto} onOpenChange={v => { if (!v) setNuevoProyecto(null) }}>
          <DialogContent className="sm:max-w-md">
            {nuevoProyecto && (
              <>
                <DialogHeader>
                  <DialogTitle>Nuevo proyecto</DialogTitle>
                  <DialogDescription>Ej: Mantención de techos a 10 años. La cuota se deriva de presupuesto/plazo.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nombre *</Label>
                    <Input value={nuevoProyecto.nombre} onChange={e => setNuevoProyecto({ ...nuevoProyecto, nombre: e.target.value })} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Presupuesto estimado ($) *</Label>
                      <Input type="number" min={1} value={nuevoProyecto.presupuesto} onChange={e => setNuevoProyecto({ ...nuevoProyecto, presupuesto: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Plazo (meses) *</Label>
                      <Input type="number" min={1} value={nuevoProyecto.plazo} onChange={e => setNuevoProyecto({ ...nuevoProyecto, plazo: e.target.value })} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNuevoProyecto(null)}>Cancelar</Button>
                  <Button onClick={async () => {
                    const r = await crearProyecto({
                      id: `py-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                      nombre: nuevoProyecto.nombre,
                      presupuestoEstimado: Number(nuevoProyecto.presupuesto),
                      plazoMeses: Number(nuevoProyecto.plazo),
                      estado: "planificado",
                    })
                    if (!r.ok) { setError(r.error ?? ""); return }
                    setNuevoProyecto(null)
                  }}>Crear</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </>
    )
  }
}
