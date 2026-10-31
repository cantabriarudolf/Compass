// Helpers puros que sobrevivieron al retiro del store legacy (F22a).
// No hay estado acá: el store que los llamaba ya no existe. Solo quedan los
// símbolos con consumidores en el producto; el resto (upsert, nombrePersona,
// refUnidad, resolverVariablesCO, rolDestinatarioCO, siguienteCodigoIR,
// siguienteFolioRA, siguienteFolioFE, getDeudaVigenteFI, registrarEvento,
// MAX_EVENTOS y SetStateFn) se retiró con las acciones que los usaban.
import type { PeriodoDirectiva, Persona } from "@/lib/schemas"

/** Contrato de retorno de las acciones de escritura; lo consumen los hooks de `lib/api/use-*.ts`. */
export type StoreResult = { ok: boolean; error?: string }

// GD-períodos: helpers de vigencia (libro: la directiva vigente = período
// vigente + fichas sin término; fichas sin periodoId = legado pre-períodos).
// `@/lib/store` los re-exportaba cuando el store era la puerta pública; hoy los
// importan directo `app/comunidad/directiva` y `app/comunidad/certificados`.
export const periodoDirectivaVigente = (s: {
  periodosDirectiva: PeriodoDirectiva[]
}): PeriodoDirectiva | undefined =>
  s.periodosDirectiva.find((p) => p.estado === "vigente")

export const esMiembroDirectivaVigente = (
  persona: Persona,
  vigenteId: string | undefined
): boolean => {
  const ficha = persona.datosGobernanza
  if (!ficha || persona.estadoCuenta !== "activa" || ficha.fechaTermino)
    return false
  // Legado pre-períodos: cuenta solo si aún no hay período registrado;
  // al activar un período, el quórum se acota a su nómina.
  if (!ficha.periodoId) return vigenteId === undefined
  return ficha.periodoId === vigenteId
}
