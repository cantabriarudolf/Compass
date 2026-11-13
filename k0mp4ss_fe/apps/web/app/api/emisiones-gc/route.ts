/**
 * /api/emisiones-gc — emisiones de Gasto Común FI (BD-FUENTE-VERDAD Fase 3).
 *
 * GET paginado vía factory. POST emite el gasto común del período: valida
 * período/fondo/unidades con responsable, contrasta el monto contra el
 * PRESUPUESTO APROBADO del año y calcula montos (modo fijo por tarifa de tipo de
 * unidad, variable por prorrateo del gasto devengado) y crea la emisión + sus
 * cobros + su evento de auditoría en una transacción. Solo administrador
 * (crear "fi").
 *
 * F31 · V1 (S6, corregido) — el presupuesto es ESTIMATIVO (Ley 21.442 art. 22):
 *   · el cobro del mes es por el gasto DEVENGADO, no por la proyección anual: el
 *     monto emitido es el que declara el período (prorrateo) o la suma de las
 *     tarifas del reglamento (fijo), nunca el total del presupuesto;
 *   · con presupuesto `vigente` del año, la emisión se CONTRASTA contra su
 *     doceavo mensual (total / 12) y el exceso se declara con los DOS números en
 *     la respuesta y en la bitácora. NO se bloquea: un gasto urgente o imprevisto
 *     es lícito y el presupuesto sólo estima;
 *   · sin presupuesto aprobado la emisión corre igual y deja la advertencia
 *     literal de que no puede contrastarse: el comité no aprueba un presupuesto
 *     para impedir que la administración cobre;
 *   · la emisión guarda el `presupuestoId` del presupuesto con el que se
 *     contrastó (NULL cuando no había ninguno) y lo nombra en la bitácora con su
 *     período, versión y folio del acuerdo.
 */
import { z } from "zod"
import {
  CobroFIEscrituraCompletaSchema,
  EmisionGCSchema,
  type LineaCobroFI,
} from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { hoyISO } from "@/lib/date-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { totalDePartidas } from "@/lib/presupuesto"
import {
  autorizaEmision,
  parametrosDeVersion,
  versionReglamentoVigenteDeComunidad,
} from "@/lib/reglamento"
import { createCrudHandlers, type CrudDelegate } from "@/lib/api/crud-factory"
import {
  jsonError,
  withComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { vencimientoAviso } from "@/lib/aviso-cobro"
import { errorGenerico } from "@/app/api/personas/route"

// Adaptador de delegate Prisma a la factory (mismo patrón que maestros/[tipo]).
function delegado(modelo: unknown): CrudDelegate {
  return modelo as CrudDelegate
}

export const emisionesHandlers = createCrudHandlers({
  model: delegado(prisma.emisionGC),
  schema: EmisionGCSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "fi"),
})

export const GET = emisionesHandlers.GET

const EmitirGCInputSchema = z.object({
  periodo: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "El periodo debe tener formato AAAA-MM."),
  modo: z.enum(["fijo", "variable"]),
  /**
   * Gasto DEVENGADO del período en modo prorrateo: es la fuente del monto a
   * repartir (Ley 21.442 art. 22: se cobran los gastos efectivamente incurridos,
   * no la estimación anual del presupuesto). En modo fijo el monto lo fijan las
   * tarifas que declara la versión del reglamento.
   */
  gastoTotal: z.number().positive().optional(),
  fechaVencimiento: z.string().min(1).optional(),
  unidadIds: z.array(z.string().min(1)).optional(),
})

/**
 * Pesos en formato chileno para los mensajes del operador y la bitácora, con
 * hasta dos decimales: el doceavo mensual del presupuesto no siempre es entero
 * ($1.000.000 / 12 = $83.333,33) y un monto se declara al centavo.
 */
function pesos(monto: number): string {
  return `$${monto.toLocaleString("es-CL", { maximumFractionDigits: 2 })}`
}

/**
 * Pesos → centavos enteros. El contraste se hace en la unidad mínima de la
 * moneda: comparar floats deja pasar diferencias invisibles al operador.
 */
function enCentavos(monto: number): number {
  return Math.round(monto * 100)
}

/** Nombre del cuerpo aprobador para la bitácora: la ley nombra comité o asamblea. */
function nombreDelCuerpo(cuerpo: string): string {
  return cuerpo === "comite" ? "el Comité" : "la Asamblea"
}

