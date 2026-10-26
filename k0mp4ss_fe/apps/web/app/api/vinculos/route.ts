/**
 * /api/vinculos — colección VU (BD-FUENTE-VERDAD Fase 0).
 *
 * Reglas de negocio espejo de saveVinculo (lib/store.ts), ahora en servidor:
 * - Persona existe y su estadoCuenta no es inactiva/bloqueada (409).
 * - Unidad existe en la comunidad (400).
 * - Sin vínculo activo duplicado persona+unidad (409).
 * - Cierre automático del tramo anterior (propietario/arrendatario) dentro
 *   de una transacción junto con el upsert.
 * - Exclusividad de titularidad/arriendo y anti-autosolapamiento (409).
 * Authz: la matriz no tiene recurso "vu"; el módulo se cubre con "mp".
 */
import { VinculoUnidadSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico } from "@/app/api/personas/route"

const CAMPOS_VINCULO = [
  "personaId",
  "unidadId",
  "rol",
  "fechaInicio",
  "fechaFin",
  "estadoOcupacionPropiedad",
  "permiteVerFinanzas",
  "cerrarAnterior",
] as const

function limpiarPayloadVinculo(datos: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const campo of CAMPOS_VINCULO) {
    if (campo in datos) salida[campo] = datos[campo]
  }
  return salida
}

/** Error de dominio con estado HTTP (exclusividad / autosolape / duplicado). */
class ConflictoVinculo extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface DatosVinculo extends Record<string, unknown> {
  id: string
  personaId: string
  unidadId: string
  rol: string
  fechaInicio: string
  fechaFin?: string | null
  estadoOcupacionPropiedad?: string
  permiteVerFinanzas: boolean
  cerrarAnterior?: boolean
}

/**
 * Persiste el vínculo (upsert por id) con cierre automático y validaciones
 * de solapamiento dentro de una transacción. `existente` no nulo ⇒ update.
 */
