/**
 * crud-factory — handlers REST estándar para modelos Prisma scoped por comunidad
 * (BD-FUENTE-VERDAD Fase 0).
 *
 * Contrato para toda colección de dominio:
 * - `comunidadId` siempre desde sesión (withComunidadScope), jamás del body/query.
 * - POST es upsert idempotente por `id` (la fuente de verdad gana, no el orden).
 * - Validación Zod del body antes de tocar Prisma.
 * - Authz opcional por acción (ver|crear|editar|eliminar) vía `puede()`.
 * - Alcance por filas opcional (`alcance`): la comunidad dice qué filas PUEDEN
 *   existir para el actor; el alcance dice cuáles de ellas son suyas.
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
  /**
   * Opcional: lo usa el alcance por filas para cargar una fila SOLO si cumple
   * el fragmento (un `findUnique` no acepta filtros que no sean únicos, así que
   * no sirve para acotar). Los delegates de Prisma siempre lo exponen.
   */
  findFirst?(args?: Record<string, unknown>): Promise<unknown>
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

/**
 * Alcance por filas («lo propio») de una colección, resuelto desde la sesión.
 *
 * Devuelve un fragmento `where` para fusionar en TODA consulta a nivel de fila
 * (colección, GET por id, PUT y DELETE), o `null` cuando el rol ve la comunidad
 * completa (gestión: administrador y comité). El fragmento sale de la BD de la
 * sesión —vínculos y persona del usuario—, nunca del body ni del query.
 *
 * Contrato de la fila ajena: con fragmento, la fila de otro dueño responde el
 * 404 genérico de la serie («Registro no encontrado.»), no 403 —el 403
 * confirmaría que existe— y NO se carga: el filtro viaja en el `where`, no en
 * una comparación posterior a la lectura.
 *
 * LÍMITE: el alcance acota filas EXISTENTES; no puede validar una creación,
 * porque en el alta la fila todavía no existe. El `POST` que crea necesita su
 * propia guardia de pertenencia en la ruta (ver `AntesDeEscribir`): comparar el
 * `unidadId`/`personaId` del payload con los vínculos del actor, como hace
 * `rechazoDeEmisionAjena` en `app/api/certificados-ct/route.ts`.
 */
export type AlcanceDeFilas = (
  scope: ComunidadScope
) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null

/**
 * Resultado de resolver una fila por `id` bajo el alcance del actor.
 *
 * - `visible`: la fila se puede servir y escribir.
 * - `oculta`: la fila EXISTE pero no es visible (es de otro dueño, o de otra
 *   comunidad). Se responde el 404 genérico.
 * - `inexistente`: no hay fila con ese `id`.
 *
 * La distinción entre `oculta` e `inexistente` importa solo en el POST: el
 * upsert escribe por `where: { id }`, así que tratar una fila oculta como alta
 * reescribiría la fila ajena (y, si es de otra comunidad, se la llevaría puesta
 * sin cambiarle la comunidad).
 */
type FilaResuelta =
  | { estado: "visible"; fila: Record<string, unknown> }
  | { estado: "oculta" }
  | { estado: "inexistente" }

/** Guardia previa al borrado: devuelve un Response para cortar, o null para seguir. */
export type BeforeDelete = (
  record: unknown,
  scope: ComunidadScope
) => Response | null | Promise<Response | null>

/**
 * Guardia previa a la escritura (POST upsert y PUT parcial).
 *
 * `previo` es la fila existente (null si el POST crea). `datos` es el payload
 * YA validado por Zod y con `id`/`comunidadId` sin limpiar todavia. Devuelve un
 * Response para cortar la escritura, o null para seguir.
 *
 * Es el punto donde viven las reglas que necesitan mirar OTRA fila (unicidad de
 * negocio, dependencias de estado): la factory no las conoce y no las inventa.
 */
export type AntesDeEscribir = (args: {
  datos: Record<string, unknown>
  previo: Record<string, unknown> | null
  scope: ComunidadScope
}) => Response | null | Promise<Response | null>

export type AccionEscritura = "crear" | "editar" | "eliminar"

export interface EscrituraCrud {
  accion: AccionEscritura
  /** Fila tal como quedó escrita (o la borrada, en "eliminar"). */
  registro: unknown
  /** Fila previa; `null` cuando la acción la creó. */
  previo: unknown
  scope: ComunidadScope
}

export type DespuesDeEscribir = (escritura: EscrituraCrud) => void | Promise<void>

