/**
 * /api/co/documentos — documentos compartidos CO (Fase 4).
 *
 * @deprecated La «Biblioteca de Documentos Comunales» se retiró (F35 serie A, T11).
 * El «Archivo de Documentos de la Comunidad» (`/api/documentos`, tabla `Documento`)
 * es la única lista y su filtro `comunitario` hace ese papel. Esta ruta queda viva
 * solo mientras `documentos_co` conserve sus filas: tabla y datos se retiran en la
 * unidad que los migre a `Documento`. No agregues consumidores nuevos.
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "co".
 */
import { DocumentoCOSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"

const handlers = createCrudHandlers({
  model: delegado(prisma.documentoCO),
  schema: DocumentoCOSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "co"),
})

export const GET = handlers.GET
export const POST = handlers.POST
