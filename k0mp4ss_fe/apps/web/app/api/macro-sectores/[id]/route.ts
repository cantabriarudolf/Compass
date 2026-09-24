/**
 * /api/macro-sectores/[id] — detalle/actualización parcial/baja de un macro EF.
 */
import { macroHandlers } from "../route"

type Ctx = { params: Promise<{ id: string }> }

// Re-exportados con la firma de ruta de Next (req, ctx).
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return macroHandlers.GET_ONE(req, ctx)
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return macroHandlers.PUT(req, ctx)
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  return macroHandlers.DELETE(req, ctx)
}
