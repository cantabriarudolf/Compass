    "use client"

    // SERIE-GATED-API-BD P3: liquidacionesPL migradas a API REST (BD fuente de
    // verdad). SERIE-FASE2 §V4: adelantosPL también dejó el store legacy — la
    // página ya no consulta ese store para adelantos.

    import * as React from "react"
    // Datos de dominio vía API REST (BD fuente de verdad); store legacy deprecado.
    import { useAdelantosPL } from "@/lib/api/use-adelantos-pl"
    import { useLiquidaciones } from "@/lib/api/use-liquidaciones"
    import { usePersonas } from "@/lib/api/use-personas"
    import { useConfiguracion } from "@/lib/api/use-configuracion"
    import { useMaestros as useMaestroAfps, useMaestros as useMaestroPrevisiones, useMaestros as useMaestroAsignaciones } from "@/lib/api/use-maestros"
    import type { Afp, AsignacionFamiliar, PrevisionSalud, Persona as PersonaFull } from "@/lib/schemas"
    import { aOracion } from "@/lib/normalizacion"
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
import type { LiquidacionPL, PactoAdelantoPL } from "@/lib/schemas"
import { calcularLiquidacion } from "@/lib/pl-utils"
// Doctrina de adelantos §V4 (módulo puro): el preview usa el mismo cálculo que el
// servidor — anticipo 100% sin tope 15%, préstamo al 15% con tope conjunto 45%.
import {
  adelantoImputableAlPeriodo,
  calcularDeduccionAdelantos,
  pactoDeAdelanto,
  saldoVivoAdelanto,
} from "@/app/api/liquidaciones/adelantos/_calculo"
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
  // Liquidaciones y adelantos vía API REST (BD fuente de verdad).
  const { liquidaciones, isLoading: cLiquidaciones, generar: generarApi, confirmar: confirmarApi, remove: removeApi } = useLiquidaciones()
  const { adelantos, isLoading: cAdelantos, crear: crearAdelantoApi, desestimar: desestimarAdelantoApi } = useAdelantosPL()
  const { personas: personasApi, isLoading: cPersonas } = usePersonas()
  // SAFETY: la API /api/personas serializa el schema completo (MP con ficha integral);
  // el hook tipa la variante resumida de los mocks. El cast adapta tipos sin cambiar valores.
  const personas = personasApi as unknown as PersonaFull[]
  const { data: afps, isLoading: cAfps } = useMaestroAfps<Afp>("afps")
  const { data: previsionesSalud, isLoading: cPrevisiones } = useMaestroPrevisiones<PrevisionSalud>("previsiones-salud")
  const { data: asignacionFamiliar, isLoading: cAsignaciones } = useMaestroAsignaciones<AsignacionFamiliar>("asignaciones-familiar")
  const { config: configuracion, isLoading: cConfig, updateConfig } = useConfiguracion()
  const isLoading = cPersonas || cAfps || cPrevisiones || cAsignaciones || cConfig || cLiquidaciones || cAdelantos

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
  // §V4 — naturaleza del adelanto y período de imputación.
  const [adelantoPacto, setAdelantoPacto] = React.useState<PactoAdelantoPL>("anticipo_regular")
  const [adelantoPeriodo, setAdelantoPeriodo] = React.useState(periodoActual())
  const [adelantoAcuerdoRef, setAdelantoAcuerdoRef] = React.useState("")

      // Parámetros legales CF (se re-sincronizan cuando llega la config del servidor)
      const [ufMensual, setUfMensual] = React.useState("")
      const [ingresoMinimo, setIngresoMinimo] = React.useState("")
      const [topeGrat, setTopeGrat] = React.useState("")
      const [tasaSIS, setTasaSIS] = React.useState("")

      React.useEffect(() => {
        if (configuracion) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- re-sincronización intencional al llegar la config del servidor (paridad con admin/configuracion)
          setUfMensual(v => v || (configuracion.ufMensual?.toString() ?? ""))
          setIngresoMinimo(v => v || (configuracion.ingresoMinimoMensual?.toString() ?? ""))
          setTopeGrat(v => v || (configuracion.topeGratificacionLegal?.toString() ?? ""))
          setTasaSIS(v => v || (configuracion.tasaSIS?.toString() ?? ""))
        }
      }, [configuracion])

  const trabajadores = personas.filter(p => p.datosLaborales && p.estadoCuenta === "activa")

  const nombrePersona = (id: string) => {
    const p = personas.find(x => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }
  const rutPersona = (id: string) => personas.find(x => x.id === id)?.rut ?? "—"

  const trabajadorSel = trabajadores.find(t => t.id === trabajadorId)
  const ficha = trabajadorSel?.datosLaborales

  const paramsLegalesCargados =
    !!configuracion &&
    configuracion.ufMensual !== undefined &&
    configuracion.ingresoMinimoMensual !== undefined &&
    configuracion.topeGratificacionLegal !== undefined &&
    configuracion.tasaSIS !== undefined

  const previewBase = trabajadorSel && ficha && (ficha.sueldoBase ?? 0) > 0 && paramsLegalesCargados
    ? calcularLiquidacion({
      sueldoBaseContrato: ficha.sueldoBase!,
      diasTrabajados: Number(diasTrabajados) || 0,
      diasMesComercial: configuracion?.diasMesComercial ?? 30,
      jornadaSemanal: ficha.jornadaBaseHoras ?? configuracion?.jornadaSemanalEstandar,
      horasExtrasHoras: (ficha.horasExtras ?? [])
        .filter(h => h.fecha.startsWith(`${periodo}-`))
        .reduce((acc, h) => acc + h.horas, 0),
      bonos: bonos.filter(b => b.glosa.trim().length > 0 && Number(b.monto) > 0).map((b, i) => ({ id: `prev-${i}`, glosa: b.glosa, monto: Number(b.monto) || 0, imponible: b.imponible })),
      asignacionMovilizacion: Number(movilizacion) || 0,
      asignacionColacion: Number(colacion) || 0,
      montoAsignacionFamiliar:
        (asignacionFamiliar.find(a => a.id === ficha.asignacionFamiliarId)?.monto ?? 0) *
        Math.max(0, ficha.cargas ?? 0),
      tasaAFP: afps.find(a => a.id === ficha.afpId)?.tasaCotizacion ?? 0,
      saludPlan: {
        tipo: previsionesSalud.find(s => s.id === ficha.saludId)?.tipo ?? "fonasa",
        porcentaje: saludPorcentaje ? Number(saludPorcentaje) : undefined,
        valorUF: saludValorUF ? Number(saludValorUF) : undefined,
        ufVigente: configuracion!.ufMensual!,
      },
      ufVigente: configuracion!.ufMensual!,
      ingresoMinimoMensual: configuracion!.ingresoMinimoMensual!,
      topeGratificacionLegal: configuracion!.topeGratificacionLegal!,
      tasaSIS: configuracion!.tasaSIS!,
      tasaSeguroCesantia: 0.6,
      esHonorarios: ficha.tipoContrato === "honorarios",
      montoAPV: Number(apv) || 0,
      // El cálculo base NO descuenta adelantos: la doctrina §V4 (tope 15% del
      // préstamo, 45% conjunto y arrastre del saldo) se aplica abajo sobre el
      // líquido disponible, en el mismo orden que usa el servidor.
      anticiposPendientes: [],
    })
    : null

  const previewPlan = previewBase && trabajadorSel
    ? calcularDeduccionAdelantos({
      remuneracionBruta: previewBase.totalHaberes,
      deduccionesLegales: previewBase.totalDescuentos,
      alcanceLiquido: previewBase.alcanceLiquido,
      adelantos: adelantos
        .filter(a => a.trabajadorPersonaId === trabajadorSel.id
          && adelantoImputableAlPeriodo(a, periodo)
          && saldoVivoAdelanto(a) > 0)
        .map(a => ({
          id: a.id,
          pacto: pactoDeAdelanto(a.pacto),
          saldo: saldoVivoAdelanto(a),
          periodoImputacion: a.periodoImputacion,
        })),
    })
    : null

  const preview = previewBase
    ? {
      ...previewBase,
      descuentoAnticipos: previewPlan?.descuentoTotal ?? 0,
      adelantosIds: previewPlan?.adelantosIds ?? [],
      liquidoAPagar: previewBase.alcanceLiquido - (previewPlan?.descuentoTotal ?? 0),
    }
    : null

  if (isLoading) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
  }

  const generar = async () => {
    setError(null); setOkMsg(null)
    const r = await generarApi({
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

  const confirmar = async (id: string) => {
    setError(null); setOkMsg(null)
    const r = await confirmarApi(id)
    if (!r.ok) setError(r.error ?? "Error al confirmar")
    else setOkMsg("Liquidación confirmada: egreso de sueldos sincronizado en Finanzas.")
  }

  const eliminar = async (id: string) => {
    setError(null); setOkMsg(null)
    const r = await removeApi(id)
    if (!r.ok) setError(r.error ?? "Error al eliminar")
  }

  const descargarPdf = async (liq: LiquidacionPL) => {
    setError(null); setOkMsg(null)
    if (!configuracion) { setError("La configuración aún no está cargada."); return }
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

  const guardarParametrosLegales = async () => {
    setError(null); setOkMsg(null)
    if (!configuracion) { setError("La configuración aún no está cargada."); return }
    const cfg = {
      ...configuracion,
      ...(ufMensual ? { ufMensual: Number(ufMensual) } : {}),
      ...(ingresoMinimo ? { ingresoMinimoMensual: Number(ingresoMinimo) } : {}),
      ...(topeGrat ? { topeGratificacionLegal: Number(topeGrat) } : {}),
      ...(tasaSIS !== "" ? { tasaSIS: Number(tasaSIS) } : {}),
    }
    // SAFETY: `cfg` es la configuración vigente con los parámetros legales
    // sobrescritos por los valores del formulario; el cast solo fija la firma
    // que espera `updateConfig` (no cambia el objeto en runtime).
    const r = await updateConfig(cfg as unknown as Parameters<typeof updateConfig>[0])
    if (!r.ok) setError(r.error ?? "Error al guardar parámetros")
    else setOkMsg("Parámetros legales guardados y auditados (CF_UPDATE_PARAM).")
  }

  const registrarAdelanto = async () => {
    setError(null); setOkMsg(null)
    // El servidor decide folio ADE, saldo y estado; acá solo van los datos de negocio.
    const r = await crearAdelantoApi({
      trabajadorPersonaId: adelantoTrabajadorId,
      monto: Number(adelantoMonto) || 0,
      glosa: aOracion(adelantoGlosa),
      pacto: adelantoPacto,
      periodoImputacion: adelantoPeriodo,
      ...(adelantoPacto === "prestamo" && adelantoAcuerdoRef.trim()
        ? { acuerdoEscritoRef: adelantoAcuerdoRef.trim() }
        : {}),
    })
    if (!r.ok) setError(r.error ?? "Error al registrar adelanto")
    else {
      setOkMsg(
        adelantoPacto === "prestamo"
          ? "Préstamo registrado con comprobante ADE: se descontará hasta el 15% de la remuneración bruta del período."
          : "Anticipo registrado con comprobante ADE: se descontará completo en la liquidación del período."
      )
      setAdelantoMonto(""); setAdelantoGlosa(""); setAdelantoAcuerdoRef("")
    }
  }

  const desestimarAdelanto = async (id: string) => {
    setError(null); setOkMsg(null)
    const r = await desestimarAdelantoApi(id)
    if (!r.ok) setError(r.error ?? "Error al desestimar el adelanto")
    else setOkMsg("Adelanto desestimado: se anuló el saldo vivo sin borrar el registro.")
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
                    Sueldo base {CLP(ficha.sueldoBase ?? 0)} · Jornada {ficha.jornadaBaseHoras ?? configuracion?.jornadaSemanalEstandar} h · AFP {afps.find(a => a.id === ficha.afpId)?.nombre ?? "—"} · {(ficha.horasExtras ?? []).filter(h => h.fecha.startsWith(`${periodo}-`)).reduce((acc, h) => acc + h.horas, 0)} h extra en el periodo
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
              {ficha && previsionesSalud.find(s => s.id === ficha.saludId)?.tipo === "isapre" && (
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
                        <Input placeholder="Glosa (ej. Aguinaldo Fiestas Patrias)" value={b.glosa} onChange={e => setBonos(bonos.map((x, j) => j === i ? { ...x, glosa: e.target.value } : x))} onBlur={() => setBonos(bonos.map((x, j) => j === i ? { ...x, glosa: aOracion(x.glosa) } : x))} />
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
                    {previewPlan && previewPlan.descuentoPrestamo > 0 && (
                      <span>Préstamos a descontar (tope 15%): <b>{CLP(previewPlan.descuentoPrestamo)}</b></span>
                    )}
                    {previewPlan && previewPlan.arrastreTotal > 0 && (
                      <span className="text-amber-700 dark:text-amber-400">
                        Alerta: arrastra <b>{CLP(previewPlan.arrastreTotal)}</b> al período siguiente (el líquido no alcanza).
                      </span>
                    )}
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
                                  <Button size="sm" variant="outline" onClick={() => { void confirmar(l.id) }}>Confirmar</Button>
                                  <Button size="sm" variant="ghost" onClick={() => { void eliminar(l.id) }}><IconTrash className="size-4" /></Button>
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
              <CardTitle className="text-base">Registrar adelanto</CardTitle>
              <CardDescription>
                Dos naturalezas: <b>anticipo regular</b> (pago de lo devengado, se descuenta 100% en la
                liquidación del período, sin tope 15%) y <b>préstamo</b> (exige acuerdo escrito y topa 15%
                de la remuneración bruta, con tope conjunto 45% — art. 58).
              </CardDescription>
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
                <Label>Naturaleza *</Label>
                <Select value={adelantoPacto} onValueChange={v => setAdelantoPacto(v as PactoAdelantoPL)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anticipo_regular">Anticipo regular (sin tope)</SelectItem>
                    <SelectItem value="prestamo">Préstamo / deuda (tope 15%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Período de imputación *</Label>
                <Input type="month" value={adelantoPeriodo} onChange={e => setAdelantoPeriodo(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Monto ($) *</Label>
                <Input type="number" min={1} value={adelantoMonto} onChange={e => setAdelantoMonto(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Glosa explicativa *</Label>
                <Input value={adelantoGlosa} placeholder="Motivo del adelanto" onChange={e => setAdelantoGlosa(e.target.value)} onBlur={() => setAdelantoGlosa(aOracion(adelantoGlosa))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Acuerdo escrito {adelantoPacto === "prestamo" ? "*" : "(no aplica al anticipo)"}</Label>
                <Input
                  value={adelantoAcuerdoRef}
                  disabled={adelantoPacto !== "prestamo"}
                  placeholder="Ej.: acuerdo de mutuo 2026-04 firmado"
                  onChange={e => setAdelantoAcuerdoRef(e.target.value)}
                />
              </div>
              <div className="md:col-span-3">
                <Button
                  onClick={registrarAdelanto}
                  disabled={
                    !adelantoTrabajadorId ||
                    !adelantoPeriodo ||
                    (adelantoPacto === "prestamo" && adelantoAcuerdoRef.trim().length < 3)
                  }
                >
                  <IconPlus className="size-4 mr-1" /> Registrar y emitir comprobante
                </Button>
              </div>
              <p className="text-xs text-muted-foreground md:col-span-3">
                Prohibido descontar arriendo, luz, agua, herramientas, medicinas, multas no autorizadas en el
                reglamento interno ni mermas sin responsabilidad acreditada.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Control de estado</CardTitle>
              <CardDescription>
                Ciclo Pendiente → Descontado parcial → Saldado (o Desestimado, que anula el saldo sin borrar el registro).
              </CardDescription>
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
                        <th className="px-3 py-2">Naturaleza</th>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Imputación</th>
                        <th className="px-3 py-2">Glosa</th>
                        <th className="px-3 py-2 text-right">Monto</th>
                        <th className="px-3 py-2 text-right">Saldo</th>
                        <th className="px-3 py-2">Estado</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {adelantos.map(a => (
                        <tr key={a.id} className="border-t">
                          <td className="px-3 py-2 font-mono text-xs">{a.folio}</td>
                          <td className="px-3 py-2">{nombrePersona(a.trabajadorPersonaId)}</td>
                          <td className="px-3 py-2 text-xs">
                            {pactoDeAdelanto(a.pacto) === "prestamo"
                              ? <Badge variant="secondary">Préstamo</Badge>
                              : <Badge variant="outline">Anticipo</Badge>}
                          </td>
                          <td className="px-3 py-2">{a.fecha}</td>
                          <td className="px-3 py-2">{a.periodoImputacion || "siguiente"}</td>
                          <td className="px-3 py-2 max-w-64 truncate">{a.glosa}</td>
                          <td className="px-3 py-2 text-right">{CLP(a.monto)}</td>
                          <td className="px-3 py-2 text-right">{CLP(saldoVivoAdelanto(a))}</td>
                          <td className="px-3 py-2">
                            {a.estado === "saldado" || a.estado === "descontado"
                              ? <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">Saldado</Badge>
                              : a.estado === "descontado_parcial"
                                ? <Badge className="bg-amber-600 hover:bg-amber-700 text-white">Descontado parcial</Badge>
                                : a.estado === "desestimado"
                                  ? <Badge variant="secondary">Desestimado</Badge>
                                  : <Badge variant="outline">Pendiente</Badge>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {(a.estado === "pendiente" || a.estado === "descontado_parcial") && (
                              <Button size="sm" variant="ghost" onClick={() => desestimarAdelanto(a.id)}>
                                <IconTrash className="size-4" />
                              </Button>
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
