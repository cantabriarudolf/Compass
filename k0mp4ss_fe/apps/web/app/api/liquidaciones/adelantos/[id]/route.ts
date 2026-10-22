/**
 * /api/liquidaciones/adelantos/[id] — lectura de un adelanto PL (SERIE-FASE2 §V4).
 *
 * Solo lectura: el adelanto NO se borra nunca (historia documental). La baja se
 * hace por `POST .../[id]/desestimar`, que marca estado y conserva el registro.
 * Authz: `pl:adelantos` ver (admin y comité); 404 cross-comunidad.
 */
import { AdelantoPLSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { RECURSO_ADELANTOS_PL } from "../route"

const handlers = createCrudHandlers({
  model: delegado(prisma.adelantoPL),
  schema: AdelantoPLSchema,
  authzCheck: (rol, accion) => puede(rol, accion, RECURSO_ADELANTOS_PL),
})

export const GET = handlers.GET_ONE
