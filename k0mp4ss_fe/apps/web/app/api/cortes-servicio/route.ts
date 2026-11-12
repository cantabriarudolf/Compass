/**
 * /api/cortes-servicio — trámite del corte de servicios por morosidad (F28).
 *
 * Ley 21.442 art. 20 N°9: el administrador puede suspender —o requerir a las
 * empresas que suspendan— la ELECTRICIDAD, las TELECOMUNICACIONES o la
 * CALEFACCIÓN de las unidades que adeuden TRES O MÁS CUOTAS, continuas o
 * discontinuas. El trámite exige ACUERDO DEL COMITÉ y AVISO AL DEUDOR con CINCO
 * DÍAS CORRIDOS de anticipación; está PROHIBIDO en unidades donde resida una
 * persona ELECTRODEPENDIENTE y por deudas devengadas bajo estado de catástrofe;
 * no pueden suspenderse dos servicios a la vez.
 *
 * Las cuatro reglas se sostienen acá y en la regla pura `lib/cortes-servicio.ts`,
 * nunca en la voluntad de quien llama:
 *
 *   · el acuerdo se LEE de la base (U3) y tiene que ser de esta comunidad, del
 *     Comité y estar `aprobado` (400 con el motivo si no);
 *   · el dictamen lo da `cortePermitido` con la electrodependencia LEÍDA DE LA
 *     UNIDAD y con la morosidad DERIVADA de los cobros de esa unidad: el cliente
 *     no declara ni la una ni la otra, porque las dos son hechos de la base;
 *   · un servicio no se preavisa dos veces mientras el primero siga vigente y no
 *     se preavisa otro mientras uno esté ejecutado (409);
 *   · la fecha habilitada la calcula el servidor: `preaviso + 5 días corridos`.
 *
 * - POST: guard `fi:cobranza` + crear. Deriva la deuda de los `CobroFI` de la
 *   unidad (`morosidadPorUnidad`) y escribe el preaviso con esos números como
 *   snapshot, junto al evento `FI_CORTE_PREAVISO` en UNA transacción, con la
 *   comprobación de «un corte vigente por servicio» DENTRO de esa transacción
 *   (leerla afuera dejaría la ventana abierta entre la lectura y el alta).
 * - GET: guard `fi:cobranza` + ver. Acotado a la comunidad de la sesión —el
 *   `comunidadId` nunca viene del cliente— y leído en un número FIJO de consultas:
 *   los cortes en una, el conteo en otra y los nombres (unidad y folio del
 *   acuerdo) en dos más para todo el listado.
 *
 * La ejecución y la revocación van por sus propias rutas: son actos distintos del
 * preaviso y no comparten guard ni estado de entrada.
 */
import { CorteServicioPreavisoSchema, type CobroFI } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { hoyISO } from "@/lib/date-utils"
import { morosidadPorUnidad } from "@/lib/finanzas-utils"
import {
  cortePermitido,
  fechaHabilitadaDelCorte,
} from "@/lib/cortes-servicio"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { vistaDeCorte } from "./_vista"

/**
 * Recurso de la matriz que gobierna el corte: `fi:cobranza`.
 *
 * No es `fi` a secas. El candado de procesos del repositorio (R1) prohíbe que una
 * ruta NUEVA use la raíz desnuda cuando la matriz ya declara sus claves
 * granulares, y acá la granular es la correcta: el corte es el último acto de la
 * COBRANZA de la deuda, y `fi:cobranza` está declarada justamente así —el comité
 * AUDITA la cobranza (`ver`) pero no la ejecuta—, que es la forma de la ley: el
 * administrador cursa el preaviso y la suspensión, el comité la autoriza por el
 * acuerdo. Los efectos por rol son los mismos que tendría `fi` (`crear`/`editar`
 * sólo administración, `ver` administración y comité), así que ningún acceso se
 * abre ni se cierra con esta elección.
 */
const RECURSO_CORTES = "fi:cobranza"

/** Centinela para distinguir el conflicto de negocio de una falla real. */
const YA_HAY_CORTE_DEL_SERVICIO = "CORTE_YA_VIGENTE_DEL_SERVICIO"

