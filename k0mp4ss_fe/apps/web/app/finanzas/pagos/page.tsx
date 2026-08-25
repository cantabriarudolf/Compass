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
  IconReceipt,
  IconCash,
  IconFileText,
  IconLock,
} from "@tabler/icons-react"
import type { CobroFI, ConceptoCobroFI } from "@/lib/schemas"
import { estadoDeCobro, hoyISO, saldoPendiente, type EstadoCobroFI } from "@/lib/finanzas-utils"

const CONCEPTO_LABEL: Record<ConceptoCobroFI, string> = {
  gasto_comun: "Gasto Común",
  cuota_extraordinaria: "Cuota Extraordinaria",
  multa_in: "Multa (IN)",
  consumo: "Consumo",
  reserva_ra: "Reserva (RA)",
  penalizacion_ra: "Penalización (RA)",
  garantia_ra: "Garantía retenida (RA)",
}

const ESTADO_COBRO_BADGE: Record<EstadoCobroFI, string> = {
  pagado: "bg-emerald-600 hover:bg-emerald-700 text-white",
  pendiente: "bg-sky-600 hover:bg-sky-700 text-white",
  parcial: "bg-amber-500 hover:bg-amber-600 text-white",
  vencido: "bg-destructive hover:bg-destructive text-white",
}

interface FormPago {
  monto: string
  medio: string
  ajusteJustificacion: string
}

