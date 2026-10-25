"use client"

import * as React from "react"
import { useCompassStore } from "@/lib/store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
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
import { IconCheck, IconQrcode, IconSearch, IconTrash } from "@tabler/icons-react"
import { EscaneoQrCedula } from "@/components/pe/escaneo-qr-cedula"
import { SelectorBuscable, type Opcion } from "@/components/selector-buscable"
import { buscarPersonaPorRun, buscarPersonas } from "@/lib/api/use-personas"
import { buscarUnidades } from "@/lib/api/use-unidades"
import { esUnidadDestino, etiquetaUnidad } from "@/lib/unidades-destino"
import { mascararRun, normalizarRun, validarRun } from "@/lib/validacion-rut"
import type { BitacoraVisitaPE } from "@/lib/schemas"

/** Etiqueta legible del vínculo persona↔unidad (VU). */
const ETIQUETA_VINCULO: Record<string, string> = {
  propietario: "Propietario",
  arrendatario: "Arrendatario",
  copropietario: "Copropietario",
  ocupante: "Ocupante",
}

/** Persona del padrón que corresponde al RUN leído de la cédula. */
interface CoincidenciaPadron {
  personaId: string
  run: string
  nombre: string
  unidad: string
  vinculo: string
  unidadId?: string
}

/**
 * Resultado de identificar una cédula. Escanear NUNCA registra la visita: deja
 * este resultado a la espera de la confirmación explícita del conserje, que es
 * la única que completa el formulario.
 */
type ResultadoIdentidad =
  | { tipo: "padron"; coincidencia: CoincidenciaPadron }
  | { tipo: "sin_coincidencia"; run: string }

interface FormVisita {
  nombre: string
  dni: string
  patente: string
  unidadId: string
  destinoPersonaId: string
  jornadaId: string
  origenAgenda: "pre_agendada" | "sin_aviso"
  notas: string
}

