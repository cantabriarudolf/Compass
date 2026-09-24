/**
 * /api/maestros/[tipo]/[id] — detalle/actualización/baja de un maestro (MA).
 * Delega en la factory CRUD de la colección (ver ../route): mismo `tipo`,
 * mismo authz "mp" y misma guardia de borrado por integridad referencial.
 */
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { handlersMaestro } from "../route"

type CtxTipo = { params: Promise<{ tipo: string; id: string }> }

/** GET_ONE por id. */
export async function GET(req: Request, ctx: CtxTipo): Promise<Response> {
  const { tipo, id } = await ctx.params
  const handlers = handlersMaestro(tipo)
  if (!handlers) return jsonError(400, "Tipo de maestro desconocido.")
  return handlers.GET_ONE(req, { params: Promise.resolve({ id }) })
}

/** PUT parcial por id. */
export async function PUT(req: Request, ctx: CtxTipo): Promise<Response> {
  const { tipo, id } = await ctx.params
  const handlers = handlersMaestro(tipo)
  if (!handlers) return jsonError(400, "Tipo de maestro desconocido.")
  return handlers.PUT(req, { params: Promise.resolve({ id }) })
}

/** DELETE por id (con guardia de uso en la comunidad). */
export async function DELETE(req: Request, ctx: CtxTipo): Promise<Response> {
  const { tipo, id } = await ctx.params
  const handlers = handlersMaestro(tipo)
  if (!handlers) return jsonError(400, "Tipo de maestro desconocido.")
  return handlers.DELETE(req, { params: Promise.resolve({ id }) })
}
