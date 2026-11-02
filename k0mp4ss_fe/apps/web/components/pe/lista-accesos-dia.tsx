"use client"

/**
 * Lista única del día (PE-conserjería) — T3 de `odd/tasks/acceso-unico.md`.
 *
 * El conserje ve hoy tres tablas separadas (visitas, encomiendas, contratistas)
 * y no puede responder la pregunta que le hace el residente en el teléfono:
 * «¿llegó alguien a mi depto hoy?». Esta lista junta las tres colecciones del
 * día consultado en una sola tabla.
 *
 * Es de SOLO LECTURA: no crea, no edita ni transiciona estados. Registrar y
 * corregir sigue en cada panel (`registro-acceso.tsx` es la puerta única para
 * registrar). Acá no hay botones a propósito.
 *
 * Los datos son los reales de cada modelo, sin campos nuevos:
 * - visita: `horaIngreso`, `nombre`, `unidadId`/`destinoPersonaId`,
 *   `agendadaPorPersonaId` (existe en el contrato, hoy siempre vacío).
 * - encomienda: no registra hora; se usa `createdAt` de la fila como
 *   aproximación y la celda lleva asterisco con nota al pie.
 * - trabajo: `horaIngreso`, empresa del maestro, `unidadId`/`personaAgendaId`,
 *   `agendadoPor` (residente o administración).
 * Lo que no existe en el modelo se muestra «—»: nunca se inventa.
 */
import * as React from "react"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { IconPackage, IconTool, IconUserCheck } from "@tabler/icons-react"
import {
  useBitacoraVisitasPE,
  useEncomiendasPE,
  useIngresosContratistasPE,
  useMaestrosPE,
} from "@/lib/api/use-pe"
import { nombresDePersonas, usePersonasOperacion } from "@/lib/api/use-personas"
import { etiquetasDeUnidades, useUnidadesOperacion } from "@/lib/api/use-unidades"
import { etiquetaUnidad } from "@/lib/unidades-destino"
import type {
  BitacoraVisitaPE,
  EncomiendaPE,
  IngresoContratistaPE,
} from "@/lib/schemas"

/** Qué es lo que llega, con las palabras de la puerta (no las del modelo). */
export type TipoAccesoDia = "visita" | "paquete" | "trabajo"

/** Valor del filtro de la tabla: un tipo o todos. */
export type FiltroAccesoDia = "todos" | TipoAccesoDia

/**
 * Fila normalizada de la lista.
 *
 * `hora` es HH:MM, o «—» cuando el registro no tiene hora. `horaEstimada` marca
 * las horas que NO las registró el modelo y se dedujeron de `createdAt` (hoy,
 * solo las encomiendas): la celda las muestra con asterisco.
 */
export interface FilaAccesoDia {
  id: string
  tipo: TipoAccesoDia
  hora: string
  horaEstimada: boolean
  quienLlega: string
  unidadId?: string
  personaId?: string
  porQuien: string
  estado: string
}

/** Texto de un dato que el modelo no tiene. */
const SIN_DATO = "—"

/** Fila de encomienda tal como la devuelve la API: Prisma agrega `createdAt`. */
type EncomiendaConCreacion = EncomiendaPE & { createdAt?: string }

/** Etiqueta, icono y color de cada tipo. Colores distintos para distinguirlos de un vistazo. */
const TIPO: Record<
  TipoAccesoDia,
  { etiqueta: string; Icono: typeof IconUserCheck; clases: string }
