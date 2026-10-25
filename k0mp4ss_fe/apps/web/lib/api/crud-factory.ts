/**
 * crud-factory — handlers REST estándar para modelos Prisma scoped por comunidad
 * (BD-FUENTE-VERDAD Fase 0).
 *
 * Contrato para toda colección de dominio:
 * - `comunidadId` siempre desde sesión (withComunidadScope), jamás del body/query.
 * - POST es upsert idempotente por `id` (la fuente de verdad gana, no el orden).
 * - Validación Zod del body antes de tocar Prisma.
 * - Authz opcional por acción (ver|crear|editar|eliminar) vía `puede()`.
 * - Errores estandarizados: 400 Zod, 401 auth, 403 authz, 404 not found,
 *   409 P2002, 500 genérico.
 */
import type { z } from "zod"
import { logger } from "@/lib/logger"
import type { Accion } from "@/lib/authz"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "./with-comunidad-scope"

/** Delegado Prisma mínimo que la factory necesita (independiente del modelo). */
export interface CrudDelegate {
  findMany(args?: Record<string, unknown>): Promise<unknown[]>
  findUnique(args: { where: { id: string } }): Promise<unknown>
  count(args?: Record<string, unknown>): Promise<number>
  upsert(args: {
    where: { id: string }
    create: Record<string, unknown>
    update: Record<string, unknown>
  }): Promise<unknown>
  update(args: {
    where: { id: string }
    data: Record<string, unknown>
  }): Promise<unknown>
  delete(args: { where: { id: string } }): Promise<unknown>
}

/**
 * Adaptador de delegate Prisma a la factory.
 *
 * SAFETY: los delegates generados por Prisma exponen findMany/findUnique/
 * count/upsert/update/delete con firmas específicas por modelo que son
 * estructuralmente compatibles con CrudDelegate (los errores de forma se
 * detectan en runtime vía mapearError y en build vía tsc del modelo); el
 * cast solo borra los genéricos del modelo, nunca cambia valores.
 */
export function delegado(modelo: unknown): CrudDelegate {
  return modelo as CrudDelegate
}

export type AuthzCheck = (rol: string, accion: Accion) => boolean

/** Guardia previa al borrado: devuelve un Response para cortar, o null para seguir. */
export type BeforeDelete = (
  record: unknown,
  scope: ComunidadScope
) => Response | null | Promise<Response | null>

export interface CrudConfig {
  model: CrudDelegate
  schema: z.ZodType
  authzCheck?: AuthzCheck
  beforeDelete?: BeforeDelete
  /**
   * Búsqueda por texto opt-in (F6): con `?q=` el GET suma un `OR` de
   * `contains` sobre estos campos. Sin la opción —o sin `q`— el `where` es
   * exactamente el de siempre, así que las rutas que no la configuran no
   * cambian de comportamiento.
   *
   * `mode: "insensitive"` no se usa a propósito: SQLite (motor de dev y de la
   * suite) no lo soporta y su `LIKE` ya es case-insensitive para ASCII.
   */
  busqueda?: { campos: string[] }
}

export interface CrudHandlers {
  /** GET lista paginada — para route.ts de colección. */
  GET(req: Request): Promise<Response>
  /** POST upsert idempotente por id — para route.ts de colección. */
  POST(req: Request): Promise<Response>
  /** GET uno por id — para route.ts de [id]. */
  GET_ONE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response>
  /** PUT parcial por id — para route.ts de [id]. */
  PUT(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response>
  /** DELETE por id — para route.ts de [id]. */
  DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response>
}

function esPrismaKnownRequest(
  e: unknown
): e is { code: string; message: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code: unknown }).code === "string"
  )
}

/** Mapeo estandarizado de errores Prisma → HTTP. */
function mapearError(e: unknown): Response {
  if (esPrismaKnownRequest(e)) {
    if (e.code === "P2002") {
      return jsonError(409, "Conflicto: registro duplicado.")
    }
    if (e.code === "P2025") {
      return jsonError(404, "Registro no encontrado.")
    }
  }
  logger.error({ err: e, code: esPrismaKnownRequest(e) ? e.code : undefined }, "[crud-factory] error inesperado")
  return jsonError(500, "Error interno del servidor.")
}

/** El cliente nunca decide comunidad ni id en el payload de update. */
function limpiarPayload(data: Record<string, unknown>): Record<string, unknown> {
  // Copia sin `id` ni `comunidadId`: mismo resultado que el rest-destructuring
  // previo, sin declarar bindings que nadie usa (payloads vienen de JSON.parse).
  const resto = { ...data }
  delete resto.id
  delete resto.comunidadId
  return resto
}

