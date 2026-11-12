/**
 * POST /api/conciliacion/importar — importación de la cartola del banco (F30).
 *
 * Decisión D1: NO hay integración bancaria. Se importa el archivo que el banco ya
 * exporta (CSV) y el sistema enlaza lo que puede enlazar; lo que no, queda en la
 * cola de `no_conciliado` para que una persona lo resuelva. El reglamento de la
 * ley exige llevar las cuentas e inversiones «debidamente conciliadas» (art. 24) y
 * el reglamento de la comunidad pide vincular el ingreso bancario con la unidad;
 * eso es lo que esta ruta registra.
 *
 * Tres reglas que la ruta sostiene y no delega:
 *
 *   · un archivo con UNA fila ilegible NO se importa a medias: responde 400 con
 *     las filas inválidas y no deja ni la cartola ni los movimientos legibles. Una
 *     cartola parcial es un número que no cuadra y nadie sabe por qué;
 *   · el enlace lo decide la regla pura `enlazarMovimiento` contra los candidatos
 *     de la comunidad de la sesión, con las tres reglas escritas en
 *     `lib/conciliacion.ts` — y la ambigüedad queda en la cola, nunca se adivina;
 *   · la cartola, sus movimientos y el evento de auditoría se escriben en UNA
 *     transacción: o existe el archivo completo con sus contadores, o no existe
 *     nada.
 *
 * La cartola NO crea asientos contables. Lee `IngresoFI`, `EgresoFI` y los pagos
 * de `CobroFI` como candidatos y guarda a qué quedó atado cada movimiento
 * (`cargoReferencia`); escribir el cargo o el cobro es trabajo del trámite que
 * cobra, no de la conciliación.
 */
import { ConciliacionImportacionSchema } from "@/lib/schemas"
import type { PagoCobroFI } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import {
  contadoresDeCartola,
  enlazarMovimiento,
  parsearCartola,
  type CandidatoConciliacion,
} from "@/lib/conciliacion"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import type { Prisma } from "@prisma/client"

/**
 * Recurso de la matriz que gobierna la conciliación: `fi:cobranza`.
 *
 * Igual que el convenio (F29) y el corte (F28): conciliar es un acto de COBRANZA
 * —es lo que permite saber qué unidad pagó—, así que la administración importa y
 * resuelve, y el comité audita por la lectura. La raíz `fi` desnuda no sirve: el
 * candado del repositorio (R1) prohíbe una ruta nueva que herede el módulo
 * completo cuando la matriz ya declara sus claves granulares.
 */
const RECURSO_CONCILIACION = "fi:cobranza"

/**
 * Los candidatos de la comunidad de la sesión, en un número FIJO de consultas:
 * ingresos y egresos del fondo, los cobros con sus pagos y los números de unidad
 * que esos cobros necesitan. Nada de una consulta por movimiento de la cartola ni
 * por pago.
 *
 * `id` del candidato es lo que se persiste en `cargoReferencia`: el id del
 * ingreso/egreso, o `<cobroId>#<pagoId>` cuando el candidato es el pago de un
 * gasto común —el pago no tiene vida propia en la base, vive dentro del JSON del
 * cobro, y el id compuesto dice exactamente cuál es—.
 */
