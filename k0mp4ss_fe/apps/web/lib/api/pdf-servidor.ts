/**
 * pdf-servidor — compila una definición pdfmake a bytes, del lado del SERVIDOR.
 *
 * `lib/pdf-utils` arma los documentos y los descarga en el navegador
 * (`descargarPdf` + `<a download>`), que no existe en una API route. Las rutas
 * que sirven el documento como respuesta HTTP necesitan los BYTES: acá se usa el
 * mismo build de pdfmake que ya declara `lib/pdfmake-modules.d.ts` y las fuentes
 * virtuales de `pdfmake/build/vfs_fonts`.
 *
 * Por qué las fuentes virtuales y no los `.ttf` de `node_modules`: en producción
 * el bundle del servidor no lleva esos archivos y `pdfmake` no podría leerlos
 * del disco. El VFS viaja como base64 dentro del propio bundle, así que el
 * documento sale igual en desarrollo, en la suite y en el deploy.
 *
 * El documento NO se arma acá: el builder es de cada papel
 * (`documentoAvisoCobroPDF`, `documentoCertificadoPDF`, ...) y esta función solo
 * lo compila.
 */

/** Lo que se usa del build de pdfmake (el módulo no trae tipos: ver `lib/pdfmake-modules.d.ts`). */
interface PdfMakeServidor {
  addVirtualFileSystem?: (vfs: Record<string, string>) => void
  /** Camino de compatibilidad: el build viejo exponía el VFS como propiedad. */
  vfs?: Record<string, string>
  createPdf: (definicion: Record<string, unknown>) => {
    getBlob: () => Promise<Blob>
  }
}

/** Se carga una sola vez por proceso: compilar no reserva estado entre documentos. */
let pdfMakePromise: Promise<PdfMakeServidor> | null = null

async function cargarPdfMake(): Promise<PdfMakeServidor> {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const mod = (await import("pdfmake/build/pdfmake")) as {
        default?: PdfMakeServidor
      } & Partial<PdfMakeServidor>
      const pdfMake = (mod.default ?? mod) as PdfMakeServidor

      const vfsMod = (await import("pdfmake/build/vfs_fonts")) as {
        default?: Record<string, string>
        "module.exports"?: Record<string, string>
      }
      const vfs =
        vfsMod.default ??
        vfsMod["module.exports"] ??
        (vfsMod as unknown as Record<string, string>)

      if (typeof pdfMake.addVirtualFileSystem === "function") {
        pdfMake.addVirtualFileSystem(vfs)
      } else {
        pdfMake.vfs = { ...(pdfMake.vfs ?? {}), ...vfs }
      }
      return pdfMake
    })()
  }
  return pdfMakePromise
}

/**
 * Compila la definición y devuelve el PDF como bytes.
 *
 * Falla con un error nombrado si el motor no produce un documento: servir un
 * cuerpo vacío con `content-type: application/pdf` sería declarar un papel que
 * no existe (mismo criterio que `descargarPdf` en el cliente).
 */
export async function compilarPdf(
  definicion: Record<string, unknown>
): Promise<Uint8Array<ArrayBuffer>> {
  const pdfMake = await cargarPdfMake()
  const blob = await pdfMake.createPdf(definicion).getBlob()
  if (!blob || blob.size === 0) {
    throw new Error(
      "El documento salió vacío: no hay bytes de PDF que servir."
    )
  }
  return new Uint8Array(await blob.arrayBuffer())
}
