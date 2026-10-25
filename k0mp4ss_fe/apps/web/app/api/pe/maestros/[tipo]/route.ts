/**
 * /api/pe/maestros/[tipo] — maestros operativos que monta la conserjería (PE).
 *
 * `jornadas`, `couriers` y `contratistas` son los tres catálogos con los que se registra una visita,
 * una encomienda o un ingreso: los paneles los ofrecen como opciones y sin ellos no se puede
 * agendar nada. Viven en `/api/maestros/[tipo]`, que gatea con `puede(rol, "ver", "mp")`, y el
 * bloque `conserjeria` de la matriz solo declara `mp:propios` (ABAC del propio vínculo): la ruta le
 * responde **403 al rol que opera la bitácora**. Es el mismo defecto H9 que ya sufrieron el padrón
 * de unidades y el de personas, y se resuelve igual.
 *
 * PROYECCIÓN de solo lectura: `id` y `nombre`, scope de la sesión y el permiso `pe:bitacora`.
 * La lista de tipos es cerrada a propósito —esto no es un maestro genérico—: cualquier otro tipo
 * responde 404 sin consultar la base.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

/** Campos de la proyección: es lo único que los selects necesitan. */
interface MaestroOperativoPE {
  id: string
  nombre: string
}

/** Tipos servidos, con su consulta scoped por comunidad. */
const CONSULTAS: Record<string, (comunidadId: string) => Promise<MaestroOperativoPE[]>> = {
  jornadas: (comunidadId) =>
    prisma.jornada.findMany({
      where: { comunidadId },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  couriers: (comunidadId) =>
    prisma.courier.findMany({
      where: { comunidadId },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  contratistas: (comunidadId) =>
    prisma.contratista.findMany({
      where: { comunidadId },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ tipo: string }> }
): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  // Conserjería y mantención operan la bitácora; el administrador entra por wildcard.
  if (!puede(scope.rol, "ver", "pe:bitacora")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { tipo } = await ctx.params
  const consultar = CONSULTAS[tipo]
  if (!consultar) {
    return jsonError(404, "Maestro no disponible para la operación.")
  }

  try {
    const data = await consultar(scope.comunidadId)
    return Response.json({ data, total: data.length })
  } catch (e) {
    logger.error({ err: e, tipo }, "[api/pe/maestros] error inesperado")
    return jsonError(500, "No se pudo consultar el maestro de la operación.")
  }
}
