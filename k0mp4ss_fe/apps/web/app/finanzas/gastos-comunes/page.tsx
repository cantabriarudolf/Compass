"use client"

import * as React from "react"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Switch } from "@workspace/ui/components/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
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
import {
  IconCoins,
  IconPlus,
  IconPencil,
  IconTrash,
  IconReceipt2,
  IconSend,
  IconAlertTriangle,
  IconTrendingUp,
  IconWallet,
} from "@tabler/icons-react"
import type { CategoriaEgresoFI, CobroFI, TipoFondoFI } from "@/lib/schemas"
import {
  estadoDeCobro,
  hoyISO,
  montoMoraPropuesta,
  morosidadPorUnidad,
  saldoFondo,
  saldoPendiente,
} from "@/lib/finanzas-utils"
import { generarId } from "@/lib/id-utils"
import { useFondosFI } from "@/lib/api/use-fondos-fi"
import { useEgresosFI } from "@/lib/api/use-egresos-fi"
import { useIngresosFI } from "@/lib/api/use-ingresos-fi"
import { useEmisionesGC } from "@/lib/api/use-emisiones-gc"
import { useCobrosFI } from "@/lib/api/use-cobros-fi"
import { useUnidades } from "@/lib/api/use-unidades"
import { useTiposUnidad } from "@/lib/api/use-tipos-unidad"

const TIPO_FONDO_LABEL: Record<TipoFondoFI, string> = {
  gasto_comun: "Gasto Común",
  reserva: "Fondo de Reserva",
  especial: "Cuota Extraordinaria / Especial",
  amenities: "Amenities",
}

const CATEGORIA_EGRESO_LABEL: Record<CategoriaEgresoFI, string> = {
  sueldos: "Sueldos",
  mantencion: "Mantención",
  servicios: "Servicios",
  administracion: "Administración",
  uso_de_fondo: "Uso de Fondo",
  otro: "Otro",
}

interface FormFondo {
  nombre: string
  tipo: TipoFondoFI
  descripcion: string
  porcentajeAporte: string
  activo: boolean
  saldoInicial: string
}

interface FormEgreso {
  fecha: string
  categoria: CategoriaEgresoFI
  descripcion: string
  monto: string
  fondoId: string
  esRecurrente: boolean
  comprobanteNombre: string
  comprobanteUrl: string
  proveedor: string
}

interface FormIngreso {
  fecha: string
  monto: string
  concepto: string
  fondoId: string
  familia: string
}

function periodoSugerido(): string {
  return new Date().toISOString().slice(0, 7)
}

