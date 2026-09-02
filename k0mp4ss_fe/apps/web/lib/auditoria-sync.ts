"use client"

import { useCompassStore } from "@/lib/store"

const DEBOUNCE_MS = 2000

let timer: ReturnType<typeof setTimeout> | null = null
let enviados = new Set<string>()
let fallidos401 = new Set<string>()
let unsub: (() => void) | null = null
let iniciado = false

function deltaNoPersistido(): import("@/lib/store").EventoAuditoria[] {
  const eventos = useCompassStore.getState().eventos
  return eventos.filter((e) => !enviados.has(e.id) && !fallidos401.has(e.id))
}

async function flush(): Promise<void> {
  const delta = deltaNoPersistido()
  if (delta.length === 0) return
  try {
    const res = await fetch("/api/auditoria/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventos: delta }),
    })
    if (res.status === 401) {
      // No reintentar en loop: marcar ids como fallidos y esperar próximo cambio de eventos
      for (const ev of delta) fallidos401.add(ev.id)
      return
    }
    if (!res.ok) {
      // Error transitorio: no marcar como enviado, reintentará en próximo cambio
      return
    }
    for (const ev of delta) enviados.add(ev.id)
  } catch {
    // Silencioso: reintentará en próximo cambio
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
 * Suscribe al store detectando cambios en `eventos` (length / último id),
 * acumula delta no persistido y hace POST debounced a los 2s del último cambio.
 * Manejo de error silencioso; si 401 no reintenta en loop.
 * Retorna función para desuscribir (útil en tests).
 */
export function iniciarSyncAuditoria(): (() => void) | void {
  if (iniciado) return unsub ?? undefined
  iniciado = true

  // Inicia con marca vacía; cada mount nuevo inicia desde 0 (idempotente por upsert)
  // No limpiamos enviados en reinicio para evitar re-envío masivo en tests.

  unsub = useCompassStore.subscribe((state, prevState) => {
    const eventos = state.eventos as import("@/lib/store").EventoAuditoria[]
    const prevEventos = (prevState as { eventos?: import("@/lib/store").EventoAuditoria[] })?.eventos
    if (!prevEventos) {
      if (eventos.length === 0) return
    } else {
      if (eventos.length === prevEventos.length && eventos[0]?.id === prevEventos[0]?.id && eventos[eventos.length - 1]?.id === prevEventos[prevEventos.length - 1]?.id) {
        // Chequeo rápido length + ids extremos; si igual, posible mismo array
        // Comparar último id es suficiente para cambios append-only
        if (eventos.length === prevEventos.length) return
      }
      // Si solo cambió contenido sin cambiar length (poco probable, eventos solo append), igual schedule
    }
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
export function __resetAuditoriaSyncForTest(): void {
  if (timer) clearTimeout(timer)
  timer = null
  enviados = new Set<string>()
  fallidos401 = new Set<string>()
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
}
