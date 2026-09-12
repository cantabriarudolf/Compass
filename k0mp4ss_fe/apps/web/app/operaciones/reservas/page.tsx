"use client"

import * as React from "react"
import { generarId } from "@/lib/id-utils"
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
import { IconCalendarHeart, IconPlus, IconArmchair, IconShieldHalf, IconBan } from "@tabler/icons-react"
import type { ElementoRA, FranjaRA, ReservaRA, TipoElementoRA } from "@/lib/schemas"

const TIPO_LABEL: Record<TipoElementoRA, string> = {
  espacio_fisico: "Espacio Físico",
  activo_mobiliario: "Activo Mobiliario",
}

const FRANJA_LABEL: Record<FranjaRA, string> = {
  bloques_horas: "Bloques de horas",
  dia_completo: "Día completo",
}

const hoyStr = () => new Date().toISOString().slice(0, 10)

function generarSlots(franja: FranjaRA, duracionHoras: string): { inicio: string; fin: string }[] {
  if (franja === "dia_completo") return [{ inicio: "00:00", fin: "23:59" }]
  const dur = Number(duracionHoras || 0)
  if (!Number.isFinite(dur) || dur < 1) return []
  const slots: { inicio: string; fin: string }[] = []
  for (let h = 0; h + dur <= 24; h += dur) {
    slots.push({
      inicio: `${String(h).padStart(2, "0")}:00`,
      fin: `${String((h + dur) % 24).padStart(2, "0")}:00`,
    })
  }
  return slots
}

interface FormElemento {
  nombre: string
  tipo: TipoElementoRA
  microSectorId: string
  activoIRId: string
  franja: FranjaRA
  duracionBloqueHoras: string
  tarifaUso: string
  garantiaRequerida: string
  aforo: string
  stock: string
  anticipacionMinimaDias: string
  cancelacionTardiaDias: string
  penalizacionTardiaMonto: string
  activo: boolean
}

const FORM_ELEMENTO: FormElemento = {
  nombre: "",
  tipo: "espacio_fisico",
  microSectorId: "",
  activoIRId: "",
  franja: "bloques_horas",
  duracionBloqueHoras: "3",
  tarifaUso: "0",
  garantiaRequerida: "0",
  aforo: "",
  stock: "",
  anticipacionMinimaDias: "",
  cancelacionTardiaDias: "",
  penalizacionTardiaMonto: "",
  activo: true,
}

