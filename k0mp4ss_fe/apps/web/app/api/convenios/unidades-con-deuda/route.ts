/**
 * /api/convenios/unidades-con-deuda — las unidades que un convenio puede
 * regularizar (F29).
 *
 * La pantalla del alta ofrecía TODAS las unidades de la comunidad
 * (`/api/unidades?pageSize=100`, recortado a 100 y sin búsqueda). Un convenio
 * regulariza la deuda VENCIDA de una unidad, así que la lista que la pantalla
 * ofrece es la de las unidades que tienen cobros vencidos: el resto no tiene nada
 * que convenir y elegirlas sólo produce un convenio de una deuda que no existe.
 *
 *   · guard `fi:cobranza` con `crear`: la acción que habilita el alta del
 *     convenio. Quien sólo audita la cobranza (`ver`) lee los convenios ya
 *     suscritos, no esta lista de candidatas;
 *   · la deuda es la que YA calcula el módulo FI: `morosidadPorUnidad` sobre
 *     `estadoDeCobro` (`lib/finanzas-utils.ts`), con una sola lectura de los
 *     cobros de la comunidad. No se reimplementa la regla acá: un cobro pagado no
 *     es deuda y uno que todavía no vence tampoco;
 *   · `q` filtra por los identificadores VISIBLES de la unidad (`numero` y
 *     `etiqueta`, los mismos del maestro) para que una comunidad de 500 unidades
 *     encuentre la suya; la búsqueda ACOTA el universo de morosas, nunca lo
 *     amplía;
 *   · la lista se recorta a `LIMITE_UNIDADES` y la respuesta declara `total` y
 *     `mostrados`, para que la pantalla no esconda lo que quedó fuera.
 *
 * La ruta es ESTÁTICA —sin segmento `[id]`— y comparte la compuerta del convenio,
 * no una clave nueva.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  morosidadPorUnidad,
  hoyISO,
} from "@/lib/finanzas-utils"
import type { CobroFI } from "@/lib/schemas"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"

/**
 * Recurso de la matriz que gobierna el convenio: `fi:cobranza` (la misma clave de
 * `app/api/convenios/route.ts`: esta lista existe para el alta, no es un catálogo
 * con permiso propio).
 */
const RECURSO_CONVENIOS = "fi:cobranza"

/**
 * Tope de unidades deudoras por respuesta: el mismo orden de magnitud que el
 * `LIMITE_SELECT` de los selects del repositorio. El total viaja en la respuesta
 * y la pantalla dice cuántas quedaron fuera.
 */
const LIMITE_UNIDADES = 50

export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "crear", RECURSO_CONVENIOS)) {
    return jsonError(403, "Permiso denegado.")
  }

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }
  const q = url.searchParams.get("q")?.trim() ?? ""

  try {
    // Dos consultas fijas: las unidades que pueden coincidir con el `q` y los
    // cobros de la comunidad. La deuda se deriva en memoria con la regla pura.
    const [unidades, cobros] = await Promise.all([
      prisma.unidad.findMany({
        where: {
          comunidadId: scope.comunidadId,
          ...(q === ""
            ? {}
            : {
                OR: [
                  { numero: { contains: q } },
                  { etiqueta: { contains: q } },
                ],
              }),
        },
        select: { id: true, numero: true, etiqueta: true },
        orderBy: { numero: "asc" },
      }),
      prisma.cobroFI.findMany({
        where: { comunidadId: scope.comunidadId },
        select: {
          id: true,
          unidadId: true,
          periodo: true,
          montoBase: true,
          moras: true,
          pagos: true,
          fechaVencimiento: true,
        },
      }),
    ])

    // SAFETY: `morosidadPorUnidad` sólo lee de cada cobro su unidad, su período, su
    // monto base, sus moras, sus pagos y su vencimiento —todos seleccionados
    // arriba—, los mismos helpers (`estadoDeCobro`/`saldoPendiente`) del tablero de
    // morosos y del trámite de corte.
    const cobrosDeLaComunidad = cobros as unknown as CobroFI[]
    const hoy = hoyISO()

    const conDeuda = unidades
      .map((unidad) => {
        const morosidad = morosidadPorUnidad(unidad.id, cobrosDeLaComunidad, hoy)
        return {
          unidadId: unidad.id,
          numero: unidad.numero,
          etiqueta: unidad.etiqueta,
          periodosVencidos: morosidad.periodosVencidos,
          deudaVencida: morosidad.deudaVencida,
        }
      })
      // Sólo las que tienen deuda VENCIDA: sin períodos vencidos no hay nada que
      // convenir y la unidad no se ofrece.
      .filter((fila) => fila.periodosVencidos > 0)
      // La más deudora primero; el número desempata para que el orden no dependa
      // del azar de la base.
      .sort(
        (a, b) => b.deudaVencida - a.deudaVencida || a.numero.localeCompare(b.numero)
      )

    const mostrados = Math.min(conDeuda.length, LIMITE_UNIDADES)

    return Response.json({
      data: conDeuda.slice(0, LIMITE_UNIDADES),
      total: conDeuda.length,
      limite: LIMITE_UNIDADES,
      mostrados,
    })
  } catch (e) {
    logger.error({ err: e }, "[api/convenios/unidades-con-deuda] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}
