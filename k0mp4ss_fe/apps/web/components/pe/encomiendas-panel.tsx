"use client"

import * as React from "react"
import { useEncomiendasPE, useMaestrosPE } from "@/lib/api/use-pe"
import { nombresDePersonas, usePersonasOperacion } from "@/lib/api/use-personas"
import { etiquetasDeUnidades, useUnidadesOperacion } from "@/lib/api/use-unidades"
import { generarId } from "@/lib/id-utils"
import { hoyISO } from "@/lib/date-utils"
import { esUnidadDestino, etiquetaUnidad } from "@/lib/unidades-destino"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { IconCheck, IconTrash } from "@tabler/icons-react"
import { AvisoTruncamiento, LIMITE_SELECT } from "@/components/pe/aviso-truncamiento"
import type { EncomiendaPE } from "@/lib/schemas"

interface FormEncomienda {
  courierId: string
  destinatarioPersonaId: string
  unidadId: string
  descripcionPaquete: string
  evidenciaNombre: string
  evidenciaUrl: string
}

export function EncomiendasPanel({
  diaReporte,
  onError,
  onSuccess,
}: {
  diaReporte: string
  onError: (msg: string | null) => void
  onSuccess: (msg: string | null) => void
}) {
  // Datos de dominio vía API REST (BD fuente de verdad); el store legacy ya no participa.
  const {
    items: encomiendas,
    isLoading: cargandoEncomiendas,
    create: crearEncomiendaApi,
    update: actualizarEncomiendaApi,
    remove: eliminarEncomiendaApi,
  } = useEncomiendasPE()
  // Los padrones de la operación son las proyecciones `/api/pe/*` (permiso `pe:bitacora`):
  // `/api/personas` y `/api/unidades` están detrás de `mp` y devuelven 403 a conserjería.
  const { personas, total: totalPersonas } = usePersonasOperacion()
  const { unidades, total: totalUnidades } = useUnidadesOperacion()
  const { data: couriers } = useMaestrosPE("couriers")

  const [formEnc, setFormEnc] = React.useState<FormEncomienda>({
    courierId: "",
    destinatarioPersonaId: "",
    unidadId: "",
    descripcionPaquete: "",
    evidenciaNombre: "",
    evidenciaUrl: "",
  })
  const [retiroEnc, setRetiroEnc] = React.useState<{ id: string; retiradoPor: string } | null>(null)

  // Listas de opciones: se recortan a LIMITE_SELECT para no montar cientos de
  // SelectItem, y el recorte se declara en pantalla (nunca en silencio).
  const unidadesDestino = unidades.filter(esUnidadDestino)
  const unidadesVisibles = unidadesDestino.slice(0, LIMITE_SELECT)
  const personasVisibles = personas.slice(0, LIMITE_SELECT)

  /**
   * Etiquetas aprendidas en esta sesión: filas del día cuya unidad o persona quedó fuera de la
   * primera página del padrón (`pageSize=100`) se resuelven contra `?ids=` de las proyecciones
   * (dos peticiones por render como máximo, nunca una por fila) y quedan acá. Mientras llega la
   * respuesta la tabla sigue viéndose con el id: no se bloquea ni se agregan spinners por fila.
   */
  const [etiquetas, setEtiquetas] = React.useState<Record<string, string>>({})
  const idsPedidosRef = React.useRef<Set<string>>(new Set())
  const recordar = React.useCallback((id: string, etiqueta: string) => {
    setEtiquetas((previas) => ({ ...previas, [id]: etiqueta }))
  }, [])
  React.useEffect(() => {
    const filasDia = encomiendas.filter((e) => e.fechaRecepcion === diaReporte)
    const faltan = new Set<string>()
    for (const e of filasDia) {
      if (e.unidadId && !etiquetas[e.unidadId] && !unidades.some((u) => u.id === e.unidadId)) {
        faltan.add(e.unidadId)
      }
      if (
        e.destinatarioPersonaId &&
        !etiquetas[e.destinatarioPersonaId] &&
        !personas.some((p) => p.id === e.destinatarioPersonaId)
      ) {
        faltan.add(e.destinatarioPersonaId)
      }
    }
    // Cada id se pide una sola vez por sesión, aunque el efecto se re-ejecute (fallos incluidos:
    // si el servidor no responde, la fila sigue mostrando el id, como hasta hoy).
    const pedir = [...faltan].filter((id) => !idsPedidosRef.current.has(id))
    if (pedir.length === 0) return
    for (const id of pedir) idsPedidosRef.current.add(id)

    let vivo = true
    // Unidades y personas viven en rutas distintas: la lista completa va a cada proyección y cada
    // una devuelve las filas que le pertenecen. Nunca es una petición por fila.
    void (async () => {
      const [etiquetasUnidad, nombresPersona] = await Promise.all([
        etiquetasDeUnidades(pedir),
        nombresDePersonas(pedir),
      ])
      if (!vivo) return
      for (const [id, etiqueta] of Object.entries(etiquetasUnidad)) recordar(id, etiqueta)
      for (const [id, nombre] of Object.entries(nombresPersona)) recordar(id, nombre)
    })()
    return () => {
      vivo = false
    }
  }, [encomiendas, diaReporte, unidades, personas, etiquetas, recordar])

  const refUnidad = (id?: string) => {
    if (!id) return "—"
    const recordada = etiquetas[id]
    if (recordada) return recordada
    const u = unidades.find((x) => x.id === id)
    return u ? etiquetaUnidad(u) : id
  }
  const nombrePersona = (id?: string) => {
    if (!id) return "—"
    const recordada = etiquetas[id]
    if (recordada) return recordada
    const p = personas.find((x) => x.id === id)
    return p ? p.nombreCompleto : id
  }
  const nombreCourier = (id: string) => couriers.find((c) => c.id === id)?.nombre ?? id

  const guardarEncomienda = async () => {
    if (!formEnc.courierId) {
      onError("Seleccione el courier del maestro.")
      return
    }
    if (!formEnc.destinatarioPersonaId && !formEnc.unidadId) {
      onError("Indique el destinatario o la unidad de la encomienda.")
      return
    }
    if (formEnc.evidenciaUrl && !/^https?:\/\//i.test(formEnc.evidenciaUrl)) {
      onError("La evidencia debe ser una URL (media por referencia D1).")
      return
    }
    const enc: EncomiendaPE = {
      id: generarId("pe-enc"),
      courierId: formEnc.courierId,
      destinatarioPersonaId: formEnc.destinatarioPersonaId || undefined,
      unidadId: formEnc.unidadId || undefined,
      descripcionPaquete: formEnc.descripcionPaquete.trim() || undefined,
      evidencia: formEnc.evidenciaUrl
        ? {
            nombre: formEnc.evidenciaNombre || `evidencia-${Date.now()}.jpg`,
            tipoMime: "image/jpeg",
            tamanoKB: 120,
            url: formEnc.evidenciaUrl.trim(),
          }
        : undefined,
      fechaRecepcion: diaReporte,
      estado: "recibida",
    }
    const r = await crearEncomiendaApi(enc)
    if (!r.ok) {
      onError(r.error ?? "No se pudo registrar la encomienda.")
      return
    }
    setFormEnc({
      courierId: "",
      destinatarioPersonaId: "",
      unidadId: "",
      descripcionPaquete: "",
      evidenciaNombre: "",
      evidenciaUrl: "",
    })
    onError(null)
    onSuccess("Encomienda recibida y notificada según configuración.")
  }

  /** El retiro se sella en la encomienda de la base: estado + quién la retiró. */
  const confirmarRetiro = async () => {
    if (!retiroEnc) return
    if (!retiroEnc.retiradoPor.trim()) {
      onError("Debe identificar quién retira la encomienda.")
      return
    }
    const r = await actualizarEncomiendaApi(retiroEnc.id, {
      estado: "retirada",
      retiro: { retiradoPor: retiroEnc.retiradoPor.trim(), fechaRetiro: hoyISO() },
    })
    if (!r.ok) {
      onError(r.error ?? "")
      return
    }
    setRetiroEnc(null)
    onSuccess("Retiro registrado.")
  }

  const eliminarEncomienda = async (id: string) => {
    const r = await eliminarEncomiendaApi(id)
    if (!r.ok) onError(r.error ?? "")
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recepción de encomienda / delivery</CardTitle>
            <CardDescription>Courier normalizado por maestro · evidencia por URL (D1).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Courier / App *</Label>
              <Select
                value={formEnc.courierId || undefined}
                onValueChange={(v) => setFormEnc({ ...formEnc, courierId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {couriers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>Destinatario</Label>
                <Select
                  value={formEnc.destinatarioPersonaId || "__none"}
                  onValueChange={(v) =>
                    setFormEnc({ ...formEnc, destinatarioPersonaId: v === "__none" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin destinatario</SelectItem>
                    {personasVisibles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombreCompleto}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <AvisoTruncamiento mostrados={personasVisibles.length} total={totalPersonas} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Unidad</Label>
                <Select
                  value={formEnc.unidadId || "__none"}
                  onValueChange={(v) => setFormEnc({ ...formEnc, unidadId: v === "__none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin unidad</SelectItem>
                    {unidadesVisibles.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {etiquetaUnidad(u)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <AvisoTruncamiento mostrados={unidadesVisibles.length} total={totalUnidades} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="enc-desc">Descripción del paquete</Label>
              <Input
                id="enc-desc"
                value={formEnc.descripcionPaquete}
                onChange={(e) => setFormEnc({ ...formEnc, descripcionPaquete: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="enc-evn">Foto evidencia (nombre)</Label>
                <Input
                  id="enc-evn"
                  value={formEnc.evidenciaNombre}
                  onChange={(e) => setFormEnc({ ...formEnc, evidenciaNombre: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="enc-evu">URL foto (D1)</Label>
                <Input
                  id="enc-evu"
                  value={formEnc.evidenciaUrl}
                  onChange={(e) => setFormEnc({ ...formEnc, evidenciaUrl: e.target.value })}
                  placeholder="https://cdn.example/paquete.jpg"
                />
              </div>
            </div>
            <Button onClick={() => void guardarEncomienda()}>
              <IconCheck className="mr-1 size-4" /> Registrar recepción
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Encomiendas del día ({diaReporte})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {cargandoEncomiendas ? (
              <p className="p-4 text-sm text-muted-foreground" role="status">
                Cargando las encomiendas del día…
              </p>
            ) : encomiendas.filter((e) => e.fechaRecepcion === diaReporte).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Sin encomiendas para esta fecha.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3">Courier</th>
                    <th className="p-3">Destino</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {encomiendas
                    .filter((e) => e.fechaRecepcion === diaReporte)
                    .map((e) => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="p-3">
                          {nombreCourier(e.courierId)}
                          {e.descripcionPaquete ? (
                            <span className="block text-xs text-muted-foreground">{e.descripcionPaquete}</span>
                          ) : null}
                        </td>
                        <td className="p-3">
                          {refUnidad(e.unidadId)}
                          {e.destinatarioPersonaId ? (
                            <span className="block text-xs text-muted-foreground">
                              {nombrePersona(e.destinatarioPersonaId)}
                            </span>
                          ) : null}
                        </td>
                        <td className="p-3">
                          {e.estado === "recibida" ? (
                            <Badge variant="secondary">Recibida</Badge>
                          ) : (
                            <Badge variant="outline">Retirada por {e.retiro?.retiradoPor}</Badge>
                          )}
                        </td>
                        <td className="p-3 flex gap-1">
                          {e.estado === "recibida" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const destinatario = nombrePersona(e.destinatarioPersonaId)
                                  setRetiroEnc({
                                    id: e.id,
                                    retiradoPor: destinatario === "—" ? "" : destinatario,
                                  })
                                }}
                              >
                                Registrar retiro
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => void eliminarEncomienda(e.id)}
                              >
                                <IconTrash className="size-4" />
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!retiroEnc} onOpenChange={(open) => !open && setRetiroEnc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar retiro</DialogTitle>
            <DialogDescription>Quien retira presenta identificación en conserjería.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ret-por">Retirado por *</Label>
            <Input
              id="ret-por"
              value={retiroEnc?.retiradoPor ?? ""}
              onChange={(e) => setRetiroEnc((r) => (r ? { ...r, retiradoPor: e.target.value } : r))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetiroEnc(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarRetiro()}>Confirmar retiro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