/**
 * Año (AAAA) del período de la emisión (AAAA-MM). El presupuesto por partidas se
 * aprueba por AÑO, así que el contraste del mes busca el del año del período.
 * `""` si el período no trae año: entonces no hay presupuesto con qué contrastar
 * y la emisión sigue con su advertencia.
 */
function anioDelPeriodo(periodo: string): string {
  return periodo.split("-")[0] ?? ""
}

/**
 * Advertencia literal de una emisión que no puede contrastarse: sin presupuesto
 * aprobado del año el sistema no tiene contra qué comparar, y la administración
 * no puede quedar impedida de cobrar los gastos del período porque el comité no
 * haya aprobado un presupuesto.
 */
const ADVERTENCIA_SIN_PRESUPUESTO =
  "Emisión sin contraste presupuestario: no hay presupuesto aprobado para el año, la emisión no puede contrastarse."

/** Meses del año: el doceavo mensual es la referencia estimativa del art. 22. */
const MESES_DEL_ANIO = 12

/** Exceso del mes contra la referencia estimativa del presupuesto anual. */
interface ExcesoMensual {
  /** Lo que la emisión cobra: el gasto devengado del período. */
  montoEmitido: number
  /** Doceavo del presupuesto anual: la referencia estimativa del mes. */
  referenciaMensual: number
  /** Cuánto supera el monto emitido a la referencia, al centavo. */
  diferencia: number
  /** Sentencia literal que declara el exceso con los DOS números a la vista. */
  descripcion: string
}

/** Resultado de contrastar la emisión contra el presupuesto vigente del año. */
interface ContrastePresupuesto {
  /** Presupuesto con el que se contrastó; `null` si no había ninguno aprobado. */
  presupuestoId: string | null
  /** Total anual aprobado (suma de partidas); `null` sin presupuesto. */
  totalPresupuesto: number | null
  /** Doceavo mensual de ese total; `null` sin presupuesto. */
  referenciaMensual: number | null
  /** Exceso declarado; `null` si el mes no supera la referencia o no hay presupuesto. */
  exceso: ExcesoMensual | null
  /** Advertencia literal cuando no hay presupuesto con qué contrastar. */
  advertencia: string | null
}

/** Lo mínimo que el contraste necesita del presupuesto ya leído. */
interface PresupuestoParaContraste {
  readonly id: string
  readonly partidas: readonly { readonly monto: number }[]
}

/**
 * Contrasta el monto emitido contra el presupuesto ANUAL vigente y declara el
 * exceso, sin bloquear nada (Ley 21.442 art. 22: el presupuesto es estimativo y
 * el cobro es por el gasto devengado).
 *
 * El exceso se decide en centavos enteros y sin divisiones aproximadas: el mes
 * supera su doceavo exactamente cuando `emitido × 12 > presupuesto anual`. La
 * referencia que se declara se redondea al centavo sólo para mostrarla.
 */
function contrastarConPresupuesto(
  gastoTotalEmitido: number,
  presupuesto: PresupuestoParaContraste | null
): ContrastePresupuesto {
  if (!presupuesto) {
    return {
      presupuestoId: null,
      totalPresupuesto: null,
      referenciaMensual: null,
      exceso: null,
      advertencia: ADVERTENCIA_SIN_PRESUPUESTO,
    }
  }
  const centavosPresupuesto = enCentavos(totalDePartidas(presupuesto.partidas))
  const centavosEmitido = enCentavos(gastoTotalEmitido)
  const totalPresupuesto = centavosPresupuesto / 100
  const referenciaMensual =
    Math.round(centavosPresupuesto / MESES_DEL_ANIO) / 100
  const sinExceso = {
    presupuestoId: presupuesto.id,
    totalPresupuesto,
    referenciaMensual,
    advertencia: null,
  }
  if (centavosEmitido * MESES_DEL_ANIO <= centavosPresupuesto) {
    return { ...sinExceso, exceso: null }
  }
  const diferencia =
    Math.round(centavosEmitido - centavosPresupuesto / MESES_DEL_ANIO) / 100
  return {
    ...sinExceso,
    exceso: {
      montoEmitido: gastoTotalEmitido,
      referenciaMensual,
      diferencia,
      descripcion: `El total emitido de ${pesos(gastoTotalEmitido)} supera el doceavo mensual de ${pesos(referenciaMensual)} del presupuesto vigente de ${pesos(totalPresupuesto)}; el presupuesto es estimativo y la emisión no se bloquea.`,
    },
  }
}

