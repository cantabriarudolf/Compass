/**
 * pdf-utils — `descargarPdf` sólo puede decir "listo" si el PDF existe.
 *
 * El defecto que este archivo congela: `descargarPdf` llamaba
 * `createPdf(doc).download(fileName)` sin esperarlo, así que resolvía antes de
 * que pdfmake renderizara el blob. Toda pantalla mostraba el banner verde de
 * éxito ("PDF generado") aunque no se hubiera descargado nada, y el fallo real
 * quedaba como excepción no capturada, fuera del `try/catch` del caller.
 *
 * Acá se verifica el contrato por el camino observable, con el motor falso
 * (sin navegador y sin renderizar un PDF de verdad):
 *   - si el documento no se puede armar, la promesa RECHAZA nombrando el fallo y
 *     no se dispara ninguna descarga;
 *   - si el documento se arma, la descarga ocurre DESPUÉS de tener el blob y la
 *     promesa resuelve;
 *   - un blob vacío tampoco se reporta como éxito.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const motor = vi.hoisted(() => {
  const getBlob = vi.fn()
  // `download` imita al de pdfmake 0.3: es async y espera el blob por dentro.
  // El defecto no era que pdfmake no esperara, sino que el caller no esperaba a
  // pdfmake: la promesa quedaba flotando y la pantalla confirmaba igual.
  const download = vi.fn(async () => {
    await getBlob()
  })
  const createPdf = vi.fn(() => ({ getBlob, download }))
  return {
    getBlob,
    download,
    createPdf,
    pdfMake: { addVirtualFileSystem: vi.fn(), createPdf },
  }
})

vi.mock("pdfmake/build/pdfmake", () => ({
  default: motor.pdfMake,
  ...motor.pdfMake,
}))
vi.mock("pdfmake/build/vfs_fonts", () => ({ default: {} }))

const { descargarPdf } = await import("@/lib/pdf-utils")

const NOMBRE = "aviso-cobro-AC-0001.pdf"

describe("descargarPdf — la descarga se dispara sólo con un documento construido", () => {
  let clics: ReturnType<typeof vi.fn>
  let descargaDelEnlace: string[]
  let crearObjectUrl: ReturnType<typeof vi.fn>

  beforeEach(() => {
    motor.getBlob.mockReset()
    motor.download.mockClear()
    motor.createPdf.mockClear()
    descargaDelEnlace = []
    crearObjectUrl = vi.fn(() => "blob:pdf-falso")
    // jsdom no implementa object URLs: se declaran para observar el disparo.
    Object.assign(URL, {
      createObjectURL: crearObjectUrl,
      revokeObjectURL: vi.fn(),
    })
    clics = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        descargaDelEnlace.push(this.download)
      }
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("rechaza nombrando el fallo y no descarga nada cuando pdfmake no puede armar el documento", async () => {
    motor.getBlob.mockRejectedValue(
      new Error(
        'Unrecognized document structure: {"0":{"text":" "},"marginTop":30}'
      )
    )

    await expect(
      descargarPdf({ content: [] }, NOMBRE)
    ).rejects.toThrow(/Unrecognized document structure/)

    // El mensaje dice qué documento falló: el caller lo muestra tal cual.
    await expect(descargarPdf({ content: [] }, NOMBRE)).rejects.toThrow(NOMBRE)
    expect(crearObjectUrl).not.toHaveBeenCalled()
    expect(descargaDelEnlace).toEqual([])
  })

  it("rechaza cuando el documento sale vacío en vez de confirmar una descarga inexistente", async () => {
    motor.getBlob.mockResolvedValue(new Blob([], { type: "application/pdf" }))

    await expect(descargarPdf({ content: [] }, NOMBRE)).rejects.toThrow(
      /salió vacío/
    )
    expect(crearObjectUrl).not.toHaveBeenCalled()
    expect(descargaDelEnlace).toEqual([])
  })

  it("descarga el blob ya construido y resuelve sólo después de tenerlo", async () => {
    motor.getBlob.mockImplementation(async () => {
      descargaDelEnlace.push("blob-listo")
      return new Blob(["%PDF-1.7 aviso"], { type: "application/pdf" })
    })

    await descargarPdf({ content: [] }, NOMBRE)

    // La descarga es posterior al blob: primero se compila, después se guarda.
    expect(descargaDelEnlace).toEqual(["blob-listo", NOMBRE])
    expect(crearObjectUrl).toHaveBeenCalledTimes(1)
    expect(motor.createPdf).toHaveBeenCalledWith({ content: [] })
    expect(motor.download).not.toHaveBeenCalled()
  })
})
