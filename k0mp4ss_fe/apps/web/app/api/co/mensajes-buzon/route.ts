/**
 * /api/co/mensajes-buzon — buzón de mensajes CO (Fase 4).
 *
 * Authz "co:buzon" (change co-lectura-residente D4): el buzón ciudadano es su
 * propio recurso; el residente escribe acá sin recibir `crear` sobre la difusión.
 *
 * GET y POST van a medida porque el alcance depende del rol (S10): el residente
 * solo ve sus propios reportes, el comité solo los visibles, y el reportante se
 * deriva de la sesión (ver `_lib/buzon-alcance.ts`).
 */
import { MensajeBuzonCOSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import { resolverReportante, whereBuzon } from "../_lib/buzon-alcance"

export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", "co:buzon")) return jsonError(403, "Permiso denegado.")

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

  try {
    const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
    const alcance = whereBuzon(scope.rol, personaId)
    // Sin alcance posible (residente sin persona vinculada): lista vacía, no 403.
    if (!alcance) return Response.json({ data: [], page, pageSize, total: 0 })
    const where = { ...alcance, comunidadId: scope.comunidadId }
    const [data, total] = await Promise.all([
      prisma.mensajeBuzonCO.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.mensajeBuzonCO.count({ where }),
    ])
    return Response.json({ data, page, pageSize, total })
  } catch (e) {
    logger.error({ err: e }, "[api/co/mensajes-buzon] error en GET")
    return jsonError(500, "Error interno del servidor.")
  }
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  const body: unknown = await req.json().catch(() => null)
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Cuerpo JSON inválido.")
  }

  try {
    // S10: el reportante sale de la sesión; lo que venga en el cuerpo se descarta
    // (el administrador sí puede nombrar a un vecino: ver `resolverReportante`).
    const cuerpo = body as Record<string, unknown>
    const personaIndicada =
      typeof cuerpo.reportantePersonaId === "string" ? cuerpo.reportantePersonaId : null
    const reportante = await resolverReportante(scope, personaIndicada)

    const parsed = MensajeBuzonCOSchema.safeParse({
      ...cuerpo,
      reportantePersonaId: reportante.personaId ?? undefined,
      reportanteNombre: reportante.nombre,
    })
    if (!parsed.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: parsed.error.flatten(),
      })
    }
    const datos = parsed.data as Record<string, unknown>
    const id = typeof datos.id === "string" ? datos.id : undefined
    if (!id) return jsonError(400, "El identificador (id) es obligatorio.")

    const existente = await prisma.mensajeBuzonCO.findUnique({ where: { id } })
    // Upsert sobre un registro de OTRA comunidad → 404 (sin filtrar existencia)
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, existente ? "editar" : "crear", "co:buzon")) {
      return jsonError(403, "Permiso denegado.")
    }

    const payload = { ...datos, id, comunidadId: scope.comunidadId }
    const record = await prisma.mensajeBuzonCO.upsert({
      where: { id },
      create: payload as never,
      update: payload as never,
    })
    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    logger.error({ err: e }, "[api/co/mensajes-buzon] error en POST")
    return jsonError(500, "Error interno del servidor.")
  }
}
