/**
 * agregados — funciones puras del dashboard operativo (`dashboard-operativo` T2–T8).
 *
 * Todo lo que el dashboard deriva de una colección vive acá, sin hooks ni JSX:
 * así el criterio de cada panel es uno solo y se puede probar sin montar React.
 *
 * Regla D4: cuando el servidor ya devuelve un agregado (`GET /api/fi` con sus
 * totales por fondo) se usa ese número, nunca una suma local. Las colecciones
 * que sí se agregan acá (cobros, egresos, liquidaciones, emisiones, PE) llegan
 * completas porque el panel las pagina hasta el final antes de sumar
 * (`useColeccionCompleta`): sumar la página 1 de un libro de 501 filas es un
 * defecto, no un atajo.
 */
import type {
  BitacoraVisitaPE,
  CobroFI,
  EgresoFI,
  EmisionGC,
  EncomiendaPE,
  IngresoContratistaPE,
  LiquidacionPL,
  ReservaRA,
  VisitaTecnicaPE,
} from "@/lib/schemas"

const MS_DIA = 24 * 60 * 60 * 1000

/** Monto en pesos chilenos, igual que el resto de la app (sin decimales). */
export function clp(monto: number): string {
  return monto.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  })
}

/** Días corridos entre dos fechas de dominio (YYYY-MM-DD); negativo si ya pasó. */
export function diasHasta(fechaISO: string, desdeISO: string): number {
  const destino = new Date(`${fechaISO}T00:00:00`).getTime()
  const base = new Date(`${desdeISO}T00:00:00`).getTime()
  if (!Number.isFinite(destino) || !Number.isFinite(base)) return Number.NaN
  return Math.round((destino - base) / MS_DIA)
}

