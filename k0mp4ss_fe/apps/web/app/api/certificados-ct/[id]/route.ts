/**
 * /api/certificados-ct/[id] — detalle/actualización parcial/baja de un certificado CT.
 */
import { certificadosHandlers } from "../route"

type Ctx = { params: Promise<{ id: string }> }

export const GET = certificadosHandlers.GET_ONE
export const PUT = certificadosHandlers.PUT
export const DELETE = certificadosHandlers.DELETE
