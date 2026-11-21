/**
 * /api/importar/saldos — importador CSV de los saldos de apertura (T2 · S2/S3/S4).
 * Calcado de /api/importar/egresos.
 *
 * POST acepta dos formatos de cuerpo (el CSV llega igual en ambos):
 *   - `text/csv` plano: el cuerpo es el contenido del archivo.
 *   - `multipart/form-data`: el archivo viaja en el campo «archivo».
 *
 * Query `?dryRun=1` devuelve la vista previa fila por fila sin escribir nada.
 * Respuesta 200 con el reporte: `{ filas: [{ linea, accion, errores }],
 * resumen: { total, validas, conError, crear, actualizar, sinCambios } }`.
 *
 * Los dos rechazos de comunidad (S1/S3) viajan como 409 también en la vista
 * previa, para que el administrador los vea antes de cargar:
 *   · sin fondo de gasto común activo: el saldo no tendría dónde imputarse;
 *   · el período del corte (o uno anterior) ya tiene gasto común emitido: el
 *     saldo lo contaría dos veces. El período concreto viaja en `detalle`.
 *
 * La importación real (sin `?dryRun`) no corre si alguna fila tiene error: en
 * ese caso responde 400 con `{ error, reporte }` y no escribe una sola fila.
 * El `comunidadId` sale del scope de la sesión, nunca del archivo.
 *
 * Authz: recurso financiero `fi:importar` con acción crear (el mismo acto de
 * carga del resto de los bloques); el administrador entra por wildcard.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"
import { parsearCsv } from "@/lib/importar/csv"
import { ENCABEZADOS_SALDOS, importarSaldos } from "@/lib/importar/saldos-apertura"

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
    parseado = parsearCsv(csv, { encabezadosEsperados: ENCABEZADOS_SALDOS })
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
    const resultadoImport = await importarSaldos({
      prisma,
      comunidadId: scope.comunidadId,
      filas: parseado.filas,
      dryRun,
    })

    if (resultadoImport.tipo === "rechazo") {
      if (resultadoImport.rechazo.codigo === "sin-fondo-gasto-comun") {
        return jsonError(
          409,
          "No hay un fondo de gasto común activo en la comunidad: el saldo de apertura se imputa a ese fondo, así que hay que crearlo antes de importar. No se escribió nada."
        )
      }
      // El período concreto se arma acá y viaja en `detalle`, como el resto de
      // los mensajes con datos de fila: `error` queda literal.
      const detalle = `Período ya cobrado en el sistema: ${resultadoImport.rechazo.periodo}.`
      return jsonError(
        409,
        "La importación se rechazó entera: el período del corte ya está cobrado en el sistema y el saldo de apertura lo contaría dos veces. No se escribió nada.",
        { detalle }
      )
    }

    const { reporte, bloqueada } = resultadoImport
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
