"use client"

import * as React from "react"
import { generarId } from "@/lib/id-utils"
import { formatearRut, validarDocumentoIdentidad, claveDocumento } from "@/lib/rut"
import { aTituloCaso, emailNormalizado, telefonoNormalizado, sitioNormalizado } from "@/lib/normalizacion"
// Datos de dominio vía API REST (BD fuente de verdad); store legacy deprecado.
import { usePersonas } from "@/lib/api/use-personas"
import { useUnidades } from "@/lib/api/use-unidades"
import { useMaestros } from "@/lib/api/use-maestros"
import {
  useProveedoresPE,
  useMantencionesPE,
  useVisitasTecnicasPE,
} from "@/lib/api/use-pe"
import { hoyISO } from "@/lib/date-utils"
import { proximaFechaPreventiva } from "@/lib/personal-utils"
import type { ContactoEmergencia } from "@/lib/schemas"
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
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
  IconBuildingFactory2,
  IconCalendarRepeat,
  IconClipboardList,
  IconPhoneCall,
  IconPlus,
  IconPencil,
  IconTrash,
  IconExternalLink,
} from "@tabler/icons-react"
import type { VisitaTecnicaPE } from "@/lib/schemas"
import { alertasMantencionesVencidas } from "@/lib/personal-utils"

interface FormProveedor {
  rut: string
  nombre: string
  rubro: string
  contacto: string
  telefono: string
  email: string
  sitioWeb: string
  activo: boolean
}

const PROVEEDOR_VACIO: FormProveedor = {
  rut: "",
  nombre: "",
  rubro: "",
  contacto: "",
  telefono: "",
  email: "",
  sitioWeb: "",
  activo: true,
}