export default function GastosComunesPage() {
  useStoreRehydrated()
      const hasHydrated = useCompassStore(s => s.hasHydrated)
      // FI vía API REST (BD fuente de verdad); vínculos/config/cobranza siguen en el store.
      const { items: fondos, isLoading: cargandoFondos, create: crearFondo, update: editarFondo, remove: eliminarFondo } = useFondosFI()
      const { items: egresos, isLoading: cargandoEgresos, create: crearEgreso, remove: eliminarEgreso } = useEgresosFI()
      const { items: ingresosFI, isLoading: cargandoIngresos, create: crearIngreso, remove: eliminarIngreso } = useIngresosFI()
      const { items: emisionesGC, isLoading: cargandoEmisiones, emitir: emitirGC } = useEmisionesGC()
      const { items: cobros, isLoading: cargandoCobros, update: editarCobro } = useCobrosFI()
      const { items: unidades, isLoading: cargandoUnidades } = useUnidades()
      const { items: tiposUnidad, isLoading: cargandoTipos } = useTiposUnidad()
      const cargandoAPI =
        cargandoFondos ||
        cargandoEgresos ||
        cargandoIngresos ||
        cargandoEmisiones ||
        cargandoCobros ||
        cargandoUnidades ||
        cargandoTipos
  const vinculos = useCompassStore(s => s.vinculos)
  const configuracion = useCompassStore(s => s.configuracion)
  const enviarCobranzaFI = useCompassStore(s => s.enviarCobranzaFI)

  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)
  const [formFondo, setFormFondo] = React.useState<FormFondo | null>(null)
  const [editandoFondoId, setEditandoFondoId] = React.useState<string | null>(null)
  const [formEgreso, setFormEgreso] = React.useState<FormEgreso | null>(null)
  const [formIngreso, setFormIngreso] = React.useState<FormIngreso | null>(null)
  const [periodo, setPeriodo] = React.useState(periodoSugerido())
  const [gastoTotal, setGastoTotal] = React.useState("")
  const [unidadIdsEmision, setUnidadIdsEmision] = React.useState<string>("todas")
  const [moraTasa, setMoraTasa] = React.useState("1")


  const saldoInicialPorFondo = React.useMemo(
    () => Object.fromEntries(fondos.map(f => [f.id, f.saldoInicial ?? 0])),
    [fondos]
  )
  const saldoDe = (fondoId: string) =>
    saldoFondo(fondoId, { cobros, egresos, emisiones: emisionesGC, ingresosFI, saldoInicialPorFondo })

  const elegiblesEmision = React.useMemo(
    () => unidades.filter(u => !u.id.startsWith("u-E-")),
    [unidades]
  )
  const sinResponsable = React.useMemo(
    () =>
      elegiblesEmision.filter(
        u => !vinculos.some(v => v.unidadId === u.id && v.rol === "propietario" && !v.fechaFin)
      ),
    [elegiblesEmision, vinculos]
  )

  const vistaPrevia = React.useMemo(() => {
    const total = Number.parseFloat(gastoTotal.replace(/\./g, "").replace(",", "."))
    if (configuracion.modoCalculoGC === "variable" && !(total > 0)) return []
    const ids =
      unidadIdsEmision === "todas" ? elegiblesEmision.map(u => u.id) : unidadIdsEmision.split(",").map(x => x.trim()).filter(Boolean)
    return elegiblesEmision
      .filter(u => ids.includes(u.id))
      .slice(0, 8)
      .map(u => {
        if (configuracion.modoCalculoGC === "fijo") {
          const tipo = tiposUnidad.find(t => t.id === u.tipoUnidadId)
          return { ref: `${u.etiqueta} ${u.numero}`, monto: Math.round(tipo?.montoBaseGc ?? 0) }
        }
        return { ref: `${u.etiqueta} ${u.numero}`, monto: Math.round(total * u.prorrateo) }
      })
  }, [gastoTotal, unidadIdsEmision, elegiblesEmision, configuracion.modoCalculoGC, tiposUnidad])

  const unidadesAtrasadas = React.useMemo(() => {
    const hoy = hoyISO()
    return elegiblesEmision
      .map(u => ({ ...morosidadPorUnidad(u.id, cobros, hoy), ref: `${u.etiqueta} ${u.numero}` }))
      .filter(m => m.periodosVencidos > 0)
      .sort((a, b) => b.deudaVencida - a.deudaVencida)
  }, [elegiblesEmision, cobros])

  const enRiesgoCorte = React.useMemo(
    () => unidadesAtrasadas.filter(m => m.periodosVencidos >= configuracion.limiteMesesAvisoCorte),
    [unidadesAtrasadas, configuracion.limiteMesesAvisoCorte]
  )

  const cobrosVencidosPorUnidad = (unidadId: string) =>
    cobros.filter(c => c.unidadId === unidadId && estadoDeCobro(c) === "vencido")

  const guardarFondo = async () => {
    if (!formFondo) return
    setError(null)
    const saldoInicialNum = Number.parseFloat(formFondo.saldoInicial.replace(/\./g, "").replace(",", ".")) || 0
    const payload = {
      nombre: formFondo.nombre.trim(),
      tipo: formFondo.tipo,
      ...(formFondo.descripcion.trim() ? { descripcion: formFondo.descripcion.trim() } : {}),
      ...(formFondo.tipo === "reserva" && formFondo.porcentajeAporte
        ? { porcentajeAporte: Number.parseFloat(formFondo.porcentajeAporte) || 0 }
        : {}),
      activo: formFondo.activo,
      ...(saldoInicialNum > 0 ? { saldoInicial: saldoInicialNum } : {}),
    }
    const r = editandoFondoId
      ? await editarFondo(editandoFondoId, payload)
      : await crearFondo({ ...payload, id: generarId("fondo") })
    if (!r.ok) setError(r.error ?? "No se pudo guardar el fondo.")
    else {
      setOkMsg(`Fondo "${formFondo.nombre}" guardado.`)
      setFormFondo(null)
      setEditandoFondoId(null)
    }
  }

  const guardarEgreso = async () => {
    if (!formEgreso) return
    setError(null)
    // El folio FE-#### lo genera el servidor al alta.
    const r = await crearEgreso({
      id: generarId("egr"),
      fecha: formEgreso.fecha,
      categoria: formEgreso.categoria,
      descripcion: formEgreso.descripcion.trim(),
      monto: Number.parseFloat(formEgreso.monto.replace(/\./g, "").replace(",", ".")) || 0,
      fondoId: formEgreso.fondoId,
      esRecurrente: formEgreso.esRecurrente,
      ...(formEgreso.comprobanteUrl.trim()
        ? {
            comprobante: {
              nombre: formEgreso.comprobanteNombre.trim() || "comprobante",
              tipoMime: "application/pdf",
              tamanoKB: 0,
              url: formEgreso.comprobanteUrl.trim(),
            },
          }
        : {}),
      ...(formEgreso.proveedor.trim() ? { proveedor: formEgreso.proveedor.trim() } : {}),
    })
    if (!r.ok) setError(r.error ?? "No se pudo guardar el gasto.")
    else {
      setOkMsg(`Gasto "${formEgreso.descripcion}" registrado e imputado.`)
      setFormEgreso(null)
    }
  }

      const guardarIngreso = async () => {
        if (!formIngreso) return
        setError(null)
        const r = await crearIngreso({
          id: generarId("fi-ing"),
      fecha: formIngreso.fecha,
      monto: Number.parseFloat(formIngreso.monto.replace(/\./g, "").replace(",", ".")) || 0,
      concepto: formIngreso.concepto.trim(),
      fondoId: formIngreso.fondoId,
      ...(formIngreso.familia.trim() ? { familia: formIngreso.familia.trim() } : {}),
    })
    if (!r.ok) setError(r.error ?? "No se pudo registrar el ingreso.")
    else {
      setOkMsg(`Ingreso "${formIngreso.concepto}" registrado.`)
      setFormIngreso(null)
    }
  }

  const ejecutarEmision = async () => {
    setError(null)
    setOkMsg(null)
    const r = await emitirGC({
      periodo,
      modo: configuracion.modoCalculoGC,
      ...(configuracion.modoCalculoGC === "variable"
        ? { gastoTotal: Number.parseFloat(gastoTotal.replace(/\./g, "").replace(",", ".")) || 0 }
        : {}),
      ...(unidadIdsEmision !== "todas"
        ? { unidadIds: unidadIdsEmision.split(",").map(x => x.trim()).filter(Boolean) }
        : {}),
    })
    if (!r.ok) setError(r.error ?? "La emisión falló.")
    else {
      const datos = r.data as { emision: { lineas: { monto: number }[] } } | undefined
      const lineas = datos?.emision.lineas ?? []
      setOkMsg(
        `Periodo ${periodo} emitido: $${lineas.reduce((a, l) => a + l.monto, 0).toLocaleString("es-CL")} a ${lineas.length} unidad(es).`
      )
    }
  }

      const eliminarFondoClick = async (id: string) => {
        const r = await eliminarFondo(id)
        if (!r.ok) setError(r.error ?? "")
        else setOkMsg("Fondo eliminado.")
      }

      const eliminarEgresoClick = async (id: string) => {
        const r = await eliminarEgreso(id)
        if (!r.ok) setError(r.error ?? "No se pudo eliminar el gasto.")
      }

      const eliminarIngresoClick = async (id: string) => {
        const r = await eliminarIngreso(id)
        if (!r.ok) setError(r.error ?? "No se pudo eliminar el ingreso.")
      }

      /** Mora espejo de aplicarMoraFI: cálculo local + PUT del cobro. */
      const aplicarMoraClick = async (cobro: CobroFI, tasa: number) => {
        if (!cobro.fechaVencimiento) {
          setError("El cobro no tiene fecha de vencimiento registrada.")
          return
        }
        const hoy = hoyISO()
        const dias = Math.max(
          0,
          Math.floor(
            (new Date(`${hoy}T00:00:00`).getTime() -
              new Date(`${cobro.fechaVencimiento}T00:00:00`).getTime()) /
              86400000
          )
        )
        if (dias <= 0) {
          setError("El cobro aún no está vencido: no procede aplicar mora.")
          return
        }
        const pendiente = saldoPendiente(cobro)
        if (pendiente <= 0) {
          setError("El cobro ya está completamente pagado.")
          return
        }
        if (cobro.moras.some(m => m.fecha === hoy)) return
        const monto = montoMoraPropuesta(pendiente, dias, tasa)
        if (monto <= 0) {
          setError("El cálculo no arrojó mora aplicable.")
          return
        }
        const r = await editarCobro(cobro.id, {
          moras: [
            ...cobro.moras,
            { id: generarId("mora"), monto, diasAtraso: dias, tasaMensualPct: tasa, fecha: hoy },
          ],
        })
        if (!r.ok) setError(r.error ?? "No se pudo aplicar la mora.")
      }

      if (!hasHydrated || cargandoAPI) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 border-b pb-5">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><IconCoins className="size-7 text-primary" /> Gastos Comunes y Fondos</h1>
        <p className="text-muted-foreground">Salud financiera de la comunidad: fondos con imputación, egresos categorizados y emisión mensual del gasto común.</p>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">{okMsg}</div>}

      <Tabs defaultValue="fondos">
        <TabsList>
          <TabsTrigger value="fondos">Fondos</TabsTrigger>
          <TabsTrigger value="egresos">Egresos</TabsTrigger>
          <TabsTrigger value="ingresos">Ingresos</TabsTrigger>
          <TabsTrigger value="emision">Emisión GC</TabsTrigger>
          <TabsTrigger value="morosidad">Morosidad</TabsTrigger>
        </TabsList>

        <TabsContent value="fondos" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button onClick={() => { setEditandoFondoId(null); setFormFondo({ nombre: "", tipo: "especial", descripcion: "", porcentajeAporte: "", activo: true, saldoInicial: "" }) }}>
              <IconPlus className="size-4 mr-1" /> Nuevo Fondo
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {fondos.map(f => (
              <Card key={f.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{f.nombre}</CardTitle>
                      <CardDescription className="text-xs">{TIPO_FONDO_LABEL[f.tipo]}{f.porcentajeAporte !== undefined ? ` · aporte ${f.porcentajeAporte}%` : ""}{f.saldoInicial !== undefined && f.saldoInicial > 0 ? ` · apertura $${f.saldoInicial.toLocaleString("es-CL")}` : ""}</CardDescription>
                    </div>
                    {!f.activo && <Badge variant="secondary">Inactivo</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl font-semibold tabular-nums">${saldoDe(f.id).toLocaleString("es-CL")}</p>
                  <p className="text-xs text-muted-foreground">{f.descripcion ?? "Sin descripción."}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditandoFondoId(f.id); setFormFondo({ nombre: f.nombre, tipo: f.tipo, descripcion: f.descripcion ?? "", porcentajeAporte: f.porcentajeAporte?.toString() ?? "", activo: f.activo, saldoInicial: f.saldoInicial?.toString() ?? "" }) }}>
                      <IconPencil className="size-3.5 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void eliminarFondoClick(f.id)}>
                      <IconTrash className="size-3.5 mr-1" /> Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="egresos" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button disabled={fondos.length === 0} onClick={() => setFormEgreso({ fecha: hoyISO(), categoria: "mantencion", descripcion: "", monto: "", fondoId: fondos[0]?.id ?? "", esRecurrente: false, comprobanteNombre: "", comprobanteUrl: "", proveedor: "" })}>
              <IconPlus className="size-4 mr-1" /> Registrar Gasto
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Folio</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Descripción</th>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3">Fondo</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...egresos].reverse().map(e => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">{e.folio}</td>
                      <td className="px-4 py-2">{e.fecha}</td>
                      <td className="px-4 py-2">{e.descripcion}{e.esRecurrente && <Badge variant="outline" className="ml-2 text-[10px]">Recurrente</Badge>}{e.comprobante && <Badge variant="outline" className="ml-2 text-[10px]">D1</Badge>}</td>
                      <td className="px-4 py-2">{CATEGORIA_EGRESO_LABEL[e.categoria]}</td>
                      <td className="px-4 py-2">{fondos.find(f => f.id === e.fondoId)?.nombre ?? e.fondoId}</td>
                      <td className="px-4 py-2 text-right tabular-nums">${e.monto.toLocaleString("es-CL")}</td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void eliminarEgresoClick(e.id)}>
                          <IconTrash className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {egresos.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Sin egresos registrados.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ingresos" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button disabled={fondos.length === 0} onClick={() => setFormIngreso({ fecha: hoyISO(), monto: "", concepto: "", fondoId: fondos[0]?.id ?? "", familia: "" })}>
              <IconPlus className="size-4 mr-1" /> Registrar ingreso a fondo
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Concepto</th>
                    <th className="px-4 py-3">Fondo</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...ingresosFI].reverse().slice(0, 20).map(i => (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="px-4 py-2">{i.fecha}</td>
                      <td className="px-4 py-2">{i.concepto}{i.familia && <Badge variant="outline" className="ml-2 text-[10px]">{i.familia}</Badge>}</td>
                      <td className="px-4 py-2">{fondos.find(f => f.id === i.fondoId)?.nombre ?? i.fondoId}</td>
                      <td className="px-4 py-2 text-right tabular-nums">${i.monto.toLocaleString("es-CL")}</td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void eliminarIngresoClick(i.id)}>
                          <IconTrash className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {ingresosFI.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin ingresos manuales registrados.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="emision" className="space-y-4 pt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><IconReceipt2 className="size-4 text-primary" /> Emitir Gasto Común</CardTitle>
                <CardDescription>
                  Modalidad configurada en CF: <b>{configuracion.modoCalculoGC === "fijo" ? "Fija (monto base por tipo de unidad)" : "Variable / Prorrateo"}</b>. Día de corte de pago: {configuracion.diaCortePago}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="periodo-emision">Periodo (AAAA-MM)</Label>
                    <Input id="periodo-emision" value={periodo} onChange={ev => setPeriodo(ev.target.value)} placeholder="2026-08" />
                  </div>
                  {configuracion.modoCalculoGC === "variable" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="gasto-total">Gasto Total a Recaudar ($)</Label>
                      <Input id="gasto-total" value={gastoTotal} onChange={ev => setGastoTotal(ev.target.value)} placeholder="1500000" />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="alcance-emision">Alcance</Label>
                  <Select value={unidadIdsEmision} onValueChange={setUnidadIdsEmision}>
                    <SelectTrigger id="alcance-emision" aria-label="Alcance de la emisión"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas las unidades con responsable</SelectItem>
                      <SelectItem value="custom">Alcance personalizado (ids separados por coma)</SelectItem>
                    </SelectContent>
                  </Select>
                  {unidadIdsEmision !== "todas" && (
                    <Input value={unidadIdsEmision === "custom" ? "" : unidadIdsEmision} onChange={ev => setUnidadIdsEmision(ev.target.value)} placeholder="u-D-101,u-D-102" />
                  )}
                </div>
                {sinResponsable.length > 0 && unidadIdsEmision === "todas" && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                    {sinResponsable.length} unidad(es) sin propietario vigente bloquearán la emisión completa: {sinResponsable.slice(0, 5).map(u => `${u.etiqueta} ${u.numero}`).join(", ")}.
                  </div>
                )}
                <Button className="w-full" onClick={ejecutarEmision}><IconTrendingUp className="size-4 mr-1" /> Emitir periodo {periodo}</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vista previa (primeras 8 líneas)</CardTitle>
                <CardDescription>Así quedará el cobro de cada unidad incluida.</CardDescription>
              </CardHeader>
              <CardContent>
                {vistaPrevia.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{configuracion.modoCalculoGC === "variable" ? "Define el gasto total para ver la proyección prorrateada." : "Configura el alcance para ver la proyección."}</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {vistaPrevia.map(v => (
                      <li key={v.ref} className="flex justify-between rounded bg-muted/40 px-2 py-1"><span>{v.ref}</span><span className="font-medium tabular-nums">${v.monto.toLocaleString("es-CL")}</span></li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Historial de emisiones</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2">Periodo</th>
                    <th className="px-4 py-2">Modo</th>
                    <th className="px-4 py-2 text-right">Unidades</th>
                    <th className="px-4 py-2 text-right">Emitido</th>
                    <th className="px-4 py-2 text-right">Aporte Reserva</th>
                    <th className="px-4 py-2">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {[...emisionesGC].reverse().map(e => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{e.periodo}</td>
                      <td className="px-4 py-2">{e.modo === "fijo" ? "Fija" : "Variable"}</td>
                      <td className="px-4 py-2 text-right">{e.lineas.length}</td>
                      <td className="px-4 py-2 text-right tabular-nums">${e.lineas.reduce((a, l) => a + l.monto, 0).toLocaleString("es-CL")}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{e.fondoReservaAporte ? `$${e.fondoReservaAporte.monto.toLocaleString("es-CL")}` : "—"}</td>
                      <td className="px-4 py-2">{e.fechaEmision}</td>
                    </tr>
                  ))}
                  {emisionesGC.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Aún no se ha emitido ningún periodo.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="morosidad" className="space-y-4 pt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-destructive"><IconAlertTriangle className="size-4" /> Corte de Servicios</CardTitle>
                <CardDescription>Unidades con ≥ {configuracion.limiteMesesAvisoCorte} periodo(s) vencido(s): requieren corte de suministro según CF.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {enRiesgoCorte.length === 0 && <p className="text-sm text-muted-foreground">Ninguna unidad alcanza el límite de meses configurado.</p>}
                {enRiesgoCorte.map(m => (
                  <div key={m.unidadId} className="flex items-center justify-between rounded border border-destructive/30 bg-background px-3 py-2 text-sm">
                    <span>{m.ref} · {m.periodosVencidos} periodo(s)</span>
                    <span className="font-semibold tabular-nums text-destructive">${m.deudaVencida.toLocaleString("es-CL")}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Mora y Gestión de Cobranza</CardTitle>
                <CardDescription>Tasa mensual sugerida por la administración (pro-rata diario sobre el saldo exigible).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end gap-2">
                  <div className="w-28 space-y-1.5">
                    <Label htmlFor="tasa-mora">Tasa % mensual</Label>
                    <Input id="tasa-mora" value={moraTasa} onChange={ev => setMoraTasa(ev.target.value)} />
                  </div>
                </div>
                {unidadesAtrasadas.length === 0 && <p className="text-sm text-muted-foreground">Sin unidades atrasadas. 🎉</p>}
                {unidadesAtrasadas.map(m => {
                  const pendientes = cobrosVencidosPorUnidad(m.unidadId)
                  return (
                    <div key={m.unidadId} className="space-y-1.5 rounded border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{m.ref}</span>
                        <Badge variant="destructive">{m.periodosVencidos} vencido(s) · ${m.deudaVencida.toLocaleString("es-CL")}</Badge>
                      </div>
                      {pendientes.slice(0, 3).map(c => (
                        <div key={c.id} className="flex items-center justify-between gap-2 pl-2 text-xs text-muted-foreground">
                          <span>{c.descripcion} · vence {c.fechaVencimiento}</span>
                          <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => void aplicarMoraClick(c, Number.parseFloat(moraTasa) || 1)}>
                            Aplicar mora
                          </Button>
                        </div>
                      ))}
                      <Button size="sm" variant="outline" className="w-full" onClick={() => { const rr = enviarCobranzaFI(m.unidadId); if (!rr.ok) setError(rr.error ?? ""); else setOkMsg(`Gestión de cobranza enviada a ${m.ref}.`) }}>
                        <IconSend className="size-3.5 mr-1" /> Enviar gestión de cobranza
                      </Button>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={formFondo !== null} onOpenChange={open => !open && setFormFondo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editandoFondoId ? "Editar fondo" : "Nuevo fondo"}</DialogTitle>
            <DialogDescription>Los egresos y cobros se imputan a estos fondos (cajas).</DialogDescription>
          </DialogHeader>
          {formFondo && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="fondo-nombre">Nombre</Label>
                <Input id="fondo-nombre" value={formFondo.nombre} onChange={ev => setFormFondo({ ...formFondo, nombre: ev.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fondo-tipo">Tipo</Label>
                  <Select value={formFondo.tipo} onValueChange={v => setFormFondo({ ...formFondo, tipo: v as TipoFondoFI })}>
                    <SelectTrigger id="fondo-tipo" aria-label="Tipo de fondo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TIPO_FONDO_LABEL) as TipoFondoFI[]).map(t => (
                        <SelectItem key={t} value={t}>{TIPO_FONDO_LABEL[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {formFondo.tipo === "reserva" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="fondo-aporte">% Aporte al emitir GC</Label>
                    <Input id="fondo-aporte" value={formFondo.porcentajeAporte} onChange={ev => setFormFondo({ ...formFondo, porcentajeAporte: ev.target.value })} placeholder="5" />
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fondo-desc">Descripción</Label>
                <Input id="fondo-desc" value={formFondo.descripcion} onChange={ev => setFormFondo({ ...formFondo, descripcion: ev.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fondo-saldo-inicial">Saldo de apertura (opcional, $)</Label>
                <Input id="fondo-saldo-inicial" value={formFondo.saldoInicial} onChange={ev => setFormFondo({ ...formFondo, saldoInicial: ev.target.value })} placeholder="0" />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="fondo-activo" checked={formFondo.activo} onCheckedChange={v => setFormFondo({ ...formFondo, activo: v })} />
                <Label htmlFor="fondo-activo">Fondo activo</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormFondo(null)}>Cancelar</Button>
            <Button onClick={guardarFondo}><IconWallet className="size-4 mr-1" /> Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={formEgreso !== null} onOpenChange={open => !open && setFormEgreso(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar gasto</DialogTitle>
            <DialogDescription>El dinero sale siempre desde un fondo (imputación obligatoria).</DialogDescription>
          </DialogHeader>
          {formEgreso && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="egr-fecha">Fecha</Label>
                  <Input id="egr-fecha" type="date" value={formEgreso.fecha} onChange={ev => setFormEgreso({ ...formEgreso, fecha: ev.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="egr-monto">Monto ($)</Label>
                  <Input id="egr-monto" value={formEgreso.monto} onChange={ev => setFormEgreso({ ...formEgreso, monto: ev.target.value })} placeholder="120000" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="egr-desc">Descripción</Label>
                <Input id="egr-desc" value={formEgreso.descripcion} onChange={ev => setFormEgreso({ ...formEgreso, descripcion: ev.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="egr-categoria">Categoría</Label>
                  <Select value={formEgreso.categoria} onValueChange={v => setFormEgreso({ ...formEgreso, categoria: v as CategoriaEgresoFI })}>
                    <SelectTrigger id="egr-categoria" aria-label="Categoría del gasto"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CATEGORIA_EGRESO_LABEL) as CategoriaEgresoFI[]).map(c => (
                        <SelectItem key={c} value={c}>{CATEGORIA_EGRESO_LABEL[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="egr-fondo">Fondo de imputación</Label>
                  <Select value={formEgreso.fondoId} onValueChange={v => setFormEgreso({ ...formEgreso, fondoId: v })}>
                    <SelectTrigger id="egr-fondo" aria-label="Fondo de imputación del gasto"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {fondos.filter(f => f.activo).map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="egr-comp-url">Comprobante (URL D1)</Label>
                  <Input id="egr-comp-url" value={formEgreso.comprobanteUrl} onChange={ev => setFormEgreso({ ...formEgreso, comprobanteUrl: ev.target.value })} placeholder="https://…" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="egr-comp-nom">Nombre comprobante</Label>
                  <Input id="egr-comp-nom" value={formEgreso.comprobanteNombre} onChange={ev => setFormEgreso({ ...formEgreso, comprobanteNombre: ev.target.value })} placeholder="boleta-123.pdf" />
                </div>
              </div>
              <div className="grid grid-cols-2 items-center gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="egr-prov">Proveedor (opcional)</Label>
                  <Input id="egr-prov" value={formEgreso.proveedor} onChange={ev => setFormEgreso({ ...formEgreso, proveedor: ev.target.value })} />
                </div>
                <div className="mt-5 flex items-center gap-2">
                  <Switch id="egr-rec" checked={formEgreso.esRecurrente} onCheckedChange={v => setFormEgreso({ ...formEgreso, esRecurrente: v })} />
                  <Label htmlFor="egr-rec">Gasto recurrente/fijo</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormEgreso(null)}>Cancelar</Button>
            <Button onClick={guardarEgreso}>Registrar gasto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={formIngreso !== null} onOpenChange={open => !open && setFormIngreso(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar ingreso a fondo</DialogTitle>
            <DialogDescription>El dinero entra directo al fondo sin origen en cobros.</DialogDescription>
          </DialogHeader>
          {formIngreso && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ing-fecha">Fecha</Label>
                  <Input id="ing-fecha" type="date" value={formIngreso.fecha} onChange={ev => setFormIngreso({ ...formIngreso, fecha: ev.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ing-monto">Monto ($)</Label>
                  <Input id="ing-monto" value={formIngreso.monto} onChange={ev => setFormIngreso({ ...formIngreso, monto: ev.target.value })} placeholder="50000" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ing-concepto">Concepto</Label>
                <Input id="ing-concepto" value={formIngreso.concepto} onChange={ev => setFormIngreso({ ...formIngreso, concepto: ev.target.value })} placeholder="Aporte extraordinario" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ing-fondo">Fondo de destino</Label>
                  <Select value={formIngreso.fondoId} onValueChange={v => setFormIngreso({ ...formIngreso, fondoId: v })}>
                    <SelectTrigger id="ing-fondo" aria-label="Fondo de destino del ingreso"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {fondos.filter(f => f.activo).map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ing-familia">Familia (opcional)</Label>
                  <Input id="ing-familia" value={formIngreso.familia} onChange={ev => setFormIngreso({ ...formIngreso, familia: ev.target.value })} placeholder="Contribuciones" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormIngreso(null)}>Cancelar</Button>
            <Button onClick={guardarIngreso}>Registrar ingreso</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
