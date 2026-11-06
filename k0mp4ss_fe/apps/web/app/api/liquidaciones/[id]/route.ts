/**
 * /api/liquidaciones/[id] — detalle de liquidación PL (SERIE-GATED-API-BD P3).
 *
 * GET delega en `liquidacionGetPorId` (../route): la administración lee toda la
 * comunidad (404 cross-comunidad, sin filtrar existencia) y el trabajador lee
 * SOLO la liquidación de su propia persona —cualquier otra es el mismo 404—,
 * porque `pl:propia` es un permiso por fila, no por ruta (T6).
 * DELETE vía factory (solo administración, 404 cross-comunidad, guard
 * borrador-sin-egreso → 409).
 * Sin PUT: el snapshot es inmutable por diseño (paridad con el store, que no
 * tiene editar; la única transición es POST /confirmar).
 */
import { liquidacionesHandlers, liquidacionGetPorId } from "../route"

export const GET = liquidacionGetPorId
export const DELETE = liquidacionesHandlers.DELETE