/**
 * Lo que la bitácora deja constancia del contraste: con presupuesto nombra el
 * documento usado y el exceso (o su ausencia); sin presupuesto, la advertencia
 * literal.
 */
function contrasteEnLaBitacora(
  contraste: ContrastePresupuesto,
  presupuesto: {
    readonly periodo: string
    readonly version: number
    readonly cuerpo: string
    readonly acuerdoId: string
  } | null,
  folioDelAcuerdo: string | null
): string {
  if (!presupuesto) return ADVERTENCIA_SIN_PRESUPUESTO
  const documento = `presupuesto ${presupuesto.periodo} versión ${presupuesto.version} aprobado por ${nombreDelCuerpo(presupuesto.cuerpo)} según el acuerdo ${folioDelAcuerdo ?? presupuesto.acuerdoId}`
  if (contraste.exceso) return `${documento}: ${contraste.exceso.descripcion}`
  return `${documento}: el total emitido no supera el doceavo mensual de ${pesos(contraste.referenciaMensual ?? 0)} del presupuesto anual de ${pesos(contraste.totalPresupuesto ?? 0)}.`
}

/** Reparto del monto de una unidad entre gasto común y recargo de reserva. */
interface DesgloseCobro {
  /** Lo que paga la unidad: la suma exacta de las líneas. */
  montoBase: number
  /** Recargo al fondo de reserva (0 si la versión no declara reserva). */
  reserva: number
  lineas: LineaCobroFI[]
}

/**
 * Convierte el monto que asigna la fórmula vigente (`tarifa del tipo` en fijo,
 * `gastoTotal · prorrateo` en variable, redondeado como hoy) en el desglose del
 * cobro (S5): la reserva es un cargo REAL a la unidad, no un asiento interno,
 * y su fondo de imputación vive en la propia línea.
 *
 * - `incluidaEnPresupuesto = false` (lectura normativa por defecto): el
 *   recargo va encima del gasto común — `reserva = round(m · P / 100)`.
 * - `incluidaEnPresupuesto = true` (la asamblea aprobó un presupuesto que ya lo
 *   contiene): la unidad paga exactamente lo mismo que hoy y el recargo se
 *   desagrega — `reserva = round(m · P / (100 + P))`, el resto es gasto común.
 *
 * En ambos casos las líneas suman exactamente `montoBase`. Una línea de monto
 * cero no se emite: el esquema exige líneas positivas y el total no cambia.
 */
function desgloseCobro(
  montoAsignado: number,
  porcentajeReserva: number,
  incluidaEnPresupuesto: boolean,
  fondoGcId: string,
  fondoReservaId: string | null
): DesgloseCobro {
  let gastoComun = montoAsignado
  let reserva = 0
  if (porcentajeReserva > 0) {
    reserva = incluidaEnPresupuesto
      ? Math.round(
          (montoAsignado * porcentajeReserva) / (100 + porcentajeReserva)
        )
      : Math.round((montoAsignado * porcentajeReserva) / 100)
    if (incluidaEnPresupuesto) gastoComun = montoAsignado - reserva
  }
  // El concepto de la línea es el mismo que ya existe (`gasto_comun`): el
  // esquema no tiene un miembro que nombre el aporte al fondo de reserva y no
  // se inventa uno en este corte. Lo que distingue la línea es su `fondoId`.
  const lineas: LineaCobroFI[] = []
  if (gastoComun > 0) {
    lineas.push({ concepto: "gasto_comun", monto: gastoComun, fondoId: fondoGcId })
  }
  if (reserva > 0 && fondoReservaId) {
    lineas.push({
      concepto: "gasto_comun",
      monto: reserva,
      fondoId: fondoReservaId,
    })
  }
  return { montoBase: gastoComun + reserva, reserva, lineas }
}

/** Motivos por los que la compuerta bloquea la emisión antes de escribir (S1/S2/S5). */
type MotivoBloqueoEmision =
  | "sin_version"
  | "fuente_sin_respaldo"
  | "parametros_invalidos"
  | "reserva_sin_fondo"

/** Datos que algunos motivos necesitan para nombrar lo que falta. */
interface ContextoBloqueo {
  /** Porcentaje de reserva declarado por la versión (`reserva_sin_fondo`). */
  porcentajeReserva?: number
}

