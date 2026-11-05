/**
 * aviso-cobro — el documento congelado con el que se cobra (S1, S4, S7).
 *
 * Por qué existe: el motor FI ya sabe cuánto debe cada unidad, pero la ley exige
 * el PAPEL. Ley 21.442 arts. 31, 32 y 7: sin aviso emitido no corre el plazo de
 * pago ni hay título ejecutivo. Este módulo arma el contenido del aviso y lo
 * congela; `app/api/avisos-cobro` lo folia y lo persiste.
 *
 * ── Qué entra en el contenido ────────────────────────────────────────────────
 *
 * Por unidad y período, desde los cargos que YA existen (nunca recalculando):
 *
 *   proporción       `unidad.prorrateo` + los términos del reglamento vigente
 *                    (forma de contribución, % de reserva, si va incluida)
 *   conceptos        las líneas del cargo (`lineasDeCobro`, que sintetiza la
 *                    línea del cobro legacy), separadas en gasto común, recargo
 *                    al fondo de reserva, multas y "otros" (todo lo demás, con
 *                    su concepto y su monto: no se pierde plata por no saber
 *                    cómo llamarla)
 *   intereses        las moras registradas con `fecha <= fechaEmision`
 *   pagado           los pagos registrados con `fecha <= fechaEmision`
 *   exigible         líneas del período + intereses devengados
 *   totalAdeudado    `exigible - pagado`, nunca negativo
 *
 * Y a nivel comunidad, los tres números del art. 31 desde `cargarResumenMensual`
 * (T3): ingresos del mes, egresos del mes y saldo de caja al cierre, con su
 * detalle. El aviso NO reimplementa esa fórmula: la copia congelada es la del
 * resumen del período.
 *
 * ── La deuda de períodos anteriores SÍ se consolida (S4, L8) ─────────────────
 *
 * El aviso es el título ejecutivo (arts. 31 y 32), así que no puede decir "debe
 * $47.000" a un vecino que arrastra tres meses: tiene que declarar la deuda
 * completa. Entra TODO cargo de la unidad con saldo pendiente positivo cuyo
 * período NO es el del aviso — tenga o no aviso emitido ese período: lo que se
 * declara es lo que se debe, no lo que ya se folió. El saldo sale de
 * `saldoPendiente` (`montoBase` + moras − pagos, nunca negativo) sobre las
 * moras y los pagos devengados a la fecha de emisión, igual que el período.
 * Nunca se recalcula un monto a mano.
 *
 * El bloque `deudaAnterior` se agrupa por período, del más viejo al más nuevo,
 * y SIEMPRE está presente: sin deuda anterior viene con `periodos: []` y
 * `total: 0`, para que el papel pueda afirmar "sin deuda de períodos
 * anteriores" en vez de callarlo (un bloque ausente y un bloque vacío no se
 * distinguen después).
 *
 * ── Versión 2 del contenido: lo de ayer sigue diciendo lo mismo ──────────────
 *
 * Las filas ya emitidas están congeladas en la versión 1 y no se tocan. La
 * versión 2 AGREGA, no reinterpreta: `montos.totalAdeudado` sigue siendo el
 * total del período que el aviso emite (una fila v1 y una v2 significan lo
 * mismo en ese campo), y lo nuevo viaja en campos nuevos:
 *
 *   deudaAnterior.periodos[]  los cargos impagos de otros períodos, con saldo
 *   deudaAnterior.total       la suma de esos saldos
 *   montos.totalDeudaAnterior        el mismo total, del lado de los montos
 *   montos.totalAdeudadoConsolidado  `totalAdeudado` + `totalDeudaAnterior`
 *
 * Los dos totales de la deuda anterior salen de la MISMA variable: no pueden
 * divergir. El documento que lee la fila decide qué imprimir según la versión
 * (`lib/pdf-utils`), así que un lector viejo de una fila v2 sigue viendo el
 * período donde siempre lo vio.
 *
 * ── La regla del dato que falta ──────────────────────────────────────────────
 *
 * Un monto que la ley exige y no se puede computar NO se imprime como cero: se
 * declara en `noComputables` con su campo y su motivo, y el campo del contenido
 * queda en `null`. Es la misma disciplina del diagnóstico de esquema (un cero
 * inventado miente con más autoridad que un "no declarado"). Hoy hay tres:
 *
 *   - `sin_reglamento_vigente`: la comunidad no declara versión para el período,
 *     así que la proporción y el % de reserva no tienen términos;
 *   - `parametros_invalidos`: la versión existe pero sus números no parsean;
 *   - `prorrateo_no_declarado`: la unidad no declara coeficiente (0 o menos).
 *
 * ── El plazo de pago corre desde la EMISIÓN del aviso (S6) ──────────────────
 *
 * Ley 21.442 art. 7: el pago se hace "dentro de los diez primeros días
 * siguientes a la fecha de emisión del correspondiente aviso de cobro". El reloj
 * arranca en la EMISIÓN, no en la entrega (la entrega es un deber aparte, S3):
 *
 *     vencimiento = fechaEmision + diasPagoGc de la versión que rige el período
 *
 * `vencimientoAviso` hace esa cuenta y es lo que el aviso persiste en su columna
 * `vencimiento`. El plazo es configuración de la comunidad, no del código: 10
 * días en el reglamento de referencia, otros valores si la versión los declara.
 *
 * El aviso es el documento que cuenta, así que la emisión ALINEA el cargo del
 * período a la fecha del papel (`fechaVencimiento`). No es un detalle: la mora
 * corre desde `fechaVencimiento` (`app/api/cobros-fi/[id]/mora`), y una fecha
 * que el residente no vio en el aviso no puede cobrar intereses. Las otras dos
 * salidas se descartaron: rechazar la emisión bloquearía el papel por una fecha
 * heredada del cargo, y "reportar" la diferencia la deja viva en la base, que
 * es exactamente lo que hay que evitar. La copia congelada del cargo dentro del
 * contenido toma la fecha alineada, para que el documento no se contradiga.
 *
 * ── La huella del contenido ─────────────────────────────────────────────────
 *
 * `hashContenido` (S2) devuelve una cadena corta y reproducible del contenido
 * congelado: es lo que el aviso firmado imprime para que cualquiera pueda decir
 * si el papel corresponde al documento que el sistema emitió. El PDF que la
 * lleva vive en `lib/pdf-utils` (`documentoAvisoCobroPDF`); este módulo aporta la
 * huella, no el documento.
 *
 * ── Lo que este corte NO hace (y por eso no lo simula) ───────────────────────
 *
 * - No firma ni entrega (T5/T6): el contenido se congela acá y el hash se
 *   calcula acá; la firma y la entrega son del documento y del visor.
 * - No entrega ni registra la entrega (T6, S3).
 * - No decide el alcance contable de lo consolidado: declara lo que la base ya
 *   dice que se debe (cargos impagos de la unidad). Un cargo que la comunidad
 *   condone o reprograme sale de la deuda cuando sale de la base, no acá.
 * - Prima de seguro y cuota de convenio (S4) todavía no existen como conceptos
 *   del cobro (el convenio es F29): cuando existan, llegan como líneas y caen en
 *   `otros` con su nombre, sin cambiar este contrato.
 */

