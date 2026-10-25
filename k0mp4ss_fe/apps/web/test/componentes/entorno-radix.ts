// @vitest-environment jsdom
/**
 * Stubs de jsdom que Radix (Select/Switch/Dialog) necesita para abrir y clickear.
 *
 * Vive aparte porque lo usan varios archivos de test de componentes PE: duplicar el bloque en
 * cada uno hacía que un panel nuevo fallara con `target.hasPointerCapture is not a function`
 * en vez de con su propio caso.
 *
 * No incluye los stubs de media (`HTMLMediaElement.play`): esos son del escáner de QR y los
 * instala quien lo monta.
 */
export function instalarEntornoRadix(): void {
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.HTMLElement.prototype.scrollTo = () => {}
  Object.defineProperty(window.HTMLElement.prototype, "hasPointerCapture", {
    value: () => false,
    configurable: true,
  })
  Object.defineProperty(window.HTMLElement.prototype, "releasePointerCapture", {
    value: () => {},
    configurable: true,
  })
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "ResizeObserver", {
    value: ResizeObserverStub,
    configurable: true,
    writable: true,
  })
}
