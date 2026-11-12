/**
 * /api/convenios — convenio de pago de la deuda de gastos comunes (F29).
 *
 * Ley 21.442 art. 6: el administrador está facultado para celebrar convenios de
 * pago con los copropietarios morosos, en cuotas mensuales, con la PRIMERA CUOTA
 * pagada al suscribir, y el convenio exige ACUERDO DEL COMITÉ. Las tres reglas se
 * sostienen acá y no en la voluntad de quien llama:
 *
 *   · el acuerdo se LEE de la base (`Acuerdo`, U3) y tiene que ser de esta
 *     comunidad, del Comité y estar `aprobado`: un convenio sin esa fila no se
 *     escribe (400 con el motivo);
 *   · la primera cuota se registra PAGADA en la fecha de suscripción y no se
 *     genera como deuda; las demás salen de la regla pura `cuotasDelConvenio`;
 *   · una unidad no puede tener dos convenios `vigente` a la vez (409);
 *   · cada cuota 1..N nace como un `CobroFI` imputado al fondo de gasto común
 *     ACTIVO de la comunidad (sin ese fondo no hay convenio: 400 y cero filas),
 *     porque la deuda del convenio tiene que ser la que el sistema cobra.
 *
 * - POST: guard `fi:cobranza` + crear (administración; el comité autoriza por el
 *   acuerdo y audita por la lectura, según la matriz). Escribe el convenio, sus
 *   cuotas, sus cargos FI y los eventos `FI_CONVENIO_CREADO` / `FI_CONVENIO_CARGOS`
 *   en UNA transacción: o existe el convenio foliado por su acuerdo, o no existe
 *   nada.
 * - GET: guard `fi:cobranza` + ver. Acotado a la comunidad de la sesión —el
 *   `comunidadId` nunca viene del cliente— y leído en un número FIJO de consultas:
 *   los convenios con sus cuotas en una, el conteo en otra, y los nombres (unidad,
 *   deudor, folio del acuerdo) en tres más para todo el listado, nunca una por
 *   convenio ni una por cuota.
 *
 * No hay PUT ni DELETE: un convenio suscrito es un hecho con cuotas emitidas, no
 * se reescribe. La anulación es una decisión de negocio que todavía no existe y
 * no se simula. El archivo del convenio firmado tampoco: el instrumento vale por
 * la firma del deudor y generarlo sin ella sería mentir en el archivo.
 */
import {
  CobroFIEscrituraCompletaSchema,
  ConvenioPagoCreacionSchema,
} from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { cuotasDelConvenio } from "@/lib/convenios"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import {
  vistaDeConvenio,
  type ConvenioEnLaVista,
} from "./_vista"

/**
 * Recurso de la matriz que gobierna el convenio: `fi:cobranza`.
 *
 * No es `fi` a secas. El candado de procesos del repositorio (R1) prohíbe que una
 * ruta NUEVA use la raíz desnuda cuando la matriz ya declara sus claves
 * granulares, y acá la granular no es un capricho: el convenio es un acto de
 * COBRANZA de la deuda (regulariza la morosidad con cuotas), y `fi:cobranza` está
 * declarada justamente así —el comité AUDITA la cobranza (`ver`) pero no la
 * ejecuta—, que es la forma de la ley: el administrador celebra el convenio, el
 * comité lo autoriza por el acuerdo. Los efectos por rol son los mismos que
 * tendría `fi` (`crear`/`editar` sólo administración, `ver` administración y
 * comité), así que ningún acceso se abre ni se cierra con esta elección.
 */
const RECURSO_CONVENIOS = "fi:cobranza"

/** Centinela para distinguir el conflicto de negocio de una falla real. */
const YA_HAY_CONVENIO_VIGENTE = "CONVENIO_YA_VIGENTE"

/**
 * Los textos de error van LITERALES en cada `jsonError`, no en constantes: así los
 * lee el guardián de mensajes de error (`test/api/permisos-por-objeto-mensajes.test.ts`),
 * que sólo puede auditar lo que está escrito en la ruta. Una constante con nombre
 * queda como mensaje «indirecto» y el guardián no puede saber qué dice adentro.
 */

