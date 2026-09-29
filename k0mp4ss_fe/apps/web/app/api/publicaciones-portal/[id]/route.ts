/**
 * /api/publicaciones-portal/[id] — detalle/actualización parcial/baja de una
 * publicación PI (SERIE-GATED-API-BD P2).
 */
import { publicacionesHandlers } from "../route"

export const GET = publicacionesHandlers.GET_ONE
export const PUT = publicacionesHandlers.PUT
export const DELETE = publicacionesHandlers.DELETE
