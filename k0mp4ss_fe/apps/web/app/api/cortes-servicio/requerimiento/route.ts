/**
 * GET /api/cortes-servicio/requerimiento — el requerimiento escrito del preaviso,
 * como documento descargable (F28 · S8, Ley 21.442 art. 20 N°9).
 *
 * El `Documento` del archivo guarda la URL de este endpoint en `archivoUrl`: el
 * papel se emitió al cursar el preaviso y se vuelve a servir acá, desde la fila
 * CONGELADA del corte. No hay una segunda versión del documento —los textos y las
 * cifras salen de la misma definición (`definicionDelRequerimiento`) que se compiló
 * al emitirlo—, así que el archivo que se descarga es el que se archivó.
 *
 * D1 (media por referencia): el binario NO se persiste. Lo que vive en la base son
 * los metadatos del archivo —nombre, MIME, tamaño, hash— y el PDF se recompila del
 * mismo motor (`compilarPdf`, pdfmake con las fuentes virtuales) a partir de datos
 * que no cambian: la definición fija la fecha de creación al preaviso, así que los
 * bytes son los mismos y el hash guardado los identifica.
 *
 * Se pide con `?corteId=` y no con un segmento `[id]` a propósito: el inventario de
 * permisos por objeto clasifica las rutas con segmento dinámico y este papel se lee
 * con la MISMA compuerta que el corte (`fi:cobranza` ver), no con una nueva.
 *
 * Guard `fi:cobranza` ver —el mismo con el que se lee el corte—: la administración
 * lo descarga para cursarlo y el Comité para auditarlo. El residente no lo lee por
 * acá, porque abrirle esta ruta le abriría la deuda de la unidad a cualquier
 * vecino; su constancia de entrega es la que el módulo registra en `envios_documento`.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { compilarPdf } from "@/lib/api/pdf-servidor"
import { definicionDelRequerimiento } from "@/lib/requerimiento-corte"

/** Mismo recurso que el resto del trámite: el corte es cobranza (ver `../route.ts`). */
const RECURSO_CORTES = "fi:cobranza"

export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", RECURSO_CORTES)) {
    return jsonError(403, "Permiso denegado.")
  }

  // El corte viaja en la query (no en el cuerpo) porque esto es una descarga: el
  // parámetro no cambia el alcance —el `where` lleva siempre la comunidad de la
  // sesión—, sólo elige qué fila de esta comunidad se sirve.
  const corteId = (new URL(req.url).searchParams.get("corteId") ?? "").trim()
  if (corteId === "") {
    return jsonError(400, "No se indicó el corte del requerimiento.")
  }

  try {
    const corte = await prisma.corteServicio.findFirst({
      where: { id: corteId, comunidadId: scope.comunidadId },
      select: {
        id: true,
        unidadId: true,
        servicio: true,
        cuotasImpagas: true,
        montoAdeudado: true,
        fechaPreaviso: true,
        fechaHabilitada: true,
        acuerdoId: true,
        documentoId: true,
      },
    })
    if (!corte) return jsonError(404, "Corte de servicio no encontrado.")
    if (!corte.documentoId) {
      // Cortes preavisados antes de S8 (o escritos directo en la base): no hay
      // papel que servir y decirlo es más honesto que servir un documento inventado.
      return jsonError(
        409,
        "El corte no tiene requerimiento escrito: se cursó antes de que el preaviso lo emitiera."
      )
    }

    const [documento, unidad, acuerdo, comunidad] = await Promise.all([
      prisma.documento.findFirst({
        where: { id: corte.documentoId, comunidadId: scope.comunidadId },
        select: { archivoNombre: true },
      }),
      prisma.unidad.findFirst({
        where: { id: corte.unidadId, comunidadId: scope.comunidadId },
        select: { numero: true },
      }),
      prisma.acuerdo.findFirst({
        where: { id: corte.acuerdoId, comunidadId: scope.comunidadId },
        select: { folio: true },
      }),
      prisma.comunidad.findUnique({
        where: { id: scope.comunidadId },
        select: { nombre: true },
      }),
    ])
    if (!documento) {
      return jsonError(
        409,
        "El requerimiento del corte no está en el archivo de esta comunidad."
      )
    }
    if (!unidad || !acuerdo) {
      // La fila del trámite quedó apuntando a algo que ya no está: sin esos dos
      // datos el papel no se puede afirmar y no se sirve uno incompleto.
      return jsonError(
        409,
        "El requerimiento del corte no se puede armar: falta la unidad o el acuerdo que lo autoriza."
      )
    }

    const definicion = definicionDelRequerimiento({
      corteId: corte.id,
      comunidadNombre: comunidad?.nombre ?? scope.comunidadId,
      unidadNumero: unidad.numero,
      servicio: corte.servicio,
      cuotasImpagas: corte.cuotasImpagas,
      montoAdeudado: corte.montoAdeudado,
      fechaPreaviso: corte.fechaPreaviso,
      fechaHabilitada: corte.fechaHabilitada,
      acuerdoFolio: acuerdo.folio,
    })
    const bytes = await compilarPdf(definicion)

    // El nombre lo puso el servidor al emitir el documento y ya está saneado (entra
    // en un header); `no-store` porque es un documento con la deuda de una unidad.
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${documento.archivoNombre}"`,
        "content-length": String(bytes.length),
        "cache-control": "no-store",
      },
    })
  } catch (e) {
    logger.error(
      { err: e, corteId },
      "[api/cortes-servicio/requerimiento] error inesperado"
    )
    return jsonError(500, "Error interno del servidor.")
  }
}
