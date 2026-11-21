/**
 * lib/importar/saldos-apertura.ts — importador CSV de los **saldos de apertura**
 * (T1 · S1/S2/S4): la deuda que la comunidad ya tenía a la fecha en que pasa de
 * la planilla al sistema.
 *
 * El saldo es DEUDA COBRABLE, no un número: cada fila escribe un `CobroFI` de
 * concepto `saldo_apertura` imputado al fondo de gasto común ACTIVO de la
 * comunidad, con `montoBase` = la deuda, sin pagos y sin moras. No hay modelo
 * nuevo ni rama especial: los lectores que ya existen (morosidad, corte de
 * servicios, estado de cuenta) lo ven porque leen cobros.
 *
 * Formato declarado (S2):
 *
 *   unidad,fecha_corte,monto
 *
 *   - `unidad`      el **rol SII** de la unidad (la misma clave de la
 *                   estructura). Si no existe, la fila es error con el rol
 *                   literal: el importador no crea unidades.
 *   - `fecha_corte` AAAA-MM-DD, fecha real y no futura. El **período del cobro**
 *                   es el mes de esa fecha y es la fecha con la que el cargo
 *                   vence: la deuda que ya existía a ese corte ya estaba
 *                   vencida (por eso cuenta en `morosidadPorUnidad` sin ramas).
 *   - `monto`       > 0 con punto decimal.
 *
 * Clave de idempotencia (S2): `(unidad, período del corte)` **dentro de la
 * comunidad**. El id del cargo es determinista por
 * `comunidadId + unidadId + período`, así que reimportar el mismo archivo no
 * duplica: la fila existente se reporta «sin cambios» o, si el monto declarado
 * cambió, «actualizar».
 *
 * La regla que evita cobrar dos veces (S3): si la comunidad ya emitió gasto
 * común para un período igual o anterior al del corte, el saldo contaría dos
 * veces el mismo mes y la importación se rechaza ENTERA —también en la vista
 * previa (`dryRun`), para que el administrador lo vea antes de cargar—. Sin
 * fondo de gasto común activo también se rechaza entera: el cargo no tendría
 * dónde imputarse.
 *
 * Lo que NO hace: no crea unidades, ni fondos, ni emisiones; no toca pagos,
 * moras ni emisiones del gasto común; y la importación real no corre si la
 * vista previa tiene filas con error (devuelve el reporte con `bloqueada`).
 */
import { createHash } from "node:crypto"
import { Prisma, type PrismaClient } from "@prisma/client"
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
import { hoyISO } from "@/lib/date-utils"

/** Encabezados canónicos del bloque: fuente única de la plantilla y del parser. */
export const ENCABEZADOS_SALDOS = ["unidad", "fecha_corte", "monto"] as const

export type EncabezadoSaldos = (typeof ENCABEZADOS_SALDOS)[number]

/** Concepto del `CobroFI` que representa la deuda de apertura (S1). */
export const CONCEPTO_SALDO_APERTURA = "saldo_apertura"

/**
 * Módulo de origen del cargo. El saldo entra por el módulo financiero (FI) como
 * cualquier cargo de la comunidad: no hay un cuarto origen que inventar.
 */
const ORIGEN_MODULO = "FI"

/** Tipo del `FondoFI` al que se imputa la deuda (S1). */
const TIPO_FONDO_GASTO_COMUN = "gasto_comun"

/** Prefijo de los ids deterministas de los cargos de apertura. */
const PREFIJO_ID = "imp-sal-"

/** Texto literal del error de la fecha futura (lo cita la spec). */
const MENSAJE_FECHA_FUTURA =
  "no puede ser futura: el saldo de apertura es la deuda que ya existía al corte."

/** Descripción con la que nace (y se actualiza) el cargo de apertura. */
function descripcionDelCargo(fechaCorte: string): string {
  return `Saldo de apertura al corte ${fechaCorte}`
}

/** Motivo literal de la fila cuya unidad no existe (nombra el rol del archivo). */
function mensajeUnidadInexistente(rolSii: string): string {
  return `no existe la unidad con rol SII "${rolSii}" en la comunidad; debe estar creada antes de importar los saldos de apertura.`
}

// --- Validación por fila (zod + unidad resuelta) ---

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
    "debe ser un número positivo con punto decimal (ej: 15500.50)."
  )
  .transform((v) => Number(v))
  .refine((n) => n > 0, "debe ser mayor a cero.")

