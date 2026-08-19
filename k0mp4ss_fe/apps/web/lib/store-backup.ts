import { STORE_VERSION } from "@/lib/store"
import type { CompassData } from "@/lib/store"

export const STORE_KEY = "compass-store"

const REQUIRED_STATE_KEYS: (keyof CompassData)[] = [
  "tiposUnidad",
  "macroSectores",
  "microSectores",
  "unidades",
  "estacionamientos",
  "personas",
  "vinculos",
  "configuracion",
  "maestros",
]

export interface BackupSummary {
  version: number
  personas: number
  vinculos: number
  unidades: number
  estacionamientos: number
  maestros: number
}

export interface BackupValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
  envelope: boolean
  version: number
  summary: BackupSummary | null
  exportSummary: {
    exportDate?: string
    totalRecords?: number
    collectionsWithData?: number
  } | null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function validateStoreBackup(parsed: unknown): BackupValidation {
  const errors: string[] = []
  const warnings: string[] = []

  const root = asObject(parsed)
  if (!root) {
    return {
      ok: false,
      errors: ["El archivo no es un objeto JSON válido."],
      warnings,
      envelope: false,
      version: STORE_VERSION,
      summary: null,
      exportSummary: null,
    }
  }

  const exportSummaryRaw = asObject((root as Record<string, unknown>)["_summary"])
  const exportSummary = exportSummaryRaw
    ? {
        exportDate: typeof exportSummaryRaw["exportDate"] === "string" ? exportSummaryRaw["exportDate"] : undefined,
        totalRecords: typeof exportSummaryRaw["totalRecords"] === "number" ? exportSummaryRaw["totalRecords"] : undefined,
        collectionsWithData: typeof exportSummaryRaw["collectionsWithData"] === "number" ? exportSummaryRaw["collectionsWithData"] : undefined,
      }
    : null

  const isEnvelope = "state" in root
  const state = isEnvelope ? asObject(root.state) : root
  const rawVersion =
    typeof root.version === "number" ? root.version : isEnvelope ? STORE_VERSION : undefined

  if (isEnvelope && !state) {
    errors.push("El envelope tiene la clave 'state' pero no es un objeto.")
  }

  const version = rawVersion ?? (state ? STORE_VERSION : STORE_VERSION)

  if (typeof rawVersion === "number" && rawVersion > STORE_VERSION) {
    errors.push(
      `Versión de backup ${rawVersion} es futura (actual: ${STORE_VERSION}). No se puede importar: la app no conoce sus migraciones.`
    )
  } else if (rawVersion === undefined && !isEnvelope) {
    warnings.push(
      `El archivo no declara versión. Se interpretará como versión ${STORE_VERSION}.`
    )
  } else if (isEnvelope && typeof rawVersion === "number" && rawVersion < STORE_VERSION) {
    warnings.push(
      `El backup es versión ${rawVersion} (actual: ${STORE_VERSION}). Se aplicarán las migraciones pendientes al recargar.`
    )
  }

  const missing = REQUIRED_STATE_KEYS.filter(key => !(state && key in state))
  if (missing.length > 0) {
    errors.push(`Faltan colecciones requeridas en el state: ${missing.join(", ")}.`)
  }

  if (!state) {
    return {
      ok: errors.length === 0,
      errors,
      warnings,
      envelope: isEnvelope,
      version,
      summary: null,
      exportSummary,
    }
  }

  const personas = asArray(state.personas)
  const vinculos = asArray(state.vinculos)
  const unidades = asArray(state.unidades)
  const estacionamientos = asArray(state.estacionamientos)
  const maestros = asObject(state.maestros)

  const personaIds = new Set(personas.map(p => asObject(p)?.id).filter(Boolean) as string[])
  const unidadIds = new Set(unidades.map(u => asObject(u)?.id).filter(Boolean) as string[])

  const vinculosHuérfanos = vinculos.filter(v => {
    const vObj = asObject(v)
    return vObj && (!personaIds.has(String(vObj.personaId)) || !unidadIds.has(String(vObj.unidadId)))
  })
  if (vinculosHuérfanos.length > 0) {
    errors.push(
      `${vinculosHuérfanos.length} vínculo(s) apuntan a una persona o unidad inexistente en el backup (IDs: ${vinculosHuérfanos
        .map(v => (asObject(v)?.id ?? "?"))
        .join(", ")}).`
    )
  }

  const estacionamientosHuérfanos = estacionamientos.filter(e => {
    const eObj = asObject(e)
    const unidadId = eObj?.unidadId
    return unidadId !== undefined && unidadId !== null && !unidadIds.has(String(unidadId))
  })
  if (estacionamientosHuérfanos.length > 0) {
    errors.push(
      `${estacionamientosHuérfanos.length} estacionamiento(s) apuntan a una unidad inexistente en el backup.`
    )
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    envelope: isEnvelope,
    version,
    summary: {
      version,
      personas: personas.length,
      vinculos: vinculos.length,
      unidades: unidades.length,
      estacionamientos: estacionamientos.length,
      maestros: maestros ? Object.keys(maestros).length : 0,
    },
    exportSummary,
  }
}