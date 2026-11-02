"use client"

/**
 * Acceso único (PE-conserjería) — una puerta para todo lo que entra al edificio.
 *
 * El problema que resuelve: hoy el conserje tiene que elegir la pestaña antes de
 * saber qué es, y esa elección la hace con nuestras palabras ("visitas",
 * "encomiendas", "contratistas"), no con las de la puerta. Acá elige qué viene a
 * hacer la persona y el formulario aparece solo.
 *
 * Decisión del owner (2026-11-01, "vamos por A"): etiquetas nuevas, datos
 * quietos. Los tres modos siguen escribiendo en sus tablas actuales
 * (`bitacora_visitas_pe`, `encomiendas_pe`, `ingresos_contratistas_pe`): este
 * componente compone los paneles que ya existen, no los reescribe.
 *
 * El alcance del trabajo ("para el edificio" / "para un departamento") se
 * pregunta así y no como "contratista o proveedor": esas dos palabras son
 * nuestras y el conserje no las usa. Ojo, el alcance es una etiqueta de pantalla
 * — `IngresoContratistaPE` ya distingue el caso con `unidadId` (vacío = edificio)
 * y `agendadoPor`, así que no se agrega ningún campo.
 */
import * as React from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  IconArrowBackUp,
  IconBuildingCommunity,
  IconHome,
  IconPackage,
  IconTool,
  IconUserCheck,
} from "@tabler/icons-react"
import { VisitasPanel } from "@/components/pe/visitas-panel"
import { EncomiendasPanel } from "@/components/pe/encomiendas-panel"
import { ContratistasPanel } from "@/components/pe/contratistas-panel"

/** Qué viene a hacer la persona. Las tres respuestas que se escuchan en la puerta. */
export type ModoAcceso = "visita" | "paquete" | "trabajo"

/** Dónde se hace el trabajo: bienes comunes del edificio o el servicio de un residente. */
export type AlcanceTrabajo = "edificio" | "departamento"

const MODOS: ReadonlyArray<{
  id: ModoAcceso
  etiqueta: string
  detalle: string
  Icono: typeof IconUserCheck
}> = [
  {
    id: "visita",
    etiqueta: "Viene a ver a alguien",
    detalle: "Visita a un residente del edificio",
    Icono: IconUserCheck,
  },
  {
    id: "paquete",
    etiqueta: "Trae o retira algo",
    detalle: "Encomienda, delivery o courier",
    Icono: IconPackage,
  },
  {
    id: "trabajo",
    etiqueta: "Viene a trabajar",
    detalle: "Para el edificio o para un departamento",
    Icono: IconTool,
  },
]

/** Texto del botón «volver», por modo. */
const ETIQUETA_VOLVER: Record<ModoAcceso, string> = {
  visita: "Cambiar: no es una visita",
  paquete: "Cambiar: no es un paquete",
  trabajo: "Cambiar: no es un trabajo",
}

export function RegistroAcceso({
  diaReporte,
  onError,
  onSuccess,
}: {
  diaReporte: string
  onError: (msg: string | null) => void
  onSuccess: (msg: string | null) => void
}) {
  const [modo, setModo] = React.useState<ModoAcceso | null>(null)
  const [alcance, setAlcance] = React.useState<AlcanceTrabajo | null>(null)

  /** Volver al selector limpia también el alcance: no arrastrarlo entre modos. */
  const volver = () => {
    setModo(null)
    setAlcance(null)
  }

  if (!modo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>¿A qué viene?</CardTitle>
          <CardDescription>
            Elegí lo que la persona te dice en la puerta. Después el formulario se
            adapta solo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {MODOS.map(({ id, etiqueta, detalle, Icono }) => (
            <Button
              key={id}
              type="button"
              variant="outline"
              className="h-auto flex-col items-start gap-1 p-4 text-left whitespace-normal"
              onClick={() => {
                onError(null)
                onSuccess(null)
                setModo(id)
                setAlcance(null)
              }}
            >
              <Icono className="size-5" />
              <span className="font-medium">{etiqueta}</span>
              <span className="text-xs text-muted-foreground">{detalle}</span>
            </Button>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (modo === "trabajo" && !alcance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>¿El trabajo es para el edificio o para un departamento?</CardTitle>
          <CardDescription>
            Para el edificio: ascensor, bomba, portón, la telco del edificio. Para un
            departamento: el servicio de un residente, como su internet, su luz o su gas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-1 p-4 text-left whitespace-normal"
            onClick={() => setAlcance("edificio")}
          >
            <IconBuildingCommunity className="size-5" />
            <span className="font-medium">Para el edificio</span>
            <span className="text-xs text-muted-foreground">Bienes comunes</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-1 p-4 text-left whitespace-normal"
            onClick={() => setAlcance("departamento")}
          >
            <IconHome className="size-5" />
            <span className="font-medium">Para un departamento</span>
            <span className="text-xs text-muted-foreground">Servicio de un residente</span>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="ghost" onClick={volver}>
          <IconArrowBackUp className="mr-1 size-4" /> {ETIQUETA_VOLVER[modo]}
        </Button>
        {modo === "trabajo" && alcance ? (
          <span className="text-sm text-muted-foreground">
            {alcance === "edificio" ? "Trabajo para el edificio" : "Trabajo para un departamento"}
          </span>
        ) : null}
      </div>

      {modo === "visita" ? (
        <VisitasPanel diaReporte={diaReporte} onError={onError} onSuccess={onSuccess} />
      ) : null}
      {modo === "paquete" ? (
        <EncomiendasPanel diaReporte={diaReporte} onError={onError} onSuccess={onSuccess} />
      ) : null}
      {modo === "trabajo" ? (
        <ContratistasPanel diaReporte={diaReporte} onError={onError} onSuccess={onSuccess} />
      ) : null}
    </div>
  )
}
