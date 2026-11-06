/**
 * /api/co/documentos/[id] — detalle/actualización parcial/baja.
 *
 * @deprecated La «Biblioteca de Documentos Comunales» se retiró (F35 serie A, T11):
 * el «Archivo de Documentos de la Comunidad» (`/api/documentos`, tabla `Documento`)
 * es la única lista y su apertura se audita ahí como `AD_DOC_APERTURA`. Esta ruta
 * queda viva solo mientras `documentos_co` conserve sus filas; tabla y datos se
 * retiran en la unidad que los migre a `Documento`. El nombre del evento
 * `CO_DOC_DOWNLOAD` NO se retira del catálogo: las filas históricas de la bitácora
 * lo conservan con ese nombre. No agregues consumidores nuevos.
 *
 * GET_ONE y DELETE vía factory. PUT parcial vía put-merge sobre "co".
 * Abrir/descargar un documento de la biblioteca (GET del detalle) emite
 * `CO_DOC_DOWNLOAD` (categoría CO) después de la lectura autorizada.
 */
import { DocumentoCOSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { createPutMerge } from "@/lib/api/put-merge"
import { withComunidadScope } from "@/lib/api/with-comunidad-scope"

const modelo = delegado(prisma.documentoCO)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "co")

const handlers = createCrudHandlers({
  model: modelo,
  schema: DocumentoCOSchema,
  authzCheck,
})

type Ctx = { params: Promise<{ id: string }> }

/**
 * GET del detalle + auditoría de la descarga.
 *
 * El documento CO es metadatos + URL (D1: jamás base64/Blob), así que no existe
 * endpoint de descarga propio: abrir el documento es este GET. Se audita la
 * lectura autorizada como `CO_DOC_DOWNLOAD`, después de resolverla y en su
 * propio try/catch (la auditoría nunca bloquea la lectura).
 */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params
  const res = await handlers.GET_ONE(req, ctx)
  if (!res.ok) return res

  try {
    const documento = (await res.clone().json()) as {
      nombre?: string
      tipoMime?: string
      tamanoKB?: number
    }
    const scopeResult = await withComunidadScope()
    if (scopeResult.ok) {
      const { scope } = scopeResult
      await registrarEventoAuditoria({
        id: generarId("ev"),
        comunidadId: scope.comunidadId,
        timestamp: new Date().toISOString(),
        usuario: scope.usuarioId,
        categoria: "CO",
        tipoAccion: "CO_DOC_DOWNLOAD",
        referenciaId: id,
        descripcion: `Descarga del documento "${documento.nombre ?? id}" (${documento.tipoMime ?? "tipo desconocido"}, ${documento.tamanoKB ?? 0} KB) de la biblioteca comunal.`,
      })
    }
  } catch (e) {
    logger.error(
      { err: e },
      "[api/co/documentos] no se pudo registrar CO_DOC_DOWNLOAD"
    )
  }

  return res
}

export const PUT = createPutMerge({
  model: modelo,
  schema: DocumentoCOSchema,
  authzCheck,
  recurso: "co/documentos",
})
export const DELETE = handlers.DELETE
