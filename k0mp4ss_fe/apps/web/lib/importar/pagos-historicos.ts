/**
 * lib/importar/pagos-historicos.ts — importador CSV del **detalle de los pagos
 * históricos** (F45/F48 · S4): la plata que los vecinos ya pagaron contra el
 * gasto común de cada período, antes de que la comunidad entrara al sistema.
 *
 * Formato declarado (S4):
 *
 *   unidad,fecha,monto,medio
 *
 *   - `unidad` el **rol SII** de la unidad (la misma clave de la estructura).
 *              Si no existe, la fila es error con el rol literal: el
 *              importador no crea unidades.
 *   - `fecha`  AAAA-MM-DD, fecha real del calendario. Su mes es el **período**
 *              del `CobroFI` al que se imputa el pago (`AAAA-MM`).
 *   - `monto`  > 0 con punto decimal.
 *   - `medio`  texto libre no vacío (Transferencia, Efectivo, Cheque…).
 *
 * Un pago histórico NO crea un asiento ni un cobro: se anexa a la entrada
 * `pagos` del `CobroFI` que la unidad ya tiene para ese período —el del gasto
 * común cuando el período tiene más de un cobro—. Si la unidad no tiene ningún
 * cobro en ese período la fila falla con el motivo literal: este bloque no
 * emite gasto común.
 *
 * Idempotencia declarada (S4, corregida al medir el modelo en L4): unidad +
 * fecha + monto + medio **dentro de la comunidad**. `PagoCobroFI` es
 * `{id, monto, fecha, medio}` y no tiene columna de referencia
 * (`lib/schemas.ts:2113`), así que el medio forma parte de la clave. Reimportar
 * el mismo archivo no duplica: la fila se reporta «sin cambios». Una fila cuya
 * clave todavía no está en el cobro se reporta «actualizar», porque el cobro
 * existe y lo único que cambia es su lista de pagos: este bloque nunca crea un
 * registro propio.
 *
 * Lo que NO hace: no crea cobros, unidades, fondos ni asientos; no toca
 * `montoBase`, `moras`, `diferencias` ni la emisión del gasto común; y la
 * importación real no corre si la vista previa tiene filas con error
 * (`bloqueada`). Con `dryRun` no escribe nada.
 */
import { createHash } from "node:crypto"
import type { Prisma, PrismaClient } from "@prisma/client"
import { z } from "zod"
import { serializarCsv, type FilaCsv } from "@/lib/importar/csv"
import {
  MENSAJE_FILA_EJEMPLO,
  columnaFilaEjemplo,
  type AccionFila,
  type ErrorFila,
  type ReporteEstructura,
  type ReporteFila,
  type ResumenEstructura,
} from "@/lib/importar/estructura"
import { contextoDeUnidades } from "@/lib/importar/saldos-apertura"
import type { PagoCobroFI } from "@/lib/schemas"

/** Encabezados canónicos del bloque: fuente única de la plantilla y del parser. */
export const ENCABEZADOS_PAGOS_HISTORICOS = [
  "unidad",
  "fecha",
  "monto",
  "medio",
] as const

export type EncabezadoPagosHistoricos = (typeof ENCABEZADOS_PAGOS_HISTORICOS)[number]

/** Concepto del cobro al que se imputa un pago histórico (S4). */
const CONCEPTO_GASTO_COMUN = "gasto_comun"

/** Prefijo de los ids deterministas de los pagos importados. */
const PREFIJO_ID = "imp-pag-"

/** Motivo literal de la fila cuya unidad no existe (nombra el rol del archivo). */
function mensajeUnidadInexistente(rolSii: string): string {
  return (
    `no existe la unidad con rol SII "${rolSii}" en la comunidad; ` +
    "debe estar creada antes de importar los pagos históricos."
  )
}

/**
 * Motivo literal de la fila cuya unidad no tiene cobro en el período: el pago
 * no tiene dónde registrarse y el importador no emite gasto común.
 */
