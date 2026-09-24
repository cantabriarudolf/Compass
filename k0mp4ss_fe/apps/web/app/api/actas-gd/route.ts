/**
 * /api/actas-gd — colección GD de actas de directiva (BD-FUENTE-VERDAD Fase 2).
 *
 * - GET paginado scoped por comunidad. Residente: solo publicadas y únicamente
 *   si algún control AD autoriza (residenteVeActas); sin autorización → 403.
 * - POST upsert idempotente por id, validado con ActaGDSchema.
 * - Reglas espejo de saveActaGD (lib/store.ts): presentes/ausentes deben ser
 *   miembros vigentes de la directiva; el acta hereda el período vigente.
 * - Authz: ver/crear/editar → administrador y directiva (comité);
 *   aprobar vive en [id]/aprobar (miembro vigente, sin suplantación).
 */
import { ActaGDSchema } from "@/lib/schemas"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import {
  esMiembroVigente,
  periodoVigenteDb,
  puedeGestionarActas,
  residentesVenActas,
  type FichaGobernanzaMin,
} from "@/lib/api/gd-guard"

/** Campos persistibles de ActaGD (el cliente nunca decide id ni comunidad). */
const CAMPOS_ACTA = [
  "fecha",
  "hora",
  "lugar",
  "tablaTemas",
  "presentes",
  "ausentes",
  "invitados",
  "minuta",
  "adjuntos",
  "estado",
  "aprobaciones",
  "fechaPublicacion",
  "avisoCVReferencia",
  "periodoId",
] as const

export function limpiarPayloadActa(
  datos: Record<string, unknown>
): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const campo of CAMPOS_ACTA) {
    if (campo in datos) salida[campo] = datos[campo]
  }
  return salida
}

export function errorActas(e: unknown): Response {
  if (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  ) {
    return jsonError(404, "Registro no encontrado.")
  }
  logger.error({ err: e }, "[api/actas-gd] error inesperado")
  return jsonError(500, "Error interno del servidor.")
}

/**
 * Integridad referencial del acta (espejo de saveActaGD): cada asistente
 * debe existir y ser miembro vigente de la directiva. Muta `datos`
 * (herencia del período vigente cuando la ficha no lo declara).
 */
export async function validarAsistentesYPeriodo(
  datos: Record<string, unknown>,
  scope: ComunidadScope
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const vigente = await periodoVigenteDb(scope.comunidadId)
  if (!datos.periodoId && vigente) datos.periodoId = vigente.id

  const ids = [
    ...((datos.presentes as string[] | undefined) ?? []),
    ...((datos.ausentes as string[] | undefined) ?? []),
  ]
  if (ids.length === 0) return { ok: true }
  const personas = await prisma.persona.findMany({
    where: { comunidadId: scope.comunidadId, id: { in: ids } },
    select: { id: true, nombreCompleto: true, estadoCuenta: true, datosGobernanza: true },
  })
  const porId = new Map(personas.map((p) => [p.id, p]))
  for (const idAsistente of ids) {
    const persona = porId.get(idAsistente)
    if (!persona) {
      return {
        ok: false,
        response: jsonError(
          400,
          `No se puede guardar el acta: el asistente "${idAsistente}" no existe en el Maestro de Personas.`
        ),
      }
    }
    // SAFETY: ficha Json validada por ExtensionGobernanzaSchema al escribir; solo se lee periodoId/fechaTermino.
    const ficha = (persona.datosGobernanza as unknown as FichaGobernanzaMin | null) ?? null
    if (
      !esMiembroVigente(
        { estadoCuenta: persona.estadoCuenta, datosGobernanza: ficha },
        vigente?.id
      )
    ) {
      return {
        ok: false,
        response: jsonError(
          400,
          `No se puede guardar el acta: ${persona.nombreCompleto} no es miembro vigente de la directiva.`
        ),
      }
    }
  }
  return { ok: true }
}

/** GET lista paginada. Residente: publicadas + con autorización AD. */
export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const rol = scope.rol.trim().toLowerCase()
  const esResidente = rol === "residente" || rol === "propietario"

  if (esResidente) {
    if (!(await residentesVenActas(scope.comunidadId))) {
      return jsonError(
        403,
        "Las actas no están visibles para residentes (tu propietario no activó residenteVeActas)."
      )
    }
  } else if (!puedeGestionarActas(scope.rol, "ver")) {
    return jsonError(403, "Permiso denegado.")
  }

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50)
  )
  const where: Record<string, unknown> = { comunidadId: scope.comunidadId }
  if (esResidente) where.estado = "publicada"

  try {
    const [data, total] = await Promise.all([
      prisma.actaGD.findMany({
        where,
        orderBy: [{ fecha: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.actaGD.count({ where }),
    ])
    return Response.json({ data, page, pageSize, total })
  } catch (e) {
    return errorActas(e)
  }
}

/** POST upsert idempotente por id (la fuente de verdad gana, no el orden). */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = ActaGDSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const id = parsed.data.id

  try {
    const existente = await prisma.actaGD.findUnique({ where: { id } })
    // Upsert sobre un registro de OTRA comunidad → 404 (sin filtrar existencia)
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puedeGestionarActas(scope.rol, existente ? "editar" : "crear")) {
      return jsonError(403, "Permiso denegado.")
    }

    // SAFETY: ActaGDSchema es un z.object plano; el parse validado se trata como mapa para herencia de período y lista blanca.
    const datos = parsed.data as unknown as Record<string, unknown>
    const negocio = await validarAsistentesYPeriodo(datos, scope)
    if (!negocio.ok) return negocio.response

    // SAFETY: payload blanqueado por CAMPOS_ACTA + comunidad del servidor; Json arrays ya validados por zod.
    const record = await prisma.actaGD.upsert({
      where: { id },
      create: {
        ...limpiarPayloadActa(datos),
        id,
        comunidadId: scope.comunidadId,
      } as never,
      update: limpiarPayloadActa(datos) as never,
    })
    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    return errorActas(e)
  }
}