import { createHash, randomUUID } from "node:crypto"
import type {
  ConceptoCobroFI,
  LineaCobroFI,
  MoraCobroFI,
  PagoCobroFI,
  ParametrosCobroReglamento,
} from "@/lib/schemas"
import { lineasDeCobro } from "@/lib/cobro-lineas"
import { saldoPendiente } from "@/lib/finanzas-utils"
import { cargarResumenMensual, type ResumenMensual } from "@/lib/resumen-mensual"
import { prisma } from "@/lib/prisma"

/** Concepto de línea que la ley nombra aparte (multa aplicada a la unidad). */
const CONCEPTO_MULTA = "multa_in"
/** Concepto de línea del gasto común mensual. */
const CONCEPTO_GASTO_COMUN = "gasto_comun"
/** Tipo de fondo al que se imputa el recargo del fondo de reserva. */
const TIPO_FONDO_RESERVA = "reserva"

/** Prefijo del folio del aviso: `AC-####`, correlativo por comunidad. */
export const PREFIJO_FOLIO_AVISO = "AC-"

/** Lo mínimo que el contenido necesita del cargo FI (nada se recalcula). */
export interface CobroDelAviso {
  id: string
  /** Período `AAAA-MM` del cargo: decide si es deuda anterior o del aviso. */
  periodo: string
  concepto: ConceptoCobroFI
  descripcion: string
  montoBase: number
  lineas: LineaCobroFI[] | null
  fondoId: string
  fechaCargo: string
  fechaVencimiento?: string | null
  moras: MoraCobroFI[]
  pagos: PagoCobroFI[]
}

