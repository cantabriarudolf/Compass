"use client"

import * as React from "react"
import { usePersonas } from "@/lib/api/use-personas"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
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
  IconGavel,
  IconPencil,
  IconPlus,
  IconFileText,
  IconExternalLink,
  IconCheck,
  IconLock,
} from "@tabler/icons-react"
import { puedeContextual } from "@/lib/authz"
import type { ActaGD, ExtensionGobernanza, PeriodoDirectiva } from "@/lib/schemas"
import { periodoDirectivaVigente, esMiembroDirectivaVigente } from "@/lib/store"
import { useActasGD } from "@/lib/api/use-actas-gd"
import { usePeriodosDirectiva } from "@/lib/api/use-periodos-directiva"
import { useControlesPropiedad } from "@/lib/api/use-controles-propiedad"

type Vista = "administrador" | "propietario" | "residente"

// La ficha de gobernanza en BD lleva el período (GD-períodos); el tipo legacy de
// data/comunidad no lo declara, así que se extiende a nivel de página.
type ExtensionGobernanzaPeriodo = ExtensionGobernanza & { periodoId?: string }

const CARGO_LABEL: Record<string, string> = {
  presidente: "Presidente",
  tesorero: "Tesorero",
  secretario: "Secretario",
  director: "Director",
}

