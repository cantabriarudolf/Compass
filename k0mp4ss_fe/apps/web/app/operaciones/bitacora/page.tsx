"use client"

import * as React from "react"
import { useCompassStore, useStoreRehydrated } from "@/lib/store"
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
  IconBook2,
  IconClipboardText,
  IconShieldCheck,
  IconPencil,
} from "@tabler/icons-react"
import {
  checklistEquipamientoBase,
  checklistInstalacionesParaJornada,
  estadoReporteDiario,
} from "@/lib/personal-utils"
import { VisitasPanel } from "@/components/pe/visitas-panel"
import { ContratistasPanel } from "@/components/pe/contratistas-panel"
import { EncomiendasPanel } from "@/components/pe/encomiendas-panel"

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function BitacoraPage() {
  useStoreRehydrated()
  const hasHydrated = useCompassStore((s) => s.hasHydrated)
  const personas = useCompassStore((s) => s.personas)
  const maestros = useCompassStore((s) => s.maestros)
  const visitas = useCompassStore((s) => s.bitacoraVisitasPE)
  const encomiendas = useCompassStore((s) => s.encomiendasPE)
  const ingresosContratistas = useCompassStore((s) => s.ingresosContratistasPE)
  const cierresTurnoPE = useCompassStore((s) => s.cierresTurnoPE)
  const cerrarTurnoPE = useCompassStore((s) => s.cerrarTurnoPE)
  const editarCierreTurnoPE = useCompassStore((s) => s.editarCierreTurnoPE)

  const [error, setError] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)
  const [diaReporte, setDiaReporte] = React.useState(hoyISO())
  const [formCierre, setFormCierre] = React.useState({
    trabajadorPersonaId: "",
    jornadaReportadaId: "j-manana",
    fecha: hoyISO(),
    hora: new Date().toTimeString().slice(0, 5),
    novedadesGenerales: "",
    huboIncidencias: true,
    descripcionIncidencias: "",
    evidenciaUrl: "",
    instalaciones: checklistInstalacionesParaJornada("j-manana"),
    equipamiento: checklistEquipamientoBase(),
  })
  const [editandoCierre, setEditandoCierre] = React.useState<{
    id: string
    resumen: string
    novedadesGenerales: string
  } | null>(null)

  const personal = personas.filter(
    (p) => p.datosLaborales !== undefined && p.estadoCuenta === "activa"
  )
  const jornadas = maestros.jornadas
  const estadoDia = estadoReporteDiario(cierresTurnoPE, diaReporte)
  const visitasDelDia = (fecha: string) =>
    visitas.filter((v) => v.fecha === fecha)
  const encomiendasDelDia = (fecha: string) =>
    encomiendas.filter((e) => e.fechaRecepcion === fecha)
  const contratistasDelDia = (fecha: string) =>
    ingresosContratistas.filter((i) => i.fecha === fecha)

  const nombrePersona = (id?: string) => {
    if (!id) return "—"
    const p = personas.find((x) => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }

  // Anti-negligencia UX: al marcar NO en incidencias se ocultan los campos.
  const toggleIncidencias = (hubo: boolean) =>
    setFormCierre((f) => ({ ...f, huboIncidencias: hubo }))

  const enviarCierre = () => {
    if (!formCierre.trabajadorPersonaId) {
      setError("Identifique al trabajador que cierra el turno.")
      return
    }
    const incidencias = {
      hubo: formCierre.huboIncidencias,
      descripcion: formCierre.huboIncidencias
        ? formCierre.descripcionIncidencias.trim()
        : undefined,
      evidencias:
        formCierre.huboIncidencias && formCierre.evidenciaUrl.trim()
          ? [
              {
                nombre: `evidencia-cierre-${Date.now()}.jpg`,
                tipoMime: "image/jpeg",
                tamanoKB: 150,
                url: formCierre.evidenciaUrl.trim(),
              },
            ]
          : [],
    }
    const r = cerrarTurnoPE({
      fecha: formCierre.fecha,
      hora: formCierre.hora,
      jornadaReportadaId: formCierre.jornadaReportadaId,
      trabajadorPersonaId: formCierre.trabajadorPersonaId,
      novedadesGenerales: formCierre.novedadesGenerales.trim() || undefined,
      incidencias,
      checklistInstalaciones: formCierre.instalaciones,
      checklistEquipamiento: formCierre.equipamiento,
    })
    if (!r.ok) {
      setError(r.error ?? "No se pudo enviar el cierre de turno.")
      return
    }
    setError(null)
    setOkMsg(
      "Cierre enviado: notificación a administración y copia al trabajador."
    )
    setFormCierre((f) => ({
      ...f,
      novedadesGenerales: "",
      descripcionIncidencias: "",
      evidenciaUrl: "",
    }))
  }

  const aplicarEdicionCierre = () => {
    if (!editandoCierre) return
    const r = editarCierreTurnoPE(
      editandoCierre.id,
      { novedadesGenerales: editandoCierre.novedadesGenerales },
      editandoCierre.resumen
    )
    if (!r.ok) {
      setError(r.error ?? "No se pudo editar el cierre.")
      return
    }
    setEditandoCierre(null)
    setOkMsg("Cierre editado con registro histórico.")
  }

  if (!hasHydrated) {
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
          <IconBook2 className="size-6" /> Bitácora Digital de Conserjería
        </h1>
        <p className="text-sm text-muted-foreground">
          Libro de novedades auditable: accesos, logística y reportes
          obligatorios.
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

      <Tabs defaultValue="reporte">
        <TabsList>
          <TabsTrigger value="reporte">Reporte Diario</TabsTrigger>
          <TabsTrigger value="visitas">Visitas</TabsTrigger>
          <TabsTrigger value="encomiendas">Encomiendas</TabsTrigger>
          <TabsTrigger value="contratistas">Contratistas</TabsTrigger>
          <TabsTrigger value="cierre">Cierre de Turno</TabsTrigger>
        </TabsList>

        {/* --- Dashboard operativo --- */}
        <TabsContent value="reporte" className="mt-4 flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dia-reporte">Día consultado</Label>
              <Input
                id="dia-reporte"
                type="date"
                value={diaReporte}
                onChange={(e) => setDiaReporte(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {jornadas.map((j) => (
              <Card key={j.id}>
                <CardHeader className="pb-2">
                  <CardDescription>Jornada {j.nombre}</CardDescription>
                  <CardTitle
                    className={
                      estadoDia[j.id]
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400"
                    }
                  >
                    {estadoDia[j.id] ? "Informado" : "No Informado"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {
                    cierresTurnoPE.filter(
                      (c) =>
                        c.fecha === diaReporte && c.jornadaReportadaId === j.id
                    ).length
                  }{" "}
                  cierre(s)
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Visitas</CardDescription>
                <CardTitle>
                  {
                    visitasDelDia(diaReporte).filter(
                      (v) => v.estado === "ingresada"
                    ).length
                  }
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {
                    visitasDelDia(diaReporte).filter(
                      (v) => v.estado === "agendada"
                    ).length
                  }{" "}
                  pre-agendadas pendientes
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Encomiendas</CardDescription>
                <CardTitle>{encomiendasDelDia(diaReporte).length}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {
                    encomiendasDelDia(diaReporte).filter(
                      (e) => e.estado === "recibida"
                    ).length
                  }{" "}
                  sin retirar
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Contratistas</CardDescription>
                <CardTitle>
                  {
                    contratistasDelDia(diaReporte).filter(
                      (c) => c.estado === "ingresado"
                    ).length
                  }
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {
                    contratistasDelDia(diaReporte).filter(
                      (c) => c.estado === "agendado"
                    ).length
                  }{" "}
                  agendados
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* --- Control de visitas (extraído) --- */}
        <TabsContent value="visitas" className="mt-4">
          <VisitasPanel
            diaReporte={diaReporte}
            onError={setError}
            onSuccess={setOkMsg}
          />
        </TabsContent>

        {/* --- Encomiendas (extraído) --- */}
        <TabsContent value="encomiendas" className="mt-4">
          <EncomiendasPanel
            diaReporte={diaReporte}
            onError={setError}
            onSuccess={setOkMsg}
          />
        </TabsContent>

        {/* --- Contratistas (extraído) --- */}
        <TabsContent value="contratistas" className="mt-4">
          <ContratistasPanel
            diaReporte={diaReporte}
            onError={setError}
            onSuccess={setOkMsg}
          />
        </TabsContent>

        {/* --- Protocolo de cierre de turno --- */}
        <TabsContent
          value="cierre"
          className="mt-4 grid gap-4 lg:grid-cols-[520px_1fr]"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconShieldCheck className="size-5" /> Reporte Obligatorio de
                Turno
              </CardTitle>
              <CardDescription>
                Anti-negligencia: las preguntas críticas llegan en
                &quot;SÍ&quot;; cambiar a &quot;NO&quot; oculta los campos.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Trabajador *</Label>
                  <Select
                    value={formCierre.trabajadorPersonaId || undefined}
                    onValueChange={(v) =>
                      setFormCierre({ ...formCierre, trabajadorPersonaId: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {personal.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nombreCompleto} — {p.datosLaborales!.cargo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Jornada reportada (editable por reemplazo)</Label>
                  <Select
                    value={formCierre.jornadaReportadaId}
                    onValueChange={(v) =>
                      setFormCierre({
                        ...formCierre,
                        jornadaReportadaId: v,
                        instalaciones: checklistInstalacionesParaJornada(v),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {jornadas.map((j) => (
                        <SelectItem key={j.id} value={j.id}>
                          {j.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ci-fecha">Fecha</Label>
                  <Input
                    id="ci-fecha"
                    type="date"
                    value={formCierre.fecha}
                    onChange={(e) =>
                      setFormCierre({ ...formCierre, fecha: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ci-hora">Hora</Label>
                  <Input
                    id="ci-hora"
                    type="time"
                    value={formCierre.hora}
                    onChange={(e) =>
                      setFormCierre({ ...formCierre, hora: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ci-nov">Novedades generales</Label>
                <Input
                  id="ci-nov"
                  value={formCierre.novedadesGenerales}
                  onChange={(e) =>
                    setFormCierre({
                      ...formCierre,
                      novedadesGenerales: e.target.value,
                    })
                  }
                  placeholder="Resumen libre del turno"
                />
              </div>

              <div className="rounded-lg border p-3">
                <label className="flex items-center justify-between text-sm font-medium">
                  ¿Existieron incidencias o emergencias?
                  <span className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="incidencias"
                        checked={formCierre.huboIncidencias}
                        onChange={() => toggleIncidencias(true)}
                      />{" "}
                      SÍ
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="incidencias"
                        checked={!formCierre.huboIncidencias}
                        onChange={() => toggleIncidencias(false)}
                      />{" "}
                      NO
                    </label>
                  </span>
                </label>
                {formCierre.huboIncidencias && (
                  <div className="mt-2 flex flex-col gap-2">
                    <Input
                      value={formCierre.descripcionIncidencias}
                      onChange={(e) =>
                        setFormCierre({
                          ...formCierre,
                          descripcionIncidencias: e.target.value,
                        })
                      }
                      placeholder="Describa lo ocurrido (mínimo 20 caracteres) *"
                    />
                    <Input
                      value={formCierre.evidenciaUrl}
                      onChange={(e) =>
                        setFormCierre({
                          ...formCierre,
                          evidenciaUrl: e.target.value,
                        })
                      }
                      placeholder="URL de evidencia (D1) *"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">
                  Estado de instalaciones (según jornada reportada)
                </p>
                <ul className="flex flex-col gap-1.5">
                  {formCierre.instalaciones.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>{item.item}</span>
                      <Button
                        size="sm"
                        variant={item.ok ? "default" : "outline"}
                        onClick={() =>
                          setFormCierre((f) => ({
                            ...f,
                            instalaciones: f.instalaciones.map((x, xi) =>
                              xi === idx ? { ...x, ok: !x.ok } : x
                            ),
                          }))
                        }
                      >
                        {item.ok ? "OK" : "Revisar"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">
                  Estado de equipamiento (ronda a ronda)
                </p>
                <ul className="flex flex-col gap-1.5">
                  {formCierre.equipamiento.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>{item.item}</span>
                      <Button
                        size="sm"
                        variant={item.ok ? "default" : "outline"}
                        onClick={() =>
                          setFormCierre((f) => ({
                            ...f,
                            equipamiento: f.equipamiento.map((x, xi) =>
                              xi === idx ? { ...x, ok: !x.ok } : x
                            ),
                          }))
                        }
                      >
                        {item.ok ? "OK" : "Revisar"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
              <Button onClick={enviarCierre}>
                <IconClipboardText className="mr-1 size-4" /> Enviar cierre de
                turno
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cierres registrados ({diaReporte})</CardTitle>
              <CardDescription>
                El sistema notificó a administración y envió copia al correo del
                trabajador.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {cierresTurnoPE.filter((c) => c.fecha === diaReporte).length ===
                0 && (
                <p className="text-sm text-muted-foreground">
                  Sin cierres para esta fecha.
                </p>
              )}
              {cierresTurnoPE
                .filter((c) => c.fecha === diaReporte)
                .map((c) => (
                  <div key={c.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {nombrePersona(c.trabajadorPersonaId)} · Jornada{" "}
                          {
                            jornadas.find((j) => j.id === c.jornadaReportadaId)
                              ?.nombre
                          }
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.fecha} {c.hora}
                        </p>
                      </div>
                      <Badge
                        variant={c.incidencias.hubo ? "destructive" : "outline"}
                      >
                        {c.incidencias.hubo
                          ? "Con incidencias"
                          : "Sin incidencias"}
                      </Badge>
                    </div>
                    {c.novedadesGenerales && (
                      <p className="mt-1 text-muted-foreground">
                        {c.novedadesGenerales}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {c.checklistInstalaciones.map((it, i) => (
                        <span
                          key={`i${i}`}
                          className={
                            it.ok
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground"
                          }
                        >
                          {it.ok ? "✓" : "○"} {it.item}
                        </span>
                      ))}
                      {c.checklistEquipamiento.map((it, i) => (
                        <span
                          key={`e${i}`}
                          className={
                            it.ok
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground"
                          }
                        >
                          {it.ok ? "✓" : "○"} {it.item}
                        </span>
                      ))}
                    </div>
                    {c.historialCambios.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs underline">
                          Historial de cambios ({c.historialCambios.length})
                        </summary>
                        <ul className="mt-1 text-xs text-muted-foreground">
                          {c.historialCambios.map((h, i) => (
                            <li key={i}>
                              {h.fecha}: {h.resumen}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1"
                      onClick={() =>
                        setEditandoCierre({
                          id: c.id,
                          resumen: "",
                          novedadesGenerales: c.novedadesGenerales ?? "",
                        })
                      }
                    >
                      <IconPencil className="mr-1 size-4" /> Editar
                    </Button>
                  </div>
                ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogo edición cierre */}
      <Dialog
        open={!!editandoCierre}
        onOpenChange={(open) => !open && setEditandoCierre(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar cierre de turno</DialogTitle>
            <DialogDescription>
              Toda edición queda en el historial de cambios del reporte.
            </DialogDescription>
          </DialogHeader>
          {editandoCierre && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ed-nov">Novedades generales</Label>
                <Input
                  id="ed-nov"
                  value={editandoCierre.novedadesGenerales}
                  onChange={(e) =>
                    setEditandoCierre({
                      ...editandoCierre,
                      novedadesGenerales: e.target.value,
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ed-res">Resumen del cambio *</Label>
                <Input
                  id="ed-res"
                  value={editandoCierre.resumen}
                  onChange={(e) =>
                    setEditandoCierre({
                      ...editandoCierre,
                      resumen: e.target.value,
                    })
                  }
                  placeholder="Qué se corrigió y por qué"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditandoCierre(null)}>
              Cancelar
            </Button>
            <Button onClick={aplicarEdicionCierre}>Guardar edición</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
