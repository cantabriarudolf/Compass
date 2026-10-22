// @vitest-environment jsdom
/**
 * Contrato del escáner del QR de la cédula (PE-visitas).
 *
 * Lo que fija:
 * - Con `getUserMedia` y un `BarcodeDetector` que devuelve la URL del Registro
 *   Civil, el componente emite el RUN ya normalizado y valida el módulo 11.
 * - Un QR sin RUN (promoción, sitio web) o con el dígito verificador malo NO
 *   emite nada: devuelve un error legible.
 * - Si el permiso se niega o no hay `getUserMedia`, cae al modo manual con
 *   mensaje claro y sin crash.
 * - La cámara se apaga al detectar y al desmontar (no queda el LED prendido).
 * - Safari/Firefox no exponen `BarcodeDetector`: se usa `@zxing/browser`.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  EscaneoQrCedula,
  MENSAJE_PERMISO,
  MENSAJE_QR_NO_CEDULA,
  MENSAJE_RUN_INVALIDO,
  MENSAJE_SIN_CAMARA,
} from "@/components/pe/escaneo-qr-cedula"

const URL_CEDULA =
  "https://www.registrocivil.cl/servicios-en-linea/valida-documento?RUN=16.444.555-0&type=CEDULA"
const URL_QR_AJENO = "https://example.com/promo?utm=volante"
const URL_CEDULA_DV_MALO =
  "https://www.registrocivil.cl/servicios-en-linea/valida-documento?type=CEDULA&RUN=16444555-1"

/** Decodificador zxing falso (se usa solo cuando NO hay BarcodeDetector). */
const zxing = vi.hoisted(() => ({
  leer: vi.fn<() => Promise<{ getText: () => string }>>(),
}))
vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    decodeOnceFromVideoElement = zxing.leer
  },
}))

interface CamaraFalsa {
  stop: ReturnType<typeof vi.fn>
  getUserMedia: ReturnType<typeof vi.fn>
}

/** Instala una cámara falsa en `navigator.mediaDevices`. */
function instalarCamara(opciones: { rechazar?: unknown } = {}): CamaraFalsa {
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
  const getUserMedia = vi.fn(() =>
    opciones.rechazar ? Promise.reject(opciones.rechazar) : Promise.resolve(stream)
  )
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
  })
  return { stop, getUserMedia }
}

/** Instala un `BarcodeDetector` falso que devuelve los valores indicados, en orden. */
function instalarDetector(valores: (string | null)[]): ReturnType<typeof vi.fn> {
  const pendientes = [...valores]
  const detect = vi.fn(async () => {
    const siguiente = pendientes.shift()
    return siguiente ? [{ rawValue: siguiente }] : []
  })
  class DetectorFalso {
    detect = detect
  }
  Object.defineProperty(globalThis, "BarcodeDetector", {
    value: DetectorFalso,
    configurable: true,
    writable: true,
  })
  return detect
}

function quitarDetector(): void {
  delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector
}

function renderEscaneo() {
  const onDetectado = vi.fn()
  const onError = vi.fn()
  const onCancelar = vi.fn()
  const vista = render(
    <EscaneoQrCedula onDetectado={onDetectado} onError={onError} onCancelar={onCancelar} />
  )
  return { ...vista, onDetectado, onError, onCancelar }
}

beforeEach(() => {
  // jsdom no implementa la reproducción de media: sin este stub el preview avisa.
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
  instalarCamara()
})

afterEach(() => {
  cleanup()
  quitarDetector()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true })
})

describe("EscaneoQrCedula (componente, RTL)", () => {
  it("emite el RUN validado del QR de la cédula y apaga la cámara", async () => {
    const camara = instalarCamara()
    instalarDetector([URL_CEDULA])

    const { onDetectado, onError } = renderEscaneo()

    await waitFor(() => expect(onDetectado).toHaveBeenCalledWith("16444555-0"))
    expect(onDetectado).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    await waitFor(() => expect(camara.stop).toHaveBeenCalled())
    // El último código leído queda a la vista del conserje.
    expect(await screen.findByText(/Último código leído/)).toBeTruthy()
  })

  it("rechaza un QR que no es de cédula sin emitir nada", async () => {
    instalarDetector([URL_QR_AJENO])

    const { onDetectado, onError } = renderEscaneo()

    await waitFor(() => expect(onError).toHaveBeenCalledWith(MENSAJE_QR_NO_CEDULA))
    expect(onDetectado).not.toHaveBeenCalled()
    expect((await screen.findByRole("alert")).textContent).toBe(MENSAJE_QR_NO_CEDULA)
  })

  it("rechaza un RUN con dígito verificador inválido", async () => {
    instalarDetector([URL_CEDULA_DV_MALO])

    const { onDetectado, onError } = renderEscaneo()

    await waitFor(() => expect(onError).toHaveBeenCalledWith(MENSAJE_RUN_INVALIDO))
    expect(onDetectado).not.toHaveBeenCalled()
  })

  it("con el permiso denegado avisa y cae al modo manual sin crash", async () => {
    instalarCamara({ rechazar: Object.assign(new Error("denegado"), { name: "NotAllowedError" }) })
    instalarDetector([URL_CEDULA])

    const { onDetectado, onError } = renderEscaneo()

    await waitFor(() => expect(onError).toHaveBeenCalledWith(MENSAJE_PERMISO))
    expect(onDetectado).not.toHaveBeenCalled()
    expect((await screen.findByRole("alert")).textContent).toBe(MENSAJE_PERMISO)
  })

  it("sin getUserMedia en el navegador avisa y cae al modo manual", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true })
    instalarDetector([URL_CEDULA])

    const { onError, onDetectado } = renderEscaneo()

    await waitFor(() => expect(onError).toHaveBeenCalledWith(MENSAJE_SIN_CAMARA))
    expect(onDetectado).not.toHaveBeenCalled()
  })

  it("usa @zxing/browser cuando el navegador no expone BarcodeDetector", async () => {
    quitarDetector()
    zxing.leer.mockResolvedValue({ getText: () => URL_CEDULA })

    const { onDetectado } = renderEscaneo()

    await waitFor(() => expect(onDetectado).toHaveBeenCalledWith("16444555-0"))
    expect(zxing.leer).toHaveBeenCalled()
  })

  it("apaga la cámara al cancelar", async () => {
    const camara = instalarCamara()
    instalarDetector([null])

    const user = userEvent.setup()
    const { onCancelar, unmount } = renderEscaneo()

    await waitFor(() => expect(camara.getUserMedia).toHaveBeenCalled())
    await user.click(screen.getByRole("button", { name: "Cancelar escaneo" }))
    expect(onCancelar).toHaveBeenCalled()
    await waitFor(() => expect(camara.stop).toHaveBeenCalled())

    camara.stop.mockClear()
    unmount()
    // El stream ya se había liberado al cancelar: no se vuelve a apagar dos veces.
    expect(camara.stop).not.toHaveBeenCalled()
  })

  it("apaga la cámara al desmontar el componente", async () => {
    const camara = instalarCamara()
    instalarDetector([null])

    const { unmount } = renderEscaneo()

    await waitFor(() => expect(camara.getUserMedia).toHaveBeenCalled())
    expect(camara.stop).not.toHaveBeenCalled()

    unmount()
    // Sin esto el LED de la webcam queda prendido con la pestaña abierta.
    expect(camara.stop).toHaveBeenCalledTimes(1)
  })
})
