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
 * - Recuadro guía: sólo se emite el código que cae DENTRO del marco cuando el
 *   motor informa geometría; sin geometría se acepta igual que antes.
 * - Corte por inactividad: a los 30 s sin lectura la cámara se apaga, se informa
 *   y «Reintentar» vuelve a arrancar con el plazo en cero; al desmontar no queda
 *   ningún timer vivo.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  EscaneoQrCedula,
  MENSAJE_CAMARA_INACTIVA,
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
  vi.useRealTimers()
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

// ---------------------------------------------------------------------------
// Recuadro guía (T1) y corte por inactividad (T2): cableado React.
// ---------------------------------------------------------------------------

/** Un tick del bucle de lectura (300 ms) más margen. */
const UN_TICK_MS = 400
/** Plazo de corte por inactividad del componente (30 s) más margen. */
const CORTE_MS = 30_500

/**
 * Caja que informa el motor, en píxeles del video REAL (640x480).
 * Con una caja renderizada de 400x300 el marco guía es el cuadrado
 * { x: 80, y: 30, ancho: 240, alto: 240 }: estos dos centros caen uno adentro
 * y el otro afuera de ese cuadrado.
 */
const CAJA_DENTRO = { x: 300, y: 220, width: 40, height: 40 }
const CAJA_FUERA = { x: 0, y: 0, width: 40, height: 40 }

/** `BarcodeDetector` falso que devuelve el QR de la cédula con su caja. */
function instalarDetectorConCaja(
  caja: { x: number; y: number; width: number; height: number } | null
): ReturnType<typeof vi.fn> {
  const detect = vi.fn(async () =>
    caja ? [{ rawValue: URL_CEDULA, boundingBox: caja }] : []
  )
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

/** Cámara falsa con dos tracks, para probar que se apagan todos. */
function instalarCamaraDosTracks(): {
  stops: ReturnType<typeof vi.fn>[]
  getUserMedia: ReturnType<typeof vi.fn>
} {
  const stops = [vi.fn(), vi.fn()]
  const stream = { getTracks: () => stops.map((stop) => ({ stop })) } as unknown as MediaStream
  const getUserMedia = vi.fn(async () => stream)
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
  })
  return { stops, getUserMedia }
}

/**
 * Da medidas al `<video>` ya montado: caja renderizada en px CSS (400x300) y
 * tamaño del video real (640x480), y fuerza la remedición que el componente
 * escucha en `window.resize`. No se toca el componente.
 */
function medirVideo(): void {
  const video = screen.getByLabelText("Previsualización de la cámara") as HTMLVideoElement
  Object.defineProperty(video, "videoWidth", { configurable: true, get: () => 640 })
  Object.defineProperty(video, "videoHeight", { configurable: true, get: () => 480 })
  Object.defineProperty(video, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    }),
  })
  fireEvent(window, new Event("resize"))
}

describe("EscaneoQrCedula — recuadro guía (RTL)", () => {
  it("emite el RUN cuando el QR está dentro del recuadro guía", async () => {
    vi.useFakeTimers()
    instalarDetectorConCaja(CAJA_DENTRO)

    const { onDetectado } = renderEscaneo()
    medirVideo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UN_TICK_MS)
    })

    expect(onDetectado).toHaveBeenCalledWith("16444555-0")
    expect(onDetectado).toHaveBeenCalledTimes(1)
  })

  it("descarta el QR que queda fuera del recuadro guía y sigue escaneando sin avisar", async () => {
    vi.useFakeTimers()
    const detect = instalarDetectorConCaja(CAJA_FUERA)

    const { onDetectado, onError } = renderEscaneo()
    medirVideo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UN_TICK_MS * 2)
    })

    // Hubo lectura real y aun así no se emite ni se avisa: es un QR del fondo.
    expect(detect.mock.calls.length).toBeGreaterThan(1)
    expect(onDetectado).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it("sin geometría del motor emite igual aunque el recuadro esté medido", async () => {
    vi.useFakeTimers()
    // `instalarDetector` devuelve sólo `rawValue`: el motor no informa posición.
    instalarDetector([URL_CEDULA])

    const { onDetectado } = renderEscaneo()
    medirVideo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UN_TICK_MS)
    })

    expect(onDetectado).toHaveBeenCalledWith("16444555-0")
  })
})

