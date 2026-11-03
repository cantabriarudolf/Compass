"use client"

import * as React from "react"
import { generarId } from "@/lib/id-utils"
import { formatearRut, validarDocumentoIdentidad, claveDocumento } from "@/lib/rut"
import { aTituloCaso, emailNormalizado, telefonoNormalizado, sitioNormalizado } from "@/lib/normalizacion"
// Datos de dominio vía API REST (BD fuente de verdad); store legacy deprecado.
import { usePersonas } from "@/lib/api/use-personas"
import { useUnidades } from "@/lib/api/use-unidades"
import { AvisoTruncamiento, LIMITE_SELECT } from "@/components/pe/aviso-truncamiento"
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
  IconClipboardList,
  IconPhoneCall,
  IconPlus,
  IconPencil,
  IconTrash,
  IconExternalLink,
} from "@tabler/icons-react"
import type { VisitaTecnicaPE } from "@/lib/schemas"

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
  const { personas, isLoading: cPersonas, total: totalPersonas } = usePersonas()
  const { items: unidades, isLoading: cUnidades, total: totalUnidades } = useUnidades()
  const { data: contactosEmergencia, isLoading: cContactos } = useMaestros<ContactoEmergencia>("contactos-emergencia")
  const {
    items: proveedores,
    isLoading: cProveedores,
    create: crearProveedorApi,
    remove: eliminarProveedorApi,
  } = useProveedoresPE()

  // Las mantenciones se leen acá para dos reglas que siguen siendo de este
  // módulo: bloquear la baja de un proveedor con historial y vincular la visita
  // técnica a su ciclo. Su gestión vive en /admin/mantenciones.
  const {
    items: mantenciones,
    isLoading: cMantenciones,
    update: actualizarMantencionApi,
  } = useMantencionesPE()
  const {
    items: visitasTecnicas,
    isLoading: cVisitasTec,
    create: crearVisitaTecnicaApi,
  } = useVisitasTecnicasPE()
  const cargandoAPI = cPersonas || cUnidades || cContactos || cProveedores || cMantenciones || cVisitasTec

  // Selects de personas y unidades: se recortan a LIMITE_SELECT y el recorte se
  // declara en pantalla (saneamiento de truncamientos silenciosos). Acá el
  // recorte no es solo el slice local: `usePersonas` y `useUnidades` piden
  // `pageSize=100` al servidor, así que el `total` de la API es el que manda.
  const unidadesElegibles = unidades.filter((u) => !u.id.startsWith("u-E-"))
  const unidadesVisibles = unidadesElegibles.slice(0, LIMITE_SELECT)
  const personasVisibles = personas.slice(0, LIMITE_SELECT)
  const totalPersonasOpciones = Math.max(totalPersonas, personasVisibles.length)
  // Si el servidor reporta más unidades de las cargadas, se declara su total
  // (cota superior: no se pueden descontar las excluidas que no se cargaron).
  const totalUnidadesOpciones =
    totalUnidades > unidades.length ? totalUnidades : unidadesElegibles.length

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
          Empresas de mantenimiento externo, libro de visitas técnicas y
          directorio de emergencias. Las mantenciones preventivas se administran
          en Administración → Mantenciones Preventivas.
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

      <Tabs defaultValue="catalogo">
        <TabsList>
          <TabsTrigger value="catalogo">
            Catálogo ({proveedores.length})
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
                        {personasVisibles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nombreCompleto}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <AvisoTruncamiento
                      mostrados={personasVisibles.length}
                      total={totalPersonasOpciones}
                    />
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
                        {unidadesVisibles.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.etiqueta} {u.numero}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <AvisoTruncamiento
                      mostrados={unidadesVisibles.length}
                      total={totalUnidadesOpciones}
                    />
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
