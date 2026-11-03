import { redirect } from "next/navigation"

/**
 * Ruta retirada: la vista dedicada de encomiendas se fue a la puerta única.
 *
 * Desde el commit 931753c la recepción y el retiro de encomiendas es una de las
 * respuestas de `/operaciones/accesos` («Trae o retira algo»), con la misma lista
 * consolidada del día al lado. Esta URL sobrevive solo como enlace viejo
 * (marcadores, avisos, manuales), así que se redirige en el servidor:
 * `redirect()` responde antes de pintar nada, sin el parpadeo de una página
 * retirada que se corrige desde el cliente.
 */
export default function PaqueteriaPage() {
  redirect("/operaciones/accesos")
}
