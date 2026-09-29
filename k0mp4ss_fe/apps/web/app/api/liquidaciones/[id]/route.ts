/**
 * /api/liquidaciones/[id] — detalle de liquidación PL (SERIE-GATED-API-BD P3).
 *
 * GET_ONE + DELETE vía factory (solo administración, 404 cross-comunidad,
 * DELETE con guard borrador-sin-egreso → 409).
 * Sin PUT: el snapshot es inmutable por diseño (paridad con el store, que no
 * tiene editar; la única transición es POST /confirmar).
 */
import { liquidacionesHandlers } from "../route"

export const GET = liquidacionesHandlers.GET_ONE
export const DELETE = liquidacionesHandlers.DELETE
