/**
 * /api/documentos/[id] — detalle / reemplazo / baja del archivo (F35 serie A, A1).
 *
 * Comparte los handlers de la colección: la guardia de escritura y el schema son
 * los mismos, así que un legal responde 409 también por acá (S2). El comunitario
 * se reemplaza con PUT parcial; el legal no (se corrige con una versión nueva).
 *
 * La lectura del detalle es la APERTURA del documento y deja rastro (T11): el
 * archivo es media por referencia (D1), no existe endpoint de descarga, así que
 * abrir un documento es este GET. La «Biblioteca de Documentos Comunales» de CO
 * se retiró y con ella su `CO_DOC_DOWNLOAD` al abrir; la observabilidad se muda a
 * `AD_DOC_APERTURA` (categoría AD) con la misma mecánica.
 */
import { documentoHandlers } from "../route"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { withComunidadScope } from "@/lib/api/with-comunidad-scope"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Nombre del evento de apertura del archivo.
 *
 * Se agrega al catálogo (el `tipoAccion` de la bitácora es texto, no una unión
 * cerrada) y NO reemplaza a `CO_DOC_DOWNLOAD`: ese nombre sigue en el catálogo
 * porque la ruta deprecada `/api/co/documentos/[id]` lo emite y las filas
 * históricas lo conservan.
 */
export const EVENTO_APERTURA_ARCHIVO = "AD_DOC_APERTURA"

/**
 * GET del detalle + auditoría de la apertura.
 *
 * El evento se escribe DESPUÉS de resolver la lectura autorizada y en su propio
 * try/catch: la auditoría nunca bloquea la apertura. Los caminos rojos (401,
 * 403, 404) no llegan hasta acá, así que no dejan evento.
 */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params
  const res = await documentoHandlers.GET_ONE(req, ctx)
  if (!res.ok) return res

  try {
    const documento = (await res.clone().json()) as {
      glosa?: string
      archivoNombre?: string
      archivoTipoMime?: string
    }
    const scopeResult = await withComunidadScope()
    if (scopeResult.ok) {
      const { scope } = scopeResult
      await registrarEventoAuditoria({
        id: generarId("ev"),
        comunidadId: scope.comunidadId,
        timestamp: new Date().toISOString(),
        usuario: scope.usuarioId,
        categoria: "AD",
        tipoAccion: EVENTO_APERTURA_ARCHIVO,
        referenciaId: id,
        descripcion: `Apertura del documento "${documento.glosa ?? id}" (${documento.archivoNombre ?? "archivo sin nombre"}, ${documento.archivoTipoMime ?? "tipo desconocido"}) del archivo de la comunidad.`,
      })
    }
  } catch (e) {
    logger.error(
      { err: e },
      "[api/documentos] no se pudo registrar AD_DOC_APERTURA"
    )
  }

  return res
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return documentoHandlers.PUT(req, ctx)
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  return documentoHandlers.DELETE(req, ctx)
}
