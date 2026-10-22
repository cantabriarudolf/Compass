/**
 * /api/cv/actas — actas de asamblea PUBLICADAS en el visor CV, POR REFERENCIA
 * (SERIE-FASE2 §V6).
 *
 * El visor no copia el acta: la tabla `actas_publicadas_cv` guarda `actaId` +
 * visibilidad (`publicado` / `despublicado`) + actor y fechas, y el contenido se
 * resuelve al leer desde `actas_gd`, que sigue siendo el documento canónico e
 * inmutable del libro de actas.
 *
 * - GET: solo lo PUBLICADO. El residente además necesita `residenteVeActas`
 *   vigente (`residentesVenActas` de gd-guard); sin esa autorización → 403.
 *   La respuesta es la vista general informativa: fecha, hora, lugar, número de
 *   temas y asistentes con el documento YA enmascarado. Nunca minuta, morosidad
 *   ni sanciones individualizadas (Ley 19.628).
 * - POST: publicar una referencia. Valida que el acta exista en la comunidad y
 *   esté `publicada` por quórum (borrador o desestimada → 409). Es idempotente:
 *   publicar dos veces devuelve la misma fila con `duplicado: true` y no emite
 *   un segundo evento.
 * - Despublicar vive en [actaId]/despublicar (revierte la visibilidad y audita).
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import {
  PublicarActaCVSchema,
  TEXTO_ACTA_INFORMATIVA_CV,
} from "@/lib/schemas"
import { jsonError, type ComunidadScope } from "@/lib/api/with-comunidad-scope"
import { residentesVenActas } from "@/lib/api/gd-guard"
import {
  ESTADO_ACTA_PUBLICADA,
  contextoActasCV,
  enmascararDocumento,
  esRolResidente,
  registrarEventoCV,
  serializarPublicacion,
} from "../_actas"

/** Error inesperado: 500 sin filtrar detalles al cliente. */
function errorActasCV(e: unknown): Response {
  logger.error({ err: e }, "[api/cv/actas] error inesperado")
  return jsonError(500, "Error interno del servidor.")
}

/** Evento de auditoría que nunca bloquea la transición ya persistida. */
async function auditarSinBloquear(
  scope: ComunidadScope,
  tipoAccion: string,
  referenciaId: string,
  descripcion: string
): Promise<void> {
  try {
    await registrarEventoCV(scope, tipoAccion, referenciaId, descripcion)
  } catch (e) {
    logger.error({ err: e }, `[api/cv/actas] no se pudo registrar ${tipoAccion}`)
  }
}

/** GET — vista general informativa de las actas publicadas en el visor. */
export async function GET(): Promise<Response> {
  const contexto = await contextoActasCV("ver")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto

  if (esRolResidente(scope.rol)) {
    if (!(await residentesVenActas(scope.comunidadId))) {
      return jsonError(
        403,
        "Las actas no están visibles para residentes (tu propietario no activó residenteVeActas)."
      )
    }
  }

  try {
    const publicaciones = await prisma.actaPublicadaCV.findMany({
      where: { comunidadId: scope.comunidadId, estado: ESTADO_ACTA_PUBLICADA },
      orderBy: [{ publicadoEn: "desc" }, { id: "desc" }],
    })
    if (publicaciones.length === 0) {
      return Response.json({
        data: [],
        textoInformativo: TEXTO_ACTA_INFORMATIVA_CV,
        total: 0,
      })
    }

    // El contenido se resuelve AHORA desde GD: solo actas de esta comunidad y
    // todavía publicadas por quórum (una desestimada no se muestra en el visor).
    const actas = await prisma.actaGD.findMany({
      where: {
        comunidadId: scope.comunidadId,
        id: { in: publicaciones.map((p) => p.actaId) },
        estado: "publicada",
      },
      select: {
        id: true,
        fecha: true,
        hora: true,
        lugar: true,
        tablaTemas: true,
        presentes: true,
      },
    })
    const actaPorId = new Map(actas.map((a) => [a.id, a]))

    const idsPresentes = [
      ...new Set(
        actas.flatMap((a) =>
          Array.isArray(a.presentes) ? (a.presentes as string[]) : []
        )
      ),
    ]
    const personas =
      idsPresentes.length === 0
        ? []
        : await prisma.persona.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: idsPresentes } },
            select: { id: true, nombreCompleto: true, rut: true },
          })
    const personaPorId = new Map(personas.map((p) => [p.id, p]))

    const data = publicaciones.flatMap((publicacion) => {
      const acta = actaPorId.get(publicacion.actaId)
      if (!acta) return []
      const presentes = Array.isArray(acta.presentes)
        ? (acta.presentes as string[])
        : []
      const temas = Array.isArray(acta.tablaTemas)
        ? (acta.tablaTemas as string[])
        : []
      return [
        {
          ...serializarPublicacion(publicacion),
          acta: {
            actaId: acta.id,
            fecha: acta.fecha,
            hora: acta.hora,
            lugar: acta.lugar,
            temas: temas.length,
            asistentes: presentes.flatMap((idPersona) => {
              const persona = personaPorId.get(idPersona)
              if (!persona) return []
              return [
                {
                  nombre: persona.nombreCompleto,
                  // Ley 19.628: la vista general nunca expone el RUT completo.
                  documento: enmascararDocumento(persona.rut),
                },
              ]
            }),
          },
        },
      ]
    })

    return Response.json({
      data,
      textoInformativo: TEXTO_ACTA_INFORMATIVA_CV,
      total: data.length,
    })
  } catch (e) {
    return errorActasCV(e)
  }
}

