/**
 * F16 — política de privacidad versionada: finalidades, base legal y acuse.
 *
 * Asesoría normativa 2026-10-25: la mayor parte del tratamiento de datos de la
 * plataforma se apoya en el contrato de copropiedad, en obligaciones legales o
 * en interés legítimo, NO en consentimiento. Por eso el banner no es un
 * «acepto todo»: es información + acuse de la política versionada, y el
 * consentimiento queda reservado a finalidades opcionales (hoy ninguna activa).
 *
 * Esta es la única fuente de verdad compartida entre el banner
 * (`components/consent-banner.tsx`) y la política visible
 * (`app/privacidad/page.tsx`).
 *
 * El acuse vive en `localStorage` con la misma clave que el banner anterior:
 * el valor pasa del booleano "aceptado" a un JSON `{ version, fecha }`. Un
 * valor legacy ("aceptado") no es un acuse válido, así que quien lo tenía ve
 * el aviso una vez más, ahora con las finalidades declaradas.
 */

/** Versión de la política: bump obligatorio ante cambio de finalidades o base legal. */
export const VERSION_POLITICA_PRIVACIDAD = "1.0"

/** Clave de `localStorage` del acuse (heredada del banner anterior). */
export const CLAVE_ACUSE_PRIVACIDAD = "compass-consentimiento-privacidad"

/** Contrato mínimo de storage: `window.localStorage` lo cumple. */
export interface Almacenamiento {
  getItem(clave: string): string | null
  setItem(clave: string, valor: string): void
  removeItem(clave: string): void
}

/** Acuse registrado: qué versión de la política se vio y cuándo. */
export interface AcusePrivacidad {
  version: string
  /** Fecha ISO del acuse. */
  fecha: string
}

export interface FinalidadPrivacidad {
  id: string
  nombre: string
  /** Base legal en lenguaje llano, no cita normativa. */
  baseLegal: string
  detalle: string
  /** true sólo si el tratamiento necesita consentimiento del titular. */
  requiereConsentimiento: boolean
  /** false si la finalidad está declarada pero aún no operativa. */
  activa: boolean
}

export const FINALIDADES_PRIVACIDAD: FinalidadPrivacidad[] = [
  {
    id: "operacion-comunidad",
    nombre: "Operación de la comunidad",
    baseLegal: "Ejecución del contrato de copropiedad",
    detalle:
      "Mantener cuentas, pertenencias, roles y la gestión diaria de la comunidad: gastos comunes, reservas, multas y documentación.",
    requiereConsentimiento: false,
    activa: true,
  },
  {
    id: "seguridad-acceso",
    nombre: "Seguridad y control de acceso",
    baseLegal: "Interés legítimo y obligación legal",
    detalle:
      "Registros de actividad, bitácora de conserjería (visitas y encomiendas) y control de acceso para proteger a las personas y la propiedad.",
    requiereConsentimiento: false,
    activa: true,
  },
  {
    id: "comunicaciones-operativas",
    nombre: "Comunicaciones operativas al residente",
    baseLegal: "Ejecución del contrato de copropiedad",
    detalle:
      "Avisos necesarios para la relación con la comunidad: liquidaciones, circulares de administración y alertas del edificio.",
    requiereConsentimiento: false,
    activa: true,
  },
  {
    id: "comunicaciones-no-operativas",
    nombre: "Comunicaciones no operativas",
    baseLegal: "Consentimiento del titular",
    detalle:
      "Comunicaciones que no son necesarias para la operación (por ejemplo, novedades o promocionales). Esta finalidad hoy NO está activa: no se envían estas comunicaciones y no se pide consentimiento por ellas.",
    requiereConsentimiento: true,
    activa: false,
  },
]

/** Lee el acuse registrado; devuelve `null` si no hay, es corrupto o legacy. */
export function leerAcuse(almacen: Almacenamiento): AcusePrivacidad | null {
  try {
    const crudo = almacen.getItem(CLAVE_ACUSE_PRIVACIDAD)
    if (!crudo) return null
    const dato: unknown = JSON.parse(crudo)
    if (typeof dato !== "object" || dato === null) return null
    const { version, fecha } = dato as Record<string, unknown>
    if (typeof version !== "string" || version.length === 0) return null
    if (typeof fecha !== "string" || fecha.length === 0) return null
    return { version, fecha }
  } catch {
    return null
  }
}

/** Registra el acuse y lo devuelve. */
export function registrarAcuse(
  almacen: Almacenamiento,
  acuse: AcusePrivacidad
): AcusePrivacidad {
  almacen.setItem(CLAVE_ACUSE_PRIVACIDAD, JSON.stringify(acuse))
  return acuse
}

/** Borra el acuse: la revocación cuesta lo mismo que otorgar. */
export function retirarAcuse(almacen: Almacenamiento): void {
  almacen.removeItem(CLAVE_ACUSE_PRIVACIDAD)
}

/** Vigente sólo si la versión registrada coincide con la versión actual. */
export function acuseVigente(acuse: AcusePrivacidad | null): boolean {
  return acuse !== null && acuse.version === VERSION_POLITICA_PRIVACIDAD
}
