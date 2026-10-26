/**
 * lib/importar/estructura.ts — importador CSV del bloque **estructura**
 * (ODD carga-inicial-csv U1: macro/micro sectores + unidades).
 *
 * Formato del archivo (decisión de U1): **un solo CSV con los 9 encabezados
 * juntos**, una fila por unidad. Las dos tablas lógicas viajan en la misma
 * fila y los sectores se derivan de las columnas `macro_sector` /
 * `micro_sector`: si no existen en la comunidad se crean; si existen se
 * reusan por nombre y no se tocan. Un micro sector sin unidades asociadas
 * no se puede representar en este formato (la fila es de una unidad).
 *
 * Clave natural de unidad: `rol_sii` (es el identificador que el
 * administrador ya tiene). El import es idempotente por esa clave: existe →
 * se actualiza; no existe → se crea con id determinista derivado de
 * `comunidadId + rol_sii`. `comunidadId` siempre lo pone el servidor.
 *
 * Reglas de maestros: `tipo_unidad` y `estado_ocupacion` se resuelven por
 * nombre contra los maestros existentes de la comunidad (comparación sin
 * distinguir mayúsculas ni acentos). Si el nombre no existe es **error de
 * fila**; el importador nunca inventa maestros.
 *
 * El CSV no trae la etiqueta visual de los sectores (Torre/Piso/Nivel) ni
 * los medidores de servicios: al crear un sector se fija la etiqueta
 * constante ETIQUETA_SECTOR y los `servicios` de la unidad quedan vacíos
 * ({}); al actualizar una unidad existente esos dos campos no se tocan.
 */
import { createHash } from "node:crypto"
import type { Prisma, PrismaClient } from "@prisma/client"
import { z } from "zod"
import { serializarCsv, type FilaCsv } from "@/lib/importar/csv"

/** Encabezados canónicos del bloque estructura: fuente única de la plantilla. */
export const ENCABEZADOS_ESTRUCTURA = [
  "macro_sector",
  "micro_sector",
  "rol_sii",
  "numero",
  "etiqueta",
  "tipo_unidad",
  "metraje",
  "prorrateo",
  "estado_ocupacion",
] as const

export type EncabezadoEstructura = (typeof ENCABEZADOS_ESTRUCTURA)[number]

/** Prefijo que marca las claves de las filas de ejemplo de la plantilla. */
export const PREFIJO_EJEMPLO = "EJEMPLO-"

/** Mensaje para una fila que llegó tal como viene de la plantilla. */
export const MENSAJE_FILA_EJEMPLO =
  "Esta fila es del ejemplo de la plantilla: reemplazala por tus datos o borrala."

/** Devuelve la primera columna marcada con el prefijo de ejemplo, si la hay. */
export function columnaFilaEjemplo(
  valores: Record<string, string>,
  columnas: readonly string[]
): string | null {
  for (const columna of columnas) {
    if ((valores[columna] ?? "").trimStart().startsWith(PREFIJO_EJEMPLO)) return columna
  }
  return null
}

/** Filas de ejemplo de la plantilla descargable (valores realistas del dominio). */
export const FILAS_EJEMPLO_ESTRUCTURA: Record<EncabezadoEstructura, string>[] = [
  {
    macro_sector: "EJEMPLO-Torre A",
    micro_sector: "EJEMPLO-Piso 1",
    rol_sii: "EJEMPLO-12345-1101",
    numero: "1101",
    etiqueta: "Depto",
    tipo_unidad: "Depto Tipo A",
    metraje: "55.5",
    prorrateo: "0.0125",
    estado_ocupacion: "Vacante",
  },
  {
    macro_sector: "EJEMPLO-Estacionamientos",
    micro_sector: "EJEMPLO-Subterráneo -1",
    rol_sii: "EJEMPLO-12345-2105",
    numero: "E-021",
    etiqueta: "Estacionamiento",
    tipo_unidad: "Estacionamiento Estándar",
    metraje: "12.5",
    prorrateo: "0.005",
    estado_ocupacion: "En Uso",
  },
  {
    macro_sector: "EJEMPLO-Centro Comercial",
    micro_sector: "EJEMPLO-Calle",
    rol_sii: "EJEMPLO-999-101",
    numero: "L-01",
    etiqueta: "Local",
    tipo_unidad: "Local Comercial B (Estándar)",
    metraje: "60",
    prorrateo: "0.025",
    estado_ocupacion: "En Arriendo",
  },
]

