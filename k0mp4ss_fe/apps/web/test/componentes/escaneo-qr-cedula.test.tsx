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
 * - Corte por inactividad: a los 120 s sin lectura la cámara se apaga, se informa
 *   y «Reintentar» vuelve a arrancar con el plazo en cero; al desmontar no queda
 *   ningún timer vivo.
 * - Resolución y foco: se muestra lo que el navegador entrega (`getSettings`) y si
 *   el hardware acepta foco continuo; se decodifica el recorte del recuadro guía
 *   en píxeles nativos, no el frame entero.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  CORTE_POR_INACTIVIDAD_MS,
  EscaneoQrCedula,
  MENSAJE_CAMARA_INACTIVA,
  MENSAJE_CAPTURA_NO_CEDULA,
  MENSAJE_CAPTURA_SIN_LECTURA,
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
    decodeFromCanvas = zxing.leer
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
  // jsdom no trae contexto 2D: el recorte del recuadro se dibuja en uno falso
  // (no pinta nada, pero el canvas existe con el tamaño del recorte).
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
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
/** Plazo de corte por inactividad más margen (el plazo vive en el componente). */
const CORTE_MS = CORTE_POR_INACTIVIDAD_MS + 500
/** Justo antes del plazo: la cámara todavía debe estar escaneando. */
const ANTES_DEL_CORTE_MS = CORTE_POR_INACTIVIDAD_MS - 1_000
/** Margen tras «Reintentar» para que el intento nuevo arranque de verdad. */
const TRAS_REINTENTO_MS = 2_000

/**
 * Caja que informa el motor, en píxeles del video REAL (640x480).
 * Con una caja renderizada de 400x300 el marco guía es el cuadrado
 * { x: 80, y: 30, ancho: 240, alto: 240 }: estos dos centros caen uno adentro
 * y el otro afuera de ese cuadrado. Ahora el decodificador recibe el RECORTE del
 * marco (384x384 px nativos), así que la caja "afuera" es una que el motor informa
 * más allá del propio recorte: el candado del gating sigue descartándola.
 */
const CAJA_DENTRO = { x: 300, y: 220, width: 40, height: 40 }
const CAJA_FUERA = { x: -2000, y: -2000, width: 40, height: 40 }

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

  it("decodifica el recorte del recuadro guía, no el video completo, y reusa el canvas", async () => {
    vi.useFakeTimers()
    // Sin QR: el bucle sigue leyendo y se pueden comparar dos frames.
    const detect = instalarDetectorConCaja(null)

    renderEscaneo()
    medirVideo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UN_TICK_MS * 2)
    })

    const primero = detect.mock.calls[0]![0]
    expect(primero).toBeInstanceOf(HTMLCanvasElement)
    // Marco CSS de 240x240 sobre un video de 640x480 en una caja de 400x300:
    // el recorte nativo es de 384x384, no el frame entero de 640x480.
    expect((primero as HTMLCanvasElement).width).toBe(384)
    expect((primero as HTMLCanvasElement).height).toBe(384)
    // Un canvas por escáner, no uno por tick.
    expect(detect.mock.calls[1]![0]).toBe(primero)
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
  it("apaga la cámara a los dos minutos sin lectura e informa por qué", async () => {
    vi.useFakeTimers()
    const camara = instalarCamaraDosTracks()
    instalarDetector([null])

    const { onError } = renderEscaneo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ANTES_DEL_CORTE_MS)
    })
    // Justo antes del plazo todavía no: se cuenta desde que la cámara escanea.
    expect(camara.stops[0]).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORTE_MS - ANTES_DEL_CORTE_MS)
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
      await vi.advanceTimersByTimeAsync(TRAS_REINTENTO_MS)
    })
    expect(camara.getUserMedia).toHaveBeenCalledTimes(2)

    // El plazo arrancó de cero: antes del corte sigue escaneando…
    camara.stops[0]!.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        CORTE_POR_INACTIVIDAD_MS - TRAS_REINTENTO_MS - 1_000
      )
    })
    expect(camara.stops[0]).not.toHaveBeenCalled()

    // …y pasado el plazo del reintento vuelve a cortar.
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
// Resolución real y foco continuo (T1/T2 del pedido de hardware).
// ---------------------------------------------------------------------------

