"use client"

import * as React from "react"
import { useIngresosContratistasPE, useMaestrosPE } from "@/lib/api/use-pe"
import { nombresDePersonas, usePersonasOperacion } from "@/lib/api/use-personas"
import { etiquetasDeUnidades, useUnidadesOperacion } from "@/lib/api/use-unidades"
import { generarId } from "@/lib/id-utils"
import { esUnidadDestino, etiquetaUnidad } from "@/lib/unidades-destino"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { IconCheck, IconTrash } from "@tabler/icons-react"
import { AvisoTruncamiento, LIMITE_SELECT } from "@/components/pe/aviso-truncamiento"
import type { IngresoContratistaPE } from "@/lib/schemas"

interface FormContratista {
  contratistaId: string
  motivo: string
  unidadId: string
  jornadaId: string
  agendadoPor: "residente" | "administracion"
  personaAgendaId: string
}

/** Hora local HH:MM: es lo que guarda `horaIngreso` del contrato PE. */
function horaActual(): string {
  return new Date().toTimeString().slice(0, 5)
}

export function ContratistasPanel({
  diaReporte,
  onError,
  onSuccess,
}: {
  diaReporte: string
  onError: (msg: string | null) => void
  onSuccess: (msg: string | null) => void
}) {
  // Datos de dominio vía API REST (BD fuente de verdad); el store legacy ya no participa.
  const {
    items: ingresosContratistas,
    isLoading: cargandoIngresos,
    create: crearIngresoApi,
    update: actualizarIngresoApi,
    remove: eliminarIngresoApi,
  } = useIngresosContratistasPE()
  // Los padrones de la operación son las proyecciones `/api/pe/*` (permiso `pe:bitacora`):
  // `/api/personas` y `/api/unidades` están detrás de `mp` y devuelven 403 a conserjería.
  const { personas, total: totalPersonas } = usePersonasOperacion()
  const { unidades, total: totalUnidades } = useUnidadesOperacion()
  const { data: jornadas } = useMaestrosPE("jornadas")
  const { data: contratistas } = useMaestrosPE("contratistas")

  const [formCont, setFormCont] = React.useState<FormContratista>({
    contratistaId: "",
    motivo: "",
    unidadId: "",
    jornadaId: "j-manana",
    agendadoPor: "administracion",
    personaAgendaId: "",
  })

  // Listas de opciones: se recortan a LIMITE_SELECT para no montar cientos de
  // SelectItem, y el recorte se declara en pantalla (nunca en silencio).
  const unidadesDestino = unidades.filter(esUnidadDestino)
  const unidadesVisibles = unidadesDestino.slice(0, LIMITE_SELECT)
  const personasVisibles = personas.slice(0, LIMITE_SELECT)

  /**
   * Etiquetas aprendidas en esta sesión: filas del día cuya unidad o persona quedó fuera de la
   * primera página del padrón (`pageSize=100`) se resuelven contra `?ids=` de las proyecciones
   * (dos peticiones por render como máximo, nunca una por fila) y quedan acá. Mientras llega la
   * respuesta la tabla sigue viéndose con el id: no se bloquea ni se agregan spinners por fila.
   */
  const [etiquetas, setEtiquetas] = React.useState<Record<string, string>>({})
  const idsPedidosRef = React.useRef<Set<string>>(new Set())
  const recordar = React.useCallback((id: string, etiqueta: string) => {
    setEtiquetas((previas) => ({ ...previas, [id]: etiqueta }))
  }, [])
  React.useEffect(() => {
    const filasDia = ingresosContratistas.filter((i) => i.fecha === diaReporte)
    const faltan = new Set<string>()
    for (const i of filasDia) {
      if (i.unidadId && !etiquetas[i.unidadId] && !unidades.some((u) => u.id === i.unidadId)) {
        faltan.add(i.unidadId)
      }
      if (
        i.personaAgendaId &&
        !etiquetas[i.personaAgendaId] &&
        !personas.some((p) => p.id === i.personaAgendaId)
      ) {
        faltan.add(i.personaAgendaId)
      }
    }
    // Cada id se pide una sola vez por sesión, aunque el efecto se re-ejecute (fallos incluidos:
    // si el servidor no responde, la fila sigue mostrando el id, como hasta hoy).
    const pedir = [...faltan].filter((id) => !idsPedidosRef.current.has(id))
    if (pedir.length === 0) return
    for (const id of pedir) idsPedidosRef.current.add(id)

    let vivo = true
    // Unidades y personas viven en rutas distintas: la lista completa va a cada proyección y cada
    // una devuelve las filas que le pertenecen. Nunca es una petición por fila.
    void (async () => {
      const [etiquetasUnidad, nombresPersona] = await Promise.all([
        etiquetasDeUnidades(pedir),
        nombresDePersonas(pedir),
      ])
      if (!vivo) return
      for (const [id, etiqueta] of Object.entries(etiquetasUnidad)) recordar(id, etiqueta)
      for (const [id, nombre] of Object.entries(nombresPersona)) recordar(id, nombre)
    })()
    return () => {
      vivo = false
    }
  }, [ingresosContratistas, diaReporte, unidades, personas, etiquetas, recordar])

  const refUnidad = (id?: string) => {
    if (!id) return "—"
    const recordada = etiquetas[id]
    if (recordada) return recordada
    const u = unidades.find((x) => x.id === id)
    return u ? etiquetaUnidad(u) : id
  }
  const nombrePersona = (id?: string) => {
    if (!id) return "—"
    const recordada = etiquetas[id]
    if (recordada) return recordada
    const p = personas.find((x) => x.id === id)
    return p ? p.nombreCompleto : id
  }
  const nombreContratista = (id: string) =>
    contratistas.find((c) => c.id === id)?.nombre ?? id

  const guardarContratista = async () => {
    if (!formCont.contratistaId) {
      onError("Seleccione la empresa del maestro de contratistas.")
      return
    }
    if (formCont.motivo.trim().length < 5) {
      onError("Se exige detallar el motivo específico del ingreso.")
      return
    }
    const ingreso: IngresoContratistaPE = {
      id: generarId("pe-cont"),
      contratistaId: formCont.contratistaId,
      motivo: formCont.motivo.trim(),
      unidadId: formCont.unidadId || undefined,
      fecha: diaReporte,
      jornadaId: formCont.jornadaId,
      agendadoPor: formCont.agendadoPor,
      personaAgendaId: formCont.agendadoPor === "residente" ? formCont.personaAgendaId || undefined : undefined,
      estado: "agendado",
    }
    const r = await crearIngresoApi(ingreso)
    if (!r.ok) {
      onError(r.error ?? "No se pudo registrar el ingreso.")
      return
    }
    setFormCont({ ...formCont, motivo: "" })
    onError(null)
    onSuccess("Contratista agendado. Conserjería confirma el ingreso al llegar.")
  }

  /** El sello del ingreso es del servidor: acá sólo se envía el estado y la hora. */
  const confirmarIngreso = async (id: string) => {
    const r = await actualizarIngresoApi(id, { estado: "ingresado", horaIngreso: horaActual() })
    if (!r.ok) onError(r.error ?? "")
    else onSuccess("Ingreso de contratista confirmado.")
  }

  const eliminarIngreso = async (id: string) => {
    const r = await eliminarIngresoApi(id)
    if (!r.ok) onError(r.error ?? "")
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Agendamiento de contratista</CardTitle>
          <CardDescription>Residente particular o administración · motivo específico obligatorio.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Empresa (maestro) *</Label>
            <Select value={formCont.contratistaId || undefined} onValueChange={(v) => setFormCont({ ...formCont, contratistaId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {contratistas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ct-motivo">Motivo específico del ingreso *</Label>
            <Input id="ct-motivo" value={formCont.motivo} onChange={(e) => setFormCont({ ...formCont, motivo: e.target.value })} placeholder="Ej.: reparación de fuga en cocina U-201" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Jornada</Label>
              <Select value={formCont.jornadaId} onValueChange={(v) => setFormCont({ ...formCont, jornadaId: v })}>
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
              <Label>Agendado por</Label>
              <Select value={formCont.agendadoPor} onValueChange={(v) => setFormCont({ ...formCont, agendadoPor: v as "residente" | "administracion" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="administracion">Administración</SelectItem>
                  <SelectItem value="residente">Residente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {formCont.agendadoPor === "residente" && (
            <div className="flex flex-col gap-1.5">
              <Label>Residente solicitante</Label>
              <Select value={formCont.personaAgendaId || "__none"} onValueChange={(v) => setFormCont({ ...formCont, personaAgendaId: v === "__none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin identificar</SelectItem>
                  {personasVisibles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombreCompleto}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <AvisoTruncamiento mostrados={personasVisibles.length} total={totalPersonas} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Unidad destino</Label>
            <Select value={formCont.unidadId || "__none"} onValueChange={(v) => setFormCont({ ...formCont, unidadId: v === "__none" ? "" : v })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Áreas comunes</SelectItem>
                {unidadesVisibles.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {etiquetaUnidad(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AvisoTruncamiento mostrados={unidadesVisibles.length} total={totalUnidades} />
          </div>
          <Button onClick={() => void guardarContratista()}>
            <IconCheck className="mr-1 size-4" /> Agendar ingreso
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ingresos del día ({diaReporte})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {cargandoIngresos ? (
            <p className="p-4 text-sm text-muted-foreground" role="status">
              Cargando los ingresos del día…
            </p>
          ) : ingresosContratistas.filter((i) => i.fecha === diaReporte).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Sin contratistas agendados para esta fecha.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Motivo</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {ingresosContratistas
                  .filter((i) => i.fecha === diaReporte)
                  .map((i) => (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="p-3">
                        {nombreContratista(i.contratistaId)}
                        <span className="block text-xs text-muted-foreground">
                          {refUnidad(i.unidadId)} · {jornadas.find((j) => j.id === i.jornadaId)?.nombre}
                        </span>
                      </td>
                      <td className="p-3 max-w-[220px]">
                        {i.motivo}
                        <span className="block text-xs text-muted-foreground">Agendó: {i.agendadoPor === "residente" ? nombrePersona(i.personaAgendaId) : "Administración"}</span>
                      </td>
                      <td className="p-3">
                        {i.estado === "agendado" ? (
                          <Badge variant="secondary">Agendado</Badge>
                        ) : i.estado === "ingresado" ? (
                          <Badge variant="outline">Ingresado {i.horaIngreso}</Badge>
                        ) : (
                          <Badge variant="destructive">Cancelado</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        {i.estado === "agendado" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void confirmarIngreso(i.id)}
                            >
                              Confirmar
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => void eliminarIngreso(i.id)}
                            >
                              <IconTrash className="size-4" />
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
