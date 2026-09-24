/**
 * /api/personas — colección MP (BD-FUENTE-VERDAD Fase 0).
 *
 * Scoping por withComunidadScope (el comunidadId es decisión del servidor).
 * Reglas de negocio espejo de savePersona (lib/store.ts), ahora en servidor:
 * - D1: media por referencia (foto/firma), jamás data:/blob:.
 * - GD: coherencia rol↔ficha (sin directiva se depura datosGobernanza) y
 *   herencia del período vigente cuando la ficha no lo declara.
 * - PE: FKs laborales contra los maestros legales de MA.
 * - MP: RUT y email únicos por comunidad (409).
 * - ABAC residente: en colección GET ve únicamente su propia ficha.
 */
import { PersonaSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"

/** Campos persistibles de Persona (lista blanca: descarta id, comunidadId,
 * vinculosUnidad —no es campo de BD— y cualquier clave ajena). */
const CAMPOS_PERSONA = [
  "rut",
  "nombreCompleto",
  "nombres",
  "apellidos",
  "email",
  "telefonoMovil",
  "telefonoFijo",
  "fotografiaUrl",
  "estadoCuenta",
  "condicionesEspecialesIds",
  "roles",
  "datosLaborales",
  "datosGobernanza",
  "permiteCreacionManualCV",
] as const

export function limpiarPayloadPersona(datos: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const campo of CAMPOS_PERSONA) {
    if (campo in datos) salida[campo] = datos[campo]
  }
  return salida
}

/** personaId (MP) asociado al usuario de la sesión, o null. */
export async function personaIdDelUsuario(usuarioId: string): Promise<string | null> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { personaId: true },
  })
  return usuario?.personaId ?? null
}

type DelegateBusqueda = {
  findFirst(args: { where: Record<string, unknown> }): Promise<unknown>
}

/** Mapeo error Prisma → HTTP (misma semántica que crud-factory). */
export function errorGenerico(e: unknown): Response {
  if (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  ) {
    return jsonError(404, "Registro no encontrado.")
  }
  logger.error({ err: e }, "[api/personas] error inesperado")
  return jsonError(500, "Error interno del servidor.")
}

export type ValidacionPersona =
  | { ok: true; datos: Record<string, unknown> }
  | { ok: false; response: Response }

/**
 * Validaciones de negocio sobre datos ya validados por PersonaSchema
 * (completo en POST, mergeado con el registro existente en PUT).
 * Muta `datos` (strip/inject de gobernanza) y devuelve el payload limpio.
 */
