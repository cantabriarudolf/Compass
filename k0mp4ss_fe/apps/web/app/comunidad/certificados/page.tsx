"use client"

import * as React from "react"
import { esMiembroDirectivaVigente } from "@/lib/store"
import { useCertificadosCT } from "@/lib/api/use-certificados-ct"
import { useCobrosFI } from "@/lib/api/use-cobros-fi"
import { useLiquidaciones } from "@/lib/api/use-liquidaciones"
import { usePersonas } from "@/lib/api/use-personas"
import { useUnidades } from "@/lib/api/use-unidades"
import { useVinculos } from "@/lib/api/use-vinculos"
import { useConfiguracion } from "@/lib/api/use-configuracion"
import { usePeriodosDirectiva } from "@/lib/api/use-periodos-directiva"
import { generarId } from "@/lib/id-utils"
import { hoyISO } from "@/lib/date-utils"
import { exigibleTotal, saldoPendiente } from "@/lib/finanzas-utils"
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
import { IconCertificate, IconFileText, IconTrash } from "@tabler/icons-react"
import type { CertificadoCT, ConfiguracionGlobal } from "@/lib/schemas"
import { CertificadoCTSchema } from "@/lib/schemas"
import { documentoCertificadoPDF } from "@/lib/pdf-utils"

const TIPO_LABEL: Record<CertificadoCT["tipo"], string> = {
  residencia: "Certificado de Residencia",
  estado_cuenta: "Estado de Cuenta / Fondos",
  liquidacion_sueldo: "Certificado Liquidación de Sueldo",
  al_dia: "Certificado Al Día (Informativo)",
}

