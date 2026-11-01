/**
 * Lectura del QR de la cédula de identidad chilena (PE-visitas).
 *
 * Alcance (decisión del owner, 2026-10-22):
 * - La cédula **nueva** (electrónica, desde dic-2024) imprime en el anverso un
 *   QR que apunta al Registro Civil con el RUN como parámetro:
 *   `https://www.registrocivil.cl/…?RUN=16.444.555-0&type=CEDULA`.
 * - La cédula **anterior** no tiene QR: trae PDF417 en el reverso (propietario
 *   del Registro Civil, sin parser público confiable) y zona MRZ (OCR frágil).
 *   Ninguno de los dos se implementa acá: el flujo cae a búsqueda manual por
 *   RUT, que es el fallback obligatorio.
 * - NFC/chip: no es viable desde un navegador de escritorio.
 *
 * Este módulo es puro y no toca el DOM: recibe el texto crudo del decodificador
 * y devuelve el RUN canónico. La validación del dígito verificador vive en
 * `lib/validacion-rut.ts` y el llamador DEBE aplicarla antes de usar el RUN.
 *
 * También vive acá la geometría del recuadro guía del escáner (`centroDentroDelMarco`,
 * `lecturaEncuadrada`): es aritmética pura y así se puede probar sin cámara.
 */
import { normalizarRun } from "@/lib/validacion-rut"

export { normalizarRun, validarRun, variantesRun, mascararRun } from "@/lib/validacion-rut"

