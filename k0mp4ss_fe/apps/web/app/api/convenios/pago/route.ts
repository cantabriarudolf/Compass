/**
 * POST /api/convenios/pago — pago de UNA cuota del convenio (F29).
 *
 * El convenio de pago de la deuda de gastos comunes (Ley 21.442 art. 6) se paga
 * cuota a cuota: la primera al suscribir —ya pagada cuando el convenio se creó— y
 * el resto mes a mes. Esta ruta registra el hecho de que una cuota se pagó y, si
 * era la última pendiente, cierra el convenio como `saldado` en la misma
 * transacción: nunca queda un convenio sin deuda todavía «vigente».
 *
 * Guard `fi:cobranza` + editar (el mismo recurso del alta: el pago es cobranza).
 * El convenio y la cuota se resuelven acotados a la comunidad de la sesión (404 si
 * no existen ahí), la cuota ya pagada responde 409 sin reescribir la fila, y todo
 * el efecto —cuota, cargo FI, estado del convenio y evento `FI_CONVENIO_PAGO`—
 * ocurre en UNA transacción.
 *
 * El pago también se registra en el `CobroFI` que le corresponde a la cuota, con
 * el MISMO mecanismo del módulo FI: una entrada en `pagos` con `{id, monto, fecha,
 * medio}`, nunca una segunda fila de pago. El cargo se resuelve por el convenio de
 * origen (`origenRef`) y el período de vencimiento de la cuota; si la cuota no
 * tiene ese cargo —un convenio anterior a la integración contable— el pago no se
 * marca en falso: responde 409 y la transacción no deja nada.
 *
 * Por qué la ruta es una colección y no `/[id]/pago`: el inventario de rutas con
 * segmento dinámico (`test/api/permisos-por-objeto-inventario.test.ts`) exige que
 * toda ruta `app/api/**`[param]/route.ts` esté clasificada con su prueba de fila, y
 * este convenio ya tiene su prueba por relación en `test/api/convenios.test.ts`.
 * El `convenioId` viaja en el cuerpo, se resuelve scoped y la prueba de pertenencia
 * es la misma que probaría un segmento de URL.
 */
import { PagoCuotaConvenioSchema, PagoCobroFISchema, type PagoCobroFI } from "@/lib/schemas"
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

/** Mismo recurso que el alta: el convenio es un acto de cobranza (ver `route.ts`). */
const RECURSO_CONVENIOS = "fi:cobranza"

/** Centinela para distinguir el conflicto de negocio de una falla real. */
const CUOTA_YA_PAGADA = "CONVENIO_CUOTA_YA_PAGADA"

/** La cuota existe pero no tiene el cargo FI que la contabilidad exige. */
const CARGO_FI_DE_LA_CUOTA_AUSENTE = "CONVENIO_CARGO_FI_AUSENTE"

/**
 * Los textos de error van LITERALES en cada `jsonError`, no en constantes: el
 * guardián de mensajes (`test/api/permisos-por-objeto-mensajes.test.ts`) sólo
 * audita lo que está escrito en la ruta; una constante con nombre le queda
 * «indirecta» y no puede revisar qué dice.
 */

