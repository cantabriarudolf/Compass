/**
 * /api/liquidaciones/[id]/pdf — la liquidación de sueldo como documento
 * descargable (T10 de la serie «Permisos por objeto»).
 *
 * GET sirve el PDF de la liquidación con las MISMAS reglas de lectura que el
 * detalle —las mismas que la colección, porque el `where` es uno solo
 * (`_alcance.ts`)—:
 *
 * - gestión (`pl` ver): cualquier liquidación de su comunidad;
 * - trabajador (`pl:propia` ver): solo la de SU persona. La de otro trabajador
 *   de la misma comunidad —y la de otra comunidad— responde el 404 genérico y
 *   no produce documento: un PDF no puede ser la puerta por la que se lee el
 *   sueldo del vecino.
 *
 * El documento sale del builder existente (`documentoLiquidacionPDF`) sobre la
 * fila CONGELADA: no se recalcula ninguna cifra acá y no hay un segundo builder
 * que pueda contradecir el papel que se emitió. La respuesta es el binario, con
 * `application/pdf`, período y folio en el nombre del archivo y `no-store`: es
 * un documento personal y no se cachea en proxies ni en el navegador.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import type { ConfiguracionGlobal, LiquidacionPL } from "@/lib/schemas"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { alcanceDeLectura, whereDeLiquidacion } from "../../_alcance"
import { COLUMNAS_DOCUMENTO, pdfDeLiquidacion } from "../../_documento"

type Ctx = { params: Promise<{ id: string }> }

/**
 * `liquidacion-2026-10-LIQ-0001.pdf`.
 *
 * El período y el folio los asigna el servidor (el folio es correlativo
 * `LIQ-####`), pero se sanean igual: el nombre entra en un header y un valor con
 * comillas o saltos de línea rompería `Content-Disposition`. Sin valor
 * utilizable el archivo conserva un nombre válido en vez de salir sin nombre.
 */
function nombreDeArchivo(periodo: string, folio: string): string {
  const seguro = (valor: string, vacio: string): string =>
    valor.replace(/[^A-Za-z0-9_-]/g, "") || vacio
  return `liquidacion-${seguro(periodo, "sin-periodo")}-${seguro(folio, "sin-folio")}.pdf`
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const alcance = await alcanceDeLectura(scope)
  if (!alcance.ok) return alcance.response

  const { id } = await ctx.params
  try {
    // El filtro viaja en el `where`: la fila ajena NO se carga. Se usa
    // `findFirst` porque el alcance del trabajador no es una clave única
    // (`trabajadorPersonaId`), y `null` —sin identidad MP— no hay fila posible.
    const where = whereDeLiquidacion(alcance, scope.comunidadId, id)
    if (!where) return jsonError(404, "Registro no encontrado.")
    const liq = await prisma.liquidacionPL.findFirst({ where })
    if (!liq) return jsonError(404, "Registro no encontrado.")

    // La persona dueña de la fila: el papel imprime su nombre y RUT. Si ya no
    // está registrada, el documento no puede afirmar quién lo recibe: se dice,
    // en vez de servir un papel incompleto.
    const trabajador = await prisma.persona.findFirst({
      where: { id: liq.trabajadorPersonaId, comunidadId: scope.comunidadId },
      select: { nombreCompleto: true, rut: true },
    })
    if (!trabajador) {
      return jsonError(
        409,
        "La persona de la liquidación no está registrada: sin ella no se puede armar el documento."
      )
    }

    const configuracion = await prisma.configuracionGlobal.findUnique({
      where: { comunidadId: scope.comunidadId },
      select: COLUMNAS_DOCUMENTO,
    })
    if (!configuracion) {
      // Sin identidad de la comunidad ni administrador responsable el papel no
      // se puede afirmar: mismo criterio que el aviso de cobro.
      return jsonError(
        409,
        "La comunidad no tiene configuración registrada: sin ella no se puede armar la liquidación."
      )
    }

    // SAFETY: la fila guardada es exactamente el snapshot que valida
    // `LiquidacionPLSchema` al crearse (`POST /api/liquidaciones`, safeParse
    // antes de persistir) y el builder solo lee los campos que el papel imprime;
    // los casts adaptan los `Json` de Prisma y la proyección de CF sin cambiar
    // ningún valor.
    const bytes = await pdfDeLiquidacion(
      liq as unknown as LiquidacionPL,
      trabajador,
      configuracion as unknown as ConfiguracionGlobal
    )

    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${nombreDeArchivo(liq.periodo, liq.folio)}"`,
        "content-length": String(bytes.length),
        "cache-control": "no-store",
      },
    })
  } catch (e) {
    logger.error(
      { err: e, liquidacionId: id },
      "[api/liquidaciones/[id]/pdf] error inesperado"
    )
    return jsonError(500, "Error interno del servidor.")
  }
}
