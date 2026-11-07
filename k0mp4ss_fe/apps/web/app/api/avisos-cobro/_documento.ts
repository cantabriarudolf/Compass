/**
 * Documento del aviso de cobro, del lado del SERVIDOR (F27 · T7).
 *
 * El papel lo arma `documentoAvisoCobroPDF` (`lib/pdf-utils`) y esta unidad no
 * agrega un segundo builder: lo único que hace acá es reunir las tres entradas
 * del builder y compilarlas a bytes para servirlas como respuesta HTTP.
 *
 *   - `aviso`: la fila CONGELADA de `AvisoCobro` (folio, código, período,
 *     fechas y `contenido`). De ahí salen todas las cifras: no se recalcula
 *     ningún monto al imprimir.
 *   - `config`: la proyección de `ConfiguracionGlobal` que el papel imprime
 *     (identidad de la comunidad, administrador responsable y firma). El SMTP y
 *     la clave de eliminación no son parte del documento y no se leen.
 *   - `hash`: `hashContenido(contenido)`, la huella del contenido congelado que
 *     el papel imprime para poder verificarlo.
 *
 * La firma se resuelve acá porque el papel la espera como data URL y el
 * `urlADataUrl` de `lib/pdf-utils` es de navegador (Image + canvas). Si la firma
 * no se puede resolver, el documento sale igual con la línea en blanco: la
 * firma no puede impedir que el residente descargue su aviso.
 */
import type { ConfiguracionGlobal } from "@/lib/schemas"
import { hashContenido } from "@/lib/aviso-cobro"
import { documentoAvisoCobroPDF } from "@/lib/pdf-utils"
import { compilarPdf } from "@/lib/api/pdf-servidor"

/**
 * Columnas de CF que el papel imprime: identidad de la comunidad, administrador
 * responsable y firma. Es lo que necesita el PDF; el SMTP y la clave de
 * eliminación NO son parte del documento y no salen de acá.
 */
export const COLUMNAS_DOCUMENTO = {
  nombreComunidad: true,
  direccionOficial: true,
  rutComunidad: true,
  administradorResponsable: true,
  rutAdministrador: true,
  firmaDigitalizadaUrl: true,
} as const

/** La fila del aviso que el builder necesita (columnas + `contenido` congelado). */
export interface AvisoParaPdf {
  folio: string
  codigoVerificacion: string
  periodo: string
  fechaEmision: string
  vencimiento: string | null
  contenido: unknown
}

/** La firma remota no puede colgar el PDF ni inflar la respuesta. */
const FIRMA_TIMEOUT_MS = 2_000
const FIRMA_MAX_BYTES = 2 * 1024 * 1024

/**
 * Firma de CF resuelta a data URL, o `null` si no se puede resolver.
 *
 * `data:` ya es data URL y se pasa tal cual. `http(s)` se descarga con timeout y
 * tope de tamaño: es la misma firma que la pantalla embebe, pero sin DOM. Cual
 * otro valor (una ruta relativa, un archivo inexistente) no es cargable como
 * imagen y el bloque de firma queda en blanco.
 */
async function firmaDataUrlDe(
  firmaDigitalizadaUrl: string | null
): Promise<string | null> {
  if (!firmaDigitalizadaUrl) return null
  if (/^data:/i.test(firmaDigitalizadaUrl)) return firmaDigitalizadaUrl
  if (!/^https?:\/\//i.test(firmaDigitalizadaUrl)) return null
  try {
    const res = await fetch(firmaDigitalizadaUrl, {
      signal: AbortSignal.timeout(FIRMA_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > FIRMA_MAX_BYTES) return null
    const tipo =
      (res.headers.get("content-type") ?? "image/png").split(";")[0]?.trim() ||
      "image/png"
    return `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}`
  } catch {
    // Mismo criterio que `urlADataUrl` en el cliente: sin firma cargable el
    // papel sale con la línea en blanco, nunca sin documento.
    return null
  }
}

/**
 * Compila el aviso a bytes de PDF.
 *
 * Síncrono en su entrada (la fila y la config ya están leídas) y asíncrono solo
 * porque el motor documental compila en promesas.
 */
export async function pdfDeAviso(
  aviso: AvisoParaPdf,
  config: ConfiguracionGlobal
): Promise<Uint8Array<ArrayBuffer>> {
  const definicion = documentoAvisoCobroPDF({
    aviso,
    config,
    firmaDataUrl: await firmaDataUrlDe(config.firmaDigitalizadaUrl ?? null),
    hash: hashContenido(aviso.contenido),
  })
  return compilarPdf(definicion)
}
