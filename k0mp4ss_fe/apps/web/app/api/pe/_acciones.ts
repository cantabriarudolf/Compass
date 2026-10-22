/**
 * _acciones.ts — utilidades compartidas de las TRANSICIONES PE (Personal).
 *
 * Módulo co-locado (no es una ruta de Next): resuelve el scope de comunidad, el
 * permiso sobre el recurso que corresponde a cada transición, carga la persona
 * o el trabajo scoped por comunidad y emite eventos de auditoría con el mismo
 * shape que `registrarEvento` del store legacy (categoría "PE", `usuario` =
 * usuario de la sesión, categoria/tipoAccion/referenciaId/descripcion).
 *
 * Decisiones del plan SERIE-FASE2 §V2 (no reinterpretar):
 * - `pe` para conserjería y mantención (ver/crear/editar): horas extra,
 *   completar tarea de monitoreo y enviar la proyección de costo.
 * - `pe:cierre_turno` para quien inicia/cierra turno (conserjería).
 * - Evaluaciones: SOLO administrador → recurso `pe:evaluacion`, declarado con
 *   Set vacío para el resto de los roles (menor privilegio explícito, corta el
 *   fallback de prefijo de `puede()`).
 *
 * El historial de horas extra y evaluaciones VIVE en la ficha laboral
 * (`Persona.datosLaborales` es una columna Json), así que no hizo falta ningún
 * modelo nuevo ni migración: se agrega una entrada al array y nunca se reescribe
 * lo ya registrado.
 */
import { puede, type Accion } from "@/lib/authz"
import type { EvaluacionPE, HoraExtraPE } from "@/lib/schemas"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
  type ScopeResult,
} from "@/lib/api/with-comunidad-scope"

/** Recurso RBAC de las transiciones operativas PE (conserjería y mantención). */
export const RECURSO_PE = "pe"
/** Recurso de quien inicia/cierra turno (conserjería). */
export const RECURSO_TURNO_PE = "pe:cierre_turno"
/** Recurso de las evaluaciones de desempeño: bloqueado para todo rol no-admin. */
export const RECURSO_EVALUACION_PE = "pe:evaluacion"

export type ContextoAccionPE =
  | { ok: true; scope: ComunidadScope }
  | { ok: false; response: Response }

/**
 * Contexto server-side de una transición PE: sesión + membresía + permiso sobre
 * el recurso indicado (por defecto `pe` con `editar`, que es lo que habilita una
 * transición de estado).
 */
export async function contextoAccionPE(
  recurso: string = RECURSO_PE,
  accion: Accion = "editar"
): Promise<ContextoAccionPE> {
  const resultado: ScopeResult = await withComunidadScope()
  if (!resultado.ok) return resultado
  if (!puede(resultado.scope.rol, accion, recurso)) {
    return { ok: false, response: jsonError(403, "Permiso denegado.") }
  }
  return { ok: true, scope: resultado.scope }
}

/** Forma mínima de la ficha laboral que estas transiciones leen y amplían. */
export interface DatosLaboralesPE extends Record<string, unknown> {
  horasExtras?: HoraExtraPE[]
  evaluaciones?: EvaluacionPE[]
}

/**
 * Ficha laboral de la persona como objeto plano.
 *
 * Devuelve `null` cuando la persona no tiene ficha de PE (el store legacy
 * respondía "La persona no tiene ficha laboral de PE."), de modo que las rutas
 * mantienen el mismo mensaje al usuario.
 */
export function leerDatosLaborales(
  persona: { datosLaborales: unknown }
): DatosLaboralesPE | null {
  const datos = persona.datosLaborales
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return null
  return datos as DatosLaboralesPE
}

/**
 * Carga la persona por id y exige que pertenezca a la comunidad del scope.
 * Devuelve `null` tanto si no existe como si es de otra comunidad: cada route
 * responde 404 sin filtrar existencia (mismo contrato que el resto de la API).
 */
export async function cargarPersonaPE(
  id: string,
  scope: ComunidadScope,
  client: ClientePE = prisma
) {
  const persona = await client.persona.findUnique({ where: { id } })
  if (!persona || persona.comunidadId !== scope.comunidadId) return null
  return persona
}

/**
 * Cliente Prisma mínimo de las transiciones PE: el cliente normal o el `tx` de
 * `prisma.$transaction`. Mantiene los helpers reusables dentro y fuera de una
 * transacción sin acoplarse al tipo completo.
 */
export type ClientePE = Pick<
  typeof prisma,
  | "persona"
  | "jornada"
  | "trabajoMT"
  | "proyeccionPE"
  | "feriado"
  | "notificacion"
  | "eventoAuditoria"
>

/** Emite UN evento de auditoría PE (con `client` se integra a la transacción). */
export function registrarEventoPE(
  scope: ComunidadScope,
  tipoAccion: string,
  referenciaId: string,
  descripcion: string,
  client: Pick<typeof prisma, "eventoAuditoria"> = prisma
): Promise<unknown> {
  return client.eventoAuditoria.create({
    data: {
      id: generarId("ev"),
      comunidadId: scope.comunidadId,
      timestamp: new Date().toISOString(),
      usuario: scope.usuarioId,
      categoria: "PE",
      tipoAccion,
      referenciaId,
      descripcion,
    },
  })
}