export async function validarYLimpiarPersona(
  datos: Record<string, unknown>,
  scope: ComunidadScope,
  idParaExcluir?: string
): Promise<ValidacionPersona> {
  const comunidadId = scope.comunidadId

  // AD (D1): foto y firma digitalizada solo por referencia; jamás base64/Blob.
  const esReferenciaValida = (valor?: string): boolean =>
    valor === undefined ||
    (!/^data:/i.test(valor) &&
      !/^blob:/i.test(valor) &&
      valor.length <= 2048)
  if (!esReferenciaValida(datos.fotografiaUrl as string | undefined)) {
    return {
      ok: false,
      response: jsonError(
        400,
        "Media por referencia (D1): la fotografía debe ser una URL, no contenido embebido."
      ),
    }
  }
  const firma = (datos.datosGobernanza as Record<string, unknown> | undefined | null)?.firmaDigital
  if (!esReferenciaValida(firma as string | undefined)) {
    return {
      ok: false,
      response: jsonError(
        400,
        "Media por referencia (D1): la firma digitalizada debe ser una URL, no contenido embebido."
      ),
    }
  }

  // GD: coherencia rol↔ficha — sin rol directiva no hay miembro vigente.
  const roles = Array.isArray(datos.roles) ? (datos.roles as string[]) : []
  if (!roles.includes("directiva") && datos.datosGobernanza) {
    delete datos.datosGobernanza
  } else if (
    roles.includes("directiva") &&
    datos.datosGobernanza &&
    !(datos.datosGobernanza as Record<string, unknown>).periodoId
  ) {
    // GD-períodos: la ficha sin período hereda el vigente (alta espejo del libro).
    const vigente = await prisma.periodoDirectiva.findFirst({
      where: { comunidadId, estado: "vigente" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    })
    if (vigente) {
      datos.datosGobernanza = {
        ...(datos.datosGobernanza as Record<string, unknown>),
        periodoId: vigente.id,
      }
    }
  }

  // PE: FKs de la ficha laboral contra los maestros legales de MA (RG escritura).
  const dl = datos.datosLaborales as Record<string, unknown> | undefined | null
  if (dl && typeof dl === "object") {
    const fks: [string, DelegateBusqueda][] = [
      ["afpId", prisma.afp],
      ["saludId", prisma.previsionSalud],
      ["asignacionFamiliarId", prisma.asignacionFamiliar],
      ["mutualidadId", prisma.mutualCaja],
      ["bancoId", prisma.banco],
    ]
    for (const [campo, modelo] of fks) {
      const valor = dl[campo]
      if (typeof valor === "string" && valor.length > 0) {
        const existe = await modelo.findFirst({ where: { comunidadId, id: valor } })
        if (!existe) {
          return {
            ok: false,
            response: jsonError(
              400,
              `${campo} no existe en el maestro correspondiente.`
            ),
          }
        }
      }
    }
  }

  // MP: condicionesEspecialesIds subset de los maestros MA de la comunidad.
  const conds = Array.isArray(datos.condicionesEspecialesIds)
    ? (datos.condicionesEspecialesIds as string[])
    : []
  if (conds.length > 0) {
    const validas = await prisma.condicionEspecial.findMany({
      where: { comunidadId },
      select: { id: true },
    })
    const ids = new Set(validas.map((c) => c.id))
    for (const cid of conds) {
      if (!ids.has(cid)) {
        return {
          ok: false,
          response: jsonError(400, `condicionEspecial ${cid} no existe.`),
        }
      }
    }
  }

  // MP: RUT y email únicos por comunidad (repetibles entre comunidades).
  const excluirId = idParaExcluir ?? (typeof datos.id === "string" ? datos.id : "")
  const not = excluirId ? { id: excluirId } : undefined
  if (typeof datos.rut === "string" && datos.rut) {
    const dupRut = await prisma.persona.findFirst({
      where: { comunidadId, rut: datos.rut, NOT: not },
    })
    if (dupRut) {
      return {
        ok: false,
        response: jsonError(
          409,
          "Conflicto: el RUT ya está registrado en esta comunidad."
        ),
      }
    }
  }
  if (typeof datos.email === "string" && datos.email) {
    const dupEmail = await prisma.persona.findFirst({
      where: { comunidadId, email: datos.email, NOT: not },
    })
    if (dupEmail) {
      return {
        ok: false,
        response: jsonError(
          409,
          "Conflicto: el correo electrónico ya está registrado en esta comunidad."
        ),
      }
    }
  }

  return { ok: true, datos }
}

function denegar(rol: string, accion: "ver" | "crear" | "editar" | "eliminar"): Response | null {
  if (puede(rol, accion, "mp")) return null
  return jsonError(403, "Permiso denegado.")
}

/** GET lista paginada, filtrable por ?q= (nombreCompleto | rut | email).
 * Residente: ve únicamente su propia ficha (ABAC mp:propios). */
export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const residente = scope.rol === "residente"
  if (!residente && !puede(scope.rol, "ver", "mp")) {
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
  const q = url.searchParams.get("q")?.trim()

  const where: Record<string, unknown> = { comunidadId: scope.comunidadId }
  if (residente) {
    const personaId = await personaIdDelUsuario(scope.usuarioId)
    where.id = personaId ?? "__sin_persona__"
  }
  if (q) {
    where.OR = [
      { nombreCompleto: { contains: q } },
      { rut: { contains: q } },
      { email: { contains: q } },
    ]
  }

  try {
    const [data, total] = await Promise.all([
      prisma.persona.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.persona.count({ where }),
    ])
    return Response.json({ data, page, pageSize, total })
  } catch (e) {
    return errorGenerico(e)
  }
}

/** POST upsert idempotente por id (la fuente de verdad gana, no el orden). */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = PersonaSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", { detalles: parsed.error.flatten() })
  }
  const id = parsed.data.id

  try {
    const existente = await prisma.persona.findUnique({ where: { id } })
    // Upsert sobre un registro de OTRA comunidad → 404 (sin filtrar existencia)
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    const denegado = denegar(scope.rol, existente ? "editar" : "crear")
    if (denegado) return denegado

    const validado = await validarYLimpiarPersona(
      parsed.data as unknown as Record<string, unknown>,
      scope,
      id
    )
    if (!validado.ok) return validado.response

    const record = await prisma.persona.upsert({
      where: { id },
      create: {
        ...limpiarPayloadPersona(validado.datos),
        id,
        comunidadId: scope.comunidadId,
      } as never,
      update: limpiarPayloadPersona(validado.datos) as never,
    })
    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    return errorGenerico(e)
  }
}