export default function ReservasPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const elementosRA = useCompassStore(s => s.elementosRA)
  const reservasRA = useCompassStore(s => s.reservasRA)
  const personas = useCompassStore(s => s.personas)
  const unidades = useCompassStore(s => s.unidades)
  const microSectores = useCompassStore(s => s.microSectores)
  const activosIR = useCompassStore(s => s.activosIR)

  const [error, setError] = React.useState<string | null>(null)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [formEl, setFormEl] = React.useState<FormElemento | null>(null)
  const [editandoElId, setEditandoElId] = React.useState<string | null>(null)

  // Alta de reserva
  const [reservaAbierta, setReservaAbierta] = React.useState(false)
  const [rElementoId, setRElementoId] = React.useState("")
  const [rPersonaId, setRPersonaId] = React.useState("")
  const [rUnidadId, setRUnidadId] = React.useState("")
  const [rFecha, setRFecha] = React.useState("")
  const [slotIdx, setSlotIdx] = React.useState("")

  // Retención de garantía
  const [retencion, setRetencion] = React.useState<{ reserva: ReservaRA; motivo: string } | null>(null)

  const elementoSeleccionado = elementosRA.find(e => e.id === rElementoId)
  const slots = generarSlots(elementoSeleccionado?.franja ?? "bloques_horas", elementoSeleccionado?.duracionBloqueHoras?.toString() ?? "")

  const nombrePersona = (id: string) => {
    const p = personas.find(x => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }
  const refUbicacion = (e: ElementoRA) => {
    if (e.microSectorId) return microSectores.find(m => m.id === e.microSectorId)?.nombre ?? e.microSectorId
    if (e.activoIRId) {
      const a = activosIR.find(r => r.id === e.activoIRId)
      return a ? `${a.codigo ?? ""} ${a.nombre}`.trim() : e.activoIRId
    }
    return "—"
  }

  const reservasOrdenadas = [...reservasRA]
    .sort((a, b) => `${a.fecha}${a.horaInicio}`.localeCompare(`${b.fecha}${b.horaInicio}`))
    .reverse()

  const guardarElemento = () => {
    if (!formEl) return
    setError(null)
    const payload: ElementoRA = {
      id: editandoElId ?? generarId("ra-el"),
      nombre: formEl.nombre,
      tipo: formEl.tipo,
      franja: formEl.franja,
      tarifaUso: Number(formEl.tarifaUso || 0),
      garantiaRequerida: Number(formEl.garantiaRequerida || 0),
      activo: formEl.activo,
      ...(formEl.microSectorId ? { microSectorId: formEl.microSectorId } : {}),
      ...(formEl.activoIRId ? { activoIRId: formEl.activoIRId } : {}),
      ...(formEl.franja === "bloques_horas" && formEl.duracionBloqueHoras ? { duracionBloqueHoras: Number(formEl.duracionBloqueHoras) } : {}),
      ...(formEl.aforo !== "" ? { aforo: Number(formEl.aforo) } : {}),
      ...(formEl.stock !== "" ? { stock: Number(formEl.stock) } : {}),
      ...(formEl.anticipacionMinimaDias !== "" ? { anticipacionMinimaDias: Number(formEl.anticipacionMinimaDias) } : {}),
      ...(formEl.cancelacionTardiaDias !== "" ? { cancelacionTardiaDias: Number(formEl.cancelacionTardiaDias) } : {}),
      ...(formEl.penalizacionTardiaMonto !== "" ? { penalizacionTardiaMonto: Number(formEl.penalizacionTardiaMonto) } : {}),
    }
    const r = useCompassStore.getState().saveElementoRA(payload)
    if (!r.ok) { setError(r.error ?? ""); return }
    setFormEl(null)
    setEditandoElId(null)
  }

  const confirmarReserva = () => {
    setError(null)
    const slot = slots[Number(slotIdx)]
    if (!elementoSeleccionado || !slot || !rPersonaId || !rFecha) {
      setError("Completa elemento, solicitante, fecha y tramo horario.")
      return
    }
    const r = useCompassStore.getState().saveReservaRA({
      // eslint-disable-next-line react-hooks/purity -- id generado en primer render del formulario nuevo; estable hasta guardar (avance 2026-09-02)
      id: generarId("ra-rs"),
      folio: "",
      elementoId: elementoSeleccionado.id,
      solicitantePersonaId: rPersonaId,
      ...(rUnidadId ? { unidadId: rUnidadId } : {}),
      fecha: rFecha,
      horaInicio: slot.inicio,
      horaFin: slot.fin,
      estado: "confirmada",
      montoTarifa: 0,
      montoGarantia: 0,
    })
    if (!r.ok) { setError(r.error ?? ""); return }
    setMsg(`Reserva confirmada para ${elementoSeleccionado.nombre} (${rFecha} ${slot.inicio}–${slot.fin}).`)
    setReservaAbierta(false)
    setSlotIdx("")
  }

  function editarElemento(e: ElementoRA) {
    setError(null)
    setEditandoElId(e.id)
    setFormEl({
      nombre: e.nombre,
      tipo: e.tipo,
      microSectorId: e.microSectorId ?? "",
      activoIRId: e.activoIRId ?? "",
      franja: e.franja,
      duracionBloqueHoras: e.duracionBloqueHoras?.toString() ?? "",
      tarifaUso: e.tarifaUso.toString(),
      garantiaRequerida: e.garantiaRequerida.toString(),
      aforo: e.aforo?.toString() ?? "",
      stock: e.stock?.toString() ?? "",
      anticipacionMinimaDias: e.anticipacionMinimaDias?.toString() ?? "",
      cancelacionTardiaDias: e.cancelacionTardiaDias?.toString() ?? "",
      penalizacionTardiaMonto: e.penalizacionTardiaMonto?.toString() ?? "",
      activo: e.activo,
    })
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
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><IconCalendarHeart className="size-6" /> Reservas y Amenities</h1>
          <p className="text-sm text-muted-foreground">Agendamiento de espacios comunes y activos con prevención de overbooking, tarifas y garantías.</p>
        </div>
        <Button onClick={() => { setRElementoId(""); setRPersonaId(""); setRUnidadId(""); setRFecha(""); setSlotIdx(""); setError(null); setReservaAbierta(true) }}>
          <IconPlus className="size-4 mr-1" /> Nueva reserva
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {msg && <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p>}

      <Tabs defaultValue="calendario">
        <TabsList>
          <TabsTrigger value="calendario">Calendario</TabsTrigger>
          <TabsTrigger value="elementos">Elementos</TabsTrigger>
        </TabsList>

        {/* Calendario */}
        <TabsContent value="calendario" className="flex flex-col gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Reservas</CardTitle>
              <CardDescription>Confirmadas bloquean su tramo; las canceladas liberan el calendario.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {reservasOrdenadas.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin reservas registradas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Folio</th>
                        <th className="py-2 pr-3 font-medium">Elemento</th>
                        <th className="py-2 pr-3 font-medium">Fecha y tramo</th>
                        <th className="py-2 pr-3 font-medium">Solicitante</th>
                        <th className="py-2 pr-3 font-medium">Tarifa / Garantía</th>
                        <th className="py-2 pr-3 font-medium">Estado</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservasOrdenadas.map(r => {
                        const el = elementosRA.find(e => e.id === r.elementoId)
                        const vencida = r.fecha < hoyStr()
                        return (
                          <tr key={r.id} className={`border-b last:border-0 align-top ${vencida && r.estado === "confirmada" ? "opacity-70" : ""}`}>
                            <td className="py-2 pr-3 font-mono text-xs">{r.folio}</td>
                            <td className="py-2 pr-3">{el?.nombre ?? r.elementoId}</td>
                            <td className="py-2 pr-3">{r.fecha}<span className="block text-xs text-muted-foreground">{r.horaInicio}–{r.horaFin}{el?.franja === "dia_completo" ? " (día completo)" : ""}</span></td>
                            <td className="py-2 pr-3">
                              {nombrePersona(r.solicitantePersonaId)}
                              {r.unidadId && (() => { const u = unidades.find(x => x.id === r.unidadId); return u ? <span className="block text-xs text-muted-foreground">{u.etiqueta} {u.numero}</span> : null })()}
                            </td>
                            <td className="py-2 pr-3">${r.montoTarifa.toLocaleString("es-CL")}
                              <span className="block text-xs text-muted-foreground">garantía ${r.montoGarantia.toLocaleString("es-CL")}</span>
                              {r.cargoFIReferencia === "pendiente" && <Badge variant="outline" className="mt-1 text-[9px]">cargo FI pendiente</Badge>}
                            </td>
                            <td className="py-2 pr-3">
                              {r.estado === "confirmada" ? (
                                <Badge className="bg-sky-600 hover:bg-sky-700 text-white text-[10px]">Confirmada</Badge>
                              ) : (
                                <div className="space-y-1">
                                  <Badge variant="outline">Cancelada</Badge>
                                  {r.cancelacion?.tardia && <Badge variant="destructive" className="text-[9px]">tardía{r.cancelacion.penalizacion ? ` · $${r.cancelacion.penalizacion.toLocaleString("es-CL")}` : ""}</Badge>}
                                </div>
                              )}
                              {r.garantiaRetenida && <Badge variant="destructive" className="mt-1 text-[9px]" title={r.garantiaRetenida.motivo}>garantía retenida</Badge>}
                            </td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-1">
                                {r.estado === "confirmada" && !r.garantiaRetenida && r.montoGarantia > 0 && (
                                  <Button size="sm" variant="outline" onClick={() => { setError(null); setRetencion({ reserva: r, motivo: "" }) }}>
                                    <IconShieldHalf className="size-3.5 mr-1" /> Retener garantía
                                  </Button>
                                )}
                                {r.estado === "confirmada" && (
                                  <Button size="sm" variant="ghost" onClick={() => {
                                    const res = useCompassStore.getState().cancelarReservaRA(r.id)
                                    if (!res.ok) setError(res.error ?? "")
                                  }}>
                                    <IconBan className="size-3.5 mr-1" /> Cancelar
                                  </Button>
                                )}
                              </div>
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
        </TabsContent>

        {/* Elementos */}
        <TabsContent value="elementos" className="flex flex-col gap-3">
          <div>
            <Button onClick={() => { setEditandoElId(null); setFormEl({ ...FORM_ELEMENTO }); setError(null) }}>
              <IconPlus className="size-4 mr-1" /> Nuevo elemento reservable
            </Button>
          </div>
          <Card>
            <CardContent className="pt-4">
              {elementosRA.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin elementos configurados. Crea quinchos, piscinas o equipos compartidos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Elemento</th>
                        <th className="py-2 pr-3 font-medium">Tipo / Ubicación</th>
                        <th className="py-2 pr-3 font-medium">Franja</th>
                        <th className="py-2 pr-3 font-medium">Tarifa</th>
                        <th className="py-2 pr-3 font-medium">Garantía</th>
                        <th className="py-2 pr-3 font-medium">Reglas</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...elementosRA].reverse().map(e => (
                        <tr key={e.id} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-3">
                            {e.nombre}
                            {!e.activo && <Badge variant="outline" className="ml-1 text-[9px]">inactivo</Badge>}
                          </td>
                          <td className="py-2 pr-3">
                            {TIPO_LABEL[e.tipo]}
                            <span className="block text-xs text-muted-foreground">{refUbicacion(e)}</span>
                          </td>
                          <td className="py-2 pr-3">
                            {FRANJA_LABEL[e.franja]}
                            {e.franja === "bloques_horas" && e.duracionBloqueHoras && <span className="block text-xs text-muted-foreground">bloques de {e.duracionBloqueHoras} h</span>}
                          </td>
                          <td className="py-2 pr-3">{e.tarifaUso > 0 ? `$${e.tarifaUso.toLocaleString("es-CL")}` : "Gratis"}</td>
                          <td className="py-2 pr-3">${e.garantiaRequerida.toLocaleString("es-CL")}</td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">
                            {[
                              e.aforo ? `aforo ${e.aforo}` : null,
                              e.stock ? `stock ${e.stock}` : null,
                              e.anticipacionMinimaDias ? `anticipación ≥${e.anticipacionMinimaDias}d` : null,
                              e.cancelacionTardiaDias !== undefined ? `tardía ≤${e.cancelacionTardiaDias}d` : null,
                              e.penalizacionTardiaMonto ? `penalización $${e.penalizacionTardiaMonto.toLocaleString("es-CL")}` : null,
                            ].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td className="py-2">
                            <Button size="sm" variant="ghost" onClick={() => editarElemento(e)}>Editar</Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                              const r = useCompassStore.getState().removeElementoRA(e.id)
                              if (!r.ok) setError(r.error ?? "")
                            }}>Eliminar</Button>
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
      </Tabs>

      {/* Formulario nueva reserva */}
      <Dialog open={reservaAbierta} onOpenChange={setReservaAbierta}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva reserva</DialogTitle>
            <DialogDescription>Solo se confirman tramos libres según la franja del elemento.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Elemento reservable *</Label>
              <Select value={rElementoId || "ninguno"} onValueChange={v => { setRElementoId(v === "ninguno" ? "" : v); setSlotIdx("") }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Selecciona…</SelectItem>
                  {elementosRA.filter(e => e.activo).map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.nombre} · {e.tarifaUso > 0 ? `$${e.tarifaUso.toLocaleString("es-CL")}` : "gratis"}{e.garantiaRequerida > 0 ? ` · gar. $${e.garantiaRequerida.toLocaleString("es-CL")}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Solicitante (MP) *</Label>
                <Select value={rPersonaId || "ninguno"} onValueChange={v => setRPersonaId(v === "ninguno" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">Selecciona…</SelectItem>
                    {personas.filter(p => p.estadoCuenta === "activa").map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nombres} {p.apellidos}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unidad del residente (opcional)</Label>
                <Select value={rUnidadId || "ninguna"} onValueChange={v => setRUnidadId(v === "ninguna" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguna">Ninguna</SelectItem>
                    {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.etiqueta} {u.numero}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fecha *</Label>
                <Input type="date" min={elementoSeleccionado?.anticipacionMinimaDias ? undefined : hoyStr()} value={rFecha} onChange={e => setRFecha(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tramo horario *</Label>
                <Select value={slotIdx === "" ? "ninguno" : slotIdx} onValueChange={v => setSlotIdx(v === "ninguno" ? "" : v)} disabled={!elementoSeleccionado}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">{slots.length === 0 ? "—" : "Selecciona…"}</SelectItem>
                    {slots.map((s, i) => (
                      <SelectItem key={`${s.inicio}-${s.fin}`} value={String(i)}>{s.inicio}–{s.fin}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {elementoSeleccionado && <p className="text-[11px] text-muted-foreground">{FRANJA_LABEL[elementoSeleccionado.franja]}{elementoSeleccionado.duracionBloqueHoras ? ` · bloques de ${elementoSeleccionado.duracionBloqueHoras} h` : ""}</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReservaAbierta(false)}>Cancelar</Button>
            <Button onClick={confirmarReserva}>Confirmar disponibilidad y reservar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Formulario elemento */}
      <Dialog open={!!formEl} onOpenChange={v => { if (!v) { setFormEl(null); setEditandoElId(null) } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {formEl && (
            <>
              <DialogHeader>
                <DialogTitle>{editandoElId ? "Editar elemento" : "Nuevo elemento reservable"}</DialogTitle>
                <DialogDescription>Tarifa $0 = gratis. La garantía se retiene si el activo vuelve dañado.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Nombre *</Label>
                    <Input value={formEl.nombre} onChange={e => setFormEl({ ...formEl, nombre: e.target.value })} placeholder="Ej: Quincho central" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo *</Label>
                    <Select value={formEl.tipo} onValueChange={v => setFormEl({ ...formEl, tipo: v as TipoElementoRA })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(TIPO_LABEL) as TipoElementoRA[]).map(t => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sub-sector EF</Label>
                    <Select value={formEl.microSectorId || "ninguno"} onValueChange={v => setFormEl({ ...formEl, microSectorId: v === "ninguno" ? "" : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguno">Ninguno</SelectItem>
                        {microSectores.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">…o activo IR (mobiliario)</Label>
                    <Select value={formEl.activoIRId || "ninguno"} onValueChange={v => setFormEl({ ...formEl, activoIRId: v === "ninguno" ? "" : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguno">Ninguno</SelectItem>
                        {activosIR.map(a => <SelectItem key={a.id} value={a.id}>{a.codigo ? `${a.codigo} · ` : ""}{a.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Franja horaria *</Label>
                    <Select value={formEl.franja} onValueChange={v => setFormEl({ ...formEl, franja: v as FranjaRA })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FRANJA_LABEL) as FranjaRA[]).map(f => <SelectItem key={f} value={f}>{FRANJA_LABEL[f]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {formEl.franja === "bloques_horas" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Duración del bloque (horas) *</Label>
                      <Input type="number" min={1} max={24} value={formEl.duracionBloqueHoras} onChange={e => setFormEl({ ...formEl, duracionBloqueHoras: e.target.value })} />
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">Tarifa por uso ($) *</Label>
                    <Input type="number" min={0} value={formEl.tarifaUso} onChange={e => setFormEl({ ...formEl, tarifaUso: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Garantía requerida ($)</Label>
                    <Input type="number" min={0} value={formEl.garantiaRequerida} onChange={e => setFormEl({ ...formEl, garantiaRequerida: e.target.value })} />
                  </div>
                  {formEl.tipo === "espacio_fisico" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Aforo máximo</Label>
                      <Input type="number" min={1} value={formEl.aforo} onChange={e => setFormEl({ ...formEl, aforo: e.target.value })} />
                    </div>
                  )}
                  {formEl.tipo === "activo_mobiliario" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Stock (unidades idénticas)</Label>
                      <Input type="number" min={1} value={formEl.stock} onChange={e => setFormEl({ ...formEl, stock: e.target.value })} placeholder="2 quinchos iguales → 2" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">Anticipación mínima (días)</Label>
                    <Input type="number" min={0} value={formEl.anticipacionMinimaDias} onChange={e => setFormEl({ ...formEl, anticipacionMinimaDias: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ventana cancelación tardía (días)</Label>
                    <Input type="number" min={0} value={formEl.cancelacionTardiaDias} onChange={e => setFormEl({ ...formEl, cancelacionTardiaDias: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Penalización tardía ($)</Label>
                    <Input type="number" min={0} value={formEl.penalizacionTardiaMonto} onChange={e => setFormEl({ ...formEl, penalizacionTardiaMonto: e.target.value })} />
                  </div>
                  <label className="flex items-center gap-2 text-xs self-end pb-2">
                    <input type="checkbox" checked={formEl.activo} onChange={e => setFormEl({ ...formEl, activo: e.target.checked })} />
                    Habilitado para reservas
                  </label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setFormEl(null); setEditandoElId(null) }}>Cancelar</Button>
                <Button onClick={guardarElemento}><IconArmchair className="size-4 mr-1" /> Guardar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Retención de garantía */}
      <Dialog open={!!retencion} onOpenChange={v => { if (!v) setRetencion(null) }}>
        <DialogContent className="sm:max-w-md">
          {retencion && (
            <>
              <DialogHeader>
                <DialogTitle>Retener garantía — {retencion.reserva.folio}</DialogTitle>
                <DialogDescription>Monto en custodia: ${retencion.reserva.montoGarantia.toLocaleString("es-CL")} · se notificará a administración.</DialogDescription>
              </DialogHeader>
              <div className="space-y-1">
                <Label className="text-xs">Motivo / daño detectado *</Label>
                <textarea
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={retencion.motivo}
                  onChange={e => setRetencion({ ...retencion, motivo: e.target.value })}
                  placeholder="Ej: manguera de alta presión fracturada al devolver el equipo"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRetencion(null)}>Volver</Button>
                <Button variant="destructive" onClick={() => {
                  const r = useCompassStore.getState().retenerGarantiaRA(retencion.reserva.id, retencion.motivo)
                  if (!r.ok) { setError(r.error ?? ""); return }
                  setMsg(`Garantía retenida en ${retencion.reserva.folio}.`)
                  setRetencion(null)
                }}>Retener garantía</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