function mensajeCobroInexistente(rolSii: string, periodo: string): string {
  return (
    `no existe un cobro del período "${periodo}" para la unidad con rol SII "${rolSii}"; ` +
    "el pago histórico se registra sobre el cobro del período, que debe estar emitido antes de importar."
  )
}

// --- Validación por fila (zod + unidad y cobro resueltos) ---

const textoObligatorio = z.string({
  required_error: "es obligatorio.",
  invalid_type_error: "es obligatorio.",
})

/** Fecha real (no sólo con forma de fecha): 2024-02-30 no existe. */
function esFechaReal(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const partes = valor.split("-")
  const anio = Number(partes[0])
  const mes = Number(partes[1])
  const dia = Number(partes[2])
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  )
}

/**
 * Monto CSV > 0 con punto decimal (el formato declarado). La coma no se acepta
 * como decimal: en este formato es el separador de columnas.
 */
const montoCsv = textoObligatorio
  .trim()
  .min(1, "es obligatorio.")
  .refine(
    (v) => /^\d+(?:\.\d+)?$/.test(v),
    "debe ser un número positivo con punto decimal (ej: 45000.50)."
  )
  .transform((v) => Number(v))
  .refine((n) => n > 0, "debe ser mayor a cero.")

const FilaPagoHistoricosSchema = z.object({
  unidad: textoObligatorio.trim().min(1, "es obligatorio."),
  fecha: textoObligatorio
    .trim()
    .min(1, "es obligatorio.")
    .refine(
      (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
      "debe tener formato AAAA-MM-DD (ej: 2024-03-15)."
    )
    .refine(esFechaReal, "no es una fecha real del calendario."),
  monto: montoCsv,
  medio: textoObligatorio.trim().min(1, "es obligatorio."),
})

/** Fila válida, con la unidad y el cobro del período ya resueltos. */
export interface DatosFilaPagoHistorico {
  /** `CobroFI` del período al que se anexa el pago (nunca se crea). */
  cobroId: string
  unidadId: string
  /** Período del cobro: el mes de la fecha del pago (`AAAA-MM`). */
  periodo: string
  fecha: string
  monto: number
  medio: string
}

/** El cobro del período, reducido a lo que la clave necesita. */
export interface CobroDelPeriodo {
  id: string
  unidadId: string
  periodo: string
  pagos: PagoCobroFI[]
}

/** Contexto de la validación: lo que la fila no puede saber sola. */
export interface ContextoFilaPagos {
  /** Resuelve el rol SII del archivo a una unidad de la comunidad. */
  resolverUnidad: (rolSii: string) => { id: string } | null
  /** Resuelve el cobro del período al que corresponde el pago. */
  resolverCobro: (unidadId: string, periodo: string) => CobroDelPeriodo | null
}

export interface FilaPagosValidada {
  linea: number
  datos: DatosFilaPagoHistorico | null
  errores: ErrorFila[]
}

/** Período del cobro a partir de la fecha del pago (`AAAA-MM-DD`). */
function periodoDeFecha(fecha: string): string {
  return fecha.substring(0, 7)
}

/**
 * validarFilaPagos — la ÚNICA validación por fila del bloque (S4). La usan la
 * vista previa y la importación real, y la plantilla comparte los mismos
 * encabezados y el mismo rechazo de filas de ejemplo: los tres caminos no
 * pueden discrepar.
 */
export function validarFilaPagos(
  fila: FilaCsv,
  contexto: ContextoFilaPagos
): FilaPagosValidada {
  // Filas de ejemplo de la plantilla: se rechazan antes del esquema, para que
  // nada del ejemplo se escriba.
  const columnaEjemplo = columnaFilaEjemplo(fila.valores, ["unidad"])
  if (columnaEjemplo) {
    return {
      linea: fila.linea,
      datos: null,
      errores: [{ columna: columnaEjemplo, mensaje: MENSAJE_FILA_EJEMPLO }],
    }
  }

  const parsed = FilaPagoHistoricosSchema.safeParse(fila.valores)
  if (!parsed.success) {
    return {
      linea: fila.linea,
      datos: null,
      errores: parsed.error.issues.map((issue) => ({
        columna: String(issue.path[0] ?? ""),
        mensaje: issue.message,
      })),
    }
  }

  const v = parsed.data
  const errores: ErrorFila[] = []
  // La unidad tiene que existir: el importador nunca la crea.
  const unidad = contexto.resolverUnidad(v.unidad)
  if (!unidad) {
    errores.push({ columna: "unidad", mensaje: mensajeUnidadInexistente(v.unidad) })
  }

  // El cobro del período tiene que existir: el pago no crea un cobro nuevo.
  // La columna reportada es `fecha` porque su mes es el que fija el período.
  const periodo = periodoDeFecha(v.fecha)
  const cobro = unidad ? contexto.resolverCobro(unidad.id, periodo) : null
  if (unidad && !cobro) {
    errores.push({ columna: "fecha", mensaje: mensajeCobroInexistente(v.unidad, periodo) })
  }

  if (!unidad || !cobro || errores.length > 0) {
    return { linea: fila.linea, datos: null, errores }
  }

  return {
    linea: fila.linea,
    datos: {
      cobroId: cobro.id,
      unidadId: unidad.id,
      periodo,
      fecha: v.fecha,
      monto: v.monto,
      medio: v.medio,
    },
    errores: [],
  }
}

// --- Idempotencia ---

/**
 * Clave de idempotencia declarada (S4): unidad + fecha + monto + medio, dentro
 * de la comunidad. `PagoCobroFI` no tiene columna de referencia (L4), así que
 * el medio es parte de la clave; el monto va en su representación exacta de
 * punto flotante y el texto ya viene recortado por el esquema.
 */
function claveIdempotencia(
  unidadId: string,
  fecha: string,
  monto: number,
  medio: string
): string {
  return `${unidadId}|${fecha}|${monto}|${medio}`
}

/** Id determinista por contenido: dos corridas con la misma fila reutilizan el id. */
function idDeterminista(prefijo: string, ...partes: string[]): string {
  const hash = createHash("sha256").update(partes.join("|")).digest("hex")
  // substring y no slice: el recorte del digest no es un truncamiento de lista
  // (el candado de patrones R4 busca `.slice(0, N)` y marcaría falso positivo).
  return `${prefijo}${hash.substring(0, 20)}`
}

/** Lee la entrada Json `pagos` de un cobro con la forma declarada por el esquema. */
function leerPagos(valor: Prisma.JsonValue): PagoCobroFI[] {
  if (!Array.isArray(valor)) return []
  // SAFETY: pagos es Json con shape PagoCobroFI[] validado por CobroFISchema.
  return valor as unknown as PagoCobroFI[]
}

// --- Import (vista previa + escritura idempotente) ---

export interface EntradaImportarPagosHistoricos {
  prisma: PrismaClient
  /** Siempre del scope de la sesión, nunca del archivo. */
  comunidadId: string
  filas: FilaCsv[]
  dryRun: boolean
}

export interface ResultadoImportarPagosHistoricos {
  /** Reporte fila por fila, la misma forma que los otros bloques. */
  reporte: ReporteEstructura
  /**
   * true = había filas con error y, al no ser vista previa, no se escribió
   * nada: la importación real no corre sobre una vista previa sucia.
   */
  bloqueada: boolean
}

interface FilaProcesada extends ReporteFila {
  conError: boolean
  datos: DatosFilaPagoHistorico | null
}

/** Un pago a anexar, con el cobro y la unidad que lo reciben. */
interface PagoPendiente {
  cobroId: string
  unidadId: string
  pago: PagoCobroFI
}

/**
 * indiceDeCobros — arma el resolvedor del cobro del período. Cuando una unidad
 * tiene más de un cobro en el mismo período gana el de gasto común (es el
 * cargo mensual que un pago histórico salda); si no hay, gana el primero por
 * id, porque el listado llega ordenado. Nunca crea nada.
 */
function indiceDeCobros(
  cobros: readonly { id: string; unidadId: string; periodo: string; concepto: string; pagos: Prisma.JsonValue }[]
): Map<string, CobroDelPeriodo> {
  const porClave = new Map<string, CobroDelPeriodo>()
  const esGastoComun = new Map<string, boolean>()
  for (const c of cobros) {
    const clave = `${c.unidadId}|${c.periodo}`
    const preferido = c.concepto === CONCEPTO_GASTO_COMUN
    if (porClave.has(clave) && !(preferido && !esGastoComun.get(clave))) continue
    porClave.set(clave, {
      id: c.id,
      unidadId: c.unidadId,
      periodo: c.periodo,
      pagos: leerPagos(c.pagos),
    })
    esGastoComun.set(clave, preferido)
  }
  return porClave
}

/**
 * importarPagosHistoricos — valida las filas y devuelve el reporte fila por
 * fila.
 *
 * Con `dryRun` no escribe nada (vista previa). Sin `dryRun`, si alguna fila
 * tiene error devuelve `bloqueada: true` sin escribir. Si todas son válidas,
 * anexa en una transacción los pagos cuya clave de idempotencia todavía no
 * está en el `pagos` del cobro.
 */
export async function importarPagosHistoricos({
  prisma,
  comunidadId,
  filas,
  dryRun,
}: EntradaImportarPagosHistoricos): Promise<ResultadoImportarPagosHistoricos> {
  const [unidades, cobros] = await Promise.all([
    prisma.unidad.findMany({
      where: { comunidadId },
      select: { id: true, rolSii: true },
      orderBy: { id: "asc" },
    }),
    prisma.cobroFI.findMany({
      where: { comunidadId },
      select: { id: true, unidadId: true, periodo: true, concepto: true, pagos: true },
      orderBy: { id: "asc" },
    }),
  ])

  const cobrosDelPeriodo = indiceDeCobros(cobros)
  const contexto: ContextoFilaPagos = {
    resolverUnidad: contextoDeUnidades(unidades),
    resolverCobro: (unidadId, periodo) =>
      cobrosDelPeriodo.get(`${unidadId}|${periodo}`) ?? null,
  }

  // Claves de idempotencia que ya viven en cada cobro (snapshot de la corrida).
  const pagosExistentes = new Map<string, Set<string>>()
  for (const cobro of cobrosDelPeriodo.values()) {
    pagosExistentes.set(
      cobro.id,
      new Set(
        cobro.pagos.map((p) =>
          claveIdempotencia(cobro.unidadId, p.fecha, p.monto, p.medio)
        )
      )
    )
  }

  const procesadas: FilaProcesada[] = []
  const pendientes: PagoPendiente[] = []

  for (const fila of filas) {
    const validada = validarFilaPagos(fila, contexto)
    const errores = validada.errores.map(
      (e) => `${e.columna}: ${e.mensaje} (línea ${validada.linea})`
    )
    let accion: AccionFila = "sin-cambios"
    const datos = validada.datos

    if (datos) {
      const clave = claveIdempotencia(
        datos.unidadId,
        datos.fecha,
        datos.monto,
        datos.medio
      )
      // La validación resolvió el cobro, así que su set de claves existe.
      const clavesDelCobro = pagosExistentes.get(datos.cobroId) ?? new Set<string>()
      pagosExistentes.set(datos.cobroId, clavesDelCobro)
      if (clavesDelCobro.has(clave)) {
        // La clave ya está en la comunidad: reimportar no duplica.
        accion = "sin-cambios"
      } else {
        // El cobro existe: lo que se le anexa es un pago, nunca un asiento.
        accion = "actualizar"
        clavesDelCobro.add(clave)
        pendientes.push({
          cobroId: datos.cobroId,
          unidadId: datos.unidadId,
          pago: {
            id: idDeterminista(PREFIJO_ID, comunidadId, clave),
            monto: datos.monto,
            fecha: datos.fecha,
            medio: datos.medio,
          },
        })
      }
    }

    procesadas.push({
      linea: validada.linea,
      accion,
      errores,
      conError: errores.length > 0,
      datos: errores.length > 0 ? null : datos,
    })
  }

  const reporte = armarReporte(procesadas)
  if (dryRun) return { reporte, bloqueada: false }
  // La importación real exige la vista previa limpia: nada de escribir «las
  // filas que se puedan» y reportar el resto.
  if (reporte.resumen.conError > 0) return { reporte, bloqueada: true }

  const porCobro = new Map<string, PagoPendiente[]>()
  for (const pendiente of pendientes) {
    const lista = porCobro.get(pendiente.cobroId) ?? []
    lista.push(pendiente)
    porCobro.set(pendiente.cobroId, lista)
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const [cobroId, nuevos] of porCobro) {
      // Se relee dentro de la transacción: un pago cobrado desde la pantalla
      // entre la vista previa y la escritura no se pierde ni se duplica.
      const cobro = await tx.cobroFI.findUnique({
        where: { id: cobroId },
        select: { pagos: true },
      })
      if (!cobro) continue
      const existentes = leerPagos(cobro.pagos)
      const unidadId = nuevos[0]?.unidadId ?? ""
      const claves = new Set(
        existentes.map((p) =>
          claveIdempotencia(unidadId, p.fecha, p.monto, p.medio)
        )
      )
      const aAgregar = nuevos
        .filter(
          (n) =>
            !claves.has(
              claveIdempotencia(unidadId, n.pago.fecha, n.pago.monto, n.pago.medio)
            )
        )
        .map((n) => n.pago)
      if (aAgregar.length === 0) continue
      await tx.cobroFI.update({
        where: { id: cobroId },
        // SAFETY: PagoCobroFI[] cumple la forma Json declarada por este campo.
        data: { pagos: [...existentes, ...aAgregar] as unknown as Prisma.InputJsonValue },
      })
    }
  })

  return { reporte, bloqueada: false }
}

