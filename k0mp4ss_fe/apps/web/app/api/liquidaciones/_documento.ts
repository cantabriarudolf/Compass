/**
 * Documento de la liquidación de sueldo, del lado del SERVIDOR (T10 · serie
 * «Permisos por objeto»).
 *
 * El papel lo arma `documentoLiquidacionPDF` (`lib/pdf-utils`) y esta unidad no
 * agrega un segundo builder: lo único que hace acá es reunir las entradas del
 * builder y compilarlas a bytes para servirlas como respuesta HTTP.
 *
 *   - `liq`: la fila CONGELADA de `LiquidacionPL`. De ahí salen todas las
 *     cifras (haberes, descuentos legales, anticipos, líquido a pagar): no se
 *     recalcula ningún monto al imprimir.
 *   - `trabajador`: nombre y RUT de la persona de la liquidación, leídos de
 *     `Persona`. `LiquidacionPL` guarda `trabajadorPersonaId`, no la identidad:
 *     el papel la necesita y no es una cifra que se pueda recalcular.
 *   - `config`: la proyección de `ConfiguracionGlobal` que el papel imprime
 *     (identidad de la comunidad, administrador responsable y firma). El SMTP y
 *     la clave de eliminación no son parte del documento y no se leen.
 *
 * La firma se resuelve acá porque el papel la espera como data URL y el
 * `urlADataUrl` de `lib/pdf-utils` es de navegador (Image + canvas): en Node
 * devuelve null. Si la firma no se puede resolver, el documento sale igual con
 * la línea en blanco —una firma ausente no puede impedir que el trabajador
 * descargue su liquidación—, con el mismo criterio que el aviso de cobro
 * (`app/api/avisos-cobro/_documento.ts`), que es el módulo gemelo de este.
 */
import type { ConfiguracionGlobal, LiquidacionPL } from "@/lib/schemas"
import { documentoLiquidacionPDF } from "@/lib/pdf-utils"
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

/** La identidad del trabajador que el papel imprime (no vive en la liquidación). */
export interface TrabajadorParaPdf {
  nombreCompleto: string
  rut: string
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
 * Compila la liquidación a bytes de PDF.
 *
 * Síncrono en su entrada (la fila, la persona y la config ya están leídas) y
 * asíncrono por el motor documental y por la firma remota.
 */
export async function pdfDeLiquidacion(
  liq: LiquidacionPL,
  trabajador: TrabajadorParaPdf,
  config: ConfiguracionGlobal
): Promise<Uint8Array<ArrayBuffer>> {
  const definicion = await documentoLiquidacionPDF(
    liq,
    trabajador.nombreCompleto,
    trabajador.rut,
    config,
    await firmaDataUrlDe(config.firmaDigitalizadaUrl ?? null)
  )
  return compilarPdf(definicion)
}
