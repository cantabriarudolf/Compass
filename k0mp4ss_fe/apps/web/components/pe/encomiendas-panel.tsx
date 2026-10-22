"use client"

import * as React from "react"
import { useCompassStore } from "@/lib/store"
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
  const unidades = useCompassStore((s) => s.unidades)
  const personas = useCompassStore((s) => s.personas)
  const maestros = useCompassStore((s) => s.maestros)
  const encomiendas = useCompassStore((s) => s.encomiendasPE)
  const saveEncomiendaPE = useCompassStore((s) => s.saveEncomiendaPE)
  const registrarRetiroEncomiendaPE = useCompassStore((s) => s.registrarRetiroEncomiendaPE)
  const removeEncomiendaPE = useCompassStore((s) => s.removeEncomiendaPE)

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
  const unidadesDestino = unidades.filter((u) => !u.id.startsWith("u-E-"))
  const unidadesVisibles = unidadesDestino.slice(0, LIMITE_SELECT)
  const personasVisibles = personas.slice(0, LIMITE_SELECT)

  const refUnidad = (id?: string) => {
    if (!id) return "—"
    const u = unidades.find((x) => x.id === id)
    return u ? `${u.etiqueta} ${u.numero}` : id
  }
  const nombrePersona = (id?: string) => {
    if (!id) return "—"
    const p = personas.find((x) => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }

  const guardarEncomienda = () => {
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
      id: `pe-enc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    const r = saveEncomiendaPE(enc)
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
                  {maestros.couriers.map((c) => (
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
                <AvisoTruncamiento mostrados={personasVisibles.length} total={personas.length} />
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
                        {u.etiqueta} {u.numero}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <AvisoTruncamiento mostrados={unidadesVisibles.length} total={unidadesDestino.length} />
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
            <Button onClick={guardarEncomienda}>
              <IconCheck className="mr-1 size-4" /> Registrar recepción
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Encomiendas del día ({diaReporte})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {encomiendas.filter((e) => e.fechaRecepcion === diaReporte).length === 0 ? (
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
                          {maestros.couriers.find((c) => c.id === e.courierId)?.nombre ?? e.courierId}
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
                                onClick={() =>
                                  setRetiroEnc({
                                    id: e.id,
                                    retiradoPor:
                                      nombrePersona(e.destinatarioPersonaId) === "—"
                                        ? ""
                                        : nombrePersona(e.destinatarioPersonaId),
                                  })
                                }
                              >
                                Registrar retiro
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  const r = removeEncomiendaPE(e.id)
                                  if (!r.ok) onError(r.error ?? "")
                                }}
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
            <Button
              onClick={() => {
                if (!retiroEnc) return
                const r = registrarRetiroEncomiendaPE(retiroEnc.id, retiroEnc.retiradoPor)
                if (!r.ok) {
                  onError(r.error ?? "")
                } else {
                  setRetiroEnc(null)
                  onSuccess("Retiro registrado.")
                }
              }}
            >
              Confirmar retiro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