export default function CertificadosPage() {
  const { items: certificados, isLoading: cCertificados, create: crearCertificadoApi, remove: removeCertificadoApi } = useCertificadosCT()
  const { personas, isLoading: cPersonas } = usePersonas()
  const { items: unidades, isLoading: cUnidades } = useUnidades()
  const { vinculos, isLoading: cVinculos } = useVinculos()
  const { config, isLoading: cConfig } = useConfiguracion()
  const { vigente: periodoVigente, isLoading: cPeriodosDirectiva } = usePeriodosDirectiva()
  const { liquidaciones: liquidacionesPL, isLoading: cLiquidaciones } = useLiquidaciones()
  const { items: cobrosFI, isLoading: cCobrosFI } = useCobrosFI()
  const configuracion = config

  const [tipo, setTipo] = React.useState<CertificadoCT["tipo"]>("residencia")
  const [personaId, setPersonaId] = React.useState("")
  const [unidadId, setUnidadId] = React.useState("")
  const [liquidacionId, setLiquidacionId] = React.useState("")
  const [solicitanteNombre, setSolicitanteNombre] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = React.useState<string | null>(null)

  const cargando = cCertificados || cPersonas || cUnidades || cVinculos || cConfig || cPeriodosDirectiva || cLiquidaciones || cCobrosFI
  if (cargando) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
  }

  const nombrePersona = (id?: string) => {
    if (!id) return "—"
    const p = personas.find(x => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }
  const refUnidadUI = (id?: string) => {
    if (!id) return "—"
    const u = unidades.find(x => x.id === id)
    return u ? `${u.etiqueta} ${u.numero}` : id
  }
  const saldoUnidad = (id: string): number =>
    cobrosFI.filter(c => c.unidadId === id).reduce((acc, c) => acc + saldoPendiente(c), 0)

  // Destinos válidos según tipología.
  const personasConVinculoActivo = personas.filter(p =>
    vinculos.some(v => v.personaId === p.id && !v.fechaFin && (!unidadId || v.unidadId === unidadId))
  )
  const liquidacionesConfirmadas = liquidacionesPL.filter(l => l.estado === "confirmada")
  const gateAlDia = tipo === "al_dia" && unidadId ? saldoUnidad(unidadId) : null

  /**
   * Construye el registro CertificadoCT con la misma lógica de negocio que la
   * acción legacy `generarCertificadoCT` del store (folio correlativo, resumen,
   * detalle por tipología, snapshot de directiva vigente) usando los datos de
   * las colecciones SWR; luego persiste vía POST /api/certificados-ct.
   */
  const construirRegistro = (tipoActual: CertificadoCT["tipo"]): CertificadoCT => {
    let unidadIdDestino = tipoActual !== "liquidacion_sueldo" && unidadId ? unidadId : undefined
    let personaIdDestino = tipoActual === "residencia" && personaId ? personaId : undefined
    let origenRef = unidadIdDestino ?? personaIdDestino ?? (tipoActual === "liquidacion_sueldo" ? liquidacionId : undefined)
    let resumen = ""
    let detalle: [string, string][] = []

    if (tipoActual === "residencia") {
      const persona = personas.find(p => p.id === personaId)
      const vinculoVigente = vinculos.find(v => v.personaId === personaId && v.unidadId === unidadId && !v.fechaFin)
      if (!persona || !unidadId) throw new Error("El certificado de residencia exige persona y unidad.")
      if (!vinculoVigente) throw new Error("No se puede emitir: el solicitante no mantiene un vínculo activo en la unidad (VU).")
      origenRef = vinculoVigente.id
      resumen = `Se certifica que ${persona.nombres} ${persona.apellidos} (RUT ${persona.rut}) reside actualmente en ${refUnidadUI(unidadId)} según los registros de vinculación vigentes.`
      detalle = [
        ["Residente", `${persona.nombres} ${persona.apellidos}`],
        ["RUT", persona.rut],
        ["Unidad", refUnidadUI(unidadId)],
        ["Rol", vinculoVigente.rol],
      ]
    } else if (tipoActual === "estado_cuenta" || tipoActual === "al_dia") {
      if (!unidadId) throw new Error(`El certificado de ${tipoActual === "al_dia" ? "unidad al día" : "estado de cuenta"} exige una unidad.`)
      const cobros = cobrosFI.filter(c => c.unidadId === unidadId)
      const totalCargado = cobros.reduce((acc, c) => acc + exigibleTotal(c), 0)
      const saldoPendienteTotal = cobros.reduce((acc, c) => acc + saldoPendiente(c), 0)
      if (tipoActual === "al_dia" && saldoPendienteTotal > 0) {
        throw new Error(`No se puede emitir: la unidad mantiene $${saldoPendienteTotal.toLocaleString("es-CL")} pendiente(s). El certificado Al Día exige saldo <= 0.`)
      }
      const propietario = vinculos.find(v => v.unidadId === unidadId && v.rol === "propietario" && !v.fechaFin)
      const nombreProp = propietario ? nombrePersona(propietario.personaId) : "—"
      if (tipoActual === "estado_cuenta") {
        resumen = `Estado de cuenta oficial de ${refUnidadUI(unidadId)}: detalle de gastos comunes pagados, cuotas extraordinarias y fondos pendientes según el libro de Finanzas.`
      } else {
        resumen = `Se certifica que la unidad ${refUnidadUI(unidadId)} NO registra deudas pendientes con la comunidad a la fecha de emisión.`
      }
      detalle = [
        ["Unidad", refUnidadUI(unidadId)],
        ["Propietario", nombreProp],
        ["Cobros registrados", String(cobros.length)],
        ["Total cargado", `$${totalCargado.toLocaleString("es-CL")}`],
        ["Saldo pendiente", `$${saldoPendienteTotal.toLocaleString("es-CL")}`],
      ]
    } else {
      const liq = liquidacionesPL.find(l => l.id === liquidacionId)
      if (!liq) throw new Error("El certificado de liquidación exige una liquidación de PL.")
      if (liq.estado !== "confirmada") {
        throw new Error("Solo liquidaciones confirmadas admiten certificado oficial (control tras cierre del mes).")
      }
      unidadIdDestino = undefined
      personaIdDestino = liq.trabajadorPersonaId
      origenRef = liq.id
      const nombreTrabajador = nombrePersona(liq.trabajadorPersonaId)
      resumen = `Se certifica la remuneración, descuentos legales y haberes de ${nombreTrabajador} correspondientes al periodo ${liq.periodo}, según la liquidación folio ${liq.folio} emitida por la administración.`
      detalle = [
        ["Trabajador", nombreTrabajador],
        ["Periodo", liq.periodo],
        ["Folio liquidación", liq.folio],
        ["Total imponible", `$${liq.totalImponible.toLocaleString("es-CL")}`],
        ["Total haberes", `$${liq.totalHaberes.toLocaleString("es-CL")}`],
        ["Total descuentos legales", `$${liq.totalDescuentos.toLocaleString("es-CL")}`],
        ["Líquido a pagar", `$${liq.liquidoAPagar.toLocaleString("es-CL")}`],
      ]
    }

    // Folio CT correlativo + código de verificación único.
    const numeros = certificados
      .map(c => Number.parseInt(c.folio.replace(/^CT-/, ""), 10))
      .filter(n => Number.isFinite(n))
    const folio = `CT-${String((numeros.length > 0 ? Math.max(...numeros) : 0) + 1).padStart(4, "0")}`
    let codigoVerificacion = `VC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
    while (certificados.some(c => c.codigoVerificacion === codigoVerificacion)) {
      codigoVerificacion = `VC-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
    }

    // Snapshot de la directiva vigente al emitir (trazabilidad histórica, no bloqueante).
    const firmantes = periodoVigente
      ? personas
          .filter(p => esMiembroDirectivaVigente(p, periodoVigente.id))
          .flatMap(p =>
            p.datosGobernanza
              ? [{ personaId: p.id, nombre: p.nombreCompleto, cargo: p.datosGobernanza.cargoDirectiva }]
              : []
          )
      : []

    return {
      id: generarId("ct"),
      folio,
      codigoVerificacion,
      tipo: tipoActual,
      ...(unidadIdDestino ? { unidadId: unidadIdDestino } : {}),
      ...(personaIdDestino ? { personaId: personaIdDestino } : {}),
      ...(origenRef ? { origenRef } : {}),
      solicitanteNombre: solicitanteNombre.trim(),
      resumen,
      detalle: detalle.map(([clave, valor]) => ({ clave, valor })),
      ...(configuracion?.firmaDigitalizadaUrl ? { firmaUrl: configuracion.firmaDigitalizadaUrl } : {}),
      ...(periodoVigente ? { directivaRef: { periodoId: periodoVigente.id, firmantes } } : {}),
      fechaEmision: hoyISO(),
    }
  }

  const generarYDescargar = async () => {
    setError(null); setOkMsg(null)
    if (!solicitanteNombre.trim()) {
      setError("Debe identificar al solicitante del certificado.")
      return
    }
    const firmaUrl = configuracion?.firmaDigitalizadaUrl
    if (firmaUrl && (/^data:/i.test(firmaUrl) || /^blob:/i.test(firmaUrl))) {
      setError("Media por referencia (D1): la firma digitalizada configurada en CF no puede estar embebida como base64/Blob.")
      return
    }
    let registro: CertificadoCT
    try {
      registro = construirRegistro(tipo)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      return
    }
    const validacion = CertificadoCTSchema.safeParse(registro)
    if (!validacion.success) {
      setError(`Datos del certificado inválidos: ${validacion.error.issues[0]?.message ?? ""}`)
      return
    }
    const r = await crearCertificadoApi(registro)
    if (!r.ok) {
      setError(r.error ?? "No se pudo emitir el certificado")
      return
    }
    await descargar(registro)
    setOkMsg(`Certificado ${registro.folio} emitido y firmado. Código de verificación: ${registro.codigoVerificacion}`)
    setSolicitanteNombre("")
  }

  const descargar = async (c: CertificadoCT) => {
    setPdfBusy(c.id)
    try {
      const doc = await documentoCertificadoPDF({
        tipo: TIPO_LABEL[c.tipo],
        titulo: TIPO_LABEL[c.tipo],
        folio: c.folio,
        codigoVerificacion: c.codigoVerificacion,
        fechaEmision: c.fechaEmision,
        parrafos: [c.resumen],
        detalle: c.detalle.map(d => [d.clave, d.valor] as [string, string]),
        solicitanteNombre: c.solicitanteNombre,
        config: configuracion as ConfiguracionGlobal,
      })
      const { descargarPdf: descargarArchivo } = await import("@/lib/pdf-utils")
      await descargarArchivo(doc, `certificado-${c.folio}.pdf`)
      setOkMsg(`PDF ${c.folio} generado con firma embebida.`)
    } catch (e) {
      setError(`No se pudo generar el PDF: ${String(e)}`)
    } finally {
      setPdfBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><IconCertificate className="size-7 text-primary" /> Certificados</h1>
        <p className="text-muted-foreground">
          Documentación oficial con firma digitalizada del administrador embebida en el PDF e historial de emisión verificable.
        </p>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">{okMsg}</div>}

      <Tabs defaultValue="generar">
        <TabsList>
          <TabsTrigger value="generar">Generar</TabsTrigger>
          <TabsTrigger value="historial">Historial de Emisión</TabsTrigger>
        </TabsList>

        <TabsContent value="generar" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nuevo certificado</CardTitle>
              <CardDescription>El sistema valida los requisitos por tipología antes de emitir (VU activo, saldo Al Día ≤ 0, liquidación confirmada).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Tipo de certificado *</Label>
                <Select value={tipo} onValueChange={v => { setTipo(v as CertificadoCT["tipo"]); setPersonaId(""); setUnidadId(""); setLiquidacionId("") }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_LABEL) as CertificadoCT["tipo"][]).map(t => (
                      <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {tipo === "residencia" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>Persona solicitante *</Label>
                    <Select value={personaId} onValueChange={setPersonaId}>
                      <SelectTrigger><SelectValue placeholder="Selecciona persona" /></SelectTrigger>
                      <SelectContent>
                        {personasConVinculoActivo.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.nombres} {p.apellidos}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Solo personas con vínculo vigente en alguna unidad.</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Unidad *</Label>
                    <Select value={unidadId || undefined} onValueChange={setUnidadId}>
                      <SelectTrigger><SelectValue placeholder="Selecciona unidad" /></SelectTrigger>
                      <SelectContent>
                        {unidades.filter(u => !personaId || vinculos.some(v => v.personaId === personaId && v.unidadId === u.id && !v.fechaFin)).map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.etiqueta} {u.numero}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {(tipo === "estado_cuenta" || tipo === "al_dia") && (
                <div className="flex flex-col gap-1.5">
                  <Label>Unidad *</Label>
                  <Select value={unidadId || undefined} onValueChange={setUnidadId}>
                    <SelectTrigger><SelectValue placeholder="Selecciona unidad" /></SelectTrigger>
                    <SelectContent>
                      {unidades.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.etiqueta} {u.numero}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {gateAlDia !== null && (
                    <p className={`text-xs ${gateAlDia <= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
                      Saldo pendiente actual: ${gateAlDia.toLocaleString("es-CL")} {gateAlDia > 0 ? "— la emisión Al Día será rechazada" : "— unidad califica para Al Día"}
                    </p>
                  )}
                </div>
              )}

              {tipo === "liquidacion_sueldo" && (
                <div className="flex flex-col gap-1.5">
                  <Label>Liquidación confirmada *</Label>
                  <Select value={liquidacionId || undefined} onValueChange={setLiquidacionId}>
                    <SelectTrigger><SelectValue placeholder="Selecciona liquidación PL" /></SelectTrigger>
                    <SelectContent>
                      {liquidacionesConfirmadas.length === 0 && <SelectItem value="-" disabled>Sin liquidaciones confirmadas</SelectItem>}
                      {liquidacionesConfirmadas.map(l => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.folio} · {nombrePersona(l.trabajadorPersonaId)} · {l.periodo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Control: solo documentos confirmados tras el cierre del mes.</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label>Solicitante *</Label>
                <Input value={solicitanteNombre} onChange={e => setSolicitanteNombre(e.target.value)} placeholder="Nombre de quien solicita" />
              </div>

              <div className="md:col-span-2">
                <Button onClick={() => { void generarYDescargar() }} disabled={!solicitanteNombre.trim()}>
                  <IconFileText className="size-4 mr-1" /> Generar certificado PDF firmado
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historial">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historial de emisión</CardTitle>
              <CardDescription>Cada documento lleva folio CT y código de verificación único; el historial es inmutable.</CardDescription>
            </CardHeader>
            <CardContent>
              {certificados.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin certificados emitidos aún.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Folio</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Destino</th>
                        <th className="px-3 py-2">Solicitante</th>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Código verificación</th>
                        <th className="px-3 py-2 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...certificados].reverse().map(c => (
                        <tr key={c.id} className="border-t">
                          <td className="px-3 py-2 font-mono text-xs">{c.folio}</td>
                          <td className="px-3 py-2"><Badge variant="secondary">{TIPO_LABEL[c.tipo]}</Badge></td>
                          <td className="px-3 py-2">{c.personaId ? nombrePersona(c.personaId) : refUnidadUI(c.unidadId)}</td>
                          <td className="px-3 py-2">{c.solicitanteNombre}</td>
                          <td className="px-3 py-2">{c.fechaEmision}</td>
                          <td className="px-3 py-2 font-mono text-xs">{c.codigoVerificacion}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" disabled={pdfBusy === c.id} onClick={() => { void descargar(c) }}>
                                <IconFileText className="size-4 mr-1" /> PDF
                              </Button>
                                {c.id.startsWith("test-") && (
                                <Button size="sm" variant="ghost" onClick={() => { void removeCertificadoApi(c.id) }}><IconTrash className="size-4" /></Button>
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
      </Tabs>
    </div>
  )
}
