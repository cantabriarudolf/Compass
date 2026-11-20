/**
 * /api/certificados-ct/[id]/pdf — el certificado como documento descargable (F34).
 *
 * Existe por una razón medida: el residente no puede emitir su PDF en el navegador.
 * La pantalla lo armaba con `useConfiguracion` (membrete y firma de CF) y
 * `GET /api/configuracion` exige `cf`; abrirle `cf` le entregaría el SMTP y los
 * parámetros operativos de la comunidad. El papel lo sirve el servidor, con el
 * mismo patrón de F27 (`avisos-cobro/[id]/pdf`) y T10 (`liquidaciones/[id]/pdf`).
 *
 * GET usa las MISMAS reglas de lectura que el detalle y la colección —el único
 * `where` es `alcanceCertificadosCT`—:
 *
 * - gestión (`ct` ver): cualquier certificado de su comunidad;
 * - cualquier otro rol —el residente—: solo los de sus unidades con vínculo
 *   vigente o los emitidos a su persona. La fila ajena —o de otra comunidad—
 *   responde el 404 genérico y no produce documento: un PDF no puede ser la
 *   puerta por la que se lee el certificado del vecino.
 *
 * El documento sale del builder existente (`documentoCertificadoPDF`) sobre la
 * fila CONGELADA: `resumen` y `detalle` son el snapshot que se firmó, no se
 * recalculan acá y no hay un segundo builder que pueda contradecir el papel que
 * la administración emitió. La respuesta es el binario, con `application/pdf`, el
 * folio en el nombre del archivo y `no-store`: es un documento personal y no se
 * cachea en proxies ni en el navegador.
 *
 * La firma digitalizada llega como línea en blanco: `urlADataUrl` (Image + canvas)
 * es de navegador y en el servidor devuelve `null`, así que el documento conserva
 * el bloque de firma con el administrador responsable y sin la imagen. Es el mismo
 * criterio que `documentoLiquidacionPDF` documenta: una firma ausente no puede
 * impedir que el residente descargue su documento. La administración sigue usando
 * el camino del navegador, que sí la embebe.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { identidadDelPapel } from "@/app/api/configuracion/_lib/identidad-papel"
import { compilarPdf } from "@/lib/api/pdf-servidor"
import { documentoCertificadoPDF } from "@/lib/pdf-utils"
import { etiquetaDeTipoCertificado } from "@/lib/certificados-ct"
import { alcanceCertificadosCT } from "../../route"

type Ctx = { params: Promise<{ id: string }> }

/** Lo que el papel necesita de la fila; nada más se carga. */
const CAMPOS_DEL_PDF = {
  folio: true,
  codigoVerificacion: true,
  tipo: true,
  resumen: true,
  detalle: true,
  solicitanteNombre: true,
  fechaEmision: true,
} as const

/**
 * `certificado-CT-0001.pdf`.
 *
 * El folio es un correlativo del servidor (`CT-####`), pero se sanea igual: el
 * nombre entra en un header y un folio con comillas o saltos de línea rompería
 * `Content-Disposition`. Sin folio utilizable el archivo conserva un nombre
 * válido en vez de salir sin nombre.
 */
function nombreDeArchivo(folio: string): string {
  const seguro = folio.replace(/[^A-Za-z0-9_-]/g, "")
  return `certificado-${seguro || "CT-sin-folio"}.pdf`
}

/** Fila de `detalle` como la imprime el builder (clave/valor), tolerante a histórico. */
function detalleImprimible(detalle: unknown): [string, string][] {
  if (!Array.isArray(detalle)) return []
  return detalle.flatMap((fila) => {
    if (typeof fila !== "object" || fila === null) return []
    const { clave, valor } = fila as { clave?: unknown; valor?: unknown }
    if (typeof clave !== "string" || typeof valor !== "string") return []
    return [[clave, valor] as [string, string]]
  })
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "ver", "ct")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params
  try {
    // El filtro viaja en el `where`: la fila ajena NO se carga. Se usa `findFirst`
    // porque el alcance no es una clave única (`unidadId`/`personaId`).
    const alcance = await alcanceCertificadosCT(scope)
    const certificado = await prisma.certificadoCT.findFirst({
      where: { id, comunidadId: scope.comunidadId, ...(alcance ?? {}) },
      select: CAMPOS_DEL_PDF,
    })
    if (!certificado) return jsonError(404, "Registro no encontrado.")

    // La identidad del papel se resuelve en UN lugar (`identidadDelPapel`): sin
    // nombre real o sin firmante derivado no hay documento, se responde 409 y no
    // se compila ningún byte.
    const identidad = await identidadDelPapel(scope.comunidadId)
    if (!identidad.ok) return identidad.response
    const { institucional } = identidad.identidad
    if (!institucional) {
      // Sin identidad legal de la comunidad el papel no se puede afirmar: se
      // dice, en vez de servir un documento incompleto.
      return jsonError(
        409,
        "La comunidad no tiene configuración registrada: sin ella no se puede armar el certificado."
      )
    }

    const etiqueta = etiquetaDeTipoCertificado(certificado.tipo)
    // SAFETY: el detalle es el `Json` que validó `CertificadoCTSchema` al
    // emitirse; el cast sólo adapta los `Json` de Prisma y no cambia ningún valor.
    const definicion = await documentoCertificadoPDF({
      tipo: etiqueta,
      titulo: etiqueta,
      folio: certificado.folio,
      codigoVerificacion: certificado.codigoVerificacion,
      fechaEmision: certificado.fechaEmision,
      parrafos: [certificado.resumen],
      detalle: detalleImprimible(certificado.detalle),
      solicitanteNombre: certificado.solicitanteNombre,
      config: institucional,
    })
    const bytes = await compilarPdf(definicion)

    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${nombreDeArchivo(certificado.folio)}"`,
        "content-length": String(bytes.length),
        "cache-control": "no-store",
      },
    })
  } catch (e) {
    logger.error(
      { err: e, certificadoId: id },
      "[api/certificados-ct/[id]/pdf] error inesperado"
    )
    return jsonError(500, "Error interno del servidor.")
  }
}
