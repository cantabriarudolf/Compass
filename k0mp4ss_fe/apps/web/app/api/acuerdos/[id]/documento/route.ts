/**
 * /api/acuerdos/[id]/documento — los PAPELES FIRMADOS del acuerdo presencial al
 * archivo legal (S1/S3 de `odd/tasks/acuerdo-presencial-y-respaldo.md`).
 *
 * El acta firmada es OBLIGATORIA para cerrar un acuerdo presencial —pedido
 * textual del owner: «obligatoria, no debemos fomentar la flojera hacia el
 * administrador»— y el sistema no genera la firma, la recibe. La administración
 * escanea el papel y ESTA ruta lo archiva como `Documento` legal en el archivo
 * de la comunidad, con el binario en el depósito privado. La lista de asistencia
 * y los poderes respaldan la habilidad acreditada en la sala (S6) y se suben
 * cuando existen; el acta, siempre.
 *
 * Las reglas que se sostienen acá y no en la voluntad de quien llama:
 *
 *   · el acuerdo se resuelve EN la comunidad de la sesión y el de otra comunidad
 *     no es un dato ajeno que se ignora: es una fila que no existe (404), ANTES
 *     de cualquier 409;
 *   · un acuerdo ya resuelto no acepta papeles nuevos (409, S5): lo cerrado no
 *     se reescribe;
 *   · cada papel se sube UNA sola vez por acuerdo: un segundo intento responde
 *     409 y NO toca el documento ya archivado (la firma no se reemplaza);
 *   · lo que entra tiene que ser un PDF de verdad —se miran los BYTES, no el
 *     nombre—, porque el archivo legal guarda el escaneo y un archivo con otro
 *     formato no se puede abrir como papel firmado (400 con el motivo);
 *   · el tamaño y el hash salen de los bytes, y lo que se archiva como URL es el
 *     pathname del depósito: NUNCA una URL pública (el store es privado);
 *   · la documentación se SUBE, no se referencia por URL: sin binario en el
 *     depósito no hay documento.
 *
 * ── El orden importa: archivo primero, transacción después ──────────────────
 *
 * El PDF se sube ANTES de abrir la transacción que escribe. Si la subida falla,
 * no se escribe nada (ni documento, ni vínculo en el acuerdo, ni evento). Si la
 * transacción falla después de subir, el archivo se BORRA del depósito: dejar
 * un PDF huérfano que ninguna fila menciona sería basura en el archivo, y dejar
 * el vínculo sin sus bytes sería un documento que no se puede servir.
 *
 * El acta subida es la condición dura del cierre (`POST /api/acuerdos/[id]`):
 * un presencial no pasa a `aprobado` ni a `rechazado` sin su `actaDocumentoId`.
 *
 * - POST (guard `gd` crear): administración y comité suben el escaneo. La
 *   descarga del papel archivado no vive acá: el archivo legal de la comunidad
 *   ya la sirve por su propia ruta con el guard `doc`.
 */
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { puedeGestionarAcuerdos } from "../../_guard"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { jsonError, withComunidadScope, type ComunidadScope } from "@/lib/api/with-comunidad-scope"
import { MAXIMO_BASE64_DEL_PAPEL } from "@/lib/schemas"
import {
  borrarArchivoPrivado,
  subirArchivoPrivado,
} from "@/lib/almacen-documentos"
import {
  MIME_DEL_ACUERDO,
  PAPELES_DEL_ACUERDO,
  TIPO_DOCUMENTAL_ACUERDO,
  esPdf,
  etiquetaDelPapel,
  glosaDelPapelDelAcuerdo,
  hashDelArchivo,
  nombreDelPapelDelAcuerdo,
  referenciaAutenticaDelPapelDelAcuerdo,
  rutaDelPapelDelAcuerdo,
  tamanoEnKB,
  type PapelDelAcuerdo,
} from "@/lib/acuerdo-documento"

type Ctx = { params: Promise<{ id: string }> }

/**
 * El papel que entra, con el tipo de respaldo que declara: el acta (obligatoria
 * para el cierre), la asistencia o los poderes. El contenido viaja en base64
 * porque el cuerpo de la petición es JSON (sin `multipart` ni una librería de
 * subida), y NO se persiste —se sube al depósito privado y en la base quedan los
 * metadatos y la ruta (D1).
 */
