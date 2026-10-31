"use client"

import { useEffect } from "react"

/**
 * F22 — limpieza única de la clave `compass-store` que dejó el store legacy.
 *
 * F22a retiró el store legacy del navegador: `lib/store.ts` ya no configura
 * `persist`, así que la clave `compass-store` que quedó en `localStorage` no la
 * lee ni la escribe nadie. Es un snapshot huérfano de datos de dominio
 * (personas, unidades, vínculos, finanzas) que el producto ya no usa: se borra
 * una vez por navegador y no se vuelve a crear.
 *
 * CUIDADO: la clave es exactamente `compass-store`. `lib/store-ui.ts` usa
 * `compass-ui-store` y SIGUE VIVO (paneles, filtros, modales, toasts): borrar
 * esa clave rompe el estado de UI. No tocar ninguna otra clave de
 * `localStorage`.
 *
 * Montado una sola vez en `app/layout.tsx`, donde antes se montaban los espejos
 * `AuditoriaSyncInit` y `FISyncInit`.
 */

const CLAVE_STORE_RETIRADO = "compass-store"

/**
 * Evita repetir el borrado si el layout se vuelve a montar (StrictMode en dev,
 * Fast Refresh). `removeItem` es idempotente, así que la bandera es sólo para
 * cumplir «una sola vez» al pie de la letra.
 */
let limpiezaHecha = false

export function LimpiezaStoreLegacy() {
  useEffect(() => {
    if (limpiezaHecha) return
    limpiezaHecha = true
    try {
      localStorage.removeItem(CLAVE_STORE_RETIRADO)
    } catch {
      // Safari en navegación privada lanza al tocar `localStorage`: no hay nada
      // que reportar y este error no debe romper el render. La clave no la lee
      // ningún módulo, así que si sobrevive no cambia el comportamiento.
    }
  }, [])

  return null
}
