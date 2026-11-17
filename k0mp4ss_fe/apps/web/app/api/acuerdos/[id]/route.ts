/**
 * /api/acuerdos/[id] — cierre del acuerdo PRESENCIAL: el resultado se PROCLAMA
 * en la sala y se registra como se proclamó (S2, pedido textual del owner L1).
 *
 * Un acuerdo presencial no tiene votos por persona: `VotoAcuerdo` queda vacío
 * a propósito — es el modelo, no un olvido. Lo que la sala declaró entra en el
 * body (`resultado`: a favor, en contra, abstenciones, presentes y si se
 * alcanzó el quórum) y queda registrado verbatim en `Acuerdo.resultado`; la
 * resolución lo contrasta con la regla APLICADA (`quorumRequerido`), que el
 * sistema registra y contrasta, no recalcula. La regla pura es
 * `resolucionPresencial` (lib/acuerdos.ts); el estado y `resueltoEn` se
 * escriben acá, en la MISMA transacción que el resultado y la auditoría.
 *
 * Compuertas, en orden 401 → 403 → 404 → 409:
 * - S1: cerrar un presencial SIN acta firmada archivada en la comunidad → 409
 *   literal. El acta es el papel que respalda los libros físicos (la subida al
 *   archivo legal como `Documento` es la unidad T2); lo que el sistema exige
 *   acá es que el acta referenciada exista en ESTA comunidad, esté publicada
 *   en el libro y tenga su folio.
 * - S5: un acuerdo ya resuelto responde 409 a cualquier intento de cerrarse
 *   otra vez: el resultado y los papeles son inmutables, el acta archivada con
 *   folio es lo que congela lo declarado. La garantía de la carrera es la toma
 *   condicional (`estado: "abierto"`) dentro de la transacción: si otra
 *   resolución ganó, no se reescribe nada.
 * - S4: un acuerdo `electronica` no se proclama — se resuelve con los votos
 *   (409). Es el pin del camino electrónico: nada de lo existente cambia.
 *
 * El `actaId` del body es opcional: si no viene, se usa el del acuerdo. Un
 * acuerdo puede nacer con el acta en borrador (la sesión recién terminó) y
 * cerrarse cuando esa acta quedó publicada en el libro: el cierre es el acto
 * que deja el resultado y su acta juntos, no una edición.
 *
 * No hay PUT ni DELETE: el acuerdo resuelto no se reescribe por API (S5), y el
 * electrónico no tiene cierre — resuelve en `[id]/voto` como siempre.
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { IdEntidadSchema } from "@/lib/schemas"
import {
  esQuorumDelAcuerdo,
  resolucionPresencial,
  type ResultadoDelAcuerdo,
} from "@/lib/acuerdos"
import { puedeGestionarAcuerdos } from "../_guard"

type Ctx = { params: Promise<{ id: string }> }

/**
 * El acta del resultado proclamado, tal como la sala la declaró. Los números
 * son los del acta (personas en el comité, derechos ponderados en la asamblea):
 * el sistema los registra, no los reinterpretan.
 */
const ResultadoProclamadoSchema = z.object({
  aFavor: z
    .number({ required_error: "El conteo a favor es obligatorio." })
    .finite("El conteo a favor debe ser un número finito.")
    .min(0, "El conteo a favor no puede ser negativo."),
  enContra: z
    .number({ required_error: "El conteo en contra es obligatorio." })
    .finite("El conteo en contra debe ser un número finito.")
    .min(0, "El conteo en contra no puede ser negativo."),
  abstenciones: z
    .number({ required_error: "El conteo de abstenciones es obligatorio." })
    .finite("El conteo de abstenciones debe ser un número finito.")
    .min(0, "El conteo de abstenciones no puede ser negativo."),
  presentes: z
    .number({ required_error: "El conteo de presentes es obligatorio." })
    .finite("El conteo de presentes debe ser un número finito.")
    .min(0, "El conteo de presentes no puede ser negativo."),
  quorumAlcanzado: z.boolean({
    required_error:
      "La proclama del quórum es obligatoria: la sala declaró si se alcanzó la mayoría exigida.",
  }),
})

const CierrePresencialSchema = z.object({
  resultado: ResultadoProclamadoSchema,
  // El acta firmada archivada que respalda lo proclamado. Si el acuerdo ya la
  // declara, basta con el resultado; si no, el cierre la trae.
  actaId: IdEntidadSchema.optional(),
})

type Desenlace =
  | { ok: true; computo: ResultadoDelAcuerdo }
  | { ok: false; status: 404 | 409 }

