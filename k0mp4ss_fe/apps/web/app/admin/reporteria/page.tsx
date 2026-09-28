"use client"

import * as React from "react"
import { useCompassStore } from "@/lib/store"
import { useUnidades } from "@/lib/api/use-unidades"
import { useVinculos } from "@/lib/api/use-vinculos"
import { usePersonas } from "@/lib/api/use-personas"
import { useCierresTurnoPE, useBitacoraVisitasPE } from "@/lib/api/use-pe"
import { useMaestros } from "@/lib/api/use-maestros"
import { useSolicitudesGE } from "@/lib/api/use-ge"
import { useCobrosFI } from "@/lib/api/use-cobros-fi"
import { useEgresosFI } from "@/lib/api/use-egresos-fi"
import { useFondosFI } from "@/lib/api/use-fondos-fi"
import { useMacroSectores } from "@/lib/api/use-macro-sectores"
import { useMicroSectores } from "@/lib/api/use-micro-sectores"
import { useReportesRE } from "@/lib/api/use-reportes-re"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { IconChartBar, IconSend, IconPlus, IconTrash } from "@tabler/icons-react"
import type { ReporteRE } from "@/lib/schemas"
import {
  metricasDemograficasRE,
  metricasOperativasRE,
  embudoGestionesGE,
  saludCajaFI,
  tasaHuerfanosRE,
} from "@/lib/reporteria-utils"

const BLOQUE_LABEL: Record<ReporteRE["bloques"][number], string> = {
  gastos_mes: "Resumen de Gastos del Mes",
  bitacora_seguridad: "Historial de Novedades (Bitácora)",
  morosidad: "Estado de Morosidad General",
  consumo_insumos: "Consumo de Insumos (IR)",
}

function Metrica({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="text-xl font-bold">{valor}</p>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
    </div>
  )
}

