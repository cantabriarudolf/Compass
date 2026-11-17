/**
 * POST /api/convenios/anular — la anulación del convenio de pago (F29 · S1).
 *
 * Anular NO borra: el convenio queda `anulado` y el libro conserva la traza.
 * Las cuotas IMPAGAS (pendientes o vencidas) pasan a `anulada`, las PAGADAS
 * quedan pagadas —esa plata entró y su cargo sigue siendo un cobro válido— y
 * los cargos FI de las cuotas anuladas quedan en el libro con la fecha de la
 * anulación (`CobroFI.anuladoEn`), para que cualquier lectura posterior pueda
 * distinguirlos de un cargo vigente. El evento `FI_CONVENIO_ANULADO` guarda el
 * motivo y el conteo de cuotas anuladas, en la MISMA transacción que escribe.
 *
 * Reglas que se sostienen acá y no en la voluntad de quien llama:
 *
 *   · la ejerce administración con `fi:cobranza` editar (el mismo recurso del
 *     alta y del pago: anular por incumplimiento es un acto de administración).
 *     NO se exige acuerdo del Comité: el acuerdo autorizó CELEBRAR el convenio
 *     (Ley 21.442 art. 6); ponerle fin por incumplimiento no lo reemplaza;
 *   · un convenio `saldado` no se anula (409): es historia, la deuda se pagó;
 *     un convenio ya anulado tampoco (409). Sólo `vigente` o `incumplido`
 *     pueden anularse;
 *   · el MOTIVO es obligatorio (400 con su mensaje): el libro de la comunidad
 *     no registra un acto de administración sin su porqué;
 *   · el convenio de OTRA comunidad no existe (404), y ese 404 corre ANTES del
 *     409 por estado y del 400 por motivo: mirar un id ajeno no puede revelar
 *     ni su estado ni si el pedido traía motivo.
 *
 * Guard `fi:cobranza` + editar. El orden de compuertas es el del `DELETE` de
 * certificados CT y el del pago: scope (401) → permiso (403) → pertenencia a
 * la comunidad (404) → estado (409) → motivo (400).
 *
 * Por qué la ruta es una subruta estática y no dinámica: el inventario de rutas
 * con segmento dinámico (`test/api/permisos-por-objeto-inventario.test.ts`)
 * exige clasificar toda ruta de la API con segmento dinámico con su prueba de
 * fila. El
 * `convenioId` viaja en el cuerpo y se resuelve scoped, con la MISMA prueba de
 * pertenencia que probaría un segmento de URL (igual que `/pago` y `/documento`).
 *
 * Esquema local: sólo esta ruta anula convenios, así que su contrato de cuerpo
 * vive acá y no en `lib/schemas.ts`, donde están los esquemas que comparten las
 * tres rutas de `/api/convenios`.
 */
