/**
 * /api/ra/reservas/solicitadas — cola de autorización del administrador.
 *
 * Alerta de reservas (pedido del owner): acá se leen SOLO las reservas en estado
 * `solicitada` de la comunidad, con lo que el panel necesita para decidir sin
 * abrir otra pantalla — quién pide, para qué unidad, qué elemento, cuándo y
 * cuánto — ya resuelto en el servidor (`elementoNombre`, `solicitanteNombre`,
 * `unidadEtiqueta`).
 *
 * Por qué una ruta propia y no el GET de la colección: la factory pagina y
 * ordena por `createdAt`, pero no filtra por estado ni por solicitante/unidad, y
 * la búsqueda por texto de `?q=` no cruza relaciones. Acá el filtro vive en el
 * `where` de Prisma y por eso ACOTA sobre toda la colección, no sobre la página
 * que ya se trajo el navegador.
 *
 * Portón: `editar` sobre `ra` (matriz de `lib/authz.ts`), el mismo permiso de las
 * acciones RA. El residente tiene `ra: ver/crear` y no entra acá: la cola de
 * autorización no es información suya.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { etiquetaUnidad } from "@/lib/unidades-destino"
import { contextoAccionRA } from "../../_acciones"
import { errorGenerico } from "@/app/api/personas/route"
import { jsonError } from "@/lib/api/with-comunidad-scope"

/** Tope de página: el panel pide tandas chicas, la ruta no deja traer todo. */
const PAGE_SIZE_MAXIMO = 50
const PAGE_SIZE_DEFECTO = 10

/** GET /api/ra/reservas/solicitadas?page=&pageSize=&solicitanteId=&unidadId= */
export async function GET(req: Request): Promise<Response> {
  const contexto = await contextoAccionRA()
  if (!contexto.ok) return contexto.response
  const { scope } = contexto

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }

  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    PAGE_SIZE_MAXIMO,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "", 10) || PAGE_SIZE_DEFECTO)
  )
  const solicitanteId = url.searchParams.get("solicitanteId")?.trim() || undefined
  const unidadId = url.searchParams.get("unidadId")?.trim() || undefined

  const where = {
    comunidadId: scope.comunidadId,
    estado: "solicitada",
    ...(solicitanteId ? { solicitantePersonaId: solicitanteId } : {}),
    ...(unidadId ? { unidadId } : {}),
  }

  try {
    const [filas, total] = await Promise.all([
      prisma.reservaRA.findMany({
        where,
        // Lo más urgente primero: la reserva pendiente más próxima en el tiempo.
        orderBy: [{ fecha: "asc" }, { horaInicio: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.reservaRA.count({ where }),
    ])

    // Rótulos de la página (tres consultas acotadas por los ids ya traídos).
    const elementoIds = [...new Set(filas.map((f) => f.elementoId))]
    const personaIds = [...new Set(filas.map((f) => f.solicitantePersonaId))]
    const unidadIds = [...new Set(filas.map((f) => f.unidadId).filter((id): id is string => !!id))]

    const [elementos, personas, unidades] = await Promise.all([
      prisma.elementoRA.findMany({
        where: { comunidadId: scope.comunidadId, id: { in: elementoIds } },
        select: { id: true, nombre: true, tarifaUso: true },
      }),
      prisma.persona.findMany({
        where: { comunidadId: scope.comunidadId, id: { in: personaIds } },
        select: { id: true, nombreCompleto: true },
      }),
      prisma.unidad.findMany({
        where: { comunidadId: scope.comunidadId, id: { in: unidadIds } },
        select: { id: true, numero: true, etiqueta: true, rolSii: true },
      }),
    ])

    const nombreElemento = new Map(elementos.map((e) => [e.id, e.nombre]))
    const nombrePersona = new Map(personas.map((p) => [p.id, p.nombreCompleto]))
    const etiquetaDeUnidad = new Map(unidades.map((u) => [u.id, etiquetaUnidad(u)]))

    return Response.json({
      data: filas.map((f) => ({
        id: f.id,
        folio: f.folio,
        elementoId: f.elementoId,
        elementoNombre: nombreElemento.get(f.elementoId) ?? f.elementoId,
        solicitantePersonaId: f.solicitantePersonaId,
        // Sin persona en el padrón la fila no se cae: muestra el id, como el resto del sistema.
        solicitanteNombre: nombrePersona.get(f.solicitantePersonaId) ?? f.solicitantePersonaId,
        unidadId: f.unidadId,
        unidadEtiqueta: f.unidadId
          ? (etiquetaDeUnidad.get(f.unidadId) ?? f.unidadId)
          : "Sin unidad asignada",
        fecha: f.fecha,
        horaInicio: f.horaInicio,
        horaFin: f.horaFin,
        montoTarifa: f.montoTarifa,
        montoGarantia: f.montoGarantia,
      })),
      page,
      pageSize,
      total,
    })
  } catch (e) {
    logger.error({ err: e }, "[api/ra/reservas/solicitadas] error inesperado")
    return errorGenerico(e)
  }
}