/** Pesos en formato chileno para la bitácora. */
function pesos(monto: number): string {
  return `$${monto.toLocaleString("es-CL")}`
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope: ComunidadScope = resultado.scope

  if (!puede(scope.rol, "crear", RECURSO_CONVENIOS)) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = ConvenioPagoCreacionSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const datos = parsed.data

  // La unidad y el deudor se resuelven EN la comunidad de la sesión: el id de otra
  // comunidad no es un dato ajeno que se ignora, es una fila que no existe (404).
  const unidad = await prisma.unidad.findFirst({
    where: { id: datos.unidadId, comunidadId: scope.comunidadId },
    select: { id: true, numero: true },
  })
  if (!unidad) return jsonError(404, "Unidad no encontrada.")

  const persona = await prisma.persona.findFirst({
    where: { id: datos.personaId, comunidadId: scope.comunidadId },
    select: { id: true, nombreCompleto: true },
  })
  if (!persona) return jsonError(404, "Persona no encontrada.")

  // El acuerdo del Comité es la AUTORIZACIÓN del convenio (art. 6): se lee la fila
  // real. Cada condición tiene su motivo, porque «no autorizado» no dice qué falta.
  const acuerdo = await prisma.acuerdo.findFirst({
    where: { id: datos.acuerdoId, comunidadId: scope.comunidadId },
    select: { id: true, cuerpo: true, estado: true, folio: true },
  })
  if (!acuerdo) return jsonError(400, "No se puede suscribir el convenio: el acuerdo del Comité no existe en esta comunidad.")
  if (acuerdo.cuerpo !== "comite") return jsonError(400, "No se puede suscribir el convenio: el acuerdo no es del Comité.")
  if (acuerdo.estado !== "aprobado") {
    return jsonError(400, "No se puede suscribir el convenio: el acuerdo no está aprobado.")
  }

  // El fondo de imputación se resuelve ANTES de abrir la transacción que escribe,
  // igual que la emisión de gasto común: sin un fondo de gasto común activo no hay
  // dónde imputar la deuda del convenio y no se escribe ni el convenio.
  const fondoGC = await prisma.fondoFI.findFirst({
    where: {
      comunidadId: scope.comunidadId,
      tipo: "gasto_comun",
      activo: true,
    },
    select: { id: true, nombre: true },
  })
  if (!fondoGC) {
    return jsonError(
      400,
      "No se puede suscribir el convenio: la comunidad no tiene un fondo de gasto común activo donde imputar las cuotas."
    )
  }

  const ahora = new Date()
  // El cargo FI se registra el día de la firma; el vencimiento es el de la cuota.
  const fechaCargo = ahora.toISOString().slice(0, 10)

  // La fecha de suscripción es AHORA (la decide el servidor) y es el ancla de los
  // vencimientos mensuales: la regla pura no lee el reloj.
  let cuotasDelSaldo: ReturnType<typeof cuotasDelConvenio>
  try {
    cuotasDelSaldo = cuotasDelConvenio({
      montoTotal: datos.montoTotal,
      numeroCuotas: datos.numeroCuotas,
      primeraCuota: datos.primeraCuota,
      fechaSuscripcion: ahora,
    })
  } catch (e) {
    // El esquema zod valida los mismos bordes: llegar acá significa que la regla y
    // el contrato del cuerpo se separaron, y eso no se persiste a ciegas.
    logger.error({ err: e }, "[api/convenios] términos del convenio fuera de contrato")
    return jsonError(400, "No se puede suscribir el convenio: los términos no permiten armar cuotas mensuales válidas.")
  }

  // Sin cuotas no hay convenio: la primera cuota ya cubrió la deuda entera.
  if (cuotasDelSaldo.length === 0) return jsonError(400, "No se puede suscribir el convenio: la primera cuota cubre el total y no queda saldo que financiar.")

  const convenioId = generarId("conv")

  /**
   * Las cuotas se arman en memoria (con su id) y se escriben en UNA sentencia: la
   * cuota 0 es el pago al suscribir —nace `pagada`, con la fecha de firma— y las
   * 1..N son la deuda mensual que devolvió la regla pura.
   *
   * El id lleva el número de cuota como sufijo: las N cuotas se crean en el mismo
   * milisegundo y el `idx` de `generarId` quita cualquier chance de colisión de la
   * clave primaria dentro del alta.
   */
  const cuotasAcrear = [
    {
      id: generarId("ccta", 0),
      comunidadId: scope.comunidadId,
      convenioId,
      numero: 0,
      monto: datos.primeraCuota,
      venceEn: ahora,
      estado: "pagada",
      pagadaEn: ahora,
      registradaPor: scope.usuarioId,
    },
    ...cuotasDelSaldo.map((cuota) => ({
      id: generarId("ccta", cuota.numero),
      comunidadId: scope.comunidadId,
      convenioId,
      numero: cuota.numero,
      monto: cuota.monto,
      venceEn: cuota.venceEn,
      estado: "pendiente",
      pagadaEn: null,
      registradaPor: null,
    })),
  ]

  /**
   * Los cargos FI de las cuotas 1..N: la deuda del convenio tiene que ser la que
   * el sistema cobra, no una fila paralela. La cuota 0 NO se carga: se pagó al
   * suscribir y contarla otra vez cobraría dos veces el mismo dinero.
   *
   * El período es el mes en que la cuota VENCE: el cargo pertenece a la deuda de
   * ese mes y esa columna es la clave con la que el pago encuentra su cobro. El
   * concepto es `gasto_comun` (el catálogo FI no tiene un concepto de convenio y
   * no se inventa uno), y la línea repite el monto de la cuota para que la suma
   * del detalle sea exactamente el monto base (S5).
   */
  const cargosDelConvenio: Record<string, unknown>[] = []
  for (const cuota of cuotasDelSaldo) {
    const fechaVenceCuota = cuota.venceEn.toISOString()
    const candidato = {
      id: generarId("cob", cuota.numero),
      unidadId: unidad.id,
      periodo: fechaVenceCuota.slice(0, 7),
      concepto: "gasto_comun",
      origenModulo: "FI",
      origenRef: convenioId,
      fondoId: fondoGC.id,
      descripcion: `Convenio de pago ${convenioId}: cuota ${cuota.numero} de ${datos.numeroCuotas}`,
      montoBase: cuota.monto,
      lineas: [
        { concepto: "gasto_comun", monto: cuota.monto, fondoId: fondoGC.id },
      ],
      fechaCargo,
      fechaVencimiento: fechaVenceCuota.slice(0, 10),
      moras: [],
      pagos: [],
      diferencias: [],
    }
    const validacion = CobroFIEscrituraCompletaSchema.safeParse(candidato)
    if (!validacion.success) {
      // El cargo lo arma esta ruta, no el cliente: llegar acá es un defecto del
      // contrato interno, y no se persiste a ciegas.
      return jsonError(400, "Datos inválidos.", {
        detalles: validacion.error.flatten(),
      })
    }
    // El tenant no es parte del contrato de lectura/escritura del cobro: lo pone
    // el servidor desde el scope, nunca el cuerpo.
    cargosDelConvenio.push({
      ...(validacion.data as unknown as Record<string, unknown>),
      comunidadId: scope.comunidadId,
    })
  }

  try {
    const vista = await prisma.$transaction<ConvenioEnLaVista>(async (tx) => {
      // «Un solo convenio vigente por unidad» se verifica DENTRO de la transacción
      // que escribe: leerlo afuera dejaría la ventana abierta entre la lectura y el
      // alta. Si otro alta ganó la carrera, el conteo ya no es cero y no se escribe
      // nada (ni convenio ni cuotas ni evento).
      const vigentes = await tx.convenioPago.count({
        where: {
          comunidadId: scope.comunidadId,
          unidadId: unidad.id,
          estado: "vigente",
        },
      })
      if (vigentes > 0) throw new Error(YA_HAY_CONVENIO_VIGENTE)

      const creado = await tx.convenioPago.create({
        data: {
          id: convenioId,
          comunidadId: scope.comunidadId,
          unidadId: unidad.id,
          personaId: persona.id,
          acuerdoId: acuerdo.id,
          montoTotal: datos.montoTotal,
          numeroCuotas: datos.numeroCuotas,
          fechaSuscripcion: ahora,
          primeraCuota: datos.primeraCuota,
          estado: "vigente",
          observaciones: datos.observaciones ?? null,
          creadoPor: scope.usuarioId,
        },
      })

      await tx.cuotaConvenio.createMany({ data: cuotasAcrear })

      // Los cargos FI de la deuda, en la MISMA transacción: un convenio sin sus
      // cargos sería un trámite que la contabilidad no conoce.
      await tx.cobroFI.createMany({ data: cargosDelConvenio as never })

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "FI",
          tipoAccion: "FI_CONVENIO_CREADO",
          referenciaId: creado.id,
          descripcion: `Convenio de pago ${creado.id} de la unidad ${unidad.numero} con ${persona.nombreCompleto}: total ${pesos(datos.montoTotal)} en ${datos.numeroCuotas} cuota(s) mensuales, primera cuota de ${pesos(datos.primeraCuota)} pagada al suscribir; autorizado por el acuerdo ${acuerdo.folio} del Comité (Ley 21.442 art. 6).`,
        },
        tx
      )

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "FI",
          tipoAccion: "FI_CONVENIO_CARGOS",
          referenciaId: creado.id,
          // Cuenta los cargos creados, no los montos: el monto vive en cada cobro.
          descripcion: `Convenio de pago ${creado.id}: ${cargosDelConvenio.length} cargo(s) FI creados en el fondo ${fondoGC.nombre} (cuotas 1 a ${datos.numeroCuotas}).`,
        },
        tx
      )

      return vistaDeConvenio(creado, cuotasAcrear, {
        unidadNumero: unidad.numero,
        deudorNombre: persona.nombreCompleto,
        acuerdoFolio: acuerdo.folio,
      })
    })

    return Response.json(vista, { status: 201 })
  } catch (e) {
    if (e instanceof Error && e.message === YA_HAY_CONVENIO_VIGENTE) {
      return jsonError(409, "La unidad ya tiene un convenio de pago vigente.")
    }
    logger.error({ err: e }, "[api/convenios] error inesperado al suscribir el convenio")
    return jsonError(500, "Error interno del servidor.")
  }
}

