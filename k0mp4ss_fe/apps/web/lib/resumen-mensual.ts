/**
 * resumen-mensual — los totales de comunidad que el aviso de cobro debe declarar
 * (Ley 21.442 art. 31: ingresos, egresos y saldo de caja).
 *
 * Por qué existe: el sistema sabía el egreso del mes (`reportes-re/_acciones.ts`
 * filtra `fecha: { startsWith: periodo }`) y el saldo ACUMULADO de fondos
 * (`saldoFondo`, sin corte por fecha). Los otros dos números de la ley no eran
 * computables, así que el aviso no se podía emitir.
 *
 * Forma: función pura sobre filas en memoria + un cargador Prisma delgado, la
 * misma forma que `saldoFondo`/`ContextoSaldoFondo`. La regla se prueba con
 * fixtures y sin base; el cargador solo traduce una comunidad a filas.
 *
 * ── La fórmula, escrita como aritmética ─────────────────────────────────────
 *
 * Ventana del período `AAAA-MM`: desde = `AAAA-MM-01`, hasta = último día real
 * del mes (`finMesISO`, con bisiesto). Todas las fechas son ISO `AAAA-MM-DD` de
 * ancho fijo, así que se comparan LEXICOGRÁFICAMENTE. Nunca se construye un
 * `Date` local para decidir si un movimiento cae en el mes: eso es exactamente
 * cómo un movimiento se cae al mes vecino.
 *
 *   ingresos del mes = Σ { pago.monto : pago ∈ ⋃ cobros.pagos, desde ≤ pago.fecha ≤ hasta }
 *                    + Σ { ingreso.monto : ingreso ∈ ingresos, desde ≤ ingreso.fecha ≤ hasta }
 *   egresos del mes  = Σ { egreso.monto : desde ≤ egreso.fecha ≤ hasta }
 *
 *   saldo de caja al cierre = saldoInicial + ingresosAcumulados − egresosAcumulados
 *     saldoInicial        = Σ { fondo.saldoInicial ?? 0 }
 *     ingresosAcumulados  = Σ { pago.monto : pago.fecha ≤ hasta }
 *                         + Σ { ingreso.monto : ingreso.fecha ≤ hasta }
 *     egresosAcumulados   = Σ { egreso.monto : egreso.fecha ≤ hasta }
 *
 * El saldo es ACUMULADO hasta el corte (no "del mes"): una caja al cierre de mes
 * es un stock, no un flujo. El acento está en el corte por fecha, que es lo que
 * `saldoFondo` no tiene.
 *
 * ── Por qué esto reconcilia con la pantalla de fondos ───────────────────────
 *
 * `saldoFondo(f, ctx)` = `saldoInicial[f]` + reparto de lo pagado por las líneas
 * de cada cobro hacia `f` + `ingresosFI` de `f` − `egresos` de `f`. El reparto
 * (`ingresosDeCobroPorFondo`) es una PARTICIÓN exacta de `totalPagado(cobro)`:
 * cada pago se reparte en proporción a las líneas y las partes suman el pago
 * completo (y el cobro legacy, o el cobro sin montos, acredita todo a un solo
 * fondo). Entonces, sumando sobre TODOS los fondos de la comunidad:
 *
 *   Σ_f saldoFondo(f) = Σ saldoInicial + Σ pagos + Σ ingresosFI − Σ egresos
 *
 * que es exactamente la fórmula de arriba con `hasta` = fin del período. Por eso
 * el total de la comunidad NO necesita reimplementar el reparto por fondo: se
 * calcula sobre `pago.monto` y coincide. Con el período corriente (ningún
 * movimiento posterior al corte) la igualdad es literal; con un período pasado
 * el aviso muestra el stock a ese cierre y la pantalla el de hoy, que es la
 * diferencia buscada, no una divergencia.
 *
 * Consecuencia de diseño: este módulo NO devuelve saldo por fondo. Un corte por
 * fondo sí necesitaría el reparto, que hoy es privado de `finanzas-utils`; mover
 * esa lógica compartida es trabajo de otro corte, no una segunda fórmula acá.
 */