async function leerJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export function createCrudHandlers(config: CrudConfig): CrudHandlers {
  const { model, schema, authzCheck, beforeDelete } = config

  function autorizar(scope: ComunidadScope, accion: Accion): Response | null {
    if (authzCheck && !authzCheck(scope.rol, accion)) {
      return jsonError(403, "Permiso denegado.")
    }
    return null
  }

  async function GET(req: Request): Promise<Response> {
    const resultado = await withComunidadScope()
    if (!resultado.ok) return resultado.response
    const scope = resultado.scope
    const denegado = autorizar(scope, "ver")
    if (denegado) return denegado

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
    // Búsqueda por texto (opt-in): aditiva y solo cuando la colección la
    // declara. Construye el where de siempre si no hay `q` o no hay campos.
    let where: Record<string, unknown> = { comunidadId: scope.comunidadId }
    const q = url.searchParams.get("q")?.trim()
    const camposBusqueda = config.busqueda?.campos ?? []
    if (q && camposBusqueda.length > 0) {
      where = {
        ...where,
        OR: camposBusqueda.map((campo) => ({ [campo]: { contains: q } })),
      }
    }
    try {
      const [data, total] = await Promise.all([
        model.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        model.count({ where }),
      ])
      return Response.json({ data, page, pageSize, total })
    } catch (e) {
      return mapearError(e)
    }
  }

  async function POST(req: Request): Promise<Response> {
    const resultado = await withComunidadScope()
    if (!resultado.ok) return resultado.response
    const scope = resultado.scope

    const body = await leerJson(req)
    if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: parsed.error.flatten(),
      })
    }
    const datos = parsed.data as Record<string, unknown>
    const id = typeof datos.id === "string" ? datos.id : undefined
    if (!id) return jsonError(400, "El identificador (id) es obligatorio.")

    try {
      const existente = (await model.findUnique({
        where: { id },
      })) as { comunidadId?: string } | null
      // Upsert sobre un registro de OTRA comunidad → 404 (sin filtrar existencia)
      if (existente && existente.comunidadId !== scope.comunidadId) {
        return jsonError(404, "Registro no encontrado.")
      }
      const denegado = autorizar(scope, existente ? "editar" : "crear")
      if (denegado) return denegado

      const payload = {
        ...limpiarPayload(datos),
        id,
        comunidadId: scope.comunidadId,
      }
      const record = await model.upsert({
        where: { id },
        create: payload,
        update: limpiarPayload(datos),
      })
      return Response.json(record, { status: existente ? 200 : 201 })
    } catch (e) {
      return mapearError(e)
    }
  }

  async function GET_ONE(
    _req: Request,
    ctx: { params: Promise<{ id: string }> }
  ): Promise<Response> {
    const resultado = await withComunidadScope()
    if (!resultado.ok) return resultado.response
    const scope = resultado.scope
    const denegado = autorizar(scope, "ver")
    if (denegado) return denegado

    const { id } = await ctx.params
    try {
      const record = (await model.findUnique({
        where: { id },
      })) as { comunidadId?: string } | null
      if (!record || record.comunidadId !== scope.comunidadId) {
        return jsonError(404, "Registro no encontrado.")
      }
      return Response.json(record)
    } catch (e) {
      return mapearError(e)
    }
  }

  async function PUT(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
  ): Promise<Response> {
    const resultado = await withComunidadScope()
    if (!resultado.ok) return resultado.response
    const scope = resultado.scope

    const body = await leerJson(req)
    if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

    // PUT es parcial: las claves no enviadas no se tocan.
    // SAFETY: el contrato de CrudConfig exige que `schema` sea un z.object de
    // entidad (con id), pero la firma es z.ZodType genérico; el double cast
    // recupera la interfaz ZodObject para aplicar .partial(). El safeParse
    // siguiente valida realmente el shape y degrada a 400 si no es objeto.
    const parcial = (schema as unknown as z.ZodObject<z.ZodRawShape>).partial()
    const parsed = parcial.safeParse(body)
    if (!parsed.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: parsed.error.flatten(),
      })
    }
    const { id } = await ctx.params
    try {
      const record = (await model.findUnique({
        where: { id },
      })) as { comunidadId?: string } | null
      if (!record || record.comunidadId !== scope.comunidadId) {
        return jsonError(404, "Registro no encontrado.")
      }
      const denegado = autorizar(scope, "editar")
      if (denegado) return denegado

      const actualizado = await model.update({
        where: { id },
        data: limpiarPayload(parsed.data as Record<string, unknown>),
      })
      return Response.json(actualizado)
    } catch (e) {
      return mapearError(e)
    }
  }

  async function DELETE(
    _req: Request,
    ctx: { params: Promise<{ id: string }> }
  ): Promise<Response> {
    const resultado = await withComunidadScope()
    if (!resultado.ok) return resultado.response
    const scope = resultado.scope

    const { id } = await ctx.params
    try {
      const record = (await model.findUnique({
        where: { id },
      })) as { comunidadId?: string } | null
      if (!record || record.comunidadId !== scope.comunidadId) {
        return jsonError(404, "Registro no encontrado.")
      }
      const denegado = autorizar(scope, "eliminar")
      if (denegado) return denegado
      if (beforeDelete) {
        const corto = await beforeDelete(record, scope)
        if (corto) return corto
      }
      await model.delete({ where: { id } })
      return Response.json({ ok: true })
    } catch (e) {
      return mapearError(e)
    }
  }

  return { GET, POST, GET_ONE, PUT, DELETE }
}
