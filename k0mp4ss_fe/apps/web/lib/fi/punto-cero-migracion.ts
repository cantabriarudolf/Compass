/**
 * lib/fi/punto-cero-migracion — mapeo puro del punto cero 2023-2024 a filas Prisma.
 *
 * Espejo exacto del seed del store (PUNTO_CERO_FONDO + buildPuntoCeroEgresos /
 * buildPuntoCeroIngresos en lib/store.ts): mismos ids deterministas
 * (`fi-egr-hist-NNN`, `fi-ing-hist-NN`) y folios `FE-0001..0182` por índice
 * (igual que un seed fresco, donde startFolioNum = 1). La idempotencia la da
 * el upsert por id en el script consumidor.
 *
 * Semántica (BACKLOG-100 §Punto cero, hallazgos F1/F2): `saldoInicial` es
 * DERIVADO (egresos − ingresos del fixture), no proviene del libro; la serie
 * `saldoCC` del JSON (cuenta bancaria del libro) NO se materializa.
 */
import puntoCeroData from "@/data/finanzas/punto-cero-2324.json"

export interface PuntoCeroFondo {
  id: string
  nombre: string
  tipo: string
  descripcion: string
  saldoInicial: number
  activo: boolean
}

export interface PuntoCeroEgreso {
  id: string
  folio: string
  fecha: string
  categoria: string
  descripcion: string
  monto: number
  fondoId: string
  esRecurrente: boolean
}

export interface PuntoCeroIngreso {
  id: string
  fecha: string
  monto: number
  concepto: string
  fondoId: string
  familia?: string
}

export interface PuntoCeroMapeado {
  fondo: PuntoCeroFondo
  egresos: PuntoCeroEgreso[]
  ingresos: PuntoCeroIngreso[]
}

interface PuntoCeroRaw {
  fondoCC: { id: string; nombre: string; tipo: string; saldoInicial: number }
  egresos: {
    fecha: string
    monto: number
    concepto: string
    categoria: string
    esRecurrente: boolean
  }[]
  ingresos: { fecha: string; monto: number; concepto: string; familia?: string }[]
}

// SAFETY: el JSON es versionado y su shape lo valida el seed del store + este test.
const datos = puntoCeroData as unknown as PuntoCeroRaw

/** Mapea el fixture a filas listas para upsert (puro y determinista). */
export function mapearPuntoCero(): PuntoCeroMapeado {
  const fondo: PuntoCeroFondo = {
    id: datos.fondoCC.id,
    nombre: datos.fondoCC.nombre,
    tipo: datos.fondoCC.tipo,
    descripcion:
      "Cuenta corriente histórica (punto cero 2023-2024). Saldo inicial cuadra el libro.",
    saldoInicial: datos.fondoCC.saldoInicial,
    activo: true,
  }
  const egresos: PuntoCeroEgreso[] = datos.egresos.map((e, idx) => ({
    id: `fi-egr-hist-${String(idx + 1).padStart(3, "0")}`,
    folio: `FE-${String(idx + 1).padStart(4, "0")}`,
    fecha: e.fecha,
    categoria: e.categoria,
    descripcion: e.concepto,
    monto: e.monto,
    fondoId: fondo.id,
    esRecurrente: e.esRecurrente,
  }))
  const ingresos: PuntoCeroIngreso[] = datos.ingresos.map((e, idx) => ({
    id: `fi-ing-hist-${String(idx + 1).padStart(3, "0")}`,
    fecha: e.fecha,
    monto: e.monto,
    concepto: e.concepto,
    fondoId: fondo.id,
    ...(e.familia ? { familia: e.familia } : {}),
  }))
  return { fondo, egresos, ingresos }
}
