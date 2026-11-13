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
 *     emitido), con el evento `FI_REPARTO_SECTOR_EMITIDO` en la MISMA transacción;
 *   · **el reparto es DEUDA, no sólo documento (S7)**: cada cuota —es decir, cada
 *     unidad INCLUIDA— nace como un `CobroFI` del período, con el monto de la cuota,
 *     imputado al fondo de gasto común ACTIVO de la comunidad y con `origenRef` al
 *     reparto. Es el mismo mecanismo con el que la cuota de un convenio se vuelve
 *     deuda (F29b): una deuda que el sistema no conoce no se cobra, y este trámite
 *     existía para cargarle a un sector lo que le corresponde;
 *   · la unidad EXCLUIDA por falta de avalúo no recibe deuda: se queda sin cuota y
 *     sin cobro. La lista de excluidas no es un adorno de la pantalla, es a quién
 *     NO se le cobra;
 *   · sin un fondo de gasto común activo no hay dónde imputar la deuda y la emisión
 *     responde 400 con el motivo: el fondo NO se inventa;
 *   · emitir de nuevo el mismo gasto del mismo sector y período responde 409: el
 *     reparto ya es deuda y reemitirlo la cobraría dos veces. Corregir un reparto es
 *     emitir otro con su propio concepto.
 *
 * - POST: guard `fi:gasto_comun` + crear (la administración emite; el comité lo lee
 *   por `ver`). O existe el reparto con su avalúo total, sus cuotas, sus deudas y su
 *   evento, o no existe nada.
 * - GET: guard `fi:gasto_comun` + ver. Acotado a la comunidad de la sesión —el
 *   `comunidadId` nunca viene del cliente— y leído en un número FIJO de consultas:
 *   los repartos con sus cuotas en una, el conteo en otra y los nombres (sector y
 *   número de unidad) en dos más para todo el listado.
 *
 * No hay PUT ni DELETE: un reparto emitido es la evidencia de lo que se le cargó a
 * cada unidad con qué avalúo, y ahora también de lo que se le cobró. Corregirlo es
 * emitir otro con su propio concepto.
 */
