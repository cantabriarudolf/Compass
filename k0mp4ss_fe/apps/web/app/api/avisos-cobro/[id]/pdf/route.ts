/**
 * /api/avisos-cobro/[id]/pdf — el aviso de cobro como documento descargable (F27).
 *
 * GET sirve el PDF del aviso con las MISMAS reglas de lectura que el detalle:
 *
 * - gestión (`fi:gasto_comun` ver): cualquier aviso de su comunidad;
 * - residente (`fi:aviso:propio` ver): solo el aviso de una unidad con vínculo
 *   VIGENTE (`alcanceAvisosCobro`). El aviso de una unidad ajena —o de otra
 *   comunidad— responde el 404 genérico y no produce documento: un PDF no puede
 *   ser la puerta por la que se lee la deuda del vecino.
 *
 * El documento sale del builder existente (`documentoAvisoCobroPDF`) sobre la
 * fila CONGELADA: no se recalcula ninguna cifra acá y no hay un segundo builder
 * que pueda contradecir el papel que se emitió. La respuesta es el binario, con
 * `application/pdf`, el folio en el nombre del archivo y `no-store`: es un
 * documento personal y no se cachea en proxies ni en el navegador.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import type { ConfiguracionGlobal } from "@/lib/schemas"
import { alcanceAvisosCobro, puedeLeerAvisosCobro } from "../../_alcance"
import { COLUMNAS_DOCUMENTO, pdfDeAviso } from "../../_documento"

type Ctx = { params: Promise<{ id: string }> }

/** Lo que el papel necesita de la fila; `id` no se imprime y no viaja al builder. */
const CAMPOS_DEL_PDF = {
  folio: true,
  codigoVerificacion: true,
  periodo: true,
  fechaEmision: true,
  vencimiento: true,
  contenido: true,
} as const

/**
 * `aviso-cobro-AC-0001.pdf`.
 *
 * El folio es un correlativo del servidor (`AC-####`), pero se sanea igual: el
 * nombre entra en un header y un folio con comillas o saltos de línea rompería
 * `Content-Disposition`. Sin folio utilizable el archivo conserva un nombre
 * válido en vez de salir sin nombre.
 */
function nombreDeArchivo(folio: string): string {
  const seguro = folio.replace(/[^A-Za-z0-9_-]/g, "")
  return `aviso-cobro-${seguro || "sin-folio"}.pdf`
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puedeLeerAvisosCobro(scope.rol)) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params
  try {
    // El filtro viaja en el `where`: la fila ajena NO se carga. Se usa
    // `findFirst` porque el alcance no es una clave única (`unidadId`).
    const fragmento = await alcanceAvisosCobro(scope)
    const aviso = await prisma.avisoCobro.findFirst({
      where: { id, comunidadId: scope.comunidadId, ...(fragmento ?? {}) },
      select: CAMPOS_DEL_PDF,
    })
    if (!aviso) return jsonError(404, "Registro no encontrado.")

    const configuracion = await prisma.configuracionGlobal.findUnique({
      where: { comunidadId: scope.comunidadId },
      select: COLUMNAS_DOCUMENTO,
    })
    if (!configuracion) {
      // Sin identidad de la comunidad ni administrador responsable el papel no
      // se puede afirmar: se dice, en vez de servir un documento incompleto.
      return jsonError(
        409,
        "La comunidad no tiene configuración registrada: sin ella no se puede armar el aviso."
      )
    }

    // SAFETY: la proyección es exactamente lo que el builder imprime —las mismas
    // columnas que la colección sirve a la pantalla— y el cast solo borra el
    // resto del modelo prisma (SMTP, clave de eliminación).
    const bytes = await pdfDeAviso(
      aviso,
      configuracion as unknown as ConfiguracionGlobal
    )

    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${nombreDeArchivo(aviso.folio)}"`,
        "content-length": String(bytes.length),
        "cache-control": "no-store",
      },
    })
  } catch (e) {
    logger.error(
      { err: e, avisoId: id },
      "[api/avisos-cobro/[id]/pdf] error inesperado"
    )
    return jsonError(500, "Error interno del servidor.")
  }
}