export default function PagosPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const cobros = useCompassStore(s => s.cobrosFI)
  const unidades = useCompassStore(s => s.unidades)
  const fondos = useCompassStore(s => s.fondosFI)
  const registrarPagoFI = useCompassStore(s => s.registrarPagoFI)

  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)
  const [filtroConcepto, setFiltroConcepto] = React.useState<string>("todos")
  const [filtroEstado, setFiltroEstado] = React.useState<string>("todos")
  const [pagoObjetivo, setPagoObjetivo] = React.useState<CobroFI | null>(null)
  const [detalle, setDetalle] = React.useState<CobroFI | null>(null)
  const [formPago, setFormPago] = React.useState<FormPago>({ monto: "", medio: "transferencia", ajusteJustificacion: "" })

  const refUnidad = (id?: string) => {
    if (!id) return "—"
    const u = unidades.find(x => x.id === id)
    return u ? `${u.etiqueta} ${u.numero}` : "sin unidad"
  }

  const filtrados = cobros
    .filter(c => filtroConcepto === "todos" || c.concepto === filtroConcepto)
    .filter(c => filtroEstado === "todos" || estadoDeCobro(c) === filtroEstado)
    .sort((a, b) => b.fechaCargo.localeCompare(a.fechaCargo))

  const recaudado = cobros.reduce((acc, c) => acc + c.pagos.reduce((x, p) => x + p.monto, 0), 0)
  const porCobrar = cobros.reduce((acc, c) => acc + saldoPendiente(c), 0)

  const abrirPago = (c: CobroFI) => {
    setError(null)
    setPagoObjetivo(c)
    const pendiente = saldoPendiente(c)
    setFormPago({ monto: String(pendiente), medio: "transferencia", ajusteJustificacion: "" })
  }

  const confirmarPago = () => {
    if (!pagoObjetivo) return
    const pendiente = saldoPendiente(pagoObjetivo)
    const monto = Number.parseFloat(formPago.monto.replace(/\./g, "").replace(",", ".")) || 0
    const r = registrarPagoFI(pagoObjetivo.id, {
      monto,
      medio: formPago.medio.trim(),
      ...(monto !== pendiente && formPago.ajusteJustificacion.trim() ? { ajusteJustificacion: formPago.ajusteJustificacion.trim() } : {}),
    })
    if (!r.ok) {
      setError(r.error ?? "No se pudo registrar el pago.")
      return
    }
    setOkMsg(
      monto !== pendiente
        ? `Pago procesado con ajuste manual; informe de diferencia generado e inmutable.`
        : `Pago registrado por $${monto.toLocaleString("es-CL")}.`
    )
    setPagoObjetivo(null)
  }

  if (!hasHydrated) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 border-b pb-5">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><IconReceipt className="size-7 text-primary" /> Recaudación</h1>
        <p className="text-muted-foreground">Libro unificado de cobros y pagos de la comunidad, con mora y ajustes auditados.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><IconCash className="size-4" /> Recaudado</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold tabular-nums">${recaudado.toLocaleString("es-CL")}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Por cobrar</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold tabular-nums">${porCobrar.toLocaleString("es-CL")}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Cobros registrados</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold tabular-nums">{cobros.length}</p></CardContent>
        </Card>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">{okMsg}</div>}

      <Tabs defaultValue="cobros">
        <TabsList>
          <TabsTrigger value="cobros">Libro de cobros</TabsTrigger>
          <TabsTrigger value="diferencias">Informes de diferencia</TabsTrigger>
        </TabsList>

        <TabsContent value="cobros" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-3">
            <Select value={filtroConcepto} onValueChange={setFiltroConcepto}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los conceptos</SelectItem>
                {(Object.keys(CONCEPTO_LABEL) as ConceptoCobroFI[]).map(k => (
                  <SelectItem key={k} value={k}>{CONCEPTO_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="pagado">Pagado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Unidad</th>
                    <th className="px-4 py-3">Descripción</th>
                    <th className="px-4 py-3">Concepto</th>
                    <th className="px-4 py-3">Fondo</th>
                    <th className="px-4 py-3">Vence</th>
                    <th className="px-4 py-3 text-right">Exigible</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(c => {
                    const estado = estadoDeCobro(c)
                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="px-4 py-2">{refUnidad(c.unidadId)}</td>
                        <td className="px-4 py-2 max-w-64 truncate">{c.descripcion}</td>
                        <td className="px-4 py-2 text-xs">{CONCEPTO_LABEL[c.concepto]}</td>
                        <td className="px-4 py-2 text-xs">{fondos.find(f => f.id === c.fondoId)?.nombre ?? c.fondoId}</td>
                        <td className="px-4 py-2 text-xs">{c.fechaVencimiento ?? "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums">${saldoPendiente(c).toLocaleString("es-CL")}</td>
                        <td className="px-4 py-2 text-center"><Badge className={`${ESTADO_COBRO_BADGE[estado]} text-[10px]`}>{estado}</Badge></td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setDetalle(c)}><IconFileText className="size-3.5" /></Button>
                            {estado !== "pagado" && (
                              <Button size="sm" variant="outline" onClick={() => abrirPago(c)}>Registrar pago</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filtrados.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Sin cobros para el filtro seleccionado.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diferencias" className="pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><IconLock className="size-4 text-primary" /> Ajustes manuales con informe inmutable</CardTitle>
              <CardDescription>Cada diferencia entre lo exigible y lo recibido queda registrada sin posibilidad de edición o borrado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {cobros.flatMap(c => c.diferencias.map(d => ({ d, c }))).length === 0 && (
                <p className="text-sm text-muted-foreground">Sin ajustes manuales registrados.</p>
              )}
              {cobros.flatMap(c => c.diferencias.map(d => ({ d, c }))).map(({ d, c }) => (
                <div key={d.id} className="rounded border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{refUnidad(c.unidadId)} · {c.descripcion}</span>
                    <Badge variant={d.tipo === "descuento" ? "secondary" : "outline"}>{d.tipo} ${d.diferencia.toLocaleString("es-CL")}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Esperado ${d.esperado.toLocaleString("es-CL")} · recibido ${d.recibido.toLocaleString("es-CL")} · {d.fecha}
                  </p>
                  <p className="text-xs italic">&ldquo;{d.justificacion}&rdquo;</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={detalle !== null} onOpenChange={open => !open && setDetalle(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del cobro</DialogTitle>
            <DialogDescription>{refUnidad(detalle?.unidadId)}</DialogDescription>
          </DialogHeader>
          {detalle && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-xs text-muted-foreground">Concepto</span><p>{CONCEPTO_LABEL[detalle.concepto]}</p></div>
                <div><span className="text-xs text-muted-foreground">Periodo</span><p>{detalle.periodo}</p></div>
                <div><span className="text-xs text-muted-foreground">Base</span><p>${detalle.montoBase.toLocaleString("es-CL")}</p></div>
                <div><span className="text-xs text-muted-foreground">Vence</span><p>{detalle.fechaVencimiento ?? "—"}</p></div>
              </div>
              <div>
                <span className="text-xs font-medium uppercase text-muted-foreground">Moras</span>
                {detalle.moras.length === 0 && <p className="text-muted-foreground">Sin moras.</p>}
                {detalle.moras.map(m => (
                  <p key={m.id}>{m.fecha}: ${m.monto.toLocaleString("es-CL")} ({m.diasAtraso} días al {m.tasaMensualPct}%)</p>
                ))}
              </div>
              <div>
                <span className="text-xs font-medium uppercase text-muted-foreground">Pagos</span>
                {detalle.pagos.length === 0 && <p className="text-muted-foreground">Sin pagos.</p>}
                {detalle.pagos.map(p => (
                  <p key={p.id}>{p.fecha}: ${p.monto.toLocaleString("es-CL")} vía {p.medio}</p>
                ))}
              </div>
              <div>
                <span className="text-xs font-medium uppercase text-muted-foreground">Diferencias</span>
                {detalle.diferencias.length === 0 && <p className="text-muted-foreground">Ninguna.</p>}
                {detalle.diferencias.map(d => (
                  <p key={d.id} className="text-xs">{d.fecha}: {d.tipo} ${d.diferencia.toLocaleString("es-CL")} — &ldquo;{d.justificacion}&rdquo;</p>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pagoObjetivo !== null} onOpenChange={open => !open && setPagoObjetivo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
            <DialogDescription>{refUnidad(pagoObjetivo?.unidadId)} · {pagoObjetivo?.descripcion}</DialogDescription>
          </DialogHeader>
          {pagoObjetivo && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/50 p-2 text-sm">
                Exigible hoy: <b>${saldoPendiente(pagoObjetivo).toLocaleString("es-CL")}</b> (base + moras − pagos previos).
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pago-monto">Monto recibido ($)</Label>
                  <Input id="pago-monto" value={formPago.monto} onChange={ev => setFormPago({ ...formPago, monto: ev.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pago-medio">Medio</Label>
                  <Input id="pago-medio" value={formPago.medio} onChange={ev => setFormPago({ ...formPago, medio: ev.target.value })} />
                </div>
              </div>
              {(() => {
                const monto = Number.parseFloat(formPago.monto.replace(/\./g, "").replace(",", ".")) || 0
                const difiere = monto !== saldoPendiente(pagoObjetivo)
                return (
                  <div className="space-y-1.5">
                    <Label htmlFor="pago-just">Justificación del ajuste {difiere && <span className="text-destructive">(obligatoria)</span>}</Label>
                    <Input id="pago-just" value={formPago.ajusteJustificacion} onChange={ev => setFormPago({ ...formPago, ajusteJustificacion: ev.target.value })} placeholder={monto < saldoPendiente(pagoObjetivo) ? "Descuento: motivo…" : "Recargo: motivo…"} />
                    {difiere && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        El monto difiere del exigible: se generará un informe de diferencia {monto < saldoPendiente(pagoObjetivo) ? "de descuento" : "de recargo"} inmutable.
                      </p>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagoObjetivo(null)}>Cancelar</Button>
            <Button onClick={confirmarPago}>Procesar pago</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
