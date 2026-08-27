"use client"

import * as React from "react"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Switch } from "@workspace/ui/components/switch"
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
  IconSearch,
  IconMapPin,
  IconPencil,
  IconTrash,
  IconPlus,
  IconBell,
  IconLock,
  IconPhotoOff,
  IconExternalLink,
  IconCheck,
} from "@tabler/icons-react"
import Link from "next/link"
import type { PublicacionPortal, LeadPortal, ImagenReferencia } from "@/lib/schemas"

const formatoPrecio = (precio: number, moneda?: string) => {
  if (moneda === "UF") return `${precio.toLocaleString("es-CL")} UF`
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(precio)
}

function PlaceholderFoto({ tipo }: { tipo?: string }) {
  return (
    <div className="flex h-40 w-full items-center justify-center rounded-md bg-muted/40 text-muted-foreground">
      <IconPhotoOff className="size-8" />
      <span className="ml-2 text-xs">{tipo ?? "sin imagen"}</span>
    </div>
  )
}

export default function PortalInmobiliarioPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const unidades = useCompassStore(s => s.unidades)
  const vinculos = useCompassStore(s => s.vinculos)
  const personas = useCompassStore(s => s.personas)
  const publicaciones = useCompassStore(s => s.publicacionesPortal)
  const leads = useCompassStore(s => s.leadsPortal)
  const notificaciones = useCompassStore(s => s.notificaciones)
  const configuracion = useCompassStore(s => s.configuracion)
  const savePublicacionPortal = useCompassStore(s => s.savePublicacionPortal)
  const removePublicacionPortal = useCompassStore(s => s.removePublicacionPortal)
  const saveLeadPortal = useCompassStore(s => s.saveLeadPortal)
  const marcarNotificacionLeida = useCompassStore(s => s.marcarNotificacionLeida)
  const notify = useCompassStore(s => s.notify)
  const saveConfiguracion = useCompassStore(s => s.saveConfiguracion)

  // Sesión (cookie httpOnly de Auth.js): se consulta al servidor tras montar.
  // AU §3 P5: /api/auth/session de Auth.js responde { user, expires } | null.
  const [autenticado, setAutenticado] = React.useState<boolean | null>(null)
  React.useEffect(() => {
    let vigente = true
    fetch("/api/auth/session")
      .then(r => r.json())
      .then(d => { if (vigente) setAutenticado(Boolean(d?.user)) })
      .catch(() => { if (vigente) setAutenticado(false) })
    return () => { vigente = false }
  }, [])

  const visibilidad = configuracion.visibilidadPortalInmobiliario ?? "residentes"

  // Filtros del catálogo
  const [fOperacion, setFOperacion] = React.useState("todas")
  const [fPrecioMin, setFPrecioMin] = React.useState("")
  const [fPrecioMax, setFPrecioMax] = React.useState("")
  const [fDormitorios, setFDormitorios] = React.useState("")

  // Ficha y lead
  const [pubFicha, setPubFicha] = React.useState<PublicacionPortal | null>(null)
  const [leadNombre, setLeadNombre] = React.useState("")
  const [leadContacto, setLeadContacto] = React.useState("")
  const [leadMensaje, setLeadMensaje] = React.useState("")
  const [leadMsg, setLeadMsg] = React.useState<{ ok: boolean; text: string } | null>(null)

  // Gestión
  const [editando, setEditando] = React.useState<PublicacionPortal | null>(null)
  const [nuevaUrlImagen, setNuevaUrlImagen] = React.useState("")
  const [errorGestion, setErrorGestion] = React.useState<string | null>(null)
  const [mostrarGestion, setMostrarGestion] = React.useState(false)
  const [bandejaAbierta, setBandejaAbierta] = React.useState(false)

  const refUnidad = React.useCallback(
    (unidadId: string) => {
      const u = unidades.find(x => x.id === unidadId)
      return u ? `${u.etiqueta} ${u.numero}` : unidadId
    },
    [unidades]
  )

  const propietarioDeUnidad = React.useCallback(
    (unidadId: string) => {
      const v = vinculos.find(x => x.unidadId === unidadId && x.rol === "propietario" && !x.fechaFin)
      if (!v) return null
      const p = personas.find(x => x.id === v.personaId)
      return p ? `${p.nombres} ${p.apellidos}` : null
    },
    [vinculos, personas]
  )

  const activas = publicaciones.filter(p => p.activa)
  const catalogo = activas.filter(p => {
    if (fOperacion !== "todas" && p.operacion !== fOperacion) return false
    if (fPrecioMin && p.precio < Number(fPrecioMin)) return false
    if (fPrecioMax && p.precio > Number(fPrecioMax)) return false
    if (fDormitorios && (p.dormitorios ?? 0) < Number(fDormitorios)) return false
    return true
  })

  const notificacionesPI = notificaciones.filter(n => n.destinatarioRol === "propietario")
  const noLeidas = notificacionesPI.filter(n => !n.leida).length

  const enviarLead = () => {
    if (!pubFicha) return
    if (!leadNombre.trim() || !leadContacto.trim()) {
      setLeadMsg({ ok: false, text: "Nombre y contacto son obligatorios." })
      return
    }
    const r = saveLeadPortal({
      id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      publicacionId: pubFicha.id,
      nombreContacto: leadNombre.trim(),
      contacto: leadContacto.trim(),
      mensaje: leadMensaje.trim() || undefined,
      fecha: new Date().toISOString().slice(0, 10),
      atendido: false,
    } as LeadPortal)
    if (r.ok) {
      setLeadMsg({ ok: true, text: "¡Gracias! El propietario recibirá tu interés por la bandeja interna." })
      setLeadNombre(""); setLeadContacto(""); setLeadMensaje("")
    } else {
      setLeadMsg({ ok: false, text: r.error ?? "No se pudo registrar el interés." })
    }
  }

  const guardarEdicion = () => {
    if (!editando) return
    const r = savePublicacionPortal(editando)
    if (!r.ok) {
      setErrorGestion(r.error ?? "Error al guardar la publicación.")
      return
    }
    setErrorGestion(null)
    setEditando(null)
  }

  const cambiarVisibilidad = (valor: string) => {
    const r = saveConfiguracion({ ...configuracion, visibilidadPortalInmobiliario: valor === "publica" ? "publica" : "residentes" })
    if (!r.ok) setErrorGestion(r.error ?? "No se pudo cambiar la visibilidad.")
  }

  const crearPublicacionManual = () => {
    const conPub = new Set(publicaciones.map(p => p.unidadId))
    const disponible = unidades.find(u => !conPub.has(u.id))
    if (!disponible) {
      setErrorGestion("Todas las unidades ya tienen publicación.")
      return
    }
    const nueva: PublicacionPortal = {
      id: `pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      unidadId: disponible.id,
      operacion: "venta",
      precio: 0,
      imagenes: [],
      activa: false,
      fechaPublicacion: new Date().toISOString().slice(0, 10),
    }
    const r = savePublicacionPortal(nueva)
    if (!r.ok) { setErrorGestion(r.error ?? "No se pudo crear."); return }
    setErrorGestion(null)
    setEditando(nueva)
  }

  // --- Gates de acceso ---
  if (!hasHydrated || autenticado === null) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-72 rounded-lg bg-muted/30" />)}
        </div>
      </div>
    )
  }

  if (visibilidad === "residentes" && !autenticado) {
    return (
      <Card className="mx-auto mt-12 max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><IconLock className="size-5" /> Portal solo para residentes</CardTitle>
          <CardDescription>
            La administración configuró el Portal Inmobiliario para residentes. Ingresa con tu cuenta para ver las propiedades disponibles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/ingresar">Ir a Ingresar</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portal Inmobiliario</h1>
          <p className="text-sm text-muted-foreground">
            Propiedades en venta y arriendo de la comunidad · {catalogo.length} de {activas.length} visibles
          </p>
        </div>
        <div className="flex items-center gap-2">
          {autenticado && (
            <Button variant="outline" size="sm" onClick={() => setBandejaAbierta(true)} className="relative">
              <IconBell className="size-4 mr-1" /> Intereses
              {noLeidas > 0 && (
                <Badge className="ml-1 bg-rose-600 text-white">{noLeidas}</Badge>
              )}
            </Button>
          )}
          {autenticado && (
            <Button variant="outline" size="sm" onClick={() => setMostrarGestion(v => !v)}>
              Gestionar vitrina
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1">
            <Label className="text-xs">Operación</Label>
            <Select value={fOperacion} onValueChange={setFOperacion}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="venta">Venta</SelectItem>
                <SelectItem value="arriendo">Arriendo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Precio mín.</Label>
            <Input className="w-32" type="number" min={0} value={fPrecioMin} onChange={e => setFPrecioMin(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Precio máx.</Label>
            <Input className="w-32" type="number" min={0} value={fPrecioMax} onChange={e => setFPrecioMax(e.target.value)} placeholder="∞" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Dormitorios (mín.)</Label>
            <Input className="w-28" type="number" min={0} value={fDormitorios} onChange={e => setFDormitorios(e.target.value)} placeholder="0" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setFOperacion("todas"); setFPrecioMin(""); setFPrecioMax(""); setFDormitorios("") }}>
            <IconSearch className="size-4 mr-1" /> Limpiar filtros
          </Button>
        </CardContent>
      </Card>

      {/* Gestión (solo autenticados) */}
      {autenticado && mostrarGestion && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gestión de la vitrina</CardTitle>
            <CardDescription>Las publicaciones nacen del estado del vínculo en VU; aquí ajustas detalles y visibilidad.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {errorGestion && <p className="text-sm text-destructive">{errorGestion}</p>}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Visibilidad del portal</p>
                <p className="text-xs text-muted-foreground">&quot;Residentes&quot; exige sesión; &quot;Pública&quot; abre el catálogo a cualquiera con la URL.</p>
              </div>
              <Select value={visibilidad} onValueChange={cambiarVisibilidad}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="residentes">Solo residentes</SelectItem>
                  <SelectItem value="publica">Pública</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Unidad</th>
                    <th className="py-2 pr-3 font-medium">Operación</th>
                    <th className="py-2 pr-3 font-medium">Precio</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2 pr-3 font-medium">Leads</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {publicaciones.length === 0 && (
                    <tr><td colSpan={6} className="py-3 text-muted-foreground">Sin publicaciones. Cambia el estado inmobiliario de un propietario en VU o crea una manual.</td></tr>
                  )}
                  {publicaciones.map(p => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{refUnidad(p.unidadId)}</td>
                      <td className="py-2 pr-3 capitalize">{p.operacion}</td>
                      <td className="py-2 pr-3">{formatoPrecio(p.precio, p.moneda)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={p.activa ? "default" : "outline"}>{p.activa ? "Activa" : "Retirada"}</Badge>
                      </td>
                      <td className="py-2 pr-3">{leads.filter(l => l.publicacionId === p.id).length}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={p.activa}
                            aria-label={`Activar publicación ${refUnidad(p.unidadId)}`}
                            onCheckedChange={v => savePublicacionPortal({ ...p, activa: v })}
                          />
                          <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => { setEditando({ ...p }); setNuevaUrlImagen(""); }}>
                            <IconPencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="Eliminar"
                            onClick={() => {
                              const r = removePublicacionPortal(p.id)
                              if (!r.ok) setErrorGestion(r.error ?? "No se pudo eliminar.")
                            }}
                          >
                            <IconTrash className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" className="self-start" onClick={crearPublicacionManual}>
              <IconPlus className="size-4 mr-1" /> Nueva publicación manual
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Catálogo */}
      {catalogo.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No hay propiedades que coincidan con los filtros.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {catalogo.map(pub => (
            <Card key={pub.id} className="overflow-hidden pt-0">
              <div className="px-6 pt-6">
                {pub.imagenes[0]
                  ? /* D1: la imagen vive en una URL externa; nunca embebida */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pub.imagenes[0].url} alt={pub.imagenes[0].nombre} className="h-40 w-full rounded-md object-cover" />
                  : <PlaceholderFoto />}
              </div>
              <CardContent className="flex flex-col gap-2 pt-4">
                <div className="flex items-center gap-2">
                  <Badge variant={pub.operacion === "venta" ? "default" : "secondary"} className="capitalize">{pub.operacion}</Badge>
                  {pub.etiquetaEstado && <Badge variant="outline">{pub.etiquetaEstado}</Badge>}
                </div>
                <p className="text-lg font-semibold">{formatoPrecio(pub.precio, pub.moneda)}</p>
                <p className="flex items-center gap-1 text-sm text-muted-foreground"><IconMapPin className="size-4" /> {refUnidad(pub.unidadId)}</p>
                <p className="text-xs text-muted-foreground">
                  {pub.dormitorios ?? 0} dorm. · {pub.banos ?? 0} baños
                </p>
                <Button variant="outline" size="sm" className="mt-1" onClick={() => { setPubFicha(pub); setLeadMsg(null); setLeadNombre(""); setLeadContacto(""); setLeadMensaje("") }}>
                  Ver ficha y contactar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Ficha detallada + Me Interesa */}
      <Dialog open={!!pubFicha} onOpenChange={v => !v && setPubFicha(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {pubFicha && (
            <>
              <DialogHeader>
                <DialogTitle>{refUnidad(pubFicha.unidadId)} · <span className="capitalize">{pubFicha.operacion}</span></DialogTitle>
                <DialogDescription>{formatoPrecio(pubFicha.precio, pubFicha.moneda)}{pubFicha.etiquetaEstado ? ` · ${pubFicha.etiquetaEstado}` : ""}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                {pubFicha.imagenes.length === 0 ? (
                  <PlaceholderFoto />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {pubFicha.imagenes.map(img =>
                      img.url.startsWith("http")
                        ? /* eslint-disable-next-line @next/next/no-img-element */
                          <img key={img.nombre + img.url} src={img.url} alt={img.nombre} className="h-32 w-full rounded-md object-cover" />
                        : <PlaceholderFoto key={img.nombre + img.url} tipo={`${img.tipoMime} · ${img.tamanoKB}KB`} />
                    )}
                  </div>
                )}
                {pubFicha.descripcion && <p className="text-sm">{pubFicha.descripcion}</p>}
                {pubFicha.urlMapa ? (
                  <a href={pubFicha.urlMapa} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-sky-600 hover:underline">
                    <IconMapPin className="size-4" /> Ver mapa interactivo <IconExternalLink className="size-3" />
                  </a>
                ) : null}
                {pubFicha.condicionesContractuales && (
                  <div className="rounded-md border p-3 text-xs text-muted-foreground">
                    <p className="mb-1 font-medium text-foreground">Condiciones contractuales</p>
                    {pubFicha.condicionesContractuales}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Publicado el {pubFicha.fechaPublicacion}
                  {propietarioDeUnidad(pubFicha.unidadId) ? ` · Administrado por ${propietarioDeUnidad(pubFicha.unidadId)}` : ""}
                </p>
                <hr />
                <p className="text-sm font-medium">Me interesa</p>
                <p className="-mt-2 text-xs text-muted-foreground">Tus datos llegan solo al propietario a través de la bandeja interna (email simulado).</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Nombre</Label>
                    <Input value={leadNombre} onChange={e => setLeadNombre(e.target.value)} placeholder="Tu nombre" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Teléfono o correo</Label>
                    <Input value={leadContacto} onChange={e => setLeadContacto(e.target.value)} placeholder="+56 9 …" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mensaje (opcional)</Label>
                  <textarea
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={leadMensaje}
                    onChange={e => setLeadMensaje(e.target.value)}
                    placeholder="Cuéntale qué te interesa…"
                  />
                </div>
                {leadMsg && <p className={leadMsg.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"}>{leadMsg.text}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPubFicha(null)}>Cerrar</Button>
                <Button onClick={enviarLead}>Enviar interés</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Editor de publicación */}
      <Dialog open={!!editando} onOpenChange={v => { if (!v) { setEditando(null); setErrorGestion(null) } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {editando && (
            <>
              <DialogHeader>
                <DialogTitle>Editar publicación · {refUnidad(editando.unidadId)}</DialogTitle>
                <DialogDescription>D1: las imágenes se guardan solo como referencia (URL).</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Operación</Label>
                    <Select value={editando.operacion} onValueChange={v => setEditando({ ...editando, operacion: v as PublicacionPortal["operacion"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="venta">Venta</SelectItem>
                        <SelectItem value="arriendo">Arriendo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Moneda</Label>
                    <Select value={editando.moneda ?? "CLP"} onValueChange={v => setEditando({ ...editando, moneda: v as "CLP" | "UF" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLP">CLP</SelectItem>
                        <SelectItem value="UF">UF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Precio</Label>
                    <Input type="number" min={0} value={editando.precio} onChange={e => setEditando({ ...editando, precio: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Etiqueta de estado</Label>
                    <Input value={editando.etiquetaEstado ?? ""} onChange={e => setEditando({ ...editando, etiquetaEstado: e.target.value || undefined })} placeholder="Disponibilidad Inmediata" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dormitorios</Label>
                    <Input type="number" min={0} value={editando.dormitorios ?? 0} onChange={e => setEditando({ ...editando, dormitorios: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Baños</Label>
                    <Input type="number" min={0} value={editando.banos ?? 0} onChange={e => setEditando({ ...editando, banos: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">URL del mapa</Label>
                  <Input value={editando.urlMapa ?? ""} onChange={e => setEditando({ ...editando, urlMapa: e.target.value || undefined })} placeholder="https://maps.google.com/…" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descripción</Label>
                  <textarea
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={editando.descripcion ?? ""}
                    onChange={e => setEditando({ ...editando, descripcion: e.target.value || undefined })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Condiciones contractuales</Label>
                  <textarea
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={editando.condicionesContractuales ?? ""}
                    onChange={e => setEditando({ ...editando, condicionesContractuales: e.target.value || undefined })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Galería ({editando.imagenes.length})</Label>
                  {editando.imagenes.map((img, i) => (
                    <div key={`${img.nombre}-${i}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
                      <span className="truncate">{img.nombre} · {img.tipoMime} · {img.tamanoKB} KB</span>
                      <Button variant="ghost" size="icon" aria-label="Quitar imagen"
                        onClick={() => setEditando({ ...editando, imagenes: editando.imagenes.filter((_, j) => j !== i) })}>
                        <IconTrash className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input value={nuevaUrlImagen} onChange={e => setNuevaUrlImagen(e.target.value)} placeholder="https://…/foto.jpg" />
                    <Button variant="outline" size="sm"
                      onClick={() => {
                        const url = nuevaUrlImagen.trim()
                        if (!url) return
                        const esValida = /^https?:\/\//.test(url)
                        if (!esValida) { setErrorGestion("La imagen debe ser una URL http(s) — media por referencia (D1)."); return }
                        const ext = url.split(".").pop()?.toLowerCase() ?? ""
                        const tipoMime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg"
                        const nueva: ImagenReferencia = { nombre: url.split("/").pop() ?? "imagen", tipoMime, tamanoKB: 0, url }
                        setEditando({ ...editando, imagenes: [...editando.imagenes, nueva] })
                        setNuevaUrlImagen("")
                      }}
                    >
                      <IconPlus className="size-4" />
                    </Button>
                  </div>
                </div>
                {errorGestion && <p className="text-sm text-destructive">{errorGestion}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setEditando(null); setErrorGestion(null) }}>Cancelar</Button>
                <Button onClick={guardarEdicion}><IconCheck className="size-4 mr-1" /> Guardar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Bandeja de intereses (email simulado, D3) */}
      <Dialog open={bandejaAbierta} onOpenChange={setBandejaAbierta}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bandeja de intereses</DialogTitle>
            <DialogDescription>Notificaciones simuladas (canal email_simulado) generadas por el portal.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {notificacionesPI.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Sin intereses registrados aún.</p>}
            {notificacionesPI.map(n => (
              <button
                key={n.id}
                className={`rounded-md border p-3 text-left text-sm transition-colors hover:bg-muted/50 ${n.leida ? "opacity-60" : ""}`}
                onClick={() => marcarNotificacionLeida(n.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{n.asunto}</span>
                  {!n.leida && <Badge className="bg-sky-600 text-white">Nuevo</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{n.cuerpo}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{n.canal} · {n.fecha} · {n.moduloOrigen}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