const PapelDelAcuerdoSchema = z.object({
  tipo: z.enum(PAPELES_DEL_ACUERDO, {
    errorMap: () => ({
      message: "El tipo de papel es obligatorio: acta, asistencia o poderes.",
    }),
  }),
  nombreArchivo: z
    .string({ required_error: "El nombre del archivo es obligatorio." })
    .trim()
    .min(1, "El nombre del archivo es obligatorio.")
    .max(200, "El nombre del archivo no puede superar los 200 caracteres."),
  contenidoBase64: z
    .string({ required_error: "El contenido del archivo es obligatorio." })
    .min(1, "El contenido del archivo es obligatorio.")
    .max(
      MAXIMO_BASE64_DEL_PAPEL,
      "El archivo supera el tamaño máximo que se puede subir."
    ),
})

/** Centinela para distinguir el conflicto de negocio de una falla real. */
const YA_TIENE_ESE_PAPEL = "ACUERDO_YA_TIENE_ESE_PAPEL"

/**
 * Intentos de la transacción del archivo.
 *
 * El único choque esperable es el contador de versiones del archivo legal:
 * `version` se numera dentro de (comunidad, tipo documental) y dos altas
 * simultáneas pueden leer el mismo máximo y chocar contra el índice único
 * (`P2002`). El reintento es seguro porque la transacción fallida no deja nada
 * escrito y el archivo ya subido se reutiliza: se reintenta la escritura, NUNCA
 * la subida.
 */
const MAXIMO_INTENTOS_DE_ARCHIVO = 2

/** ¿El error es el choque contra un índice único de la base? */
function esChoqueDeIndiceUnico(e: unknown): boolean {
  return (e as { code?: string }).code === "P2002"
}

/** ¿El acuerdo ya archivó ESTE papel? (cada papel se sube una sola vez, S5). */
function yaTieneElPapel(
  papel: PapelDelAcuerdo,
  acuerdo: { actaDocumentoId: string | null; asistenciaDocumentoId: string | null; poderesDocumentoId: string | null }
): boolean {
  if (papel === "acta") return acuerdo.actaDocumentoId !== null
  if (papel === "asistencia") return acuerdo.asistenciaDocumentoId !== null
  return acuerdo.poderesDocumentoId !== null
}

/**
 * El vínculo se RECLAMA con una actualización condicional: el `where` exige que
 * el acuerdo siga sin este papel, así que dos subidas simultáneas no pueden
 * archivar dos papeles (la segunda no reclama ninguna fila).
 */
async function reclamarPapel(
  tx: Prisma.TransactionClient,
  papel: PapelDelAcuerdo,
  acuerdoId: string,
  comunidadId: string,
  documentoId: string
) {
  if (papel === "acta") {
    return tx.acuerdo.updateMany({
      where: { id: acuerdoId, comunidadId, actaDocumentoId: null },
      data: { actaDocumentoId: documentoId },
    })
  }
  if (papel === "asistencia") {
    return tx.acuerdo.updateMany({
      where: { id: acuerdoId, comunidadId, asistenciaDocumentoId: null },
      data: { asistenciaDocumentoId: documentoId },
    })
  }
  return tx.acuerdo.updateMany({
    where: { id: acuerdoId, comunidadId, poderesDocumentoId: null },
    data: { poderesDocumentoId: documentoId },
  })
}

/** Frase del papel para la auditoría, en el orden que la oración exige. */
function fraseDelPapel(papel: PapelDelAcuerdo): string {
  const frases: Record<PapelDelAcuerdo, string> = {
    acta: "El acta firmada",
    asistencia: "La lista de asistencia",
    poderes: "Los poderes acreditados",
  }
  return frases[papel]
}

