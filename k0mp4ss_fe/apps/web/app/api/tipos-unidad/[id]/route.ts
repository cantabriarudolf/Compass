/**
 * /api/tipos-unidad/[id] — detalle/actualización parcial/baja de un tipo EF.
 */
import { tiposHandlers } from "../route"

type Ctx = { params: Promise<{ id: string }> }

// Re-exportados con la firma de ruta de Next (req, ctx).
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return tiposHandlers.GET_ONE(req, ctx)
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return tiposHandlers.PUT(req, ctx)
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  return tiposHandlers.DELETE(req, ctx)
}
