/**
 * /api/importar/vinculos — importador CSV del bloque vínculos (ODD
 * carga-inicial-csv U2). Calcado de /api/importar/estructura (U1).
 *
 * POST acepta dos formatos de cuerpo (el CSV llega igual en ambos):
 *   - `text/csv` plano: el cuerpo es el contenido del archivo.
 *   - `multipart/form-data`: el archivo viaja en el campo «archivo»
 *     (lo que usará el formulario del administrador en U3).
 *
 * Query `?dryRun=1` devuelve la vista previa fila por fila sin escribir nada.
 * Respuesta 200 con el reporte: `{ filas: [{ linea, accion, errores }],
 * resumen: { total, validas, conError, crear, actualizar, sinCambios } }`.
 * Sólo se escriben las filas válidas; el `comunidadId` sale del scope de la
 * sesión, nunca del archivo.
 *
 * Authz: mismo recurso que gobierna personas y vínculos (`mp`, como
 * /api/vinculos, que no tiene recurso propio en la matriz); el administrador
 * entra por wildcard y no se agregaron recursos a la matriz.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import { parsearCsv } from "@/lib/importar/csv"
import {
  ENCABEZADOS_VINCULOS,
  importarVinculos,
} from "@/lib/importar/personas"

/** Lee un query param tolerando URLs mal formadas (nunca lanza). */
function safeQuery(req: Request, nombre: string): string {
  try {
    return new URL(req.url).searchParams.get(nombre) ?? ""
  } catch {
    return ""
  }
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "crear", "mp")) {
    return jsonError(403, "Permiso denegado.")
  }

  let csv: string
  try {
    const contentType = req.headers.get("content-type") ?? ""
    if (contentType.startsWith("multipart/form-data")) {
      const form = await req.formData()
      const archivo = form.get("archivo")
      if (!(archivo instanceof File)) {
        return jsonError(
          400,
          "Falta el archivo CSV en el campo «archivo» del formulario."
        )
      }
      csv = await archivo.text()
    } else {
      csv = await req.text()
    }
  } catch {
    return jsonError(400, "No se pudo leer el cuerpo de la solicitud.")
  }

  if (csv.trim() === "") {
    return jsonError(400, "El archivo CSV está vacío.")
  }

  let parseado
  try {
    parseado = parsearCsv(csv, { encabezadosEsperados: ENCABEZADOS_VINCULOS })
  } catch (e) {
    return jsonError(
      400,
      e instanceof Error ? e.message : "El archivo CSV no se pudo leer."
    )
  }

  const seco = safeQuery(req, "dryRun").toLowerCase()
  const dryRun = seco === "1" || seco === "true"

  try {
    const reporte = await importarVinculos({
      prisma,
      comunidadId: scope.comunidadId,
      filas: parseado.filas,
      dryRun,
    })
    return Response.json(reporte)
  } catch (e) {
    return errorGenerico(e)
  }
}
