/**
 * /api/importar/ingresos — importador CSV del bloque **ingresos** del historial
 * financiero (F48 · S1/S2/S4). Calcado de /api/importar/estructura y hermano
 * de /api/importar/egresos: mismo formato, mismo reporte y misma validación
 * (`lib/importar/finanzas.ts`).
 *
 * POST acepta `text/csv` plano o `multipart/form-data` con el archivo en el
 * campo «archivo». `?dryRun=1` devuelve la vista previa fila por fila sin
 * escribir nada; la importación real no corre si alguna fila tiene error
 * (responde 400 con `{ error, reporte }` y no escribe una sola fila).
 *
 * En este bloque la columna `descripcion` se guarda en `IngresoFI.concepto` y
 * `categoria` en `IngresoFI.familia` (el modelo de ingresos no tiene columna
 * `categoria`): el mapeo lo resuelve el importador, la ruta no lo duplica.
 *
 * Authz: recurso financiero `fi` con acción crear (como /api/ingresos-fi); el
 * administrador entra por wildcard.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import { parsearCsv } from "@/lib/importar/csv"
import { ENCABEZADOS_FINANZAS, importarFinanzas } from "@/lib/importar/finanzas"

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

  if (!puede(scope.rol, "crear", "fi:importar")) {
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
    parseado = parsearCsv(csv, { encabezadosEsperados: ENCABEZADOS_FINANZAS })
  } catch (e) {
    // El texto del parser describe el archivo que subió quien pide: viaja en
    // `detalle` para que la pantalla lo muestre, y el mensaje de la ruta queda
    // literal (candado de mensajes de error: nada de interpolar en `error`).
    return jsonError(
      400,
      "El archivo CSV no se pudo leer: revisá los encabezados y el separador.",
      { detalle: e instanceof Error ? e.message : "" }
    )
  }

  const seco = safeQuery(req, "dryRun").toLowerCase()
  const dryRun = seco === "1" || seco === "true"

  try {
    const { reporte, bloqueada } = await importarFinanzas({
      prisma,
      comunidadId: scope.comunidadId,
      bloque: "ingresos",
      filas: parseado.filas,
      dryRun,
    })
    if (bloqueada) {
      return jsonError(
        400,
        "La importación no se ejecutó: el archivo tiene filas con error. Corregí el archivo y volvé a correr la vista previa hasta que quede sin errores; no se escribió nada.",
        { reporte }
      )
    }
    return Response.json(reporte)
  } catch (e) {
    return errorGenerico(e)
  }
}
