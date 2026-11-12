/**
 * POST /api/cortes-servicio/ejecutar — cursar la suspensión de un corte
 * preavisado (F28, Ley 21.442 art. 20 N°9).
 *
 * La ejecución NO es un cambio de estado administrativo más: es el acto que deja a
 * la unidad sin servicio, así que el servidor vuelve a comprobar todo lo que la ley
 * exige, aunque el preaviso ya lo haya comprobado:
 *
 *   · el acuerdo del Comité sigue existiendo y sigue `aprobado` (un acuerdo
 *     revocado después del preaviso no autoriza nada);
 *   · la unidad sigue sin una persona ELECTRODEPENDIENTE registrada (el dato pudo
 *     registrarse DESPUÉS del preaviso, y la prohibición es del momento en que se
 *     corta);
 *   · ningún OTRO servicio está suspendido ahora (no pueden suspenderse dos a la
 *     vez);
 *   · el plazo del preaviso se cumplió: cinco días corridos contados desde el día
 *     del preaviso (ese día no cuenta).
 *
 * El estado se cambia con un `updateMany` CONDICIONAL (`estado = 'preaviso'`), no
 * con un `update` por id: si dos pedidos de ejecución llegan juntos, el segundo
 * actualiza cero filas y responde 409 en vez de re-ejecutar. La actualización y el
 * evento `FI_CORTE_EJECUTADO` van en la misma transacción.
 *
 * Guard `fi:cobranza` + editar (administración). El comité audita la cobranza por
 * el acuerdo; ejecutar es del administrador.
 */
import { CorteServicioEjecucionSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { cortePermitido, puedeEjecutarse } from "@/lib/cortes-servicio"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { vistaDeCorte } from "../_vista"

/** Mismo recurso que el preaviso: el corte es cobranza (ver `../route.ts`). */
const RECURSO_CORTES = "fi:cobranza"

/** Centinela del conflicto de estado (la fila cambió entre la lectura y el update). */
const CORTE_YA_NO_ESTA_EN_PREAVISO = "CORTE_NO_ESTA_EN_PREAVISO"

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope: ComunidadScope = resultado.scope

  if (!puede(scope.rol, "editar", RECURSO_CORTES)) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = CorteServicioEjecucionSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { corteId } = parsed.data

  // El corte se resuelve EN la comunidad de la sesión: el de otra comunidad no es
  // un dato ajeno que se ignora, es una fila que no existe (404).
  const corte = await prisma.corteServicio.findFirst({
    where: { id: corteId, comunidadId: scope.comunidadId },
  })
  if (!corte) return jsonError(404, "Corte de servicio no encontrado.")

  const unidad = await prisma.unidad.findFirst({
    where: { id: corte.unidadId, comunidadId: scope.comunidadId },
    select: { id: true, numero: true, electrodependiente: true },
  })
  if (!unidad) return jsonError(404, "Unidad no encontrada.")

  const acuerdo = await prisma.acuerdo.findFirst({
    where: { id: corte.acuerdoId, comunidadId: scope.comunidadId },
    select: { id: true, cuerpo: true, estado: true, folio: true },
  })
  if (!acuerdo) {
    return jsonError(
      400,
      "No se puede ejecutar el corte: el acuerdo del Comité no existe en esta comunidad."
    )
  }
  if (acuerdo.cuerpo !== "comite") {
    return jsonError(400, "No se puede ejecutar el corte: el acuerdo no es del Comité.")
  }
  if (acuerdo.estado !== "aprobado") {
    return jsonError(400, "No se puede ejecutar el corte: el acuerdo no está aprobado.")
  }

  // «Un servicio a la vez» se vuelve a medir, excluyendo este mismo corte: si otro
  // servicio quedó suspendido después del preaviso, este no se ejecuta.
  const otrosEjecutados = await prisma.corteServicio.count({
    where: {
      comunidadId: scope.comunidadId,
      unidadId: corte.unidadId,
      estado: "ejecutado",
      id: { not: corte.id },
    },
  })
  const otroServicioYaCortado = otrosEjecutados > 0

  // Las prohibiciones se miden con los datos de HOY, no con los del preaviso. El
  // texto va literal en cada `jsonError` y el test compara el cuerpo con el motivo
  // de la regla pura para la misma entrada (ver `../route.ts`). El segundo servicio
  // suspendido es un CONFLICTO con el estado de la unidad (409), no un pedido
  // inválido: sería correcto si el otro corte no estuviera vigente.
  const dictamen = cortePermitido({
    cuotasImpagas: corte.cuotasImpagas,
    electrodependiente: unidad.electrodependiente,
    deudaDeCatastrofe: false,
    otroServicioYaCortado,
  })
  if (!dictamen.permitido) {
    if (unidad.electrodependiente) {
      return jsonError(
        400,
        "No procede el corte: en la unidad reside una persona electrodependiente y la ley lo prohíbe en ese caso (Ley 21.442 art. 20 N°9)."
      )
    }
    if (otroServicioYaCortado) {
      return jsonError(
        409,
        "La unidad ya tiene otro servicio suspendido: no pueden suspenderse dos servicios a la vez (Ley 21.442 art. 20 N°9)."
      )
    }
    return jsonError(
      400,
      "No procede el corte: la ley exige tres o más cuotas impagas, continuas o discontinuas (Ley 21.442 art. 20 N°9)."
    )
  }

  const ahora = new Date()
  const ejecucion = puedeEjecutarse({
    fechaHabilitada: corte.fechaHabilitada,
    hoy: ahora,
    estado: corte.estado,
  })
  if (!ejecucion.ejecutable) {
    // El estado equivocado es un conflicto (409); el plazo incumplido, un pedido
    // que todavía no procede (400). El estado se evalúa antes que la fecha.
    if (corte.estado !== "preaviso") {
      return jsonError(
        409,
        "El corte ya no está en preaviso: no se puede ejecutar dos veces."
      )
    }
    return jsonError(
      400,
      "No se puede ejecutar el corte: el preaviso debe cumplir cinco días corridos y todavía no se cumplieron (Ley 21.442 art. 20 N°9)."
    )
  }

  try {
    const ejecutado = await prisma.$transaction(async (tx) => {
      const cambiadas = await tx.corteServicio.updateMany({
        where: { id: corte.id, comunidadId: scope.comunidadId, estado: "preaviso" },
        data: {
          estado: "ejecutado",
          ejecutadoPor: scope.usuarioId,
          ejecutadoEn: ahora,
        },
      })
      // Cero filas = otro pedido ya lo ejecutó (o lo revocó) entre la lectura y
      // esta escritura. No se ejecuta dos veces ni se pisa el estado nuevo.
      if (cambiadas.count === 0) throw new Error(CORTE_YA_NO_ESTA_EN_PREAVISO)

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "FI",
          tipoAccion: "FI_CORTE_EJECUTADO",
          referenciaId: corte.id,
          descripcion: `Se cursó la suspensión de ${corte.servicio} de la unidad ${unidad.numero} por ${corte.cuotasImpagas} cuota(s) impaga(s), cumplido el preaviso del ${corte.fechaPreaviso.toISOString()}; autorizado por el acuerdo ${acuerdo.folio} del Comité (Ley 21.442 art. 20 N°9).`,
        },
        tx
      )

      const fila = await tx.corteServicio.findUnique({ where: { id: corte.id } })
      if (!fila) throw new Error(CORTE_YA_NO_ESTA_EN_PREAVISO)
      return fila
    })

    return Response.json(
      vistaDeCorte(ejecutado, {
        unidadNumero: unidad.numero,
        acuerdoFolio: acuerdo.folio,
      })
    )
  } catch (e) {
    if (e instanceof Error && e.message === CORTE_YA_NO_ESTA_EN_PREAVISO) {
      return jsonError(
        409,
        "El corte ya no está en preaviso: no se puede ejecutar dos veces."
      )
    }
    logger.error({ err: e }, "[api/cortes-servicio/ejecutar] error inesperado al ejecutar el corte")
    return jsonError(500, "Error interno del servidor.")
  }
}
