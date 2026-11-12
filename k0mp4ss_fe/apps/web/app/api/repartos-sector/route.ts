/**
 * /api/repartos-sector — reparto de un gasto entre las unidades de un sector, en
 * proporción al AVALÚO FISCAL de cada una (F32).
 *
 * El reglamento de la comunidad manda que los gastos de bienes o servicios que
 * sirven SÓLO a un sector se carguen sólo a ese sector, en proporción al avalúo
 * fiscal de sus unidades. La emisión general reparte entre todas las unidades de la
 * comunidad y no puede expresar esa carga diferenciada: este documento sí, y por
 * eso es su propia emisión.
 *
 * Las reglas se sostienen acá y en la regla pura `lib/reparto-sector.ts`, nunca en
 * la voluntad de quien llama:
 *
 *   · el sector se lee de la base y tiene que ser de ESTA comunidad (400 con el
 *     motivo si no existe para el scope);
 *   · el AVALÚO es un hecho de la unidad (`Unidad.avaluoFiscal`) y se LEE de la
 *     base: no viene en el cuerpo de la petición. Si el cliente pudiera declararlo,
 *     bastaría con subir el avalúo de una unidad para moverle la carga a otra;
 *   · el monto se reparte en centavos enteros, en proporción al avalúo, y la suma
 *     de las cuotas es EXACTAMENTE el monto total (el residuo va al mayor avalúo);
 *   · la unidad sin avalúo declarado queda FUERA y no se reparte en partes iguales
 *     para compensarla; si ninguna unidad del sector tiene avalúo, no se emite nada;
 *   · las unidades que quedaron FUERA se persisten con el reparto como snapshot
 *     CONGELADO (`unidadesExcluidas`, con `unidadId` y `unidadNumero`), y al leer se
 *     devuelve esa foto, nunca el complemento del padrón de hoy: una unidad dada de
 *     alta en el sector después de la emisión no existía cuando el reparto se emitió,
 *     y mostrarla como «excluida» sería mentir sobre lo que se emitió;
 *   · el reparto se persiste como documento emitido: monto total, avalúo total y
 *     cuotas con el avalúo CONGELADO (una revalorización posterior no reescribe lo
 *     emitido), con el evento `FI_REPARTO_SECTOR_EMITIDO` en la MISMA transacción.
 *
 * - POST: guard `fi:gasto_comun` + crear (la administración emite; el comité lo lee
 *   por `ver`). O existe el reparto con su avalúo total, sus cuotas y su evento, o
 *   no existe nada.
 * - GET: guard `fi:gasto_comun` + ver. Acotado a la comunidad de la sesión —el
 *   `comunidadId` nunca viene del cliente— y leído en un número FIJO de consultas:
 *   los repartos con sus cuotas en una, el conteo en otra y los nombres (sector y
 *   número de unidad) en dos más para todo el listado.
 *
 * No hay PUT ni DELETE: un reparto emitido es la evidencia de lo que se le cargó a
 * cada unidad con qué avalúo. Corregirlo es emitir otro con su propio concepto.
 *
 * Frontera deliberada: este documento NO crea `CobroFI` ni modifica la emisión de
 * gasto común. Conectar la emisión con el reparto por sector es la unidad
 * siguiente, y queda declarado en `specs/PENDIENTES-FUNCIONALIDAD.md`.
 */
import { RepartoSectorCreacionSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { avaluoTotalDeCuotas, repartirPorAvaluo } from "@/lib/reparto-sector"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { vistaDeReparto, type RepartoSectorEnLaVista } from "./_vista"

/**
 * Recurso de la matriz que gobierna el reparto: `fi:gasto_comun`.
 *
 * No es `fi` a secas. El candado de procesos del repositorio (R1) prohíbe que una
 * ruta NUEVA use la raíz desnuda cuando la matriz ya declara sus claves granulares
 * —y `fi` ni siquiera declara `crear`: sólo el wildcard de administración lo
 * alcanza—. La granular correcta es `fi:gasto_comun`: el reparto es la
 * configuración de lo que se va a cobrar como gasto común de un sector, la misma
 * clave con la que se declara el presupuesto y la versión del reglamento del cobro.
 * La administración lo emite (`crear`) y el comité lo lee (`ver`), que es la forma
 * de la ley: el Comité fiscaliza lo que se cobra.
 */
const RECURSO_REPARTOS = "fi:gasto_comun"

/**
 * Los textos de error van LITERALES en cada `jsonError`, no en constantes: así los
 * lee el guardián de mensajes de error (`test/api/permisos-por-objeto-mensajes.test.ts`),
 * que sólo puede auditar lo que está escrito en la ruta.
 */

/** Pesos en formato chileno para la bitácora. */
function pesos(monto: number): string {
  return `$${monto.toLocaleString("es-CL")}`
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope: ComunidadScope = resultado.scope

  if (!puede(scope.rol, "crear", RECURSO_REPARTOS)) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = RepartoSectorCreacionSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const datos = parsed.data

  const ahora = new Date()
  const repartoId = generarId("rse")

  try {
    // Todo lo que decide el reparto se lee y se escribe en UNA transacción: los
    // avalúos con los que se calculan las cuotas son los mismos que quedan
    // congelados en ellas, y el evento de auditoría entra con el reparto o no entra.
    const emision = await prisma.$transaction<
      | { readonly tipo: "sector_ausente" }
      | { readonly tipo: "sin_avaluo" }
      | { readonly tipo: "emitido"; readonly vista: RepartoSectorEnLaVista }
    >(async (tx) => {
      const microSector = await tx.microSector.findFirst({
        where: { id: datos.microSectorId, comunidadId: scope.comunidadId },
        select: { id: true, nombre: true },
      })
      if (!microSector) return { tipo: "sector_ausente" } as const

      // La unidad sin avalúo se trae igual: es la regla la que la deja fuera (y la
      // que decide que sin ninguna unidad con avalúo no hay reparto). Filtrarla en
      // la consulta escondería el caso «sector sin avalúo» detrás de «sector vacío».
      const unidades = await tx.unidad.findMany({
        where: {
          comunidadId: scope.comunidadId,
          microSectorId: datos.microSectorId,
        },
        select: { id: true, numero: true, avaluoFiscal: true },
        orderBy: [{ numero: "asc" }, { id: "asc" }],
      })

      const dictamen = repartirPorAvaluo({
        montoTotal: datos.montoTotal,
        unidades: unidades.map((unidad) => ({
          unidadId: unidad.id,
          avaluo: unidad.avaluoFiscal,
        })),
      })
      if (!dictamen.permitido) return { tipo: "sin_avaluo" } as const

      const cuotas = dictamen.cuotas.map((cuota, indice) => ({
        id: generarId("cru", indice + 1),
        comunidadId: scope.comunidadId,
        repartoSectorId: repartoId,
        unidadId: cuota.unidadId,
        avaluoUsado: cuota.avaluoUsado,
        monto: cuota.monto,
      }))
      const avaluoTotal = avaluoTotalDeCuotas(dictamen.cuotas)

      // Las unidades que el reparto dejó fuera, con el número que tenían al emitir.
      // Se derivan de las cuotas que dictaminó la regla —no de una segunda lectura
      // de los avalúos—, así que esta lista es su complemento exacto dentro del
      // sector: si la regla cambia, la exclusión cambia con ella y no se despega.
      const idsQueEntraron = new Set(
        dictamen.cuotas.map((cuota) => cuota.unidadId)
      )
      const unidadesExcluidas = unidades
        .filter((unidad) => !idsQueEntraron.has(unidad.id))
        .map((unidad) => ({
          unidadId: unidad.id,
          unidadNumero: unidad.numero,
        }))

      const creado = await tx.repartoSector.create({
        data: {
          id: repartoId,
          comunidadId: scope.comunidadId,
          microSectorId: microSector.id,
          periodo: datos.periodo,
          concepto: datos.concepto,
          // Snapshot de lo repartido: el monto que llegó y la suma de los avalúos
          // que entraron al reparto. No se recalculan al leer.
          montoTotal: datos.montoTotal,
          avaluoTotal,
          // Snapshot de lo que NO entró: las unidades sin avalúo declarado al
          // emitir. Tampoco se recalcula al leer (ver `_vista.ts`).
          unidadesExcluidas,
          estado: "emitido",
          creadoPor: scope.usuarioId,
        },
      })

      await tx.cuotaRepartoSector.createMany({ data: cuotas })

      const numeroPorUnidad = new Map(
        unidades.map((unidad) => [unidad.id, unidad.numero])
      )

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "FI",
          tipoAccion: "FI_REPARTO_SECTOR_EMITIDO",
          referenciaId: creado.id,
          descripcion: `Reparto del sector ${microSector.nombre} para ${datos.periodo} (${datos.concepto}): ${pesos(datos.montoTotal)} entre ${cuotas.length} unidad(es) con avalúo fiscal declarado, avalúo total ${pesos(avaluoTotal)}.`,
        },
        tx
      )

      return {
        tipo: "emitido",
        vista: vistaDeReparto(creado, cuotas, {
          microSectorNombre: microSector.nombre,
          numeroPorUnidad,
        }),
      } as const
    })

    if (emision.tipo === "sector_ausente") {
      return jsonError(
        400,
        "No se puede emitir el reparto: el sector no existe en esta comunidad."
      )
    }
    if (emision.tipo === "sin_avaluo") {
      return jsonError(
        400,
        "No se puede emitir el reparto: el sector no tiene unidades con avalúo fiscal declarado, y sin avalúo no se reparte entre las unidades del sector."
      )
    }
    return Response.json(emision.vista, { status: 201 })
  } catch (e) {
    logger.error({ err: e }, "[api/repartos-sector] error inesperado al emitir el reparto")
    return jsonError(500, "Error interno del servidor.")
  }
}

