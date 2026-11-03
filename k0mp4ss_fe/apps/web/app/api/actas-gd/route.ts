/**
 * /api/actas-gd — colección GD de actas de directiva (BD-FUENTE-VERDAD Fase 2).
 *
 * - GET paginado scoped por comunidad. Residente: solo publicadas y únicamente
 *   si algún control AD autoriza (residenteVeActas); sin autorización → 403.
 * - POST upsert idempotente por id, validado con ActaGDSchema. Al CREAR, el
 *   servidor asigna el folio del libro de actas (`AD-<año>-<correlativo>`,
 *   Ley 21.442 art. 15); un acta ya foliada nunca se renumera.
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
import { anioDeFecha, siguienteFolioActa } from "./_folio"

/** Intentos de asignación de folio antes de rendirse ante colisiones reales. */
const MAX_INTENTOS_FOLIO = 3

/**
 * Campos persistibles de ActaGD (el cliente nunca decide id, comunidad ni folio:
 * el folio del libro de actas lo asigna el servidor al crear).
 */
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

/** ¿El error es la colisión del índice único `(comunidadId, folio)`? */
function esConflictoDeFolio(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  )
}

/**
 * Siguiente folio `AD-<año>-<correlativo>` de la comunidad: `max(correlativo del
 * año) + 1` sobre los folios ya asignados. Mismo patrón que el folio `CT-####`
 * de certificados (server-side, por comunidad, con el índice único como
 * garantía dura y reintento acotado en el POST), pero SIN transacción
 * interactiva: medido el 2026-11-04 con 5 altas en paralelo sobre SQLite, la
 * transacción que sólo lee retenía el lock de escritura y 4 de 5 altas morían
 * con P1008/P2028, mientras que con la lectura simple las 5 reciben folios
 * consecutivos y distintos. La lectura no necesita transacción porque el
 * índice único es lo que impide repetir un folio, no el aislamiento.
 */
async function asignarFolio(comunidadId: string, anio: string): Promise<string> {
  const emitidos = await prisma.actaGD.findMany({
    where: { comunidadId, folio: { not: null } },
    select: { folio: true },
  })
  return siguienteFolioActa(
    emitidos.map((acta) => acta.folio),
    anio
  )
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
  else where.estado = { not: "desestimada" } // desestimadas solo en el archivo

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
    // El estado `desestimada` solo lo escribe el DELETE (borrado lógico con
    // copia de archivo y auditoría); un POST no puede crearlo ni forzarlo.
    if (datos.estado === "desestimada" || existente?.estado === "desestimada") {
      return jsonError(
        400,
        "El estado desestimada solo se establece al eliminar el acta (borrado lógico)."
      )
    }
    const negocio = await validarAsistentesYPeriodo(datos, scope)
    if (!negocio.ok) return negocio.response

    const payload = limpiarPayloadActa(datos)
    // Un acta ya foliada conserva su folio: editar (o reenviar el mismo id) no
    // renumera nada. El UPDATE nunca incluye `folio`, y el folio del body se
    // descarta en `limpiarPayloadActa` (no está en CAMPOS_ACTA), así que el
    // cliente no puede fijarlo ni pisarlo.
    if (existente) {
      // SAFETY: payload blanqueado por CAMPOS_ACTA + comunidad del servidor; Json arrays ya validados por zod.
      const record = await prisma.actaGD.upsert({
        where: { id },
        create: {
          ...payload,
          id,
          comunidadId: scope.comunidadId,
        } as never,
        update: payload as never,
      })
      return Response.json(record, { status: 200 })
    }

    // Alta: el folio del libro lo asigna el servidor (Ley 21.442 art. 15).
    const anio = anioDeFecha(datos.fecha as string)
    for (let intento = 1; intento <= MAX_INTENTOS_FOLIO; intento++) {
      const folio = await asignarFolio(scope.comunidadId, anio)
      try {
        // SAFETY: payload blanqueado por CAMPOS_ACTA + comunidad y folio del servidor; Json arrays ya validados por zod.
        const record = await prisma.actaGD.upsert({
          where: { id },
          create: {
            ...payload,
            id,
            comunidadId: scope.comunidadId,
            folio,
          } as never,
          update: payload as never,
        })
        return Response.json(record, { status: 201 })
      } catch (e) {
        // P2002 = índice único `(comunidadId, folio)`: otra alta tomó el número
        // entre la lectura y la escritura. Se reintenta con el siguiente; si se
        // agotan los intentos, el desenlace es un 409 de conflicto, no un 500.
        if (!esConflictoDeFolio(e)) return errorActas(e)
      }
    }
    return jsonError(
      409,
      "Conflicto: no se pudo reservar un folio libre para el acta, reintentá el guardado."
    )
  } catch (e) {
    return errorActas(e)
  }
}
