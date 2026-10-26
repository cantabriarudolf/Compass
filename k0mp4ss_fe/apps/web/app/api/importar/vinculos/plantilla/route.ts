/**
 * /api/importar/vinculos/plantilla — plantilla descargable del bloque
 * vínculos (ODD carga-inicial-csv U2, S1).
 *
 * Devuelve `text/csv` con los encabezados canónicos + una fila de ejemplo;
 * el nombre del archivo deja claro que la fila es de ejemplo
 * (`plantilla-vinculos.csv`, vía content-disposition). Se sirve desde una
 * ruta (no archivos estáticos) para que los encabezados no se desincronicen
 * del validador: ambos salen de ENCABEZADOS_VINCULOS.
 *
 * Authz: la misma que el import (`mp` con acción crear) — la plantilla sólo
 * le sirve a quien puede importar; el administrador entra por wildcard.
 */
import { puede } from "@/lib/authz"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { construirPlantillaVinculos } from "@/lib/importar/personas"

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "crear", "mp")) {
    return jsonError(403, "Permiso denegado.")
  }

  return new Response(construirPlantillaVinculos(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="plantilla-vinculos.csv"',
    },
  })
}
