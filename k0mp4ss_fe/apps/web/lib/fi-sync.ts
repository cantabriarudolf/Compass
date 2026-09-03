"use client"

import { useCompassStore } from "@/lib/store"

const DEBOUNCE_MS = 2000
const MAX_BATCH = 500

type ColeccionFI = "fondos" | "egresos" | "ingresos"

interface ItemSync {
  coleccion: ColeccionFI
  id: string
  fp: string
  body: Record<string, unknown>
}

let timer: ReturnType<typeof setTimeout> | null = null
let enviados = new Map<string, string>() // id -> fingerprint del contenido enviado
let fallidos401 = new Set<string>()
let prevFp: Record<ColeccionFI, string> = { fondos: "", egresos: "", ingresos: "" }
let unsub: (() => void) | null = null
let iniciado = false

type ColeccionesState = {
  fondosFI: Record<string, unknown>[]
  egresosFI: Record<string, unknown>[]
  ingresosFI: Record<string, unknown>[]
}

function coleccion(state: ColeccionesState, c: ColeccionFI): Record<string, unknown>[] {
  return c === "fondos" ? state.fondosFI : c === "egresos" ? state.egresosFI : state.ingresosFI
}

function fingerprint(coleccionActual: Record<string, unknown>[]): string {
  // Contenido completo (no solo ids): una EDICIÓN de un elemento ya enviado
  // debe re-encolar el delta aunque el length y los ids no cambien.
  return JSON.stringify(coleccionActual.map((i) => i))
}

function deltaColeccion(state: ColeccionesState, c: ColeccionFI): ItemSync[] {
  return coleccion(state, c)
    .filter((i) => {
      const id = String(i["id"])
      if (fallidos401.has(id)) return false
      const fp = JSON.stringify(i)
      return enviados.get(id) !== fp
    })
    .map((i) => ({
      coleccion: c,
      id: String(i["id"]),
      fp: JSON.stringify(i),
      body: i,
    }))
}

function deltaNoPersistido(): ItemSync[] {
  const state = useCompassStore.getState() as unknown as ColeccionesState
  return [
    ...deltaColeccion(state, "fondos"),
    ...deltaColeccion(state, "egresos"),
    ...deltaColeccion(state, "ingresos"),
  ]
}

function chunkBatches(delta: ItemSync[]): ItemSync[][] {
  const batches: ItemSync[][] = []
  let actual: ItemSync[] = []
  for (const item of delta) {
    actual.push(item)
    if (actual.length >= MAX_BATCH) {
      batches.push(actual)
      actual = []
    }
  }
  if (actual.length > 0) batches.push(actual)
  return batches
}

function payload(batch: ItemSync[]): Record<ColeccionFI, unknown[]> {
  const p: Record<ColeccionFI, unknown[]> = { fondos: [], egresos: [], ingresos: [] }
  for (const item of batch) p[item.coleccion].push(item.body)
  return p
}

async function flush(): Promise<void> {
  const delta = deltaNoPersistido()
  if (delta.length === 0) return
  const state = useCompassStore.getState() as unknown as ColeccionesState
  for (const batch of chunkBatches(delta)) {
    try {
      const res = await fetch("/api/fi/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload(batch)),
      })
      if (res.status === 401) {
        // No reintentar en loop: marcar ids como fallidos y esperar próximo cambio
        for (const item of batch) fallidos401.add(item.id)
        return
      }
      if (!res.ok) {
        // Error transitorio: no marcar como enviado, reintentará en próximo cambio
        return
      }
      const j = (await res.json()) as { idsPersistidos?: string[] }
      const persistidos = new Set(j.idsPersistidos ?? [])
      if (persistidos.size === 0) return
      for (const item of batch) {
        if (!persistidos.has(item.id)) continue
        const fuente = coleccion(state, item.coleccion).find((i) => String(i["id"]) === item.id)
        if (fuente && JSON.stringify(fuente) === item.fp) {
          enviados.set(item.id, item.fp)
        }
      }
    } catch {
      // Silencioso: reintentará en próximo cambio
      return
    }
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, DEBOUNCE_MS)
}

/**
 * Espejo BD de Finanzas (fi-sync-bd): suscribe al store detectando cambios en
 * fondosFI / egresosFI / ingresosFI, acumula delta no persistido (Map id→fingerprint,
 * también refleja EDICIONES de elementos ya enviados) y hace POST debounced a los 2s
 * del último cambio, en batches de máx 500. Ante 401 marca ids fallidos sin reintento
 * en bucle. Retorna función para desuscribir (útil en tests).
 */
export function iniciarSyncFI(): (() => void) | void {
  if (iniciado) return unsub ?? undefined
  iniciado = true

  unsub = useCompassStore.subscribe((state) => {
    const actual = state as unknown as ColeccionesState
    let cambio = false
    for (const c of ["fondos", "egresos", "ingresos"] as const) {
      const fp = fingerprint(coleccion(actual, c))
      if (fp !== prevFp[c]) {
        prevFp[c] = fp
        cambio = true
      }
    }
    if (!cambio) return
    const delta = deltaNoPersistido()
    if (delta.length === 0) return
    schedule()
  })

  return () => {
    if (timer) clearTimeout(timer)
    if (unsub) unsub()
    iniciado = false
    unsub = null
  }
}

/** Solo para tests: resetea estado en memoria */
export function __resetFISyncForTest(): void {
  if (timer) clearTimeout(timer)
  timer = null
  enviados = new Map<string, string>()
  fallidos401 = new Set<string>()
  prevFp = { fondos: "", egresos: "", ingresos: "" }
  if (unsub) {
    try { unsub() } catch {
      // intencional: vacío por diseño
    }
  }
  unsub = null
  iniciado = false
}

export const __internals = {
  get enviados() { return enviados },
  get fallidos401() { return fallidos401 },
  get deltaActual() { return deltaNoPersistido() },
}
