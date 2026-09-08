/**
 * Generador de IDs únicos con prefijo y timestamp.
 * Centraliza el patrón Date.now() + Math.random() que se repetía 27+ veces en store.ts.
 * Determinístico en tests cuando se mockea Date.now() y Math.random.
 */
export function generarId(prefijo: string, idx?: number): string {
  const stamp = Date.now()
  const rnd = Math.random().toString(36).slice(2, 8)
  return idx !== undefined ? `${prefijo}-${stamp}-${idx}-${rnd}` : `${prefijo}-${stamp}-${rnd}`
}