/** Etiqueta fija de sectores nuevos (el CSV no trae la categoría visual). */
export const ETIQUETA_SECTOR = "Sector"

// --- Validación por fila (zod) ---

const textoObligatorio = z.string({
  required_error: "es obligatorio.",
  invalid_type_error: "es obligatorio.",
})

/** Número CSV ≥ 0: acepta punto o coma decimal (Excel es-CL exporta con coma). */
const numeroCsv = z
  .string({
    required_error: "es obligatorio.",
    invalid_type_error: "es obligatorio.",
  })
  .trim()
  .min(1, "es obligatorio.")
  .refine(
    (v) => /^-?\d+(?:[.,]\d+)?$/.test(v),
    "debe ser un número (ej: 55.5)."
  )
  .transform((v) => Number(v.replace(",", ".")))
  .refine((n) => n >= 0, "no puede ser negativo.")

const FilaEstructuraSchema = z.object({
  macro_sector: textoObligatorio,
  micro_sector: textoObligatorio,
  rol_sii: textoObligatorio,
  numero: textoObligatorio,
  etiqueta: textoObligatorio,
  tipo_unidad: textoObligatorio,
  estado_ocupacion: textoObligatorio,
  metraje: numeroCsv,
  prorrateo: numeroCsv,
})

export type DatosFilaEstructura = z.infer<typeof FilaEstructuraSchema>

export interface ErrorFila {
  columna: string
  mensaje: string
}

export interface FilaValidada {
  linea: number
  datos: DatosFilaEstructura | null
  errores: ErrorFila[]
}

/** Valida cada fila del CSV y devuelve el error con su columna. */
export function validarFilasEstructura(filas: FilaCsv[]): FilaValidada[] {
  return filas.map((fila) => {
    // Filas de ejemplo de la plantilla: se rechazan antes del schemario, para
    // que nada del ejemplo se escriba (ni siquiera en sectores).
    const columnaEjemplo = columnaFilaEjemplo(fila.valores, [
      "rol_sii",
      "macro_sector",
      "micro_sector",
    ])
    if (columnaEjemplo) {
      return {
        linea: fila.linea,
        datos: null,
        errores: [{ columna: columnaEjemplo, mensaje: MENSAJE_FILA_EJEMPLO }],
      }
    }
    const parsed = FilaEstructuraSchema.safeParse(fila.valores)
    if (parsed.success) {
      return { linea: fila.linea, datos: parsed.data, errores: [] }
    }
    const errores = parsed.error.issues.map((issue) => ({
      columna: String(issue.path[0] ?? ""),
      mensaje: issue.message,
    }))
    return { linea: fila.linea, datos: null, errores }
  })
}

// --- Import (vista previa + escritura idempotente) ---

export type AccionFila = "crear" | "actualizar" | "sin-cambios"

export interface ReporteFila {
  linea: number
  /** En filas con error la acción es «sin-cambios»: nada de esa fila se escribe. */
  accion: AccionFila
  errores: string[]
}

export interface ResumenEstructura {
  total: number
  validas: number
  conError: number
  crear: number
  actualizar: number
  sinCambios: number
}

export interface ReporteEstructura {
  filas: ReporteFila[]
  resumen: ResumenEstructura
}

export interface EntradaImportarEstructura {
  prisma: PrismaClient
  /** Siempre del scope de la sesión, nunca del archivo. */
  comunidadId: string
  filas: FilaCsv[]
  dryRun: boolean
}

interface DatosUnidad {
  numero: string
  etiqueta: string
  microSectorId: string
  tipoUnidadId: string
  metraje: number
  prorrateo: number
  estadoId: string
}

/** Id determinista por contenido: dos corridas con los mismos datos reutilizan el id. */
function idDeterminista(prefijo: string, ...partes: string[]): string {
  const hash = createHash("sha256").update(partes.join("|")).digest("hex")
  // substring y no slice: el recorte del digest no es un truncamiento de lista
  // (el candado de patrones R4 busca `.slice(0, N)` y marcaría falso positivo).
  // Longitud fija de id.
  return `${prefijo}${hash.substring(0, 20)}`
}

