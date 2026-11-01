"use client"

/**
 * Escáner del QR del anverso de la cédula de identidad (PE-visitas).
 *
 * Qué acepta: la cédula **nueva** (electrónica, desde dic-2024) trae un QR que
 * apunta al Registro Civil con el RUN como parámetro. La cédula anterior NO
 * tiene QR (su PDF417 está en el reverso y el MRZ exige OCR frágil): para ese
 * caso el panel de visitas ofrece la búsqueda manual por RUT.
 *
 * Cómo lee:
 * - `BarcodeDetector` nativo cuando el navegador lo expone (Chrome/Edge/Android).
 * - `@zxing/browser` (MIT) como fallback en Safari/Firefox, que no lo exponen.
 * - Decodifica el RECORTE del recuadro guía en píxeles nativos del video, no el
 *   frame entero escalado: con una cámara de 1080p el recuadro tiene más píxeles
 *   útiles que todo el frame que el navegador entregaba por defecto.
 * - Pide 1920x1080 y, si el navegador entrega menos de 1280 de ancho, reintenta
 *   una vez con 1280x960. Pide foco continuo sólo si el hardware lo declara.
 *
 * Reglas de operación:
 * - Nunca emite un RUN sin pasar `validarRun` (dígito verificador módulo 11).
 * - Sólo emite si el código leído está dentro del recuadro guía del video: así no
 *   se acepta un QR del fondo (un cartel, una promo). Si el motor no informa
 *   geometría, la lectura se acepta igual que antes: no se bloquea por falta de dato.
 * - Si no hay lectura válida en 120 s, la cámara se apaga sola y el conserje puede
 *   reintentar: el LED no queda prendido con la pestaña abierta.
 * - La cámara se apaga al detectar, al cancelar, al vencer el plazo y al desmontar.
 * - Si no hay cámara o el permiso se niega, devuelve un mensaje legible y NO
 *   rompe: el conserje sigue con el modo manual del mismo formulario.
 */
import * as React from "react"
import { Button } from "@workspace/ui/components/button"
import {
  centroEnCaja,
  extraerRunDeQr,
  lecturaEncuadrada,
  marcoEnVideo,
  marcoGuia,
  resumenEstructural,
  type CajaVideo,
  type Marco,
  type Punto,
  type ResumenEstructural,
} from "@/lib/cedula-qr"
import { validarRun } from "@/lib/validacion-rut"

/** Cada cuánto se intenta leer un frame nuevo (ms). */
const INTERVALO_LECTURA_MS = 300
/**
 * Sin lectura válida en este plazo, la cámara se apaga sola (ms).
 * Se exporta para que los tests lo importen en vez de repetir la aritmética.
 */
export const CORTE_POR_INACTIVIDAD_MS = 120_000

/** Pedido de cámara: la resolución nativa primero. */
const PEDIDO_HD: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  facingMode: "environment",
}
/** Reintento cuando el navegador entrega menos de `ANCHO_MINIMO` de ancho. */
const PEDIDO_MEDIO: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 960 },
  facingMode: "environment",
}
const ANCHO_MINIMO = 1280

export const MENSAJE_QR_NO_CEDULA =
  "El QR leído no corresponde a una cédula: no trae un RUN del Registro Civil."
export const MENSAJE_RUN_INVALIDO =
  "El RUN leído no pasa la validación del dígito verificador. Vuelve a apuntar el QR de la cédula."
export const MENSAJE_CAMARA_INACTIVA =
  "La cámara se apagó para no quedar encendida. Reintentar."
export const MENSAJE_CAPTURA_SIN_LECTURA =
  "No se pudo leer el código. Acercá la cédula y evitá reflejos."
export const MENSAJE_CAPTURA_NO_CEDULA = "Se leyó un código, pero no es de una cédula."
export const MENSAJE_SIN_CAMARA =
  "Este navegador no expone la cámara (getUserMedia). Escribe el RUT y usa «Buscar en el padrón»."
export const MENSAJE_PERMISO =
  "No se pudo abrir la cámara: el permiso fue denegado. Escribe el RUT y usa «Buscar en el padrón»."
export const MENSAJE_SIN_DISPOSITIVO =
  "No se encontró una cámara disponible en este equipo. Escribe el RUT y usa «Buscar en el padrón»."
export const MENSAJE_CAMARA_OCUPADA =
  "La cámara está siendo usada por otra aplicación. Ciérrala e intenta de nuevo, o escribe el RUT."