export interface CrudConfig {
  model: CrudDelegate
  schema: z.ZodType
  authzCheck?: AuthzCheck
  /**
   * Alcance por filas, opcional y aditivo. Sin esta opción el comportamiento es
   * exactamente el de siempre: el único filtro es `comunidadId`.
   */
  alcance?: AlcanceDeFilas
  beforeDelete?: BeforeDelete
  /** Guardia previa a la escritura: corre despues de authz y antes del upsert/update. */
  antesDeEscribir?: AntesDeEscribir
  /**
   * Hook post-escritura (auditoría, T1c), opcional y aditivo: sin él, el
   * comportamiento de GET/POST/PUT/DELETE es exactamente el de siempre.
   *
   * Se invoca después de cada escritura CONFIRMADA: en POST con `"crear"` si
   * la fila no existía o `"editar"` si existía (upsert idempotente), en PUT
   * con `"editar"` y en DELETE con `"eliminar"` (ahí `previo` y `registro`
   * son la misma fila borrada, porque la previa a un borrado ES la borrada).
   * Si el hook lanza, el error se registra y la respuesta sigue siendo la del
   * éxito ya confirmado: la fila ya está escrita y devolver 500 haría que el
   * cliente reintente y duplique la escritura. La auditoría no puede romper la
   * operación, pero tampoco puede quedar en silencio (queda en `logger.error`).
   */
  despuesDeEscribir?: DespuesDeEscribir
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
  /**
   * Redacción de la respuesta de la COLECCIÓN, opcional y aditiva (ver
   * `ProyeccionDeFilas`). Sin esta opción, `GET` responde exactamente lo de
   * siempre: es el único punto donde una ruta decide que una fila visible
   * (la ocupación) no revele datos de otro (la identidad, los montos).
   */
  proyeccion?: ProyeccionDeFilas
}

/**
 * Proyección de respuesta opcional de la COLECCIÓN (serie «permisos por
 * objeto», T18): decide la FORMA de la fila que viaja al cliente sin tocar la
 * fila de la base.
 *
 * Contrato:
 * - Se aplica a `data` y SOLO a `data`: `page`, `pageSize` y `total` se sirven
 *   tal cual (un `total` redactado mentiría sobre cuántas filas existen).
 * - Sin `proyeccion` la respuesta es byte a byte la de siempre.
 * - Recibe el `scope` de la sesión —nunca el body ni el query— y puede devolver
 *   una promesa: la ruta que necesita resolver una decisión (rol/identidad)
 *   la resuelve UNA vez por request y devuelve un mapeador puro (ver
 *   `app/api/ra/reservas/_alcance.ts`, que memoiza la decisión por `scope`).
 * - Devolver la fila tal cual es lo correcto cuando el actor ve la comunidad
 *   completa: la proyección no copia lo que no cambia.
 */
