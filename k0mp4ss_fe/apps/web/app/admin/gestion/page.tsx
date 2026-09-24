"use client"

import * as React from "react"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
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
import { IconPhotoOff, IconPencil, IconUsers, IconHome, IconGavel, IconBriefcase, IconCheck } from "@tabler/icons-react"
import type { Persona, ControlPropiedad, ExtensionGobernanza } from "@/lib/schemas"
import { useControlesPropiedad } from "@/lib/api/use-controles-propiedad"

const CARGO_LABEL: Record<string, string> = {
  presidente: "Presidente",
  tesorero: "Tesorero",
  secretario: "Secretario",
  director: "Director",
}

function FotoReferencia({ url, nombre }: { url?: string; nombre: string }) {
  if (!url) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <IconPhotoOff className="size-5" />
      </div>
    )
  }
  if (url.startsWith("http")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={nombre} className="h-12 w-12 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <IconPhotoOff className="size-5" />
    </div>
  )
}

export default function GestionAdministrativaPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const personas = useCompassStore(s => s.personas)
  const vinculos = useCompassStore(s => s.vinculos)
  const unidades = useCompassStore(s => s.unidades)
  // Controles AD desde el servidor (BD-FUENTE-VERDAD Fase 2); personas y
  // unidades siguen en el store como caché de lectura hasta la Fase 5.
  const { controles: controlesPropiedades, save: guardarControlApi } = useControlesPropiedad()
  const savePersona = useCompassStore(s => s.savePersona)
  const saveControlPropiedad = useCompassStore(s => s.saveControlPropiedad)
  const [error, setError] = React.useState<string | null>(null)
  const [editandoFirma, setEditandoFirma] = React.useState<Persona | null>(null)
  const [firmaUrl, setFirmaUrl] = React.useState("")

  const refUnidad = React.useCallback(
    (unidadId: string) => {
      const u = unidades.find(x => x.id === unidadId)
      return u ? `${u.etiqueta} ${u.numero}` : unidadId
    },
    [unidades]
  )

  const propietarios = personas.filter(
    p => p.roles.includes("propietario") || vinculos.some(v => v.personaId === p.id && v.rol === "propietario")
  )
  const residentes = personas.filter(
    p => vinculos.some(v => v.personaId === p.id && v.rol === "arrendatario" && !v.fechaFin) || (p.roles.includes("residente") && !p.roles.includes("propietario"))
  )
  const directiva = personas.filter(p => p.datosGobernanza !== undefined)
  const personal = personas.filter(p => p.datosLaborales !== undefined)

  const unidadesDePropietario = (personaId: string) =>
    vinculos.filter(v => v.personaId === personaId && v.rol === "propietario" && !v.fechaFin).map(v => v.unidadId)

  // Defaults de lectura según spec AD: actas/morosidad ocultas, alertas activas.
  const controlDeUnidad = (unidadId: string): ControlPropiedad | undefined =>
    controlesPropiedades.find(c => c.unidadId === unidadId)

  const actualizarControl = async (unidadId: string, cambios: Partial<ControlPropiedad>) => {
    const existente = controlDeUnidad(unidadId)
    const base: ControlPropiedad = existente ?? {
      id: `ctrl-${unidadId}`,
      unidadId,
      residenteVeMorosidad: false,
      residenteVeActas: false,
      alertasResidentesActivas: true,
    }
    // Servidor primero (fuente de verdad); espejo local para la vista.
    const r = await guardarControlApi({ ...base, ...cambios })
    if (!r.ok) setError(r.error ?? "No se pudo guardar el control.")
    else {
      setError(null)
      saveControlPropiedad({ ...base, ...cambios })
    }
  }

  const guardarFirma = () => {
    if (!editandoFirma || !editandoFirma.datosGobernanza) return
    const url = firmaUrl.trim()
    const extension: ExtensionGobernanza = { ...editandoFirma.datosGobernanza, firmaDigital: url || undefined }
    const r = savePersona({ ...editandoFirma, datosGobernanza: extension })
    if (!r.ok) {
      setError(r.error ?? "No se pudo guardar la firma.")
      return
    }
    setError(null)
    setEditandoFirma(null)
    setFirmaUrl("")
  }

  if (!hasHydrated) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-9 w-80 rounded bg-muted/40" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/30" />
        <div className="h-10 w-full rounded-md bg-muted/30" />
        <div className="h-64 rounded-lg bg-muted/30" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gestión Administrativa</h1>
        <p className="text-sm text-muted-foreground">Cajón de Comunidad y Recursos Humanos — lectura centralizada del store.</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Tabs defaultValue="propietarios">
        <TabsList>
          <TabsTrigger value="propietarios"><IconHome className="size-4 mr-1" /> Propietarios ({propietarios.length})</TabsTrigger>
          <TabsTrigger value="residentes"><IconUsers className="size-4 mr-1" /> Residentes ({residentes.length})</TabsTrigger>
          <TabsTrigger value="directiva"><IconGavel className="size-4 mr-1" /> Directiva ({directiva.length})</TabsTrigger>
          <TabsTrigger value="personal"><IconBriefcase className="size-4 mr-1" /> Personal ({personal.length})</TabsTrigger>
        </TabsList>

        {/* Cajón 1.1: Propietarios con controles de privacidad */}
        <TabsContent value="propietarios" className="flex flex-col gap-4">
          {propietarios.length === 0 && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Sin propietarios registrados.</CardContent></Card>
          )}
          {propietarios.map(p => {
            const susUnidades = unidadesDePropietario(p.id)
            return (
              <Card key={p.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <FotoReferencia url={p.fotografiaUrl} nombre={p.nombreCompleto} />
                    <div>
                      <CardTitle className="text-base">{p.nombres} {p.apellidos}</CardTitle>
                      <CardDescription>{p.rut} · {p.telefonoMovil} · {p.email}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                {susUnidades.length > 0 && (
                  <CardContent className="flex flex-col gap-3 border-t pt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Controles de privacidad por unidad</p>
                    {susUnidades.map(unidadId => {
                      const c = controlDeUnidad(unidadId)
                      return (
                        <div key={unidadId} className="rounded-md border p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-sm font-medium">{refUnidad(unidadId)}</p>
                            {!c && <Badge variant="outline">defaults</Badge>}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <label className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                              Residente ve morosidad
                              <Switch
                                checked={c?.residenteVeMorosidad ?? false}
                                aria-label={`Morosidad visible en ${refUnidad(unidadId)}`}
                                onCheckedChange={v => actualizarControl(unidadId, { residenteVeMorosidad: v })}
                              />
                            </label>
                            <label className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                              Residente ve actas
                              <Switch
                                checked={c?.residenteVeActas ?? false}
                                aria-label={`Actas visibles en ${refUnidad(unidadId)}`}
                                onCheckedChange={v => actualizarControl(unidadId, { residenteVeActas: v })}
                              />
                            </label>
                            <label className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                              Alertas al residente
                              <Switch
                                checked={c?.alertasResidentesActivas ?? true}
                                aria-label={`Alertas activas en ${refUnidad(unidadId)}`}
                                onCheckedChange={v => actualizarControl(unidadId, { alertasResidentesActivas: v })}
                              />
                            </label>
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </TabsContent>

        {/* Cajón 1.2: Residentes con su vínculo a unidad */}
        <TabsContent value="residentes" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {residentes.length === 0 && (
            <Card className="md:col-span-2 xl:col-span-3"><CardContent className="py-8 text-center text-sm text-muted-foreground">Sin residentes registrados.</CardContent></Card>
          )}
          {residentes.map(p => {
            const vinculadas = vinculos.filter(v => v.personaId === p.id && v.rol === "arrendatario" && !v.fechaFin)
            return (
              <Card key={p.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <FotoReferencia url={p.fotografiaUrl} nombre={p.nombreCompleto} />
                    <div>
                      <CardTitle className="text-base">{p.nombres} {p.apellidos}</CardTitle>
                      <CardDescription>{p.rut}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {p.telefonoMovil} · {p.email}
                  <p className="mt-1">
                    Habita: {vinculadas.length === 0 ? "sin unidad vigente" : vinculadas.map(v => refUnidad(v.unidadId)).join(", ")}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>

        {/* Cajón 1.3: Directiva con firma digitalizada */}
        <TabsContent value="directiva" className="flex flex-col gap-4">
          {directiva.length === 0 && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Sin miembros de directiva registrados (extensión de gobernanza).</CardContent></Card>
          )}
          {directiva.map(p => (
            <Card key={p.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <FotoReferencia url={p.fotografiaUrl} nombre={p.nombreCompleto} />
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {p.nombres} {p.apellidos}
                      <Badge variant="secondary">{CARGO_LABEL[p.datosGobernanza!.cargoDirectiva]}</Badge>
                    </CardTitle>
                    <CardDescription>{p.rut} · asume el {p.datosGobernanza!.fechaAsuncion}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="border-t pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Firma digitalizada:{" "}
                    {p.datosGobernanza!.firmaDigital ? (
                      <span className="font-medium text-emerald-600">{p.datosGobernanza!.firmaDigital}</span>
                    ) : (
                      "sin cargar"
                    )}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => { setEditandoFirma(p); setFirmaUrl(p.datosGobernanza!.firmaDigital ?? ""); setError(null) }}>
                    <IconPencil className="size-4 mr-1" /> {p.datosGobernanza!.firmaDigital ? "Reemplazar firma" : "Cargar firma"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Cajón 2.1: RRHH — acceso centralizado al personal (detalle en PE) */}
        <TabsContent value="personal">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Maestro de Personal</CardTitle>
              <CardDescription>Fichas de trabajadores desde la extensión laboral. Requerimientos contractuales y previsionales detallados: módulo PE.</CardDescription>
            </CardHeader>
            <CardContent>
              {personal.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin personal registrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Trabajador</th>
                        <th className="py-2 pr-3 font-medium">Cargo</th>
                        <th className="py-2 pr-3 font-medium">AFP</th>
                        <th className="py-2 pr-3 font-medium">Previsión</th>
                        <th className="py-2 font-medium">Ingreso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {personal.map(p => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">{p.nombres} {p.apellidos}<span className="block text-xs text-muted-foreground">{p.rut}</span></td>
                          <td className="py-2 pr-3">{p.datosLaborales!.cargo}</td>
                          <td className="py-2 pr-3">{p.datosLaborales!.afp}</td>
                          <td className="py-2 pr-3">{p.datosLaborales!.prevision}</td>
                          <td className="py-2">{p.datosLaborales!.fechaIngreso}</td>
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

      {/* Carga de firma digitalizada por referencia (D1) */}
      <Dialog open={!!editandoFirma} onOpenChange={v => { if (!v) { setEditandoFirma(null); setError(null) } }}>
        <DialogContent className="sm:max-w-md">
          {editandoFirma && (
            <>
              <DialogHeader>
                <DialogTitle>Firma digitalizada · {editandoFirma.nombres} {editandoFirma.apellidos}</DialogTitle>
                <DialogDescription>D1: la firma se guarda como URL de referencia (imagen), nunca embebida en el store.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label className="text-xs">URL de la imagen de firma</Label>
                <Input value={firmaUrl} onChange={e => setFirmaUrl(e.target.value)} placeholder="https://…/firma.png" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setEditandoFirma(null); setError(null) }}>Cancelar</Button>
                <Button onClick={guardarFirma}><IconCheck className="size-4 mr-1" /> Guardar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