/**
 * Estados que mantienen el servicio «vigente» a los ojos del trámite: el preaviso
 * cursado y el corte ejecutado. `revocado` deja la unidad habilitada, así que no
 * cuenta para ninguna de las dos comprobaciones.
 */
const ESTADOS_VIGENTES = ["preaviso", "ejecutado"] as const

/**
 * Pesos en formato chileno para la bitácora.
 *
 * Ojo con lo que NO se hace acá: los textos de error van LITERALES en cada
 * `jsonError`, no en constantes. El guardián de mensajes de error
 * (`test/api/permisos-por-objeto-mensajes.test.ts`) sólo puede auditar lo que está
 * escrito en la ruta; una constante con nombre queda como mensaje «indirecto».
 */
function pesos(monto: number): string {
  return `$${monto.toLocaleString("es-CL")}`
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope: ComunidadScope = resultado.scope

  if (!puede(scope.rol, "crear", RECURSO_CORTES)) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = CorteServicioPreavisoSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const datos = parsed.data

  // La unidad se resuelve EN la comunidad de la sesión: el id de otra comunidad no
  // es un dato ajeno que se ignora, es una fila que no existe (404). Se lee
  // `electrodependiente` de la fila porque es un HECHO de la unidad, no una
  // declaración del que pide el corte.
  const unidad = await prisma.unidad.findFirst({
    where: { id: datos.unidadId, comunidadId: scope.comunidadId },
    select: { id: true, numero: true, electrodependiente: true },
  })
  if (!unidad) return jsonError(404, "Unidad no encontrada.")

  // El acuerdo del Comité es la AUTORIZACIÓN del corte (art. 20 N°9): se lee la
  // fila real. Cada condición tiene su motivo, porque «no autorizado» no dice qué
  // falta.
  const acuerdo = await prisma.acuerdo.findFirst({
    where: { id: datos.acuerdoId, comunidadId: scope.comunidadId },
    select: { id: true, cuerpo: true, estado: true, folio: true },
  })
  if (!acuerdo) {
    return jsonError(
      400,
      "No se puede preavisar el corte: el acuerdo del Comité no existe en esta comunidad."
    )
  }
  if (acuerdo.cuerpo !== "comite") {
    return jsonError(400, "No se puede preavisar el corte: el acuerdo no es del Comité.")
  }
  if (acuerdo.estado !== "aprobado") {
    return jsonError(400, "No se puede preavisar el corte: el acuerdo no está aprobado.")
  }

  // «Un servicio a la vez» se mide sobre lo VIGENTE: el mismo servicio no se
  // preavisa dos veces mientras el primero siga pendiente o ejecutado, y un
  // segundo servicio no se preavisa mientras otro esté suspendido de hecho.
  // Una unidad NO se queda sin poder cortar: lo que bloquea es el corte vigente,
  // no el historial.
  const vigentes = await prisma.corteServicio.findMany({
    where: {
      comunidadId: scope.comunidadId,
      unidadId: unidad.id,
      estado: { in: [...ESTADOS_VIGENTES] },
    },
    select: { servicio: true, estado: true },
  })
  if (vigentes.some((corte) => corte.servicio === datos.servicio)) {
    return jsonError(409, "La unidad ya tiene un corte vigente de ese servicio.")
  }
  const otroServicioYaCortado = vigentes.some(
    (corte) => corte.servicio !== datos.servicio && corte.estado === "ejecutado"
  )

  // La DEUDA es un hecho de la base y no una declaración de quien pide el corte.
  // Se deriva de los cobros REALES de la unidad con la MISMA función que el
  // dashboard de morosos usa para resaltar qué unidad está atrasada
  // (`morosidadPorUnidad`), así el trámite y la pantalla no pueden contar distinto:
  // una sola consulta para esa unidad, nunca una por cobro, y el recorte por fecha
  // lo hace la función pura con el día de hoy. Si se tomara del cuerpo de la
  // petición, mandar `cuotasImpagas: 3` para un deudor de una cuota bastaría para
  // que el preaviso se acepte y el corte ilegal se ejecute cinco días después.
  const cobrosDeLaUnidad = await prisma.cobroFI.findMany({
    where: { comunidadId: scope.comunidadId, unidadId: unidad.id },
    select: {
      id: true,
      unidadId: true,
      periodo: true,
      montoBase: true,
      moras: true,
      pagos: true,
      fechaVencimiento: true,
    },
  })
  // SAFETY: `morosidadPorUnidad` sólo lee de cada cobro su unidad, su período, su
  // monto base, sus moras, sus pagos y su vencimiento —todos seleccionados arriba—
  // y el cálculo pasa por `estadoDeCobro`/`saldoPendiente`, los mismos helpers del
  // resto de la app. Las columnas Json tienen la forma de los esquemas FI.
  const morosidad = morosidadPorUnidad(
    unidad.id,
    cobrosDeLaUnidad as unknown as CobroFI[],
    hoyISO()
  )

  // El dictamen de la regla pura es la autoridad de la DECISIÓN. El texto de cada
  // rechazo se escribe literal (el guardián de mensajes no audita nombres) y
  // `test/api/cortes-servicio.test.ts` compara el cuerpo devuelto con el motivo de
  // la regla pura para la misma entrada, así que los dos textos no pueden
  // separarse sin que un test lo diga.
  //
  // El STATUS no es el mismo para todos los rechazos y eso también es la ley: la
  // electrodependencia y la falta de cuotas son pedidos que no proceden (400); el
  // segundo servicio es un CONFLICTO con el estado actual de la unidad (409),
  // porque el pedido sería correcto si el otro corte no estuviera vigente.
  //
  // `deudaDeCatastrofe` va en `false` porque hoy NO existe en el sistema ninguna
  // fuente del estado de catástrofe (ni en la unidad, ni en el acuerdo, ni en la
  // configuración de la comunidad): la prohibición está implementada en la regla
  // pura y la ruta no puede inventarla leyendo el cuerpo de la petición —el que
  // pide el corte declararía que no hay catástrofe—. Queda declarado como deuda en
  // `specs/PENDIENTES-FUNCIONALIDAD.md`.
  const dictamen = cortePermitido({
    cuotasImpagas: morosidad.periodosVencidos,
    electrodependiente: unidad.electrodependiente,
    deudaDeCatastrofe: false,
    otroServicioYaCortado,
  })
  if (!dictamen.permitido) {
    if (unidad.electrodependiente) {
      return jsonError(
        400,
        "No procede el corte: en la unidad reside una persona electrodependiente y la ley lo prohíbe en ese caso (Ley 21.442 art. 20 N°9)."
      )
    }
    if (otroServicioYaCortado) {
      return jsonError(
        409,
        "La unidad ya tiene otro servicio suspendido: no pueden suspenderse dos servicios a la vez (Ley 21.442 art. 20 N°9)."
      )
    }
    return jsonError(
      400,
      "No procede el corte: la ley exige tres o más cuotas impagas, continuas o discontinuas (Ley 21.442 art. 20 N°9)."
    )
  }

  // La fecha del preaviso y la habilitada las decide el SERVIDOR: el cliente no
  // elige cuándo se cursó el aviso ni cuándo vence el plazo legal.
  const ahora = new Date()
  const fechaHabilitada = fechaHabilitadaDelCorte(ahora)

  try {
    const creado = await prisma.$transaction(async (tx) => {
      // La relectura va DENTRO de la transacción que escribe: si otra alta tomó el
      // servicio entre la lectura de arriba y esta escritura, el conteo ya no da
      // cero y no se escribe nada (ni el preaviso ni el evento).
      const vigentesAhora = await tx.corteServicio.findMany({
        where: {
          comunidadId: scope.comunidadId,
          unidadId: unidad.id,
          estado: { in: [...ESTADOS_VIGENTES] },
        },
        select: { servicio: true },
      })
      if (vigentesAhora.some((corte) => corte.servicio === datos.servicio)) {
        throw new Error(YA_HAY_CORTE_DEL_SERVICIO)
      }

      const fila = await tx.corteServicio.create({
        data: {
          id: generarId("cse"),
          comunidadId: scope.comunidadId,
          unidadId: unidad.id,
          servicio: datos.servicio,
          acuerdoId: acuerdo.id,
          // El número de cuotas y el monto son el SNAPSHOT de por qué se permitió
          // el corte: se persisten los DERIVADOS de la base. La ejecución los
          // vuelve a juzgar (`POST /api/cortes-servicio/ejecutar`), así que un
          // valor declarado por el cliente dejaría el corte ilegal en pie.
          cuotasImpagas: morosidad.periodosVencidos,
          montoAdeudado: morosidad.deudaVencida,
          fechaPreaviso: ahora,
          fechaHabilitada,
          estado: "preaviso",
          creadoPor: scope.usuarioId,
        },
      })

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "FI",
          tipoAccion: "FI_CORTE_PREAVISO",
          referenciaId: fila.id,
          descripcion: `Se cursó el preaviso de corte de ${datos.servicio} a la unidad ${unidad.numero}: ${morosidad.periodosVencidos} cuota(s) impaga(s) por ${pesos(morosidad.deudaVencida)}, habilitado desde el ${fechaHabilitada.toISOString()}; autorizado por el acuerdo ${acuerdo.folio} del Comité (Ley 21.442 art. 20 N°9).`,
        },
        tx
      )

      return fila
    })

    return Response.json(
      vistaDeCorte(creado, {
        unidadNumero: unidad.numero,
        acuerdoFolio: acuerdo.folio,
      }),
      { status: 201 }
    )
  } catch (e) {
    if (e instanceof Error && e.message === YA_HAY_CORTE_DEL_SERVICIO) {
      return jsonError(409, "La unidad ya tiene un corte vigente de ese servicio.")
    }
    logger.error({ err: e }, "[api/cortes-servicio] error inesperado al preavisar el corte")
    return jsonError(500, "Error interno del servidor.")
  }
}

