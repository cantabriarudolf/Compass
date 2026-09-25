"use client"

import * as React from "react"
// Datos de dominio vía API REST (BD fuente de verdad); store legacy deprecado.
import { usePersonas } from "@/lib/api/use-personas"
import { useUnidades } from "@/lib/api/use-unidades"
import { useInfraccionesIN, useTiposInfraccionIN } from "@/lib/api/use-in"
import { useCompassStore } from "@/lib/store"
import { aTituloCaso, aOracion } from "@/lib/normalizacion"
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
  IconGavel,
  IconPlus,
  IconEye,
  IconScale,
  IconUsersGroup,
} from "@tabler/icons-react"
import type {
  CategoriaInfraccionIN,
  EstadoInfraccionIN,
  InfraccionIN,
  TipoInfraccionIN,
} from "@/lib/schemas"

const CATEGORIA_LABEL: Record<CategoriaInfraccionIN, string> = {
  leve: "Leve",
  grave: "Grave",
  gravisima: "Gravísima",
}

const CATEGORIA_BADGE: Record<CategoriaInfraccionIN, string> = {
  leve: "bg-sky-600 hover:bg-sky-700 text-white",
  grave: "bg-amber-500 hover:bg-amber-600 text-white",
  gravisima: "bg-destructive hover:bg-destructive text-white",
}

const ESTADO_LABEL: Record<EstadoInfraccionIN, string> = {
  en_revision: "En Revisión",
  apelada: "Apelada",
  aplicada: "Cerrada / Aplicada",
  desestimada: "Desestimada",
}

const ESTADO_BADGE: Record<EstadoInfraccionIN, string> = {
  en_revision: "bg-sky-600 hover:bg-sky-700 text-white",
  apelada: "bg-violet-600 hover:bg-violet-700 text-white",
  aplicada: "bg-emerald-600 hover:bg-emerald-700 text-white",
  desestimada: "bg-muted text-muted-foreground",
}

const sancionLabel = (t: TipoInfraccionIN): string =>
  t.tipoSancion === "porcentaje_gc" ? `${t.valor}% GC` : `$${t.valor.toLocaleString("es-CL")}`

interface FormTipo {
  nombre: string
  categoria: CategoriaInfraccionIN
  tipoSancion: "monto_fijo" | "porcentaje_gc"
  valor: string
}

interface FormInfraccion {
  origen: "catalogo" | "dano"
  tipoInfraccionId: string
  descripcionDaño: string
  costoReparacion: string
  unidadId: string
  reportantePersonaId: string
  mensajeBuzonId: string
  fechaSuceso: string
  horaSuceso: string
  antecedentes: string
  evidenciaUrl: string
}