export async function ejecutarUpsertVinculo(
  vinculo: DatosVinculo,
  scope: ComunidadScope,
  existente: { id: string; comunidadId: string } | null
): Promise<Response> {
  const comunidadId = scope.comunidadId

  // Persona existe y operativa (TST-001: bloqueo duro D6).
  const persona = await prisma.persona.findFirst({
    where: { comunidadId, id: vinculo.personaId },
  })
  if (!persona) {
    return jsonError(409, "La persona no existe en el Maestro de Personas.")
  }
  if (persona.estadoCuenta === "inactiva" || persona.estadoCuenta === "bloqueada") {
    return jsonError(
      409,
      `No se puede vincular: la persona está marcada como ${persona.estadoCuenta} en el Maestro de Personas.`
    )
  }
  // RG escritura: la unidad debe existir en la comunidad.
  const unidad = await prisma.unidad.findFirst({
    where: { comunidadId, id: vinculo.unidadId },
  })
  if (!unidad) {
    return jsonError(400, "unidadId no existe en unidades.")
  }
  // Duplicado: ya existe vínculo activo de esta persona con esta unidad.
  const duplicado = await prisma.vinculoUnidad.findFirst({
    where: {
      comunidadId,
      personaId: vinculo.personaId,
      unidadId: vinculo.unidadId,
      fechaFin: null,
      NOT: { id: vinculo.id },
    },
  })
  if (duplicado) {
    return jsonError(409, "Esta persona ya tiene un vínculo vigente con esta unidad y una persona no puede tener dos a la vez, sin importar el rol (propietario, arrendatario, ocupante). Termina el vínculo actual antes de registrar otro.")
  }

  const payload = limpiarPayloadVinculo(vinculo)

  try {
    const record = await prisma.$transaction(async (tx) => {
      // Cierre automático de tramo anterior (solo propietario/arrendatario).
      const cerrarAnterior = vinculo.cerrarAnterior !== false
      if (
        cerrarAnterior &&
        !vinculo.fechaFin &&
        (vinculo.rol === "propietario" || vinculo.rol === "arrendatario")
      ) {
        const anterior = await tx.vinculoUnidad.findFirst({
          where: {
            comunidadId,
            unidadId: vinculo.unidadId,
            rol: vinculo.rol,
            fechaFin: null,
            NOT: { id: vinculo.id },
          },
        })
        if (anterior) {
          const fechaCierre = new Date(vinculo.fechaInicio)
          fechaCierre.setDate(fechaCierre.getDate() - 1)
          await tx.vinculoUnidad.update({
            where: { id: anterior.id },
            data: { fechaFin: fechaCierre.toISOString().slice(0, 10) },
          })
        }
      }

      // Solapamientos sobre el estado post-cierre (cruza personas).
      const otros = await tx.vinculoUnidad.findMany({
        where: { comunidadId, unidadId: vinculo.unidadId, NOT: { id: vinculo.id } },
      })
      const inicio = vinculo.fechaInicio
      const fin = vinculo.fechaFin ?? "9999-12-31"
      const solapa = (v: { fechaInicio: string; fechaFin: string | null }): boolean =>
        inicio <= (v.fechaFin ?? "9999-12-31") && v.fechaInicio <= fin

      // Exclusividad de titularidad/arriendo: un solo tramo vigente por unidad.
      if (vinculo.rol === "propietario" || vinculo.rol === "arrendatario") {
        const conflicto = otros.find((v) => v.rol === vinculo.rol && solapa(v))
        if (conflicto) {
          throw new ConflictoVinculo(
            409,
            vinculo.rol === "arrendatario"
              ? "El contrato de arriendo se solapa con otro contrato vigente en la misma unidad."
              : "Ya existe un tramo de propietario que se solapa con las fechas indicadas en esta unidad."
          )
        }
      }

      // Anti-autosolapamiento: la misma persona no registra dos tramos
      // solapados del mismo rol en la unidad.
      const autosolape = otros.find(
        (v) => v.personaId === vinculo.personaId && v.rol === vinculo.rol && solapa(v)
      )
      if (autosolape) {
        throw new ConflictoVinculo(
          409,
          "Esta persona ya registra un tramo del mismo rol que se solapa con las fechas indicadas en esta unidad."
        )
      }

      return tx.vinculoUnidad.upsert({
        where: { id: vinculo.id },
        create: { ...payload, id: vinculo.id, comunidadId } as never,
        update: payload as never,
      })
    })
    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    if (e instanceof ConflictoVinculo) {
      return jsonError(e.status, e.message)
    }
    return errorGenerico(e)
  }
}

/** GET lista paginada (scoped a la comunidad). */
export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "ver", "mp")) {
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
  const where = { comunidadId: scope.comunidadId }

  try {
    const [data, total] = await Promise.all([
      prisma.vinculoUnidad.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.vinculoUnidad.count({ where }),
    ])
    return Response.json({ data, page, pageSize, total })
  } catch (e) {
    return errorGenerico(e)
  }
}

/** POST create/upsert por id. */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = VinculoUnidadSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", { detalles: parsed.error.flatten() })
  }
  const id = parsed.data.id

  try {
    const existente = await prisma.vinculoUnidad.findUnique({ where: { id } })
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, existente ? "editar" : "crear", "mp")) {
      return jsonError(403, "Permiso denegado.")
    }
    // SAFETY: VinculoUnidadSchema ya validó el shape; el cast recupera la
    // interfaz DatosVinculo (campos opcionales como fechaFin) que Zod infiere
    // como opcional idéntico, pero que el double cast evita frotar genéricos.
    return await ejecutarUpsertVinculo(
      parsed.data as unknown as DatosVinculo,
      scope,
      existente ? { id: existente.id, comunidadId: existente.comunidadId } : null
    )
  } catch (e) {
    return errorGenerico(e)
  }
}
