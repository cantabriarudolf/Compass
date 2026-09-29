/**
 * /api/leads-portal/[id] — detalle/actualización parcial/baja de un lead PI
 * (SERIE-GATED-API-BD P2).
 */
import { leadsHandlers } from "../route"

export const GET = leadsHandlers.GET_ONE
export const PUT = leadsHandlers.PUT
export const DELETE = leadsHandlers.DELETE
