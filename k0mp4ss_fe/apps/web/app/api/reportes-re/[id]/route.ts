/**
 * /api/reportes-re/[id] — detalle/actualización parcial/baja de un reporte RE.
 */
import { reportesHandlers } from "../route"

export const GET = reportesHandlers.GET_ONE
export const PUT = reportesHandlers.PUT
export const DELETE = reportesHandlers.DELETE