async function candidatosDeLaComunidad(
  tx: Prisma.TransactionClient,
  comunidadId: string
): Promise<CandidatoConciliacion[]> {
  const [ingresos, egresos, cobros] = await Promise.all([
    tx.ingresoFI.findMany({
      where: { comunidadId },
      select: { id: true, monto: true, fecha: true },
    }),
    tx.egresoFI.findMany({
      where: { comunidadId },
      select: { id: true, monto: true, fecha: true, folio: true, proveedor: true },
    }),
    tx.cobroFI.findMany({
      where: { comunidadId },
      select: { id: true, origenRef: true, pagos: true, unidadId: true },
    }),
  ])

  const unidadIds = [...new Set(cobros.map((cobro) => cobro.unidadId))]
  const unidades =
    unidadIds.length === 0
      ? []
      : await tx.unidad.findMany({
          where: { comunidadId, id: { in: unidadIds } },
          select: { id: true, numero: true },
        })
  const numeroPorUnidad = new Map(unidades.map((unidad) => [unidad.id, unidad.numero]))

  const candidatos: CandidatoConciliacion[] = []
  for (const ingreso of ingresos) {
    candidatos.push({
      id: ingreso.id,
      tipo: "ingreso",
      monto: ingreso.monto,
      fecha: ingreso.fecha,
    })
  }
  for (const egreso of egresos) {
    candidatos.push({
      id: egreso.id,
      tipo: "egreso",
      monto: egreso.monto,
      fecha: egreso.fecha,
      referencia: egreso.folio,
      contraparte: egreso.proveedor,
    })
  }
  for (const cobro of cobros) {
    const pagos = (cobro.pagos as unknown as PagoCobroFI[]) ?? []
    const unidad = numeroPorUnidad.get(cobro.unidadId) ?? null
    for (const pago of pagos) {
      candidatos.push({
        id: `${cobro.id}#${pago.id}`,
        tipo: "pago",
        monto: pago.monto,
        fecha: pago.fecha,
        // La referencia del aviso es el dato que el copropietario escribe en la
        // transferencia; el número de unidad es la contraparte que el banco ve.
        referencia: cobro.origenRef,
        contraparte: unidad,
      })
    }
  }
  return candidatos
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope: ComunidadScope = resultado.scope

  if (!puede(scope.rol, "crear", RECURSO_CONCILIACION)) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = ConciliacionImportacionSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { nombreArchivo, contenido } = parsed.data

  const { filas, errores } = parsearCartola(contenido)
  if (errores.length > 0) {
    return jsonError(
      400,
      "La cartola tiene filas inválidas: no se importó ningún movimiento.",
      { errores }
    )
  }
  if (filas.length === 0) {
    return jsonError(400, "La cartola no tiene movimientos que importar.")
  }

  const cartolaId = generarId("cart")
  const ahora = new Date()

  try {
    const vista = await prisma.$transaction(async (tx) => {
      const candidatos = await candidatosDeLaComunidad(tx, scope.comunidadId)

      // El dictamen de cada fila se arma en memoria con la regla pura; el estado
      // persistido es la consecuencia, no una segunda decisión.
      const movimientos = filas.map((fila, indice) => {
        const enlace = enlazarMovimiento(fila, candidatos)
        return {
          id: generarId("movcart", indice),
          comunidadId: scope.comunidadId,
          cartolaId,
          fecha: new Date(`${fila.fecha}T00:00:00.000Z`),
          descripcion: fila.descripcion,
          referencia: fila.referencia,
          contraparte: fila.contraparte,
          monto: fila.monto,
          tipo: fila.tipo,
          estado: enlace.enlazado ? "conciliado" : "no_conciliado",
          origen: enlace.enlazado ? "autorresuelto" : null,
          resueltoPor: null,
          resueltoEn: null,
          cargoReferencia: enlace.enlazado ? enlace.candidatoId : null,
        }
      })

      const contadores = contadoresDeCartola(movimientos.map((movimiento) => movimiento.estado))

      const cartola = await tx.cartolaImportada.create({
        data: {
          id: cartolaId,
          comunidadId: scope.comunidadId,
          nombreArchivo,
          importadaPor: scope.usuarioId,
          filas: contadores.filas,
          conciliadas: contadores.conciliadas,
          noConciliadas: contadores.noConciliadas,
        },
      })

      await tx.movimientoCartola.createMany({ data: movimientos })

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "FI",
          tipoAccion: "FI_CARTOLA_IMPORTADA",
          referenciaId: cartola.id,
          descripcion: `Cartola «${nombreArchivo}» importada: ${contadores.filas} movimiento(s), ${contadores.conciliadas} conciliado(s) automáticamente y ${contadores.noConciliadas} en la cola de conciliación.`,
        },
        tx
      )

      return {
        importados: contadores.filas,
        conciliados: contadores.conciliadas,
        noConciliados: contadores.noConciliadas,
      }
    })

    return Response.json(vista, { status: 201 })
  } catch (e) {
    logger.error({ err: e }, "[api/conciliacion/importar] error inesperado al importar la cartola")
    return jsonError(500, "Error interno del servidor.")
  }
}
