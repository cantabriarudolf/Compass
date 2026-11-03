/**
 * /api/pe/ingresos-contratistas — ingresos de contratistas PE (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz sobre el recurso
 * granular `pe:ingreso_contratista` (decisión owner 2026-11-05): el ingreso de un
 * contratista es un registro del portón, lo escribe conserjería y lo leen conserjería,
 * el comité y el administrador. Clave propia y no `pe:contratista` (el acto del
 * residente de agendar a su contratista): el log del edificio no se comparte con él.
 *
 * Sin hook post-escritura (T1c): el POST agenda la visita del contratista y
 * el store legacy tampoco emitía evento al agendar; la emisión de
 * `PE_CONTRATISTA_INGRESADO` vive en la transición a `ingresado` del [id]
 * (put-merge).
 */
import { IngresoContratistaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.ingresoContratistaPE),
  schema: IngresoContratistaPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe:ingreso_contratista"),
})

export const GET = handlers.GET
export const POST = handlers.POST
