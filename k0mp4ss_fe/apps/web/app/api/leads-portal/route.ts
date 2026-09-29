/**
 * /api/leads-portal — colección de leads PI (SERIE-GATED-API-BD P2).
 *
 * GET paginado vía factory (solo administración: los leads traen datos de
 * contacto). POST custom: cualquier autenticado del scope puede expresar
 * interés — valida publicación existente y activa (400 si no), registra el
 * lead (upsert por id) y notifica al propietario vigente vía bandeja
 * (`email_simulado`) + evento `PI_LEAD_CONTACT` (paridad server-side con el
 * `saveLeadPortal` legacy del store). PUT/DELETE vía factory (admin).
 */
import { randomUUID } from "node:crypto"
import { LeadPortalSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { createCrudHandlers } from "@/lib/api/crud-factory"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"

function delegado(modelo: unknown) {
  return modelo as import("@/lib/api/crud-factory").CrudDelegate
}

export const leadsHandlers = createCrudHandlers({
  model: delegado(prisma.leadPortal),
  schema: LeadPortalSchema,
  authzCheck: (rol, accion) =>
    accion === "crear" ? true : puede(rol, accion, "pi"),
})

export const GET = leadsHandlers.GET

/** POST interés en una publicación (upsert por id + notify + auditoría). */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = LeadPortalSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const datos = parsed.data
  const { id, publicacionId, ...resto } = datos as typeof datos & {
    id: string
    publicacionId: string
  }

  try {
    const publicacion = await prisma.publicacionPortal.findUnique({
      where: { id: publicacionId },
    })
    if (!publicacion || publicacion.comunidadId !== scope.comunidadId) {
      return jsonError(400, "No se puede registrar el interés: la publicación no existe.")
    }
    if (!publicacion.activa) {
      return jsonError(
        400,
        "No se puede registrar el interés: la publicación no está activa."
      )
    }

    const previo = await prisma.leadPortal.findUnique({ where: { id } })
    if (previo && previo.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    const record = await prisma.leadPortal.upsert({
      where: { id },
      create: { ...resto, id, publicacionId, comunidadId: scope.comunidadId },
      update: { ...resto, publicacionId },
    })

    // Idempotencia: solo el alta nueva genera notificación y evento.
    if (!previo) {
      const [unidad, propietario] = await Promise.all([
        prisma.unidad.findUnique({
          where: { id: publicacion.unidadId },
          select: { etiqueta: true, numero: true },
        }),
        prisma.vinculoUnidad.findFirst({
          where: {
            comunidadId: scope.comunidadId,
            unidadId: publicacion.unidadId,
            rol: "propietario",
            fechaFin: null,
          },
          select: { personaId: true },
        }),
      ])
      const ref = unidad ? `${unidad.etiqueta} ${unidad.numero}` : publicacion.unidadId
      await prisma.notificacion.create({
        data: {
          id: randomUUID(),
          comunidadId: scope.comunidadId,
          destinatarioRol: "propietario",
          destinatarioPersonaId: propietario?.personaId,
          asunto: "Nuevo interesado en tu propiedad",
          cuerpo: `${datos.nombreContacto} mostró interés en ${ref} (${publicacion.operacion}). Contacto: ${datos.contacto}`,
          canal: "email_simulado",
          moduloOrigen: "PI",
          fecha: new Date().toISOString().slice(0, 10),
          leida: false,
        },
      })
      await prisma.eventoAuditoria.create({
        data: {
          id: randomUUID(),
          comunidadId: scope.comunidadId,
          timestamp: new Date().toISOString(),
          usuario: scope.usuarioId,
          categoria: "PI",
          tipoAccion: "PI_LEAD_CONTACT",
          referenciaId: id,
          descripcion: `Interés registrado en ${ref} por ${datos.nombreContacto}.`,
        },
      })
    }

    return Response.json(record, { status: previo ? 200 : 201 })
  } catch (e) {
    logger.error({ err: e }, "[api/leads-portal] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
