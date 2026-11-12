/**
 * GET /api/vigencia-registro/kpi — el KPI de unidades con el registro al día (S9).
 *
 * La métrica que el Comité mira es una sola cifra: qué porcentaje de las
 * unidades tiene el Registro de Copropietarios actualizado. Se cuelga del módulo
 * de métricas existente (`/admin/metricas`) y vive acá para que sea el mismo
 * servidor el que decide, sin que el navegador reciba el padrón completo sólo
 * para contar.
 *
 * La derivación NO se reinventa: cada unidad se resuelve con `estadoDelCaso`,
 * exactamente la función que usa el listado, y el conteo lo hace la regla pura
 * `kpiDeVigencia`. Si esta ruta calculara «al día» por su cuenta habría dos
 * verdades del mismo hecho. El estado tampoco se guarda: se deriva de los hechos
 * congelados de cada caso.
 *
 * Costo: las MISMAS dos consultas del listado —unidades y casos, una por
 * colección—. Ninguna consulta por unidad.
 *
 * Authz: `ad` con acción `editar`, igual que el listado. `ver` no alcanza porque
 * el rol `residente` la posee: no vería los datos de las otras unidades, pero sí
 * el agregado de un registro que S5 le niega. El resumen propio del residente
 * llega por `GET /api/vigencia-registro/mi-unidad`, no acá.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { estadoDelCaso } from "@/lib/vigencia-registro"
import { kpiDeVigencia } from "@/lib/vigencia-metricas"

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "editar", "ad")) {
    return jsonError(403, "Permiso denegado.")
  }

  const hoy = new Date()

  // Las dos consultas del listado, una por colección: nunca una por unidad.
  const [unidades, casos] = await Promise.all([
    prisma.unidad.findMany({
      where: { comunidadId: scope.comunidadId },
      select: { id: true },
      orderBy: { numero: "asc" },
    }),
    prisma.vigenciaRegistroUnidad.findMany({
      where: { comunidadId: scope.comunidadId },
    }),
  ])

  const porUnidad = new Map(casos.map((caso) => [caso.unidadId, caso]))

  const kpi = kpiDeVigencia(
    unidades.map((unidad) => {
      const caso = porUnidad.get(unidad.id)
      return estadoDelCaso(
        {
          ultimaActualizacion: caso?.ultimaActualizacion ?? null,
          requerimientoEn: caso?.requerimientoEn ?? null,
        },
        hoy
      )
    })
  )

  // `hoy` viaja con la cifra: el mismo número sin la fecha de referencia no se
  // puede leer (no se sabe si es de esta mañana o de la semana pasada).
  return Response.json({ ...kpi, hoy: hoy.toISOString() })
}