import type {
  CategoriaEgresoFI,
  CobroFI,
  EgresoFI,
  FondoFI,
  IngresoFI,
  PagoCobroFI,
} from "./schemas"
import { PeriodoFacturacionSchema } from "./schemas"
import { finMesISO, inicioMesISO } from "./date-utils"
import { prisma } from "./prisma"

/** Fila mínima de cobro: lo pagado, sin su detalle de líneas (ver arriba). */
export type FilaCobroResumen = Pick<CobroFI, "id" | "unidadId" | "fondoId" | "pagos">

/** Fila mínima de egreso: fecha, monto y a qué fondo se imputó. */
export type FilaEgresoResumen = Pick<
  EgresoFI,
  "id" | "fecha" | "monto" | "fondoId" | "categoria" | "descripcion"
>

/** Fila mínima de ingreso manual (aportes, arriendos, punto cero). */
export type FilaIngresoResumen = Pick<IngresoFI, "id" | "fecha" | "monto" | "fondoId" | "concepto">

/** Fila mínima de fondo: solo abre la caja y nombra el destino del detalle. */
export type FilaFondoResumen = Pick<FondoFI, "id" | "nombre" | "saldoInicial">

export type FilasResumenMensual = {
  cobros: readonly FilaCobroResumen[]
  egresos: readonly FilaEgresoResumen[]
  ingresos: readonly FilaIngresoResumen[]
  fondos: readonly FilaFondoResumen[]
}

/**
 * De dónde vino cada peso del detalle: un pago de cobro, un ingreso manual o un
 * egreso. El documento muestra el desglose, no un total pelado (S4).
 */
export type OrigenMovimiento = "cobro" | "ingreso_manual" | "egreso"

export type MovimientoResumen = {
  origen: OrigenMovimiento
  /** Id del pago (los pagos son ítems JSON, con id propio) o de la fila. */
  id: string
  fecha: string
  monto: number
  /** Fondo del cobro/fila; el reparto fino por línea no cambia el total. */
  fondoId: string
  /** Concepto del ingreso, descripción del egreso o concepto del cobro. */
  detalle: string
  /** Solo en pagos de cobro: la unidad que pagó. */
  unidadId?: string
}

export type BloqueIngresosResumen = {
  /** Ingreso del mes = `deCobros` + `manuales` (la ley habla de plata que entra). */
  total: number
  /** Pagos de cualquier cobro con fecha en el período. */
  deCobros: number
  /** Ingresos manuales (`IngresoFI`) con fecha en el período. */
  manuales: number
  /** Cantidad de movimientos del detalle, para el conteo del documento. */
  cantidad: number
  detalle: MovimientoResumen[]
}

export type BloqueEgresosResumen = {
  total: number
  cantidad: number
  detalle: MovimientoResumen[]
}

export type SaldoCajaResumen = {
  /** Σ `fondo.saldoInicial` de la comunidad (sin fecha: es la apertura). */
  inicial: number
  /** Todo lo que entró hasta el corte, no solo lo del mes. */
  ingresosAcumulados: number
  /** Todo lo que salió hasta el corte. */
  egresosAcumulados: number
  /** `inicial + ingresosAcumulados − egresosAcumulados`. */
  alCierre: number
}

export type ResumenMensual = {
  periodo: string
  /** Primer día del período (`AAAA-MM-01`). */
  desde: string
  /** Corte del saldo: último día real del período. */
  hasta: string
  ingresos: BloqueIngresosResumen
  egresos: BloqueEgresosResumen
  saldoCaja: SaldoCajaResumen
}

/**
 * Extremos del período. El formato lo valida el mismo contrato que usa el resto
 * del cobro (`PeriodoFacturacionSchema`), y el último día sale de `finMesISO`
 * para no reimplementar el calendario. `RangeError` si el período no es válido:
 * un aviso con un período inventado no se calcula.
 */