/**
 * GET /api/cortes-servicio — lectura de los cortes de la comunidad.
 *
 * `_req` se declara porque Next lo entrega, pero NO se lee: no hay parámetro que
 * cambie el alcance. La comunidad sale de `withComunidadScope()`, la única
 * fuente, así que un `?comunidadId=` del cliente no mueve nada.
 */
export async function GET(_req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", RECURSO_CORTES)) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const [cortes, total] = await Promise.all([
      prisma.corteServicio.findMany({
        where: { comunidadId: scope.comunidadId },
        orderBy: [{ fechaPreaviso: "desc" }, { id: "desc" }],
      }),
      prisma.corteServicio.count({ where: { comunidadId: scope.comunidadId } }),
    ])

    // Nombres en DOS consultas para todo el listado (no una por corte): la unidad
    // que sufre el corte y el folio del acuerdo que lo autoriza. El corte guarda
    // los ids; la pantalla necesita los nombres.
    const unidadIds = [...new Set(cortes.map((corte) => corte.unidadId))]
    const acuerdoIds = [...new Set(cortes.map((corte) => corte.acuerdoId))]

    const [unidades, acuerdos] = await Promise.all([
      unidadIds.length === 0
        ? []
        : prisma.unidad.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: unidadIds } },
            select: { id: true, numero: true },
          }),
      acuerdoIds.length === 0
        ? []
        : prisma.acuerdo.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: acuerdoIds } },
            select: { id: true, folio: true },
          }),
    ])

    const numeroPorUnidad = new Map(
      unidades.map((unidad) => [unidad.id, unidad.numero])
    )
    const folioPorAcuerdo = new Map(
      acuerdos.map((acuerdo) => [acuerdo.id, acuerdo.folio])
    )

    const data = cortes.map((corte) =>
      vistaDeCorte(corte, {
        unidadNumero: numeroPorUnidad.get(corte.unidadId) ?? null,
        acuerdoFolio: folioPorAcuerdo.get(corte.acuerdoId) ?? null,
      })
    )

    return Response.json({ data, total, mostrados: data.length })
  } catch (e) {
    logger.error({ err: e }, "[api/cortes-servicio] error inesperado al leer los cortes")
    return jsonError(500, "Error interno del servidor.")
  }
}