/**
 * GET /api/convenios — lectura de los convenios de la comunidad con sus cuotas.
 *
 * `_req` se declara porque Next lo entrega, pero NO se lee: no hay parámetro que
 * cambie el alcance. La comunidad sale de `withComunidadScope()`, la única fuente,
 * así que un `?comunidadId=` del cliente no mueve nada.
 */
export async function GET(_req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", RECURSO_CONVENIOS)) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const [convenios, total] = await Promise.all([
      prisma.convenioPago.findMany({
        where: { comunidadId: scope.comunidadId },
        orderBy: [{ fechaSuscripcion: "desc" }, { id: "desc" }],
        include: { cuotas: { orderBy: { numero: "asc" } } },
      }),
      prisma.convenioPago.count({ where: { comunidadId: scope.comunidadId } }),
    ])

    // Nombres en TRES consultas para todo el listado (no una por convenio ni una
    // por cuota): el convenio se lee por la unidad, el deudor y el acuerdo que lo
    // autoriza, y los ids repetidos se piden una sola vez.
    const unidadIds = [...new Set(convenios.map((convenio) => convenio.unidadId))]
    const personaIds = [...new Set(convenios.map((convenio) => convenio.personaId))]
    const acuerdoIds = [...new Set(convenios.map((convenio) => convenio.acuerdoId))]

    const [unidades, personas, acuerdos] = await Promise.all([
      unidadIds.length === 0
        ? []
        : prisma.unidad.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: unidadIds } },
            select: { id: true, numero: true },
          }),
      personaIds.length === 0
        ? []
        : prisma.persona.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: personaIds } },
            select: { id: true, nombreCompleto: true },
          }),
      acuerdoIds.length === 0
        ? []
        : prisma.acuerdo.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: acuerdoIds } },
            select: { id: true, folio: true },
          }),
    ])

    const numeroPorUnidad = new Map(unidades.map((unidad) => [unidad.id, unidad.numero]))
    const nombrePorPersona = new Map(
      personas.map((persona) => [persona.id, persona.nombreCompleto])
    )
    const folioPorAcuerdo = new Map(acuerdos.map((acuerdo) => [acuerdo.id, acuerdo.folio]))

    const data = convenios.map((convenio) =>
      vistaDeConvenio(convenio, convenio.cuotas, {
        unidadNumero: numeroPorUnidad.get(convenio.unidadId) ?? null,
        deudorNombre: nombrePorPersona.get(convenio.personaId) ?? null,
        acuerdoFolio: folioPorAcuerdo.get(convenio.acuerdoId) ?? null,
      })
    )

    return Response.json({ data, total, mostrados: data.length })
  } catch (e) {
    logger.error({ err: e }, "[api/convenios] error inesperado al leer los convenios")
    return jsonError(500, "Error interno del servidor.")
  }
}
