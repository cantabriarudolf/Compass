/**
 * /api/importar/egresos/plantilla — plantilla descargable del bloque egresos
 * del historial financiero (F48 · S1/S2).
 *
 * Devuelve `text/csv` con los encabezados canónicos
 * (`fecha,monto,descripcion,categoria,fondo`) más tres filas de ejemplo
 * marcadas con el prefijo EJEMPLO-, que el importador rechaza. Se sirve desde
 * una ruta (no un archivo estático) para que los encabezados no se
 * desincronicen del validador: ambos salen de ENCABEZADOS_FINANZAS.
 *
 * Authz: la misma que el import (`fi` con acción crear) — la plantilla sólo le
 * sirve a quien puede importar; el administrador entra por wildcard.
 */
import { puede } from "@/lib/authz"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { construirPlantillaFinanzas } from "@/lib/importar/finanzas"

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "crear", "fi:importar")) {
    return jsonError(403, "Permiso denegado.")
  }

  return new Response(construirPlantillaFinanzas("egresos"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="plantilla-egresos.csv"',
    },
  })
}
