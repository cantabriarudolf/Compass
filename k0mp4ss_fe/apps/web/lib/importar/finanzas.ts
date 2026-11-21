/**
 * lib/importar/finanzas.ts — importador CSV del historial financiero:
 * bloques **egresos** e **ingresos** (F48 · S2/S4).
 *
 * Extiende el onboarding CSV que ya existe (estructura, personas, vínculos) a
 * los dos movimientos que hacen que el estado de cuenta de una unidad cobre
 * sentido. Los dos bloques viajan por el MISMO código: una sola validación por
 * fila (`validarFilaFinanzas`), un solo reporte (`{ filas, resumen }`, la misma
 * forma que los otros bloques) y un solo camino de escritura idempotente.
 *
 * Formato declarado (S2) — idéntico en los dos bloques:
 *
 *   fecha,monto,descripcion,categoria,fondo
 *
 *   - `fecha`   AAAA-MM-DD, fecha real del calendario y no futura: un histórico
 *               no registra movimientos que todavía no pasaron.
 *   - `monto`   > 0 con punto decimal. El signo lo da el bloque, no la fila.
 *   - `descripcion` obligatoria (es parte de la clave de idempotencia).
 *   - `categoria` texto libre acotado (120); vacío se acepta.
 *   - `fondo`   nombre **o** id de un `FondoFI` de la comunidad que ya existe.
 *
 * Mapeo a los dos modelos (los dos campos que no se llaman igual):
 *
 *   - egresos  → `EgresoFI.descripcion` / `EgresoFI.categoria`. El CSV no trae
 *                folio ni recurrencia: el alta deja `folio` en null (el folio
 *                FE-#### lo asigna la ruta de gastos, no un archivo) y
 *                `esRecurrente` en false (una fila histórica no declara
 *                recurrencia). En una fila ya existente esos dos campos no se
 *                tocan, porque el archivo tampoco los declara.
 *   - ingresos → `IngresoFI.concepto` (la descripción) y `IngresoFI.familia`
 *                (la categoría; vacía = sin familia). `IngresoFI` no tiene
 *                columna `categoria` y `familia` es su etiqueta libre.
 *
 * Clave de idempotencia (S2): `fecha + monto + descripcion + fondo` **dentro de
 * la comunidad**. Se compone con el id del fondo ya resuelto y el monto en su
 * representación exacta de punto flotante (la misma fila produce el mismo
 * double), así que importar dos veces el mismo archivo no duplica: la fila
 * existente se reporta como «actualizar».
 *
 * Lo que NO hace (S3): no crea fondos, ni categorías, ni unidades, ni personas
 * (si falta un fondo la fila es error con el motivo literal), no calcula saldos
 * ni reescribe `FondoFI.saldoInicial`, y no toca cobros, pagos, emisiones ni
 * presupuestos. Tampoco escribe nada en la vista previa (`dryRun`), y la
 * importación real no corre si la vista previa tiene filas con error: en ese
 * caso devuelve el reporte con `bloqueada: true` y no escribe una sola fila.
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
import { hoyISO } from "@/lib/date-utils"

/** Encabezados canónicos de los dos bloques: fuente única de la plantilla y del parser. */
export const ENCABEZADOS_FINANZAS = [
  "fecha",
  "monto",
  "descripcion",
  "categoria",
  "fondo",
] as const

export type EncabezadoFinanzas = (typeof ENCABEZADOS_FINANZAS)[number]

/** Los dos bloques del historial financiero. */
export type BloqueFinanzas = "egresos" | "ingresos"

/** Tope de la categoría libre (mismo límite que el nombre de una partida del presupuesto). */
const MAXIMO_CATEGORIA = 120

/** Texto literal del error de la fecha futura (lo cita la spec). */
const MENSAJE_FECHA_FUTURA =
  "no puede ser futura: un histórico registra movimientos que ya pasaron."

// --- Validación por fila (zod + fondo resuelto) ---

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
 * como decimal: en este formato es el separador de columnas, y adivinarla
 * sería leer un número que el archivo no dijo.
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

