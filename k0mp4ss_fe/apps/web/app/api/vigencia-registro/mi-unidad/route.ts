/**
 * GET /api/vigencia-registro/mi-unidad — el estado del Registro visto por quien
 * vive la unidad (S5).
 *
 * El listado administrativo (`GET /api/vigencia-registro`) exige `ad` con acción
 * `editar` justamente porque el rol `residente` tiene `ad:ver` y vería el
 * registro de todas las unidades. Esta ruta es la otra mitad: la vista acotada
 * del propietario y del arrendatario, resuelta **por vínculo** y no por rol.
 *
 * Reglas que sostienen el alcance:
 *
 * - El `personaId` sale de la BD de la sesión (`personaIdDelUsuarioDb`) y el
 *   `comunidadId` de la membresía (`withComunidadScope`). El cliente no aporta
 *   ninguno de los dos ni puede pedir otra unidad: no hay parámetros.
 * - Sólo vínculos VIGENTES (`fechaFin: null`), el mismo criterio de
 *   `unidadesVinculadasDb` y del gate de residencia.
 * - Sin ficha en el Maestro de Personas o sin vínculo, la respuesta es una
 *   lista vacía, no un 404: no tener unidades es un estado legítimo de la
 *   cuenta, y el 404 se reserva para un recurso que se pidió y no existe.
 *
 * El estado se deriva con `estadoDelCaso` sobre los hechos guardados, igual que
 * la ruta administrativa: acá no se lee ni se escribe un estado persistido.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import { estadoDelCaso, type EstadoCasoRegistro } from "@/lib/vigencia-registro"

/**
 * Una fila propia: los mismos campos que devuelve el listado administrativo,
 * más el rol y el permiso del vínculo, que es lo que decide si esta cuenta
 * puede declarar.
 */
interface FilaPropia {
  unidadId: string
  numero: string
  etiqueta: string | null
  rol: string
  puedeDeclararRegistro: boolean
  estado: EstadoCasoRegistro
  cambiaEl?: string
  diasParaCambiar?: number
  descripcion: string
  ultimaActualizacion: string | null
  requerimientoEn: string | null
}

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  const hoy = new Date()

  try {
    const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
    // Fail-closed: sin identidad en el Maestro de Personas no hay «lo propio».
    if (!personaId) return Response.json({ data: [], total: 0, hoy: hoy.toISOString() })

    const vinculos = await prisma.vinculoUnidad.findMany({
      where: { comunidadId: scope.comunidadId, personaId, fechaFin: null },
      orderBy: [{ fechaInicio: "desc" }, { id: "desc" }],
      select: {
        unidadId: true,
        rol: true,
        puedeDeclararRegistro: true,
      },
    })
    if (vinculos.length === 0) {
      return Response.json({ data: [], total: 0, hoy: hoy.toISOString() })
    }

    // `VinculoUnidad` guarda los ids sin relación de Prisma: los rótulos y el caso
    // se resuelven con dos lecturas acotadas por los ids que ya son propios.
    const unidadIds = [...new Set(vinculos.map((v) => v.unidadId))]
    const [unidades, casos] = await Promise.all([
      prisma.unidad.findMany({
        where: { comunidadId: scope.comunidadId, id: { in: unidadIds } },
        select: { id: true, numero: true, etiqueta: true },
      }),
      prisma.vigenciaRegistroUnidad.findMany({
        where: { comunidadId: scope.comunidadId, unidadId: { in: unidadIds } },
      }),
    ])
    const unidadesPorId = new Map(unidades.map((u) => [u.id, u]))
    const casosPorUnidad = new Map(casos.map((caso) => [caso.unidadId, caso]))

    const data: FilaPropia[] = vinculos.map((vinculo) => {
      const unidad = unidadesPorId.get(vinculo.unidadId)
      const caso = casosPorUnidad.get(vinculo.unidadId)
      const veredicto = estadoDelCaso(
        {
          ultimaActualizacion: caso?.ultimaActualizacion ?? null,
          requerimientoEn: caso?.requerimientoEn ?? null,
        },
        hoy
      )
      return {
        unidadId: vinculo.unidadId,
        // Un vínculo cuya unidad no se puede rotular conserva la fila y muestra el
        // id: el residente no debe perder de vista su caso por una etiqueta rota.
        numero: unidad?.numero ?? vinculo.unidadId,
        etiqueta: unidad?.etiqueta ?? null,
        rol: vinculo.rol,
        puedeDeclararRegistro: vinculo.puedeDeclararRegistro,
        ...veredicto,
        ultimaActualizacion: caso?.ultimaActualizacion?.toISOString() ?? null,
        requerimientoEn: caso?.requerimientoEn?.toISOString() ?? null,
      }
    })

    // Orden estable para la pantalla: por número de unidad y, si la misma persona
    // tiene dos roles en una unidad, por rol.
    data.sort(
      (a, b) => a.numero.localeCompare(b.numero) || a.rol.localeCompare(b.rol)
    )

    return Response.json({ data, total: data.length, hoy: hoy.toISOString() })
  } catch (e) {
    logger.error({ err: e }, "[api/vigencia-registro/mi-unidad] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}