export const MENSAJE_CAMARA_FALLO =
  "No se pudo abrir la cámara. Escribe el RUT y usa «Buscar en el padrón»."
export const MENSAJE_SIN_LECTOR =
  "El escaneo de QR no está disponible en este navegador. Escribe el RUT y usa «Buscar en el padrón»."

/** Una lectura del frame: el texto y, si el motor la informó, su posición. */
interface Lectura {
  texto: string
  /** Centro del código en píxeles del origen decodificado, o `null`. */
  centro: Punto | null
}

/** Frame listo para decodificar y cómo volver a coordenadas del video. */
interface Frame {
  origen: CanvasImageSource
  /** Origen del recorte en píxeles nativos (0/0 si se decodifica el video). */
  offsetX: number
  offsetY: number
}

/** Caja que informa `BarcodeDetector`, en píxeles del video real. */
interface CajaDeteccion {
  x: number
  y: number
  width: number
  height: number
}

type Deteccion = { rawValue: string; boundingBox?: CajaDeteccion | null }
type DetectorNativo = { detect(origen: CanvasImageSource): Promise<Deteccion[]> }
type ConstructorDetector = new (opciones?: { formats?: string[] }) => DetectorNativo

/** Estrategia de lectura de un frame. `null` = todavía no hay QR en la imagen. */
interface EstrategiaLectura {
  leer(origen: CanvasImageSource): Promise<Lectura | null>
}

/** `BarcodeDetector` nativo, o `null` si el navegador no lo expone. */
function constructorNativo(): ConstructorDetector | null {
  const global = globalThis as { BarcodeDetector?: ConstructorDetector }
  return typeof global.BarcodeDetector === "function" ? global.BarcodeDetector : null
}

function estrategiaNativa(Constructor: ConstructorDetector): EstrategiaLectura {
  const detector = new Constructor({ formats: ["qr_code"] })
  return {
    async leer(video) {
      // El detector nativo rechaza el frame cuando aún no hay QR legible.
      const codigos = await detector.detect(video)
      const primero = codigos[0]
      if (!primero?.rawValue) return null
      // `boundingBox` viene en píxeles del video real: la conversión a píxeles
      // CSS del elemento (donde vive el recuadro) la hace `centroEnPantalla`.
      const caja = primero.boundingBox
      const centro = caja ? { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 } : null
      return { texto: primero.rawValue, centro }
    },
  }
}

/**
 * Promedio de las esquinas que informa zxing (píxeles del video real).
 * Devuelve `null` si el lector no expone esquinas: hay motores que sólo dan texto.
 */
function centroDeEsquinas(resultado: {
  getResultPoints?: () => { getX(): number; getY(): number }[] | null
}): Punto | null {
  if (typeof resultado.getResultPoints !== "function") return null
  const puntos = resultado.getResultPoints() ?? []
  const validos = puntos.filter(
    (punto) => typeof punto?.getX === "function" && typeof punto?.getY === "function"
  )
  if (validos.length === 0) return null
  const suma = validos.reduce(
    (acumulado, punto) => ({
      x: acumulado.x + punto.getX(),
      y: acumulado.y + punto.getY(),
    }),
    { x: 0, y: 0 }
  )
  return { x: suma.x / validos.length, y: suma.y / validos.length }
}

/** Fallback para Safari/Firefox: lee con `@zxing/browser` (se importa on demand). */
async function estrategiaZxing(): Promise<EstrategiaLectura> {
  const { BrowserQRCodeReader } = await import("@zxing/browser")
  const lector = new BrowserQRCodeReader()
  return {
    async leer(origen) {
      try {
        // El recorte llega como canvas; sin medidas (o sin 2D) llega el video.
        const resultado =
          origen instanceof HTMLCanvasElement
            ? await lector.decodeFromCanvas(origen)
            : await lector.decodeOnceFromVideoElement(origen as HTMLVideoElement)
        return { texto: resultado.getText(), centro: centroDeEsquinas(resultado) }
      } catch {
        // Frame sin QR (NotFoundException del lector): se reintenta en el próximo tick.
        return null
      }
    },
  }
}

/**
 * Prioridad: decodificador nativo y, si no existe o no soporta `qr_code`,
 * `@zxing/browser`.
 */