const FilaFinanzasSchema = z.object({
  fecha: textoObligatorio
    .trim()
    .min(1, "es obligatorio.")
    .refine(
      (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
      "debe tener formato AAAA-MM-DD (ej: 2024-03-15)."
    )
    .refine(esFechaReal, "no es una fecha real del calendario."),
  monto: montoCsv,
  descripcion: textoObligatorio.trim().min(1, "es obligatorio."),
  categoria: z
    .string({ invalid_type_error: "debe ser texto." })
    .trim()
    .max(MAXIMO_CATEGORIA, `no puede superar los ${MAXIMO_CATEGORIA} caracteres.`)
    .default(""),
  fondo: textoObligatorio.trim().min(1, "es obligatorio."),
})

/** Fila válida, con el fondo ya resuelto al id de un `FondoFI` existente. */
export interface DatosFilaFinanzas {
  fecha: string
  monto: number
  descripcion: string
  categoria: string
  fondoId: string
  fondoNombre: string
}

/** Contexto de la validación: lo que la fila no puede saber sola. */
export interface ContextoFilaFinanzas {
  /** Hoy en AAAA-MM-DD (inyectable: el borde de fecha futura se pinea en el test). */
  hoy: string
  /** Resuelve el `fondo` del archivo (nombre o id) a un fondo de la comunidad. */
  resolverFondo: (referencia: string) => { id: string; nombre: string } | null
}

export interface FilaFinanzasValidada {
  linea: number
  datos: DatosFilaFinanzas | null
  errores: ErrorFila[]
}

/**
 * validarFilaFinanzas — la ÚNICA validación por fila del historial financiero
 * (S4). La usan la vista previa y la importación real; la plantilla comparte
 * los mismos encabezados y el mismo rechazo de filas de ejemplo, así que los
 * tres caminos no pueden discrepar.
 */
export function validarFilaFinanzas(
  fila: FilaCsv,
  contexto: ContextoFilaFinanzas
): FilaFinanzasValidada {
  // Filas de ejemplo de la plantilla: se rechazan antes del esquema, para que
  // nada del ejemplo se escriba.
  const columnaEjemplo = columnaFilaEjemplo(fila.valores, ["descripcion", "fondo"])
  if (columnaEjemplo) {
    return {
      linea: fila.linea,
      datos: null,
      errores: [{ columna: columnaEjemplo, mensaje: MENSAJE_FILA_EJEMPLO }],
    }
  }

  const parsed = FilaFinanzasSchema.safeParse(fila.valores)
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
  // El histórico no puede tener movimientos futuros (S2).
  if (v.fecha > contexto.hoy) {
    errores.push({ columna: "fecha", mensaje: MENSAJE_FECHA_FUTURA })
  }
  // El fondo tiene que existir: el importador nunca lo crea (S3).
  const fondo = contexto.resolverFondo(v.fondo)
  if (!fondo) {
    errores.push({
      columna: "fondo",
      mensaje:
        `no existe el fondo "${v.fondo}" en la comunidad; ` +
        "debe estar creado antes de importar.",
    })
  }
  if (!fondo || errores.length > 0) {
    return { linea: fila.linea, datos: null, errores }
  }

  return {
    linea: fila.linea,
    datos: {
      fecha: v.fecha,
      monto: v.monto,
      descripcion: v.descripcion,
      categoria: v.categoria,
      fondoId: fondo.id,
      fondoNombre: fondo.nombre,
    },
    errores: [],
  }
}

// --- Resolución del fondo y clave de idempotencia ---

/** Comparación de nombres tolerante: sin mayúsculas, acentos ni espacios dobles. */
function normalizaNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

/**
 * contextoDeFondos — arma el resolvedor de la columna `fondo`: primero por id
 * (exacto) y después por nombre (sin acentos ni mayúsculas). Nunca crea nada:
 * devuelve null y la fila se reporta con su error.
 */
export function contextoDeFondos(
  fondos: readonly { id: string; nombre: string }[]
): (referencia: string) => { id: string; nombre: string } | null {
  const porId = new Map(fondos.map((f) => [f.id, f] as const))
  const porNombre = new Map(fondos.map((f) => [normalizaNombre(f.nombre), f] as const))
  return (referencia) =>
    porId.get(referencia) ?? porNombre.get(normalizaNombre(referencia)) ?? null
}

/**
 * Clave de idempotencia declarada (S2): fecha + monto + descripción + fondo,
 * dentro de la comunidad. El monto va en su representación exacta de punto
 * flotante y la descripción ya viene recortada por el esquema.
 */
function claveIdempotencia(
  fecha: string,
  monto: number,
  descripcion: string,
  fondoId: string
): string {
  return `${fecha}|${monto}|${descripcion}|${fondoId}`
}

/** Id determinista por contenido: dos corridas con los mismos datos reutilizan el id. */
function idDeterminista(prefijo: string, ...partes: string[]): string {
  const hash = createHash("sha256").update(partes.join("|")).digest("hex")
  // substring y no slice: el recorte del digest no es un truncamiento de lista
  // (el candado de patrones R4 busca `.slice(0, N)` y marcaría falso positivo).
  return `${prefijo}${hash.substring(0, 20)}`
}

// --- Import (vista previa + escritura idempotente) ---

export interface EntradaImportarFinanzas {
  prisma: PrismaClient
  /** Siempre del scope de la sesión, nunca del archivo. */
  comunidadId: string
  bloque: BloqueFinanzas
  filas: FilaCsv[]
  dryRun: boolean
  /** Hoy en AAAA-MM-DD; por defecto el del servidor. */
  hoy?: string
}

export interface ResultadoImportarFinanzas {
  /** Reporte fila por fila, la misma forma que los otros bloques. */
  reporte: ReporteEstructura
  /**
   * true = había filas con error y, al no ser vista previa, no se escribió
   * nada: la importación real no corre sobre una vista previa sucia (S1).
   */
  bloqueada: boolean
}

/** Un movimiento ya guardado, reducido a lo que la clave y el reporte necesitan. */
interface MovimientoExistente {
  id: string
  descripcion: string
  categoria: string
}

interface FilaProcesada extends ReporteFila {
  conError: boolean
  datos: DatosFilaFinanzas | null
  id: string
}

/**
 * importarFinanzas — valida las filas y devuelve el reporte fila por fila.
 *
 * Con `dryRun` no escribe nada (vista previa, S1). Sin `dryRun`, si alguna fila
 * tiene error devuelve `bloqueada: true` sin escribir: la importación real exige
 * una vista previa limpia. Si todas las filas son válidas, escribe en una
 * transacción: la clave de idempotencia ya existe en la comunidad → actualiza
 * los campos que no son clave; no existe → crea con id determinista.
 */
export async function importarFinanzas({
  prisma,
  comunidadId,
  bloque,
  filas,
  dryRun,
  hoy = hoyISO(),
}: EntradaImportarFinanzas): Promise<ResultadoImportarFinanzas> {
  const [fondos, existentes] = await Promise.all([
    prisma.fondoFI.findMany({
      where: { comunidadId },
      select: { id: true, nombre: true },
    }),
    bloque === "egresos"
      ? prisma.egresoFI.findMany({
          where: { comunidadId },
          select: {
            id: true,
            fecha: true,
            monto: true,
            descripcion: true,
            categoria: true,
            fondoId: true,
          },
        })
      : prisma.ingresoFI.findMany({
          where: { comunidadId },
          select: {
            id: true,
            fecha: true,
            monto: true,
            concepto: true,
            familia: true,
            fondoId: true,
          },
        }),
  ])

  // Los dos modelos se reducen a la misma forma: descripción y categoría son
  // `descripcion`/`categoria` en egresos y `concepto`/`familia` en ingresos.
  const movimientos = new Map<string, MovimientoExistente>()
  for (const m of existentes) {
    const esEgreso = "descripcion" in m
    const descripcion = esEgreso ? m.descripcion : m.concepto
    const categoria = esEgreso ? m.categoria : (m.familia ?? "")
    movimientos.set(
      claveIdempotencia(m.fecha, m.monto, descripcion.trim(), m.fondoId),
      { id: m.id, descripcion, categoria }
    )
  }

  const contexto: ContextoFilaFinanzas = {
    hoy,
    resolverFondo: contextoDeFondos(fondos),
  }
  const prefijoId = bloque === "egresos" ? "imp-egr-" : "imp-ing-"

  const procesadas: FilaProcesada[] = []
  for (const fila of filas) {
    const validada = validarFilaFinanzas(fila, contexto)
    const errores = validada.errores.map(
      (e) => `${e.columna}: ${e.mensaje} (línea ${validada.linea})`
    )
    let accion: AccionFila = "sin-cambios"
    let id = ""
    let datos: DatosFilaFinanzas | null = validada.datos

    if (validada.datos) {
      const d = validada.datos
      const clave = claveIdempotencia(d.fecha, d.monto, d.descripcion, d.fondoId)
      const existente = movimientos.get(clave)
      if (existente) {
        // La clave ya está en la comunidad: la fila es esa misma y se reporta
        // como actualizada (reimportar el archivo no duplica).
        accion = "actualizar"
        id = existente.id
      } else {
        accion = "crear"
        id = idDeterminista(prefijoId, comunidadId, clave)
      }
      // Duplicados de la misma clave dentro del archivo: la fila siguiente se
      // compara contra lo que esta deja, para no reportar dos altas.
      movimientos.set(clave, { id, descripcion: d.descripcion, categoria: d.categoria })
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
  if (dryRun) return { reporte, bloqueada: false }
  // La importación real exige la vista previa limpia: nada de escribir «las
  // filas que se puedan» y reportar el resto (S1).
  if (reporte.resumen.conError > 0) return { reporte, bloqueada: true }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const p of procesadas) {
      if (!p.datos) continue
      const d = p.datos
      if (bloque === "egresos") {
        if (p.accion === "crear") {
          await tx.egresoFI.create({
            data: {
              id: p.id,
              comunidadId,
              fecha: d.fecha,
              monto: d.monto,
              descripcion: d.descripcion,
              categoria: d.categoria,
              fondoId: d.fondoId,
              esRecurrente: false,
            },
          })
        } else {
          // Sólo la categoría queda fuera de la clave: es lo único que el
          // archivo declara y la fila existente puede tener distinto.
          await tx.egresoFI.update({
            where: { id: p.id },
            data: { categoria: d.categoria },
          })
        }
      } else if (p.accion === "crear") {
        await tx.ingresoFI.create({
          data: {
            id: p.id,
            comunidadId,
            fecha: d.fecha,
            monto: d.monto,
            concepto: d.descripcion,
            fondoId: d.fondoId,
            ...(d.categoria === "" ? {} : { familia: d.categoria }),
          },
        })
      } else {
        await tx.ingresoFI.update({
          where: { id: p.id },
          data: { familia: d.categoria === "" ? null : d.categoria },
        })
      }
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

// --- Plantillas descargables (encabezado + filas de ejemplo) ---

/** Filas de ejemplo de la plantilla de egresos (valores realistas del dominio). */
export const FILAS_EJEMPLO_EGRESOS: Record<EncabezadoFinanzas, string>[] = [
  {
    fecha: "2024-03-15",
    monto: "15500.50",
    descripcion: "EJEMPLO-Mantenimiento del ascensor",
    categoria: "mantencion",
    fondo: "EJEMPLO-Fondo de gasto común",
  },
  {
    fecha: "2024-04-02",
    monto: "32000",
    descripcion: "EJEMPLO-Reparación del portón",
    categoria: "otro",
    fondo: "EJEMPLO-Fondo de gasto común",
  },
  {
    fecha: "2024-05-10",
    monto: "8900.25",
    descripcion: "EJEMPLO-Consumo de agua",
    categoria: "servicios",
    fondo: "EJEMPLO-Fondo de ahorro",
  },
]

/** Filas de ejemplo de la plantilla de ingresos (`categoria` es la familia). */
export const FILAS_EJEMPLO_INGRESOS: Record<EncabezadoFinanzas, string>[] = [
  {
    fecha: "2024-03-01",
    monto: "120000",
    descripcion: "EJEMPLO-Cuotas extraordinarias",
    categoria: "Contribuciones",
    fondo: "EJEMPLO-Fondo de ahorro",
  },
  {
    fecha: "2024-03-05",
    monto: "50000",
    descripcion: "EJEMPLO-Multa por ruido",
    categoria: "",
    fondo: "EJEMPLO-Fondo de gasto común",
  },
  {
    fecha: "2024-03-20",
    monto: "25000",
    descripcion: "EJEMPLO-Arriendo de quincho",
    categoria: "Arriendos",
    fondo: "EJEMPLO-Fondo de gasto común",
  },
]

/**
 * Arma el contenido de la plantilla descargable del bloque: los encabezados
 * canónicos (los mismos que valida el parser) más tres filas de ejemplo, que el
 * importador rechaza por llevar el prefijo EJEMPLO-.
 */
export function construirPlantillaFinanzas(bloque: BloqueFinanzas): string {
  const ejemplos = (bloque === "egresos" ? FILAS_EJEMPLO_EGRESOS : FILAS_EJEMPLO_INGRESOS).map(
    (fila) => ENCABEZADOS_FINANZAS.map((h) => fila[h])
  )
  // BOM al inicio: Excel abre el UTF-8 sin corromper los caracteres.
  return `\ufeff${serializarCsv([[...ENCABEZADOS_FINANZAS], ...ejemplos])}\r\n`
}