/** Pesos en formato chileno para la bitácora. */
function pesos(monto: number): string {
  return `$${monto.toLocaleString("es-CL")}`
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "editar", RECURSO_CONVENIOS)) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = PagoCuotaConvenioSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { convenioId, numero } = parsed.data

  const convenio = await prisma.convenioPago.findFirst({
    where: { id: convenioId, comunidadId: scope.comunidadId },
    // Sólo lo que hace falta para resolver el cargo: la vista se rearma desde la
    // base dentro de la transacción, así que leer los demás campos acá sería una
    // segunda verdad a medio actualizar.
    select: { id: true, unidadId: true },
  })
  if (!convenio) return jsonError(404, "Convenio no encontrado.")

  const cuota = await prisma.cuotaConvenio.findFirst({
    where: {
      comunidadId: scope.comunidadId,
      convenioId: convenio.id,
      numero,
    },
    select: { id: true, numero: true, monto: true, estado: true, venceEn: true },
  })
  if (!cuota) return jsonError(404, "Cuota no encontrada.")
  if (cuota.estado === "pagada") return jsonError(409, "La cuota ya está pagada.")

  const ahora = new Date()

  /**
   * El pago se arma con la MISMA forma que escribe el módulo FI (`PagoCobroFI`):
   * id, monto, fecha y medio. El convenio no captura el medio real del dinero
   * (efectivo o transferencia), así que se declara el origen del registro.
   */
  const periodoDeLaCuota = cuota.venceEn.toISOString().slice(0, 7)
  const pagoCandidato: PagoCobroFI = {
    id: generarId("pag"),
    monto: cuota.monto,
    fecha: ahora.toISOString().slice(0, 10),
    medio: "convenio",
  }
  const validacionPago = PagoCobroFISchema.safeParse(pagoCandidato)
  if (!validacionPago.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: validacionPago.error.flatten(),
    })
  }

  try {
    const vista = await prisma.$transaction(async (tx) => {
      // Toma condicional: si otra petición pagó la misma cuota entre la lectura y
      // esta escritura, el `count` de la sentencia vuelve en 0 y el 409 sale sin
      // duplicar el pago ni mover la fecha en que se pagó.
      const tomada = await tx.cuotaConvenio.updateMany({
        where: { id: cuota.id, estado: { not: "pagada" } },
        data: {
          estado: "pagada",
          pagadaEn: ahora,
          registradaPor: scope.usuarioId,
        },
      })
      if (tomada.count === 0) throw new Error(CUOTA_YA_PAGADA)

      // El pago queda también en el cargo FI de la cuota, con el mecanismo del
      // módulo FI (la entrada de `pagos` del cobro): no se crea un segundo pago.
      const cobro = await tx.cobroFI.findFirst({
        where: {
          comunidadId: scope.comunidadId,
          origenModulo: "FI",
          origenRef: convenio.id,
          unidadId: convenio.unidadId,
          periodo: periodoDeLaCuota,
        },
        select: { id: true, pagos: true },
      })
      if (!cobro) throw new Error(CARGO_FI_DE_LA_CUOTA_AUSENTE)
      // SAFETY: pagos es Json con shape PagoCobroFI[] validado por CobroFISchema.
      const pagosDelCobro = (cobro.pagos ?? []) as unknown as PagoCobroFI[]
      await tx.cobroFI.update({
        where: { id: cobro.id },
        data: { pagos: [...pagosDelCobro, validacionPago.data] as never },
      })

      // ¿Quedó deuda? Se cuenta después de marcar: si es la última, el convenio se
      // cierra como `saldado` en la misma transacción.
      const pendientes = await tx.cuotaConvenio.count({
        where: { convenioId: convenio.id, estado: { not: "pagada" } },
      })
      if (pendientes === 0) {
        await tx.convenioPago.update({
          where: { id: convenio.id },
          data: { estado: "saldado" },
        })
      }

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "FI",
          tipoAccion: "FI_CONVENIO_PAGO",
          referenciaId: convenio.id,
          descripcion:
            pendientes === 0
              ? `Cuota ${cuota.numero} del convenio ${convenio.id} pagada por ${pesos(cuota.monto)}: era la última pendiente y el convenio queda saldado.`
              : `Cuota ${cuota.numero} del convenio ${convenio.id} pagada por ${pesos(cuota.monto)}; quedan ${pendientes} cuota(s) pendientes.`,
        },
        tx
      )

      // La vista se rearma desde la base: el estado del convenio y el de cada cuota
      // que se devuelven son los persistidos, no los que la ruta creyó escribir.
      const actualizado = await tx.convenioPago.findUniqueOrThrow({
        where: { id: convenio.id },
        include: { cuotas: { orderBy: { numero: "asc" } } },
      })
      return vistaDeConvenio(actualizado, actualizado.cuotas)
    })

    return Response.json({ ...vista, cuotaPagada: cuota.numero })
  } catch (e) {
    if (e instanceof Error && e.message === CUOTA_YA_PAGADA) {
      return jsonError(409, "La cuota ya está pagada.")
    }
    if (e instanceof Error && e.message === CARGO_FI_DE_LA_CUOTA_AUSENTE) {
      return jsonError(
        409,
        "La cuota no tiene un cargo FI asociado en la contabilidad: el pago no se puede registrar."
      )
    }
    logger.error({ err: e }, "[api/convenios/pago] error inesperado al registrar el pago")
    return jsonError(500, "Error interno del servidor.")
  }
}