async function crearEstrategia(): Promise<EstrategiaLectura> {
  const Constructor = constructorNativo()
  if (!Constructor) return estrategiaZxing()
  try {
    return estrategiaNativa(Constructor)
  } catch {
    // BarcodeDetector presente pero sin el formato qr_code: cae al lector alternativo.
    return estrategiaZxing()
  }
}

/** Traduce el error del DOM de `getUserMedia` a un mensaje que el conserje entiende. */
function mensajeDeCamara(error: unknown): string {
  const nombre =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : ""
  if (nombre === "NotAllowedError" || nombre === "SecurityError") return MENSAJE_PERMISO
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
    return MENSAJE_SIN_DISPOSITIVO
  }
  if (nombre === "NotReadableError") return MENSAJE_CAMARA_OCUPADA
  return MENSAJE_CAMARA_FALLO
}

/**
 * Medidas del `<video>`: lo renderizado en px CSS y lo que mide el video real.
 * Las dos cosas juntas son lo único que permite ubicar el recuadro sin mentir
 * (ver `centroEnCaja` en `lib/cedula-qr.ts`).
 */
function medidasDeVideo(video: HTMLVideoElement | null): CajaVideo | null {
  if (!video) return null
  const caja = video.getBoundingClientRect()
  return {
    ancho: caja.width,
    alto: caja.height,
    anchoReal: video.videoWidth,
    altoReal: video.videoHeight,
  }
}

/** Pista de video del stream (los dobles de test sólo exponen `getTracks`). */
function pistaDeVideo(stream: MediaStream): MediaStreamTrack | undefined {
  const pistas = stream.getVideoTracks?.()
  if (pistas && pistas.length > 0) return pistas[0]
  return stream.getTracks()[0]
}

/** Resolución real que informa el navegador (`getSettings`), o `null` si no la da. */
function resolucionDe(pista: MediaStreamTrack | undefined): string | null {
  const ajustes = pista?.getSettings?.()
  if (!ajustes?.width || !ajustes.height) return null
  return `${ajustes.width}x${ajustes.height}`
}

/**
 * Pide foco continuo SÓLO si el hardware lo declara en `getCapabilities`.
 *
 * Las webcams USB de foco fijo (la mayoría) no exponen `focusMode`: ahí no se
 * pide nada y el escaneo sigue igual. `applyConstraints` puede rechazar la
 * petición: se ignora en silencio, el conserje no necesita ver ese detalle.
 */
function activarFocoContinuo(pista: MediaStreamTrack | undefined): boolean {
  const capacidades = pista?.getCapabilities?.() as { focusMode?: string[] } | undefined
  if (!capacidades?.focusMode?.includes("continuous")) return false
  return aplicarAvanzada(pista, { focusMode: "continuous" })
}

/**
 * Aplica una restricción avanzada (`focusMode`, `torch`) al track.
 * Devuelve `false` si el navegador la rechaza: el escaneo nunca depende de esto.
 */
function aplicarAvanzada(
  pista: MediaStreamTrack | undefined,
  ajuste: Record<string, unknown>
): boolean {
  if (!pista) return false
  try {
    const avanzadas = [ajuste] as unknown as MediaTrackConstraintSet[]
    const aplicado = pista.applyConstraints({ advanced: avanzadas })
    if (aplicado && typeof aplicado.catch === "function") void aplicado.catch(() => null)
    return true
  } catch {
    return false
  }
}

/** `torch` sólo existe en las capacidades de algunos móviles: sin eso no se ofrece. */
function soportaLinterna(pista: MediaStreamTrack | undefined): boolean {
  const capacidades = pista?.getCapabilities?.() as { torch?: boolean } | undefined
  return capacidades?.torch === true
}

/**
 * Vista previa del texto crudo leído por «Capturar»: corta a 40 caracteres y
 * deja ver el corte con puntos suspensivos (no es un recorte silencioso).
 */
function vistaPrevia(texto: string, maximo = 40): string {
  const crudo = texto.trim()
  return crudo.length > maximo ? `${crudo.slice(0, maximo)}…` : crudo
}

/**
 * Abre la cámara pidiendo la resolución nativa.
 *
 * Si el navegador entrega menos de `ANCHO_MINIMO` de ancho, se libera ese stream
 * y se reintenta UNA vez con el ideal medio (algunos navegadores eligen mejor
 * así). Nunca se bloquea el escaneo por la resolución: si no informa medidas, o
 * si el reintento tampoco alcanza, se sigue con lo que haya.
 */