import { z } from "zod"
import { IdEntidadSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { vistaDeConvenio } from "../_vista"

/** Mismo recurso que el alta y el pago: el convenio es un acto de cobranza. */
const RECURSO_CONVENIOS = "fi:cobranza"

/** Centinela para distinguir el conflicto de negocio de una falla real. */
const CONVENIO_NO_DISPONIBLE = "CONVENIO_NO_DISPONIBLE"

/**
 * El `convenioId` tiene forma válida y la pertenencia a la comunidad se resuelve
 * ANTES de exigir el motivo: el 404 de un convenio ajeno no compite con el 400.
 * El motivo se valida aparte, después de los 409 por estado, con su mensaje
 * literal en la llamada.
 */
const AnulacionConvenioSchema = z.object({
  convenioId: IdEntidadSchema,
})

/**
 * Tope del motivo: el evento de auditoría lo guarda en su descripción y un
 * texto sin techo no es una glosa, es un volcado. La pantalla corta en el mismo
 * límite; la ruta decide, no confía.
 */
const MAXIMO_MOTIVO = 500

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "editar", RECURSO_CONVENIOS)) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  if (typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Datos inválidos.")
  }
  const pedido = body as Record<string, unknown>

  const parsed = AnulacionConvenioSchema.safeParse({ convenioId: pedido.convenioId })
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { convenioId } = parsed.data

  // El convenio se resuelve EN la comunidad de la sesión: el id de otra comunidad
  // no es un dato ajeno que se ignora, es una fila que no existe (404). Esta
  // lectura corre ANTES de los 409 por estado y del 400 por motivo.
  const convenio = await prisma.convenioPago.findFirst({
    where: { id: convenioId, comunidadId: scope.comunidadId },
    select: { id: true, unidadId: true, estado: true },
  })
  if (!convenio) return jsonError(404, "Convenio no encontrado.")

  // El estado decide si hay algo que anular. Un saldado es historia: la plata
  // entró y su fila no se reescribe. Un anulado ya pasó por esta ruta.
  if (convenio.estado === "saldado") {
    return jsonError(409, "El convenio está saldado: su historia no se anula.")
  }
  if (convenio.estado === "anulado") {
    return jsonError(409, "El convenio ya está anulado.")
  }

  // El motivo, después del 404 y del 409: exigirlo antes dejaría que un cuerpo
  // sin motivo compitiera con la pertenencia del convenio.
  const motivoBruto = pedido.motivo
  if (typeof motivoBruto !== "string" || motivoBruto.trim() === "") {
    return jsonError(400, "El motivo de la anulación es obligatorio.")
  }
  const motivo = motivoBruto.trim()
  if (motivo.length > MAXIMO_MOTIVO) {
    return jsonError(
      400,
      "El motivo de la anulación no puede superar los 500 caracteres."
    )
  }

  const ahora = new Date()

  try {
    const vista = await prisma.$transaction(async (tx) => {
      // Toma condicional: sólo `vigente` o `incumplido` se anulan. Si otra
      // petición saldó o anuló el convenio entre la lectura y esta escritura,
      // el `count` vuelve en 0 y el 409 sale sin escribir nada.
      const tomado = await tx.convenioPago.updateMany({
        where: {
          id: convenio.id,
          comunidadId: scope.comunidadId,
          estado: { in: ["vigente", "incumplido"] },
        },
        data: { estado: "anulado" },
      })
      if (tomado.count === 0) throw new Error(CONVENIO_NO_DISPONIBLE)

      // Las cuotas impagas del convenio: las que el convenio NO cobró. La cuota
      // 0 nació pagada al suscribir y una pagada no se toca (esa plata entró).
      const impagas = await tx.cuotaConvenio.findMany({
        where: {
          convenioId: convenio.id,
          comunidadId: scope.comunidadId,
          estado: { in: ["pendiente", "vencida"] },
        },
        select: { numero: true, venceEn: true },
        orderBy: { numero: "asc" },
      })

      // Impagas → `anulada`, SIN borrarse: el libro conserva la traza. El conteo
      // del `updateMany` es el que declara el evento (las filas realmente
      // reescritas, no las que la ruta creyó leer).
      const anuladas = await tx.cuotaConvenio.updateMany({
        where: {
          convenioId: convenio.id,
          comunidadId: scope.comunidadId,
          estado: { in: ["pendiente", "vencida"] },
        },
        data: { estado: "anulada" },
      })

      // La marca en el libro: los cargos FI de las cuotas anuladas quedan con la
      // fecha de la anulación. Cada cuota 1..N tiene un cargo con el período del
      // mes en que vence (el mismo por el que el pago lo encuentra); los cargos
      // de las cuotas pagadas NO se marcan.
      const periodosImpagas = [
        ...new Set(impagas.map((cuota) => cuota.venceEn.toISOString().slice(0, 7))),
      ]
      if (periodosImpagas.length > 0) {
        await tx.cobroFI.updateMany({
          where: {
            comunidadId: scope.comunidadId,
            origenModulo: "FI",
            origenRef: convenio.id,
            unidadId: convenio.unidadId,
            periodo: { in: periodosImpagas },
            anuladoEn: null,
          },
          data: { anuladoEn: ahora },
        })
      }

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "FI",
          tipoAccion: "FI_CONVENIO_ANULADO",
          referenciaId: convenio.id,
          descripcion: `Convenio ${convenio.id} anulado por ${scope.usuarioId} con el motivo: ${motivo}. Se anularon ${anuladas.count} cuota(s) impaga(s) sin borrarlas, con sus cargos marcados en el libro; las cuotas ya pagadas quedan pagadas (esa plata entró).`,
        },
        tx
      )

      // La vista se rearma desde la base: el estado del convenio y el de cada
      // cuota que se devuelven son los persistidos, no los que la ruta creyó
      // escribir.
      const actualizado = await tx.convenioPago.findUniqueOrThrow({
        where: { id: convenio.id },
        include: { cuotas: { orderBy: { numero: "asc" } } },
      })
      return { vista: vistaDeConvenio(actualizado, actualizado.cuotas), conteo: anuladas.count }
    })

    return Response.json({ ...vista.vista, cuotasAnuladas: vista.conteo })
  } catch (e) {
    if (e instanceof Error && e.message === CONVENIO_NO_DISPONIBLE) {
      return jsonError(409, "El convenio ya no se puede anular: su estado cambió.")
    }
    logger.error({ err: e }, "[api/convenios/anular] error inesperado al anular el convenio")
    return jsonError(500, "Error interno del servidor.")
  }
}