export type ProyeccionDeFilas = (
  fila: Record<string, unknown>,
  scope: ComunidadScope
) => Record<string, unknown> | Promise<Record<string, unknown>>

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
  const { model, schema, authzCheck, beforeDelete, proyeccion } = config

  async function aplicarGuardiaDeEscritura(
    datos: Record<string, unknown>,
    previo: Record<string, unknown> | null,
    scope: ComunidadScope
  ): Promise<Response | null> {
    if (!config.antesDeEscribir) return null
    try {
      return await config.antesDeEscribir({ datos, previo, scope })
    } catch (e) {
      logger.error({ err: e }, "[crud-factory] antesDeEscribir fallo")
      return jsonError(500, "Error interno del servidor.")
    }
  }

  async function notificarEscritura(escritura: EscrituraCrud): Promise<void> {
    if (!config.despuesDeEscribir) return
    try {
      await config.despuesDeEscribir(escritura)
    } catch (e) {
      // Ver CrudConfig.despuesDeEscribir: la escritura ya está confirmada y la
      // respuesta de éxito no se toca; el error de auditoría queda registrado.
      logger.error(
        { err: e, accion: escritura.accion },
        "[crud-factory] despuesDeEscribir falló"
      )
    }
  }

  function autorizar(scope: ComunidadScope, accion: Accion): Response | null {
    if (authzCheck && !authzCheck(scope.rol, accion)) {
      return jsonError(403, "Permiso denegado.")
    }
    return null
  }

  /** Fragmento de alcance del actor, o `null` si no hay restricción por fila. */
  async function resolverAlcance(
    scope: ComunidadScope
  ): Promise<Record<string, unknown> | null> {
    if (!config.alcance) return null
    return (await config.alcance(scope)) ?? null
  }

  /**
   * Fila por `id` bajo el alcance del actor (ver `FilaResuelta`).
   *
   * Sin fragmento se conserva la lectura de siempre —`findUnique` + comparación
   * de comunidad, UNA consulta—, así que las rutas que no declaran `alcance` no
   * cambian ni de comportamiento ni de consulta. Con fragmento, el filtro viaja
   * en el `where` (`findFirst`): la fila de otro dueño NO se carga. Si el filtro
   * no la encuentra, se comprueba la EXISTENCIA con un `count` —sin leer la
   * fila— para distinguir «es ajena» de «no existe»: es lo que permite al POST
   * no confundir un id ajeno con un alta.
   */
  async function resolverFila(
    scope: ComunidadScope,
    id: string,
    fragmento: Record<string, unknown> | null
  ): Promise<FilaResuelta> {
    if (!fragmento) {
      const record = (await model.findUnique({ where: { id } })) as {
        comunidadId?: string
      } | null
      if (!record) return { estado: "inexistente" }
      // Registro de OTRA comunidad → oculta (404 sin filtrar existencia).
      if (record.comunidadId !== scope.comunidadId) return { estado: "oculta" }
      return { estado: "visible", fila: record as Record<string, unknown> }
    }
    if (!model.findFirst) {
      throw new Error(
        "El delegate no expone findFirst: el alcance por filas no se puede aplicar."
      )
    }
    const record = (await model.findFirst({
      where: { id, comunidadId: scope.comunidadId, ...fragmento },
    })) as Record<string, unknown> | null
    if (record) return { estado: "visible", fila: record }
    const existentes = await model.count({ where: { id } })
    return existentes > 0 ? { estado: "oculta" } : { estado: "inexistente" }
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
      // Alcance por filas: se resuelve DENTRO del try para que un fallo del
      // alcance caiga en el mapeo de errores y no en un 200 vacío. Se compone
      // con AND para no pisar el `OR` de la búsqueda por texto.
      const fragmento = await resolverAlcance(scope)
      if (fragmento) where = { AND: [where, fragmento] }
      const [data, total] = await Promise.all([
        model.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        model.count({ where }),
      ])
      // Proyección de fila (opt-in, ver CrudConfig.proyeccion): toca `data` y
      // nada más. El `total` es el de la consulta sin redactar y sin
      // `proyeccion` el cuerpo es idéntico al de siempre.
      const filas = proyeccion
        ? await Promise.all(
            data.map((fila) =>
              proyeccion(fila as Record<string, unknown>, scope)
            )
          )
        : data
      return Response.json({ data: filas, page, pageSize, total })
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
      const fila = await resolverFila(scope, id, await resolverAlcance(scope))
      // Upsert sobre un registro que existe pero NO es visible —de otro dueño
      // bajo el alcance, o de otra comunidad— → 404 (sin filtrar existencia).
      // El upsert escribe por `where: { id }`, así que tratarlo como alta
      // reescribiría la fila ajena; por eso la existencia se comprueba antes.
      if (fila.estado === "oculta") return jsonError(404, "Registro no encontrado.")
      const existente = fila.estado === "visible" ? fila.fila : null
      const denegado = autorizar(scope, existente ? "editar" : "crear")
      if (denegado) return denegado

      const corto = await aplicarGuardiaDeEscritura(
        datos,
        (existente as Record<string, unknown> | null) ?? null,
        scope
      )
      if (corto) return corto

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
      // Hook post-escritura: la fila ya está confirmada (ver CrudConfig).
      await notificarEscritura({
        accion: existente ? "editar" : "crear",
        registro: record,
        previo: existente ?? null,
        scope,
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
      const fila = await resolverFila(scope, id, await resolverAlcance(scope))
      if (fila.estado !== "visible") return jsonError(404, "Registro no encontrado.")
      return Response.json(fila.fila)
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
      const fila = await resolverFila(scope, id, await resolverAlcance(scope))
      if (fila.estado !== "visible") return jsonError(404, "Registro no encontrado.")
      const record = fila.fila
      const denegado = autorizar(scope, "editar")
      if (denegado) return denegado

      const corto = await aplicarGuardiaDeEscritura(
        parsed.data as Record<string, unknown>,
        record as Record<string, unknown>,
        scope
      )
      if (corto) return corto

      const actualizado = await model.update({
        where: { id },
        data: limpiarPayload(parsed.data as Record<string, unknown>),
      })
      // Hook post-escritura: la fila ya está confirmada (ver CrudConfig).
      await notificarEscritura({
        accion: "editar",
        registro: actualizado,
        previo: record,
        scope,
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
      const fila = await resolverFila(scope, id, await resolverAlcance(scope))
      if (fila.estado !== "visible") return jsonError(404, "Registro no encontrado.")
      const record = fila.fila
      const denegado = autorizar(scope, "eliminar")
      if (denegado) return denegado
      if (beforeDelete) {
        const corto = await beforeDelete(record, scope)
        if (corto) return corto
      }
      await model.delete({ where: { id } })
      // Hook post-escritura: el borrado ya está confirmado (ver CrudConfig).
      await notificarEscritura({
        accion: "eliminar",
        registro: record,
        previo: record,
        scope,
      })
      return Response.json({ ok: true })
    } catch (e) {
      return mapearError(e)
    }
  }

  return { GET, POST, GET_ONE, PUT, DELETE }
}