async function abrirCamara(mediaDevices: MediaDevices): Promise<MediaStream> {
  const stream = await mediaDevices.getUserMedia({ video: PEDIDO_HD })
  const ancho = pistaDeVideo(stream)?.getSettings?.().width ?? 0
  if (ancho === 0 || ancho >= ANCHO_MINIMO) return stream
  // Se libera antes de volver a pedir: dos streams del mismo dispositivo pueden
  // fallar con NotReadableError en cámaras exclusivas.
  stream.getTracks().forEach((track) => track.stop())
  return mediaDevices.getUserMedia({ video: PEDIDO_MEDIO })
}

/**
 * Dibuja el recorte en el canvas reusado (uno por escáner, nunca uno por frame)
 * y devuelve el canvas. Devuelve `null` si el navegador no da contexto 2D: el
 * llamador decodifica entonces el video completo, como antes.
 */
function dibujarRecorte(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  recorte: Marco
): HTMLCanvasElement | null {
  const contexto = canvas.getContext("2d")
  if (!contexto) return null
  const ancho = Math.max(1, Math.round(recorte.ancho))
  const alto = Math.max(1, Math.round(recorte.alto))
  if (canvas.width !== ancho) canvas.width = ancho
  if (canvas.height !== alto) canvas.height = alto
  contexto.drawImage(
    video,
    Math.round(recorte.x),
    Math.round(recorte.y),
    ancho,
    alto,
    0,
    0,
    ancho,
    alto
  )
  return canvas
}

export interface EscaneoQrCedulaProps {
  /** RUN canónico (`cuerpo-DV`) ya validado con módulo 11. */
  onDetectado: (run: string) => void
  /** Error legible para mostrar al conserje (QR ajeno, RUN inválido, cámara). */
  onError: (mensaje: string) => void
  /** El conserje cerró el escáner: la cámara ya está apagada. */
  onCancelar: () => void
}

type Estado = "iniciando" | "escaneando" | "detenido"

