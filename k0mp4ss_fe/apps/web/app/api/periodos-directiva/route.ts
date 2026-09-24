/**
 * /api/periodos-directiva — colección GD de períodos (BD-FUENTE-VERDAD Fase 2).
 *
 * Reemplaza la factory genérica de Fase 0 con las reglas del libro (espejo de
 * savePeriodoDirectiva en lib/store.ts):
 * - GET paginado scoped (residente puede ver: puede(rol, "ver", "gd")).
 * - POST upsert idempotente, validado con PeriodoDirectivaSchema.
 * - Art. 17 Ley 21.442: duración ≤ 36 meses (schema) + nómina impar de 3 a 5
 *   al activar un vigente + cada miembro existe y tiene cuenta activa.
 * - Solo un período "vigente" por comunidad (409 si otro vigente existe).
 * - Al activar un vigente se cierra el previo archivando su nómina y se
 *   asignan las fichas de gobernanza de la nómina entrante (conserva id).
 */
import { PeriodoDirectivaSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { CARGOS_DIRECTIVA } from "@/lib/api/gd-guard"

/** Campos persistibles de PeriodoDirectiva. */
const CAMPOS_PERIODO = [
  "fechaInicio",
  "duracionMeses",
  "fechaFin",
  "fechaInscripcion",
  "referenciaInscripcion",
  "fechasEstimadas",
  "estado",
  "actaOrigenId",
  "miembros",
] as const

export function limpiarPayloadPeriodo(
  datos: Record<string, unknown>
): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const campo of CAMPOS_PERIODO) {
    if (campo in datos) salida[campo] = datos[campo]
  }
  return salida
}

export function errorPeriodos(e: unknown): Response {
  if (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  ) {
    return jsonError(404, "Registro no encontrado.")
  }
  logger.error({ err: e }, "[api/periodos-directiva] error inesperado")
  return jsonError(500, "Error interno del servidor.")
}

export interface MiembroNomina {
  personaId: string
  nombre: string
  cargo: string
  fechaAsuncion: string
  fechaTermino?: string
  motivoTermino?: string
}

function esFechaISO(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)
}

/**
 * Valida la nómina contra MP en BD: cargos válidos, fechas ISO, personas
 * existentes con cuenta activa. No muta.
 */
export async function validarNomina(
  miembros: unknown,
  scope: ComunidadScope
): Promise<{ ok: true; nomina: MiembroNomina[] } | { ok: false; response: Response }> {
  const nomina = (Array.isArray(miembros) ? miembros : []) as MiembroNomina[]
  for (const m of nomina) {
    if (!(CARGOS_DIRECTIVA as readonly string[]).includes(m.cargo)) {
      return {
        ok: false,
        response: jsonError(400, `Cargo inválido en la nómina: ${m.cargo}.`),
      }
    }
    if (!esFechaISO(m.fechaAsuncion)) {
      return {
        ok: false,
        response: jsonError(
          400,
          `Fecha de asunción inválida en la nómina: ${m.fechaAsuncion}.`
        ),
      }
    }
    const persona = await prisma.persona.findUnique({
      where: { id: m.personaId },
      select: { id: true, nombreCompleto: true, estadoCuenta: true, comunidadId: true },
    })
    if (!persona || persona.comunidadId !== scope.comunidadId) {
      return {
        ok: false,
        response: jsonError(
          400,
          `No se puede activar: la persona "${m.personaId}" no existe.`
        ),
      }
    }
    if (persona.estadoCuenta !== "activa") {
      return {
        ok: false,
        response: jsonError(
          400,
          `No se puede activar: ${persona.nombreCompleto} no tiene cuenta activa.`
        ),
      }
    }
  }
  return { ok: true, nomina }
}

/**
 * Cierra el vigente previo archivando su nómina desde las fichas de MP
 * (libro físico) y asigna las fichas de la nómina entrante. Espejo de
 * savePeriodoDirectiva (lib/store.ts), ahora transaccional en servidor.
 */
