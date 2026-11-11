/**
 * /api/vigencia-registro — el reloj del Registro de Copropietarios (S2, S6).
 *
 * Devuelve el estado de vigencia de cada unidad de la comunidad, derivado en el
 * servidor con `lib/vigencia-registro.ts`. El estado no se guarda en la base: se
 * calcula siempre desde los hechos congelados (última declaración y acto de
 * requerir), así una misma unidad no puede tener dos verdades distintas.
 *
 * Authz: `ad` con la acción `editar`. No se usa `ver` a propósito — el residente
 * tiene `ad:ver` sobre la marca de su propiedad y con esa acción vería el
 * registro de TODAS las unidades, que es justo lo que S5 prohíbe. La vista
 * acotada del propietario y del arrendatario llega por vínculo (T7), no acá.
 *
 * S1: la respuesta suma `multa`, la disponibilidad de la multa de vigencia tal
 * como la declaró la comunidad en su propio maestro de infracciones (con su
 * ancla legal). Se calcula una vez por comunidad, nunca por unidad, y si no
 * está declarada lo dice: el sistema no inventa un monto.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { estadoDelCaso, type EstadoCasoRegistro } from "@/lib/vigencia-registro"
import { multaDeVigenciaDeLaComunidad } from "@/lib/vigencia-multa"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

interface FilaVigencia {
  unidadId: string
  numero: string
  etiqueta: string | null
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

  if (!puede(scope.rol, "editar", "ad")) {
    return jsonError(403, "Permiso denegado.")
  }

  const hoy = new Date()

  const [unidades, casos, multa] = await Promise.all([
    prisma.unidad.findMany({
      where: { comunidadId: scope.comunidadId },
      select: { id: true, numero: true, etiqueta: true },
      orderBy: { numero: "asc" },
    }),
    prisma.vigenciaRegistroUnidad.findMany({
      where: { comunidadId: scope.comunidadId },
    }),
    multaDeVigenciaDeLaComunidad(scope.comunidadId),
  ])

  const porUnidad = new Map(casos.map((caso) => [caso.unidadId, caso]))

  const data: FilaVigencia[] = unidades.map((unidad) => {
    const caso = porUnidad.get(unidad.id)
    const veredicto = estadoDelCaso(
      {
        ultimaActualizacion: caso?.ultimaActualizacion ?? null,
        requerimientoEn: caso?.requerimientoEn ?? null,
      },
      hoy
    )
    return {
      unidadId: unidad.id,
      numero: unidad.numero,
      etiqueta: unidad.etiqueta,
      ...veredicto,
      ultimaActualizacion: caso?.ultimaActualizacion?.toISOString() ?? null,
      requerimientoEn: caso?.requerimientoEn?.toISOString() ?? null,
    }
  })

  const resumen = data.reduce<Record<string, number>>((acc, fila) => {
    acc[fila.estado] = (acc[fila.estado] ?? 0) + 1
    return acc
  }, {})

  return Response.json({
    data,
    resumen,
    total: data.length,
    hoy: hoy.toISOString(),
    // S1: disponible o el motivo por el que la comunidad no puede multar, más el
    // ancla legal declarada en el maestro (si consta).
    multa: multa.disponible
      ? {
          disponible: true,
          monto: multa.monto,
          referenciaLegal: multa.referenciaLegal,
        }
      : {
          disponible: false,
          motivo: multa.motivo,
          referenciaLegal: multa.referenciaLegal,
        },
  })
}