import {
  CobroFIEscrituraCompletaSchema,
  RepartoSectorCreacionSchema,
} from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { avaluoTotalDeCuotas, repartirPorAvaluo } from "@/lib/reparto-sector"
import { vencimientoDesdeDiaCorte } from "@/lib/finanzas-utils"
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

  // El fondo de imputación se resuelve ANTES de abrir la transacción que escribe,
  // igual que la emisión de gasto común y que el convenio (F29b): sin un fondo de
  // gasto común activo no hay dónde imputar la deuda de las cuotas, y no se escribe
  // nada. El fondo NO se inventa ni se usa el de reserva: `gasto_comun` es el tipo
  // que declara la comunidad para el gasto que se cobra.
  const fondoGC = await prisma.fondoFI.findFirst({
    where: {
      comunidadId: scope.comunidadId,
      tipo: "gasto_comun",
      activo: true,
    },
    orderBy: { id: "asc" },
    select: { id: true, nombre: true },
  })
  if (!fondoGC) {
    return jsonError(
      400,
      "No se puede emitir el reparto: la comunidad no tiene un fondo de gasto común activo donde imputar las cuotas."
    )
  }

  const ahora = new Date()
  const repartoId = generarId("rse")
  // El día de cargo es el de la emisión, y el vencimiento sale del día de corte que
  // la comunidad declara en su configuración (con el mismo defecto que la multa IN):
  // una deuda con vencimiento es la que puede entrar en mora y en cobranza.
  const fechaCargo = ahora.toISOString().slice(0, 10)
  const configuracion = await prisma.configuracionGlobal.findUnique({
    where: { comunidadId: scope.comunidadId },
    select: { diaCortePago: true },
  })
  const fechaVencimiento = vencimientoDesdeDiaCorte(
    datos.periodo,
    configuracion?.diaCortePago ?? 5
  )

  try {
    // Todo lo que decide el reparto se lee y se escribe en UNA transacción: los
    // avalúos con los que se calculan las cuotas son los mismos que quedan
    // congelados en ellas, y el evento de auditoría entra con el reparto o no entra.
    const emision = await prisma.$transaction<
      | { readonly tipo: "sector_ausente" }
      | { readonly tipo: "sin_avaluo" }
      | { readonly tipo: "cargo_invalido" }
      | { readonly tipo: "ya_emitido" }
      | { readonly tipo: "emitido"; readonly vista: RepartoSectorEnLaVista }
    >(async (tx) => {
      const microSector = await tx.microSector.findFirst({
        where: { id: datos.microSectorId, comunidadId: scope.comunidadId },
        select: { id: true, nombre: true },
      })
      if (!microSector) return { tipo: "sector_ausente" } as const

      // IDEMPOTENCIA del cobro: el reparto se identifica por sector + período +
      // concepto, que es lo que dice QUÉ gasto se repartió a QUIÉN. Si ya existe,
      // su deuda ya está emitida y volver a emitirlo la cobraría dos veces. Se lee
      // DENTRO de la transacción que escribe para no dejar la ventana abierta entre
      // la lectura y el alta. Corregir un reparto es emitir otro con otro concepto.
      const yaEmitido = await tx.repartoSector.count({
        where: {
          comunidadId: scope.comunidadId,
          microSectorId: datos.microSectorId,
          periodo: datos.periodo,
          concepto: datos.concepto,
        },
      })
      if (yaEmitido > 0) return { tipo: "ya_emitido" } as const

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

      // Cada cuota lleva el id del cargo que produce: es el vínculo hacia la deuda.
      // La cuota que quedó en CERO no produce deuda —un cobro con monto base cero no
      // pasa el contrato FI y no es algo que se cobre— y su `cobroId` queda NULL; la
      // cuota sigue en el reparto como evidencia de la parte que le tocó.
      const cuotas = dictamen.cuotas.map((cuota, indice) => ({
        id: generarId("cru", indice + 1),
        comunidadId: scope.comunidadId,
        repartoSectorId: repartoId,
        unidadId: cuota.unidadId,
        avaluoUsado: cuota.avaluoUsado,
        monto: cuota.monto,
        cobroId: cuota.monto > 0 ? generarId("cob", indice) : null,
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

      // La deuda de cada unidad incluida, con la forma que ya usa la emisión de
      // gasto común y la cuota del convenio: concepto del catálogo FI
      // (`gasto_comun`), el período del reparto, el fondo de gasto común activo y
      // `origenRef` al reparto. El detalle de una línea repite el monto de la cuota
      // para que la suma del detalle cierre con el monto base (S5).
      const cargos: Record<string, unknown>[] = []
      for (const cuota of cuotas) {
        if (cuota.cobroId === null) continue
        const candidato = {
          id: cuota.cobroId,
          unidadId: cuota.unidadId,
          periodo: datos.periodo,
          concepto: "gasto_comun",
          origenModulo: "FI",
          origenRef: repartoId,
          fondoId: fondoGC.id,
          descripcion: `Reparto por sector ${microSector.nombre} ${datos.periodo}: ${datos.concepto}`,
          montoBase: cuota.monto,
          lineas: [
            { concepto: "gasto_comun", monto: cuota.monto, fondoId: fondoGC.id },
          ],
          fechaCargo,
          fechaVencimiento,
          moras: [],
          pagos: [],
          diferencias: [],
        }
        const validacion = CobroFIEscrituraCompletaSchema.safeParse(candidato)
        if (!validacion.success) {
          // El cargo lo arma esta ruta, no el cliente: llegar acá es un defecto del
          // contrato interno, y no se persiste a ciegas.
          return { tipo: "cargo_invalido" } as const
        }
        cargos.push({
          ...(validacion.data as unknown as Record<string, unknown>),
          comunidadId: scope.comunidadId,
        })
      }

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

      // La deuda, en la MISMA transacción: un reparto sin sus cobros sería el
      // documento de un cobro que la contabilidad no conoce, que es exactamente lo
      // que este trámite dejó de ser. Se escriben DESPUÉS del reparto y sus cuotas
      // para que una falla acá sólo pueda terminar en la reversión de todo.
      if (cargos.length > 0) {
        await tx.cobroFI.createMany({ data: cargos as never })
      }

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
          // Nombra el fondo y cuenta los cargos: el evento dice dónde quedó la
          // deuda, no sólo que el reparto existe.
          descripcion: `Reparto del sector ${microSector.nombre} para ${datos.periodo} (${datos.concepto}): ${pesos(datos.montoTotal)} entre ${cuotas.length} unidad(es) con avalúo fiscal declarado, avalúo total ${pesos(avaluoTotal)}; ${cargos.length} cuota(s) imputadas como deuda del período en el fondo ${fondoGC.nombre}.`,
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
    if (emision.tipo === "cargo_invalido") {
      // El cargo lo arma esta ruta, no el cliente: llegar acá es un defecto del
      // contrato interno. La transacción no escribió nada.
      logger.error(
        { repartoId },
        "[api/repartos-sector] el cargo FI de una cuota no pasó el contrato"
      )
      return jsonError(500, "Error interno del servidor.")
    }
    if (emision.tipo === "ya_emitido") {
      return jsonError(
        409,
        "Ya se emitió un reparto de este gasto en este sector para el período: emitirlo otra vez cobraría dos veces la misma cuota."
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