export async function rotarVigente(
  scope: ComunidadScope,
  nuevoId: string,
  fechaInicioNuevo: string,
  nomina: MiembroNomina[]
): Promise<void> {
  const previo = await prisma.periodoDirectiva.findFirst({
    where: { comunidadId: scope.comunidadId, estado: "vigente" },
  })
  if (previo && previo.id !== nuevoId) {
    const fichasPrevias = await prisma.persona.findMany({
      where: { comunidadId: scope.comunidadId },
      select: { id: true, nombreCompleto: true, datosGobernanza: true },
    })
    // SAFETY: fichas Json escritas por la API de personas (ExtensionGobernanzaSchema); se archivan tal cual.
    const roster = fichasPrevias.flatMap((p) => {
      // SAFETY: fichas Json escritas por la API de personas (ExtensionGobernanzaSchema); se archivan tal cual.
      const ficha = p.datosGobernanza as unknown as {
        periodoId?: string
        cargoDirectiva: string
        fechaAsuncion: string
        fechaTermino?: string
        motivoTermino?: string
      } | null
      return ficha && ficha.periodoId === previo.id
        ? [
            {
              personaId: p.id,
              nombre: p.nombreCompleto,
              cargo: ficha.cargoDirectiva,
              fechaAsuncion: ficha.fechaAsuncion,
              ...(ficha.fechaTermino ? { fechaTermino: ficha.fechaTermino } : {}),
              ...(ficha.motivoTermino ? { motivoTermino: ficha.motivoTermino } : {}),
            },
          ]
        : []
    })
    await prisma.periodoDirectiva.update({
      where: { id: previo.id },
      // SAFETY: roster validado miembro por miembro (cargos/fechas/personas); JSON round-trip elimina undefined para InputJsonValue.
      data: { estado: "cerrado", fechaFin: fechaInicioNuevo, miembros: JSON.parse(JSON.stringify(roster)) as never },
    })
    // Las fichas del período cerrado quedan archivadas en la nómina; se
    // depuran de las personas que no continúan.
    const idsNuevos = new Set(nomina.map((m) => m.personaId))
    const aDepurar = fichasPrevias.filter((p) => {
      // SAFETY: solo se lee periodoId de la ficha Json validada al escribir.
      const ficha = p.datosGobernanza as unknown as { periodoId?: string } | null
      return (
        ficha?.periodoId === previo.id && !idsNuevos.has(p.id)
      )
    })
    for (const p of aDepurar) {
      await prisma.persona.update({
        where: { id: p.id },
        // SAFETY: null borra el Json (undefined sería no-op en Prisma update).
        data: { datosGobernanza: null as never },
      })
    }
  }

  // Asigna las fichas de la nómina entrante (conserva id estable por persona).
  for (const m of nomina) {
    const persona = await prisma.persona.findUnique({
      where: { id: m.personaId },
      select: { id: true, roles: true, datosGobernanza: true },
    })
    if (!persona) continue
    // SAFETY: roles es Json ROLES_PERSONA[]; se agrega "directiva" si falta (la API de personas lo valida al leer).
    const roles = (persona.roles as unknown as string[]).includes("directiva")
      ? (persona.roles as never)
      : ([...(persona.roles as unknown as string[]), "directiva"] as never)
    // SAFETY: ficha Json por ExtensionGobernanzaSchema; se conserva id/firma y se reasigna período.
    const previa = persona.datosGobernanza as unknown as {
      id?: string
      firmaDigital?: string
    } | null
    await prisma.persona.update({
      where: { id: m.personaId },
      data: {
        roles,
        datosGobernanza: {
          id: previa?.id ?? `g-${m.personaId}`,
          cargoDirectiva: m.cargo,
          fechaAsuncion: m.fechaAsuncion,
          periodoId: nuevoId,
          ...(previa?.firmaDigital ? { firmaDigital: previa.firmaDigital } : {}),
        } as never,
      },
    })
  }
}

/** GET lista paginada scoped por comunidad. */
export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "ver", "gd")) {
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
      prisma.periodoDirectiva.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.periodoDirectiva.count({ where }),
    ])
    return Response.json({ data, page, pageSize, total })
  } catch (e) {
    return errorPeriodos(e)
  }
}

/** POST upsert idempotente por id con reglas del libro GD. */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = PeriodoDirectivaSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const id = parsed.data.id

  try {
    const existente = await prisma.periodoDirectiva.findUnique({ where: { id } })
    // Upsert sobre un registro de OTRA comunidad → 404 (sin filtrar existencia)
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, existente ? "editar" : "crear", "gd")) {
      return jsonError(403, "Permiso denegado.")
    }
    // Un cerrado no se reabre por upsert (la nómina archivada es historia).
    if (existente?.estado === "cerrado" && parsed.data.estado === "vigente") {
      return jsonError(409, "Un período cerrado no se puede reabrir (el libro nunca se borra).")
    }

    // SAFETY: schema plano validado por zod; se trata como mapa para lista blanca.
    const datos = parsed.data as unknown as Record<string, unknown>
    const nominaValidada = await validarNomina(datos.miembros, scope)
    if (!nominaValidada.ok) return nominaValidada.response
    const nomina = nominaValidada.nomina

    if (parsed.data.estado === "vigente") {
      // Composición art. 17 Ley 21.442: impar de 3 a 5.
      if (nomina.length < 3 || nomina.length > 5 || nomina.length % 2 === 0) {
        return jsonError(
          400,
          `No se puede activar el período: la nómina debe ser impar de 3 a 5 miembros (art. 17 Ley 21.442). Recibidos: ${nomina.length}.`
        )
      }
      // Solo un vigente por comunidad: si hay otro, rota (cierra el previo
      // archivando su nómina); si no, solo asigna las fichas entrantes.
      await rotarVigente(scope, id, parsed.data.fechaInicio, nomina)
    }

    // SAFETY: payload blanqueado + comunidad del servidor; miembros Json ya validados.
    const record = await prisma.periodoDirectiva.upsert({
      where: { id },
      create: {
        ...limpiarPayloadPeriodo(datos),
        id,
        comunidadId: scope.comunidadId,
      } as never,
      update: limpiarPayloadPeriodo(datos) as never,
    })
    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    return errorPeriodos(e)
  }
}