/** POST — publica la REFERENCIA de un acta en el visor (idempotente). */
export async function POST(req: Request): Promise<Response> {
  const contexto = await contextoActasCV("crear")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parsed = PublicarActaCVSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { actaId } = parsed.data
  const clave = { comunidadId_actaId: { comunidadId: scope.comunidadId, actaId } }

  try {
    const acta = await prisma.actaGD.findUnique({
      where: { id: actaId },
      select: { id: true, comunidadId: true, estado: true, fecha: true },
    })
    // Cross-comunidad o inexistente → 404 (sin filtrar si existe en otro tenant).
    if (!acta || acta.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    // Solo un acta Publicada por quórum puede difundirse: ni borrador ni desestimada.
    if (acta.estado !== "publicada") {
      return jsonError(
        409,
        `Solo un acta publicada por quórum puede difundirse en el visor (estado actual: ${acta.estado}).`
      )
    }

    const existente = await prisma.actaPublicadaCV.findUnique({ where: clave })
    if (existente?.estado === ESTADO_ACTA_PUBLICADA) {
      // Idempotencia: republicar no duplica la fila ni vuelve a auditar.
      return Response.json({
        ...serializarPublicacion(existente),
        duplicado: true,
      })
    }

    const ahora = new Date()
    const datos = {
      estado: ESTADO_ACTA_PUBLICADA,
      publicadoEn: ahora,
      publicadoPorUsuarioId: scope.usuarioId,
      despublicadoEn: null,
      despublicadoPorUsuarioId: null,
    }
    const publicacion = existente
      ? await prisma.actaPublicadaCV.update({ where: clave, data: datos })
      : await prisma.actaPublicadaCV.create({
          data: {
            ...datos,
            id: generarId("cv-acta"),
            comunidadId: scope.comunidadId,
            actaId,
          },
        })

    await auditarSinBloquear(
      scope,
      "CV_ACTA_PUBLICADA",
      actaId,
      existente
        ? `Acta del ${acta.fecha} republicada en el visor por referencia (acta ${actaId}).`
        : `Acta del ${acta.fecha} publicada en el visor por referencia (acta ${actaId}).`
    )

    return Response.json(
      { ...serializarPublicacion(publicacion), duplicado: false },
      { status: existente ? 200 : 201 }
    )
  } catch (e) {
    // Carrera de dos publicaciones simultáneas: la única fila ya existe.
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      const fila = await prisma.actaPublicadaCV.findUnique({ where: clave })
      if (fila)
        return Response.json({
          ...serializarPublicacion(fila),
          duplicado: true,
        })
    }
    return errorActasCV(e)
  }
}
