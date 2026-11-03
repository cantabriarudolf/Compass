"use client"

/**
 * Panel del calendario preventivo — superficie de gestión del administrador.
 *
 * Nació dentro de `/operaciones/proveedores`, mezclado con el catálogo de
 * empresas; el owner pidió separarlo ("mantenciones ... debe volar de ahí y
 * estar en un panel que lo maneje el administrador"). La lectura y las
 * mutaciones son las mismas del módulo PE (`lib/api/use-pe.ts` →
 * `/api/pe/mantenciones`): acá no hay capa de fetch nueva ni cambio de esquema.
 *
 * Reglas que se conservan del panel original:
 * - La alerta sale de `alertasMantencionesVencidas` (mantención activa y dentro
 *   de `alertaDiasAntes`), el mismo criterio del resumen del dashboard, así que
 *   los dos badges dicen lo mismo.
 * - No se elimina una mantención con visitas técnicas asociadas (paridad con la
 *   regla legacy que el catálogo de proveedores ya aplicaba).
 */
import * as React from "react"
import { generarId } from "@/lib/id-utils"
import {
  useMantencionesPE,
  useProveedoresPE,
  useVisitasTecnicasPE,
} from "@/lib/api/use-pe"
import { hoyISO } from "@/lib/date-utils"
import { alertasMantencionesVencidas } from "@/lib/personal-utils"
import { VerMas } from "@/components/ver-mas"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Switch } from "@workspace/ui/components/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  IconCalendarRepeat,
  IconPlus,
  IconPencil,
  IconPower,
  IconTrash,
} from "@tabler/icons-react"

interface FormMantencion {
  proveedorId: string
  descripcion: string
  periodicidadMeses: string
  proximaFecha: string
  alertaDiasAntes: string
  activo: boolean
}

/** Días que faltan para `fecha` (negativo = vencida), medidos en día calendario. */
function diasHasta(fecha: string, hoy: string): number {
  return Math.round(
    (new Date(`${fecha}T00:00:00`).getTime() -
      new Date(`${hoy}T00:00:00`).getTime()) /
      86400000
  )
}

