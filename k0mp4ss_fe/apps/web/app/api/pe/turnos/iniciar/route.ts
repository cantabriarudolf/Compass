/**
 * /api/pe/turnos/iniciar — marca el inicio del turno de un trabajador.
 *
 * POST custom (`pe:cierre_turno` crear): paridad server-side con `iniciarTurnoPE`
 * del store legacy, que —igual que la UI— "valida el evento, no cronometra"
 * (CardDescription del panel de monitoreo). La transición NO escribe un modelo
 * nuevo: deja el evento `PE_START_SHIFT` que es la fuente del contador "Turnos
 * iniciados hoy" y de la auditoría. El cierre del turno sigue viviendo en
 * `/api/pe/cierres-turno` (colección ya desplegada).
 *
 * Authz: `pe:cierre_turno` crear — conserjería inicia/cierra turno; mantención y
 * residente no (403). El rol sale de la membresía, nunca del body.
 *
 * ESCRITURA (T17): el evento se escribe a nombre de la persona del payload, así que
 * un rol acotado solo puede iniciar el turno de SU persona. `rechazoDeAltaAjena`
 * (`lib/api/propiedad-de-alta.ts`) corre después del authz por clave y ANTES de cargar
 * la ficha o escribir nada: la persona ajena responde 404 «Registro no encontrado.» —el
 * 403 confirmaría que existe— y la bitácora no recibe ningún `PE_START_SHIFT` a su
 * nombre. La gestión inicia el turno de cualquiera.
 *
 * Mensajes idénticos al store: la paridad de textos es parte del contrato con
 * el usuario, no un detalle de estilo.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { rechazoDeAltaAjena } from "@/lib/api/propiedad-de-alta"
import {
  cargarPersonaPE,
  contextoAccionPE,
  leerDatosLaborales,
  RECURSO_TURNO_PE,
  registrarEventoPE,
} from "../../_acciones"

type CuerpoInicioTurno = { personaId?: unknown; jornadaId?: unknown }

/** POST registra el inicio de turno del trabajador en la jornada indicada. */
export async function POST(req: Request): Promise<Response> {
  const contexto = await contextoAccionPE(RECURSO_TURNO_PE, "crear")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto

  const body: CuerpoInicioTurno = await req.json().catch(() => ({}))
  const personaId = typeof body.personaId === "string" ? body.personaId.trim() : ""
  const jornadaId = typeof body.jornadaId === "string" ? body.jornadaId.trim() : ""
  if (!personaId || !jornadaId) {
    return jsonError(400, "Seleccione trabajador y jornada para iniciar el turno.")
  }

  // T17 (escritura): el turno de otra persona no se inicia por un rol acotado. Va
  // después del authz por clave (un rol sin `pe:cierre_turno` crear sigue viendo su
  // 403) y antes de leer la ficha: el 404 genérico no dice si la persona existe.
  const corto = await rechazoDeAltaAjena({ scope, pretension: { personaId } })
  if (corto) return corto

  try {
    const persona = await cargarPersonaPE(personaId, scope)
    if (!persona) {
      return jsonError(404, "El trabajador no existe en el Maestro de Personas.")
    }
    if (!leerDatosLaborales(persona)) {
      return jsonError(400, "La persona no tiene ficha laboral de PE.")
    }
    const jornada = await prisma.jornada.findUnique({ where: { id: jornadaId } })
    if (!jornada || jornada.comunidadId !== scope.comunidadId) {
      return jsonError(400, "jornadaId no existe en el maestro de jornadas.")
    }

    const evento = await registrarEventoPE(
      scope,
      "PE_START_SHIFT",
      personaId,
      `${persona.nombres} ${persona.apellidos} inicia turno (${jornada.nombre}).`
    )
    // SAFETY: `registrarEventoAuditoria` (INV-03, única puerta de la bitácora)
    // devuelve el evento validado; acá solo se lee su id.
    return Response.json({ ok: true, eventoId: (evento as { id: string }).id })
  } catch (e) {
    logger.error({ err: e }, "[api/pe/turnos/iniciar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