// GD-períodos: art. 17 Ley 21.442 — máximo 36 meses fijados por asamblea.
function sumarMesesISO(fecha: string, meses: number): string {
  const partes = fecha.split("-")
  const y = Number(partes[0] ?? "1970")
  const m = Number(partes[1] ?? "01")
  const d = Number(partes[2] ?? "01")
  const total = y * 12 + (m - 1) + meses
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const lastDay = new Date(ny, nm, 0).getDate()
  const nd = Math.min(d, lastDay)
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`
}
function diasHasta(fecha: string): number {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const partes = fecha.split("-")
  const fin = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]))
  return Math.round((fin.getTime() - hoy.getTime()) / 86400000)
}
function finPeriodo(p: PeriodoDirectiva): string {
  return p.fechaFin ?? sumarMesesISO(p.fechaInicio, p.duracionMeses)
}

export default function DirectivaPage() {
  // Personas y GD/AD desde el servidor (BD-FUENTE-VERDAD Fase 2).
  const { actas, isLoading: cargandoActas, create: crearActa, update: actualizarActa, remove: eliminarActa, aprobar: firmarActa } = useActasGD()
  const { periodos, isLoading: cargandoPeriodos, create: crearPeriodo, cerrar: cerrarPeriodo } = usePeriodosDirectiva()
  const { controles: controlesPropiedades, isLoading: cargandoControles } = useControlesPropiedad()
  const { personas, isLoading: cargandoPersonas, update: actualizarPersona } = usePersonas()
  const cargando = cargandoActas || cargandoPeriodos || cargandoControles || cargandoPersonas

  // Mock-first: sin mapeo sesión→persona se ofrece una vista simulada por rol
  // para demostrar la privacidad de la spec GD §3.
  const [vista, setVista] = React.useState<Vista>("propietario")
  const [error, setError] = React.useState<string | null>(null)
  const [editando, setEditando] = React.useState<ActaGD | null>(null)
  const [periodoDialogo, setPeriodoDialogo] = React.useState(false)
  const [perInicio, setPerInicio] = React.useState("")
  const [perDuracion, setPerDuracion] = React.useState("36")
  const [perInscripcion, setPerInscripcion] = React.useState("")
  const [perReferencia, setPerReferencia] = React.useState("")
  const [selMiembros, setSelMiembros] = React.useState<Record<string, string>>({})
  const [tablaTemasTexto, setTablaTemasTexto] = React.useState("")
  const [invitadosTexto, setInvitadosTexto] = React.useState("")

  const periodoVigente = periodoDirectivaVigente({ periodosDirectiva: periodos })
  const directivaVigente = personas.filter(p => esMiembroDirectivaVigente(p, periodoVigente?.id))
  const nombrePersona = (id: string) => {
    const p = personas.find(x => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }

  const pendientesDe = (acta: ActaGD) => directivaVigente.filter(d => !acta.aprobaciones.includes(d.id))

  const puedeVerBorradores = vista === "administrador"
  // ABAC GD — residente solo ve actas si el dueño autorizó (AD: residenteVeActas) via puedeContextual (P4 behavior-preserving).
  const residenteAutorizado = controlesPropiedades.some(c => c.residenteVeActas)
  const puedeResidenteVerGD = puedeContextual("residente", "ver", "gd", {
    privacidad: { residenteVeActas: residenteAutorizado },
  })

  const visibles = actas.filter(a => {
    if (puedeVerBorradores) return true
    if (vista === "propietario") return a.estado === "publicada"
    return a.estado === "publicada" && puedeResidenteVerGD
  })

  const abrirNueva = () => {
    setEditando({
      id: `acta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      fecha: new Date().toISOString().slice(0, 10),
      hora: "19:00",
      lugar: "",
      tablaTemas: [],
      presentes: [],
      ausentes: [],
      invitados: [],
      minuta: "",
      adjuntos: [],
      estado: "borrador",
      aprobaciones: [],
    })
    setTablaTemasTexto("")
    setInvitadosTexto("")
    setError(null)
  }

  const guardarActa = async () => {
    if (!editando) return
    const acta: ActaGD = {
      ...editando,
      tablaTemas: tablaTemasTexto.split("\n").map(t => t.trim()).filter(Boolean),
      invitados: invitadosTexto.split(",").map(t => t.trim()).filter(Boolean),
    }
    const existe = actas.some(a => a.id === acta.id)
    const r = existe ? await actualizarActa(acta.id, acta) : await crearActa(acta)
    if (!r.ok) { setError(r.error ?? "No se pudo guardar el acta."); return }
    setError(null)
    setEditando(null)
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
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><IconGavel className="size-6" /> Gestión de Directiva</h1>
          <p className="text-sm text-muted-foreground">Repositorio de actas con flujo de aprobación y privacidad propietario/residente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Vista:</Label>
          <Select value={vista} onValueChange={v => setVista(v as Vista)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="administrador">Administrador/Directiva</SelectItem>
              <SelectItem value="propietario">Propietario</SelectItem>
              <SelectItem value="residente">Residente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Aviso de privacidad según vista — paridad con puedeContextual */}
      {vista === "residente" && !puedeResidenteVerGD && (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <IconLock className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Las actas son invisibles para residentes por defecto. Tu propietario no ha activado &quot;Permitir que mis residentes vean las actas&quot;.
            </p>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* GD-períodos: libro de directivas (vigente + históricos, nunca se borra) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <IconGavel className="size-4" /> Período de directiva vigente
            </CardTitle>
            <CardDescription>Inscripción y vigencia (art. 17 Ley 21.442: máximo 36 meses). El historial nunca se elimina.</CardDescription>
          </div>
          {vista === "administrador" && (
            <Button variant="outline" size="sm" onClick={() => { setPeriodoDialogo(true); setError(null) }} className="gap-1">
              <IconPlus className="size-4" /> Registrar período
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!periodoVigente ? (
            <p className="text-sm text-muted-foreground">Sin período vigente registrado. Registrá el período designado por la asamblea para activar quórum y trazabilidad.</p>
          ) : (() => {
            const fin = finPeriodo(periodoVigente)
            const dias = diasHasta(fin)
            const alerta = dias < 0 ? { texto: `Vencido hace ${-dias} días`, clase: "bg-red-600 text-white" }
              : dias <= 30 ? { texto: `Vence en ${dias} días`, clase: "bg-amber-600 text-white" }
              : dias <= 90 ? { texto: `Vence en ${dias} días`, clase: "bg-yellow-500 text-black" }
              : { texto: "Vigente", clase: "bg-emerald-600 text-white" }
            return (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span><strong>Inicio:</strong> {periodoVigente.fechaInicio}</span>
                  <span><strong>Fin:</strong> {fin}</span>
                  <span><strong>Inscripción:</strong> {periodoVigente.fechaInscripcion}</span>
                  <Badge className={alerta.clase}>{alerta.texto}</Badge>
                  {periodoVigente.fechasEstimadas && <Badge variant="secondary">Fechas estimadas — actualizar desde el libro</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">Respaldo: {periodoVigente.referenciaInscripcion}</p>
                <div className="flex flex-wrap gap-2">
                  {directivaVigente.map(d => (
                    <span key={d.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                      {d.datosGobernanza ? CARGO_LABEL[d.datosGobernanza.cargoDirectiva] : "Miembro"}: {d.nombres} {d.apellidos}
                    </span>
                  ))}
                      {directivaVigente.length === 0 && <span className="text-xs text-muted-foreground">Sin miembros con ficha en este período.</span>}
                    </div>
                    {vista === "administrador" && (
                      <div>
                        <Button variant="outline" size="sm" onClick={async () => {
                          const r = await cerrarPeriodo(periodoVigente.id)
                          if (!r.ok) setError(r.error ?? "No se pudo cerrar el período.")
                          else setError(null)
                        }}>
                          Cerrar período (archiva nómina)
                        </Button>
                      </div>
                    )}
              </div>
            )
          })()}
          {periodos.filter(p => p.estado === "cerrado").length > 0 && (
            <div className="border-t pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Históricos (libro)</p>
              <div className="flex flex-col gap-2">
                {periodos.filter(p => p.estado === "cerrado").map(p => (
                  <div key={p.id} className="rounded-md border p-2 text-xs">
                    <p><strong>{p.fechaInicio}</strong> → {p.fechaFin ?? "—"} · {p.miembros.length} miembros · Inscrito {p.fechaInscripcion}</p>
                    <p className="text-muted-foreground">{p.miembros.map(m => `${m.nombre} (${CARGO_LABEL[m.cargo] ?? m.cargo})`).join(", ")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {(vista === "administrador") && (
        <Button variant="outline" size="sm" className="self-start" onClick={abrirNueva}>
          <IconPlus className="size-4 mr-1" /> Registrar reunión / nueva acta
        </Button>
      )}

      {visibles.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No hay actas disponibles para esta vista.</CardContent></Card>
      ) : (
        <div className="flex flex-col gap-4">
          {visibles.map(acta => (
            <Card key={acta.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <IconFileText className="size-4" /> Acta del {acta.fecha} · {acta.hora}
                      {acta.estado === "publicada"
                        ? <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">Publicada</Badge>
                        : <Badge variant="secondary">Borrador de Directiva</Badge>}
                    </CardTitle>
                    <CardDescription>{acta.lugar} · {acta.tablaTemas.length} tema(s)</CardDescription>
                  </div>
                  {vista === "administrador" && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" aria-label="Editar acta"
                        onClick={() => {
                          setEditando({ ...acta })
                          setTablaTemasTexto(acta.tablaTemas.join("\n"))
                          setInvitadosTexto(acta.invitados.join(", "))
                          setError(null)
                        }}
                      >
                        <IconPencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Eliminar acta"
                        onClick={async () => {
                          const r = await eliminarActa(acta.id)
                          if (!r.ok) setError(r.error ?? "No se pudo eliminar.")
                        }}
                      >
                        ✕
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 border-t pt-4">
                <div className="grid gap-3 text-xs md:grid-cols-2">
                  <div>
                    <p className="mb-1 font-medium uppercase tracking-wide text-muted-foreground">Presentes ({acta.presentes.length})</p>
                    {acta.presentes.length === 0 ? <p className="text-muted-foreground">—</p> : acta.presentes.map(id => (
                      <p key={id}>{nombrePersona(id)}</p>
                    ))}
                    {acta.ausentes.length > 0 && (
                      <>
                        <p className="mt-2 mb-1 font-medium uppercase tracking-wide text-muted-foreground">Ausentes</p>
                        {acta.ausentes.map(id => <p key={id}>{nombrePersona(id)}</p>)}
                      </>
                    )}
                    {acta.invitados.length > 0 && (
                      <>
                        <p className="mt-2 mb-1 font-medium uppercase tracking-wide text-muted-foreground">Invitados</p>
                        {acta.invitados.map((inv, i) => <p key={`${inv}-${i}`}>{inv}</p>)}
                      </>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 font-medium uppercase tracking-wide text-muted-foreground">Minuta</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">{acta.minuta || "—"}</p>
                    {acta.adjuntos.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1">
                        {acta.adjuntos.map(adj => (
                          <a key={adj.url} href={adj.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sky-600 hover:underline">
                            <IconExternalLink className="size-3" /> {adj.nombre} ({adj.tipoMime}, {adj.tamanoKB} KB)
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Monitor de firmas pendientes */}
                {acta.estado === "borrador" && (
                  <div className="rounded-md border p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Monitor de firmas — {acta.aprobaciones.length}/{directivaVigente.length} aprobadas
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {directivaVigente.map(d => {
                        const aprobo = acta.aprobaciones.includes(d.id)
                        return (
                          <span key={d.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${aprobo ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                            {CARGO_LABEL[d.datosGobernanza!.cargoDirectiva]}: {d.nombres} {aprobo ? "✓" : "⏳"}
                          </span>
                        )
                      })}
                    </div>
                    {pendientesDe(acta).length > 0 && vista === "administrador" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pendientesDe(acta).map(d => (
                          <Button key={d.id} size="sm" onClick={async () => {
                            const r = await firmarActa(acta.id, d.id)
                            if (!r.ok) setError(r.error ?? "No se pudo aprobar.")
                          }}>
                            <IconCheck className="size-4 mr-1" /> Aprobar como {CARGO_LABEL[d.datosGobernanza!.cargoDirectiva]}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {acta.estado === "publicada" && (
                  <p className="text-xs text-muted-foreground">Publicada el {acta.fechaPublicacion} · notificación formal enviada a propietarios (email_simulado) · aviso en CV: pendiente.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

          {/* GD-períodos: diálogo de registro (cierra el vigente archivando su nómina) */}
          <Dialog open={periodoDialogo} onOpenChange={setPeriodoDialogo}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Registrar período de directiva</DialogTitle>
                <DialogDescription>Lo fijado por la asamblea (máximo 36 meses). Al guardar, el período vigente se cierra y su nómina queda archivada.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Inicio *</Label>
                    <Input type="date" value={perInicio} onChange={e => setPerInicio(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Duración (meses, máx 36) *</Label>
                    <Input type="number" min={1} max={36} value={perDuracion} onChange={e => setPerDuracion(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha de inscripción *</Label>
                    <Input type="date" value={perInscripcion} onChange={e => setPerInscripcion(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Referencia (acta/escritura) *</Label>
                    <Input value={perReferencia} onChange={e => setPerReferencia(e.target.value)} placeholder="Acta asamblea 2026-03-01" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nómina (impar de 3 a 5) *</Label>
                  <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                    {personas.filter(p => p.estadoCuenta === "activa").map(p => {
                      const sel = selMiembros[p.id] !== undefined
                      return (
                        <div key={p.id} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={sel}
                            onChange={() => setSelMiembros(prev => {
                              const next = { ...prev }
                              if (sel) delete next[p.id]
                              else next[p.id] = p.datosGobernanza?.cargoDirectiva ?? ""
                              return next
                            })}
                          />
                          <span className="flex-1">{p.nombres} {p.apellidos}</span>
                          {sel && (
                            <Select value={selMiembros[p.id] ?? ""} onValueChange={v => setSelMiembros(prev => ({ ...prev, [p.id]: v }))}>
                              <SelectTrigger className="h-7 w-32"><SelectValue placeholder="Cargo" /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(CARGO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPeriodoDialogo(false)}>Cancelar</Button>
                    <Button onClick={async () => {
                      const miembros = Object.entries(selMiembros)
                        .filter(([, c]) => !!c)
                        .map(([personaId, cargo]) => ({
                          personaId,
                          nombre: personas.find(p => p.id === personaId)?.nombreCompleto ?? personaId,
                          cargo: cargo as "presidente" | "tesorero" | "secretario" | "director",
                          fechaAsuncion: perInicio,
                        }))
                      const id = `periodo-${Date.now().toString(36)}`
                      const r = await crearPeriodo({
                        id,
                        fechaInicio: perInicio,
                        duracionMeses: Number(perDuracion),
                        fechaInscripcion: perInscripcion || perInicio,
                        referenciaInscripcion: perReferencia.trim(),
                        estado: "vigente",
                        miembros,
                      })
                      if (!r.ok) { setError(r.error ?? "No se pudo registrar."); return }
                      // El servidor ya registró el período en BD; se actualizan
                      // las fichas de personas por API (rol/cargo en gobernanza).
                      const idsNuevos = new Set(miembros.map(m => m.personaId))
                      for (const p of personas) {
                        const m = miembros.find(x => x.personaId === p.id)
                        if (m) {
                          // La ficha de gobernanza en BD sí lleva período (GD-períodos);
                          // el tipo legacy de data/comunidad no lo declara.
                          const fichaGob: ExtensionGobernanzaPeriodo = {
                            id: p.datosGobernanza?.id ?? `g-${p.id}`,
                            cargoDirectiva: m.cargo,
                            fechaAsuncion: m.fechaAsuncion,
                            periodoId: id,
                          }
                          await actualizarPersona(p.id, {
                            // null de BD (fotografiaUrl etc.) rompe el merge del PUT
                            // (esReferenciaValida no tolera null) → se envían strings para neutralizar.
                            fotografiaUrl: "",
                            roles: p.roles.includes("directiva") ? p.roles : [...p.roles, "directiva"],
                            datosGobernanza: fichaGob,
                          })
                        } else if (
                          (p.datosGobernanza as ExtensionGobernanzaPeriodo | undefined)?.periodoId === periodoVigente?.id &&
                          !idsNuevos.has(p.id)
                        ) {
                          await actualizarPersona(p.id, {
                            fotografiaUrl: "",
                            roles: p.roles.filter(r => r !== "directiva"),
                            datosGobernanza: null as never,
                          })
                        }
                      }
                      setError(null)
                      setPeriodoDialogo(false)
                      setPerInicio(""); setPerDuracion("36"); setPerInscripcion(""); setPerReferencia(""); setSelMiembros({})
                    }}>Registrar período</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Formulario de acta (solo administrador/directiva) */}
      <Dialog open={!!editando} onOpenChange={v => { if (!v) { setEditando(null); setError(null) } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {editando && (
            <>
              <DialogHeader>
                <DialogTitle>{actas.some(a => a.id === editando.id) ? "Editar acta" : "Nueva acta de reunión"}</DialogTitle>
                <DialogDescription>D1: los soportes documentales se referencian por URL; jamás embebidos.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha</Label>
                    <Input type="date" value={editando.fecha} onChange={e => setEditando({ ...editando, fecha: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hora</Label>
                    <Input type="time" value={editando.hora} onChange={e => setEditando({ ...editando, hora: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Lugar</Label>
                  <Input value={editando.lugar} onChange={e => setEditando({ ...editando, lugar: e.target.value })} placeholder="Sede comunitaria" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tabla de temas (uno por línea)</Label>
                  <textarea
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={tablaTemasTexto}
                    onChange={e => setTablaTemasTexto(e.target.value)}
                    placeholder={"Gasto común\nMantenimiento"}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Presentes</Label>
                    <div className="flex max-h-28 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                      {directivaVigente.map(d => (
                        <label key={d.id} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={editando.presentes.includes(d.id)}
                            onChange={e => setEditando({
                              ...editando,
                              presentes: e.target.checked ? [...editando.presentes, d.id] : editando.presentes.filter(x => x !== d.id),
                              ausentes: e.target.checked ? editando.ausentes.filter(x => x !== d.id) : editando.ausentes,
                            })}
                          />
                          {d.nombres} ({CARGO_LABEL[d.datosGobernanza!.cargoDirectiva]})
                        </label>
                      ))}
                      {directivaVigente.length === 0 && <span className="text-xs text-muted-foreground">Sin directiva registrada (ver AD).</span>}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ausentes</Label>
                    <div className="flex max-h-28 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                      {directivaVigente.map(d => (
                        <label key={d.id} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={editando.ausentes.includes(d.id)}
                            onChange={e => setEditando({
                              ...editando,
                              ausentes: e.target.checked ? [...editando.ausentes, d.id] : editando.ausentes.filter(x => x !== d.id),
                              presentes: e.target.checked ? editando.presentes.filter(x => x !== d.id) : editando.presentes,
                            })}
                          />
                          {d.nombres} ({CARGO_LABEL[d.datosGobernanza!.cargoDirectiva]})
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Invitados especiales (separados por coma)</Label>
                  <Input value={invitadosTexto} onChange={e => setInvitadosTexto(e.target.value)} placeholder="Asesor legal, proveedor…" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Minuta</Label>
                  <textarea
                    rows={4}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={editando.minuta}
                    onChange={e => setEditando({ ...editando, minuta: e.target.value })}
                    placeholder="Acuerdos, discusiones y tareas asignadas…"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setEditando(null); setError(null) }}>Cancelar</Button>
                <Button onClick={guardarActa}><IconCheck className="size-4 mr-1" /> Guardar borrador</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