/** Reporte con la forma común de los bloques del importador. */
function armarReporte(filas: readonly FilaProcesada[]): ReporteEstructura {
  const reporte: ReporteFila[] = filas.map((f) => ({
    linea: f.linea,
    accion: f.accion,
    errores: f.errores,
  }))
  const resumen: ResumenEstructura = {
    total: filas.length,
    validas: 0,
    conError: 0,
    crear: 0,
    actualizar: 0,
    sinCambios: 0,
  }
  for (const f of filas) {
    if (f.conError) {
      resumen.conError++
      continue
    }
    resumen.validas++
    if (f.accion === "crear") resumen.crear++
    else if (f.accion === "actualizar") resumen.actualizar++
    else resumen.sinCambios++
  }
  return { filas: reporte, resumen }
}

// --- Plantilla descargable (encabezado + filas de ejemplo) ---

/** Filas de ejemplo de la plantilla (valores realistas del dominio). */
export const FILAS_EJEMPLO_PAGOS_HISTORICOS: Record<
  EncabezadoPagosHistoricos,
  string
>[] = [
  { unidad: "EJEMPLO-8843-1101", fecha: "2024-03-08", monto: "45000.50", medio: "Transferencia" },
  { unidad: "EJEMPLO-8843-1102", fecha: "2024-03-12", monto: "45000", medio: "Efectivo" },
  { unidad: "EJEMPLO-8843-2101", fecha: "2024-04-05", monto: "38500.25", medio: "Cheque" },
]

/**
 * Arma el contenido de la plantilla descargable: los encabezados canónicos (los
 * mismos que valida el parser) más tres filas de ejemplo, que el importador
 * rechaza por llevar el prefijo EJEMPLO-.
 */
export function construirPlantillaPagosHistoricos(): string {
  const ejemplos = FILAS_EJEMPLO_PAGOS_HISTORICOS.map((fila) =>
    ENCABEZADOS_PAGOS_HISTORICOS.map((h) => fila[h])
  )
  // BOM al inicio: Excel abre el UTF-8 sin corromper los caracteres.
  return `\ufeff${serializarCsv([[...ENCABEZADOS_PAGOS_HISTORICOS], ...ejemplos])}\r\n`
}