export function VisitasPanel({
  diaReporte,
  onError,
  onSuccess,
}: {
  diaReporte: string
  onError: (msg: string | null) => void
  onSuccess: (msg: string | null) => void
}) {
  const unidades = useCompassStore((s) => s.unidades)
  const personas = useCompassStore((s) => s.personas)
  const maestros = useCompassStore((s) => s.maestros)
  const visitas = useCompassStore((s) => s.bitacoraVisitasPE)
  const saveBitacoraVisitaPE = useCompassStore((s) => s.saveBitacoraVisitaPE)
  const ingresarBitacoraVisitaPE = useCompassStore((s) => s.ingresarBitacoraVisitaPE)
  const removeBitacoraVisitaPE = useCompassStore((s) => s.removeBitacoraVisitaPE)
  const vinculos = useCompassStore((s) => s.vinculos)

  const [formVisita, setFormVisita] = React.useState<FormVisita>({
    nombre: "",
    dni: "",
    patente: "",
    unidadId: "",
    destinoPersonaId: "",
    jornadaId: "j-manana",
    origenAgenda: "sin_aviso",
    notas: "",
  })

  const jornadas = maestros.jornadas

  // Identificación por cédula: el escaneo o la búsqueda manual SOLO proponen
  // datos; la visita se sigue registrando con el botón de abajo.
  const [escanerAbierto, setEscanerAbierto] = React.useState(false)
  const [resultadoIdentidad, setResultadoIdentidad] = React.useState<ResultadoIdentidad | null>(null)
  const [buscandoIdentidad, setBuscandoIdentidad] = React.useState(false)
  const [avisoPadron, setAvisoPadron] = React.useState<string | null>(null)
  /**
   * Etiquetas de las unidades elegidas en esta sesión. La búsqueda trae unidades de la BD que
   * el padrón del store no tiene, y la tabla del día tiene que mostrar «Depto 101 · 123-A11»
   * en vez del id crudo.
   */
  const [etiquetasUnidad, setEtiquetasUnidad] = React.useState<Record<string, string>>({})
  const recordarUnidad = React.useCallback((id: string, etiqueta: string) => {
    setEtiquetasUnidad((previas) => ({ ...previas, [id]: etiqueta }))
  }, [])

  /** Etiquetas de las personas elegidas en esta sesión (la búsqueda trae personas de la BD). */
  const [etiquetasPersona, setEtiquetasPersona] = React.useState<Record<string, string>>({})
  const recordarPersona = React.useCallback((id: string, etiqueta: string) => {
    setEtiquetasPersona((previas) => ({ ...previas, [id]: etiqueta }))
  }, [])

  /** Etiqueta conocida de una unidad: la elegida en esta sesión o el padrón del store. */
  const etiquetaDeUnidad = (id?: string): string | undefined => {
    if (!id) return undefined
    const recordada = etiquetasUnidad[id]
    if (recordada) return recordada
    const u = unidades.find((x) => x.id === id)
    return u ? etiquetaUnidad(u) : undefined
  }

  const refUnidad = (id?: string) => {
    if (!id) return "—"
    return etiquetaDeUnidad(id) ?? id
  }

  /** Selección desde la búsqueda del servidor: guarda la etiqueta que el usuario vio. */
  const alElegirUnidad = (opcion: Opcion | null) => {
    if (!opcion) {
      setFormVisita((f) => ({ ...f, unidadId: "" }))
      return
    }
    recordarUnidad(opcion.id, opcion.etiqueta)
    setFormVisita((f) => ({ ...f, unidadId: opcion.id }))
  }

  const nombrePersona = (id?: string) => {
    if (!id) return "—"
    const recordado = etiquetasPersona[id]
    if (recordado) return recordado
    const p = personas.find((x) => x.id === id)
    return p ? `${p.nombres} ${p.apellidos}` : id
  }

  /** Selección desde la búsqueda del servidor: guarda el nombre que el usuario vio. */
  const alElegirPersona = (opcion: Opcion | null) => {
    if (!opcion) {
      setFormVisita((f) => ({ ...f, destinoPersonaId: "" }))
      return
    }
    recordarPersona(opcion.id, opcion.etiqueta)
    setFormVisita((f) => ({ ...f, destinoPersonaId: opcion.id }))
  }

  /** Unidad y vínculo vigente de la persona, resueltos contra el padrón cargado. */
  const resolverCoincidencia = (personaId: string, nombre: string, run: string): CoincidenciaPadron => {
    const vinculo = vinculos.find((v) => v.personaId === personaId && !v.fechaFin)
    const unidad = vinculo ? unidades.find((u) => u.id === vinculo.unidadId) : undefined
    // Solo se preselecciona una unidad que pueda ser destino: una plaza de estacionamiento no
    // lo es. Si el padrón del store no tiene la unidad, se preselecciona igual — el vínculo es
    // la fuente, y la etiqueta se aprende al confirmar la identidad.
    const seleccionable =
      vinculo && (!unidad || esUnidadDestino(unidad)) ? vinculo.unidadId : undefined
    return {
      personaId,
      run,
      nombre,
      unidad: unidad ? etiquetaUnidad(unidad) : "Sin unidad registrada",
      vinculo: vinculo ? (ETIQUETA_VINCULO[vinculo.rol] ?? vinculo.rol) : "Sin vínculo vigente",
      unidadId: seleccionable,
    }
  }

  /**
   * Busca el RUN en el padrón de la comunidad: primero el servidor (scoping de
   * comunidad en la ruta) y, si no responde, el padrón local para no bloquear
   * la operación. Sin coincidencia se ofrece el alta como visita externa.
   */
  const buscarEnPadron = async (run: string) => {
    setBuscandoIdentidad(true)
    setAvisoPadron(null)
    try {
      const remoto = await buscarPersonaPorRun(run)
      if (remoto) {
        setResultadoIdentidad({
          tipo: "padron",
          coincidencia: resolverCoincidencia(remoto.id, remoto.nombreCompleto, run),
        })
        return
      }
    } catch {
      setAvisoPadron("No se pudo consultar el padrón del servidor; se buscó en el padrón local.")
    } finally {
      setBuscandoIdentidad(false)
    }

    const local = personas.find((p) => normalizarRun(p.rut) === run)
    if (local) {
      const nombre = `${local.nombres} ${local.apellidos}`.trim() || local.nombreCompleto
      setResultadoIdentidad({ tipo: "padron", coincidencia: resolverCoincidencia(local.id, nombre, run) })
      return
    }
    setResultadoIdentidad({ tipo: "sin_coincidencia", run })
  }

  /** RUN validado por el escáner: cierra la cámara y propone la identidad. */
  const manejarRunDetectado = (run: string) => {
    setEscanerAbierto(false)
    void buscarEnPadron(run)
  }

  /** Búsqueda manual por RUT: el fallback de la cédula vieja o sin cámara. */
  const buscarRunManual = () => {
    const canonico = normalizarRun(formVisita.dni)
    if (!canonico) {
      onError(
        "La búsqueda en el padrón es por RUT. Si el documento es un pasaporte, escribe el nombre y la unidad y registra la visita."
      )
      return
    }
    if (!validarRun(canonico)) {
      onError("Ese RUT no pasa la validación del dígito verificador. Revísalo antes de buscar.")
      return
    }
    onError(null)
    void buscarEnPadron(canonico)
  }

  /** Confirmación explícita: completa el formulario, no registra la visita. */
  const confirmarIdentidad = () => {
    if (resultadoIdentidad?.tipo !== "padron") return
    const coincidencia = resultadoIdentidad.coincidencia
    recordarPersona(coincidencia.personaId, coincidencia.nombre)
    if (coincidencia.unidadId && coincidencia.unidad !== "Sin unidad registrada") {
      recordarUnidad(coincidencia.unidadId, coincidencia.unidad)
    }
    setFormVisita((f) => ({
      ...f,
      nombre: coincidencia.nombre,
      dni: coincidencia.run,
      unidadId: coincidencia.unidadId ?? f.unidadId,
      destinoPersonaId: coincidencia.personaId,
    }))
    setResultadoIdentidad(null)
    setAvisoPadron(null)
    onError(null)
    onSuccess("Identidad confirmada desde la cédula. Registra la visita para dejarla en la bitácora.")
  }

  /** Confirmación para el visitante que no está en el padrón (visita externa). */
  const confirmarVisitaExterna = () => {
    if (resultadoIdentidad?.tipo !== "sin_coincidencia") return
    const run = resultadoIdentidad.run
    setFormVisita((f) => ({ ...f, dni: run }))
    setResultadoIdentidad(null)
    setAvisoPadron(null)
    onError(null)
    onSuccess("RUT leído aplicado como visita externa. Escribe el nombre y registra la visita.")
  }

  const guardarVisita = () => {
    if (!formVisita.nombre.trim() || !formVisita.dni.trim()) {
      onError("Nombre y DNI de la visita son obligatorios.")
      return
    }
    if (!formVisita.unidadId && !formVisita.destinoPersonaId) {
      onError("Indique la unidad o el residente destino.")
      return
    }
    const esAgendada = formVisita.origenAgenda === "pre_agendada"
    const visita: BitacoraVisitaPE = {
      id: `pe-vis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fecha: diaReporte,
      nombre: formVisita.nombre.trim(),
      dni: formVisita.dni.trim(),
      patente: formVisita.patente.trim() || undefined,
      unidadId: formVisita.unidadId || undefined,
      destinoPersonaId: formVisita.destinoPersonaId || undefined,
      jornadaId: formVisita.jornadaId,
      origenAgenda: formVisita.origenAgenda,
      agendadaPorPersonaId: undefined,
      estado: esAgendada ? "agendada" : "ingresada",
      notas: formVisita.notas.trim() || undefined,
    }
    const r = saveBitacoraVisitaPE(visita)
    if (!r.ok) {
      onError(r.error ?? "No se pudo registrar la visita.")
      return
    }
    setFormVisita({ ...formVisita, nombre: "", dni: "", patente: "", notas: "" })
    onError(null)
    onSuccess(esAgendada ? "Visita pre-agendada a la espera del ingreso." : "Visita registrada e ingresada.")
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            Registro de visita
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setResultadoIdentidad(null)
                setEscanerAbierto(true)
              }}
            >
              <IconQrcode className="mr-1 size-4" /> Escanear QR de la cédula
            </Button>
          </CardTitle>
          <CardDescription>Pre-agendamiento o llegada sin aviso. * obligatorios.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {escanerAbierto ? (
            <EscaneoQrCedula
              onDetectado={manejarRunDetectado}
              onError={onError}
              onCancelar={() => setEscanerAbierto(false)}
            />
          ) : null}

          {avisoPadron ? (
            <p className="text-xs text-muted-foreground" role="status">
              {avisoPadron}
            </p>
          ) : null}

          {buscandoIdentidad ? (
            <p className="text-sm text-muted-foreground" role="status">
              Buscando el RUT en el padrón de la comunidad…
            </p>
          ) : null}

          {resultadoIdentidad ? (
            <div
              role="region"
              aria-label="Resultado del escaneo"
              className="flex flex-col gap-2 rounded-md border border-dashed p-3"
            >
              {resultadoIdentidad.tipo === "padron" ? (
                <>
                  <p className="text-sm font-medium">Coincidencia en el padrón</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Nombre</dt>
                    <dd>{resultadoIdentidad.coincidencia.nombre}</dd>
                    <dt className="text-muted-foreground">RUT</dt>
                    <dd>{mascararRun(resultadoIdentidad.coincidencia.run) ?? resultadoIdentidad.coincidencia.run}</dd>
                    <dt className="text-muted-foreground">Unidad</dt>
                    <dd>{resultadoIdentidad.coincidencia.unidad}</dd>
                    <dt className="text-muted-foreground">Vínculo</dt>
                    <dd>{resultadoIdentidad.coincidencia.vinculo}</dd>
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    Confirmar solo completa el formulario: la visita queda registrada recién con «Registrar visita».
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={confirmarIdentidad}>
                      <IconCheck className="mr-1 size-4" /> Confirmar identidad
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setResultadoIdentidad(null)}>
                      Descartar
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Sin coincidencia en el padrón</p>
                  <p className="text-sm">
                    No hay nadie registrado con el RUT {mascararRun(resultadoIdentidad.run) ?? resultadoIdentidad.run}. Puedes
                    registrar la visita como externa.
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={confirmarVisitaExterna}>
                      Usar el RUT leído (visita externa)
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setResultadoIdentidad(null)}>
                      Descartar
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Acepta el QR del anverso de la cédula nueva (electrónica). Si la cédula es antigua, no tiene QR o la cámara no está
            disponible, escribe el RUT y usa «Buscar en el padrón»: nunca se bloquea el registro.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-nombre">Nombre *</Label>
              <Input id="v-nombre" value={formVisita.nombre} onChange={(e) => setFormVisita({ ...formVisita, nombre: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-dni">DNI *</Label>
              <Input id="v-dni" value={formVisita.dni} onChange={(e) => setFormVisita({ ...formVisita, dni: e.target.value })} />
              <Button type="button" size="sm" variant="ghost" className="justify-start px-0" onClick={buscarRunManual}>
                <IconSearch className="mr-1 size-4" /> Buscar en el padrón
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-patente">Patente</Label>
              <Input id="v-patente" value={formVisita.patente} onChange={(e) => setFormVisita({ ...formVisita, patente: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Jornada</Label>
              <Select value={formVisita.jornadaId} onValueChange={(v) => setFormVisita({ ...formVisita, jornadaId: v })}>
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
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectorBuscable
              etiqueta="Unidad destino"
              valorId={formVisita.unidadId}
              valorEtiqueta={etiquetaDeUnidad(formVisita.unidadId)}
              onSeleccionar={alElegirUnidad}
              buscar={buscarUnidades}
              placeholder="Número, etiqueta o rol SII…"
              vacio="Ninguna unidad coincide. Revisá el número o el rol SII."
            />
            <SelectorBuscable
              etiqueta="Residente destino"
              valorId={formVisita.destinoPersonaId}
              valorEtiqueta={
                formVisita.destinoPersonaId
                  ? etiquetasPersona[formVisita.destinoPersonaId] ??
                    personas.find((p) => p.id === formVisita.destinoPersonaId)?.nombreCompleto
                  : undefined
              }
              onSeleccionar={alElegirPersona}
              buscar={buscarPersonas}
              placeholder="Nombre o RUT del residente…"
              vacio="Ninguna persona coincide. Revisá el nombre o el RUT."
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={formVisita.origenAgenda === "pre_agendada"}
              onCheckedChange={(v) => setFormVisita({ ...formVisita, origenAgenda: v ? "pre_agendada" : "sin_aviso" })}
            />
            Pre-agendada (espera confirmación de ingreso)
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="v-notas">Notas</Label>
            <Input id="v-notas" value={formVisita.notas} onChange={(e) => setFormVisita({ ...formVisita, notas: e.target.value })} />
          </div>
          <Button onClick={guardarVisita}>
            <IconCheck className="mr-1 size-4" /> Registrar visita
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Control del día seleccionado ({diaReporte})</CardTitle>
          <CardDescription>Las visitas agendadas se sellan al llegar.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {visitas.filter((v) => v.fecha === diaReporte).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Sin visitas registradas para esta fecha.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3">Nombre</th>
                  <th className="p-3">Destino</th>
                  <th className="p-3">Jornada</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {visitas
                  .filter((v) => v.fecha === diaReporte)
                  .map((v) => (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="p-3">
                        {v.nombre}
                        <span className="block text-xs text-muted-foreground">
                          {v.dni}
                          {v.patente ? ` · ${v.patente}` : ""}
                        </span>
                      </td>
                      <td className="p-3">
                        {refUnidad(v.unidadId)}
                        {v.destinoPersonaId ? <span className="block text-xs text-muted-foreground">{nombrePersona(v.destinoPersonaId)}</span> : null}
                      </td>
                      <td className="p-3">{jornadas.find((j) => j.id === v.jornadaId)?.nombre ?? "—"}</td>
                      <td className="p-3">
                        {v.estado === "ingresada" ? (
                          <Badge variant="outline">Ingresada {v.horaIngreso}</Badge>
                        ) : v.estado === "agendada" ? (
                          <Badge variant="secondary">Agendada</Badge>
                        ) : (
                          <Badge variant="destructive">Cancelada</Badge>
                        )}
                      </td>
                      <td className="p-3 flex gap-1">
                        {v.estado === "agendada" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const r = ingresarBitacoraVisitaPE(v.id)
                              if (!r.ok) onError(r.error ?? "")
                              else onSuccess(`Visita ${v.nombre} ingresada.`)
                            }}
                          >
                            Marcar Ingresada
                          </Button>
                        )}
                        {v.estado !== "ingresada" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              const r = removeBitacoraVisitaPE(v.id)
                              if (!r.ok) onError(r.error ?? "")
                            }}
                          >
                            <IconTrash className="size-4" />
                          </Button>
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
