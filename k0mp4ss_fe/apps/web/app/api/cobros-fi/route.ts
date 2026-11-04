/**
 * /api/cobros-fi — colección de cobros FI (BD-FUENTE-VERDAD Fase 3).
 *
 * GET con filtros `?periodo=` y `?unidadId=`. ABAC residente: solo ve los
 * cobros de unidades donde tiene vínculo activo (paridad con el filtro
 * `fi` por unidad del store). Otros roles requieren ver "fi".
 * POST upsert vía factory (solo administrador escribe).
 *
 * T8 (S5): la escritura usa `CobroFIEscrituraSchema` (rechaza `lineas: null`) y
 * una guardia que valida el registro que va a quedar guardado —fila existente +
 * payload— contra `CobroFIEscrituraCompletaSchema`. Sin ella, el PUT del factory
 * validaba solo el parche y un cambio aislado de `montoBase` (o de `lineas`)
 * dejaba el cobro descuadrado.
 */
import { CobroFIEscrituraCompletaSchema, CobroFIEscrituraSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import {
  createCrudHandlers,
  type AntesDeEscribir,
  type CrudDelegate,
} from "@/lib/api/crud-factory"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { errorGenerico, personaIdDelUsuario } from "@/app/api/personas/route"

// Adaptador de delegate Prisma a la factory (mismo patrón que maestros/[tipo]).
function delegado(modelo: unknown): CrudDelegate {
  return modelo as CrudDelegate
}

/**
 * Columnas nullable del modelo cuyo `NULL` significa "sin dato" para el contrato
 * de escritura. Un cobro legacy tiene `lineas`, `origenRef` y `fechaVencimiento`
 * en `NULL`: sin normalizarlas, ningún cobro emitido antes de S5 podría
 * actualizarse. Un `NULL` del PAYLOAD sí se rechaza (lo valida el esquema antes
 * de esta guardia), así que esto no abre la puerta a borrar el detalle.
 */
const NULOS_DE_BD = ["lineas", "origenRef", "fechaVencimiento"] as const

/**
 * Guardia previa a la escritura (POST upsert y PUT parcial): valida el registro
 * FUSIONADO, no solo el payload. El PUT del factory es parcial, así que un
 * parche que toca un solo lado del contrato (solo `montoBase` o solo `lineas`)
 * se detecta acá y se rechaza con el mensaje del invariante, sin escribir.
 */
const guardiaCobroCoherente: AntesDeEscribir = ({ datos, previo }) => {
  const fusionado: Record<string, unknown> = { ...(previo ?? {}), ...datos }
  for (const campo of NULOS_DE_BD) {
    if (fusionado[campo] === null) delete fusionado[campo]
  }
  const validacion = CobroFIEscrituraCompletaSchema.safeParse(fusionado)
  if (validacion.success) return null
  const delDetalle = validacion.error.issues.find(
    (issue) => issue.path.join(".") === "lineas"
  )
  return jsonError(400, delDetalle?.message ?? "Datos inválidos.", {
    detalles: validacion.error.flatten(),
  })
}

export const cobrosHandlers = createCrudHandlers({
  model: delegado(prisma.cobroFI),
  schema: CobroFIEscrituraSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "fi"),
  antesDeEscribir: guardiaCobroCoherente,
})

export const POST = cobrosHandlers.POST

/** Unidades con vínculo activo de la persona (para el filtro residente). */
export async function unidadesDePersona(
  comunidadId: string,
  personaId: string
): Promise<string[]> {
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: { comunidadId, personaId, fechaFin: null },
    select: { unidadId: true },
  })
  return vinculos.map((v) => v.unidadId)
}

/** GET lista paginada, filtrable por período y unidad. */
export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope: ComunidadScope = resultado.scope

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
  const periodo = url.searchParams.get("periodo")?.trim() || undefined
  const unidadId = url.searchParams.get("unidadId")?.trim() || undefined

  try {
    const where: Record<string, unknown> = { comunidadId: scope.comunidadId }
    if (scope.rol === "residente") {
      const personaId = await personaIdDelUsuario(scope.usuarioId)
      if (!personaId) {
        return Response.json({ data: [], page, pageSize, total: 0 })
      }
      const propias = await unidadesDePersona(scope.comunidadId, personaId)
      where.unidadId = { in: unidadId ? propias.filter((u) => u === unidadId) : propias }
    } else {
      if (!puede(scope.rol, "ver", "fi")) {
        return jsonError(403, "Permiso denegado.")
      }
      if (unidadId) where.unidadId = unidadId
    }
    if (periodo) where.periodo = periodo

    const [data, total] = await Promise.all([
      prisma.cobroFI.findMany({
        where: where as never,
        orderBy: [{ periodo: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.cobroFI.count({ where: where as never }),
    ])
    return Response.json({ data, page, pageSize, total })
  } catch (e) {
    logger.error({ err: e }, "[api/cobros-fi] error inesperado")
    return errorGenerico(e)
  }
}