export default function MultasPage() {
  const {
items: tipos, isLoading: cTipos, create: crearTipoApi, update: actualizarTipoApi, remove: eliminarTipoApi,
  } = useTiposInfraccionIN()
  const {
items: infracciones, isLoading: cInfracciones, create: crearInfraccionApi, update: actualizarInfraccionApi, remove: eliminarInfraccionApi,
  } = useInfraccionesIN()
  const { personas, isLoading: cPersonas } = usePersonas()
  const { items: unidades, isLoading: cUnidades } = useUnidades()
  // TODO: migrar mensajesBuzonCO a hook SWR cuando exista (módulo CO sin hooks aún)
  const mensajesBuzonCO = useCompassStore(s => s.mensajesBuzonCO)
  const isLoading = cTipos || cInfracciones || cPersonas || cUnidades

  const [error, setError] = React.useState<string | null>(null)
  const [detalle, setDetalle] = React.useState<InfraccionIN | null>(null)
  const [formTipo, setFormTipo] = React.useState<FormTipo | null>(null)
  const [editandoTipoId, setEditandoTipoId] = React.useState<string | null>(null)
  const [nueva, setNueva] = React.useState<FormInfraccion | null>(null)

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

  const ordenadas = [...infracciones].reverse()
  const contadores = (Object.keys(ESTADO_LABEL) as EstadoInfraccionIN[]).map(e => ({
    estado: e,
    total: infracciones.filter(i => i.estado === e).length,
  }))
  const montoAplicadoTotal = infracciones.reduce((acc, i) => acc + (i.montoAplicado ?? 0), 0)
  const porCategoria = (Object.keys(CATEGORIA_LABEL) as CategoriaInfraccionIN[]).map(c => ({
    categoria: c,
    total: infracciones.filter(i => {
      if (i.danoDirecto) return false
      const t = tipos.find(x => x.id === i.tipoInfraccionId)
      return t?.categoria === c
    }).length,
  }))

  const guardarTipo = async () => {
    if (!formTipo) return
    setError(null)
    const payload = {
      nombre: aTituloCaso(formTipo.nombre),
      categoria: formTipo.categoria,
      tipoSancion: formTipo.tipoSancion,
      valor: Number(formTipo.valor),
    }
    const r = editandoTipoId
      ? await actualizarTipoApi(editandoTipoId, payload)
      : await crearTipoApi(payload)
    if (!r.ok) { setError(r.error ?? "No se pudo guardar el tipo."); return }
    setFormTipo(null)
    setEditandoTipoId(null)
  }

  const registrarInfraccion = async () => {
    if (!nueva) return
    setError(null)
    const mensaje = mensajesBuzonCO.find(m => m.id === nueva.mensajeBuzonId)
    // Folio IN-#### correlativo: el POST upsert exige id y folio desde el cliente.
    const numeros = infracciones.map(i => Number.parseInt(i.folio.replace(/^IN-/, ""), 10)).filter(n => Number.isFinite(n))
    const folio = `IN-${String((numeros.length > 0 ? Math.max(...numeros) : 0) + 1).padStart(4, "0")}`
    const r = await crearInfraccionApi({
      id: `in-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      folio,
      ...(nueva.origen === "catalogo"
        ? { tipoInfraccionId: nueva.tipoInfraccionId }
        : { danoDirecto: { descripcionDaño: aOracion(nueva.descripcionDaño), costoReparacion: Number(nueva.costoReparacion) }, evidencias: nueva.evidenciaUrl ? [{ nombre: "respaldo-dano", tipoMime: "application/pdf", tamanoKB: 120, url: nueva.evidenciaUrl.trim() }] : [] }),
      unidadId: nueva.unidadId,
      ...(nueva.reportantePersonaId ? { reportantePersonaId: nueva.reportantePersonaId } : {}),
      ...(nueva.mensajeBuzonId ? { mensajeBuzonId: nueva.mensajeBuzonId } : {}),
      fechaSuceso: nueva.fechaSuceso,
      horaSuceso: nueva.horaSuceso,
      antecedentes: aOracion(nueva.antecedentes) || (mensaje ? `[Reclamo ${mensaje.folio}] ${mensaje.asunto}: ${mensaje.cuerpo}` : ""),
      evidencias: nueva.origen === "catalogo" && nueva.evidenciaUrl
        ? [{ nombre: "evidencia", tipoMime: "image/jpeg", tamanoKB: 90, url: nueva.evidenciaUrl }]
        : nueva.origen === "dano" && nueva.evidenciaUrl
          ? [{ nombre: "cotizacion-dano.pdf", tipoMime: "application/pdf", tamanoKB: 140, url: nueva.evidenciaUrl }]
          : [],
      estado: "en_revision",
      fechaRegistro: new Date().toISOString().slice(0, 10),
      comentariosDirectiva: [],
      respaldosDirectiva: [],
    } as Partial<InfraccionIN>)
    if (!r.ok) { setError(r.error ?? "No se pudo registrar."); return }
    setNueva(null)
  }

  if (isLoading) {
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
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><IconGavel className="size-6" /> Infracciones y Multas</h1>
          <p className="text-sm text-muted-foreground">Faltas al Reglamento de Copropiedad con sanciones estandarizadas; cargos al Gasto Común pendientes a Finanzas.</p>
        </div>
      </div>

      {/* Panel resumen */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><IconScale className="size-4" /> Panel de Supervisión</CardTitle>
          <CardDescription>Volumen por estado y categoría, montos comprometidos.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {contadores.map(c => (
            <Badge key={c.estado} variant="outline" className={`gap-1 border-transparent px-2 py-1 text-xs ${ESTADO_BADGE[c.estado]}`}>
              {ESTADO_LABEL[c.estado]}: {c.total}
            </Badge>
          ))}
          {porCategoria.map(c => (
            <Badge key={c.categoria} variant="outline" className={`gap-1 border-transparent px-2 py-1 text-xs ${CATEGORIA_BADGE[c.categoria]}`}>
              {CATEGORIA_LABEL[c.categoria]}: {c.total}
            </Badge>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">Montos aplicados acumulados: ${montoAplicadoTotal.toLocaleString("es-CL")} · cargos FI pendientes</span>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Tabs defaultValue="registro">
        <TabsList>
          <TabsTrigger value="registro">Registro</TabsTrigger>
          <TabsTrigger value="directiva"><IconUsersGroup className="size-4 mr-1" /> Directiva</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo de faltas</TabsTrigger>
        </TabsList>

        {/* Registro operativo */}
        <TabsContent value="registro" className="flex flex-col gap-3">
          <div>
            <Button onClick={() => setNueva({ origen: "catalogo", tipoInfraccionId: "", descripcionDaño: "", costoReparacion: "", unidadId: "", reportantePersonaId: "", mensajeBuzonId: "", fechaSuceso: new Date().toISOString().slice(0, 10), horaSuceso: "12:00", antecedentes: "", evidenciaUrl: "" })}>
              <IconPlus className="size-4 mr-1" /> Registrar infracción
            </Button>
          </div>
          <Card>
            <CardContent className="pt-4">
              {ordenadas.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin infracciones registradas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Folio</th>
                        <th className="py-2 pr-3 font-medium">Falta / Daño</th>
                        <th className="py-2 pr-3 font-medium">Unidad</th>
                        <th className="py-2 pr-3 font-medium">Fecha suceso</th>
                        <th className="py-2 pr-3 font-medium">Estado</th>
                        <th className="py-2 pr-3 font-medium">Monto</th>
                        <th className="py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordenadas.map(i => (
                        <tr key={i.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">{i.folio}</td>
                          <td className="py-2 pr-3">
                            {i.danoDirecto?.descripcionDaño ?? tipos.find(t => t.id === i.tipoInfraccionId)?.nombre ?? "—"}
                          </td>
                          <td className="py-2 pr-3">{refUnidad(i.unidadId)}</td>
                          <td className="py-2 pr-3">{i.fechaSuceso} {i.horaSuceso}</td>
                          <td className="py-2 pr-3"><Badge className={`${ESTADO_BADGE[i.estado]} text-[10px]`}>{ESTADO_LABEL[i.estado]}</Badge></td>
                          <td className="py-2 pr-3">{i.montoAplicado !== undefined ? `$${i.montoAplicado.toLocaleString("es-CL")}` : "—"}</td>
                          <td className="py-2">
                            <Button size="sm" variant="ghost" onClick={() => setDetalle(i)}><IconEye className="size-4 mr-1" /> Ver</Button>
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

        {/* Panel directiva */}
        <TabsContent value="directiva" className="flex flex-col gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Incidentes y multas en curso</CardTitle>
              <CardDescription>Comentarios internos y respaldos visibles solo para administración y directiva.</CardDescription>
            </CardHeader>
            <CardContent>
              {ordenadas.filter(i => ["en_revision", "apelada"].includes(i.estado)).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin expedientes en curso.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Folio</th>
                      <th className="py-2 pr-3 font-medium">Falta</th>
                      <th className="py-2 pr-3 font-medium">Estado</th>
                      <th className="py-2 pr-3 font-medium">Respaldos</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenadas.filter(i => ["en_revision", "apelada"].includes(i.estado)).map(i => (
                      <tr key={i.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs">{i.folio}</td>
                        <td className="py-2 pr-3">{i.danoDirecto?.descripcionDaño ?? tipos.find(t => t.id === i.tipoInfraccionId)?.nombre}</td>
                        <td className="py-2 pr-3"><Badge className={`${ESTADO_BADGE[i.estado]} text-[10px]`}>{ESTADO_LABEL[i.estado]}</Badge></td>
                        <td className="py-2 pr-3">{i.respaldosDirectiva.length > 0 ? `${i.respaldosDirectiva.length} respaldo(s)` : "—"}</td>
                        <td className="py-2"><Button size="sm" variant="ghost" onClick={() => setDetalle(i)}><IconEye className="size-4 mr-1" /> Expediente</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Catálogo */}
        <TabsContent value="catalogo" className="flex flex-col gap-3">
          <div>
            <Button onClick={() => { setEditandoTipoId(null); setFormTipo({ nombre: "", categoria: "leve", tipoSancion: "monto_fijo", valor: "" }) }}>
              <IconPlus className="size-4 mr-1" /> Nuevo tipo de falta
            </Button>
          </div>
          <Card>
            <CardContent className="pt-4">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Nombre</th>
                    <th className="py-2 pr-3 font-medium">Categoría</th>
                    <th className="py-2 pr-3 font-medium">Sanción base</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {tipos.map(t => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{t.nombre}</td>
                      <td className="py-2 pr-3"><Badge className={`${CATEGORIA_BADGE[t.categoria]} text-[10px]`}>{CATEGORIA_LABEL[t.categoria]}</Badge></td>
                      <td className="py-2 pr-3">{sancionLabel(t)}</td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => {
                            setEditandoTipoId(t.id)
                            setFormTipo({ nombre: t.nombre, categoria: t.categoria, tipoSancion: t.tipoSancion, valor: t.valor.toString() })
                          }}>Editar</Button>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            const r = await eliminarTipoApi(t.id)
                            if (!r.ok) setError(r.error ?? "No se pudo eliminar.")
                          }}>Eliminar</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detalle / expediente */}
      <Dialog open={!!detalle} onOpenChange={v => { if (!v) setDetalle(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detalle.folio}
                  <Badge className={`${ESTADO_BADGE[detalle.estado]} text-[10px]`}>{ESTADO_LABEL[detalle.estado]}</Badge>
                </DialogTitle>
                <DialogDescription>{refUnidad(detalle.unidadId)} · Suceso {detalle.fechaSuceso} {detalle.horaSuceso}{detalle.reportantePersonaId ? ` · Reporta ${nombrePersona(detalle.reportantePersonaId)}` : ""}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 text-sm">
                <div>
                  <p className="font-medium">{detalle.danoDirecto ? `Daño directo: $${detalle.danoDirecto.costoReparacion.toLocaleString("es-CL")}` : tipos.find(t => t.id === detalle.tipoInfraccionId)?.nombre}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{detalle.antecedentes}</p>
                </div>

                {detalle.evidencias.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Evidencias ({detalle.evidencias.length})</p>
                    <ul className="list-disc pl-5 text-xs text-muted-foreground">
                      {detalle.evidencias.map((e, idx) => <li key={idx}>{e.nombre} ({e.tipoMime}, {e.tamanoKB} KB)</li>)}
                    </ul>
                  </div>
                )}

                {detalle.apelacion && (
                  <div className="rounded-md border-l-2 border-violet-400/60 bg-violet-50/40 p-2 text-xs dark:bg-violet-950/20">
                    <p className="font-medium">Descargos del vecino ({detalle.apelacion.fecha})</p>
                    <p>{detalle.apelacion.descargos}</p>
                  </div>
                )}

                {detalle.comentariosDirectiva.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Comentarios internos (admin/directiva)</p>
                    {detalle.comentariosDirectiva.map(c => (
                      <div key={c.id} className="mb-1 rounded-md border-l-2 border-primary/60 bg-muted/30 p-2 text-xs">
                        <p className="font-medium">{nombrePersona(c.autorPersonaId)} · {c.fecha.slice(0, 16).replace("T", " ")}</p>
                        <p>{c.texto}</p>
                      </div>
                    ))}
                  </div>
                )}

                {detalle.respaldosDirectiva.length > 0 && (
                  <p className="rounded-md border border-emerald-300/60 bg-emerald-50/40 p-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/20">
                    Respaldo directiva: {detalle.respaldosDirectiva.map(r => nombrePersona(r)).join(", ")}
                  </p>
                )}

                {detalle.desestimacionJustificacion && (
                  <div className="rounded-md border p-2 text-xs">
                    <p className="font-medium">Desestimación</p>
                    <p>{detalle.desestimacionJustificacion}</p>
                  </div>
                )}

                {["en_revision", "apelada"].includes(detalle.estado) && (
                  <div className="flex flex-wrap gap-2 rounded-md border p-3">
                    <Button size="sm" onClick={() => {
                      // TODO: migrar a API REST (workflow del expediente IN sin endpoint dedicado todavía; fallback legacy al store)
                      const r = useCompassStore.getState().aplicarInfraccionIN(detalle.id)
                      if (!r.ok) { setError(r.error ?? "No se pudo aplicar."); return }
                      setDetalle(useCompassStore.getState().infraccionesIN.find(x => x.id === detalle.id) ?? null)
                    }}>Aplicar multa</Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      const justificacion = window.prompt("Justificación de la desestimación (obligatoria):")
                      if (!justificacion?.trim()) { setError("La desestimación exige justificación obligatoria."); return }
                      // TODO: migrar a API REST (workflow del expediente IN sin endpoint dedicado todavía; fallback legacy al store)
                      const r = useCompassStore.getState().desestimarInfraccionIN(detalle.id, justificacion)
                      if (!r.ok) { setError(r.error ?? "No se pudo desestimar."); return }
                      setDetalle(null)
                    }}>Desestimar</Button>
                    {detalle.estado === "en_revision" && (
                      <Button size="sm" variant="outline" onClick={() => {
                        const descargos = window.prompt("Descargos del vecino:")
                        if (!descargos?.trim()) return
                        // TODO: migrar a API REST (workflow del expediente IN sin endpoint dedicado todavía; fallback legacy al store)
                        const r = useCompassStore.getState().apelarInfraccionIN(detalle.id, descargos)
                        if (!r.ok) { setError(r.error ?? "No se pudieron registrar los descargos."); return }
                        setDetalle(useCompassStore.getState().infraccionesIN.find(x => x.id === detalle.id) ?? null)
                      }}>Registrar apelación</Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Formulario tipo de falta */}
      <Dialog open={!!formTipo} onOpenChange={v => { if (!v) { setFormTipo(null); setEditandoTipoId(null) } }}>
        <DialogContent className="sm:max-w-md">
          {formTipo && (
            <>
              <DialogHeader>
                <DialogTitle>{editandoTipoId ? "Editar tipo de falta" : "Nuevo tipo de falta"}</DialogTitle>
                <DialogDescription>Parametrización del catálogo para estandarizar cobros.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={formTipo.nombre} onChange={e => setFormTipo({ ...formTipo, nombre: e.target.value })} onBlur={() => setFormTipo((f) => (f ? { ...f, nombre: aTituloCaso(f.nombre) } : f))} placeholder="Ej: Ruidos Molestos" />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Categoría</Label>
                    <Select value={formTipo.categoria} onValueChange={v => setFormTipo({ ...formTipo, categoria: v as CategoriaInfraccionIN })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(CATEGORIA_LABEL) as CategoriaInfraccionIN[]).map(c => (
                          <SelectItem key={c} value={c}>{CATEGORIA_LABEL[c]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sanción base</Label>
                    <Select value={formTipo.tipoSancion} onValueChange={v => setFormTipo({ ...formTipo, tipoSancion: v as typeof formTipo.tipoSancion })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monto_fijo">Monto fijo ($)</SelectItem>
                        <SelectItem value="porcentaje_gc">Porcentaje (%) del Gasto Común</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{formTipo.tipoSancion === "porcentaje_gc" ? "Porcentaje (%)" : "Monto ($)"}</Label>
                  <Input type="number" min={0} value={formTipo.valor} onChange={e => setFormTipo({ ...formTipo, valor: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setFormTipo(null); setEditandoTipoId(null) }}>Cancelar</Button>
                <Button onClick={guardarTipo}>Guardar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Nueva infracción */}
      <Dialog open={!!nueva} onOpenChange={v => { if (!v) setNueva(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {nueva && (
            <>
              <DialogHeader>
                <DialogTitle>Registrar infracción</DialogTitle>
                <DialogDescription>Tipo del catálogo o cobro directo por daños; evidencias por referencia (D1).</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Origen *</Label>
                  <Select value={nueva.origen} onValueChange={v => setNueva({ ...nueva, origen: v as typeof nueva.origen })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="catalogo">Falta del catálogo</SelectItem>
                      <SelectItem value="dano">Cobro directo por daños</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {nueva.origen === "catalogo" ? (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo de infracción *</Label>
                      <Select value={nueva.tipoInfraccionId || ""} onValueChange={v => setNueva({ ...nueva, tipoInfraccionId: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                        <SelectContent>
                          {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre} · {CATEGORIA_LABEL[t.categoria]} · {sancionLabel(t)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Convertir desde reclamo CO (opcional)</Label>
                      <Select value={nueva.mensajeBuzonId || "ninguno"} onValueChange={v => {
                        const m = mensajesBuzonCO.find(x => x.id === v)
                        setNueva({
                          ...nueva,
                          mensajeBuzonId: v === "ninguno" ? "" : v,
                          antecedentes: m ? `[Reclamo ${m.folio}] ${m.asunto}: ${m.cuerpo}` : nueva.antecedentes,
                        })
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ninguno">Sin reclamo asociado</SelectItem>
                          {mensajesBuzonCO.map(m => <SelectItem key={m.id} value={m.id}>{m.folio} · {m.asunto}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Descripción del daño *</Label>
                      <Input value={nueva.descripcionDaño} onChange={e => setNueva({ ...nueva, descripcionDaño: e.target.value })} onBlur={() => setNueva((n) => (n ? { ...n, descripcionDaño: aOracion(n.descripcionDaño) } : n))} placeholder="Ej: Rotura de espejo del ascensor" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Costo de reparación ($) *</Label>
                      <Input type="number" min={1} value={nueva.costoReparacion} onChange={e => setNueva({ ...nueva, costoReparacion: e.target.value })} />
                    </div>
                  </>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Unidad infractora *</Label>
                    <Select value={nueva.unidadId || ""} onValueChange={v => setNueva({ ...nueva, unidadId: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                      <SelectContent>
                        {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.etiqueta} {u.numero}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Reportante</Label>
                    <Select value={nueva.reportantePersonaId || "ninguno"} onValueChange={v => setNueva({ ...nueva, reportantePersonaId: v === "ninguno" ? "" : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguno">Conserjería/Administración</SelectItem>
                        {personas.filter(p => p.estadoCuenta === "activa").map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.nombres} {p.apellidos}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha del suceso *</Label>
                    <Input type="date" value={nueva.fechaSuceso} onChange={e => setNueva({ ...nueva, fechaSuceso: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hora del suceso *</Label>
                    <Input type="time" value={nueva.horaSuceso} onChange={e => setNueva({ ...nueva, horaSuceso: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Antecedentes * (mínimo 20 caracteres)</Label>
                  <textarea
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={nueva.antecedentes}
                    onChange={e => setNueva({ ...nueva, antecedentes: e.target.value })}
                    onBlur={() => setNueva((n) => (n ? { ...n, antecedentes: aOracion(n.antecedentes) } : n))}
                    placeholder="Descripción detallada de los hechos…"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Evidencia (URL D1){nueva.origen === "dano" ? " * cotización/factura/foto" : ""}</Label>
                  <Input value={nueva.evidenciaUrl} onChange={e => setNueva({ ...nueva, evidenciaUrl: e.target.value })} onBlur={() => setNueva((n) => (n ? { ...n, evidenciaUrl: n.evidenciaUrl.trim() } : n))} placeholder="https://…" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNueva(null)}>Cancelar</Button>
                <Button onClick={registrarInfraccion}>Registrar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