export default function ReporteriaPage() {
  const { items: unidades, isLoading: cUnidades } = useUnidades()
  const { vinculos, isLoading: cVinculos } = useVinculos()
  const { personas, isLoading: cPersonas } = usePersonas()
  const { items: cierresTurnoPE, isLoading: cCierres } = useCierresTurnoPE()
  const { items: bitacoraVisitasPE, isLoading: cBitacora } = useBitacoraVisitasPE()
  const { data: jornadas, isLoading: cJornadas } = useMaestros<{ id: string }>("jornadas")
  const { items: solicitudesGE, isLoading: cSolicitudes } = useSolicitudesGE()
  const { items: cobrosFI, isLoading: cCobros } = useCobrosFI()
  const { items: egresosFI, isLoading: cEgresos } = useEgresosFI()
  const { items: fondosFI, isLoading: cFondos } = useFondosFI()
  const { items: macroSectores, isLoading: cMacro } = useMacroSectores()
  const { items: microSectores, isLoading: cMicro } = useMicroSectores()
  const { items: reportesRE, isLoading: cReportes, create: crearReporteBD, update: editarReporteBD, remove } = useReportesRE()
  const isLoading =
cUnidades || cVinculos || cPersonas || cCierres || cBitacora || cJornadas ||
cSolicitudes || cCobros || cEgresos || cFondos || cMacro || cMicro || cReportes
  // TODO(P-futura): migrar a endpoints dedicados cuando existan (generar con
  // snapshot servidor, distribuir y registrar vista hoy solo viven en el store).
  const registrarVistaDashboardRE = useCompassStore(s => s.registrarVistaDashboardRE)
  const generarReporteRE = useCompassStore(s => s.generarReporteRE)
  const distribuirReporteRE = useCompassStore(s => s.distribuirReporteRE)
  // Shim de lectura: misma forma que el store para no tocar la lógica de mando/generador.
  const store = {
unidades, vinculos, personas,
cierresTurnoPE, bitacoraVisitasPE, solicitudesGE,
cobrosFI, egresosFI, fondosFI,
macroSectores, microSectores, reportesRE,
maestros: { jornadas },
  }

  const [tab, setTab] = React.useState("mando")
  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)

  // Generador
  const [titulo, setTitulo] = React.useState("")
  const [bloquesSel, setBloquesSel] = React.useState<string[]>([])
  const [macroId, setMacroId] = React.useState("todos")
  const [microId, setMicroId] = React.useState("todos")
  const [unidadFiltro, setUnidadFiltro] = React.useState("todas")
  const [perfiles, setPerfiles] = React.useState<string[]>([])
  const [tenencias, setTenencias] = React.useState<string[]>([])

  React.useEffect(() => {
    if (!isLoading && tab === "mando") registrarVistaDashboardRE("demografico")
  }, [isLoading, tab, registrarVistaDashboardRE])
    
  if (isLoading) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
  }

  const unidadesHabitablessIds = store.unidades.filter(u => !u.id.startsWith("u-E-")).map(u => u.id)
  const demo = metricasDemograficasRE({
    vinculos: store.vinculos,
    personas: store.personas.map(p => ({ id: p.id, condicionesEspecialesIds: p.condicionesEspecialesIds })),
    unidadesHabitablesIds: unidadesHabitablessIds,
  })
  const hoyISOStr = new Date().toISOString().slice(0, 10)
  const ops = metricasOperativasRE({
    cierresTurnoPE: store.cierresTurnoPE.map(c => ({ fecha: c.fecha, jornadaReportadaId: c.jornadaReportadaId })),
    jornadasIds: store.maestros.jornadas.map(j => j.id),
    bitacoraVisitasPE: store.bitacoraVisitasPE.map(v => ({ fecha: v.fecha, origenAgenda: v.origenAgenda, estado: v.estado })),
    fecha: hoyISOStr,
  })
  const embudo = embudoGestionesGE(store.solicitudesGE.map(s => ({ estado: s.estado })))
  const caja = saludCajaFI({
    cobrosFI: store.cobrosFI,
    egresosFI: store.egresosFI,
    fondos: store.fondosFI.filter(f => f.activo).map(f => ({ id: f.id, nombre: f.nombre })),
  })
  const huerfanos = tasaHuerfanosRE({
    unidades: store.unidades.map(u => ({ id: u.id, microSectorId: u.microSectorId })),
    microSectores: store.microSectores,
    vinculos: store.vinculos.map(v => ({ personaId: v.personaId, unidadId: v.unidadId })),
    personas: store.personas.map(p => ({ id: p.id })),
  })

  const CLP = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`

  const toggleArray = (lista: string[], valor: string, setter: (v: string[]) => void) => {
    setter(lista.includes(valor) ? lista.filter(x => x !== valor) : [...lista, valor])
  }

  const generar = async () => {
    setError(null); setOkMsg(null)
    const r = generarReporteRE({
      titulo,
      bloques: bloquesSel as ReporteRE["bloques"],
      segmento: {
        macroSectorIds: macroId !== "todos" ? [macroId] : [],
        microSectorIds: microId !== "todos" ? [microId] : [],
        unidadIds: unidadFiltro !== "todas" ? [unidadFiltro] : [],
        perfiles: perfiles as ReporteRE["segmento"]["perfiles"],
        tenencias: tenencias as ReporteRE["segmento"]["tenencias"],
      },
    })
    if (!r.ok) setError(r.error ?? "No se pudo generar el reporte")
    else {
      // P2 E2E-FULL-VERDE: el historial lee de BD — persistir el creado para
      // que aparezca (el store legacy solo calcula el snapshot).
      const tituloGen = titulo.trim()
      const creado = useCompassStore.getState().reportesRE.find((x) => x.titulo === tituloGen)
      if (creado) {
        const rb = await crearReporteBD(creado)
        if (!rb.ok) setError(rb.error ?? "Se generó local pero no quedó en el historial.")
      }
      setOkMsg("Reporte generado con snapshot inmutable. Revísalo y distribúyelo.")
      setTitulo(""); setBloquesSel([])
    }
  }

  const distribuir = async (id: string) => {
    setError(null); setOkMsg(null)
    const r = distribuirReporteRE(id)
    if (!r.ok) setError(r.error ?? "No se pudo distribuir")
    else {
      // Espejar distribución en BD para que el badge del historial la refleje.
      const actual = useCompassStore.getState().reportesRE.find((x) => x.id === id)
      if (actual) await editarReporteBD(id, { fechaDistribucion: actual.fechaDistribucion, distribuidoA: actual.distribuidoA, destinatariosPersonaId: actual.destinatariosPersonaId })
      setOkMsg("Distribución enviada a la bandeja simulada de cada destinatario resuelto.")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><IconChartBar className="size-7 text-primary" /> Reportería y Dashboards</h1>
        <p className="text-muted-foreground">Centro de mando consolidado y motor de distribución con segmentación granular.</p>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">{okMsg}</div>}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="mando">Centro de Mando</TabsTrigger>
          <TabsTrigger value="reportes">Reportes y Segmentación</TabsTrigger>
        </TabsList>

        <TabsContent value="mando" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Métricas Demográficas — Censo</CardTitle>
              <CardDescription>Ratio de ocupación y unidades con residentes con condiciones especiales.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metrica etiqueta="Ocupación habitable" valor={`${demo.ratioOcupacionPct}%`} detalle={`${demo.unidadesConPropietario + demo.unidadesConArrendatario} de ${demo.unidadesHabitables}`} />
              <Metrica etiqueta="Unidades con propietario" valor={String(demo.unidadesConPropietario)} />
              <Metrica etiqueta="Con arrendatario vigente" valor={String(demo.unidadesConArrendatario)} />
              <Metrica etiqueta="Condiciones especiales" valor={String(demo.unidadesConCondicionesEspeciales)} detalle="unidades" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Métricas Operativas — El pulso diario</CardTitle>
              <CardDescription>Eficiencia de turnos y control de accesos de hoy ({hoyISOStr}).</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metrica etiqueta="Eficiencia de turnos" valor={`${ops.turnosCerrados} de ${ops.turnosTotales}`} detalle="cierres informados hoy" />
              <Metrica etiqueta="Visitas pre-agendadas" valor={`${ops.visitasConfirmadas} de ${ops.visitasPreAgendadas}`} detalle="confirmadas por conserjería" />
              <Metrica etiqueta="Tasa huérfanos ST" valor={`${huerfanos.tasaPct}%`} detalle={`${huerfanos.dangling} dangling / ${huerfanos.total}`} />
              <Metrica etiqueta="Tickets GE totales" valor={String(embudo.total)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Centro de Gestiones — Embudo GE</CardTitle>
              <CardDescription>Control cuantitativo estricto del embudo de tareas y tickets de la comunidad.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metrica etiqueta="Total gestiones" valor={String(embudo.total)} />
              <Metrica etiqueta="Tasa de resolución" valor={`${embudo.tasaResolucionPct}%`} />
              <Metrica etiqueta="Nuevas / Pendientes" valor={String(embudo.nuevas)} />
              <Metrica etiqueta="En revisión" valor={String(embudo.enRevision)} />
              <Metrica etiqueta="Notificadas (en proceso)" valor={String(embudo.enProceso)} />
              <Metrica etiqueta="Solucionadas" valor={String(embudo.solucionadas)} />
              <Metrica etiqueta="Dadas en conocimiento" valor={String(embudo.dadasEnConocimiento)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Métricas Financieras — Salud de Caja</CardTitle>
              <CardDescription>Recaudación por fondo, diferencia de caja y termómetro de gastos fijos.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-3 py-2">Fondo</th><th className="px-3 py-2 text-right">Emitido</th><th className="px-3 py-2 text-right">Recaudado</th></tr>
                  </thead>
                  <tbody>
                    {caja.recaudacionPorFondo.map(f => (
                      <tr key={f.fondoId} className="border-t">
                        <td className="px-3 py-2">{f.nombre}</td>
                        <td className="px-3 py-2 text-right">{CLP(f.emitido)}</td>
                        <td className="px-3 py-2 text-right">{CLP(f.recaudado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metrica etiqueta="Ingresos netos" valor={CLP(caja.ingresosNetos)} />
                <Metrica etiqueta="Egresos totales" valor={CLP(caja.egresosTotales)} />
                <Metrica etiqueta="Diferencia de caja" valor={CLP(caja.diferenciaCaja)} />
                <div className={`rounded-lg border p-3 ${caja.termometroVerde ? "border-emerald-400 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-red-400 bg-red-50 dark:border-red-900 dark:bg-red-950/20"}`}>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Termómetro gastos fijos</p>
                  <p className={`text-xl font-bold ${caja.termometroVerde ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{caja.termometroVerde ? "Verde" : "Rojo"}</p>
                  <p className="text-xs text-muted-foreground">Fijos recurrentes: {CLP(caja.gastosFijosRecurrentes)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generador de reportes personalizados</CardTitle>
              <CardDescription>Selecciona bloques y segmenta destinatarios con precisión quirúrgica (EF + perfil + tenencia).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Título del reporte *</Label>
                <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ej. Fallas en ascensores Torre A" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Bloques de información *</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(BLOQUE_LABEL) as ReporteRE["bloques"]).map(b => (
                    <label key={b} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <Checkbox checked={bloquesSel.includes(b)} onCheckedChange={() => toggleArray(bloquesSel, b, setBloquesSel)} />
                      {BLOQUE_LABEL[b]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Alcance físico</Label>
                  <Select value={macroId} onValueChange={v => { setMacroId(v); setMicroId("todos"); setUnidadFiltro("todas") }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Toda la comunidad</SelectItem>
                      {store.macroSectores.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Piso / sub-sector</Label>
                  <Select value={microId} onValueChange={v => { setMicroId(v); setUnidadFiltro("todas") }} disabled={macroId === "todos"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todo el sector</SelectItem>
                      {store.microSectores.filter(m => macroId === "todos" || m.macroSectorId === macroId).map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Unidad</Label>
                  <Select value={unidadFiltro} onValueChange={setUnidadFiltro} disabled={microId === "todos"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      {store.unidades.filter(u => microId !== "todos" && u.microSectorId === microId).slice(0, 100).map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.etiqueta} {u.numero}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Perfil de persona (MP/RP)</Label>
                  <div className="flex flex-wrap gap-2">
                    {(["administracion", "personal", "propietario", "residente"] as const).map(v => (
                      <Button key={v} size="sm" variant={perfiles.includes(v) ? "default" : "outline"} onClick={() => toggleArray(perfiles, v, setPerfiles)}>{v === "administracion" ? "Administración/Directiva" : v === "personal" ? "Trabajador de servicio" : v === "propietario" ? "Propietarios" : "Residentes"}</Button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Tipo de tenencia</Label>
                  <div className="flex flex-wrap gap-2">
                    {[["propietarios", "Solo propietarios"], ["arrendatarios", "Solo residentes (arrendatarios)"]].map(([v, l]) => (
                      <Button key={v} size="sm" variant={tenencias.includes(v!) ? "default" : "outline"} onClick={() => toggleArray(tenencias, v!, setTenencias)}>{l}</Button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <Button onClick={generar} disabled={titulo.trim().length < 3 || bloquesSel.length === 0}>
                  <IconPlus className="size-4 mr-1" /> Generar reporte (snapshot)
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historial de reportes</CardTitle>
              <CardDescription>Distribución idempotente: los destinatarios se resuelven al momento de enviar.</CardDescription>
            </CardHeader>
            <CardContent>
              {store.reportesRE.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin reportes generados aún.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {store.reportesRE.map(r => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">{r.titulo}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.bloques.map(b => BLOQUE_LABEL[b]).join(" · ")} · generado {r.fechaGeneracion}
                          {r.fechaDistribucion ? ` · distribuido ${r.fechaDistribucion}` : ""}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.segmento.macroSectorIds.length > 0 && <Badge variant="secondary" className="text-[10px]">EF macros ×{r.segmento.macroSectorIds.length}</Badge>}
                          {r.segmento.microSectorIds.length > 0 && <Badge variant="secondary" className="text-[10px]">pisos ×{r.segmento.microSectorIds.length}</Badge>}
                          {r.segmento.unidadIds.length > 0 && <Badge variant="secondary" className="text-[10px]">unidades ×{r.segmento.unidadIds.length}</Badge>}
                          {r.segmento.perfiles.map(p => <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>)}
                          {r.segmento.tenencias.map(t => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.distribuidoA > 0 ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">{r.distribuidoA} destinatario(s)</Badge>
                        ) : (
                          <>
                            <Button size="sm" onClick={() => distribuir(r.id)}><IconSend className="size-4 mr-1" /> Distribuir</Button>
                            {r.id.startsWith("test-") && (
                              <Button size="sm" variant="ghost" onClick={() => { void remove(r.id) }}><IconTrash className="size-4" /></Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