export function PanelMantenciones() {
  const {
    items: mantenciones,
    total,
    isLoading: cargandoMantenciones,
    error: errorMantenciones,
    cargarMas,
    cargandoMas,
    create: crearMantencion,
    update: actualizarMantencion,
    remove: eliminarMantencion,
  } = useMantencionesPE()
  const { items: proveedores, isLoading: cargandoProveedores } = useProveedoresPE()
  const { items: visitasTecnicas } = useVisitasTecnicasPE()

  const hoy = hoyISO()
  const [form, setForm] = React.useState<FormMantencion | null>(null)
  const [editandoId, setEditandoId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)

  const cargando = cargandoMantenciones || cargandoProveedores
  const alertas = alertasMantencionesVencidas(mantenciones, hoy)

  const nombreProveedor = React.useCallback(
    (proveedorId: string) =>
      proveedores.find((p) => p.id === proveedorId)?.nombre ?? proveedorId,
    [proveedores]
  )

  const ordenadas = React.useMemo(
    () => [...mantenciones].sort((a, b) => a.proximaFecha.localeCompare(b.proximaFecha)),
    [mantenciones]
  )

  const abrirNueva = () => {
    setEditandoId(null)
    setError(null)
    setOkMsg(null)
    setForm({
      proveedorId: proveedores.find((p) => p.activo)?.id ?? "",
      descripcion: "",
      periodicidadMeses: "6",
      proximaFecha: hoy,
      alertaDiasAntes: "5",
      activo: true,
    })
  }

  const abrirEdicion = (id: string) => {
    const mantencion = mantenciones.find((m) => m.id === id)
    if (!mantencion) return
    setEditandoId(id)
    setError(null)
    setOkMsg(null)
    setForm({
      proveedorId: mantencion.proveedorId,
      descripcion: mantencion.descripcion,
      periodicidadMeses: String(mantencion.periodicidadMeses),
      proximaFecha: mantencion.proximaFecha,
      alertaDiasAntes: String(mantencion.alertaDiasAntes),
      activo: mantencion.activo,
    })
  }

  const guardar = async () => {
    if (!form) return
    if (!form.proveedorId || !form.descripcion.trim() || !form.proximaFecha) {
      setError("Proveedor, descripción y próxima fecha son obligatorios.")
      return
    }
    const periodicidad = Math.max(1, Math.trunc(Number(form.periodicidadMeses)) || 1)
    const alertaTexto = form.alertaDiasAntes.trim()
    const alertaDiasAntes =
      alertaTexto === "" ? 5 : Math.max(0, Math.trunc(Number(alertaTexto)) || 0)
    const datos = {
      proveedorId: form.proveedorId,
      descripcion: form.descripcion.trim(),
      periodicidadMeses: periodicidad,
      proximaFecha: form.proximaFecha,
      alertaDiasAntes,
      activo: form.activo,
    }
    const resultado = editandoId
      ? await actualizarMantencion(editandoId, datos)
      : await crearMantencion({ id: generarId("mant"), ...datos })
    if (!resultado.ok) {
      setError(resultado.error ?? "No se pudo guardar la mantención.")
      return
    }
    setForm(null)
    setEditandoId(null)
    setError(null)
    setOkMsg(
      editandoId
        ? "Mantención actualizada."
        : "Mantención agregada al calendario preventivo."
    )
  }

  const alternarActiva = async (id: string, activo: boolean) => {
    const resultado = await actualizarMantencion(id, { activo: !activo })
    if (!resultado.ok) {
      setError(resultado.error ?? "No se pudo cambiar el estado de la mantención.")
      return
    }
    setError(null)
    setOkMsg(activo ? "Mantención desactivada." : "Mantención activada.")
  }

  const eliminar = async (id: string, descripcion: string) => {
    const vinculadas = visitasTecnicas.filter((v) => v.mantencionId === id).length
    if (vinculadas > 0) {
      setError(
        `No se puede eliminar la mantención: ${vinculadas} visita(s) técnica(s) asociadas.`
      )
      return
    }
    const resultado = await eliminarMantencion(id)
    if (!resultado.ok) {
      setError(resultado.error ?? "No se pudo eliminar la mantención.")
      return
    }
    if (editandoId === id) {
      setEditandoId(null)
      setForm(null)
    }
    setError(null)
    setOkMsg(`Mantención «${descripcion}» eliminada.`)
  }

  if (cargando) {
    return (
      <div className="flex min-h-[60vh] animate-pulse flex-col gap-4">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-64 w-full rounded-lg bg-muted" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <IconCalendarRepeat className="size-7" /> Mantenciones Preventivas
          </h1>
          <p className="text-muted-foreground">
            Calendario preventivo de la comunidad: servicios recurrentes, próxima
            fecha y ventana de aviso.
          </p>
        </div>
        <Button onClick={abrirNueva}>
          <IconPlus className="mr-1 size-4" /> Nueva mantención
        </Button>
      </header>

      {errorMantenciones && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          No se pudo leer el calendario preventivo: {errorMantenciones.message}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {okMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {okMsg}
        </div>
      )}

      {alertas.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>Alertas de mantención:</strong>{" "}
          {alertas
            .map(
              (a) =>
                `${a.mantencion.descripcion}${
                  a.diasRestantes < 0
                    ? ` (vencida hace ${Math.abs(a.diasRestantes)} días)`
                    : ` vence en ${a.diasRestantes} día(s)`
                }`
            )
            .join(" · ")}
        </div>
      )}

      {/* El formulario aparece al crear/editar: con el panel cerrado la tabla
          ocupa el ancho completo (sin una columna vacía de 400px). */}
      <div className={form ? "grid gap-4 lg:grid-cols-[400px_1fr]" : "grid gap-4"}>
        {form && (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>
                {editandoId ? "Editar mantención" : "Nueva mantención"}
              </CardTitle>
              <CardDescription>
                Servicio recurrente con aviso automático antes del vencimiento.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Proveedor *</Label>
                <Select
                  value={form.proveedorId || undefined}
                  onValueChange={(v) => setForm((f) => (f ? { ...f, proveedorId: v } : f))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {proveedores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.activo ? p.nombre : `${p.nombre} (inactivo)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {proveedores.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sin proveedores registrados: cargá el catálogo en Operaciones →
                    Proveedores y Servicios.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mt-descripcion">Descripción *</Label>
                <Input
                  id="mt-descripcion"
                  value={form.descripcion}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, descripcion: e.target.value } : f))
                  }
                  placeholder="Ej.: Mantención de ascensores"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mt-periodicidad">Periodicidad (meses)</Label>
                  <Input
                    id="mt-periodicidad"
                    type="number"
                    min={1}
                    value={form.periodicidadMeses}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, periodicidadMeses: e.target.value } : f))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mt-proxima">Próxima fecha *</Label>
                  <Input
                    id="mt-proxima"
                    type="date"
                    value={form.proximaFecha}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, proximaFecha: e.target.value } : f))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mt-aviso">Aviso (días antes)</Label>
                  <Input
                    id="mt-aviso"
                    type="number"
                    min={0}
                    value={form.alertaDiasAntes}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, alertaDiasAntes: e.target.value } : f))
                    }
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.activo}
                  onCheckedChange={(v) => setForm((f) => (f ? { ...f, activo: v } : f))}
                />
                Activa
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setForm(null)
                    setEditandoId(null)
                  }}
                >
                  Cancelar
                </Button>
                <Button onClick={guardar}>Guardar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Calendario preventivo</CardTitle>
            <CardDescription>
              {mantenciones.length} mantención(es) registradas, ordenadas por próxima
              fecha.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {mantenciones.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Sin mantenciones programadas.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Servicio</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Ciclo</TableHead>
                    <TableHead>Próxima</TableHead>
                    <TableHead>Aviso</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordenadas.map((m) => {
                    const dias = diasHasta(m.proximaFecha, hoy)
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.descripcion}</TableCell>
                        <TableCell>{nombreProveedor(m.proveedorId)}</TableCell>
                        <TableCell>Cada {m.periodicidadMeses} mes(es)</TableCell>
                        <TableCell className="font-mono">
                          {m.proximaFecha}
                          {m.activo && dias <= m.alertaDiasAntes ? (
                            <Badge variant="destructive" className="ml-2">
                              {dias < 0 ? `Vencida ${Math.abs(dias)}d` : `${dias}d`}
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.alertaDiasAntes} día(s) antes
                        </TableCell>
                        <TableCell>
                          <Badge variant={m.activo ? "secondary" : "outline"}>
                            {m.activo ? "Activa" : "Inactiva"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Editar ${m.descripcion}`}
                              onClick={() => abrirEdicion(m.id)}
                            >
                              <IconPencil className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={
                                m.activo
                                  ? `Desactivar ${m.descripcion}`
                                  : `Activar ${m.descripcion}`
                              }
                              onClick={() => alternarActiva(m.id, m.activo)}
                            >
                              <IconPower className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Eliminar ${m.descripcion}`}
                              onClick={() => eliminar(m.id, m.descripcion)}
                            >
                              <IconTrash className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
            <div className="px-3">
              <VerMas
                mostrados={mantenciones.length}
                total={total}
                cargando={cargandoMas}
                onCargarMas={cargarMas}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
