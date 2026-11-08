/**
 * /api/cobros-fi/mi-estado-cuenta — la deuda propia del residente.
 *
 * Decisión del owner (2026-11-08): el residente ve su deuda SIEMPRE y SOLO la
 * suya. Por eso la bandera `residenteVeMorosidad` NO gobierna esta ruta (queda
 * como columna `@deprecated`): lo que garantiza el «solo la suya» es el filtro
 * por fila de acá, no un interruptor que alguien pueda apagar.
 *
 * La ruta es auto-acotada: las unidades salen de los vínculos VIGENTES de la
 * persona del usuario resueltos en la base (`personaIdDelUsuarioDb` +
 * `unidadesVinculadasDb`, `lib/api/sesion-persona.ts`), nunca de un id del
 * cliente. No acepta `?unidadId=` ni ningún otro filtro: pedir una unidad ajena
 * no devuelve sus filas (el query se ignora).
 *
 * Compuerta: `fi:aviso:propio` ver, la clave que ya existe para los datos
 * financieros propios del residente (F27). No se inventan claves: el comité y
 * el personal no entran, y el administrador —que la tiene por su comodín— lee
 * SU estado de cuenta, nunca la deuda de la comunidad. «Mi» no significa
 * «todas»: por eso acá NO se usa `alcancePorFilasDeSesion`, cuyo alcance
 * «comunidad» ensancharía la respuesta para quien no está acotado por fila.
 *
 * Contrato, en el mismo patrón que `GET /api/avisos-cobro` (F27) y
 * `GET /api/liquidaciones` (T10): sin identidad MP o sin vínculo vigente la
 * respuesta es 200 con lista vacía, no 403. Un 403 confirmaría que existe deuda
 * de una unidad que no es la propia.
 *
 * Cada fila lleva período, concepto, monto del cargo, pagos, moras, saldo
 * pendiente, estado y el `avisoId` cuando el período tiene papel emitido. Los
 * montos NO se recalculan acá: salen de `saldoPendiente` y `estadoDeCobro`
 * (`lib/finanzas-utils.ts`), la misma definición que usa el resto de la app.
 * No viaja ningún id de persona.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { puede } from "@/lib/authz"
import {
  estadoDeCobro,
  saldoPendiente,
  type EstadoCobroFI,
} from "@/lib/finanzas-utils"
import {
  personaIdDelUsuarioDb,
  unidadesVinculadasDb,
} from "@/lib/api/sesion-persona"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { RECURSO_AVISO_PROPIO } from "@/app/api/avisos-cobro/_alcance"
import type {
  ConceptoCobroFI,
  MoraCobroFI,
  PagoCobroFI,
} from "@/lib/schemas"

/** Fila de la respuesta: lo que la pantalla imprime, sin datos de terceros. */
interface FilaEstadoCuenta {
  id: string
  unidadId: string
  /** Etiqueta y número de la unidad PROPIA; `null` si la fila no la resuelve. */
  unidadNumero: string | null
  unidadEtiqueta: string | null
  periodo: string
  concepto: ConceptoCobroFI
  descripcion: string
  /** Monto del cargo (sin moras): `CobroFI.montoBase`. */
  montoCargo: number
  /** Total abonado del cargo. */
  pagado: number
  /** Total de moras devengadas del cargo. */
  moras: number
  /** `montoCargo + moras − pagado`, nunca negativo (`saldoPendiente`). */
  saldoPendiente: number
  estado: EstadoCobroFI
  fechaVencimiento: string | null
  /** El aviso emitido del período, si existe: el papel con el que se cobra. */
  avisoId: string | null
}

/** Clave del aviso: el papel es único por unidad y período. */
function claveAviso(unidadId: string, periodo: string): string {
  return `${unidadId}|${periodo}`
}

export async function GET(_req?: Request): Promise<Response> {
  const scopeResult = await withComunidadScope()
  if (!scopeResult.ok) return scopeResult.response
  const scope = scopeResult.scope

  if (!puede(scope.rol, "ver", RECURSO_AVISO_PROPIO)) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
    // Una sesión sin ficha en el Maestro de Personas no tiene «lo propio»: la
    // lista vacía es la verdad, no un error.
    if (!personaId) return Response.json({ data: [], saldoTotal: 0 })

    const unidades = await unidadesVinculadasDb(personaId, scope.comunidadId)
    if (unidades.length === 0) return Response.json({ data: [], saldoTotal: 0 })

    const cobros = await prisma.cobroFI.findMany({
      where: { comunidadId: scope.comunidadId, unidadId: { in: unidades } },
      // Período descendente (lo más reciente primero); el `id` desempata para
      // que dos corridas devuelvan el mismo orden.
      orderBy: [{ periodo: "desc" }, { id: "desc" }],
    })
    if (cobros.length === 0) return Response.json({ data: [], saldoTotal: 0 })

    const periodos = [...new Set(cobros.map((c) => c.periodo))]
    const [unidadesFila, avisos] = await Promise.all([
      prisma.unidad.findMany({
        where: { comunidadId: scope.comunidadId, id: { in: unidades } },
        select: { id: true, numero: true, etiqueta: true },
      }),
      prisma.avisoCobro.findMany({
        where: {
          comunidadId: scope.comunidadId,
          unidadId: { in: unidades },
          periodo: { in: periodos },
        },
        select: { id: true, unidadId: true, periodo: true },
      }),
    ])
    const unidadPorId = new Map(unidadesFila.map((u) => [u.id, u]))
    const avisoPorClave = new Map(
      avisos.map((a) => [claveAviso(a.unidadId, a.periodo), a.id])
    )

    const data: FilaEstadoCuenta[] = cobros.map((cobro) => {
      // SAFETY: `moras`/`pagos` son columnas con el shape de los esquemas FI;
      // el cálculo corre con los mismos helpers que el resto de la app.
      const moras = cobro.moras as unknown as MoraCobroFI[]
      const pagos = cobro.pagos as unknown as PagoCobroFI[]
      const unidad = unidadPorId.get(cobro.unidadId)
      return {
        id: cobro.id,
        unidadId: cobro.unidadId,
        unidadNumero: unidad?.numero ?? null,
        unidadEtiqueta: unidad?.etiqueta ?? null,
        periodo: cobro.periodo,
        concepto: cobro.concepto as ConceptoCobroFI,
        descripcion: cobro.descripcion,
        montoCargo: cobro.montoBase,
        pagado: pagos.reduce((acc, p) => acc + p.monto, 0),
        moras: moras.reduce((acc, m) => acc + m.monto, 0),
        saldoPendiente: saldoPendiente({
          montoBase: cobro.montoBase,
          moras,
          pagos,
        }),
        estado: estadoDeCobro({
          montoBase: cobro.montoBase,
          moras,
          pagos,
          fechaVencimiento: cobro.fechaVencimiento ?? undefined,
        }),
        fechaVencimiento: cobro.fechaVencimiento,
        avisoId: avisoPorClave.get(claveAviso(cobro.unidadId, cobro.periodo)) ?? null,
      }
    })

    const saldoTotal = data.reduce((acc, fila) => acc + fila.saldoPendiente, 0)
    return Response.json({ data, saldoTotal })
  } catch (e) {
    logger.error({ err: e }, "[api/cobros-fi/mi-estado-cuenta] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