/**
 * 400 que nombra el motivo y la comunidad, sin escribir nada. La compuerta
 * corre antes de crear: una comunidad sin declaración no emite.
 */
async function emisionBloqueada(
  comunidadId: string,
  periodo: string,
  motivo: MotivoBloqueoEmision,
  contexto: ContextoBloqueo = {}
): Promise<Response> {
  const comunidad = await prisma.comunidad.findUnique({
    where: { id: comunidadId },
    select: { nombre: true },
  })
  const nombre = comunidad?.nombre ?? comunidadId
  const mensajes: Record<MotivoBloqueoEmision, string> = {
    sin_version: `Emisión bloqueada: la comunidad ${nombre} no declaró una versión del reglamento vigente para el período ${periodo}.`,
    fuente_sin_respaldo: `Emisión bloqueada: la versión vigente de la comunidad ${nombre} es una migración automática; la forma de contribución debe declararse por reglamento de copropiedad o acta de asamblea.`,
    parametros_invalidos: `Emisión bloqueada: los parámetros de la versión vigente de la comunidad ${nombre} no son válidos.`,
    // `reserva_sin_fondo` siempre recibe el porcentaje: es parte del mensaje.
    reserva_sin_fondo: `Emisión bloqueada: la versión vigente de la comunidad ${nombre} declara un ${contexto.porcentajeReserva ?? 0}% de aporte al fondo de reserva y no existe un fondo de reserva activo donde imputarlo.`,
  }
  return jsonError(400, mensajes[motivo])
}