/** Parámetro `RUN` (o `run`) de la URL del Registro Civil. */
const PARAMETRO_RUN = /[?&#](?:run)=([^&#\s]+)/i

/**
 * Intenta sacar el RUN del parámetro de una URL del Registro Civil.
 * Devuelve `null` si el texto no trae el parámetro.
 */
function runDesdeUrl(texto: string): string | null {
  const match = PARAMETRO_RUN.exec(texto)
  const crudo = match?.[1]
  if (!crudo) return null
  try {
    return decodeURIComponent(crudo)
  } catch {
    // `%` mal escapado en el QR: se intenta con el valor tal cual.
    return crudo
  }
}

/**
 * Extrae el RUN del texto leído en un QR.
 *
 * Acepta la URL del Registro Civil (`?RUN=…`) y también un RUN pelado con
 * puntos, guion, sin guion o con espacios (`16.444.555-0`, `16444555-0`,
 * `164445550`). Normaliza a `cuerpo-DV` en mayúscula.
 *
 * Devuelve `null` cuando el texto no contiene un RUN: el llamador lo traduce a
 * "el QR no corresponde a una cédula" y NUNCA registra una visita con eso.
 * No valida el módulo 11: eso es `validarRun`.
 */
export function extraerRunDeQr(texto: string): string | null {
  if (typeof texto !== "string") return null
  const bruto = texto.trim()
  if (!bruto) return null

  const desdeUrl = runDesdeUrl(bruto)
  const candidato = desdeUrl ?? bruto
  return normalizarRun(candidato)
}

/** Punto en un sistema de coordenadas cualquiera (píxeles del video o de la pantalla). */
export interface Punto {
  x: number
  y: number
}

/** Rectángulo alineado a los ejes: esquina superior izquierda más tamaño. */
export interface Marco {
  x: number
  y: number
  ancho: number
  alto: number
}

/** Lado del recuadro guía como fracción del ancho renderizado del `<video>`. */
export const FRACCION_MARCO_GUIA = 0.6

/**
 * Medidas que hacen falta para ubicar el recuadro y el código detectado.
 *
 * `ancho`/`alto` son las dimensiones RENDERIZADAS del elemento (px CSS, de
 * `getBoundingClientRect`); `anchoReal`/`altoReal` son las del video real
 * (`videoWidth`/`videoHeight`). Mezclar ambas sin escalar es el error clásico:
 * en una pantalla retina el video real mide el doble que lo renderizado.
 */
export interface CajaVideo {
  ancho: number
  alto: number
  anchoReal: number
  altoReal: number
}

/**
 * ¿El centro del código cae dentro del recuadro guía?
 *
 * Ambos argumentos tienen que estar en el MISMO sistema de coordenadas (el
 * llamador convierte los píxeles del video real a píxeles CSS del elemento).
 *
 * - Borde inclusivo: un centro justo sobre el borde cuenta como adentro.
 * - Un recuadro de tamaño cero (o con medidas no finitas) no contiene nada:
 *   devuelve `false`. La falta de dato se resuelve en `lecturaEncuadrada`.
 */
export function centroDentroDelMarco(centro: Punto, marco: Marco): boolean {
  if (!(marco.ancho > 0) || !(marco.alto > 0)) return false
  return (
    centro.x >= marco.x &&
    centro.x <= marco.x + marco.ancho &&
    centro.y >= marco.y &&
    centro.y <= marco.y + marco.alto
  )
}

/**
 * Política del escáner: sólo se descarta la lectura si hay geometría suficiente
 * para afirmar que el código está FUERA del recuadro.
 *
 * `centro` llega en `null` cuando el motor no informó caja ni esquinas, y `marco`
 * en `null` cuando el `<video>` todavía no tiene dimensiones renderizadas. En
 * ambos casos se acepta la lectura, igual que antes del recuadro: bloquear por
 * falta de dato dejaría al conserje sin escáner.
 */
export function lecturaEncuadrada(centro: Punto | null, marco: Marco | null): boolean {
  if (!centro || !marco) return true
  return centroDentroDelMarco(centro, marco)
}

/**
 * Recuadro guía en píxeles CSS, relativo a la esquina del `<video>`.
 *
 * Es un cuadrado centrado de `FRACCION_MARCO_GUIA` del ancho renderizado,
 * recortado a la altura disponible: si el video es más bajo que ese cuadrado, el
 * marco se achica para no salirse del área visible (el overlay y el cálculo de
 * «adentro» usan este mismo rectángulo, así el verde nunca miente).
 *
 * Devuelve `null` mientras el video no tenga dimensiones renderizadas: sin
 * medida no hay marco que juzgar.
 */
export function marcoGuia(caja: { ancho: number; alto: number }): Marco | null {
  const lado = Math.min(caja.ancho * FRACCION_MARCO_GUIA, caja.alto)
  if (!(lado > 0)) return null
  return { x: (caja.ancho - lado) / 2, y: (caja.alto - lado) / 2, ancho: lado, alto: lado }
}

/**
 * Convierte un punto del video REAL a píxeles CSS del elemento, que es el sistema
 * donde vive el recuadro guía.
 *
 * El `<video>` se pinta con `object-cover`: la imagen se escala por
 * `max(anchoCaja/anchoReal, altoCaja/altoReal)` y se recorta centrada, así que hay
 * que aplicar esa escala y sumar el desplazamiento (negativo) del recorte. Sin
 * `videoWidth`/`videoHeight` (frame sin metadatos todavía) devuelve `null`, y la
 * lectura se acepta sin geometría.
 */
export function centroEnCaja(centro: Punto, caja: CajaVideo): Punto | null {
  const { ancho, alto, anchoReal, altoReal } = caja
  if (!(anchoReal > 0) || !(altoReal > 0) || !(ancho > 0) || !(alto > 0)) return null
  const escala = Math.max(ancho / anchoReal, alto / altoReal)
  return {
    x: centro.x * escala + (ancho - anchoReal * escala) / 2,
    y: centro.y * escala + (alto - altoReal * escala) / 2,
  }
}

/**
 * Inversa de `centroEnCaja`: pasa un rectángulo en píxeles CSS del elemento a
 * píxeles NATIVOS del video.
 *
 * Es lo que necesita el recorte del recuadro guía: decodificar el marco en
 * resolución nativa (en 1080p son más píxeles que todo el frame que antes se
 * decodificaba escalado) y no en píxeles CSS. Sin dimensiones devuelve `null`.
 */
export function marcoEnVideo(marco: Marco, caja: CajaVideo): Marco | null {
  const { ancho, alto, anchoReal, altoReal } = caja
  if (!(anchoReal > 0) || !(altoReal > 0) || !(ancho > 0) || !(alto > 0)) return null
  const escala = Math.max(ancho / anchoReal, alto / altoReal)
  const desplazamientoX = (ancho - anchoReal * escala) / 2
  const desplazamientoY = (alto - altoReal * escala) / 2
  return {
    x: (marco.x - desplazamientoX) / escala,
    y: (marco.y - desplazamientoY) / escala,
    ancho: marco.ancho / escala,
    alto: marco.alto / escala,
  }
}