function ventanaDelPeriodo(periodo: string): { desde: string; hasta: string } {
  const valido = PeriodoFacturacionSchema.safeParse(periodo)
  if (!valido.success) {
    throw new RangeError(
      valido.error.issues[0]?.message ?? "El período debe tener formato AAAA-MM."
    )
  }
  const [anioStr, mesStr] = periodo.split("-")
  const anio = Number.parseInt(anioStr!, 10)
  const mes = Number.parseInt(mesStr!, 10)
  return { desde: inicioMesISO(mes, anio), hasta: finMesISO(mes, anio) }
}

/** Comparación lexicográfica de ISO `AAAA-MM-DD`: nunca pasa por `Date` local. */
function enRango(fecha: string, desde: string, hasta: string): boolean {
  return fecha >= desde && fecha <= hasta
}

/** ¿La fecha cae en o antes del corte? Mismo criterio lexicográfico. */
function antesDelCorte(fecha: string, hasta: string): boolean {
  return fecha <= hasta
}

/** El detalle se muestra cronológico; el `sort` es estable en el orden de filas. */
function porFecha(a: MovimientoResumen, b: MovimientoResumen): number {
  return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0
}

function detallesDePagos(
  cobros: readonly FilaCobroResumen[],
  desde: string,
  hasta: string
): MovimientoResumen[] {
  const movimientos: MovimientoResumen[] = []
  for (const cobro of cobros) {
    for (const pago of cobro.pagos) {
      if (!enRango(pago.fecha, desde, hasta)) continue
      movimientos.push({
        origen: "cobro",
        id: pago.id,
        fecha: pago.fecha,
        monto: pago.monto,
        fondoId: cobro.fondoId,
        detalle: "Pago de cobro",
        unidadId: cobro.unidadId,
      })
    }
  }
  return movimientos.sort(porFecha)
}

function detallesDeIngresosManuales(
  ingresos: readonly FilaIngresoResumen[],
  desde: string,
  hasta: string
): MovimientoResumen[] {
  return ingresos
    .filter((ingreso) => enRango(ingreso.fecha, desde, hasta))
    .map((ingreso) => ({
      origen: "ingreso_manual" as const,
      id: ingreso.id,
      fecha: ingreso.fecha,
      monto: ingreso.monto,
      fondoId: ingreso.fondoId,
      detalle: ingreso.concepto,
    }))
    .sort(porFecha)
}

/**
 * El aviso de un mes: ingresos y egresos del período, más el stock de caja al
 * cierre. Ver la fórmula y el reconciliado en la cabecera del módulo. Devuelve
 * ceros (no `null`) cuando el mes no tiene movimientos: el documento imprime
 * $0, no un hueco.
 */