const FilaSaldoSchema = z.object({
  unidad: textoObligatorio.trim().min(1, "es obligatorio."),
  fecha_corte: textoObligatorio
    .trim()
    .min(1, "es obligatorio.")
    .refine(
      (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
      "debe tener formato AAAA-MM-DD (ej: 2024-03-31)."
    )
    .refine(esFechaReal, "no es una fecha real del calendario."),
  monto: montoCsv,
})

/** Fila válida, con la unidad ya resuelta a su id. */
export interface DatosFilaSaldos {
  unidadId: string
  /** Período del cobro: el mes de la fecha de corte (`AAAA-MM`). */
  periodo: string
  fechaCorte: string
  monto: number
}

/** Contexto de la validación: lo que la fila no puede saber sola. */
export interface ContextoFilaSaldos {
  /** Hoy en AAAA-MM-DD (inyectable: el borde de fecha futura se pinea en el test). */
  hoy: string
  /** Resuelve el rol SII del archivo a una unidad de la comunidad. */
  resolverUnidad: (rolSii: string) => { id: string } | null
}

export interface FilaSaldosValidada {
  linea: number
  datos: DatosFilaSaldos | null
  errores: ErrorFila[]
}

/** Período del cargo a partir de una fecha de corte válida (`AAAA-MM-DD`). */
function periodoDeCorte(fechaCorte: string): string {
  return fechaCorte.substring(0, 7)
}

/**
 * validarFilaSaldos — la ÚNICA validación por fila del bloque (S4). La usan la
 * vista previa y la importación real, y la plantilla comparte los mismos
 * encabezados y el mismo rechazo de filas de ejemplo: los tres caminos no
 * pueden discrepar.
 */
export function validarFilaSaldos(
  fila: FilaCsv,
  contexto: ContextoFilaSaldos
): FilaSaldosValidada {
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

  const parsed = FilaSaldoSchema.safeParse(fila.valores)
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
  // El corte no puede ser futuro: la deuda que se carga ya existía (S2).
  if (v.fecha_corte > contexto.hoy) {
    errores.push({ columna: "fecha_corte", mensaje: MENSAJE_FECHA_FUTURA })
  }
  // La unidad tiene que existir: el importador nunca la crea (S2).
  const unidad = contexto.resolverUnidad(v.unidad)
  if (!unidad) {
    errores.push({ columna: "unidad", mensaje: mensajeUnidadInexistente(v.unidad) })
  }
  if (!unidad || errores.length > 0) {
    return { linea: fila.linea, datos: null, errores }
  }

  return {
    linea: fila.linea,
    datos: {
      unidadId: unidad.id,
      periodo: periodoDeCorte(v.fecha_corte),
      fechaCorte: v.fecha_corte,
      monto: v.monto,
    },
    errores: [],
  }
}

/**
 * contextoDeUnidades — arma el resolvedor de la columna `unidad` por rol SII.
 * Compara el texto recortado y, si dos unidades de la comunidad comparten rol
 * (la columna no es unique), gana la primera del listado, que llega ordenado
 * por id: la resolución es determinista. Nunca crea nada.
 */
export function contextoDeUnidades(
  unidades: readonly { id: string; rolSii: string }[]
): (rolSii: string) => { id: string } | null {
  const porRol = new Map<string, { id: string }>()
  for (const unidad of unidades) {
    const rol = unidad.rolSii.trim()
    if (rol === "" || porRol.has(rol)) continue
    porRol.set(rol, { id: unidad.id })
  }
  return (rolSii) => porRol.get(rolSii.trim()) ?? null
}

// --- Idempotencia ---

/**
 * Clave de idempotencia declarada (S2): unidad + período del corte, dentro de
 * la comunidad. El período es el mes del corte, no la fecha: dos cortes del
 * mismo mes son el mismo período y no pueden convivir dos cargos de apertura.
 */
function claveIdempotencia(unidadId: string, periodo: string): string {
  return `${unidadId}|${periodo}`
}

/** Id determinista por contenido: dos corridas con la misma fila reutilizan el id. */
function idDeterminista(prefijo: string, ...partes: string[]): string {
  const hash = createHash("sha256").update(partes.join("|")).digest("hex")
  // substring y no slice: el recorte del digest no es un truncamiento de lista
  // (el candado de patrones R4 busca `.slice(0, N)` y marcaría falso positivo).
  return `${prefijo}${hash.substring(0, 20)}`
}

// --- Import (vista previa + escritura idempotente) ---

export interface EntradaImportarSaldos {
  prisma: PrismaClient
  /** Siempre del scope de la sesión, nunca del archivo. */
  comunidadId: string
  filas: FilaCsv[]
  dryRun: boolean
  /** Hoy en AAAA-MM-DD; por defecto el del servidor. */
  hoy?: string
}

/**
 * Motivo por el que la importación se rechaza ENTERA antes de mirar las filas.
 * La ruta traduce cada código a su mensaje literal; el módulo aporta el dato
 * que el mensaje necesita nombrar (el período ya cobrado).
 */
export type RechazoDeComunidad =
  | { codigo: "sin-fondo-gasto-comun" }
  | { codigo: "periodo-ya-cobrado"; periodo: string }

export type ResultadoImportarSaldos =
  | { tipo: "rechazo"; rechazo: RechazoDeComunidad }
  | {
      /** Reporte fila por fila, la misma forma que los otros bloques. */
      tipo: "reporte"
      reporte: ReporteEstructura
      /**
       * true = había filas con error y, al no ser vista previa, no se escribió
       * nada: la importación real no corre sobre una vista previa sucia.
       */
      bloqueada: boolean
    }

/** Un cargo de apertura ya guardado, reducido a lo que la clave necesita. */
interface SaldoExistente {
  id: string
  monto: number
  fondoId: string
}

interface FilaProcesada extends ReporteFila {
  conError: boolean
  datos: DatosFilaSaldos | null
  id: string
}

/**
 * Período más alto que declaran las filas, para la compuerta de S3. Sale del
 * texto del archivo (formato y fecha real), sin exigir el resto de la fila: el
 * rechazo por doble cobro es de la IMPORTACIÓN, no de cada fila válida.
 */
function periodoMaximoDeclarado(filas: readonly FilaCsv[]): string | null {
  let maximo: string | null = null
  for (const fila of filas) {
    const fecha = (fila.valores.fecha_corte ?? "").trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !esFechaReal(fecha)) continue
    const periodo = periodoDeCorte(fecha)
    if (maximo === null || periodo > maximo) maximo = periodo
  }
  return maximo
}

