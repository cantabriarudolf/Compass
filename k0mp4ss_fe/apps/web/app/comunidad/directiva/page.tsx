"use client"

import * as React from "react"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
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
import type { ActaGD } from "@/lib/schemas"

type Vista = "administrador" | "propietario" | "residente"

const CARGO_LABEL: Record<string, string> = {
  presidente: "Presidente",
  tesorero: "Tesorero",
  secretario: "Secretario",
  director: "Director",
}

export default function DirectivaPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const personas = useCompassStore(s => s.personas)
  const actas = useCompassStore(s => s.actasGD)
  const controlesPropiedades = useCompassStore(s => s.controlesPropiedades)
  const saveActaGD = useCompassStore(s => s.saveActaGD)
  const removeActaGD = useCompassStore(s => s.removeActaGD)
  const aprobarActaGD = useCompassStore(s => s.aprobarActaGD)

  // Mock-first: sin mapeo sesión→persona se ofrece una vista simulada por rol
  // para demostrar la privacidad de la spec GD §3.
  const [vista, setVista] = React.useState<Vista>("propietario")
  const [error, setError] = React.useState<string | null>(null)
  const [editando, setEditando] = React.useState<ActaGD | null>(null)
  const [tablaTemasTexto, setTablaTemasTexto] = React.useState("")
  const [invitadosTexto, setInvitadosTexto] = React.useState("")

  const directivaVigente = personas.filter(p => p.datosGobernanza && p.estadoCuenta === "activa")
  const nombrePersona = (id: string) => {
    const p = personas.find(x => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }

  const pendientesDe = (acta: ActaGD) => directivaVigente.filter(d => !acta.aprobaciones.includes(d.id))

  const puedeVerBorradores = vista === "administrador"
  // Residentes solo ven actas si el dueño de su unidad autorizó (AD: residenteVeActas).
  const residenteAutorizado = controlesPropiedades.some(c => c.residenteVeActas)

  const visibles = actas.filter(a => {
    if (puedeVerBorradores) return true
    if (vista === "propietario") return a.estado === "publicada"
    return a.estado === "publicada" && residenteAutorizado
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

  const guardarActa = () => {
    if (!editando) return
    const acta: ActaGD = {
      ...editando,
      tablaTemas: tablaTemasTexto.split("\n").map(t => t.trim()).filter(Boolean),
      invitados: invitadosTexto.split(",").map(t => t.trim()).filter(Boolean),
    }
    const r = saveActaGD(acta)
    if (!r.ok) { setError(r.error ?? "No se pudo guardar el acta."); return }
    setError(null)
    setEditando(null)
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

      {/* Aviso de privacidad según vista */}
      {vista === "residente" && !residenteAutorizado && (
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
                        onClick={() => {
                          const r = removeActaGD(acta.id)
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
                          <Button key={d.id} size="sm" onClick={() => {
                            const r = aprobarActaGD(acta.id, d.id)
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