/** Lo mínimo de la unidad: identidad y proporción declarada. */
export interface UnidadDelAviso {
  id: string
  numero: string
  etiqueta: string
  prorrateo: number
}

/** Fondo de la comunidad: da nombre y naturaleza a cada línea. */
export interface FondoDelAviso {
  id: string
  nombre: string
  tipo: string
}

/** Copia congelada de la versión del reglamento con la que se calculó (S7). */
export interface ReglamentoDelAviso {
  id: string
  version: number
  vigenteDesde: string
  fuenteInstrumento: string
  formaContribucion: string
  /** `null` cuando la versión existe pero sus números no parsean. */
  parametros: ParametrosCobroReglamento | null
}

export interface EntradaContenidoAviso {
  periodo: string
  fechaEmision: string
  unidad: UnidadDelAviso
  reglamento: ReglamentoDelAviso | null
  fondos: readonly FondoDelAviso[]
  cobros: readonly CobroDelAviso[]
  /**
   * Cargos de la unidad en OTROS períodos (la ruta trae todos los que no son el
   * del aviso). La función decide cuáles son deuda: saldo pendiente positivo y
   * período distinto al del aviso.
   */
  cobrosAnteriores: readonly CobroDelAviso[]
  /** Totales de comunidad del período (`cargarResumenMensual`). */
  resumen: ResumenMensual
}

/** Por qué un dato que la ley pide no se pudo computar. */
export type MotivoNoComputable =
  | "sin_reglamento_vigente"
  | "parametros_invalidos"
  | "prorrateo_no_declarado"

/**
 * Un dato exigido que no se pudo computar. El documento imprime `detalle`, no un
 * cero: el cero se lee como "no se cobra" y aquí significa "no se sabe".
 */
export interface ValorNoComputable {
  /** Campo del contenido que queda en `null`. */
  campo: string
  motivo: MotivoNoComputable
  detalle: string
}

/** Una línea del cargo, tal como quedó congelada. */
export interface LineaDelAviso {
  cobroId: string
  concepto: string
  monto: number
  fondoId: string
  /** Nombre del fondo; `null` si la línea apunta a un fondo que no existe. */
  fondoNombre: string | null
  /** `legacy` = la línea que `lineasDeCobro` sintetizó para un cobro sin detalle. */
  origen: "linea" | "legacy"
}

/** Un cargo impago de un período anterior, tal como queda congelado. */
export interface CargoDeudaAnterior {
  cobroId: string
  concepto: string
  descripcion: string
  /** Monto base del cargo (el que el motor FI emitió). */
  montoBase: number
  /** Moras devengadas a la fecha de emisión. */
  intereses: number
  /** Pagos registrados a la fecha de emisión. */
  pagado: number
  /** `montoBase + intereses - pagado` por `saldoPendiente`, nunca negativo. */
  saldo: number
}

/**
 * La deuda de períodos anteriores que el aviso declara (S4, L8), agrupada por
 * período y del más viejo al más nuevo. Presente SIEMPRE: vacía cuando no hay
 * deuda, para que el papel pueda decir "sin deuda de períodos anteriores".
 */
export interface DeudaAnteriorDelAviso {
  periodos: Array<{ periodo: string; cargos: CargoDeudaAnterior[] }>
  total: number
}

