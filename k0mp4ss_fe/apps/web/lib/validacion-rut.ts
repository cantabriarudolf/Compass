/**
 * Validación y normalización de RUN para el escaneo de la cédula (PE-visitas).
 *
 * El QR del anverso de la cédula electrónica (dic-2024) trae el RUN en la URL
 * del Registro Civil (`…?RUN=16.444.555-0&type=CEDULA`). Ese texto es entrada
 * de usuario en todo menos en el nombre: puede venir con puntos, sin guion, en
 * minúscula o con basura alrededor. Acá se normaliza a la forma canónica
 * `cuerpo-DV` y se valida el **dígito verificador módulo 11**.
 *
 * La aritmética vive en `lib/rut.ts` (`calcularDigitoVerificador`): este módulo
 * NO la reimplementa — una sola fuente de verdad para el DV en todo el repo.
 * Lo que agrega es la puerta del escáner: lo leído nunca se asume válido.
 */
import { calcularDigitoVerificador } from "@/lib/rut"

/** Cuerpo del RUN: 7 u 8 dígitos (los RUN de 5-6 dígitos ya no circulan). */
const CUERPO_RUN = /^\d{7,8}$/
/** Dígito verificador: 0-9 o K (la cédula lo imprime en mayúscula). */
const DV_RUN = /^[\dK]$/

/** Agrupa dígitos con puntos de miles (`16444555` → `16.444.555`). */
function agruparMiles(digitos: string): string {
  const grupos: string[] = []
  for (let i = digitos.length; i > 0; i -= 3) {
    grupos.unshift(digitos.slice(Math.max(0, i - 3), i))
  }
  return grupos.join(".")
}

/**
 * Normaliza cualquier grafía de RUN a `cuerpo-DV` (sin puntos, DV en mayúscula).
 * Devuelve `null` si el texto no tiene forma de RUN — no valida el módulo 11
 * (para eso está `validarRun`).
 *
 * Acepta: `16.444.555-0`, `16444555-0`, `164445550`, `1000005-K`, `1000005k`.
 */
export function normalizarRun(valor: string): string | null {
  if (typeof valor !== "string") return null
  const limpio = valor.trim().toUpperCase().replace(/[.\s]/g, "")
  if (!limpio) return null

  const conGuion = /^(.+)-(.+)$/.exec(limpio)
  let cuerpo: string
  let dv: string
  if (conGuion?.[1] && conGuion[2]) {
    cuerpo = conGuion[1]
    dv = conGuion[2]
  } else if (/^\d{8,9}$/.test(limpio) || /^\d{7}K$/.test(limpio)) {
    // Sin guion: el último carácter es el DV (el cuerpo nunca termina en K).
    cuerpo = limpio.slice(0, -1)
    dv = limpio.slice(-1)
  } else {
    return null
  }

  if (!CUERPO_RUN.test(cuerpo) || !DV_RUN.test(dv)) return null
  return `${cuerpo}-${dv}`
}

/**
 * Puerta del escáner: RUN canónico + dígito verificador módulo 11 correcto.
 * Nunca se asume que lo leído es válido.
 */
export function validarRun(valor: string): boolean {
  const canonico = normalizarRun(valor)
  if (!canonico) return false
  const [cuerpo, dv] = canonico.split("-") as [string, string]
  return calcularDigitoVerificador(cuerpo) === dv
}

/**
 * Variantes de escritura con las que un RUN puede estar guardado en el padrón.
 *
 * La BD de personas nace de los mocks (`15.123.456-9`) pero la API acepta
 * cualquier documento que pase `validarDocumentoIdentidad`, así que el filtro
 * server-side busca por las dos formas en vez de adivinar una. Devuelve `[]`
 * cuando el valor no es un RUN canónico: el llamador decide qué hacer con eso.
 */
export function variantesRun(valor: string): string[] {
  const canonico = normalizarRun(valor)
  if (!canonico) return []
  const [cuerpo, dv] = canonico.split("-") as [string, string]
  return Array.from(
    new Set([canonico, `${agruparMiles(cuerpo)}-${dv}`, `${cuerpo}${dv}`])
  )
}

/**
 * RUN enmascarado para mostrar en pantalla de conserjería: se ocultan todos los
 * dígitos del cuerpo salvo el primer grupo de miles (1-2 dígitos). El DV se
 * mantiene porque el conserje lo necesita para contrastar con la cédula.
 *
 * `16.444.555-0` → `16.***.***-0` · `1.000.005-K` → `1.***.***-K`.
 * Devuelve `null` si no es un RUN.
 */
export function mascararRun(valor: string): string | null {
  const canonico = normalizarRun(valor)
  if (!canonico) return null
  const [cuerpo, dv] = canonico.split("-") as [string, string]
  // Se enmascara por grupo de miles, no por substring: así los puntos quedan
  // alineados como en el RUT real y nunca se filtran dígitos del medio.
  const grupos = agruparMiles(cuerpo).split(".")
  const enmascarado = grupos
    .map((grupo, indice) => (indice === 0 ? grupo : "*".repeat(grupo.length)))
    .join(".")
  return `${enmascarado}-${dv}`
}