describe("EscaneoQrCedula — corte por inactividad (RTL)", () => {
  it("apaga la cámara a los 30 s sin lectura e informa por qué", async () => {
    vi.useFakeTimers()
    const camara = instalarCamaraDosTracks()
    instalarDetector([null])

    const { onError } = renderEscaneo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000)
    })
    // A los 29 s todavía no: el plazo se cuenta desde que la cámara escanea.
    expect(camara.stops[0]).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    camara.stops.forEach((stop) => expect(stop).toHaveBeenCalled())
    expect(onError).toHaveBeenCalledWith(MENSAJE_CAMARA_INACTIVA)
    expect(screen.getByRole("alert").textContent).toBe(MENSAJE_CAMARA_INACTIVA)
  })

  it("«Reintentar» vuelve a pedir cámara y reinicia el plazo de inactividad", async () => {
    vi.useFakeTimers()
    const camara = instalarCamaraDosTracks()
    instalarDetector([null])

    renderEscaneo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORTE_MS)
    })
    expect(camara.getUserMedia).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(camara.getUserMedia).toHaveBeenCalledTimes(2)

    // El plazo arrancó de cero: a los 29 s del reintento sigue escaneando…
    camara.stops[0]!.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(28_000)
    })
    expect(camara.stops[0]).not.toHaveBeenCalled()

    // …y pasados los 30 s del reintento vuelve a cortar.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(camara.stops[0]).toHaveBeenCalled()
  })

  it("al desmontar con el plazo vivo no queda ningún timer pendiente y se apagan los tracks", async () => {
    vi.useFakeTimers()
    const camara = instalarCamaraDosTracks()
    instalarDetector([null])

    const { unmount } = renderEscaneo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UN_TICK_MS)
    })
    // Bucle de lectura y plazo de inactividad, los dos vivos.
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    camara.stops.forEach((stop) => stop.mockClear())
    unmount()

    camara.stops.forEach((stop) => expect(stop).toHaveBeenCalled())
    expect(vi.getTimerCount()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Lecturas en vuelo: una lectura puede resolver DESPUÉS del corte o del reintento.
// ---------------------------------------------------------------------------

/**
 * `BarcodeDetector` falso cuyo `detect` queda pendiente hasta que el test lo
 * resuelve: reproduce el frame que tarda más que el plazo de inactividad.
 */
function instalarDetectorPendiente(): {
  detect: ReturnType<typeof vi.fn>
  /** Resuelve la N-ésima lectura pendiente con el QR de la cédula dentro del marco. */
  resolverCedula: (indice: number) => void
} {
  const pendientes: ((codigos: { rawValue: string; boundingBox?: unknown }[]) => void)[] = []
  const detect = vi.fn(
    () =>
      new Promise<{ rawValue: string; boundingBox?: unknown }[]>((resolver) => {
        pendientes.push(resolver)
      })
  )
  class DetectorFalso {
    detect = detect
  }
  Object.defineProperty(globalThis, "BarcodeDetector", {
    value: DetectorFalso,
    configurable: true,
    writable: true,
  })
  return {
    detect,
    resolverCedula: (indice) => {
      pendientes[indice]?.([{ rawValue: URL_CEDULA, boundingBox: CAJA_DENTRO }])
    },
  }
}

describe("EscaneoQrCedula — lecturas en vuelo (RTL)", () => {
  it("una lectura que resuelve después del corte no emite el RUN", async () => {
    vi.useFakeTimers()
    const camara = instalarCamaraDosTracks()
    const detector = instalarDetectorPendiente()

    const { onDetectado, onError } = renderEscaneo()
    medirVideo()
    // El frame queda en vuelo: el detector nunca resuelve dentro del tick.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UN_TICK_MS)
    })
    expect(detector.detect).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORTE_MS)
    })
    expect(onError).toHaveBeenCalledWith(MENSAJE_CAMARA_INACTIVA)

    // La lectura tardía llega con un QR válido y bien encuadrado: ya no vale.
    await act(async () => {
      detector.resolverCedula(0)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(onDetectado).not.toHaveBeenCalled()
    // El único aviso es el del corte: la lectura tardía no agrega errores.
    expect(onError.mock.calls.map((llamada) => llamada[0])).toEqual([MENSAJE_CAMARA_INACTIVA])
    // Ni vuelve a apagar una cámara que ya estaba apagada.
    camara.stops.forEach((stop) => expect(stop).toHaveBeenCalledTimes(1))
  })

  it("una lectura del intento anterior no corta la cámara del intento nuevo", async () => {
    vi.useFakeTimers()
    const camara = instalarCamaraDosTracks()
    const detector = instalarDetectorPendiente()

    const { onDetectado } = renderEscaneo()
    medirVideo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UN_TICK_MS)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORTE_MS)
    })
    expect(camara.stops[0]).toHaveBeenCalledTimes(1)

    camara.stops.forEach((stop) => stop.mockClear())
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UN_TICK_MS)
    })
    // El intento nuevo ya está escaneando con su propia lectura en vuelo.
    expect(detector.detect).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/Acerca el anverso de la cédula/)).toBeTruthy()

    // Llega la lectura vieja, con QR válido y bien encuadrado: se descarta.
    await act(async () => {
      detector.resolverCedula(0)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(onDetectado).not.toHaveBeenCalled()
    camara.stops.forEach((stop) => expect(stop).not.toHaveBeenCalled())

    // El intento nuevo sigue vivo y sano: su propia lectura sí emite el RUN.
    await act(async () => {
      detector.resolverCedula(1)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(onDetectado).toHaveBeenCalledWith("16444555-0")
    expect(onDetectado).toHaveBeenCalledTimes(1)
  })
})
