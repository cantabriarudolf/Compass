/**
 * /api/controles-propiedad — colección AD de controles de privacidad (Fase 2).
 *
 * - GET paginado scoped. Administrador/directiva ven todo; residente solo los
 *   controles de sus unidades vinculadas (ABAC por vínculo vigente).
 * - POST upsert idempotente por id, validado con ControlPropiedadSchema.
 * - Reglas espejo de saveControlPropiedad (lib/store.ts): la unidad debe
 *   existir y hay un solo registro de controles por unidad (409 duplicado).
 * - Authz: modificar → administrador/directiva; residente solo lectura propia.
 */
import { ControlPropiedadSchema } from "@/lib/schemas"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import {
  personaIdDelUsuarioDb,
  puedeGestionarControles,
  unidadesVinculadasDb,
} from "@/lib/api/gd-guard"

/** Campos persistibles de ControlPropiedad. */
const CAMPOS_CONTROL = [
  "unidadId",
  "residenteVeMorosidad",
  "residenteVeActas",
  "alertasResidentesActivas",
] as const

export function limpiarPayloadControl(
  datos: Record<string, unknown>
): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const campo of CAMPOS_CONTROL) {
    if (campo in datos) salida[campo] = datos[campo]
  }
  return salida
}

export function errorControles(e: unknown): Response {
  if (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  ) {
    return jsonError(404, "Registro no encontrado.")
  }
  logger.error({ err: e }, "[api/controles-propiedad] error inesperado")
  return jsonError(500, "Error interno del servidor.")
}

function esResidente(rol: string): boolean {
  const n = rol.trim().toLowerCase()
  return n === "residente" || n === "propietario"
}

/**
 * Unidades visibles para el scope: todas (gestión) o solo vinculadas (residente).
 * null = rol sin acceso de lectura.
 */
export async function unidadesVisibles(
  scope: ComunidadScope
): Promise<string[] | "todas" | null> {
  if (!esResidente(scope.rol)) {
    return puedeGestionarControles(scope.rol, "ver") ? "todas" : null
  }
  const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
  if (!personaId) return []
  return unidadesVinculadasDb(personaId, scope.comunidadId)
}

/** GET lista paginada (residente: solo sus unidades). */
export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const visibles = await unidadesVisibles(scope)
  if (visibles === null) return jsonError(403, "Permiso denegado.")

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
  const where: Record<string, unknown> = {
    comunidadId: scope.comunidadId,
    estado: "vigente", // desestimados solo en el archivo (borrado lógico)
  }
  if (visibles !== "todas") where.unidadId = { in: visibles }

  try {
    const [data, total] = await Promise.all([
      prisma.controlPropiedad.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.controlPropiedad.count({ where }),
    ])
    return Response.json({ data, page, pageSize, total })
  } catch (e) {
    return errorControles(e)
  }
}

/** POST upsert idempotente (solo administrador/directiva). */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = ControlPropiedadSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const id = parsed.data.id

  try {
    const existente = await prisma.controlPropiedad.findUnique({ where: { id } })
    // Upsert sobre un registro de OTRA comunidad → 404 (sin filtrar existencia)
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puedeGestionarControles(scope.rol, existente ? "editar" : "crear")) {
      return jsonError(403, "Permiso denegado.")
    }

    // La unidad debe existir en el inventario de la comunidad.
    const unidad = await prisma.unidad.findUnique({
      where: { id: parsed.data.unidadId },
      select: { id: true, comunidadId: true },
    })
    if (!unidad || unidad.comunidadId !== scope.comunidadId) {
      return jsonError(
        400,
        "No se puede guardar el control: la unidad no existe en el inventario."
      )
    }
    // Unicidad: un solo registro de controles por unidad. Los desestimados
    // (borrado lógico) no cuentan: desestimar libera la unidad para
    // re-registrar sus controles.
    const duplicado = await prisma.controlPropiedad.findFirst({
      where: {
        comunidadId: scope.comunidadId,
        unidadId: parsed.data.unidadId,
        estado: "vigente",
        NOT: { id },
      },
      select: { id: true },
    })
    if (duplicado) {
      return jsonError(
        409,
        `La unidad ya tiene controles registrados (${duplicado.id}).`
      )
    }

    // SAFETY: payload blanqueado + comunidad del servidor.
    const record = await prisma.controlPropiedad.upsert({
      where: { id },
      create: {
        ...(limpiarPayloadControl(
          parsed.data as unknown as Record<string, unknown>
        )),
        id,
        comunidadId: scope.comunidadId,
      } as never,
      update: limpiarPayloadControl(
        parsed.data as unknown as Record<string, unknown>
      ) as never,
    })
    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    return errorControles(e)
  }
}