export interface MontosDelAviso {
  gastoComun: number
  recargoFondoReserva: number
  multas: number
  /** Moras devengadas a la fecha de emisión. */
  intereses: number
  /** Cargos del período que la ley no nombra aparte, cada uno con su concepto. */
  otros: Array<{ concepto: string; monto: number }>
  /** Líneas del período + intereses devengados. */
  exigible: number
  /** Pagado a la fecha de emisión. */
  pagado: number
  /** `exigible - pagado`, nunca negativo. Sigue siendo SOLO del período. */
  totalAdeudado: number
  /** Suma de los saldos de `deudaAnterior` (0 si no hay deuda anterior). */
  totalDeudaAnterior: number
  /** `totalAdeudado + totalDeudaAnterior`: lo que el papel cobra entero. */
  totalAdeudadoConsolidado: number
}

/** El documento congelado de un aviso (lo que se persiste en `contenido`). */
export interface ContenidoAviso {
  /**
   * Versión del contrato del contenido: un lector futuro sabe qué está leyendo.
   * v1 = solo el período; v2 = período + `deudaAnterior` + totales consolidados.
   * Lo de v1 no cambia de significado en v2.
   */
  version: 2
  periodo: string
  fechaEmision: string
  unidad: { id: string; numero: string; etiqueta: string }
  reglamento: ReglamentoDelAviso | null
  participacion: {
    /** Proporción al gasto común (`unidad.prorrateo`); `null` = no declarada. */
    prorrateo: number | null
    formaContribucion: string | null
    porcentajeReserva: number | null
    reservaIncluidaEnPresupuesto: boolean | null
  }
  /** Los cargos del período que el aviso cobra, congelados uno a uno. */
  cargos: Array<{
    id: string
    concepto: string
    descripcion: string
    montoBase: number
    fechaCargo: string
    fechaVencimiento: string | null
  }>
  detalle: LineaDelAviso[]
  /** Deuda de períodos anteriores (vacía si no hay, nunca ausente). */
  deudaAnterior: DeudaAnteriorDelAviso
  montos: MontosDelAviso
  resumenComunidad: ResumenMensual
  noComputables: ValorNoComputable[]
}

function suma(valores: readonly number[]): number {
  return valores.reduce((total, valor) => total + valor, 0)
}

/** Comparación lexicográfica de fechas ISO `AAAA-MM-DD` (nunca pasa por `Date`). */
function hastaLaFecha(fecha: string, corte: string): boolean {
  return fecha <= corte
}

/**
 * La deuda de períodos anteriores de una unidad (S4, L8): todo cargo con saldo
 * pendiente positivo cuyo período no es el del aviso.
 *
 * El saldo NO se recalcula a mano: `saldoPendiente` es la fórmula del motor FI
 * (`montoBase + moras - pagos`, nunca negativo) y se le pasa la misma vista
 * recortada a la fecha de emisión que el resto del documento usa. Sumar por
 * fuera dejaría dos aritméticas de la misma deuda que pueden diferir.
 */