> = {
  visita: {
    etiqueta: "Visita",
    Icono: IconUserCheck,
    clases:
      "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  },
  paquete: {
    etiqueta: "Encomienda",
    Icono: IconPackage,
    clases:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  },
  trabajo: {
    etiqueta: "Trabajo",
    Icono: IconTool,
    clases:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
}

const FILTROS: ReadonlyArray<{ id: FiltroAccesoDia; etiqueta: string }> = [
  { id: "todos", etiqueta: "Todos" },
  { id: "visita", etiqueta: "Visitas" },
  { id: "paquete", etiqueta: "Encomiendas" },
  { id: "trabajo", etiqueta: "Trabajos" },
]

/** Texto legible del estado, en el vocabulario de cada colección. */
const ETIQUETA_ESTADO: Record<TipoAccesoDia, Record<string, string>> = {
  visita: { agendada: "Agendada", ingresada: "Ingresada", cancelada: "Cancelada" },
  paquete: { recibida: "Recibida", retirada: "Retirada" },
  trabajo: { agendado: "Agendado", ingresado: "Ingresado", cancelado: "Cancelado" },
}

/** Mismo peso visual que usan los paneles para el estado. */
function varianteEstado(estado: string): "secondary" | "outline" | "destructive" {
  if (estado === "cancelada" || estado === "cancelado") return "destructive"
  if (estado === "agendada" || estado === "agendado" || estado === "recibida") {
    return "secondary"
  }
  return "outline"
}

/** Hora local HH:MM de un timestamp ISO; `null` si no hay o no es válido. */
function horaDeCreacion(createdAt?: string): string | null {
  if (!createdAt) return null
  const fecha = new Date(createdAt)
  if (Number.isNaN(fecha.getTime())) return null
  return fecha.toTimeString().slice(0, 5)
}

/** Hora descendente; las filas sin hora van al final. */
function compararPorHora(a: FilaAccesoDia, b: FilaAccesoDia): number {
  const aSinHora = a.hora === SIN_DATO
  const bSinHora = b.hora === SIN_DATO
  if (aSinHora && bSinHora) return 0
  if (aSinHora) return 1
  if (bSinHora) return -1
  return b.hora.localeCompare(a.hora)
}

export function ListaAccesosDia({ diaReporte }: { diaReporte: string }) {
  const { items: visitas, isLoading: cargandoVisitas } = useBitacoraVisitasPE()
  const { items: encomiendas, isLoading: cargandoEncomiendas } = useEncomiendasPE()
  const { items: ingresos, isLoading: cargandoIngresos } = useIngresosContratistasPE()
  const { data: couriers } = useMaestrosPE("couriers")
  const { data: contratistas } = useMaestrosPE("contratistas")
  // Mismos padrones de la operación que usan los paneles (proyecciones `/api/pe/*`).
  const { personas } = usePersonasOperacion()
  const { unidades } = useUnidadesOperacion()

  const [filtro, setFiltro] = React.useState<FiltroAccesoDia>("todos")

  /**
   * Etiquetas aprendidas fuera de la primera página del padrón (`pageSize=100`):
   * sin esto una fila del día mostraría el id crudo (`u-A-101`, `p-12`).
   */
  const [etiquetas, setEtiquetas] = React.useState<Record<string, string>>({})
  const recordar = React.useCallback((id: string, etiqueta: string) => {
    setEtiquetas((previas) => (previas[id] ? previas : { ...previas, [id]: etiqueta }))
  }, [])

  const etiquetaDeUnidad = (id?: string): string | undefined => {
    if (!id) return undefined
    const recordada = etiquetas[id]
    if (recordada) return recordada
    const unidad = unidades.find((u) => u.id === id)
    return unidad ? etiquetaUnidad(unidad) : undefined
  }

  const nombreDePersona = (id?: string): string | undefined => {
    if (!id) return undefined
    const recordado = etiquetas[id]
    if (recordado) return recordado
    return personas.find((p) => p.id === id)?.nombreCompleto
  }

  const nombreDeMaestro = (
    maestro: ReadonlyArray<{ id: string; nombre: string }>,
    id: string
  ): string => maestro.find((m) => m.id === id)?.nombre ?? id

  const filasDia = React.useMemo<FilaAccesoDia[]>(() => {
    const deVisita = (v: BitacoraVisitaPE): FilaAccesoDia => ({
      id: v.id,
      tipo: "visita",
      hora: v.horaIngreso ?? SIN_DATO,
      horaEstimada: false,
      quienLlega: v.nombre,
      unidadId: v.unidadId,
      personaId: v.destinoPersonaId,
      // El visitante no avisa a nadie por el modelo: solo la pre-agenda del
      // residente trae a quién. Hoy esa columna llega vacía.
      porQuien: nombreDePersona(v.agendadaPorPersonaId) ?? SIN_DATO,
      estado: v.estado,
    })

    const deEncomienda = (e: EncomiendaPE): FilaAccesoDia => {
      // La encomienda no guarda hora; `createdAt` es la aproximación más cercana.
      const hora = horaDeCreacion((e as EncomiendaConCreacion).createdAt)
      return {
        id: e.id,
        tipo: "paquete",
        hora: hora ?? SIN_DATO,
        horaEstimada: hora !== null,
        quienLlega: nombreDeMaestro(couriers, e.courierId),
        unidadId: e.unidadId,
        personaId: e.destinatarioPersonaId,
        // El modelo no registra quién avisó de la encomienda.
        porQuien: SIN_DATO,
        estado: e.estado,
      }
    }

    const deIngreso = (i: IngresoContratistaPE): FilaAccesoDia => ({
      id: i.id,
      tipo: "trabajo",
      hora: i.horaIngreso ?? SIN_DATO,
      horaEstimada: false,
      quienLlega: nombreDeMaestro(contratistas, i.contratistaId),
      unidadId: i.unidadId,
      personaId: i.personaAgendaId,
      porQuien:
        i.agendadoPor === "residente"
          ? (nombreDePersona(i.personaAgendaId) ?? SIN_DATO)
          : "Administración",
      estado: i.estado,
    })

    return [
      ...visitas.filter((v) => v.fecha === diaReporte).map(deVisita),
      ...encomiendas.filter((e) => e.fechaRecepcion === diaReporte).map(deEncomienda),
      ...ingresos.filter((i) => i.fecha === diaReporte).map(deIngreso),
    ]
  }, [
    visitas,
    encomiendas,
    ingresos,
    diaReporte,
    couriers,
    contratistas,
    personas,
    unidades,
    etiquetas,
  ])

  /**
   * Resuelve UNA vez por sesión las etiquetas de los ids del día que no están en
   * la primera página del padrón. Tolerante a fallos: si el servidor no
   * responde, la fila sigue mostrando el id, como hasta hoy en los paneles.
   */
  const idsPedidosRef = React.useRef<Set<string>>(new Set())
  React.useEffect(() => {
    const faltan = new Set<string>()
    for (const fila of filasDia) {
      if (
        fila.unidadId &&
        !etiquetas[fila.unidadId] &&
        !unidades.some((u) => u.id === fila.unidadId)
      ) {
        faltan.add(fila.unidadId)
      }
      if (
        fila.personaId &&
        !etiquetas[fila.personaId] &&
        !personas.some((p) => p.id === fila.personaId)
      ) {
        faltan.add(fila.personaId)
      }
    }
    const pedir = [...faltan].filter((id) => !idsPedidosRef.current.has(id))
    if (pedir.length === 0) return
    for (const id of pedir) idsPedidosRef.current.add(id)

    let vivo = true
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
  }, [filasDia, etiquetas, personas, unidades, recordar])

  const filas = React.useMemo(() => {
    const ordenadas = [...filasDia].sort(compararPorHora)
    return filtro === "todos" ? ordenadas : ordenadas.filter((f) => f.tipo === filtro)
  }, [filasDia, filtro])

  const cargando = cargandoVisitas || cargandoEncomiendas || cargandoIngresos

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accesos del día ({diaReporte})</CardTitle>
        <CardDescription>
          Visitas, encomiendas y trabajos en una sola lista, del más reciente al más
          antiguo. Es de solo lectura: para registrar, corregir o cambiar un estado usá
          los paneles de arriba.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 sm:w-56">
          <span className="text-sm font-medium">Tipo</span>
          <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroAccesoDia)}>
            <SelectTrigger aria-label="Filtrar por tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTROS.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border">
          {cargando ? (
            <p className="p-4 text-sm text-muted-foreground" role="status">
              Cargando los accesos del día…
            </p>
          ) : filas.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No hay accesos registrados para este día.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="p-3">
                    Hora
                  </th>
                  <th scope="col" className="p-3">
                    Tipo
                  </th>
                  <th scope="col" className="p-3">
                    Quién llega
                  </th>
                  <th scope="col" className="p-3">
                    Para quién
                  </th>
                  <th scope="col" className="p-3">
                    Avisó / por quién
                  </th>
                  <th scope="col" className="p-3">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => {
                  const { etiqueta, Icono, clases } = TIPO[fila.tipo]
                  const unidad = etiquetaDeUnidad(fila.unidadId)
                  const persona = nombreDePersona(fila.personaId)
                  return (
                    <tr key={`${fila.tipo}-${fila.id}`} className="border-b last:border-0">
                      <td className="p-3 tabular-nums">
                        {fila.hora}
                        {fila.horaEstimada ? "*" : null}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={clases}>
                          <Icono className="size-3" />
                          {etiqueta}
                        </Badge>
                      </td>
                      <td className="p-3">{fila.quienLlega}</td>
                      <td className="p-3">
                        {unidad ? <span>{unidad}</span> : null}
                        {persona ? (
                          <span className="block text-xs text-muted-foreground">
                            {persona}
                          </span>
                        ) : null}
                        {!unidad && !persona ? SIN_DATO : null}
                      </td>
                      <td className="p-3">{fila.porQuien}</td>
                      <td className="p-3">
                        <Badge variant={varianteEstado(fila.estado)}>
                          {ETIQUETA_ESTADO[fila.tipo][fila.estado] ?? fila.estado}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {!cargando && filas.some((f) => f.horaEstimada) ? (
            <p className="border-t p-3 text-xs text-muted-foreground">
              * La encomienda no registra hora: la hora con asterisco es la de creación
              del registro.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