/**
 * importarSaldos — valida las filas y devuelve el reporte fila por fila.
 *
 * Antes de las filas corren las dos compuertas de comunidad (S1/S3): sin fondo
 * de gasto común activo, o con gasto común ya emitido para el período del corte
 * o uno anterior, no hay importación ni vista previa: devuelve un rechazo y no
 * escribe nada.
 *
 * Con `dryRun` no escribe nada (vista previa). Sin `dryRun`, si alguna fila
 * tiene error devuelve `bloqueada: true` sin escribir. Si todas son válidas,
 * escribe en una transacción: la clave `(unidad, período)` ya existe → el mismo
 * cargo se actualiza; no existe → se crea con id determinista.
 */
export async function importarSaldos({
  prisma,
  comunidadId,
  filas,
  dryRun,
  hoy = hoyISO(),
}: EntradaImportarSaldos): Promise<ResultadoImportarSaldos> {
  // S1: el saldo se imputa al fondo de gasto común ACTIVO. Si no hay, el cargo
  // no tendría dónde nacer y la importación se rechaza entera.
  const fondo = await prisma.fondoFI.findFirst({
    where: { comunidadId, tipo: TIPO_FONDO_GASTO_COMUN, activo: true },
    orderBy: { id: "asc" },
    select: { id: true },
  })
  if (!fondo) {
    return { tipo: "rechazo", rechazo: { codigo: "sin-fondo-gasto-comun" } }
  }

  // S3: si la comunidad ya emitió gasto común para el período del corte o uno
  // anterior, el saldo de apertura contaría dos veces ese mes. El rechazo nombra
  // el período emitido más reciente: es el que el administrador reconoce.
  const periodoDelCorte = periodoMaximoDeclarado(filas)
  if (periodoDelCorte !== null) {
    const yaCobrado = await prisma.emisionGC.findFirst({
      where: { comunidadId, periodo: { lte: periodoDelCorte } },
      orderBy: { periodo: "desc" },
      select: { periodo: true },
    })
    if (yaCobrado) {
      return {
        tipo: "rechazo",
        rechazo: { codigo: "periodo-ya-cobrado", periodo: yaCobrado.periodo },
      }
    }
  }

  const [unidades, existentes] = await Promise.all([
    prisma.unidad.findMany({
      where: { comunidadId },
      select: { id: true, rolSii: true },
      orderBy: { id: "asc" },
    }),
    prisma.cobroFI.findMany({
      where: { comunidadId, concepto: CONCEPTO_SALDO_APERTURA },
      select: { id: true, unidadId: true, periodo: true, montoBase: true, fondoId: true },
    }),
  ])

  const saldos = new Map<string, SaldoExistente>()
  for (const c of existentes) {
    saldos.set(claveIdempotencia(c.unidadId, c.periodo), {
      id: c.id,
      monto: c.montoBase,
      fondoId: c.fondoId,
    })
  }

  const contexto: ContextoFilaSaldos = {
    hoy,
    resolverUnidad: contextoDeUnidades(unidades),
  }

  const procesadas: FilaProcesada[] = []
  for (const fila of filas) {
    const validada = validarFilaSaldos(fila, contexto)
    const errores = validada.errores.map(
      (e) => `${e.columna}: ${e.mensaje} (línea ${validada.linea})`
    )
    let accion: AccionFila = "sin-cambios"
    let id = ""
    let datos: DatosFilaSaldos | null = validada.datos

    if (validada.datos) {
      const d = validada.datos
      const clave = claveIdempotencia(d.unidadId, d.periodo)
      const existente = saldos.get(clave)
      if (existente) {
        // La clave ya está en la comunidad: la fila es ese mismo cargo. Si el
        // monto declarado cambió, el cargo se actualiza; si no, no hay nada
        // que escribir (reimportar el archivo no duplica).
        id = existente.id
        const igual = existente.monto === d.monto && existente.fondoId === fondo.id
        accion = igual ? "sin-cambios" : "actualizar"
      } else {
        accion = "crear"
        id = idDeterminista(PREFIJO_ID, comunidadId, d.unidadId, d.periodo)
      }
      // Duplicados de la misma clave dentro del archivo: la fila siguiente se
      // compara contra lo que esta deja, para no reportar dos altas.
      saldos.set(clave, { id, monto: d.monto, fondoId: fondo.id })
    } else {
      datos = null
    }

    procesadas.push({
      linea: validada.linea,
      accion,
      errores,
      conError: errores.length > 0,
      datos,
      id,
    })
  }

  const reporte = armarReporte(procesadas)
  if (dryRun) return { tipo: "reporte", reporte, bloqueada: false }
  // La importación real exige la vista previa limpia: nada de escribir «las
  // filas que se puedan» y reportar el resto.
  if (reporte.resumen.conError > 0) {
    return { tipo: "reporte", reporte, bloqueada: true }
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const p of procesadas) {
      if (!p.datos || p.accion === "sin-cambios") continue
      const d = p.datos
      if (p.accion === "crear") {
        // S1: un cargo FI cobrable de punta a punta. `lineas` nulo es la forma
        // de un cobro de un solo concepto (`lineasDeCobro` la sintetiza desde
        // `concepto` + `montoBase`), y vence en el corte: la deuda ya existía.
        await tx.cobroFI.create({
          data: {
            id: p.id,
            comunidadId,
            unidadId: d.unidadId,
            periodo: d.periodo,
            concepto: CONCEPTO_SALDO_APERTURA,
            origenModulo: ORIGEN_MODULO,
            origenRef: null,
            fondoId: fondo.id,
            descripcion: descripcionDelCargo(d.fechaCorte),
            montoBase: d.monto,
            lineas: Prisma.DbNull,
            fechaCargo: d.fechaCorte,
            fechaVencimiento: d.fechaCorte,
            moras: [],
            pagos: [],
            diferencias: [],
          },
        })
      } else {
        // La clave (unidad + período) no cambia: se actualiza lo que el archivo
        // declara y lo que se deriva de él.
        await tx.cobroFI.update({
          where: { id: p.id },
          data: {
            fondoId: fondo.id,
            descripcion: descripcionDelCargo(d.fechaCorte),
            montoBase: d.monto,
            fechaCargo: d.fechaCorte,
            fechaVencimiento: d.fechaCorte,
          },
        })
      }
    }
  })

  return { tipo: "reporte", reporte, bloqueada: false }
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
export const FILAS_EJEMPLO_SALDOS: Record<EncabezadoSaldos, string>[] = [
  { unidad: "EJEMPLO-8842-1101", fecha_corte: "2024-03-31", monto: "125000.50" },
  { unidad: "EJEMPLO-8842-1102", fecha_corte: "2024-03-31", monto: "48000" },
  { unidad: "EJEMPLO-8842-2101", fecha_corte: "2024-04-30", monto: "32000" },
]

/**
 * Arma el contenido de la plantilla descargable: los encabezados canónicos (los
 * mismos que valida el parser) más tres filas de ejemplo, que el importador
 * rechaza por llevar el prefijo EJEMPLO-.
 */
export function construirPlantillaSaldos(): string {
  const ejemplos = FILAS_EJEMPLO_SALDOS.map((fila) =>
    ENCABEZADOS_SALDOS.map((h) => fila[h])
  )
  // BOM al inicio: Excel abre el UTF-8 sin corromper los caracteres.
  return `\ufeff${serializarCsv([[...ENCABEZADOS_SALDOS], ...ejemplos])}\r\n`
}