export default function ProveedoresPage() {
  const { personas, isLoading: cPersonas } = usePersonas()
  const { items: unidades, isLoading: cUnidades } = useUnidades()
  const { data: contactosEmergencia, isLoading: cContactos } = useMaestros<ContactoEmergencia>("contactos-emergencia")
  const {
    items: proveedores,
    isLoading: cProveedores,
    create: crearProveedorApi,
    remove: eliminarProveedorApi,
  } = useProveedoresPE()
  const {
    items: mantenciones,
    isLoading: cMantenciones,
    create: crearMantencionApi,
    update: actualizarMantencionApi,
    remove: eliminarMantencionApi,
  } = useMantencionesPE()
  const {
    items: visitasTecnicas,
    isLoading: cVisitasTec,
    create: crearVisitaTecnicaApi,
  } = useVisitasTecnicasPE()
  const cargandoAPI = cPersonas || cUnidades || cContactos || cProveedores || cMantenciones || cVisitasTec

  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)
  const [formProv, setFormProv] = React.useState<FormProveedor | null>(null)
  const [rutProvTocado, setRutProvTocado] = React.useState(false)

  const [editandoProvId, setEditandoProvId] = React.useState<string | null>(
    null
  )
  const rutProv = formProv?.rut.trim() ?? ""
  const rutProvValido = rutProv === "" || validarDocumentoIdentidad(rutProv)
  const rutProvDuplicado =
    rutProv !== "" &&
    proveedores.some(
      (p) =>
        p.id !== (editandoProvId ?? "") &&
        claveDocumento(p.rut) !== "" &&
        claveDocumento(p.rut) === claveDocumento(rutProv)
    )
  const [formMant, setFormMant] = React.useState<{
    proveedorId: string
    descripcion: string
    periodicidadMeses: string
    proximaFecha: string
    alertaDiasAntes: string
    activo: boolean
  } | null>(null)
  const [editandoMantId, setEditandoMantId] = React.useState<string | null>(
    null
  )
  const [formVisita, setFormVisita] = React.useState<{
    proveedorId: string
    mantencionId: string
    tecnicoNombre: string
    fecha: string
    trabajoRealizado: string
    supervisorPersonaId: string
    unidadId: string
  } | null>(null)

  const hoy = hoyISO()
  const alertas = alertasMantencionesVencidas(mantenciones, hoy)

  const guardarProveedor = async () => {
    if (!formProv) return
    if (
      !formProv.nombre.trim() ||
      !formProv.rut.trim() ||
      !formProv.rubro.trim()
    ) {
      setError("RUT, nombre y rubro son obligatorios.")
      return
    }
    setRutProvTocado(true)
    if (!validarDocumentoIdentidad(formProv.rut.trim())) {
      setError("RUT de empresa inválido: revisá el dígito verificador.")
      return
    }
    if (rutProvDuplicado) {
      setError("Este RUT ya está registrado en otro proveedor.")
      return
    }
    const r = await crearProveedorApi({
      id: editandoProvId ?? generarId("prov"),
      rut: formatearRut(formProv.rut.trim()),
      nombre: aTituloCaso(formProv.nombre),
      rubro: aTituloCaso(formProv.rubro),
      contacto: formProv.contacto.trim() === "" ? undefined : aTituloCaso(formProv.contacto),
      telefono: formProv.telefono.trim() === "" ? undefined : telefonoNormalizado(formProv.telefono),
      email: emailNormalizado(formProv.email),
      sitioWeb: sitioNormalizado(formProv.sitioWeb),
      activo: formProv.activo,
    })
    if (!r.ok) {
      setError(r.error ?? "No se pudo guardar el proveedor.")
      return
    }
    setFormProv(null)
    setEditandoProvId(null)
    setError(null)
    setOkMsg("Proveedor guardado.")
  }

  const guardarMantencion = async () => {
    if (!formMant) return
    if (
      !formMant.proveedorId ||
      !formMant.descripcion.trim() ||
      !formMant.proximaFecha
    ) {
      setError("Proveedor, descripción y próxima fecha son obligatorios.")
      return
    }
    const r = await crearMantencionApi({
      id: editandoMantId ?? generarId("mant"),
      proveedorId: formMant.proveedorId,
      descripcion: formMant.descripcion.trim(),
      periodicidadMeses: Math.max(1, Number(formMant.periodicidadMeses) || 1),
      proximaFecha: formMant.proximaFecha,
      alertaDiasAntes: Math.max(0, Number(formMant.alertaDiasAntes) || 5),
      activo: formMant.activo,
    })
    if (!r.ok) {
      setError(r.error ?? "No se pudo guardar la mantención.")
      return
    }
    setFormMant(null)
    setEditandoMantId(null)
    setError(null)
    setOkMsg("Calendario preventivo actualizado.")
  }

  const guardarVisitaTecnica = async () => {
    if (!formVisita) return
    if (
      !formVisita.proveedorId ||
      !formVisita.tecnicoNombre.trim() ||
      !formVisita.fecha ||
      formVisita.trabajoRealizado.trim().length < 5
    ) {
      setError(
        "Proveedor, técnico, fecha y trabajo realizado (mínimo 5 caracteres) son obligatorios."
      )
      return
    }
    const visita: VisitaTecnicaPE = {
      id: generarId("vt"),
      proveedorId: formVisita.proveedorId,
      mantencionId: formVisita.mantencionId || undefined,
      tecnicoNombre: formVisita.tecnicoNombre.trim(),
      fecha: formVisita.fecha,
      trabajoRealizado: formVisita.trabajoRealizado.trim(),
      supervisorPersonaId: formVisita.supervisorPersonaId || undefined,
      unidadId: formVisita.unidadId || undefined,
    }
    const r = await crearVisitaTecnicaApi(visita)
    if (!r.ok) {
      setError(r.error ?? "No se pudo registrar la visita técnica.")
      return
    }
    // Ciclo preventivo cerrado: la próxima fecha avanza según periodicidad (paridad con la acción legacy).
    if (visita.mantencionId) {
      const mantencion = mantenciones.find((m) => m.id === visita.mantencionId)
      if (mantencion) {
    const proxima = proximaFechaPreventiva(visita.fecha, mantencion.periodicidadMeses)
    await actualizarMantencionApi(mantencion.id, { proximaFecha: proxima })
      }
    }
    setFormVisita(null)
    setError(null)
    setOkMsg("Visita técnica registrada en el libro (PE_VISITA_TECNICA).")
  }

  if (cargandoAPI) {
    return (
      <div className="flex min-h-[60vh] animate-pulse flex-col gap-4">
        <div className="h-9 w-72 rounded bg-muted/40" />
        <div className="h-64 w-full rounded-lg bg-muted" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <IconBuildingFactory2 className="size-6" /> Proveedores y Servicios
        </h1>
        <p className="text-sm text-muted-foreground">
          Empresas de mantenimiento externo, mantenciones preventivas y
          directorio de emergencias.
        </p>
      </header>

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
                `${a.mantencion.descripcion}${a.diasRestantes < 0 ? ` (vencida hace ${Math.abs(a.diasRestantes)} días)` : ` vence en ${a.diasRestantes} día(s)`}`
            )
            .join(" · ")}
        </div>
      )}

      <Tabs defaultValue="catalogo">
        <TabsList>
          <TabsTrigger value="catalogo">
            Catálogo ({proveedores.length})
          </TabsTrigger>
          <TabsTrigger value="mantenciones">
            Mantenciones ({mantenciones.length})
          </TabsTrigger>
          <TabsTrigger value="visitas">
            Visitas Técnicas ({visitasTecnicas.length})
          </TabsTrigger>
          <TabsTrigger value="emergencias">Directorio Emergencias</TabsTrigger>
        </TabsList>

        <TabsContent value="catalogo" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Catálogo de Proveedores</CardTitle>
                <CardDescription>
                  Contacto y RUT de las empresas de servicios.
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setFormProv({ ...PROVEEDOR_VACIO })
                  setEditandoProvId(null)
                }}
              >
                <IconPlus className="mr-1 size-4" /> Nuevo
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {proveedores.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Sin proveedores registrados.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-3">Empresa</th>
                      <th className="p-3">RUT</th>
                      <th className="p-3">Rubro</th>
                      <th className="p-3">Contacto</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {proveedores.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="p-3">
                          {p.nombre}
                          {!p.activo && (
                            <Badge variant="secondary" className="ml-2">
                              Inactivo
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 font-mono">{p.rut}</td>
                        <td className="p-3">{p.rubro}</td>
                        <td className="p-3">
                          {p.contacto ?? "—"}
                          {p.telefono ? (
                            <span className="block text-xs text-muted-foreground">
                              {p.telefono}
                            </span>
                          ) : null}
                        </td>
                        <td className="flex gap-1 p-3">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setFormProv({
                                rut: p.rut,
                                nombre: p.nombre,
                                rubro: p.rubro,
                                contacto: p.contacto ?? "",
                                telefono: p.telefono ?? "",
                                email: p.email ?? "",
                                sitioWeb: p.sitioWeb ?? "",
                                activo: p.activo,
                              })
                              setEditandoProvId(p.id)
                            }}
                          >
                            <IconPencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                                onClick={async () => {
                                  // Paridad con la regla legacy: no se elimina un proveedor con mantenciones o visitas asociadas.
                                  const mant = mantenciones.filter((m) => m.proveedorId === p.id).length
                                  const vis = visitasTecnicas.filter((v) => v.proveedorId === p.id).length
                                  if (mant > 0 || vis > 0) {
                                    setError(`No se puede eliminar el proveedor: ${mant} mantención(es) y ${vis} visita(s) técnica(s) asociadas.`)
                                    return
                                  }
                                  const r = await eliminarProveedorApi(p.id)
                                  if (!r.ok) setError(r.error ?? "")
                                  else setOkMsg("Proveedor eliminado.")
                                }}
                          >
                            <IconTrash className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="mantenciones"
          className="mt-4 grid gap-4 lg:grid-cols-[420px_1fr]"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <IconCalendarRepeat className="size-5" /> Preventivo
                </span>
              </CardTitle>
              <CardDescription>
                Servicios recurrentes con alerta automática.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Proveedor *</Label>
                <Select
                  value={formMant?.proveedorId || undefined}
                  onValueChange={(v) =>
                    setFormMant((f) => (f ? { ...f, proveedorId: v } : f))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {proveedores
                      .filter((p) => p.activo)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nombre}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mt-desc">Descripción *</Label>
                <Input
                  id="mt-desc"
                  value={formMant?.descripcion ?? ""}
                  onChange={(e) =>
                    setFormMant((f) =>
                      f ? { ...f, descripcion: e.target.value } : f
                    )
                  }
                  placeholder="Ej.: Mantención de ascensores"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mt-per">Periodicidad (meses)</Label>
                  <Input
                    id="mt-per"
                    type="number"
                    min={1}
                    value={formMant?.periodicidadMeses ?? ""}
                    onChange={(e) =>
                      setFormMant((f) =>
                        f ? { ...f, periodicidadMeses: e.target.value } : f
                      )
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mt-prox">Próxima fecha *</Label>
                  <Input
                    id="mt-prox"
                    type="date"
                    value={formMant?.proximaFecha ?? ""}
                    onChange={(e) =>
                      setFormMant((f) =>
                        f ? { ...f, proximaFecha: e.target.value } : f
                      )
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="mt-alert">Alerta (días antes)</Label>
                  <Input
                    id="mt-alert"
                    type="number"
                    min={0}
                    value={formMant?.alertaDiasAntes ?? "5"}
                    onChange={(e) =>
                      setFormMant((f) =>
                        f ? { ...f, alertaDiasAntes: e.target.value } : f
                      )
                    }
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={formMant?.activo ?? true}
                    onCheckedChange={(v) =>
                      setFormMant((f) => (f ? { ...f, activo: v } : f))
                    }
                  />{" "}
                  Activa
                </label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setFormMant(null)}
                    disabled={!formMant}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => {
                      setFormMant({
                        proveedorId: "",
                        descripcion: "",
                        periodicidadMeses: "6",
                        proximaFecha: hoy,
                        alertaDiasAntes: "5",
                        activo: true,
                      })
                      setEditandoMantId(null)
                    }}
                  >
                    <IconPlus className="mr-1 size-4" /> Nueva
                  </Button>
                  <Button onClick={guardarMantencion} disabled={!formMant}>
                    Guardar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Calendario preventivo</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {mantenciones.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Sin mantenciones programadas.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-3">Servicio</th>
                      <th className="p-3">Proveedor</th>
                      <th className="p-3">Ciclo</th>
                      <th className="p-3">Próxima</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...mantenciones]
                      .sort((a, b) =>
                        a.proximaFecha.localeCompare(b.proximaFecha)
                      )
                      .map((m) => {
                        const dias = Math.round(
                          (new Date(`${m.proximaFecha}T00:00:00`).getTime() -
                            new Date(`${hoy}T00:00:00`).getTime()) /
                            86400000
                        )
                        return (
                          <tr key={m.id} className="border-b last:border-0">
                            <td className="p-3">{m.descripcion}</td>
                            <td className="p-3">
                              {proveedores.find((p) => p.id === m.proveedorId)
                                ?.nombre ?? m.proveedorId}
                            </td>
                            <td className="p-3">
                              Cada {m.periodicidadMeses} mes(es)
                            </td>
                            <td className="p-3 font-mono">
                              {m.proximaFecha}
                              {dias <= m.alertaDiasAntes ? (
                                <Badge variant="destructive" className="ml-2">
                                  {dias < 0
                                    ? `Vencida ${Math.abs(dias)}d`
                                    : `${dias}d`}
                                </Badge>
                              ) : null}
                            </td>
                            <td className="flex gap-1 p-3">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setFormVisita({
                                    proveedorId: m.proveedorId,
                                    mantencionId: m.id,
                                    tecnicoNombre: "",
                                    fecha: hoy,
                                    trabajoRealizado: "",
                                    supervisorPersonaId: "",
                                    unidadId: "",
                                  })
                                }
                              >
                                Registrar visita
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                    onClick={async () => {
                                      // Paridad con la regla legacy: no se elimina una mantención con visitas técnicas asociadas.
                                      const vinculadas = visitasTecnicas.filter((v) => v.mantencionId === m.id).length
                                      if (vinculadas > 0) {
                                        setError(`No se puede eliminar la mantención: ${vinculadas} visita(s) técnica(s) asociadas.`)
                                        return
                                      }
                                      const r = await eliminarMantencionApi(m.id)
                                      if (!r.ok) setError(r.error ?? "")
                                      else setOkMsg("Mantención eliminada.")
                                    }}
                              >
                                <IconTrash className="size-4" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visitas" className="mt-4 flex flex-col gap-4">
          {formVisita && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Libro de Visitas Técnicas — nuevo registro
                </CardTitle>
                <CardDescription>
                  Qué hizo el técnico y quién lo supervisó.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Proveedor *</Label>
                    <Select
                      value={formVisita.proveedorId || undefined}
                      onValueChange={(v) =>
                        setFormVisita((f) => (f ? { ...f, proveedorId: v } : f))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {proveedores.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Mantención vinculada</Label>
                    <Select
                      value={formVisita.mantencionId || "__none"}
                      onValueChange={(v) =>
                        setFormVisita((f) =>
                          f
                            ? { ...f, mantencionId: v === "__none" ? "" : v }
                            : f
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Ninguna" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Visita puntual</SelectItem>
                        {mantenciones
                          .filter(
                            (m) => m.proveedorId === formVisita.proveedorId
                          )
                          .map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.descripcion}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Técnico *</Label>
                    <Input
                      value={formVisita.tecnicoNombre}
                      onChange={(e) =>
                        setFormVisita((f) =>
                          f ? { ...f, tecnicoNombre: e.target.value } : f
                        )
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Fecha *</Label>
                    <Input
                      type="date"
                      value={formVisita.fecha}
                      onChange={(e) =>
                        setFormVisita((f) =>
                          f ? { ...f, fecha: e.target.value } : f
                        )
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Supervisado por</Label>
                    <Select
                      value={formVisita.supervisorPersonaId || "__none"}
                      onValueChange={(v) =>
                        setFormVisita((f) =>
                          f
                            ? {
                                ...f,
                                supervisorPersonaId: v === "__none" ? "" : v,
                              }
                            : f
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sin supervisor</SelectItem>
                        {personas.slice(0, 100).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nombreCompleto}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Unidad / ubicación</Label>
                    <Select
                      value={formVisita.unidadId || "__none"}
                      onValueChange={(v) =>
                        setFormVisita((f) =>
                          f ? { ...f, unidadId: v === "__none" ? "" : v } : f
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Áreas comunes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Áreas comunes</SelectItem>
                        {unidades
                          .filter((u) => !u.id.startsWith("u-E-"))
                          .slice(0, 100)
                          .map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.etiqueta} {u.numero}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vt-trab">Trabajo realizado *</Label>
                  <Input
                    id="vt-trab"
                    value={formVisita.trabajoRealizado}
                    onChange={(e) =>
                      setFormVisita((f) =>
                        f ? { ...f, trabajoRealizado: e.target.value } : f
                      )
                    }
                    placeholder="Detalle de la intervención"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={guardarVisitaTecnica}>
                    <IconClipboardList className="mr-1 size-4" /> Registrar en
                    el libro
                  </Button>
                  <Button variant="outline" onClick={() => setFormVisita(null)}>
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {!formVisita && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Libro de Visitas Técnicas</CardTitle>
                  <CardDescription>
                    Registro digital de cada ingreso técnico a la comunidad.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    setFormVisita({
                      proveedorId: proveedores[0]?.id ?? "",
                      mantencionId: "",
                      tecnicoNombre: "",
                      fecha: hoy,
                      trabajoRealizado: "",
                      supervisorPersonaId: "",
                      unidadId: "",
                    })
                  }
                >
                  <IconPlus className="mr-1 size-4" /> Nueva visita
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {visitasTecnicas.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Sin visitas técnicas registradas.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-3">Fecha</th>
                        <th className="p-3">Proveedor</th>
                        <th className="p-3">Técnico</th>
                        <th className="p-3">Trabajo</th>
                        <th className="p-3">Supervisor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...visitasTecnicas]
                        .sort((a, b) => b.fecha.localeCompare(a.fecha))
                        .map((v) => (
                          <tr key={v.id} className="border-b last:border-0">
                            <td className="p-3 font-mono">{v.fecha}</td>
                            <td className="p-3">
                              {proveedores.find((p) => p.id === v.proveedorId)
                                ?.nombre ?? v.proveedorId}
                            </td>
                            <td className="p-3">{v.tecnicoNombre}</td>
                            <td className="max-w-[280px] p-3">
                              {v.trabajoRealizado}
                            </td>
                            <td className="p-3">
                              {personas.find(
                                (p) => p.id === v.supervisorPersonaId
                              )?.nombreCompleto ?? "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="emergencias" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconPhoneCall className="size-5" /> Directorio de Emergencias y
                Utilidad Pública
              </CardTitle>
              <CardDescription>
                Fuente: maestro contactosEmergencia de MA · disponible para
                conserjería y residentes.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              {(["urgencia", "tecnico"] as const).map((categoria) => (
                <section key={categoria}>
                  <h3 className="mb-2 text-sm font-semibold">
                    {categoria === "urgencia"
                      ? "Servicios de Urgencia"
                      : "Servicios Técnicos de Urgencia"}
                  </h3>
                  <ul className="flex flex-col divide-y rounded-lg border">
                    {(contactosEmergencia ?? [])
                      .filter((c) => c.categoria === categoria)
                      .map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span>
                            {c.nombre}
                            <span className="block text-xs text-muted-foreground">
                              {c.sitioWeb ?? "—"}
                            </span>
                          </span>
                          <a
                            href={`tel:${c.telefono.replace(/\s/g, "")}`}
                            className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted"
                          >
                            <Badge variant="outline">{c.telefono}</Badge>
                            <IconExternalLink className="size-3" />
                          </a>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogo proveedor */}
      <Dialog
        open={!!formProv}
        onOpenChange={(open) => !open && setFormProv(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editandoProvId ? "Editar" : "Nuevo"} proveedor
            </DialogTitle>
            <DialogDescription>
              RUT validado con dígito verificador. * obligatorios.
            </DialogDescription>
          </DialogHeader>
          {formProv && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-rut">RUT empresa *</Label>
                <Input
                  id="pv-rut"
                  value={formProv.rut}
                  onChange={(e) => {
                    const v = e.target.value
                    setFormProv({ ...formProv, rut: /^[0-9]/.test(v.trim()) ? formatearRut(v) : v.toUpperCase() })
                    setRutProvTocado(false)
                  }}
                  onBlur={() => setRutProvTocado(true)}
                  placeholder="76.543.210-K"
                  aria-invalid={rutProvTocado && rutProv !== "" && (!rutProvValido || rutProvDuplicado)}
                />
                {rutProvTocado && rutProv !== "" && !rutProvValido && (
                  <p className="text-xs text-destructive font-medium">RUT inválido: revisá el dígito verificador.</p>
                )}
                {rutProvTocado && rutProvValido && rutProvDuplicado && (
                  <p className="text-xs text-destructive font-medium">Este RUT ya está registrado en otro proveedor.</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-nombre">Nombre *</Label>
                <Input
                  id="pv-nombre"
                  value={formProv.nombre}
                  onChange={(e) =>
                    setFormProv({ ...formProv, nombre: e.target.value })
                  }
                  onBlur={() =>
                    setFormProv((f) => (f ? { ...f, nombre: aTituloCaso(f.nombre) } : f))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-rubro">Rubro *</Label>
                <Input
                  id="pv-rubro"
                  value={formProv.rubro}
                  onChange={(e) =>
                    setFormProv({ ...formProv, rubro: e.target.value })
                  }
                  onBlur={() =>
                    setFormProv((f) => (f ? { ...f, rubro: aTituloCaso(f.rubro) } : f))
                  }
                  placeholder="Ascensores / Bombas / CCTV"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-contacto">Contacto</Label>
                <Input
                  id="pv-contacto"
                  value={formProv.contacto}
                  onChange={(e) =>
                    setFormProv({ ...formProv, contacto: e.target.value })
                  }
                  onBlur={() =>
                    setFormProv((f) => (f ? { ...f, contacto: aTituloCaso(f.contacto) } : f))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-tel">Teléfono</Label>
                <Input
                  id="pv-tel"
                  value={formProv.telefono}
                  onChange={(e) =>
                    setFormProv({ ...formProv, telefono: e.target.value })
                  }
                  onBlur={() =>
                    setFormProv((f) => (f ? { ...f, telefono: telefonoNormalizado(f.telefono) } : f))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-email">Email</Label>
                <Input
                  id="pv-email"
                  type="email"
                  value={formProv.email}
                  onChange={(e) =>
                    setFormProv({ ...formProv, email: e.target.value })
                  }
                  onBlur={() =>
                    setFormProv((f) => (f ? { ...f, email: emailNormalizado(f.email) } : f))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="pv-web">Sitio web</Label>
                <Input
                  id="pv-web"
                  value={formProv.sitioWeb}
                  onChange={(e) =>
                    setFormProv({ ...formProv, sitioWeb: e.target.value })
                  }
                  onBlur={() =>
                    setFormProv((f) => (f ? { ...f, sitioWeb: sitioNormalizado(f.sitioWeb) } : f))
                  }
                  placeholder="https://…"
                />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Switch
                  checked={formProv.activo}
                  onCheckedChange={(v) =>
                    setFormProv({ ...formProv, activo: v })
                  }
                />{" "}
                Activo
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormProv(null)}>
              Cancelar
            </Button>
            <Button onClick={guardarProveedor}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
