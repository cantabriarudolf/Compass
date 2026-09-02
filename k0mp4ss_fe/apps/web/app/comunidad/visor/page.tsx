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
  IconDeviceDesktop,
  IconPlus,
  IconSend,
  IconArchive,
  IconTrash,
  IconEye,
  IconGavel,
  IconExternalLink,
} from "@tabler/icons-react"
import type { AvisoCV, TipologiaCV } from "@/lib/schemas"

const TIPOLOGIA_CLASE: Record<TipologiaCV, string> = {
  info: "bg-sky-600 hover:bg-sky-700 text-white",
  exito: "bg-emerald-600 hover:bg-emerald-700 text-white",
  advertencia: "bg-orange-500 hover:bg-orange-600 text-white",
  peligro: "bg-red-600 hover:bg-red-700 text-white",
}

const TIPOLOGIA_LABEL: Record<TipologiaCV, string> = {
  info: "Información",
  exito: "Éxito",
  advertencia: "Advertencia",
  peligro: "Peligro/Urgente",
}

const ESTADO_AVISO_BADGE: Record<AvisoCV["estado"], string> = {
  borrador: "bg-muted text-muted-foreground",
  publicado: "bg-emerald-600 hover:bg-emerald-700 text-white",
  archivado: "bg-zinc-500 text-white",
}

const hoyStr = () => new Date().toISOString().slice(0, 10)

interface FormAviso {
  titulo: string
  cuerpo: string
  tipologia: TipologiaCV
  duracionSegundos: string
  imagenUrl: string
  videoUrl: string
  pantallaCompleta: boolean
  expiresAt: string
  tags: string
}

const FORM_AVISO: FormAviso = {
  titulo: "",
  cuerpo: "",
  tipologia: "info",
  duracionSegundos: "10",
  imagenUrl: "",
  videoUrl: "",
  pantallaCompleta: false,
  expiresAt: "",
  tags: "",
}

