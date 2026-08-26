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
import { IconCertificate, IconFileText, IconTrash } from "@tabler/icons-react"
import type { CertificadoCT, ConfiguracionGlobal } from "@/lib/schemas"
import { documentoCertificadoPDF } from "@/lib/pdf-utils"
import { saldoPendiente } from "@/lib/finanzas-utils"

const TIPO_LABEL: Record<CertificadoCT["tipo"], string> = {
  residencia: "Certificado de Residencia",
  estado_cuenta: "Estado de Cuenta / Fondos",
  liquidacion_sueldo: "Certificado Liquidación de Sueldo",
  al_dia: "Certificado Al Día (Informativo)",
}

export default function CertificadosPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore(s => s.hasHydrated)
  const certificados = useCompassStore(s => s.certificadosCT)
  const personas = useCompassStore(s => s.personas)
  const unidades = useCompassStore(s => s.unidades)
  const vinculos = useCompassStore(s => s.vinculos)
  const liquidacionesPL = useCompassStore(s => s.liquidacionesPL)
  const cobrosFI = useCompassStore(s => s.cobrosFI)
  const configuracion = useCompassStore(s => s.configuracion)
  const generarCertificadoCT = useCompassStore(s => s.generarCertificadoCT)
  const removeCertificadoCT = useCompassStore(s => s.removeCertificadoCT)

  const [tipo, setTipo] = React.useState<CertificadoCT["tipo"]>("residencia")
  const [personaId, setPersonaId] = React.useState("")
  const [unidadId, setUnidadId] = React.useState("")
  const [liquidacionId, setLiquidacionId] = React.useState("")
  const [solicitanteNombre, setSolicitanteNombre] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = React.useState<string | null>(null)

  if (!hasHydrated) {
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

  const generarYDescargar = async () => {
    setError(null); setOkMsg(null)
    const r = generarCertificadoCT({
      tipo,
      ...(tipo !== "liquidacion_sueldo" && unidadId ? { unidadId } : {}),
      ...(tipo === "residencia" && personaId ? { personaId } : {}),
      ...(tipo === "liquidacion_sueldo" ? { liquidacionId } : {}),
      solicitanteNombre,
    })
    if (!r.ok) {
      setError(r.error ?? "No se pudo emitir el certificado")
      return
    }
    const registro = useCompassStore.getState().certificadosCT[useCompassStore.getState().certificadosCT.length - 1]
    if (registro) {
      await descargar(registro)
      setOkMsg(`Certificado ${registro.folio} emitido y firmado. Código de verificación: ${registro.codigoVerificacion}`)
    }
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
                                <Button size="sm" variant="ghost" onClick={() => removeCertificadoCT(c.id)}><IconTrash className="size-4" /></Button>
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
