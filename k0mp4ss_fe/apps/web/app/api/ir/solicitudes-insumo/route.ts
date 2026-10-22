/**
 * /api/ir/solicitudes-insumo — solicitudes de insumo IR (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id con folio
 * `SI-####` generado server-side cuando el body no lo trae. Authz
 * "ir:mantenimiento".
 *
 * Folio server-side (bug preexistente): la UI crea la solicitud con
 * `folio: ""` y `SolicitudInsumoIRSchema.folio` exige `min(1)`, así que el POST
 * del factory respondía 400 "Datos inválidos." y no se podía crear NINGUNA
 * solicitud (entregar no tenía input). Este handler completa el folio con el
 * correlativo legacy `SI-####` de la comunidad y delega el resto en el factory:
 * mismo authz, mismo scoping, misma validación, mismo upsert idempotente por id
 * y mismo shape/status de respuesta (201 alta, 200 actualización).
 */
import { SolicitudInsumoIRSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

const handlers = createCrudHandlers({
  model: delegado(prisma.solicitudInsumoIR),
  schema: SolicitudInsumoIRSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "ir:mantenimiento"),
})

export const GET = handlers.GET

/** Siguiente folio `SI-####` correlativo dentro de la comunidad (patrón legacy). */
async function siguienteFolioSI(comunidadId: string): Promise<string> {
  const solicitudes = await prisma.solicitudInsumoIR.findMany({
    where: { comunidadId },
    select: { folio: true },
  })
  const numeros = solicitudes
    .map((s) => Number.parseInt(s.folio.replace(/^SI-/, ""), 10))
    .filter((n) => Number.isFinite(n))
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
  return `SI-${String(siguiente).padStart(4, "0")}`
}

/** Folio ausente, `null`, `""` o solo espacios = hay que generarlo. */
function sinFolio(datos: Record<string, unknown>): boolean {
  const folio = datos.folio
  if (folio === undefined || folio === null) return true
  return typeof folio === "string" && folio.trim() === ""
}

/** Reconstruye la request con el body completado (el factory solo lee `json()`). */
function conBody(req: Request, datos: Record<string, unknown>): Request {
  return new Request(req.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(datos),
  })
}

export async function POST(req: Request): Promise<Response> {
  // El cuerpo se inspecciona en un clon: si no hay folio que completar, el
  // factory consume la request original sin cambios (mismo contrato de errores).
  const body: unknown = await req
    .clone()
    .json()
    .catch(() => null)
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return handlers.POST(req)
  }
  const datos = body as Record<string, unknown>
  if (!sinFolio(datos)) return handlers.POST(req)

  const scopeResult = await withComunidadScope()
  if (!scopeResult.ok) return scopeResult.response
  const { scope } = scopeResult

  try {
    // Una solicitud YA existente conserva su folio: el legacy solo lo asigna al
    // alta, y reasignarlo en un upsert duplicaría números.
    const id = typeof datos.id === "string" ? datos.id : null
    const existente = id
      ? await prisma.solicitudInsumoIR.findUnique({
          where: { id },
          select: { comunidadId: true },
        })
      : null
    if (existente) return handlers.POST(req)

    const folio = await siguienteFolioSI(scope.comunidadId)
    return handlers.POST(conBody(req, { ...datos, folio }))
  } catch (e) {
    logger.error({ err: e }, "[api/ir/solicitudes-insumo] error al generar folio")
    return jsonError(500, "Error interno del servidor.")
  }
}