/** POST emite el Gasto Común del período y genera sus cobros. */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "crear", "fi")) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parsed = EmitirGCInputSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { periodo, modo } = parsed.data

  try {
    // Compuerta S1: sin versión vigente que funde la forma de contribución no
    // se emite nada. Se resuelve antes de cualquier lectura de montos.
    const versionVigente = await versionReglamentoVigenteDeComunidad(
      scope.comunidadId,
      periodo
    )
    if (!versionVigente) {
      return emisionBloqueada(scope.comunidadId, periodo, "sin_version")
    }
    if (!autorizaEmision(versionVigente)) {
      return emisionBloqueada(scope.comunidadId, periodo, "fuente_sin_respaldo")
    }
    const parametros = parametrosDeVersion(versionVigente)
    if (!parametros) {
      return emisionBloqueada(scope.comunidadId, periodo, "parametros_invalidos")
    }

    const duplicada = await prisma.emisionGC.findFirst({
      where: { comunidadId: scope.comunidadId, periodo },
    })
    if (duplicada) {
      return jsonError(
        409,
        `El periodo ${periodo} ya fue procesado previamente.`
      )
    }
    const fondoGC = await prisma.fondoFI.findFirst({
      where: { comunidadId: scope.comunidadId, tipo: "gasto_comun", activo: true },
    })
    if (!fondoGC) {
      return jsonError(
        400,
        "No existe un Fondo de Gasto Común activo para imputar la emisión."
      )
    }

    const todas = await prisma.unidad.findMany({
      where: { comunidadId: scope.comunidadId },
      orderBy: [{ numero: "asc" }, { id: "asc" }],
    })
    const elegibles = todas.filter(
      (u) =>
        !u.id.startsWith("u-E-") &&
        (!parsed.data.unidadIds ||
          parsed.data.unidadIds.length === 0 ||
          parsed.data.unidadIds.includes(u.id))
    )
    if (elegibles.length === 0) {
      return jsonError(400, "No hay unidades elegibles para la emisión.")
    }
    const vinculos = await prisma.vinculoUnidad.findMany({
      where: {
        comunidadId: scope.comunidadId,
        unidadId: { in: elegibles.map((u) => u.id) },
        rol: "propietario",
        fechaFin: null,
      },
    })
    const responsablePorUnidad = new Map(
      vinculos.map((v) => [v.unidadId, v.personaId])
    )
    const sinResponsable = elegibles.filter(
      (u) => !responsablePorUnidad.has(u.id)
    )
    if (sinResponsable.length > 0) {
      return jsonError(
        400,
        `Emisión bloqueada: ${sinResponsable.length} unidad(es) sin responsable de cobro asignado.`
      )
    }
    // Compuerta S2/S5: si la versión declara aporte al fondo de reserva, ese
    // fondo tiene que existir y estar activo. Sin él el aporte se calculaba en
    // 0 y un número declarado se perdía en silencio; ahora no se emite nada.
    const fondoReserva = await prisma.fondoFI.findFirst({
      where: { comunidadId: scope.comunidadId, tipo: "reserva", activo: true },
    })
    if (parametros.porcentajeReserva > 0 && !fondoReserva) {
      return emisionBloqueada(scope.comunidadId, periodo, "reserva_sin_fondo", {
        porcentajeReserva: parametros.porcentajeReserva,
      })
    }
    if (modo === "variable" && (!parsed.data.gastoTotal || parsed.data.gastoTotal <= 0)) {
      return jsonError(
        400,
        "La modalidad prorrateo exige definir el gasto total a recaudar."
      )
    }

    const tipos = await prisma.tipoUnidad.findMany({
      where: { comunidadId: scope.comunidadId },
    })
    const tarifaPorTipo = new Map(tipos.map((t) => [t.id, t.montoBaseGc]))

    const hoy = hoyISO()
    // S6, con UNA sola aritmética: el cargo nace con la fecha que el aviso va a
    // derivar — emisión + los `diasPagoGc` de la versión que rige el período —
    // calculada por `vencimientoAviso` (días corridos sobre UTC, nunca sobre la
    // hora local del servidor), la misma función que usa
    // `app/api/avisos-cobro`. Antes cada ruta hacía su cuenta y la emisión podía
    // sembrar una fecha que la emisión del papel después tenía que corregir.
    // `diasPagoGc` es un entero del esquema de la versión, así que el plazo
    // existe siempre acá: la función compartida no devuelve `null`.
    const vencimiento =
      parsed.data.fechaVencimiento ??
      (vencimientoAviso(hoy, parametros.diasPagoGc) ?? undefined)
    const emisionId = generarId("egc")
    const lineas: { unidadId: string; responsablePersonaId: string; monto: number; cobroId: string }[] = []
    const cobros: Record<string, unknown>[] = []
    // Presupuesto emitido (Σ monto asignado, sin el recargo) y aporte declarado
    // al fondo de reserva (Σ líneas de reserva).
    let presupuestoTotal = 0
    let reservaTotal = 0
    elegibles.forEach((u, idx) => {
      const montoAsignado =
        modo === "fijo"
          ? Math.round(tarifaPorTipo.get(u.tipoUnidadId) ?? 0)
          : Math.round((parsed.data.gastoTotal ?? 0) * u.prorrateo)
      const desglose = desgloseCobro(
        montoAsignado,
        parametros.porcentajeReserva,
        parametros.reservaIncluidaEnPresupuesto,
        fondoGC.id,
        fondoReserva?.id ?? null
      )
      presupuestoTotal += montoAsignado
      reservaTotal += desglose.reserva
      const cobroId = generarId("cob", idx)
      lineas.push({
        unidadId: u.id,
        // SAFETY: la unidad pasó el filtro sinResponsable; el vínculo existe.
        responsablePersonaId: responsablePorUnidad.get(u.id) as string,
        // Presupuesto de la unidad (Σ líneas = `gastoTotal`): el cargo con su
        // recargo de reserva es el `montoBase` del cobro, no esta línea.
        monto: montoAsignado,
        cobroId,
      })
      cobros.push({
        id: cobroId,
        unidadId: u.id,
        periodo,
        concepto: "gasto_comun",
        origenModulo: "FI",
        origenRef: emisionId,
        fondoId: fondoGC.id,
        descripcion: `Gasto Común ${periodo}`,
        montoBase: desglose.montoBase,
        // S5: el cobro nace con su desglose y su recargo de reserva imputado al
        // fondo de reserva. La suma de las líneas es `montoBase`.
        lineas: desglose.lineas,
        fechaCargo: hoy,
        fechaVencimiento: vencimiento,
        moras: [],
        pagos: [],
        diferencias: [],
      })
    })

    // El fondo se resolvió en la compuerta; el aporte sale del porcentaje que
    // declara la versión (S2), nunca del `porcentajeAporte` del fondo, y es
    // exactamente la suma de las líneas de reserva de los cobros.
    //
    // S6 · F31 — el monto emitido es el gasto DEVENGADO del período: en modo
    // prorrateo, el total que declara el cuerpo; en modo fijo, la suma de las
    // tarifas que paga cada unidad. El presupuesto NO es la fuente del monto.
    const gastoTotalEmitido =
      modo === "variable"
        ? (parsed.data.gastoTotal ?? presupuestoTotal)
        : presupuestoTotal

    // El presupuesto se aprueba por AÑO (el período de la emisión es AAAA-MM, su
    // año es el prefijo) y sólo el `vigente` sirve de referencia: con dos
    // versiones manda la de versión mayor. Su ausencia NO bloquea (art. 22).
    const presupuesto = await prisma.presupuesto.findFirst({
      where: {
        comunidadId: scope.comunidadId,
        periodo: anioDelPeriodo(periodo),
        estado: "vigente",
      },
      orderBy: { version: "desc" },
      include: { partidas: { orderBy: { orden: "asc" } } },
    })
    // El contraste declara el exceso del mes contra el doceavo del presupuesto
    // anual y deja la advertencia cuando no hay presupuesto: nunca rechaza.
    const contraste = contrastarConPresupuesto(gastoTotalEmitido, presupuesto)
    const emision = {
      id: emisionId,
      periodo,
      modo,
      gastoTotal: gastoTotalEmitido,
      // S6: la traza al presupuesto con el que se contrastó (NULL si no hubo).
      presupuestoId: contraste.presupuestoId,
      lineas,
      fondoReservaAporte:
        reservaTotal > 0 && fondoReserva
          ? { fondoId: fondoReserva.id, monto: reservaTotal }
          : undefined,
      fechaEmision: hoy,
    }
    const validaEmision = EmisionGCSchema.safeParse(emision)
    if (!validaEmision.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: validaEmision.error.flatten(),
      })
    }
    for (const cobro of cobros) {
      const valido = CobroFIEscrituraCompletaSchema.safeParse(cobro)
      if (!valido.success) {
        return jsonError(400, "Datos inválidos.", {
          detalles: valido.error.flatten(),
        })
      }
    }

    // El folio del acuerdo es la prueba de quién aprobó el presupuesto: la
    // bitácora nombra el documento usado, no sólo un id. Si la fila del acuerdo
    // no está (dato de prueba), se cita el id con el que el presupuesto la
    // referencia — nunca se inventa un folio. Sin presupuesto no hay acuerdo que
    // citar.
    const acuerdoDelPresupuesto = presupuesto
      ? await prisma.acuerdo.findFirst({
          where: { id: presupuesto.acuerdoId, comunidadId: scope.comunidadId },
          select: { folio: true },
        })
      : null

    await prisma.$transaction(async (tx) => {
      await tx.emisionGC.create({
        // SAFETY: emision pasó EmisionGCSchema.safeParse arriba.
        data: { ...validaEmision.data, comunidadId: scope.comunidadId } as never,
      })
      for (const c of cobros) {
        await tx.cobroFI.create({
          // SAFETY: cada cobro pasó CobroFIEscrituraCompletaSchema.safeParse arriba.
          data: { ...c, comunidadId: scope.comunidadId } as never,
        })
      }
      // S6 · F31: la emisión deja constancia del contraste —el exceso con sus
      // dos números o la advertencia de que no pudo contrastarse—, con el mismo
      // contrato de evento que ya usan las otras escrituras FI.
      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: new Date().toISOString(),
          usuario: scope.usuarioId,
          categoria: "FI",
          tipoAccion: "FI_EMISION_GC_CREADA",
          referenciaId: emisionId,
          descripcion: `Emisión de gasto común ${periodo} por ${pesos(gastoTotalEmitido)} en modo ${modo}: ${lineas.length} unidad(es), ${contrasteEnLaBitacora(contraste, presupuesto, acuerdoDelPresupuesto?.folio ?? null)}`,
        },
        tx
      )
    })
    const guardadas = await prisma.cobroFI.findMany({
      where: { comunidadId: scope.comunidadId, origenRef: emisionId },
    })
    const emisionGuardada = await prisma.emisionGC.findUnique({
      where: { id: emisionId },
    })
    return Response.json(
      {
        emision: emisionGuardada,
        cobros: guardadas,
        // S6: el exceso (si lo hay) y la advertencia de no poder contrastar
        // viajan con la emisión: el operador ve la comparación en el momento.
        advertencia: contraste.advertencia,
        exceso: contraste.exceso,
      },
      { status: 201 }
    )
  } catch (e) {
    logger.error({ err: e }, "[api/emisiones-gc] error inesperado")
    return errorGenerico(e)
  }
}