/**
 * Cámara falsa que informa lo que un track real: `getSettings` con la resolución
 * entregada en cada llamada y `getCapabilities` con los modos de foco del equipo.
 */
function instalarCamaraConAjustes(ajustes: {
  resoluciones: { width: number; height: number }[]
  focusMode?: string[]
  torch?: boolean
}): {
  getUserMedia: ReturnType<typeof vi.fn>
  stops: ReturnType<typeof vi.fn>[]
  applyConstraints: ReturnType<typeof vi.fn>
} {
  const stops: ReturnType<typeof vi.fn>[] = []
  const applyConstraints = vi.fn(async () => undefined)
  let llamada = 0
  const getUserMedia = vi.fn(async () => {
    const resolucion =
      ajustes.resoluciones[Math.min(llamada, ajustes.resoluciones.length - 1)]!
    llamada += 1
    const stop = vi.fn()
    stops.push(stop)
    const pista = {
      stop,
      getSettings: () => ({ width: resolucion.width, height: resolucion.height }),
      getCapabilities: () => ({
        ...(ajustes.focusMode ? { focusMode: ajustes.focusMode } : {}),
        ...(ajustes.torch === undefined ? {} : { torch: ajustes.torch }),
      }),
      applyConstraints,
    }
    return { getTracks: () => [pista], getVideoTracks: () => [pista] }
  })
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
  })
  return { getUserMedia, stops, applyConstraints }
}

describe("EscaneoQrCedula — resolución real y foco (RTL)", () => {
  it("muestra la resolución que entrega el navegador y pide foco continuo si el hardware lo declara", async () => {
    vi.useFakeTimers()
    const camara = instalarCamaraConAjustes({
      resoluciones: [{ width: 1920, height: 1080 }],
      focusMode: ["continuous", "manual"],
    })
    instalarDetector([null])

    renderEscaneo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UN_TICK_MS)
    })

    expect(camara.getUserMedia).toHaveBeenCalledTimes(1)
    // Se pide la resolución nativa, no el default del navegador.
    expect(camara.getUserMedia.mock.calls[0]![0]).toEqual({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "environment" },
    })
    expect(screen.getByText(/Cámara: 1920x1080/)).toBeTruthy()
    expect(screen.getByText(/foco continuo: sí/)).toBeTruthy()
    expect(camara.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ focusMode: "continuous" }],
    })
  })

  it("con foco fijo no pide focusMode y lo informa", async () => {
    vi.useFakeTimers()
    const camara = instalarCamaraConAjustes({
      resoluciones: [{ width: 1920, height: 1080 }],
      focusMode: ["manual"],
    })
    instalarDetector([null])

    renderEscaneo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UN_TICK_MS)
    })

    expect(screen.getByText(/foco continuo: no/)).toBeTruthy()
    expect(camara.applyConstraints).not.toHaveBeenCalled()
  })

  it("reintenta una vez con 1280x960 cuando el navegador entrega menos de 1280 de ancho", async () => {
    vi.useFakeTimers()
    const camara = instalarCamaraConAjustes({
      resoluciones: [
        { width: 640, height: 480 },
        { width: 1280, height: 960 },
      ],
    })
    instalarDetector([URL_CEDULA])

    const { onDetectado } = renderEscaneo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UN_TICK_MS)
    })

    expect(camara.getUserMedia).toHaveBeenCalledTimes(2)
    expect(camara.getUserMedia.mock.calls[1]![0]).toEqual({
      video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: "environment" },
    })
    // El primer stream se libera antes de pedir el segundo.
    expect(camara.stops[0]).toHaveBeenCalled()
    expect(screen.getByText(/Cámara: 1280x960/)).toBeTruthy()
    // Y el escaneo sigue funcionando con el stream nuevo.
    expect(onDetectado).toHaveBeenCalledWith("16444555-0")
  })

  it("si tampoco alcanza la resolución mínima sigue escaneando con lo que haya", async () => {
    vi.useFakeTimers()
    instalarCamaraConAjustes({
      resoluciones: [
        { width: 640, height: 480 },
        { width: 640, height: 480 },
      ],
    })
    instalarDetector([URL_CEDULA])

    const { onDetectado, onError } = renderEscaneo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UN_TICK_MS)
    })

    expect(screen.getByText(/Cámara: 640x480/)).toBeTruthy()
    expect(onDetectado).toHaveBeenCalledWith("16444555-0")
    expect(onError).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// «Capturar»: diagnóstico manual sobre el frame completo, sin gating.