export function resumenMensual(
  periodo: string,
  filas: FilasResumenMensual
): ResumenMensual {
  const { desde, hasta } = ventanaDelPeriodo(periodo)

  const detalleCobros = detallesDePagos(filas.cobros, desde, hasta)
  const detalleManuales = detallesDeIngresosManuales(filas.ingresos, desde, hasta)
  const detalleIngresos = [...detalleCobros, ...detalleManuales].sort(porFecha)
  const deCobros = detalleCobros.reduce((acc, m) => acc + m.monto, 0)
  const manuales = detalleManuales.reduce((acc, m) => acc + m.monto, 0)

  const detalleEgresos: MovimientoResumen[] = filas.egresos
    .filter((egreso) => enRango(egreso.fecha, desde, hasta))
    .map((egreso) => ({
      origen: "egreso" as const,
      id: egreso.id,
      fecha: egreso.fecha,
      monto: egreso.monto,
      fondoId: egreso.fondoId,
      detalle: egreso.descripcion,
    }))
    .sort(porFecha)
  const totalEgresos = detalleEgresos.reduce((acc, m) => acc + m.monto, 0)

  // Acumulado hasta el cierre: la misma aritmética de `saldoFondo`, solo que
  // acotada por fecha. Sumar los pagos como pagos (y no repartirlos por fondo)
  // es legítimo porque el reparto de `saldoFondo` es una partición exacta.
  const inicial = filas.fondos.reduce((acc, fondo) => acc + (fondo.saldoInicial ?? 0), 0)
  const pagosAcumulados = filas.cobros.reduce(
    (acc, cobro) =>
      acc +
      cobro.pagos
        .filter((pago) => antesDelCorte(pago.fecha, hasta))
        .reduce((suma, pago) => suma + pago.monto, 0),
    0
  )
  const ingresosManualesAcumulados = filas.ingresos
    .filter((ingreso) => antesDelCorte(ingreso.fecha, hasta))
    .reduce((acc, ingreso) => acc + ingreso.monto, 0)
  const egresosAcumulados = filas.egresos
    .filter((egreso) => antesDelCorte(egreso.fecha, hasta))
    .reduce((acc, egreso) => acc + egreso.monto, 0)
  const ingresosAcumulados = pagosAcumulados + ingresosManualesAcumulados

  return {
    periodo,
    desde,
    hasta,
    ingresos: {
      total: deCobros + manuales,
      deCobros,
      manuales,
      cantidad: detalleIngresos.length,
      detalle: detalleIngresos,
    },
    egresos: {
      total: totalEgresos,
      cantidad: detalleEgresos.length,
      detalle: detalleEgresos,
    },
    saldoCaja: {
      inicial,
      ingresosAcumulados,
      egresosAcumulados,
      alCierre: inicial + ingresosAcumulados - egresosAcumulados,
    },
  }
}

/**
 * Cargador Prisma delgado: una comunidad + un período → las filas del cálculo.
 *
 * Los pagos viven en el JSON de cada cobro, así que se traen todos los cobros de
 * la comunidad y el recorte por fecha lo hace la función pura (es el mismo
 * patrón de `app/api/fi/route.ts`: un solo `findMany` para toda la comunidad,
 * nunca uno por cobro). El egreso del mes tampoco se filtra en SQL para no tener
 * dos definiciones de "mes" — una con `startsWith` y otra con corte de saldo.
 */
export async function cargarResumenMensual(
  comunidadId: string,
  periodo: string
): Promise<ResumenMensual> {
  const [cobros, egresos, ingresos, fondos] = await Promise.all([
    prisma.cobroFI.findMany({
      where: { comunidadId },
      select: { id: true, unidadId: true, fondoId: true, pagos: true },
    }),
    prisma.egresoFI.findMany({
      where: { comunidadId },
      select: {
        id: true,
        fecha: true,
        monto: true,
        fondoId: true,
        categoria: true,
        descripcion: true,
      },
    }),
    prisma.ingresoFI.findMany({
      where: { comunidadId },
      select: { id: true, fecha: true, monto: true, fondoId: true, concepto: true },
    }),
    prisma.fondoFI.findMany({
      where: { comunidadId },
      select: { id: true, nombre: true, saldoInicial: true },
    }),
  ])

  return resumenMensual(periodo, {
    cobros: cobros.map((cobro) => ({
      id: cobro.id,
      unidadId: cobro.unidadId,
      fondoId: cobro.fondoId,
      // SAFETY: pagos es Json con shape PagoCobroFI[] validado por CobroFISchema.
      pagos: cobro.pagos as unknown as PagoCobroFI[],
    })),
    egresos: egresos.map((egreso) => ({
      ...egreso,
      // SAFETY: categoria es String en BD con los valores de CATEGORIAS_EGRESO_FI.
      categoria: egreso.categoria as CategoriaEgresoFI,
    })),
    ingresos,
    fondos: fondos.map((fondo) => ({
      id: fondo.id,
      nombre: fondo.nombre,
      saldoInicial: fondo.saldoInicial ?? 0,
    })),
  })
}
