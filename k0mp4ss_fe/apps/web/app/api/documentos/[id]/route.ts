/**
 * /api/documentos/[id] — detalle / reemplazo / baja del archivo (F35 serie A, A1).
 *
 * Comparte los handlers de la colección: la guardia de escritura y el schema son
 * los mismos, así que un legal responde 409 también por acá (S2). El comunitario
 * se reemplaza con PUT parcial; el legal no (se corrige con una versión nueva).
 */
import { documentoHandlers } from "../route"

type Ctx = { params: Promise<{ id: string }> }

// Re-exportados con la firma de ruta de Next (req, ctx).
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return documentoHandlers.GET_ONE(req, ctx)
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return documentoHandlers.PUT(req, ctx)
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  return documentoHandlers.DELETE(req, ctx)
}