// ---------------------------------------------------------------------------

describe("EscaneoQrCedula — Capturar (RTL)", () => {
  it("sin lectura avisa y no emite, decodificando el frame completo", async () => {
    vi.useFakeTimers()
    // El motor no ve nada: el botón tiene que decirlo, no quedarse en silencio.
    const detect = instalarDetectorConCaja(null)

    const { onDetectado } = renderEscaneo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    fireEvent.click(screen.getByRole("button", { name: "Capturar" }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(screen.getByRole("alert").textContent).toBe(MENSAJE_CAPTURA_SIN_LECTURA)
    expect(onDetectado).not.toHaveBeenCalled()
    // El origen es el <video> completo, no el recorte del recuadro.
    expect(detect.mock.calls[0]![0]).toBe(screen.getByLabelText("Previsualización de la cámara"))
  })

  it("con un código que no es de cédula avisa con el texto crudo y no emite", async () => {
    vi.useFakeTimers()
    instalarDetector([URL_QR_AJENO])

    const { onDetectado } = renderEscaneo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    fireEvent.click(screen.getByRole("button", { name: "Capturar" }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    const aviso = screen.getByRole("alert").textContent ?? ""
    expect(aviso).toContain(MENSAJE_CAPTURA_NO_CEDULA)
    expect(aviso).toContain(URL_QR_AJENO)
    expect(onDetectado).not.toHaveBeenCalled()
  })

  it("con el RUN de la cédula emite igual que el camino automático", async () => {
    vi.useFakeTimers()
    const camara = instalarCamaraDosTracks()
    instalarDetector([URL_CEDULA])

    const { onDetectado } = renderEscaneo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    fireEvent.click(screen.getByRole("button", { name: "Capturar" }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(onDetectado).toHaveBeenCalledWith("16444555-0")
    expect(onDetectado).toHaveBeenCalledTimes(1)
    // Emitir apaga la cámara, igual que en la lectura automática.
    camara.stops.forEach((stop) => expect(stop).toHaveBeenCalled())
  })
})

// ---------------------------------------------------------------------------
// Linterna: sólo si el hardware la declara, y nunca encendida sola.
// ---------------------------------------------------------------------------

describe("EscaneoQrCedula — linterna (RTL)", () => {
  it("se ofrece y se aplica sólo si el hardware la declara, y se apaga al detener", async () => {
    vi.useFakeTimers()
    const camara = instalarCamaraConAjustes({
      resoluciones: [{ width: 1920, height: 1080 }],
      torch: true,
    })
    instalarDetector([null])

    renderEscaneo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    const boton = screen.getByRole("button", { name: "Linterna" })
    // Nunca se prende sola.
    expect(boton.getAttribute("aria-pressed")).toBe("false")
    expect(camara.applyConstraints).not.toHaveBeenCalled()

    fireEvent.click(boton)
    expect(camara.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
    expect(screen.getByRole("button", { name: "Linterna" }).getAttribute("aria-pressed")).toBe(
      "true"
    )

    // Al detener la cámara, la linterna se apaga explícitamente.
    fireEvent.click(screen.getByRole("button", { name: "Cancelar escaneo" }))
    expect(camara.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: false }] })
  })

  it("sin torch en las capacidades no se ofrece la linterna", async () => {
    vi.useFakeTimers()
    instalarCamaraConAjustes({
      resoluciones: [{ width: 1920, height: 1080 }],
      torch: false,
    })
    instalarDetector([null])

    renderEscaneo()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(screen.queryByRole("button", { name: "Linterna" })).toBeNull()
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