/** POST archiva UN papel firmado del acuerdo presencial (S3). */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope: ComunidadScope = resultado.scope

  if (!puedeGestionarAcuerdos(scope.rol, "crear")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params

  const body: unknown = await request.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = PapelDelAcuerdoSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const papel: PapelDelAcuerdo = parsed.data.tipo

  // El acuerdo se resuelve EN la comunidad de la sesión: el id de otra comunidad
  // no es un dato ajeno que se ignora, es una fila que no existe (404). Este
  // chequeo va ANTES de cualquier 409.
  const acuerdo = await prisma.acuerdo.findFirst({
    where: { id, comunidadId: scope.comunidadId },
    select: {
      id: true,
      folio: true,
      cuerpo: true,
      estado: true,
      fecha: true,
      actaDocumentoId: true,
      asistenciaDocumentoId: true,
      poderesDocumentoId: true,
    },
  })
  if (!acuerdo) return jsonError(404, "Acuerdo no encontrado.")

  // S5 — lo cerrado no se reescribe: un acuerdo resuelto no acepta papeles
  // nuevos (el acta archivada con folio congeló lo declarado).
  if (acuerdo.estado !== "abierto") {
    return jsonError(
      409,
      "El acuerdo ya fue resuelto: su resultado y sus papeles no se editan ni se borran (el acta archivada con folio congela lo declarado)."
    )
  }

  // El papel se firma UNA vez: el escaneo que ya está en el archivo no se
  // reemplaza desde acá (una firma nueva es otro acto, no una edición del papel).
  if (yaTieneElPapel(papel, acuerdo)) {
    return jsonError(
      409,
      "El acuerdo ya tiene este papel subido al archivo legal: cada papel se sube una sola vez."
    )
  }

  // El contenido NUNCA se persiste: se decodifica para medirlo, verificarlo y
  // subirlo. La base guarda metadatos y la ruta (D1).
  const bytes = Buffer.from(parsed.data.contenidoBase64, "base64")
  if (!esPdf(bytes)) {
    return jsonError(
      400,
      "El archivo no es un PDF: el papel se firma a mano y la administración lo escanea en PDF, así que un archivo con otro formato no entra al archivo legal."
    )
  }

  const hash = hashDelArchivo(bytes)
  const tamanoKB = tamanoEnKB(bytes)
  const archivoNombre = nombreDelPapelDelAcuerdo(parsed.data.nombreArchivo, acuerdo.id)
  const ahora = new Date()

  // Los ids se conocen ANTES de subir: el pathname del depósito se arma con ellos y
  // la fila que se escribirá después es exactamente la que apunta al archivo.
  const documentoId = generarId("doc")
  const pathname = rutaDelPapelDelAcuerdo({
    comunidadId: scope.comunidadId,
    acuerdoId: acuerdo.id,
    documentoId,
  })

  // ── 1. El archivo, al depósito privado ─────────────────────────────────────
  try {
    await subirArchivoPrivado({ pathname, bytes, tipoMime: MIME_DEL_ACUERDO })
  } catch (e) {
    // Sin archivo no hay documento: no se escribe ni una fila.
    logger.error(
      { err: e, acuerdoId: acuerdo.id },
      "[api/acuerdos/documento] no se pudo subir el papel firmado al depósito"
    )
    return jsonError(
      502,
      "No se pudo guardar el archivo en el depósito de documentos: no se escribió ninguna fila."
    )
  }

  // ── 2. La transacción que lo archiva ───────────────────────────────────────
  const glosa = glosaDelPapelDelAcuerdo({
    papel,
    folio: acuerdo.folio,
    cuerpo: acuerdo.cuerpo,
  })
  const referenciaAutentica = referenciaAutenticaDelPapelDelAcuerdo({
    papel,
    folio: acuerdo.folio,
    cuerpo: acuerdo.cuerpo,
  })

  let ultimoError: unknown = null
  for (let intento = 1; intento <= MAXIMO_INTENTOS_DE_ARCHIVO; intento++) {
    try {
      await prisma.$transaction(async (tx) => {
        const reclamado = await reclamarPapel(
          tx,
          papel,
          acuerdo.id,
          scope.comunidadId,
          documentoId
        )
        if (reclamado.count === 0) throw new Error(YA_TIENE_ESE_PAPEL)

        // La versión es la siguiente dentro de (comunidad, tipo documental), el
        // mismo contador con el que numera el archivo de la comunidad.
        const { _max } = await tx.documento.aggregate({
          where: {
            comunidadId: scope.comunidadId,
            tipoDocumental: TIPO_DOCUMENTAL_ACUERDO,
          },
          _max: { version: true },
        })

        // El PAPEL FIRMADO, como documento legal del archivo: el papel prueba la
        // firma que el sistema no genera, y lo legal no se edita.
        await tx.documento.create({
          data: {
            id: documentoId,
            comunidadId: scope.comunidadId,
            naturaleza: "legal",
            tipoDocumental: TIPO_DOCUMENTAL_ACUERDO,
            glosa,
            referenciaAutentica,
            archivoNombre,
            archivoTipoMime: MIME_DEL_ACUERDO,
            archivoTamanoKB: tamanoKB,
            // La URL archivada es el pathname del depósito privado, no un enlace
            // público: la documentación se SUBE, nunca se referencia por URL.
            archivoUrl: pathname,
            hash,
            version: (_max.version ?? 0) + 1,
            // La fecha de la sesión que el acuerdo declara: el papel respalda ESA
            // sesión, no el día del escaneo.
            vigenteDesde: acuerdo.fecha.toISOString().slice(0, 10),
            subidoPorPersonaId: null,
          },
        })

        await registrarEventoAuditoria(
          {
            id: generarId("ev"),
            comunidadId: scope.comunidadId,
            timestamp: ahora.toISOString(),
            usuario: scope.usuarioId,
            categoria: "AD",
            tipoAccion: "AD_ACUERDO_DOCUMENTO_SUBIDO",
            referenciaId: acuerdo.id,
            descripcion: `Se archivó ${glosa} como documento legal ${documentoId}: PDF de ${bytes.length} byte(s), sha256 ${hash}, en el depósito privado ${pathname}. ${fraseDelPapel(papel)} respalda los libros físicos del acuerdo ${acuerdo.folio}.`,
          },
          tx
        )
      })

      return Response.json(
        {
          id: documentoId,
          acuerdoId: acuerdo.id,
          tipo: papel,
          hash,
          tamanoBytes: bytes.length,
          archivoNombre,
        },
        { status: 201 }
      )
    } catch (e) {
      if (e instanceof Error && e.message === YA_TIENE_ESE_PAPEL) {
        // Otra subida ganó la carrera. El archivo que esta petición acaba de subir
        // usa un pathname PROPIO (lleva su id de documento), así que borrarlo no
        // toca los bytes del papel que quedó archivado.
        const borrado = await borrarElArchivoSubido(pathname, acuerdo.id)
        logger.warn(
          { acuerdoId: acuerdo.id, borrado },
          "[api/acuerdos/documento] otra subida archivó este papel del acuerdo"
        )
        return jsonError(
          409,
          "El acuerdo ya tiene este papel subido al archivo legal: cada papel se sube una sola vez."
        )
      }
      ultimoError = e
      // Sólo el choque del contador de versiones se reintenta, y una vez.
      if (!esChoqueDeIndiceUnico(e) || intento === MAXIMO_INTENTOS_DE_ARCHIVO) break
    }
  }

  // La transacción no se pudo aplicar: el archivo que se subió se borra para no
  // dejar un huérfano en el depósito que ninguna fila pueda volver a leer.
  const borrado = await borrarElArchivoSubido(pathname, acuerdo.id)
  logger.error(
    { err: ultimoError, acuerdoId: acuerdo.id, borrado },
    "[api/acuerdos/documento] la transacción del papel firmado no se pudo aplicar"
  )
  return jsonError(500, "Error interno del servidor.")
}

/**
 * Borra el archivo recién subido, sin romper la respuesta por un fallo del borrado.
 *
 * Si el depósito no confirma el borrado, el archivo queda: se registra para poder
 * limpiarlo, pero el error que se responde es el del trámite (el usuario no puede
 * hacer nada con «no se pudo borrar el archivo»).
 */
async function borrarElArchivoSubido(
  pathname: string,
  acuerdoId: string
): Promise<boolean> {
  try {
    return await borrarArchivoPrivado({ pathname })
  } catch (e) {
    logger.error(
      { err: e, acuerdoId, pathname },
      "[api/acuerdos/documento] no se pudo borrar el archivo que quedó sin fila"
    )
    return false
  }
}
