/**
 * Alcance por filas de `ra/reservas` — el dueño de la reserva es
 * `ReservaRA.solicitantePersonaId`: la persona que la pidió.
 *
 * La matriz (`ra` ver) decide quién ENTRA a la ruta; este módulo decide qué
 * FILAS ve. La decisión de rol/identidad NO se reimplementa acá: sale de
 * `alcancePorFilasDeSesion` (`lib/api/sesion-persona.ts`), que distingue gestión
 * (sin restricción por fila), rol acotado con identidad («lo propio») y rol
 * acotado SIN identidad (falla cerrado: ninguna fila). La persona sale de la BD
 * de la sesión, nunca del body/query.
 *
 * Por qué la persona y no `unidadId`: la reserva se pide a nombre de quien
 * reserva, y `unidadId` es opcional en el modelo (una persona puede reservar sin
 * unidad). Acotar por unidad le abriría a cualquier miembro de la unidad las
 * reservas de los demás: la persona es el alcance más chico que conserva la
 * regla del dueño.
 *
 * La reserva ajena responde 404 «Registro no encontrado.» y no 403: el 403
 * confirmaría que la fila existe. La COLECCIÓN queda sin este alcance a
 * propósito: es el calendario de amenities que el residente necesita para ver
 * los tramos ocupados (`app/operaciones/reservas/page.tsx`) y de donde el
 * cliente deriva el folio siguiente. Lo que NO viaja por ahí es el detalle de
 * tercero —quién reservó, qué unidad, qué montos, qué cargo al Fondo de
 * Amenities—: eso lo redacta la proyección de respuesta (`proyectarReservaRA`,
 * T18), no el `where`. La decisión A del owner es que el residente ve la
 * OCUPACIÓN del calendario (qué tramo, de qué amenity, en qué estado) pero no la
 * identidad ni el dinero de la fila ajena.
 */
import type { Prisma } from "@prisma/client"
import { alcancePorFilasDeSesion } from "@/lib/api/sesion-persona"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

/**
 * Decisión de filas de `ra/reservas`, en tres estados:
 *
 * - `gestion`: el rol no está acotado por fila (administrador, comité) → sin
 *   fragmento de `where` y sin redacción.
 * - `propio`: rol acotado con identidad → el fragmento es su `personaId` y sus
 *   propias filas no se redactan.
 * - `denegada`: rol acotado SIN identidad MP → no hay «lo propio» que comparar
 *   (falla cerrado): el fragmento no matchea nada y toda fila ajena —esto es,
 *   toda fila— se redacta.
 */
type DecisionDeFilasReserva =
  | { tipo: "gestion" }
  | { tipo: "propio"; personaId: string }
  | { tipo: "denegada" }

/**
 * Memo de la decisión por `scope`, que `withComunidadScope` crea nuevo en cada
 * request: una sola resolución por petición, sin estado compartido entre
 * requests (la clave es el objeto de esa petición y el `WeakMap` no la retiene).
 * Sin el memo, la proyección de la colección resolvería la identidad una vez por
 * FILA (hasta 100 consultas por página).
 */
const decisiones = new WeakMap<ComunidadScope, Promise<DecisionDeFilasReserva>>()

/** Decisión de filas del actor, resuelta una vez por request (ver `decisiones`). */
function decisionDeFilasReserva(
  scope: ComunidadScope
): Promise<DecisionDeFilasReserva> {
  const previa = decisiones.get(scope)
  if (previa) return previa
  const nueva = resolverDecision(scope)
  decisiones.set(scope, nueva)
  return nueva
}

async function resolverDecision(
  scope: ComunidadScope
): Promise<DecisionDeFilasReserva> {
  const alcance = await alcancePorFilasDeSesion(scope)
  if (alcance.tipo === "comunidad") return { tipo: "gestion" }
  if (alcance.tipo === "denegado") return { tipo: "denegada" }
  return { tipo: "propio", personaId: alcance.personaId }
}

/**
 * Fragmento de «lo propio», o `null` si el actor ve la comunidad completa.
 *
 * Un rol acotado sin `personaId` no tiene «lo propio» que comparar, así que el
 * fragmento no matchea NADA (`{ id: { in: [] } }`): el detalle y el PUT
 * responden el 404 genérico en vez de abrirse la comunidad entera (fail-open).
 */
export async function alcanceReservasRA(
  scope: ComunidadScope
): Promise<Prisma.ReservaRAWhereInput | null> {
  const decision = await decisionDeFilasReserva(scope)
  if (decision.tipo === "gestion") return null
  if (decision.tipo === "denegada") return { id: { in: [] } }
  return { solicitantePersonaId: decision.personaId }
}

/**
 * Cancelación redactada: sobreviven los hechos del TRAMO (`fecha`, `tardia`) y la
 * penalización viaja en `null` porque es dinero. El `motivo` —texto libre del
 * administrador sobre la solicitud ajena— no viaja: la lista es de campos que se
 * conservan, no de campos que se borran, así que un campo nuevo del modelo no se
 * filtra por olvido.
 */
function redactarCancelacion(
  cancelacion: unknown
): Record<string, unknown> | null {
  if (!cancelacion || typeof cancelacion !== "object") return null
  const c = cancelacion as { fecha?: unknown; tardia?: unknown }
  return { fecha: c.fecha ?? null, tardia: c.tardia ?? null, penalizacion: null }
}

/**
 * Proyección de la COLECCIÓN (`CrudConfig.proyeccion` de la factory): redacta la
 * fila AJENA para un actor acotado por fila y devuelve intactas la propia y las
 * de gestión.
 *
 * Qué se conserva de la fila ajena —la OCUPACIÓN que el calendario necesita—:
 * `id`, `folio`, `elementoId`, `fecha`, `horaInicio`, `horaFin`, `estado`,
 * `comunidadId` y los timestamps. El `folio` se conserva a propósito: es un
 * correlativo por comunidad que no nombra a nadie, y el cliente lo necesita para
 * derivar el folio siguiente del alta (misma regla que `siguienteFolioRA`).
 *
 * Qué se redacta, en `null`:
 * - `solicitantePersonaId` / `unidadId`: quién reservó y para qué unidad.
 * - `montoTarifa` / `montoGarantia`: lo que costó.
 * - `cargoFIReferencia`: identifica un `CargoFI` concreto, que pertenece a la
 *   unidad de la fila ajena; su único uso en pantalla es el aviso «cargo
 *   pendiente», que afirmaría algo sobre la deuda de otro. No viaja.
 * - `garantiaRetenida`: objeto de dinero (monto) con texto libre del caso ajeno.
 * - `cancelacion.penalizacion`: dinero; los hechos del tramo sí se conservan.
 */
export async function proyectarReservaRA(
  fila: Record<string, unknown>,
  scope: ComunidadScope
): Promise<Record<string, unknown>> {
  const decision = await decisionDeFilasReserva(scope)
  if (decision.tipo === "gestion") return fila
  if (
    decision.tipo === "propio" &&
    fila.solicitantePersonaId === decision.personaId
  ) {
    return fila
  }
  return {
    ...fila,
    solicitantePersonaId: null,
    unidadId: null,
    montoTarifa: null,
    montoGarantia: null,
    cargoFIReferencia: null,
    garantiaRetenida: null,
    cancelacion: redactarCancelacion(fila.cancelacion),
  }
}