/** Fecha de dominio legible: «29 oct 2026». */
export function fechaCorta(fechaISO: string): string {
  const fecha = new Date(`${fechaISO}T00:00:00`)
  if (Number.isNaN(fecha.getTime())) return fechaISO
  return fecha.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

// --- T2 / S1 · Foto del día de Operaciones -----------------------------------

export interface FotoDelDia {
  /** Visitas registradas para el día (las canceladas no son actividad de la puerta). */
  visitas: number
  visitasIngresadas: number
  /** Encomiendas que siguen en portería (`estado: "recibida"`), sin importar el día. */
  paquetesPendientes: number
  paquetesDelDia: number
  contratistas: number
  contratistasIngresados: number
  /** Movimientos de la puerta que cuentan como acceso efectivo del día. */
  accesos: number
  /** Todo lo registrado para el día: si es 0, el panel declara «sin movimiento». */
  movimientos: number
}

export function fotoAccesosDelDia(args: {
  visitas: BitacoraVisitaPE[]
  encomiendas: EncomiendaPE[]
  contratistas: IngresoContratistaPE[]
  dia: string
}): FotoDelDia {
  const { visitas, encomiendas, contratistas, dia } = args
  const visitasDelDia = visitas.filter((v) => v.fecha === dia && v.estado !== "cancelada")
  const visitasIngresadas = visitasDelDia.filter((v) => v.estado === "ingresada").length
  const paquetesPendientes = encomiendas.filter((e) => e.estado === "recibida").length
  const paquetesDelDia = encomiendas.filter((e) => e.fechaRecepcion === dia).length
  const contratistasDelDia = contratistas.filter(
    (c) => c.fecha === dia && c.estado !== "cancelado"
  )
  const contratistasIngresados = contratistasDelDia.filter(
    (c) => c.estado === "ingresado"
  ).length

  return {
    visitas: visitasDelDia.length,
    visitasIngresadas,
    paquetesPendientes,
    paquetesDelDia,
    contratistas: contratistasDelDia.length,
    contratistasIngresados,
    accesos: visitasIngresadas + contratistasIngresados,
    movimientos: visitasDelDia.length + paquetesDelDia + contratistasDelDia.length,
  }
}

// --- T4 / S4 · Deuda de las unidades -----------------------------------------

export interface DeudaUnidades {
  /** Multas impagas + gastos comunes atrasados (lo que pide S4). */
  total: number
  multas: number
  multasCobros: number
  gastosComunesAtrasados: number
  gastosComunesAtrasadosCobros: number
  /** Unidades distintas con deuda en los dos conceptos del total. */
  unidades: number
  /** Cobros impagos que todavía no vencen: informativo, fuera del total de S4. */
  porVencer: number
  porVencerCobros: number
  /** Moras ya acumuladas en los cobros impagos (snapshot del libro). */
  moras: number
}

/**
 * Deuda por unidad a partir de los cobros FI.
 *
 * `pagos` vacío = cobro impago. Se separa `multa_in` (toda multa impaga cuenta
 * como deuda) del `gasto_comun` ATRASADO: el gasto común del período vigente no
 * es deuda hasta su vencimiento, así que solo suma si `fechaVencimiento < hoy`.
 * El resto de los conceptos (reservas, cuotas extraordinarias) queda en
 * `porVencer` para no inflar el total con ítems que S4 no nombró.
 */
export function deudaDeUnidades(cobros: CobroFI[], hoy: string): DeudaUnidades {
  let multas = 0
  let multasCobros = 0
  let gastosComunesAtrasados = 0
  let gastosComunesAtrasadosCobros = 0
  let porVencer = 0
  let porVencerCobros = 0
  let moras = 0
  const unidades = new Set<string>()

  for (const cobro of cobros) {
    if (cobro.pagos.length > 0) continue
    moras += cobro.moras.reduce((suma, mora) => suma + mora.monto, 0)
    const atrasado = Boolean(cobro.fechaVencimiento && cobro.fechaVencimiento < hoy)
    if (cobro.concepto === "multa_in") {
      multas += cobro.montoBase
      multasCobros += 1
      unidades.add(cobro.unidadId)
    } else if (cobro.concepto === "gasto_comun" && atrasado) {
      gastosComunesAtrasados += cobro.montoBase
      gastosComunesAtrasadosCobros += 1
      unidades.add(cobro.unidadId)
    } else {
      porVencer += cobro.montoBase
      porVencerCobros += 1
    }
  }

  return {
    total: multas + gastosComunesAtrasados,
    multas,
    multasCobros,
    gastosComunesAtrasados,
    gastosComunesAtrasadosCobros,
    unidades: unidades.size,
    porVencer,
    porVencerCobros,
    moras,
  }
}

// --- T5 / S5 · Provisión del mes ---------------------------------------------

export interface ProvisionMes {
  periodo: string
  gastoTotal: number
  fechaEmision: string
  unidades: number
}

/**
 * Provisión del mes: la ÚLTIMA emisión de gasto común (S5). `gastoTotal` es el
 * monto que debiera estar provisionado si los gastos comunes del período están
 * al día, así que no se recalcula desde las líneas.
 */
export function provisionDelMes(emisiones: EmisionGC[]): ProvisionMes | null {
  if (emisiones.length === 0) return null
  const ultima = [...emisiones].sort((a, b) => {
    if (a.fechaEmision !== b.fechaEmision) return b.fechaEmision.localeCompare(a.fechaEmision)
    return b.periodo.localeCompare(a.periodo)
  })[0]
  if (!ultima) return null
  return {
    periodo: ultima.periodo,
    gastoTotal: ultima.gastoTotal,
    fechaEmision: ultima.fechaEmision,
    unidades: ultima.lineas.length,
  }
}

// --- T6 / S6 · Nóminas por pagar ---------------------------------------------

export interface NominasPorPagar {
  cantidad: number
  total: number
  periodo: string | null
  folios: string[]
}

/** Nóminas en estado `borrador`: lo devengado que todavía no está pagado (S6). */
export function nominasEnBorrador(liquidaciones: LiquidacionPL[]): NominasPorPagar {
  const borradores = liquidaciones.filter((l) => l.estado === "borrador")
  return {
    cantidad: borradores.length,
    total: borradores.reduce((suma, l) => suma + l.liquidoAPagar, 0),
    periodo: borradores[0]?.periodo ?? null,
    folios: [...borradores]
      .sort((a, b) => a.folio.localeCompare(b.folio))
      .map((l) => l.folio),
  }
}

// --- T7 / S6 · Gastos mensuales estimados por servicio -----------------------

export interface GrupoServicioGasto {
  servicio: string
  egresos: number
  /** Monto histórico del libro en ese servicio. */
  total: number
  /** Estimación mensual: total histórico / meses con registro. */
  mensual: number
  /** Algún egreso del grupo está marcado como fijo/recurrente. */
  recurrente: boolean
}

export interface GastosPorServicio {
  grupos: GrupoServicioGasto[]
  /** Meses con registro en el libro (base del promedio). */
  meses: number
  totalMensual: number
}

/**
 * Servicios nombrados por S6. La clave busca el servicio en la DESCRIPCIÓN del
 * egreso, que es lo único que el libro guarda del servicio contratado (el
 * `proveedor` viene vacío en los datos sembrados).
 */
const SERVICIOS_NOMBRADOS: { servicio: string; claves: string[] }[] = [
  { servicio: "Luz", claves: ["luz", "electric", "eléctric", "energia", "energía"] },
  { servicio: "Agua", claves: ["agua"] },
  { servicio: "Internet", claves: ["internet", "banda ancha", "wifi"] },
  { servicio: "Telefonía", claves: ["telefon"] },
  {
    servicio: "Mantenciones",
    claves: ["manten", "mantenc", "ascensor", "hidropack", "fachada", "jardin"],
  },
]

/** Respaldo por categoría del libro cuando la descripción no nombra un servicio. */
const SERVICIO_POR_CATEGORIA: Record<string, string> = {
  servicios: "Servicios básicos",
  mantencion: "Mantenciones",
  sueldos: "Remuneraciones",
  administracion: "Administración",
  uso_de_fondo: "Uso de fondo",
  otro: "Otros gastos",
}

/**
 * Clasifica un egreso en un servicio.
 *
 * Solo las categorías que son servicio (`servicios`, `mantencion`) se buscan en
 * la descripción: «Útiles de Aseo» es categoría `otro` y no debe caer en
 * Mantenciones solo por la palabra «aseo».
 */
export function servicioDeEgreso(egreso: EgresoFI): string {
  if (egreso.categoria === "servicios" || egreso.categoria === "mantencion") {
    const texto = egreso.descripcion.toLowerCase()
    const encontrado = SERVICIOS_NOMBRADOS.find((s) =>
      s.claves.some((clave) => texto.includes(clave))
    )
    if (encontrado) return encontrado.servicio
  }
  return SERVICIO_POR_CATEGORIA[egreso.categoria] ?? "Otros gastos"
}

/**
 * Gasto mensual estimado por servicio (S6) sobre el libro completo de egresos.
 *
 * El libro tiene historial, no presupuesto: la estimación es el promedio mensual
 * de lo efectivamente gastado (total del servicio / meses con registro). Se
 * ordena de mayor a menor para que el compromiso grande quede arriba.
 */
export function gastosMensualesPorServicio(egresos: EgresoFI[]): GastosPorServicio {
  const meses = new Set(egresos.map((e) => e.fecha.slice(0, 7)))
  const mesesLibro = Math.max(1, meses.size)
  const acumulado = new Map<string, { total: number; egresos: number; recurrente: boolean }>()

  for (const egreso of egresos) {
    const servicio = servicioDeEgreso(egreso)
    const previo = acumulado.get(servicio) ?? { total: 0, egresos: 0, recurrente: false }
    acumulado.set(servicio, {
      total: previo.total + egreso.monto,
      egresos: previo.egresos + 1,
      recurrente: previo.recurrente || egreso.esRecurrente,
    })
  }

  const grupos: GrupoServicioGasto[] = [...acumulado.entries()]
    .map(([servicio, datos]) => ({
      servicio,
      egresos: datos.egresos,
      total: datos.total,
      mensual: datos.total / mesesLibro,
      recurrente: datos.recurrente,
    }))
    .sort((a, b) => b.mensual - a.mensual)

  return {
    grupos,
    meses: mesesLibro,
    totalMensual: grupos.reduce((suma, grupo) => suma + grupo.mensual, 0),
  }
}

// --- T8 / S8 · Visitas técnicas del período ----------------------------------

/**
 * Ventana de las visitas técnicas. «Del período» = los últimos 90 días del
 * libro de visitas técnicas, que es la actividad reciente del edificio; el
 * período del gasto común (`YYYY-MM`) no sirve acá porque la visita se agenda
 * cuando el proveedor puede, no cuando se emite el gasto.
 */
export const DIAS_PERIODO_VISITAS = 90

export interface VisitasDelPeriodo {
  visitas: VisitaTecnicaPE[]
  desde: string
}

export function visitasTecnicasDelPeriodo(
  visitas: VisitaTecnicaPE[],
  hoy: string,
  dias = DIAS_PERIODO_VISITAS
): VisitasDelPeriodo {
  const desde = new Date(new Date(`${hoy}T00:00:00`).getTime() - dias * MS_DIA)
    .toISOString()
    .slice(0, 10)
  return {
    desde,
    visitas: visitas
      .filter((v) => v.fecha >= desde && v.fecha <= hoy)
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
  }
}

// --- Portada operativa del residente (D1) ------------------------------------

export interface CuentaPropia {
  /** Cobros impagos de sus unidades: capital + moras ya aplicadas. */
  pendiente: number
  cobros: number
  vencidos: number
  proximoVencimiento: string | null
}

/** Estado de cuenta del residente: solo cobros de sus unidades (ABAC de la ruta). */
export function cuentaPropia(cobros: CobroFI[], hoy: string): CuentaPropia {
  let pendiente = 0
  let impagos = 0
  let vencidos = 0
  let proximoVencimiento: string | null = null

  for (const cobro of cobros) {
    if (cobro.pagos.length > 0) continue
    impagos += 1
    pendiente += cobro.montoBase + cobro.moras.reduce((suma, mora) => suma + mora.monto, 0)
    if (cobro.fechaVencimiento && cobro.fechaVencimiento < hoy) {
      vencidos += 1
    } else if (
      cobro.fechaVencimiento &&
      (proximoVencimiento === null || cobro.fechaVencimiento < proximoVencimiento)
    ) {
      proximoVencimiento = cobro.fechaVencimiento
    }
  }

  return { pendiente, cobros: impagos, vencidos, proximoVencimiento }
}

/** Reservas confirmadas que todavía no ocurren (RA). */
export function reservasProximas(reservas: ReservaRA[], hoy: string): number {
  return reservas.filter((r) => r.fecha >= hoy && r.estado === "confirmada").length
}
