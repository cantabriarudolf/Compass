import { redirect } from "next/navigation"

/**
 * Ruta retirada: la bitácora de cinco pestañas ya no existe.
 *
 * Desde el commit 931753c («una sola puerta para registrar accesos») todo lo que
 * el conserje registra —visitas, encomiendas y trabajos— y todo lo que lee del día
 * vive en `/operaciones/accesos`: la puerta única arriba y la lista consolidada
 * abajo. Esta URL sobrevive solo como enlace viejo (marcadores, avisos, manuales),
 * así que se redirige en el servidor: `redirect()` responde antes de pintar nada,
 * sin el parpadeo de una página retirada que se corrige desde el cliente.
 */
export default function BitacoraPage() {
  redirect("/operaciones/accesos")
}