function deudaAnteriorDe(
  cobros: readonly CobroDelAviso[],
  periodo: string,
  fechaEmision: string
): DeudaAnteriorDelAviso {
  const porPeriodo = new Map<string, CargoDeudaAnterior[]>()
  for (const cobro of cobros) {
    // El período del aviso se cobra en `montos`: acá sería contarlo dos veces.
    if (cobro.periodo === periodo) continue
    const moras = cobro.moras.filter((mora) => hastaLaFecha(mora.fecha, fechaEmision))
    const pagos = cobro.pagos.filter((pago) => hastaLaFecha(pago.fecha, fechaEmision))
    const saldo = saldoPendiente({ montoBase: cobro.montoBase, moras, pagos })
    // Un cargo pagado no es deuda: no entra, y por eso tampoco suma 0 al total.
    if (saldo <= 0) continue
    const cargo: CargoDeudaAnterior = {
      cobroId: cobro.id,
      concepto: cobro.concepto,
      descripcion: cobro.descripcion,
      montoBase: cobro.montoBase,
      intereses: suma(moras.map((mora) => mora.monto)),
      pagado: suma(pagos.map((pago) => pago.monto)),
      saldo,
    }
    const delPeriodo = porPeriodo.get(cobro.periodo)
    if (delPeriodo) delPeriodo.push(cargo)
    else porPeriodo.set(cobro.periodo, [cargo])
  }
  // Los períodos son `AAAA-MM`: el orden lexicográfico es el cronológico, y no
  // pasa por `Date` (que es donde un período se cae al mes vecino).
  const periodos = [...porPeriodo.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((periodoDeLaDeuda) => ({
      periodo: periodoDeLaDeuda,
      cargos: porPeriodo.get(periodoDeLaDeuda)!,
    }))
  return { periodos, total: suma(periodos.flatMap((p) => p.cargos.map((c) => c.saldo))) }
}

/**
 * El contenido del aviso de una unidad y período. Función pura: la ruta le pasa
 * filas y ella decide el documento, así la regla se prueba sin base.
 */
export function contenidoAviso(entrada: EntradaContenidoAviso): ContenidoAviso {
  const { periodo, fechaEmision, unidad, reglamento, resumen } = entrada
  const parametros = reglamento?.parametros ?? null
  const noComputables: ValorNoComputable[] = []

  // Proporción declarada por la unidad. Un 0 (o negativo) no es una proporción:
  // es la ausencia de dato, y decirlo es más honesto que imprimir 0%.
  const prorrateo = unidad.prorrateo > 0 ? unidad.prorrateo : null
  // El orden de las declaraciones sigue el orden del documento: primero los
  // términos de la comunidad (reglamento) y después los de la unidad.
  if (!reglamento) {
    noComputables.push({
      campo: "participacion",
      motivo: "sin_reglamento_vigente",
      detalle: `La comunidad no declara una versión del reglamento vigente para el período ${periodo}: la forma de contribución y el porcentaje de aporte al fondo de reserva no son computables.`,
    })
  } else if (!parametros) {
    noComputables.push({
      campo: "participacion.porcentajeReserva",
      motivo: "parametros_invalidos",
      detalle: `La versión ${reglamento.version} del reglamento no declara parámetros válidos: el porcentaje de aporte al fondo de reserva no es computable.`,
    })
  }
  if (prorrateo === null) {
    noComputables.push({
      campo: "participacion.prorrateo",
      motivo: "prorrateo_no_declarado",
      detalle: `La unidad ${unidad.numero} no declara coeficiente de participación en el maestro de unidades: la proporción al gasto común y al fondo de reserva no es computable.`,
    })
  }

  // Detalle congelado, línea por línea. `lineasDeCobro` es el único lector que
  // sabe leer las dos formas del cargo (con detalle y legacy).
  const fondosPorId = new Map(entrada.fondos.map((fondo) => [fondo.id, fondo]))
  const detalle: LineaDelAviso[] = []
  for (const cobro of entrada.cobros) {
    const origen = cobro.lineas && cobro.lineas.length > 0 ? "linea" : "legacy"
    for (const linea of lineasDeCobro(cobro)) {
      const fondoId = linea.fondoId ?? cobro.fondoId
      detalle.push({
        cobroId: cobro.id,
        concepto: linea.concepto,
        monto: linea.monto,
        fondoId,
        fondoNombre: fondosPorId.get(fondoId)?.nombre ?? null,
        origen,
      })
    }
  }

  // El recargo al fondo de reserva se reconoce por el FONDO de la línea: es la
  // única marca que el emisor dejó (el concepto sigue siendo `gasto_comun`).
  const esReserva = (linea: LineaDelAviso): boolean =>
    fondosPorId.get(linea.fondoId)?.tipo === TIPO_FONDO_RESERVA
  const lineasReserva = detalle.filter(esReserva)
  const lineasComunes = detalle.filter((linea) => !esReserva(linea))

  const gastoComun = suma(
    lineasComunes.filter((l) => l.concepto === CONCEPTO_GASTO_COMUN).map((l) => l.monto)
  )
  const multas = suma(
    lineasComunes.filter((l) => l.concepto === CONCEPTO_MULTA).map((l) => l.monto)
  )
  const otrosPorConcepto = new Map<string, number>()
  for (const linea of lineasComunes) {
    if (linea.concepto === CONCEPTO_GASTO_COMUN || linea.concepto === CONCEPTO_MULTA) continue
    otrosPorConcepto.set(
      linea.concepto,
      (otrosPorConcepto.get(linea.concepto) ?? 0) + linea.monto
    )
  }
  const otros = [...otrosPorConcepto.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([concepto, monto]) => ({ concepto, monto }))

  // Intereses y pagos a la FECHA DE EMISIÓN: lo posterior no es parte de este
  // documento (un aviso no adivina lo que todavía no pasó).
  const intereses = suma(
    entrada.cobros.flatMap((cobro) =>
      cobro.moras
        .filter((mora) => hastaLaFecha(mora.fecha, fechaEmision))
        .map((mora) => mora.monto)
    )
  )
  const pagado = suma(
    entrada.cobros.flatMap((cobro) =>
      cobro.pagos
        .filter((pago) => hastaLaFecha(pago.fecha, fechaEmision))
        .map((pago) => pago.monto)
    )
  )
  const exigible =
    gastoComun + suma(lineasReserva.map((l) => l.monto)) + multas + suma(otros.map((o) => o.monto)) + intereses

  // Deuda de otros períodos: lo que el vecino arrastra también es este papel.
  const deudaAnterior = deudaAnteriorDe(
    entrada.cobrosAnteriores,
    periodo,
    fechaEmision
  )
  const totalAdeudado = Math.max(0, exigible - pagado)

  return {
    version: 2,
    periodo,
    fechaEmision,
    unidad: { id: unidad.id, numero: unidad.numero, etiqueta: unidad.etiqueta },
    reglamento,
    participacion: {
      prorrateo,
      formaContribucion: reglamento?.formaContribucion ?? null,
      porcentajeReserva: parametros?.porcentajeReserva ?? null,
      reservaIncluidaEnPresupuesto: parametros?.reservaIncluidaEnPresupuesto ?? null,
    },
    cargos: entrada.cobros.map((cobro) => ({
      id: cobro.id,
      concepto: cobro.concepto,
      descripcion: cobro.descripcion,
      montoBase: cobro.montoBase,
      fechaCargo: cobro.fechaCargo,
      fechaVencimiento: cobro.fechaVencimiento ?? null,
    })),
    detalle,
    deudaAnterior,
    montos: {
      gastoComun,
      recargoFondoReserva: suma(lineasReserva.map((l) => l.monto)),
      multas,
      intereses,
      otros,
      exigible,
      pagado,
      totalAdeudado,
      totalDeudaAnterior: deudaAnterior.total,
      totalAdeudadoConsolidado: totalAdeudado + deudaAnterior.total,
    },
    resumenComunidad: resumen,
    noComputables,
  }
}

/**
 * Serialización canónica del contenido: claves ordenadas recursivamente y sin
 * espacios. `JSON.stringify` no sirve para esto: respeta el orden de inserción,
 * y el JSON que vuelve de la base no conserva el orden con el que se congeló.
 * Dos objetos con los mismos datos tienen que dar el mismo texto, o el hash
 * impreso en el papel no se puede reproducir.
 *
 * Las claves sin valor se omiten (igual que `JSON.stringify`) y un número no se
 * confunde con su versión en texto. El orden de los arrays NO se toca: una lista
 * ordenada es contenido, no una forma de escribir el mismo dato.
 */
function canonico(valor: unknown): string {
  if (valor === null) return "null"
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`
  switch (typeof valor) {
    case "object": {
      const objeto = valor as Record<string, unknown>
      const claves = Object.keys(objeto)
        .filter((clave) => objeto[clave] !== undefined)
        .sort()
      const cuerpo = claves
        .map((clave) => `${JSON.stringify(clave)}:${canonico(objeto[clave])}`)
        .join(",")
      return `{${cuerpo}}`
    }
    case "number":
      if (!Number.isFinite(valor)) {
        throw new TypeError(
          "El contenido del aviso no puede llevar un número no finito."
        )
      }
      return JSON.stringify(valor)
    case "string":
    case "boolean":
      return JSON.stringify(valor)
    default:
      throw new TypeError(
        `El contenido del aviso no puede llevar un valor de tipo ${typeof valor}.`
      )
  }
}

/** Caracteres hexadecimales que se imprimen del SHA-256 (16 de 64). */
const HASH_LARGO = 16

/**
 * Huella del contenido congelado, para imprimirla en el aviso y verificarla a
 * mano (S2).
 *
 * Algoritmo exacto: SHA-256 del JSON canónico del contenido (claves ordenadas
 * recursivamente, sin espacios, UTF-8), en hexadecimal, y se imprimen los
 * primeros 16 caracteres en mayúscula (`A1B2C3D4E5F60718`). Se reproduce a mano:
 * ordenar las claves, quitar los espacios, calcular SHA-256 y comparar los
 * primeros 16. No depende del proceso ni del orden de inserción de las claves.
 */
export function hashContenido(contenido: unknown): string {
  const hex = createHash("sha256")
    .update(canonico(contenido), "utf8")
    .digest("hex")
  return hex.slice(0, HASH_LARGO).toUpperCase()
}

/**
 * Totales de comunidad del período, o el motivo por el que no se pueden
 * computar. Sin fondos de caja no hay apertura conocida y el "saldo de caja al
 * cierre" del art. 31 saldría de la nada: el aviso no se emite.
 */
export type TotalesDelPeriodo =
  | { ok: true; resumen: ResumenMensual }
  | { ok: false; motivo: "sin_fondos" | "periodo_invalido"; error: string }

export async function totalesDelPeriodo(
  comunidadId: string,
  periodo: string
): Promise<TotalesDelPeriodo> {
  const fondos = await prisma.fondoFI.count({ where: { comunidadId } })
  if (fondos === 0) {
    return {
      ok: false,
      motivo: "sin_fondos",
      error: `No se puede emitir el aviso: la comunidad no tiene fondos de caja registrados, así que el saldo de caja al cierre del período ${periodo} no es computable.`,
    }
  }
  try {
    return { ok: true, resumen: await cargarResumenMensual(comunidadId, periodo) }
  } catch (e) {
    if (e instanceof RangeError) {
      return { ok: false, motivo: "periodo_invalido", error: e.message }
    }
    throw e
  }
}

/**
 * Vencimiento del aviso (S6, Ley 21.442 art. 7): la fecha de emisión del aviso
 * arranca el plazo de pago que declara la versión del reglamento vigente en el
 * período.
 *
 * Algoritmo exacto: se suman `diasPagoGc` días CORRIDOS a la fecha de emisión
 * sobre el reloj UTC (no sobre la hora local: el día del documento no puede
 * depender de la zona del servidor) y se devuelve `AAAA-MM-DD`.
 *
 *     2026-09-01 + 10 → 2026-09-11 · 2026-09-25 + 10 → 2026-10-05
 *     2026-12-28 + 10 → 2027-01-07
 *
 * Sin días de pago declarados (`null`: la comunidad no tiene versión vigente o
 * sus parámetros no parsean) no hay plazo que derivar y el vencimiento queda
 * `null`: no se inventa una fecha. La entrega del aviso NO entra en la cuenta.
 */
export function vencimientoAviso(
  fechaEmision: string,
  diasPagoGc: number | null
): string | null {
  if (diasPagoGc === null || !Number.isFinite(diasPagoGc)) return null
  const base = new Date(`${fechaEmision}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + diasPagoGc)
  return base.toISOString().slice(0, 10)
}

/** Siguiente número correlativo de folio de una lista de folios emitidos. */
export function siguienteNumeroDeFolio(
  folios: readonly string[],
  prefijo: string = PREFIJO_FOLIO_AVISO
): number {
  const numeros = folios
    .map((folio) => Number.parseInt(folio.replace(prefijo, ""), 10))
    .filter((numero) => Number.isFinite(numero))
  return (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
}

/** Folio formateado con el prefijo y relleno de cuatro dígitos (`AC-0007`). */
export function folioNumerado(
  numero: number,
  prefijo: string = PREFIJO_FOLIO_AVISO
): string {
  return `${prefijo}${String(numero).padStart(4, "0")}`
}

/**
 * Código de verificación único dentro de la comunidad (mismo criterio que los
 * certificados: 32 bits aleatorios y un bucle acotado que nunca repite uno ya
 * emitido).
 */
export function nuevoCodigoVerificacion(existentes: ReadonlySet<string>): string {
  for (let intento = 0; intento < 20; intento++) {
    const codigo = `VC-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`
    if (!existentes.has(codigo)) return codigo
  }
  throw new Error("No se pudo generar un código de verificación único.")
}
