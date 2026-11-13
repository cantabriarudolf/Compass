/**
 * /api/convenios/documento — el PAPEL FIRMADO del convenio de pago (F29 · V5).
 *
 * Ley 21.442 art. 6: el administrador puede celebrar convenios de pago con los
 * copropietarios morosos, y el reglamento de la ley exige que consten por escrito y
 * con la firma del deudor (art. 6 inc. 4; Reglamento art. 9). El instrumento vale
 * por la FIRMA, así que el sistema no lo genera: el papel se firma a mano, la
 * administración lo escanea y esta ruta lo archiva como `Documento` legal en el
 * archivo de la comunidad, con el binario en el depósito privado.
 *
 * Las reglas que se sostienen acá y no en la voluntad de quien llama:
 *
 *   · el convenio se resuelve EN la comunidad de la sesión y el de otra comunidad
 *     no es un dato ajeno que se ignora: es una fila que no existe (404);
 *   · el papel se sube UNA sola vez por convenio: un segundo intento responde 409 y
 *     NO toca el documento ya archivado (la firma no se reemplaza);
 *   · lo que entra tiene que ser un PDF de verdad —se miran los BYTES, no el
 *     nombre—, porque el archivo legal guarda el escaneo y un archivo con otro
 *     formato no se puede abrir como papel firmado (400 con el motivo);
 *   · el tamaño y el hash salen de los bytes, y lo que se archiva como URL es el
 *     pathname del depósito: NUNCA una URL pública (el store es privado);
 *   · la constancia de entrega al deudor nace `pendiente`, con su motivo: el
 *     contrato de los envíos admite `entregado` SÓLO si el servidor aceptó el
 *     mensaje, y acá no se cursa ningún envío.
 *
 * ── El orden importa: archivo primero, transacción después ──────────────────
 *
 * El PDF se sube ANTES de abrir la transacción que escribe. Si la subida falla, no
 * se escribe nada (ni documento, ni vínculo en el convenio, ni constancia, ni
 * evento). Si la transacción falla después de subir, el archivo se BORRA del
 * depósito: dejar un PDF huérfano que ninguna fila menciona sería basura en el
 * archivo, y dejar el vínculo sin sus bytes sería un documento que no se puede
 * servir.
 *
 * ── Ruta estática ───────────────────────────────────────────────────────────
 *
 * El convenio viaja en el cuerpo (POST) y en la query (GET), no en un segmento
 * `[id]`: el inventario de permisos por objeto clasifica las rutas con segmento
 * dinámico y este papel se lee con la MISMA compuerta que el convenio
 * (`fi:cobranza`), no con una compuerta nueva.
 *
 * - POST (guard `fi:cobranza` editar): administración sube el escaneo.
 * - GET (guard `fi:cobranza` ver): administración y comité —que audita la
 *   cobranza— descargan el papel; el residente NO, porque el documento lleva el
 *   nombre del deudor y su deuda. Se sirve con `no-store`.
 */
import { ConvenioDocumentoSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { claveEnvioDocumento } from "@/app/api/documentos/_lib/envio-documento"
import {
  borrarArchivoPrivado,
  descargarArchivoPrivado,
  subirArchivoPrivado,
  ErrorDelDeposito,
} from "@/lib/almacen-documentos"
import {
  CANAL_DE_LA_CONSTANCIA_DEL_CONVENIO,
  MIME_DEL_CONVENIO,
  MOTIVO_CONSTANCIA_PENDIENTE,
  TIPO_DOCUMENTAL_CONVENIO,
  esPdf,
  esRutaDelConvenioFirmado,
  glosaDelConvenioFirmado,
  hashDelArchivo,
  nombreDelConvenioFirmado,
  referenciaAutenticaDelConvenio,
  rutaDelConvenioFirmado,
  tamanoEnKB,
} from "@/lib/convenio-documento"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"

/**
 * Recurso de la matriz que gobierna el convenio: `fi:cobranza`.
 *
 * El papel firmado es parte del convenio, así que comparte su compuerta: subirlo es
 * `editar` (administración celebra y archiva) y leerlo es `ver` (el comité audita
 * la cobranza). No se declara una clave nueva para el archivo: la lectura del papel
 * no puede quedar más abierta que la del convenio al que pertenece.
 */
const RECURSO_CONVENIOS = "fi:cobranza"

/** Centinela para distinguir el conflicto de negocio de una falla real. */
const YA_TIENE_DOCUMENTO = "CONVENIO_YA_TIENE_DOCUMENTO"

/**
 * Intentos de la transacción del archivo.
 *
 * El único choque esperable es el contador de versiones del archivo legal:
 * `version` se numera dentro de (comunidad, tipo documental) y dos altas
 * simultáneas pueden leer el mismo máximo y chocar contra el índice único
 * (`P2002`). El reintento es seguro porque la transacción fallida no deja nada
 * escrito y el archivo ya subido se reutiliza: se reintenta la escritura, NUNCA la
 * subida.
 */
const MAXIMO_INTENTOS_DE_ARCHIVO = 2

/** ¿El error es el choque contra un índice único de la base? */
function esChoqueDeIndiceUnico(e: unknown): boolean {
  return (e as { code?: string }).code === "P2002"
}

/** Constancia de entrega tal como viaja en la respuesta del alta. */
interface ConstanciaEnLaVista {
  readonly id: string
  readonly estado: string
  readonly personaId: string
  readonly motivo: string
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope: ComunidadScope = resultado.scope

  if (!puede(scope.rol, "editar", RECURSO_CONVENIOS)) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = ConvenioDocumentoSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const datos = parsed.data

  // El convenio se resuelve EN la comunidad de la sesión: el id de otra comunidad
  // no es un dato ajeno que se ignora, es una fila que no existe (404).
  const convenio = await prisma.convenioPago.findFirst({
    where: { id: datos.convenioId, comunidadId: scope.comunidadId },
    select: {
      id: true,
      unidadId: true,
      personaId: true,
      acuerdoId: true,
      fechaSuscripcion: true,
      documentoId: true,
    },
  })
  if (!convenio) return jsonError(404, "Convenio no encontrado.")

  // El papel se firma UNA vez: el escaneo que ya está en el archivo no se
  // reemplaza desde acá (una firma nueva es otro acto, no una edición del papel).
  if (convenio.documentoId) {
    return jsonError(
      409,
      "El convenio ya tiene su documento firmado: el papel firmado se sube una sola vez."
    )
  }

  const [unidad, persona, acuerdo] = await Promise.all([
    prisma.unidad.findFirst({
      where: { id: convenio.unidadId, comunidadId: scope.comunidadId },
      select: { numero: true },
    }),
    prisma.persona.findFirst({
      where: { id: convenio.personaId, comunidadId: scope.comunidadId },
      select: { nombreCompleto: true },
    }),
    prisma.acuerdo.findFirst({
      where: { id: convenio.acuerdoId, comunidadId: scope.comunidadId },
      select: { folio: true },
    }),
  ])
  if (!unidad) return jsonError(404, "Unidad no encontrada.")
  if (!persona) return jsonError(404, "Persona no encontrada.")
  if (!acuerdo) {
    // Sin el acuerdo que autoriza el convenio no hay referencia auténtica posible:
    // un papel legal sin origen verificable no se archiva.
    return jsonError(
      409,
      "El convenio no tiene el acuerdo del Comité que lo autoriza: el papel no se puede archivar sin su referencia auténtica."
    )
  }

  // El contenido NUNCA se persiste: se decodifica para medirlo, verificarlo y
  // subirlo. La base guarda metadatos y la ruta (D1).
  const bytes = Buffer.from(datos.contenidoBase64, "base64")
  if (!esPdf(bytes)) {
    return jsonError(
      400,
      "El archivo no es un PDF: el convenio se firma a mano y la administración lo escanea en PDF, así que un archivo con otro formato no entra al archivo legal."
    )
  }

  const hash = hashDelArchivo(bytes)
  const tamanoKB = tamanoEnKB(bytes)
  const archivoNombre = nombreDelConvenioFirmado(datos.nombreArchivo, convenio.id)
  const ahora = new Date()
  const fechaDelArchivo = ahora.toISOString().slice(0, 10)

  // Los ids se conocen ANTES de subir: el pathname del depósito se arma con ellos y
  // la fila que se escribirá después es exactamente la que apunta al archivo.
  const documentoId = generarId("doc")
  const envioId = generarId("env-doc")
  const pathname = rutaDelConvenioFirmado({
    comunidadId: scope.comunidadId,
    convenioId: convenio.id,
    documentoId,
  })

  // ── 1. El archivo, al depósito privado ─────────────────────────────────────
  try {
    await subirArchivoPrivado({ pathname, bytes, tipoMime: MIME_DEL_CONVENIO })
  } catch (e) {
    // Sin archivo no hay documento: no se escribe ni una fila.
    logger.error(
      { err: e, convenioId: convenio.id },
      "[api/convenios/documento] no se pudo subir el papel firmado al depósito"
    )
    return jsonError(
      502,
      "No se pudo guardar el archivo en el depósito de documentos: no se escribió ninguna fila."
    )
  }

  // ── 2. La transacción que lo archiva ───────────────────────────────────────
  const glosa = glosaDelConvenioFirmado({
    numeroUnidad: unidad.numero,
    deudorNombre: persona.nombreCompleto,
  })
  const referenciaAutentica = referenciaAutenticaDelConvenio({
    convenioId: convenio.id,
    acuerdoFolio: acuerdo.folio,
  })

  let ultimoError: unknown = null
  for (let intento = 1; intento <= MAXIMO_INTENTOS_DE_ARCHIVO; intento++) {
    try {
      const constancia = await prisma.$transaction<ConstanciaEnLaVista>(
        async (tx) => {
          // El vínculo se RECLAMA con una actualización condicional: el `where` exige
          // que el convenio siga sin documento, así que dos subidas simultáneas no
          // pueden archivar dos papeles (la segunda no reclama ninguna fila).
          const reclamado = await tx.convenioPago.updateMany({
            where: {
              id: convenio.id,
              comunidadId: scope.comunidadId,
              documentoId: null,
            },
            data: { documentoId },
          })
          if (reclamado.count === 0) throw new Error(YA_TIENE_DOCUMENTO)

          // La versión es la siguiente dentro de (comunidad, tipo documental), el
          // mismo contador con el que numera el archivo de la comunidad.
          const { _max } = await tx.documento.aggregate({
            where: {
              comunidadId: scope.comunidadId,
              tipoDocumental: TIPO_DOCUMENTAL_CONVENIO,
            },
            _max: { version: true },
          })

          // El PAPEL FIRMADO, como documento legal del archivo: el papel prueba un
          // acto de la administración y la firma del deudor, y lo legal no se edita.
          await tx.documento.create({
            data: {
              id: documentoId,
              comunidadId: scope.comunidadId,
              naturaleza: "legal",
              tipoDocumental: TIPO_DOCUMENTAL_CONVENIO,
              glosa,
              referenciaAutentica,
              archivoNombre,
              archivoTipoMime: MIME_DEL_CONVENIO,
              archivoTamanoKB: tamanoKB,
              // La URL archivada es el pathname del depósito privado, no un enlace
              // público: la lectura pasa por esta ruta, con su guard.
              archivoUrl: pathname,
              hash,
              version: (_max.version ?? 0) + 1,
              vigenteDesde: convenio.fechaSuscripcion.toISOString().slice(0, 10),
              subidoPorPersonaId: null,
            },
          })

          // La CONSTANCIA DE ENTREGA al deudor, en `pendiente`: esta unidad no cursa
          // ningún envío, y declarar `entregado` sin que el servidor aceptara el
          // mensaje sería escribir un hecho que no ocurrió.
          await tx.envioDocumento.create({
            data: {
              id: envioId,
              comunidadId: scope.comunidadId,
              documentoId,
              personaId: convenio.personaId,
              canal: CANAL_DE_LA_CONSTANCIA_DEL_CONVENIO,
              estado: "pendiente",
              fecha: fechaDelArchivo,
              motivo: MOTIVO_CONSTANCIA_PENDIENTE,
              notificacionId: null,
              // La clave es la del archivo de la comunidad (`claveEnvioDocumento`):
              // entregar el mismo documento a la misma persona por el mismo canal no
              // duplica la constancia.
              claveEnvio: claveEnvioDocumento({
                documentoId,
                personaId: convenio.personaId,
                canal: CANAL_DE_LA_CONSTANCIA_DEL_CONVENIO,
              }),
              reenvio: false,
            },
          })

          await registrarEventoAuditoria(
            {
              id: generarId("ev"),
              comunidadId: scope.comunidadId,
              timestamp: ahora.toISOString(),
              usuario: scope.usuarioId,
              categoria: "FI",
              tipoAccion: "FI_CONVENIO_DOCUMENTO_SUBIDO",
              referenciaId: convenio.id,
              descripcion: `Se archivó el papel firmado del convenio ${convenio.id} de la unidad ${unidad.numero} con ${persona.nombreCompleto} como documento legal ${documentoId}: PDF de ${bytes.length} byte(s), sha256 ${hash}, referencia del acuerdo ${acuerdo.folio} que lo autoriza (Ley 21.442 art. 6). Constancia de entrega ${envioId} al deudor en estado pendiente: el envío real todavía no se cursó.`,
            },
            tx
          )

          return {
            id: envioId,
            estado: "pendiente",
            personaId: convenio.personaId,
            motivo: MOTIVO_CONSTANCIA_PENDIENTE,
          }
        }
      )

      return Response.json(
        {
          id: documentoId,
          convenioId: convenio.id,
          hash,
          tamanoBytes: bytes.length,
          archivoNombre,
          constancia,
        },
        { status: 201 }
      )
    } catch (e) {
      if (e instanceof Error && e.message === YA_TIENE_DOCUMENTO) {
        // Otra subida ganó la carrera. El archivo que esta petición acaba de subir
        // usa un pathname PROPIO (lleva su id de documento), así que borrarlo no
        // toca los bytes del papel que quedó archivado.
        const borrado = await borrarElArchivoSubido(pathname, convenio.id)
        logger.warn(
          { convenioId: convenio.id, borrado },
          "[api/convenios/documento] otra subida archivó el papel firmado de este convenio"
        )
        return jsonError(
          409,
          "El convenio ya tiene su documento firmado: el papel firmado se sube una sola vez."
        )
      }
      ultimoError = e
      // Sólo el choque del contador de versiones se reintenta, y una vez.
      if (!esChoqueDeIndiceUnico(e) || intento === MAXIMO_INTENTOS_DE_ARCHIVO) break
    }
  }

  // La transacción no se pudo aplicar: el archivo que se subió se borra para no
  // dejar un huérfano en el depósito que ninguna fila pueda volver a leer.
  const borrado = await borrarElArchivoSubido(pathname, convenio.id)
  logger.error(
    { err: ultimoError, convenioId: convenio.id, borrado },
    "[api/convenios/documento] la transacción del papel firmado no se pudo aplicar"
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
  convenioId: string
): Promise<boolean> {
  try {
    return await borrarArchivoPrivado({ pathname })
  } catch (e) {
    logger.error(
      { err: e, convenioId, pathname },
      "[api/convenios/documento] no se pudo borrar el archivo que quedó sin fila"
    )
    return false
  }
}

export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", RECURSO_CONVENIOS)) {
    return jsonError(403, "Permiso denegado.")
  }

  // El convenio viaja en la query (no en el cuerpo) porque esto es una descarga: el
  // parámetro no cambia el alcance —el `where` lleva siempre la comunidad de la
  // sesión—, sólo elige qué papel de esta comunidad se sirve.
  const convenioId = (new URL(req.url).searchParams.get("convenioId") ?? "").trim()
  if (convenioId === "") {
    return jsonError(400, "No se indicó el convenio del documento.")
  }

  try {
    const convenio = await prisma.convenioPago.findFirst({
      where: { id: convenioId, comunidadId: scope.comunidadId },
      select: { id: true, documentoId: true },
    })
    if (!convenio) return jsonError(404, "Convenio no encontrado.")
    if (!convenio.documentoId) {
      // El convenio existe y su papel todavía no se escaneó: decirlo es más honesto
      // que servir un documento inventado.
      return jsonError(
        409,
        "El convenio no tiene documento firmado: primero se sube el papel que la administración escaneó."
      )
    }

    const documento = await prisma.documento.findFirst({
      where: { id: convenio.documentoId, comunidadId: scope.comunidadId },
      select: {
        id: true,
        archivoNombre: true,
        archivoTipoMime: true,
        archivoUrl: true,
        hash: true,
      },
    })
    if (!documento) {
      return jsonError(
        409,
        "El documento del convenio no está en el archivo de esta comunidad."
      )
    }
    // La ruta guardada se valida antes de pedirla: aceptar cualquier cadena dejaría
    // que una fila apunte a otro origen y que esta ruta lo pidiera con el token.
    if (!esRutaDelConvenioFirmado(documento.archivoUrl)) {
      return jsonError(
        409,
        "El documento del convenio no apunta al depósito privado: no se sirve desde otra ubicación."
      )
    }

    const bytes = await descargarArchivoPrivado({ pathname: documento.archivoUrl })

    // El nombre se vuelve a sanear antes de entrar en la cabecera: es el valor que se
    // guardó al archivar, pero la cabecera no confía en la fila.
    const nombre = nombreDelConvenioFirmado(documento.archivoNombre, convenio.id)

    // `no-store` porque es el papel firmado de un deudor con su deuda, y el tipo MIME
    // es el del archivo archivado (no el que responda el depósito).
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": documento.archivoTipoMime,
        "content-disposition": `attachment; filename="${nombre}"`,
        "content-length": String(bytes.length),
        "cache-control": "no-store",
      },
    })
  } catch (e) {
    if (e instanceof ErrorDelDeposito && e.estado === 404) {
      return jsonError(
        409,
        "El documento del convenio no está en el depósito privado."
      )
    }
    logger.error(
      { err: e, convenioId },
      "[api/convenios/documento] error inesperado al servir el papel firmado"
    )
    return jsonError(502, "No se pudo leer el documento desde el depósito de documentos.")
  }
}
