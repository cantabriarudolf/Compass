/**
 * /api/maestros/[tipo]/[id] — detalle/actualización/baja de un maestro (MA).
 * Delega en la factory CRUD de la colección (ver ../route): mismo `tipo`,
 * mismo authz "mp" y misma guardia de borrado por integridad referencial.
 */
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import {
  esNacional,
  esTipoNacional,
  MENSAJE_NACIONAL_NO_BORRABLE,
  MENSAJE_NACIONAL_PROTEGIDO,
} from "@/lib/maestros-nacionales"
import { handlersMaestro } from "../route"

type CtxTipo = { params: Promise<{ tipo: string; id: string }> }

/**
 * Guard F20 (fase 1): una fila de catálogo nacional es de solo lectura.
 * Corre DESPUÉS de la autenticación (sin sesión sigue siendo 401) y ANTES de
 * la factory: corta con 403 el PUT/DELETE sobre una fila nacional, invitando a
 * la acción correcta (ocultarla por la comunidad o agregar una entrada propia).
 */
async function guardNacional(
  tipo: string,
  id: string,
  mensaje: string
): Promise<Response | null> {
  if (!esTipoNacional(tipo) || !esNacional(tipo, id)) return null
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  return jsonError(403, mensaje)
}

/** GET_ONE por id. */
export async function GET(req: Request, ctx: CtxTipo): Promise<Response> {
  const { tipo, id } = await ctx.params
  const handlers = handlersMaestro(tipo)
  if (!handlers) return jsonError(400, "Tipo de maestro desconocido.")
  return handlers.GET_ONE(req, { params: Promise.resolve({ id }) })
}

/** PUT parcial por id.
 *
 * F20 (fase 1): una fila de catálogo nacional es de solo lectura — el guard
 * corta con 403 antes de tocar Prisma, con el mensaje que invita a la acción
 * correcta (ocultarla por la comunidad o agregar una entrada propia).
 */
export async function PUT(req: Request, ctx: CtxTipo): Promise<Response> {
  const { tipo, id } = await ctx.params
  const corto = await guardNacional(tipo, id, MENSAJE_NACIONAL_PROTEGIDO)
  if (corto) return corto
  const handlers = handlersMaestro(tipo)
  if (!handlers) return jsonError(400, "Tipo de maestro desconocido.")
  return handlers.PUT(req, { params: Promise.resolve({ id }) })
}

/** DELETE por id (con guardia de uso en la comunidad).
 *
 * F20 (fase 1): la fila nacional nunca se borra; ocultarla es la acción
 * disponible para la comunidad (PUT /api/maestros/[tipo]/ocultar).
 */
export async function DELETE(req: Request, ctx: CtxTipo): Promise<Response> {
  const { tipo, id } = await ctx.params
  const corto = await guardNacional(tipo, id, MENSAJE_NACIONAL_NO_BORRABLE)
  if (corto) return corto
  const handlers = handlersMaestro(tipo)
  if (!handlers) return jsonError(400, "Tipo de maestro desconocido.")
  return handlers.DELETE(req, { params: Promise.resolve({ id }) })
}
