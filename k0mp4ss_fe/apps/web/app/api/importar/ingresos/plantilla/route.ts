/**
 * /api/importar/ingresos/plantilla — plantilla descargable del bloque ingresos
 * del historial financiero (F48 · S1/S2).
 *
 * Devuelve `text/csv` con los encabezados canónicos
 * (`fecha,monto,descripcion,categoria,fondo`) más tres filas de ejemplo
 * marcadas con el prefijo EJEMPLO-, que el importador rechaza. Los encabezados
 * salen de ENCABEZADOS_FINANZAS, la misma fuente que valida el parser.
 *
 * Authz: la misma que el import (`fi` con acción crear); el administrador entra
 * por wildcard.
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

  return new Response(construirPlantillaFinanzas("ingresos"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="plantilla-ingresos.csv"',
    },
  })
}
