/**
 * metrica-lecturas — badge «X/Y leídos» con su descargo (change
 * co-lectura-residente, tarea 1.8 · S9 · design §Textos de UI punto 2).
 *
 * Los conteos vienen de las lecturas REALES registradas por los destinatarios
 * (`totalLecturas` / `totalDestinatarios`, derivados de `EnvioDestinatarioCO`),
 * nunca del arreglo `lecturas` que viaja en el JSON del envío.
 */
import * as React from "react"
import { Badge } from "@workspace/ui/components/badge"
import { TEXTO_METRICA_DESCARGO } from "./textos-lectura"

export interface MetricaLecturasProps {
  /** Lecturas registradas (filas con `leidoEn`, no el largo de un JSON). */
  leidos: number
  /** Destinatarios del envío según la tabla de destinatarios. */
  total: number
}

export function MetricaLecturas({ leidos, total }: MetricaLecturasProps) {
  const completo = total > 0 && leidos >= total
  return (
    <div className="flex max-w-xs flex-col items-end gap-1 text-right">
      <Badge variant={completo ? "default" : "secondary"}>{`${leidos}/${total} leídos`}</Badge>
      <p className="text-[10px] leading-tight text-muted-foreground">{TEXTO_METRICA_DESCARGO}</p>
    </div>
  )
}