/**
 * GET /api/repartos-sector — repartos de la comunidad de la sesión con sus cuotas.
 *
 * `_req` se declara porque Next lo entrega, pero NO se lee: no hay parámetro que
 * cambie el alcance. La comunidad sale de `withComunidadScope()`, la única fuente,
 * así que un `?comunidadId=` del cliente no mueve nada.
 */
export async function GET(_req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", RECURSO_REPARTOS)) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const [repartos, total] = await Promise.all([
      prisma.repartoSector.findMany({
        where: { comunidadId: scope.comunidadId },
        orderBy: [{ periodo: "desc" }, { createdAt: "desc" }],
        include: { cuotas: true },
      }),
      prisma.repartoSector.count({ where: { comunidadId: scope.comunidadId } }),
    ])

    // Nombres en DOS consultas para todo el listado (no una por reparto ni una por
    // cuota): el nombre del sector y el número de unidad de cada cuota.
    const sectorIds = [
      ...new Set(repartos.map((reparto) => reparto.microSectorId)),
    ]
    const unidadIds = [
      ...new Set(
        repartos.flatMap((reparto) =>
          reparto.cuotas.map((cuota) => cuota.unidadId)
        )
      ),
    ]
    const [sectores, unidades] = await Promise.all([
      sectorIds.length === 0
        ? []
        : prisma.microSector.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: sectorIds } },
            select: { id: true, nombre: true },
          }),
      unidadIds.length === 0
        ? []
        : prisma.unidad.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: unidadIds } },
            select: { id: true, numero: true },
          }),
    ])

    const nombrePorSector = new Map(
      sectores.map((sector) => [sector.id, sector.nombre])
    )
    const numeroPorUnidad = new Map(
      unidades.map((unidad) => [unidad.id, unidad.numero])
    )

    const data = repartos.map((reparto) =>
      vistaDeReparto(reparto, reparto.cuotas, {
        microSectorNombre: nombrePorSector.get(reparto.microSectorId) ?? null,
        numeroPorUnidad,
      })
    )

    return Response.json({ data, total, mostrados: data.length })
  } catch (e) {
    logger.error({ err: e }, "[api/repartos-sector] error inesperado al leer los repartos")
    return jsonError(500, "Error interno del servidor.")
  }
}
