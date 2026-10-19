import * as React from "react"

const MOBILE_BREAKPOINT = 768
const CONSULTA_VIEWPORT = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Suscripción a los cambios de viewport. Mismo contrato que el `useEffect` anterior:
 * escucha `change` del media query y desuscribe en el cleanup.
 */
function suscribirAlViewport(onCambio: () => void) {
  const mql = window.matchMedia(CONSULTA_VIEWPORT)
  mql.addEventListener("change", onCambio)
  return () => mql.removeEventListener("change", onCambio)
}

/** Lectura del viewport actual (mismo cálculo que hacía el efecto: `window.innerWidth`). */
function leerViewport() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

/**
 * Snapshot de servidor: sin `window` no hay viewport, y el valor inicial histórico del
 * hook era `false` (el estado previo arrancaba en `undefined` → `!!undefined === false`).
 * Preservarlo mantiene el HTML de SSR/hidratación idéntico al de antes.
 */
function leerViewportEnServidor() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(suscribirAlViewport, leerViewport, leerViewportEnServidor)
}
