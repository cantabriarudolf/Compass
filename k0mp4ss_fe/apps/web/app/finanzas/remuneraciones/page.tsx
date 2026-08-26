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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  IconCash,
  IconPlus,
  IconTrash,
  IconFileText,
  IconReceipt2,
  IconCheck,
} from "@tabler/icons-react"
import type { AdelantoPL, LiquidacionPL } from "@/lib/schemas"
import { calcularLiquidacion } from "@/lib/pl-utils"
import { documentoLiquidacionPDF } from "@/lib/pdf-utils"

interface BonoForm {
  glosa: string
  monto: string
  imponible: boolean
}

function periodoActual(): string {
  return new Date().toISOString().slice(0, 7)
}

const CLP = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`

export default function RemuneracionesPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const liquidaciones = useCompassStore(s => s.liquidacionesPL)
  const adelantos = useCompassStore(s => s.adelantosPL)
  const personas = useCompassStore(s => s.personas)
  const maestros = useCompassStore(s => s.maestros)
  const configuracion = useCompassStore(s => s.configuracion)
  const generarLiquidacionPL = useCompassStore(s => s.generarLiquidacionPL)
  const confirmarLiquidacionPL = useCompassStore(s => s.confirmarLiquidacionPL)
  const removeLiquidacionPL = useCompassStore(s => s.removeLiquidacionPL)
  const saveAdelantoPL = useCompassStore(s => s.saveAdelantoPL)
  const removeAdelantoPL = useCompassStore(s => s.removeAdelantoPL)

  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)

  // Formulario de liquidación
  const [trabajadorId, setTrabajadorId] = React.useState<string>("")
  const [periodo, setPeriodo] = React.useState(periodoActual())
  const [diasTrabajados, setDiasTrabajados] = React.useState("30")
  const [movilizacion, setMovilizacion] = React.useState("0")
  const [colacion, setColacion] = React.useState("0")
  const [apv, setApv] = React.useState("0")
  const [saludPorcentaje, setSaludPorcentaje] = React.useState("")
  const [saludValorUF, setSaludValorUF] = React.useState("")
  const [bonos, setBonos] = React.useState<BonoForm[]>([])
  const [pdfBusy, setPdfBusy] = React.useState<string | null>(null)

  // Formulario de adelanto
  const [adelantoTrabajadorId, setAdelantoTrabajadorId] = React.useState("")
  const [adelantoMonto, setAdelantoMonto] = React.useState("")
  const [adelantoGlosa, setAdelantoGlosa] = React.useState("")

  // Parámetros legales CF
  const [ufMensual, setUfMensual] = React.useState(configuracion.ufMensual?.toString() ?? "")
  const [ingresoMinimo, setIngresoMinimo] = React.useState(configuracion.ingresoMinimoMensual?.toString() ?? "")
  const [topeGrat, setTopeGrat] = React.useState(configuracion.topeGratificacionLegal?.toString() ?? "")
  const [tasaSIS, setTasaSIS] = React.useState(configuracion.tasaSIS?.toString() ?? "")

  const trabajadores = personas.filter(p => p.datosLaborales && p.estadoCuenta === "activa")

  const nombrePersona = (id: string) => {
    const p = personas.find(x => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }
  const rutPersona = (id: string) => personas.find(x => x.id === id)?.rut ?? "—"

  const trabajadorSel = trabajadores.find(t => t.id === trabajadorId)
  const ficha = trabajadorSel?.datosLaborales

  const paramsLegalesCargados =
    configuracion.ufMensual !== undefined &&
    configuracion.ingresoMinimoMensual !== undefined &&
    configuracion.topeGratificacionLegal !== undefined &&
    configuracion.tasaSIS !== undefined

  const preview = trabajadorSel && ficha && (ficha.sueldoBase ?? 0) > 0 && paramsLegalesCargados
    ? calcularLiquidacion({
      sueldoBaseContrato: ficha.sueldoBase!,
      diasTrabajados: Number(diasTrabajados) || 0,
      diasMesComercial: configuracion.diasMesComercial ?? 30,
      jornadaSemanal: ficha.jornadaBaseHoras ?? configuracion.jornadaSemanalEstandar,
      horasExtrasHoras: (ficha.horasExtras ?? [])
        .filter(h => h.fecha.startsWith(`${periodo}-`))
        .reduce((acc, h) => acc + h.horas, 0),
      bonos: bonos.filter(b => b.glosa.trim().length > 0 && Number(b.monto) > 0).map((b, i) => ({ id: `prev-${i}`, glosa: b.glosa, monto: Number(b.monto) || 0, imponible: b.imponible })),
      asignacionMovilizacion: Number(movilizacion) || 0,
      asignacionColacion: Number(colacion) || 0,
      montoAsignacionFamiliar:
        (maestros.asignacionFamiliar.find(a => a.id === ficha.asignacionFamiliarId)?.monto ?? 0) *
        Math.max(0, ficha.cargas ?? 0),
      tasaAFP: maestros.afps.find(a => a.id === ficha.afpId)?.tasaCotizacion ?? 0,
      saludPlan: {
        tipo: maestros.previsionesSalud.find(s => s.id === ficha.saludId)?.tipo ?? "fonasa",
        porcentaje: saludPorcentaje ? Number(saludPorcentaje) : undefined,
        valorUF: saludValorUF ? Number(saludValorUF) : undefined,
        ufVigente: configuracion.ufMensual!,
      },
      ufVigente: configuracion.ufMensual!,
      ingresoMinimoMensual: configuracion.ingresoMinimoMensual!,
      topeGratificacionLegal: configuracion.topeGratificacionLegal!,
      tasaSIS: configuracion.tasaSIS!,
      tasaSeguroCesantia: 0.6,
      esHonorarios: ficha.tipoContrato === "honorarios",
      montoAPV: Number(apv) || 0,
      anticiposPendientes: adelantos
        .filter(a => a.trabajadorPersonaId === trabajadorSel.id && a.estado === "pendiente")
        .map(a => ({ id: a.id, monto: a.monto })),
    })
  : null

  if (!hasHydrated) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
  }

  const generar = () => {
    setError(null); setOkMsg(null)
    const r = generarLiquidacionPL({
      trabajadorPersonaId: trabajadorId,
      periodo,
      diasTrabajados: Number(diasTrabajados) || 0,
      asignacionMovilizacion: Number(movilizacion) || 0,
      asignacionColacion: Number(colacion) || 0,
      montoAPV: Number(apv) || 0,
      ...(saludPorcentaje ? { saludPorcentaje: Number(saludPorcentaje) } : {}),
      ...(saludValorUF ? { saludValorUF: Number(saludValorUF) } : {}),
      bonos: bonos
        .filter(b => b.glosa.trim().length > 0 && Number(b.monto) > 0)
        .map(b => ({ glosa: b.glosa, monto: Number(b.monto), imponible: b.imponible })),
    })
    if (!r.ok) setError(r.error ?? "Error al generar")
    else {
      setOkMsg("Liquidación generada en borrador. Revísala y confírmala para sincronizar el egreso en Finanzas.")
      setBonos([])
    }
  }

  const confirmar = (id: string) => {
    setError(null); setOkMsg(null)
    const r = confirmarLiquidacionPL(id)
    if (!r.ok) setError(r.error ?? "Error al confirmar")
    else setOkMsg("Liquidación confirmada: egreso de sueldos sincronizado en Finanzas.")
  }

  const descargarPdf = async (liq: LiquidacionPL) => {
    setError(null); setOkMsg(null)
    setPdfBusy(liq.id)
    try {
      const doc = await documentoLiquidacionPDF(liq, nombrePersona(liq.trabajadorPersonaId), rutPersona(liq.trabajadorPersonaId), configuracion)
      const { descargarPdf: descargar } = await import("@/lib/pdf-utils")
      await descargar(doc, `liquidacion-${liq.folio}-${liq.periodo}.pdf`)
      setOkMsg(`PDF ${liq.folio} generado con firma embebida.`)
    } catch (e) {
      setError(`No se pudo generar el PDF: ${String(e)}`)
    } finally {
      setPdfBusy(null)
    }
  }

  const guardarParametrosLegales = () => {
    setError(null); setOkMsg(null)
    const cfg = {
      ...configuracion,
      ...(ufMensual ? { ufMensual: Number(ufMensual) } : {}),
      ...(ingresoMinimo ? { ingresoMinimoMensual: Number(ingresoMinimo) } : {}),
      ...(topeGrat ? { topeGratificacionLegal: Number(topeGrat) } : {}),
      ...(tasaSIS !== "" ? { tasaSIS: Number(tasaSIS) } : {}),
    }
    const r = useCompassStore.getState().saveConfiguracion(cfg)
    if (!r.ok) setError(r.error ?? "Error al guardar parámetros")
    else setOkMsg("Parámetros legales guardados y auditados (CF_UPDATE_PARAM).")
  }

  const registrarAdelanto = () => {
    setError(null); setOkMsg(null)
    const nuevo: AdelantoPL = {
      id: `pl-ade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      folio: "",
      trabajadorPersonaId: adelantoTrabajadorId,
      fecha: new Date().toISOString().slice(0, 10),
      monto: Number(adelantoMonto) || 0,
      glosa: adelantoGlosa,
      estado: "pendiente",
    }
    const r = saveAdelantoPL(nuevo)
    if (!r.ok) setError(r.error ?? "Error al registrar adelanto")
    else {
      setOkMsg("Adelanto registrado con comprobante ADE.")
      setAdelantoMonto(""); setAdelantoGlosa("")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><IconCash className="size-7 text-primary" /> Remuneraciones</h1>
        <p className="text-muted-foreground">Liquidaciones de sueldo, adelantos y parámetros legales del personal.</p>
      </div>

      {!paramsLegalesCargados && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          CF no cargado: faltan parámetros legales de remuneraciones. Configúralos en la pestaña <b>Parámetros Legales</b> antes de generar liquidaciones.
        </div>
      )}
      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">{okMsg}</div>}

      <Tabs defaultValue="liquidaciones">
        <TabsList>
          <TabsTrigger value="liquidaciones">Liquidaciones</TabsTrigger>
          <TabsTrigger value="adelantos">Adelantos</TabsTrigger>
          <TabsTrigger value="parametros">Parámetros Legales</TabsTrigger>
        </TabsList>

        <TabsContent value="liquidaciones" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generar liquidación</CardTitle>
              <CardDescription>El cálculo cruza la ficha PE (sueldo base, jornada, horas extras del periodo) con los maestros legales MA y los parámetros CF.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>Trabajador con ficha PE *</Label>
                <Select value={trabajadorId} onValueChange={setTrabajadorId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona trabajador" /></SelectTrigger>
                  <SelectContent>
                    {trabajadores.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nombres} {t.apellidos} — {t.datosLaborales!.cargo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {ficha && (
                  <p className="text-xs text-muted-foreground">
                    Sueldo base {CLP(ficha.sueldoBase ?? 0)} · Jornada {ficha.jornadaBaseHoras ?? configuracion.jornadaSemanalEstandar} h · AFP {maestros.afps.find(a => a.id === ficha.afpId)?.nombre ?? "—"} · {(ficha.horasExtras ?? []).filter(h => h.fecha.startsWith(`${periodo}-`)).reduce((acc, h) => acc + h.horas, 0)} h extra en el periodo
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Periodo *</Label>
                <Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Días trabajados *</Label>
                <Input type="number" min={0} max={31} value={diasTrabajados} onChange={e => setDiasTrabajados(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Movilización ($)</Label>
                <Input type="number" min={0} value={movilizacion} onChange={e => setMovilizacion(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Colación ($)</Label>
                <Input type="number" min={0} value={colacion} onChange={e => setColacion(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>APV / Ahorro voluntario ($)</Label>
                <Input type="number" min={0} value={apv} onChange={e => setApv(e.target.value)} />
              </div>
              {ficha && maestros.previsionesSalud.find(s => s.id === ficha.saludId)?.tipo === "isapre" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>Isapre: % sobre imponible</Label>
                    <Input type="number" min={0} placeholder="(opcional)" value={saludPorcentaje} onChange={e => setSaludPorcentaje(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Isapre: valor UF</Label>
                    <Input type="number" min={0} placeholder="(opcional)" value={saludValorUF} onChange={e => setSaludValorUF(e.target.value)} />
                  </div>
                </>
              )}
              <div className="md:col-span-3">
                <div className="mb-2 flex items-center justify-between">
                  <Label>Bonos y aguinaldos</Label>
                  <Button variant="outline" size="sm" onClick={() => setBonos([...bonos, { glosa: "", monto: "", imponible: true }])}>
                    <IconPlus className="size-4 mr-1" /> Agregar bono
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  {bonos.map((b, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <div className="min-w-48 grow">
                        <Input placeholder="Glosa (ej. Aguinaldo Fiestas Patrias)" value={b.glosa} onChange={e => setBonos(bonos.map((x, j) => j === i ? { ...x, glosa: e.target.value } : x))} />
                      </div>
                      <div className="w-36">
                        <Input type="number" min={0} placeholder="Monto" value={b.monto} onChange={e => setBonos(bonos.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))} />
                      </div>
                      <label className="flex items-center gap-1.5 pb-2 text-sm">
                        <input type="checkbox" checked={b.imponible} onChange={e => setBonos(bonos.map((x, j) => j === i ? { ...x, imponible: e.target.checked } : x))} /> Imponible
                      </label>
                      <Button variant="ghost" size="icon" onClick={() => setBonos(bonos.filter((_, j) => j !== i))}><IconTrash className="size-4" /></Button>
                    </div>
                  ))}
                </div>
              </div>

              {preview && (
                <div className="rounded-lg border bg-muted/30 p-3 md:col-span-3">
                  <p className="mb-2 text-sm font-semibold">Vista previa del cálculo</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-4">
                    <span>Sueldo base proporcional: <b>{CLP(preview.sueldoBaseProporcional)}</b></span>
                    <span>Horas extras: <b>{CLP(preview.montoHorasExtras)}</b> (valor hora {CLP(preview.valorHoraOrdinaria)})</span>
                    <span>Gratificación legal: <b>{CLP(preview.gratificacionLegal)}</b></span>
                    <span>Total imponible: <b>{CLP(preview.totalImponible)}</b></span>
                    <span>Total haberes: <b>{CLP(preview.totalHaberes)}</b></span>
                    <span>AFP: <b>{CLP(preview.montoAFP)}</b></span>
                    <span>Salud: <b>{CLP(preview.montoSalud)}</b></span>
                    <span>SIS + cesantía: <b>{CLP(preview.montoSIS + preview.montoSeguroCesantia)}</b></span>
                    <span>Total descuentos legales: <b>{CLP(preview.totalDescuentos)}</b></span>
                    <span>Anticipos a descontar: <b>{CLP(preview.descuentoAnticipos)}</b></span>
                    <span>Alcance líquido: <b>{CLP(preview.alcanceLiquido)}</b></span>
                    <span>Líquido a pagar: <b className="text-emerald-700 dark:text-emerald-400">{CLP(preview.liquidoAPagar)}</b></span>
                  </div>
                </div>
              )}

              <div className="md:col-span-3">
                <Button onClick={generar} disabled={!trabajadorId}>
                  <IconFileText className="size-4 mr-1" /> Generar liquidación (borrador)
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historial de folios</CardTitle>
              <CardDescription>Folio LIQ correlativo por documento; solo borradores sin egreso son eliminables.</CardDescription>
            </CardHeader>
            <CardContent>
              {liquidaciones.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin liquidaciones generadas aún.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Folio</th>
                        <th className="px-3 py-2">Trabajador</th>
                        <th className="px-3 py-2">Periodo</th>
                        <th className="px-3 py-2 text-right">Imponible</th>
                        <th className="px-3 py-2 text-right">Descuentos</th>
                        <th className="px-3 py-2 text-right">Anticipos</th>
                        <th className="px-3 py-2 text-right">Líquido</th>
                        <th className="px-3 py-2">Estado</th>
                        <th className="px-3 py-2 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...liquidaciones].sort((a, b) => b.folio.localeCompare(a.folio)).map(l => (
                        <tr key={l.id} className="border-t">
                          <td className="px-3 py-2 font-mono text-xs">{l.folio}</td>
                          <td className="px-3 py-2">{nombrePersona(l.trabajadorPersonaId)}</td>
                          <td className="px-3 py-2">{l.periodo}</td>
                          <td className="px-3 py-2 text-right">{CLP(l.totalImponible)}</td>
                          <td className="px-3 py-2 text-right">{CLP(l.totalDescuentos)}</td>
                          <td className="px-3 py-2 text-right">{l.descuentoAnticipos > 0 ? CLP(l.descuentoAnticipos) : "—"}</td>
                          <td className="px-3 py-2 text-right font-semibold">{CLP(l.liquidoAPagar)}</td>
                          <td className="px-3 py-2">
                            {l.estado === "confirmada"
                              ? <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white"><IconCheck className="size-3 mr-1" />Confirmada</Badge>
                              : <Badge variant="outline">Borrador</Badge>}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              {l.estado === "borrador" && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => confirmar(l.id)}>Confirmar</Button>
                                  <Button size="sm" variant="ghost" onClick={() => { removeLiquidacionPL(l.id) }}><IconTrash className="size-4" /></Button>
                                </>
                              )}
                              {l.estado === "confirmada" && l.proyeccionPEReferencia && (
                                <Badge variant="secondary" className="text-[10px]">Proy. PE vinculada</Badge>
                              )}
                              <Button size="sm" variant="outline" disabled={pdfBusy === l.id} onClick={() => descargarPdf(l)}>
                                <IconReceipt2 className="size-4 mr-1" /> PDF
                              </Button>
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

        <TabsContent value="adelantos" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registrar anticipo</CardTitle>
              <CardDescription>Glosa explicativa obligatoria; emite comprobante ADE notificado al trabajador.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>Trabajador *</Label>
                <Select value={adelantoTrabajadorId} onValueChange={setAdelantoTrabajadorId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona trabajador" /></SelectTrigger>
                  <SelectContent>
                    {trabajadores.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.nombres} {t.apellidos}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Monto ($) *</Label>
                <Input type="number" min={1} value={adelantoMonto} onChange={e => setAdelantoMonto(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5 md:col-span-1">
                <Label>Glosa explicativa *</Label>
                <Input value={adelantoGlosa} placeholder="Motivo del adelanto" onChange={e => setAdelantoGlosa(e.target.value)} />
              </div>
              <div>
                <Button onClick={registrarAdelanto} disabled={!adelantoTrabajadorId}>
                  <IconPlus className="size-4 mr-1" /> Registrar y emitir comprobante
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Control de estado</CardTitle>
              <CardDescription>Ciclo Pendiente → Descontado en liquidación.</CardDescription>
            </CardHeader>
            <CardContent>
              {adelantos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin adelantos registrados.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Folio</th>
                        <th className="px-3 py-2">Trabajador</th>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Glosa</th>
                        <th className="px-3 py-2 text-right">Monto</th>
                        <th className="px-3 py-2">Estado</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {adelantos.map(a => (
                        <tr key={a.id} className="border-t">
                          <td className="px-3 py-2 font-mono text-xs">{a.folio}</td>
                          <td className="px-3 py-2">{nombrePersona(a.trabajadorPersonaId)}</td>
                          <td className="px-3 py-2">{a.fecha}</td>
                          <td className="px-3 py-2 max-w-64 truncate">{a.glosa}</td>
                          <td className="px-3 py-2 text-right">{CLP(a.monto)}</td>
                          <td className="px-3 py-2">
                            {a.estado === "descontado"
                              ? <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">Descontado</Badge>
                              : <Badge variant="outline">Pendiente</Badge>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {a.estado === "pendiente" && (
                              <Button size="sm" variant="ghost" onClick={() => removeAdelantoPL(a.id)}><IconTrash className="size-4" /></Button>
                            )}
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

        <TabsContent value="parametros">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Parámetros Legales Chile para Remuneraciones</CardTitle>
              <CardDescription>Editables solo por administración; cada cambio queda auditado como CF_UPDATE_PARAM.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Valor UF mensual ($) *</Label>
                <Input type="number" step="0.01" min={0.01} value={ufMensual} onChange={e => setUfMensual(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Ingreso mínimo mensual ($) *</Label>
                <Input type="number" min={1} value={ingresoMinimo} onChange={e => setIngresoMinimo(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Tope gratificación legal (factor IMM) *</Label>
                <Input type="number" step="0.01" min={0.01} value={topeGrat} onChange={e => setTopeGrat(e.target.value)} />
                <p className="text-xs text-muted-foreground">Estándar legal: 4.75 (tope anual aplicado mensualmente ÷ 12).</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Tasa SIS (%) *</Label>
                <Input type="number" step="0.01" min={0} max={100} value={tasaSIS} onChange={e => setTasaSIS(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Button onClick={guardarParametrosLegales}>Guardar cambios</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
