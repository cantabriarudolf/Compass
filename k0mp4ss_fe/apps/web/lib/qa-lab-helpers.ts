// Helpers puros que sobreviven al retiro del módulo QA/dev (F9).
// Sin dependencia de store (estado inyectado) para testear en Vitest.

/** Marca de dato de prueba: todo id que empieza con `test-`. */
function isTestId(id: string | undefined): boolean {
  return typeof id === "string" && id.startsWith("test-")
}

/**
 * Clasificación de cobros TEST que usa producción: `app/api/cobros-fi/[id]`
 * rechaza la edición de un cobro cuando su id, su unidad o su `origenRef` son TEST.
 */
export function esCobroTest(c: { id: string; unidadId: string; origenRef?: string }): boolean {
  return isTestId(c.id) || isTestId(c.unidadId) || isTestId(c.origenRef ?? undefined)
}