/** POST cierra el acuerdo presencial con el resultado proclamado en sala. */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puedeGestionarAcuerdos(scope.rol, "crear")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params

  const body: unknown = await request.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parsed = CierrePresencialSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const proclamado = parsed.data.resultado
  const actaIdDelCuerpo = parsed.data.actaId

  const acuerdo = await prisma.acuerdo.findFirst({
    where: { id, comunidadId: scope.comunidadId },
    select: {
      id: true,
      folio: true,
      modalidad: true,
      estado: true,
      actaId: true,
      quorumRequerido: true,
    },
  })
  // 404 sin filtrar existencia: un acuerdo de otra comunidad no se ve.
  if (!acuerdo) return jsonError(404, "Acuerdo no encontrado.")

  if (acuerdo.modalidad !== "presencial") {
    return jsonError(
      409,
      "El acuerdo no es presencial: se resuelve con los votos de la base, no se proclama en sala."
    )
  }

  if (acuerdo.estado !== "abierto") {
    return jsonError(
      409,
      "El acuerdo ya fue resuelto: su resultado y sus papeles no se editan ni se borran (el acta archivada con folio congela lo declarado)."
    )
  }

  // S1 — sin papel no hay acuerdo presencial: el acta firmada es obligatoria.
  // El sistema no genera la firma, la recibe; un acta en borrador no respalda.
  const actaId = actaIdDelCuerpo ?? acuerdo.actaId
  const acta = actaId
    ? await prisma.actaGD.findFirst({
        where: { id: actaId, comunidadId: scope.comunidadId },
        select: { id: true, folio: true, estado: true },
      })
    : null
  if (!acta || acta.estado !== "publicada" || !acta.folio) {
    return jsonError(
      409,
      "No se puede cerrar un acuerdo presencial sin su acta firmada archivada en esta comunidad."
    )
  }

  // Defensa, no camino: el alta valida la regla con zod (`QuorumAcuerdoSchema`),
  // así que una fila del libro siempre trae una regla reconocida. Si llegara
  // una fila corrupta, no se cierra con una regla que nadie declaró.
  if (!esQuorumDelAcuerdo(acuerdo.quorumRequerido)) {
    logger.error(
      { acuerdoId: acuerdo.id, quorumRequerido: acuerdo.quorumRequerido },
      "[api/acuerdos/cierre] regla de quórum desconocida en la fila del acuerdo"
    )
    return jsonError(500, "El acuerdo tiene una regla de quórum desconocida.")
  }

  const computo = resolucionPresencial({
    quorumRequerido: acuerdo.quorumRequerido,
    proclamado,
  })
  const ahora = new Date()

  try {
    const desenlace = await prisma.$transaction(async (tx): Promise<Desenlace> => {
      // Relectura dentro de la transacción: el estado puede haber cambiado
      // entre la lectura de arriba y este punto.
      const vigente = await tx.acuerdo.findFirst({
        where: { id, comunidadId: scope.comunidadId },
        select: { estado: true },
      })
      if (!vigente) {
        return { ok: false, status: 404 }
      }
      if (vigente.estado !== "abierto") {
        return { ok: false, status: 409 }
      }

      // Toma condicional (S5): si otra resolución ganó la carrera, no se
      // reescribe nada — ni estado, ni resultado, ni acta.
      const cerrado = await tx.acuerdo.updateMany({
        where: { id, comunidadId: scope.comunidadId, estado: "abierto" },
        data: {
          estado: computo.resultado,
          resueltoEn: ahora,
          // SAFETY: payload validado por CierrePresencialSchema; round-trip JSON
          // elimina undefined para InputJsonValue.
          resultado: JSON.parse(JSON.stringify(proclamado)) as never,
          actaId: acta.id,
        },
      })
      if (cerrado.count === 0) {
        return { ok: false, status: 409 }
      }

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "AD",
          tipoAccion: "AD_ACUERDO_CERRADO",
          referenciaId: id,
          descripcion: `Se cerró el acuerdo presencial ${acuerdo.folio} con el resultado proclamado en sala: ${proclamado.aFavor} a favor, ${proclamado.enContra} en contra, ${proclamado.abstenciones} abstenciones, ${proclamado.presentes} presentes; resolución ${computo.resultado} según la regla aplicada (${acuerdo.quorumRequerido}); acta ${acta.folio}.`,
        },
        tx
      )

      return { ok: true, computo }
    })

    if (!desenlace.ok) {
      // Cadenas literales en la llamada: el 404 y el 409 se redactan acá, no
      // viajan dentro del desenlace.
      if (desenlace.status === 404) {
        return jsonError(404, "Acuerdo no encontrado.")
      }
      return jsonError(
        409,
        "El acuerdo ya fue resuelto: su resultado y sus papeles no se editan ni se borran (el acta archivada con folio congela lo declarado)."
      )
    }
    return Response.json({ ok: true, resultado: desenlace.computo })
  } catch (e) {
    logger.error({ err: e }, "[api/acuerdos/cierre] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