export default function VisorPanelPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const avisosCV = useCompassStore(s => s.avisosCV)
  const plantillasCV = useCompassStore(s => s.plantillasCV)
  const actasGD = useCompassStore(s => s.actasGD)
  const configuracion = useCompassStore(s => s.configuracion)
  const personas = useCompassStore(s => s.personas)

  const [error, setError] = React.useState<string | null>(null)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<FormAviso | null>(null)
  const [editandoId, setEditandoId] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<AvisoCV | null>(null)

  // Alta manual por tercero habilitado (simulación de autoría no administrativa).
  const [autorPersonaId, setAutorPersonaId] = React.useState("")

  React.useEffect(() => {
    useCompassStore.getState().caducarAvisosCV()
  }, [])

  const guardarAviso = () => {
    if (!form) return
    setError(null)
    const existente = editandoId ? avisosCV.find(a => a.id === editandoId) : undefined
    const payload: AvisoCV = {
      id: editandoId ?? `cv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      titulo: form.titulo,
      cuerpo: form.cuerpo,
      tipologia: form.tipologia,
      duracionSegundos: Number(form.duracionSegundos || 10),
      ...(form.imagenUrl ? { imagenUrl: form.imagenUrl } : {}),
      ...(form.videoUrl ? { videoUrl: form.videoUrl } : {}),
      pantallaCompleta: form.pantallaCompleta,
      ...(form.expiresAt ? { expiresAt: form.expiresAt } : {}),
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      estado: existente?.estado ?? "borrador",
      requiereVistoBueno: existente?.requiereVistoBueno ?? false,
      ...(existente?.creadoPorPersonaId ? { creadoPorPersonaId: existente.creadoPorPersonaId } : {}),
      origen: existente?.origen ?? "manual",
      ...(existente?.plantillaId ? { plantillaId: existente.plantillaId } : {}),
      fechaCreacion: existente?.fechaCreacion ?? hoyStr(),
      ...(existente?.fechaPublicacion ? { fechaPublicacion: existente.fechaPublicacion } : {}),
      ...(existente?.fechaArchivado ? { fechaArchivado: existente.fechaArchivado } : {}),
    }
    const r = useCompassStore.getState().saveAvisoCV(payload, !editandoId && autorPersonaId ? autorPersonaId : undefined)
    if (!r.ok) { setError(r.error ?? ""); return }
    setMsg(editandoId ? `Aviso "${form.titulo}" actualizado.` : `Borrador "${form.titulo}" creado.`)
    setForm(null)
    setEditandoId(null)
    setAutorPersonaId("")
  }

  function editar(a: AvisoCV) {
    setError(null)
    setEditandoId(a.id)
    setAutorPersonaId(a.creadoPorPersonaId ?? "")
    setForm({
      titulo: a.titulo,
      cuerpo: a.cuerpo,
      tipologia: a.tipologia,
      duracionSegundos: a.duracionSegundos.toString(),
      imagenUrl: a.imagenUrl ?? "",
      videoUrl: a.videoUrl ?? "",
      pantallaCompleta: a.pantallaCompleta,
      expiresAt: a.expiresAt ?? "",
      tags: a.tags.join(", "),
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
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><IconDeviceDesktop className="size-6" /> Visor de Mensajes</h1>
          <p className="text-sm text-muted-foreground">Gestor del carrusel proyectable en pantallas de áreas comunes.</p>
        </div>
        <div className="flex gap-2">
          <a href="/visor-mensajes" target="_blank" rel="noopener noreferrer">
            <Button variant="outline"><IconExternalLink className="size-4 mr-1" /> Abrir visor público</Button>
          </a>
          <Button onClick={() => { setEditandoId(null); setAutorPersonaId(""); setForm({ ...FORM_AVISO }); setError(null) }}>
            <IconPlus className="size-4 mr-1" /> Nuevo aviso
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {msg && <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p>}

      <Tabs defaultValue="avisos">
        <TabsList>
          <TabsTrigger value="avisos">Avisos</TabsTrigger>
          <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
          <TabsTrigger value="actas">Actas GD</TabsTrigger>
          <TabsTrigger value="configuracion">Configuración</TabsTrigger>
        </TabsList>

        {/* Avisos */}
        <TabsContent value="avisos" className="flex flex-col gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Gestor de avisos</CardTitle>
              <CardDescription>Borradores editables y eliminables · Publicados solo se archivan · Archivados conservan data para auditoría.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {avisosCV.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin avisos. Crea uno o activa una plantilla rápida.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Aviso</th>
                        <th className="py-2 pr-3 font-medium">Tipología</th>
                        <th className="py-2 pr-3 font-medium">Duración / Vigencia</th>
                        <th className="py-2 pr-3 font-medium">Origen</th>
                        <th className="py-2 pr-3 font-medium">Estado</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...avisosCV].reverse().map(a => (
                        <tr key={a.id} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-3">
                            {a.pantallaCompleta && <Badge variant="outline" className="mr-1 mb-1 text-[9px]">pantalla completa</Badge>}
                            <span className={a.pantallaCompleta ? "font-semibold" : ""}>{a.titulo}</span>
                            <span className="block max-w-xs truncate text-xs text-muted-foreground">{a.cuerpo}</span>
                            {a.tags.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{a.tags.map(t => <Badge key={t} variant="secondary" className="text-[9px] px-1 py-0">{t}</Badge>)}</span>}
                          </td>
                          <td className="py-2 pr-3"><Badge className={`${TIPOLOGIA_CLASE[a.tipologia]} text-[10px]`}>{TIPOLOGIA_LABEL[a.tipologia]}</Badge></td>
                          <td className="py-2 pr-3">
                            {a.duracionSegundos}s
                            <span className="block text-xs text-muted-foreground">{a.expiresAt ? `vence ${a.expiresAt}` : "sin caducidad"}</span>
                          </td>
                          <td className="py-2 pr-3 text-xs">
                            {a.origen}
                            {a.actaId && <span className="block text-muted-foreground">acta {a.actaId}</span>}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge className={`${ESTADO_AVISO_BADGE[a.estado]} text-[10px]`}>
                              {a.estado}{a.requiereVistoBueno ? " · espera VB" : ""}
                            </Badge>
                          </td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setPreview(a)}>
                                <IconEye className="size-3.5 mr-1" /> Vista previa
                              </Button>
                              {a.estado !== "archivado" && (
                                <Button size="sm" variant="ghost" onClick={() => editar(a)}>Editar</Button>
                              )}
                              {a.estado === "borrador" && (
                                <Button size="sm" onClick={() => {
                                  const r = useCompassStore.getState().publicarAvisoCV(a.id)
                                  if (!r.ok) setError(r.error ?? "")
                                }}>
                                  <IconSend className="size-3.5 mr-1" /> Publicar
                                </Button>
                              )}
                              {a.estado === "publicado" && (
                                <Button size="sm" variant="outline" onClick={() => {
                                  const r = useCompassStore.getState().archivarAvisoCV(a.id)
                                  if (!r.ok) setError(r.error ?? "")
                                }}>
                                  <IconArchive className="size-3.5 mr-1" /> Archivar
                                </Button>
                              )}
                              {a.estado === "borrador" && (
                                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                                  const r = useCompassStore.getState().removeAvisoCV(a.id)
                                  if (!r.ok) setError(r.error ?? "")
                                }}>
                                  <IconTrash className="size-3.5 mr-1" /> Eliminar
                                </Button>
                              )}
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

        {/* Plantillas */}
        <TabsContent value="plantillas" className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">Solo administración define plantillas; el personal de servicio las activa ante eventos del día.</p>
          <Card>
            <CardContent className="pt-4">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Plantilla</th>
                    <th className="py-2 pr-3 font-medium">Tipología</th>
                    <th className="py-2 pr-3 font-medium">Duración sugerida</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {plantillasCV.map(p => (
                    <tr key={p.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3">
                        {p.titulo}
                        <span className="block max-w-sm truncate text-xs text-muted-foreground">{p.cuerpo}</span>
                      </td>
                      <td className="py-2 pr-3"><Badge className={`${TIPOLOGIA_CLASE[p.tipologia]} text-[10px]`}>{TIPOLOGIA_LABEL[p.tipologia]}</Badge></td>
                      <td className="py-2 pr-3">{p.duracionSegundosSugerida}s</td>
                      <td className="py-2 pr-3">
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={p.activa}
                            onChange={e => {
                              const r = useCompassStore.getState().savePlantillaCV({ ...p, activa: e.target.checked })
                              if (!r.ok) setError(r.error ?? "")
                            }}
                          />
                          {p.activa ? "activa" : "desactivada"}
                        </label>
                      </td>
                      <td className="py-2">
                        <Button size="sm" onClick={() => {
                          const r = useCompassStore.getState().activarPlantillaCV(p.id)
                          if (!r.ok) setError(r.error ?? "")
                          else setMsg(`Plantilla "${p.titulo}" activada: aviso publicado en el carrusel.`)
                        }} disabled={!p.activa}>Activar ahora</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Actas GD */}
        <TabsContent value="actas" className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">Difunde en el visor las actas aprobadas por quórum. Publicar marca la referencia del acta con el id del aviso.</p>
          <Card>
            <CardContent className="pt-4">
              {actasGD.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin actas registradas en GD.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Acta</th>
                      <th className="py-2 pr-3 font-medium">Lugar</th>
                      <th className="py-2 pr-3 font-medium">Estado</th>
                      <th className="py-2 pr-3 font-medium">Aviso CV</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {actasGD.map(acta => (
                      <tr key={acta.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs">{acta.id}<span className="block font-sans">{acta.fecha}</span></td>
                        <td className="py-2 pr-3">{acta.lugar}</td>
                        <td className="py-2 pr-3">{acta.estado}</td>
                        <td className="py-2 pr-3">
                          {!acta.avisoCVReferencia || acta.avisoCVReferencia === "pendiente" ? (
                            <Badge variant="outline" className="text-[10px]">pendiente</Badge>
                          ) : (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]">{acta.avisoCVReferencia}</Badge>
                          )}
                        </td>
                        <td className="py-2">
                          {acta.estado === "publicada" && (!acta.avisoCVReferencia || acta.avisoCVReferencia === "pendiente") && (
                            <Button size="sm" onClick={() => {
                              const r = useCompassStore.getState().publicarActaEnCV(acta.id)
                              if (!r.ok) setError(r.error ?? "")
                              else setMsg("Acta publicada en el visor con su aviso correspondiente.")
                            }}>
                              <IconGavel className="size-3.5 mr-1" /> Publicar en Visor
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuración */}
        <TabsContent value="configuracion" className="max-w-xl">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Control de supervisión</CardTitle>
              <CardDescription>Aplica a mensajes manuales creados por terceros habilitados (personal, directiva o residentes).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={configuracion.cvRequiereVistoBueno ?? true}
                  onChange={e => {
                    const r = useCompassStore.getState().saveConfiguracion({ ...configuracion, cvRequiereVistoBueno: e.target.checked })
                    if (!r.ok) setError(r.error ?? "")
                    else setMsg(e.target.checked ? "Visto bueno obligatorio activado." : "VB desactivado: asumes la responsabilidad operativa de los contenidos de terceros.")
                  }}
                />
                <span>
                  Exigir visto bueno de administración para publicar mensajes de terceros
                  <span className="block text-xs text-muted-foreground">Habilitado por defecto. Al desactivarlo, los mensajes de terceros se publican sin revisión previa.</span>
                </span>
              </label>
              <div>
                <Label className="text-xs">Habilitación de creación manual (perfiles MP)</Label>
                <ul className="mt-2 space-y-1 text-xs">
                  {personas.filter(p => p.permiteCreacionManualCV).map(p => (
                    <li key={p.id}>{p.nombres} {p.apellidos} — <Badge variant="secondary" className="text-[9px]">puede crear</Badge></li>
                  ))}
                  {personas.filter(p => p.permiteCreacionManualCV).length === 0 && (
                    <li className="text-muted-foreground">Nadie habilitado además de administración. Edita la persona en Comunidad → Directorio para conceder el permiso especial.</li>
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Formulario aviso */}
      <Dialog open={!!form} onOpenChange={v => { if (!v) { setForm(null); setEditandoId(null); setAutorPersonaId("") } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {form && (
            <>
              <DialogHeader>
                <DialogTitle>{editandoId ? "Editar aviso" : "Nuevo aviso"}</DialogTitle>
                <DialogDescription>Multimedia excluyente: imagen por URL remota (D1) o video YouTube. Duración mínima 3s.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Título *</Label>
                  <Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: Corte de agua programado" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cuerpo *</Label>
                  <textarea
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.cuerpo}
                    onChange={e => setForm({ ...form, cuerpo: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipología *</Label>
                    <Select value={form.tipologia} onValueChange={v => setForm({ ...form, tipologia: v as TipologiaCV })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(TIPOLOGIA_LABEL) as TipologiaCV[]).map(t => <SelectItem key={t} value={t}>{TIPOLOGIA_LABEL[t]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Duración en pantalla (segundos) *</Label>
                    <Input type="number" min={3} value={form.duracionSegundos} onChange={e => setForm({ ...form, duracionSegundos: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Imagen (URL remota)</Label>
                    <Input value={form.imagenUrl} onChange={e => setForm({ ...form, imagenUrl: e.target.value })} placeholder="https://…" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">…o Video YouTube (excluyente)</Label>
                    <Input value={form.videoUrl} onChange={e => setForm({ ...form, videoUrl: e.target.value })} placeholder="https://youtube.com/watch?v=… o /shorts/" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Caducidad automática (vence)</Label>
                    <Input type="date" min={hoyStr()} value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tags (separados por coma)</Label>
                    <Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="mantencion, directiva" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.pantallaCompleta} onChange={e => setForm({ ...form, pantallaCompleta: e.target.checked })} />
                  Modo pantalla completa en el visor (mayor impacto)
                </label>
                {!editandoId && personas.some(p => p.permiteCreacionManualCV) && (
                  <div className="space-y-1 rounded-md border p-3">
                    <Label className="text-xs">Registrar como creación de tercero habilitado (simula VB)</Label>
                    <Select value={autorPersonaId || "admin"} onValueChange={v => setAutorPersonaId(v === "admin" ? "" : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administración (sin VB)</SelectItem>
                        {personas.filter(p => p.permiteCreacionManualCV).map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.nombres} {p.apellidos} (con VB)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setForm(null); setEditandoId(null); setAutorPersonaId("") }}>Cancelar</Button>
                <Button onClick={guardarAviso}>Guardar borrador</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Vista previa fiel al visor */}
      <Dialog open={!!preview} onOpenChange={o => { if (!o) setPreview(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vista previa en visor</DialogTitle>
            <DialogDescription>Render aproximado de cómo se proyectará el aviso.</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className={`relative overflow-hidden rounded-xl border border-white/10 p-8 ${preview.pantallaCompleta ? "min-h-[420px]" : "min-h-[280px]"} bg-gradient-to-br ${preview.tipologia === "peligro" ? "from-red-950 via-zinc-900 to-black" : preview.tipologia === "advertencia" ? "from-orange-950 via-zinc-900 to-black" : preview.tipologia === "exito" ? "from-emerald-950 via-zinc-900 to-black" : "from-sky-950 via-zinc-900 to-black"} text-white backdrop-blur`}>
              <div className={`mb-4 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${preview.tipologia === "peligro" ? "bg-red-600" : preview.tipologia === "advertencia" ? "bg-orange-500" : preview.tipologia === "exito" ? "bg-emerald-600" : "bg-sky-600"}`}>
                {TIPOLOGIA_LABEL[preview.tipologia]}
              </div>
              <h2 className="text-2xl font-bold leading-tight">{preview.titulo}</h2>
              <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-white/85">{preview.cuerpo}</p>
              {preview.imagenUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- URL de imagen provista por el usuario (D1), no optimizable por next/image
                <img src={preview.imagenUrl} alt={preview.titulo} className="mt-4 max-h-48 rounded-lg object-contain" />
              )}
              {preview.videoUrl && (
                <iframe src={preview.videoUrl.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/").replace("youtube.com/shorts/", "embed/")} title={preview.titulo} className="mt-4 aspect-video w-full rounded-lg" allowFullScreen />
              )}
              <span className="absolute bottom-3 right-4 text-[11px] tabular-nums text-white/50">{preview.duracionSegundos}s por ciclo</span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