export function EscaneoQrCedula({ onDetectado, onError, onCancelar }: EscaneoQrCedulaProps) {
  const refVideo = React.useRef<HTMLVideoElement | null>(null)
  const refStream = React.useRef<MediaStream | null>(null)
  const refIntervalo = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const refInactividad = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const refTerminado = React.useRef(false)
  // Generación del intento: una lectura en vuelo puede resolver después del corte
  // por inactividad o del «Reintentar», y entonces ya no le corresponde actuar.
  const refGeneracion = React.useRef(0)
  // El recuadro medido vive en un ref (lo consulta el bucle de lectura) y en el
  // estado (lo pinta el overlay): un solo cálculo, así el verde no miente.
  const refMarco = React.useRef<Marco | null>(null)
  // Canvas offscreen reusado para decodificar sólo el recorte del recuadro.
  const refCanvas = React.useRef<HTMLCanvasElement | null>(null)
  // Estrategia vigente y pista de video: las usa «Capturar» y la linterna.
  const refEstrategia = React.useRef<EstrategiaLectura | null>(null)
  const refPista = React.useRef<MediaStreamTrack | null>(null)
  const refLinternaEncendida = React.useRef(false)
  // Los callbacks viven en un ref para que el efecto de cámara no se reinicie
  // cuando el panel se re-renderiza (reiniciarlo apagaría y reencendería el LED).
  const refCallbacks = React.useRef({ onDetectado, onError })
  const [estado, setEstado] = React.useState<Estado>("iniciando")
  const [marco, setMarco] = React.useState<Marco | null>(null)
  // Lo que el navegador realmente entrega, para no suponerlo desde la UI.
  const [resolucion, setResolucion] = React.useState<string | null>(null)
  const [focoContinuo, setFocoContinuo] = React.useState(false)
  const [linternaDisponible, setLinternaDisponible] = React.useState(false)
  const [linternaEncendida, setLinternaEncendida] = React.useState(false)
  const [capturando, setCapturando] = React.useState(false)
  // Estructura del último código capturado: claves sí, valores nunca.
  const [estructura, setEstructura] = React.useState<ResumenEstructural | null>(null)
  const [encuadrado, setEncuadrado] = React.useState(false)
  const [ultimoCodigo, setUltimoCodigo] = React.useState<string | null>(null)
  const [mensaje, setMensaje] = React.useState<string | null>(null)
  // Cada «Reintentar» reabre el efecto de cámara con el contador en cero.
  const [intento, setIntento] = React.useState(0)
  // Un RUN ya emitido no se vuelve a escanear: el flujo siguió en el panel.
  const [emitido, setEmitido] = React.useState(false)

  React.useEffect(() => {
    refCallbacks.current = { onDetectado, onError }
  })

  /** Mide el recuadro con las dimensiones renderizadas del video. */
  const medirMarco = React.useCallback(() => {
    const medidas = medidasDeVideo(refVideo.current)
    const medido = medidas ? marcoGuia(medidas) : null
    refMarco.current = medido
    setMarco(medido)
  }, [])

  React.useEffect(() => {
    medirMarco()
    const alCambiar = () => medirMarco()
    window.addEventListener("resize", alCambiar)
    const video = refVideo.current
    video?.addEventListener("loadedmetadata", alCambiar)
    return () => {
      window.removeEventListener("resize", alCambiar)
      video?.removeEventListener("loadedmetadata", alCambiar)
    }
  }, [medirMarco])

  /** Apaga la cámara de verdad: `stop()` en cada track y `srcObject` liberado. */
  const detenerCamara = React.useCallback(() => {
    const stream = refStream.current
    refStream.current = null
    const pista = refPista.current
    refPista.current = null
    // La linterna se apaga explícitamente antes de soltar el track.
    if (pista && refLinternaEncendida.current) aplicarAvanzada(pista, { torch: false })
    refLinternaEncendida.current = false
    stream?.getTracks().forEach((track) => track.stop())
    const video = refVideo.current
    if (video) video.srcObject = null
  }, [])

  /** Apaga todo: bucle de lectura, plazo de inactividad, canvas y cámara. */
  const detenerTodo = React.useCallback(() => {
    refTerminado.current = true
    if (refIntervalo.current) {
      clearInterval(refIntervalo.current)
      refIntervalo.current = null
    }
    if (refInactividad.current) {
      clearTimeout(refInactividad.current)
      refInactividad.current = null
    }
    // El recorte no se guarda: se suelta el canvas y su bitmap queda descartable.
    const canvas = refCanvas.current
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
    refCanvas.current = null
    refEstrategia.current = null
    detenerCamara()
  }, [detenerCamara])

  /** Aviso legible al conserje: mensaje local y canal de error del panel. */
  const avisar = React.useCallback((texto: string) => {
    setMensaje(texto)
    refCallbacks.current.onError(texto)
  }, [])

  /**
   * Emisión del RUN: apaga todo antes de avisar al panel. Es el mismo camino para
   * la lectura automática y para «Capturar», así no hay dos comportamientos.
   */
  const emitir = React.useCallback(
    (run: string) => {
      detenerTodo()
      setEstado("detenido")
      setMensaje(null)
      setEmitido(true)
      refCallbacks.current.onDetectado(run)
    },
    [detenerTodo]
  )

  React.useEffect(() => {
    let cancelado = false
    refTerminado.current = false
    // Cada arranque del efecto es una generación nueva (montaje o «Reintentar»).
    const generacion = (refGeneracion.current += 1)
    setEstado("iniciando")

    const abandonar = (texto: string) => {
      setEstado("detenido")
      setEncuadrado(false)
      avisar(texto)
    }

    const procesar = (lectura: Lectura, frame: Frame) => {
      const medidas = medidasDeVideo(refVideo.current)
      const centro =
        lectura.centro && medidas
          ? centroEnCaja(
              { x: lectura.centro.x + frame.offsetX, y: lectura.centro.y + frame.offsetY },
              medidas
            )
          : null
      if (!lecturaEncuadrada(centro, refMarco.current)) {
        // El código está fuera del recuadro (QR del fondo: un cartel, una promo):
        // se descarta en silencio y se sigue escaneando. Avisar acá taparía la
        // vista con errores por cada cartel que entra en cuadro.
        setEncuadrado(false)
        return
      }
      // Encuadre confirmado: el recuadro se pinta en verde.
      setEncuadrado(true)
      setUltimoCodigo(lectura.texto)
      const run = extraerRunDeQr(lectura.texto)
      if (!run) {
        // QR ajeno (promoción, sitio web, etc.): se sigue escaneando, no se emite nada.
        avisar(MENSAJE_QR_NO_CEDULA)
        return
      }
      if (!validarRun(run)) {
        avisar(MENSAJE_RUN_INVALIDO)
        return
      }
      emitir(run)
    }

    const iniciar = async () => {
      let estrategia: EstrategiaLectura
      try {
        estrategia = await crearEstrategia()
      } catch {
        if (!cancelado) abandonar(MENSAJE_SIN_LECTOR)
        return
      }
      if (cancelado) return

      /**
       * Frame a decodificar: el RECORTE del recuadro guía en píxeles nativos del
       * video, dibujado en el canvas reusado. Sin medidas (o sin contexto 2D) se
       * decodifica el video completo, como antes.
       */
      const prepararFrame = (video: HTMLVideoElement): Frame => {
        const medidas = medidasDeVideo(video)
        // El recuadro se mide en CADA lectura, no se reusa el guardado: si el panel
        // cambió de tamaño sin `resize` (barra del navegador, teclado, contenido que
        // carga), un marco viejo recortaría fuera del QR y el gating lo descartaría
        // en silencio. El overlay sigue al estado, que se refresca en `resize`.
        const marcoCss = medidas ? marcoGuia(medidas) : null
        refMarco.current = marcoCss
        const recorte = medidas && marcoCss ? marcoEnVideo(marcoCss, medidas) : null
        if (recorte) {
          const canvas = (refCanvas.current ??= document.createElement("canvas"))
          if (dibujarRecorte(canvas, video, recorte)) {
            return { origen: canvas, offsetX: recorte.x, offsetY: recorte.y }
          }
        }
        return { origen: video, offsetX: 0, offsetY: 0 }
      }

      const mediaDevices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices
      if (!mediaDevices?.getUserMedia) {
        abandonar(MENSAJE_SIN_CAMARA)
        return
      }

      let stream: MediaStream
      try {
        stream = await abrirCamara(mediaDevices)
      } catch (error) {
        if (!cancelado) abandonar(mensajeDeCamara(error))
        return
      }
      if (cancelado) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      refStream.current = stream
      const pista = pistaDeVideo(stream)
      refPista.current = pista ?? null
      refEstrategia.current = estrategia
      // Lo que el navegador entregó de verdad, y qué acepta el hardware.
      setResolucion(resolucionDe(pista))
      setFocoContinuo(activarFocoContinuo(pista))
      setLinternaDisponible(soportaLinterna(pista))
      setLinternaEncendida(false)
      refLinternaEncendida.current = false
      const video = refVideo.current
      if (video) {
        video.srcObject = stream
        const reproduciendo = video.play()
        if (reproduciendo && typeof reproduciendo.catch === "function") {
          // jsdom no implementa play(): el fallo del preview no frena el escaneo.
          void reproduciendo.catch(() => null)
        }
      }
      setEstado("escaneando")
      // La caja del video ya está montada: se mide antes de la primera lectura.
      medirMarco()

      // Corte por inactividad: sin lectura válida, la cámara no queda encendida.
      refInactividad.current = setTimeout(() => {
        detenerTodo()
        setEstado("detenido")
        setEncuadrado(false)
        avisar(MENSAJE_CAMARA_INACTIVA)
      }, CORTE_POR_INACTIVIDAD_MS)

      let leyendo = false
      refIntervalo.current = setInterval(() => {
        if (refTerminado.current || leyendo) return
        const actual = refVideo.current
        if (!actual) return
        const frame = prepararFrame(actual)
        leyendo = true
        void estrategia
          .leer(frame.origen)
          .then((lectura) => {
            // Descarte de lecturas en vuelo: si el intento ya terminó (corte, cancelar,
            // desmontar) o arrancó otro «Reintentar», la lectura vieja no emite, no
            // avisa y no apaga la cámara del intento vigente. El fallback de zxing
            // entra por acá también: `estrategia.leer` se espera antes de este paso.
            if (!lectura) return
            if (refTerminado.current || refGeneracion.current !== generacion) return
            procesar(lectura, frame)
          })
          .catch(() => null)
          .finally(() => {
            leyendo = false
          })
      }, INTERVALO_LECTURA_MS)
    }

    void iniciar()

    return () => {
      cancelado = true
      detenerTodo()
    }
  }, [detenerTodo, emitir, avisar, medirMarco, intento])

  const cancelar = () => {
    detenerTodo()
    setEstado("detenido")
    setEncuadrado(false)
    onCancelar()
  }

  /**
   * Lectura manual del frame COMPLETO en resolución nativa, sin recorte y sin
   * gating: responde «¿el decodificador ve algo?» sin que el encuadre lo tape.
   * Es el diagnóstico que hace falta cuando el escaneo automático calla.
   */
  const capturar = async () => {
    const video = refVideo.current
    const estrategia = refEstrategia.current
    if (!video || !estrategia || capturando) return
    setCapturando(true)
    try {
      const lectura = await estrategia.leer(video)
      // La estructura se muestra SIEMPRE, también cuando el RUN se emite: el punto
      // es ver si el código trae `nombres`/`apellidos` entre sus claves.
      setEstructura(resumenEstructural(lectura?.texto ?? ""))
      if (!lectura) {
        avisar(MENSAJE_CAPTURA_SIN_LECTURA)
        return
      }
      const run = extraerRunDeQr(lectura.texto)
      if (!run) {
        avisar(`${MENSAJE_CAPTURA_NO_CEDULA} Código: «${vistaPrevia(lectura.texto)}»`)
        return
      }
      if (!validarRun(run)) {
        avisar(MENSAJE_RUN_INVALIDO)
        return
      }
      emitir(run)
    } catch {
      // El lector rechazó el frame: se informa igual que una captura sin lectura.
      avisar(MENSAJE_CAPTURA_SIN_LECTURA)
    } finally {
      setCapturando(false)
    }
  }

  /** Enciende o apaga la linterna del track vigente (sólo si el hardware la declara). */
  const alternarLinterna = () => {
    const encender = !linternaEncendida
    aplicarAvanzada(refPista.current ?? undefined, { torch: encender })
    refLinternaEncendida.current = encender
    setLinternaEncendida(encender)
  }

  /** Rearranca el escaneo con el plazo de inactividad en cero. */
  const reintentar = () => {
    setMensaje(null)
    setEncuadrado(false)
    setEmitido(false)
    setEstructura(null)
    setIntento((anterior) => anterior + 1)
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-md border p-3"
      role="region"
      aria-label="Escáner de QR de la cédula"
    >
      <div className="relative">
        <video
          ref={refVideo}
          className="h-48 w-full rounded-md bg-black object-cover"
          aria-label="Previsualización de la cámara"
          autoPlay
          muted
          playsInline
        />
        {marco ? (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute rounded-sm border-2 transition-colors ${
              encuadrado ? "border-emerald-500" : "border-white/70"
            }`}
            style={{ left: marco.x, top: marco.y, width: marco.ancho, height: marco.alto }}
          />
        ) : null}
        <p className="pointer-events-none absolute inset-x-0 top-1 text-center text-[11px] text-white">
          <span className="rounded bg-black/60 px-1 py-0.5">Poné el QR dentro del recuadro</span>
        </p>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {estado === "iniciando" ? "Pidiendo permiso para usar la cámara…" : null}
        {estado === "escaneando" ? "Acerca el anverso de la cédula: el QR va arriba del retrato." : null}
        {estado === "detenido" && !mensaje ? "Escaneo detenido." : null}
      </p>
      {resolucion ? (
        <p className="text-xs text-muted-foreground">
          Cámara: {resolucion} · foco continuo: {focoContinuo ? "sí" : "no"}
        </p>
      ) : null}
      {estructura ? (
        <p className="text-xs text-muted-foreground">
          Código: {estructura.largo} caracteres · tipo {estructura.tipo} · claves:{" "}
          {estructura.claves.length > 0 ? estructura.claves.join(", ") : "(ninguna)"}
        </p>
      ) : null}
      {ultimoCodigo ? (
        <p className="text-xs text-muted-foreground">
          Último código leído: <code className="break-all">{ultimoCodigo}</code>
        </p>
      ) : null}
      {mensaje ? (
        <p role="alert" className="text-sm text-destructive">
          {mensaje}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {estado === "escaneando" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void capturar()}
            disabled={capturando}
          >
            Capturar
          </Button>
        ) : null}
        {estado === "escaneando" && linternaDisponible ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-pressed={linternaEncendida}
            onClick={alternarLinterna}
          >
            Linterna
          </Button>
        ) : null}
        {estado === "detenido" && !emitido ? (
          <Button type="button" size="sm" onClick={reintentar}>
            Reintentar
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={cancelar}>
          Cancelar escaneo
        </Button>
      </div>
    </div>
  )
}
