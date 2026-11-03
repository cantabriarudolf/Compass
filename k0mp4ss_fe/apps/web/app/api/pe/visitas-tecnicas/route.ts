/**
 * /api/pe/visitas-tecnicas — libro de visitas técnicas PE (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz "pe:visita_tecnica"
 * (recurso propio): la visita técnica es el LOG DE UN HECHO, no un acto administrativo
 * —`VisitaTecnicaPE` no tiene ningún campo de dinero— y quien sabe qué pasó es quien
 * estuvo ahí. Heredar el `pe` genérico dejaba el permiso en manos del fallback de
 * prefijo: cualquier rol con `pe` escribía acá aunque la pantalla no lo mostrara.
 *
 * AVANCE DEL CICLO PREVENTIVO (servidor, no navegador): si la visita trae
 * `mantencionId`, el POST avanza la `proximaFecha` de esa mantención por su
 * `periodicidadMeses` anclado en la fecha de la VISITA. Antes lo hacía la pantalla
 * con un `PUT /api/pe/mantenciones/[id]` cuyo resultado se ignoraba; al quedar
 * `pe:mantenciones` en solo lectura para conserjería y mantención ese PUT pasó a
 * responder 403 y la fecha dejó de avanzar en silencio. La coherencia del registro
 * no puede depender de un permiso sobre el maestro: el hecho (la visita) es lo que
 * mueve la fecha. Ver `_avance-mantencion.ts` para las decisiones y los bordes.
 *
 * La respuesta del POST es la fila escrita MÁS `avanceProximaFecha`: la visita se
 * registra aunque la mantención no se pueda reprogramar, y el motivo viaja siempre
 * en ese campo (y en el log). GET sigue devolviendo la fila sin ese campo, que es
 * un aviso del acto de escritura, no un atributo de la visita.
 */
import { VisitaTecnicaPESchema, type VisitaTecnicaPE } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import {
  avanzarProximaFechaPorVisita,
  type AvisoAvanceMantencion,
} from "./_avance-mantencion"

const handlers = createCrudHandlers({
  model: delegado(prisma.visitaTecnicaPE),
  schema: VisitaTecnicaPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe:visita_tecnica"),
})

export const GET = handlers.GET

/**
 * POST = la factory (authz + validación Zod + upsert scoped) y, DESPUÉS de la
 * escritura confirmada, el avance de la mantención vinculada.
 *
 * La fila escrita es la fuente del `comunidadId`, `fecha` y `mantencionId` del
 * avance: son los valores que el servidor efectivamente guardó, no los que mandó
 * el cliente. Si el avance falla, la respuesta sigue siendo de éxito (la visita
 * ya existe) y el fallo viaja en `avanceProximaFecha`.
 */
export async function POST(req: Request): Promise<Response> {
  const respuesta = await handlers.POST(req)
  if (!respuesta.ok) return respuesta

  const registro = (await respuesta.json()) as VisitaTecnicaPE & { comunidadId: string }

  const avanceProximaFecha: AvisoAvanceMantencion = await avanzarProximaFechaPorVisita(registro)

  return Response.json({ ...registro, avanceProximaFecha }, { status: respuesta.status })
}
