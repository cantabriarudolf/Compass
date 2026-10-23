/**
 * totales-envio — de dónde sale el «X/Y leídos» de la consola (change
 * co-lectura-residente, tarea 1.8 · S9 · D2/D3).
 *
 * `totalLecturas` es el conteo de filas con `leidoEn` en `EnvioDestinatarioCO` y
 * `totalDestinatarios` el de la tabla de destinatarios, calculados en el
 * servidor. NUNCA se derivan del JSON del envío: `EnvioCO.lecturas` quedó
 * **derivado** y puede estar viejo (D3), así que usarlo de fuente haría que el
 * badge mintiera — que es justo el defecto que este change corrige.
 *
 * Si la respuesta no trae los totales, se devuelve `null`: la fila lo declara en
 * pantalla en vez de inventar un conteo a partir de un arreglo no confiable.
 */
import type { EnvioConsolaCO } from "@/lib/api/use-co"
import type { EnvioCO } from "@/lib/schemas"

export interface TotalesEnvioCO {
  leidos: number
  total: number
}

export function totalesDeEnvio(envio: EnvioCO): TotalesEnvioCO | null {
  const conTotales = envio as Partial<EnvioConsolaCO>
  if (
    typeof conTotales.totalLecturas !== "number" ||
    typeof conTotales.totalDestinatarios !== "number"
  ) {
    return null
  }
  return { leidos: conTotales.totalLecturas, total: conTotales.totalDestinatarios }
}