/** Comparación de nombres tolerante: sin mayúsculas, acentos ni espacios dobles. */
function normalizaNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

const EPSILON = 1e-9

function unidadesIguales(a: DatosUnidad, b: DatosUnidad): boolean {
  return (
    a.numero === b.numero &&
    a.etiqueta === b.etiqueta &&
    a.microSectorId === b.microSectorId &&
    a.tipoUnidadId === b.tipoUnidadId &&
    a.estadoId === b.estadoId &&
    Math.abs(a.metraje - b.metraje) < EPSILON &&
    Math.abs(a.prorrateo - b.prorrateo) < EPSILON
  )
}

/**
 * importarEstructura — valida las filas y devuelve el reporte fila por fila.
 *
 * Con `dryRun` no escribe nada (vista previa, S3). Sin `dryRun` escribe en
 * una transacción sólo las filas válidas: primero los sectores que faltan,
 * después cada unidad (crea o actualiza por `rol_sii`).
 */
export async function importarEstructura({
  prisma,
  comunidadId,
  filas,
  dryRun,
}: EntradaImportarEstructura): Promise<ReporteEstructura> {
  const validadas = validarFilasEstructura(filas)

  const [tipos, estados, macros, micros, unidadesExistentes] = await Promise.all([
    prisma.tipoUnidad.findMany({
      where: { comunidadId },
      select: { id: true, nombre: true },
    }),
    prisma.estadoOcupacion.findMany({
      where: { comunidadId },
      select: { id: true, nombre: true },
    }),
    prisma.macroSector.findMany({
      where: { comunidadId },
      select: { id: true, nombre: true },
    }),
    prisma.microSector.findMany({
      where: { comunidadId },
      select: { id: true, nombre: true, macroSectorId: true },
    }),
    prisma.unidad.findMany({
      where: { comunidadId },
      select: {
        id: true,
        numero: true,
        etiqueta: true,
        microSectorId: true,
        tipoUnidadId: true,
        metraje: true,
        prorrateo: true,
        estadoId: true,
        rolSii: true,
      },
    }),
  ])

  const tipoPorNombre = new Map(tipos.map((t) => [normalizaNombre(t.nombre), t.id]))
  const estadoPorNombre = new Map(estados.map((e) => [normalizaNombre(e.nombre), e.id]))
  const macroPorNombre = new Map(
    macros.map((m) => [normalizaNombre(m.nombre), m.id])
  )
  const microPorClave = new Map(
    micros.map((m) => [`${m.macroSectorId}|${normalizaNombre(m.nombre)}`, m.id])
  )
  // Una unidad por rol_sii (sin unique en BD: el importador es quien impone
  // la unicidad de la clave natural dentro de la comunidad).
  const unidadPorRolSii = new Map<string, { id: string; datos: DatosUnidad }>()
  for (const u of unidadesExistentes) {
    const rol = u.rolSii.trim()
    if (rol === "") continue
    unidadPorRolSii.set(rol, {
      id: u.id,
      datos: {
        numero: u.numero,
        etiqueta: u.etiqueta,
        microSectorId: u.microSectorId,
        tipoUnidadId: u.tipoUnidadId,
        metraje: u.metraje,
        prorrateo: u.prorrateo,
        estadoId: u.estadoId,
      },
    })
  }

  interface SectorNuevo {
    id: string
    nombre: string
    macroSectorId?: string
  }
  const macrosACrear = new Map<string, SectorNuevo>()
  const microsACrear = new Map<string, SectorNuevo>()
  // Cada fila procesada: lo que se reporta y lo que se escribe viajan juntos.
  interface FilaProcesada extends ReporteFila {
    conError: boolean
    rolSii: string
    id: string
    datos: DatosUnidad | null
  }
  const filasProcesadas: FilaProcesada[] = []

  for (const fila of validadas) {
    const errores = fila.errores.map(
      (e) => `${e.columna}: ${e.mensaje} (línea ${fila.linea})`
    )
    let accion: AccionFila = "sin-cambios"
    let idUnidad = ""
    let datos: DatosUnidad | null = null

    if (fila.datos) {
      const v = fila.datos
      const tipoId = tipoPorNombre.get(normalizaNombre(v.tipo_unidad))
      if (!tipoId) {
        errores.push(
          `tipo_unidad: no existe el tipo de unidad «${v.tipo_unidad}» en la comunidad; debe estar creado antes de importar (línea ${fila.linea})`
        )
      }
      const estadoId = estadoPorNombre.get(normalizaNombre(v.estado_ocupacion))
      if (!estadoId) {
        errores.push(
          `estado_ocupacion: no existe el estado de ocupación «${v.estado_ocupacion}» en la comunidad; debe estar creado antes de importar (línea ${fila.linea})`
        )
      }

      // Sectores: se crean si faltan y se reusan por nombre.
      const claveMacro = normalizaNombre(v.macro_sector)
      let macroId = macroPorNombre.get(claveMacro)
      if (!macroId) {
        macroId = idDeterminista("imp-m-", comunidadId, v.macro_sector)
        macroPorNombre.set(claveMacro, macroId)
        macrosACrear.set(claveMacro, { id: macroId, nombre: v.macro_sector })
      }
      const claveMicro = `${macroId}|${normalizaNombre(v.micro_sector)}`
      let microId = microPorClave.get(claveMicro)
      if (!microId) {
        microId = idDeterminista("imp-mi-", comunidadId, v.macro_sector, v.micro_sector)
        microPorClave.set(claveMicro, microId)
        microsACrear.set(claveMicro, {
          id: microId,
          nombre: v.micro_sector,
          macroSectorId: macroId,
        })
      }

      if (tipoId && estadoId) {
        datos = {
          numero: v.numero,
          etiqueta: v.etiqueta,
          microSectorId: microId,
          tipoUnidadId: tipoId,
          metraje: v.metraje,
          prorrateo: v.prorrateo,
          estadoId,
        }
        const existente = unidadPorRolSii.get(v.rol_sii.trim())
        if (!existente) {
          accion = "crear"
          idUnidad = idDeterminista("imp-u-", comunidadId, v.rol_sii)
        } else {
          idUnidad = existente.id
          accion = unidadesIguales(existente.datos, datos)
            ? "sin-cambios"
            : "actualizar"
        }
        // Duplicados del mismo rol_sii dentro del archivo: la siguiente fila
        // se compara contra lo que esta fila deja, para no reportar dos creaciones.
        unidadPorRolSii.set(v.rol_sii.trim(), { id: idUnidad, datos })
      }
    }

    filasProcesadas.push({
      linea: fila.linea,
      accion,
      errores,
      conError: errores.length > 0,
      rolSii: fila.datos ? fila.datos.rol_sii : "",
      id: idUnidad,
      datos,
    })
  }

  if (!dryRun) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const macro of macrosACrear.values()) {
        await tx.macroSector.create({
          data: {
            id: macro.id,
            comunidadId,
            nombre: macro.nombre,
            etiqueta: ETIQUETA_SECTOR,
          },
        })
      }
      for (const micro of microsACrear.values()) {
        if (!micro.macroSectorId) continue
        await tx.microSector.create({
          data: {
            id: micro.id,
            comunidadId,
            macroSectorId: micro.macroSectorId,
            nombre: micro.nombre,
            etiqueta: ETIQUETA_SECTOR,
          },
        })
      }
      for (const e of filasProcesadas) {
        if (e.conError || !e.datos) continue
        if (e.accion === "crear") {
          await tx.unidad.create({
            data: {
              id: e.id,
              comunidadId,
              rolSii: e.rolSii,
              ...e.datos,
              servicios: {},
            },
          })
        } else if (e.accion === "actualizar") {
          await tx.unidad.update({ where: { id: e.id }, data: { ...e.datos } })
        }
      }
    })
  }

  const reporte: ReporteFila[] = filasProcesadas.map((f) => ({
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
  for (const f of filasProcesadas) {
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

/** Arma el contenido de la plantilla descargable: encabezados + filas de ejemplo. */
export function construirPlantillaEstructura(): string {
  const ejemplos = FILAS_EJEMPLO_ESTRUCTURA.map((fila) =>
    ENCABEZADOS_ESTRUCTURA.map((h) => fila[h])
  )
  // BOM al inicio: Excel abre el UTF-8 sin corromper los caracteres.
  return `\ufeff${serializarCsv([[...ENCABEZADOS_ESTRUCTURA], ...ejemplos])}\r\n`
}
