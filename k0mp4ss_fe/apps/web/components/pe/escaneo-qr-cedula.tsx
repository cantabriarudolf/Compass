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
 *
 * Reglas de operación:
 * - Nunca emite un RUN sin pasar `validarRun` (dígito verificador módulo 11).
 * - La cámara se apaga al detectar, al cancelar y al desmontar: si no, el LED
 *   queda prendido con la pestaña abierta.
 * - Si no hay cámara o el permiso se niega, devuelve un mensaje legible y NO
 *   rompe: el conserje sigue con el modo manual del mismo formulario.
 */
import * as React from "react"
import { Button } from "@workspace/ui/components/button"
import { extraerRunDeQr } from "@/lib/cedula-qr"
import { validarRun } from "@/lib/validacion-rut"

/** Cada cuánto se intenta leer un frame nuevo (ms). */
const INTERVALO_LECTURA_MS = 300

export const MENSAJE_QR_NO_CEDULA =
  "El QR leído no corresponde a una cédula: no trae un RUN del Registro Civil."
export const MENSAJE_RUN_INVALIDO =
  "El RUN leído no pasa la validación del dígito verificador. Vuelve a apuntar el QR de la cédula."
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

type Deteccion = { rawValue: string }
type DetectorNativo = { detect(origen: CanvasImageSource): Promise<Deteccion[]> }
type ConstructorDetector = new (opciones?: { formats?: string[] }) => DetectorNativo

/** Estrategia de lectura de un frame. `null` = todavía no hay QR en la imagen. */
interface EstrategiaLectura {
  leer(video: HTMLVideoElement): Promise<string | null>
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
      return codigos[0]?.rawValue ?? null
    },
  }
}

/** Fallback para Safari/Firefox: lee con `@zxing/browser` (se importa on demand). */
async function estrategiaZxing(): Promise<EstrategiaLectura> {
  const { BrowserQRCodeReader } = await import("@zxing/browser")
  const lector = new BrowserQRCodeReader()
  return {
    async leer(video) {
      try {
        const resultado = await lector.decodeOnceFromVideoElement(video)
        return resultado.getText()
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
  const refTerminado = React.useRef(false)
  // Los callbacks viven en un ref para que el efecto de cámara no se reinicie
  // cuando el panel se re-renderiza (reiniciarlo apagaría y reencendería el LED).
  const refCallbacks = React.useRef({ onDetectado, onError })
  const [estado, setEstado] = React.useState<Estado>("iniciando")
  const [ultimoCodigo, setUltimoCodigo] = React.useState<string | null>(null)
  const [mensaje, setMensaje] = React.useState<string | null>(null)

  React.useEffect(() => {
    refCallbacks.current = { onDetectado, onError }
  })

  /** Apaga la cámara de verdad: `stop()` en cada track y `srcObject` liberado. */
  const detenerCamara = React.useCallback(() => {
    const stream = refStream.current
    refStream.current = null
    stream?.getTracks().forEach((track) => track.stop())
    const video = refVideo.current
    if (video) video.srcObject = null
  }, [])

  const detenerTodo = React.useCallback(() => {
    refTerminado.current = true
    if (refIntervalo.current) {
      clearInterval(refIntervalo.current)
      refIntervalo.current = null
    }
    detenerCamara()
  }, [detenerCamara])

  React.useEffect(() => {
    let cancelado = false
    refTerminado.current = false

    const avisar = (texto: string) => {
      setMensaje(texto)
      refCallbacks.current.onError(texto)
    }

    const abandonar = (texto: string) => {
      setEstado("detenido")
      avisar(texto)
    }

    const procesar = (texto: string) => {
      setUltimoCodigo(texto)
      const run = extraerRunDeQr(texto)
      if (!run) {
        // QR ajeno (promoción, sitio web, etc.): se sigue escaneando, no se emite nada.
        avisar(MENSAJE_QR_NO_CEDULA)
        return
      }
      if (!validarRun(run)) {
        avisar(MENSAJE_RUN_INVALIDO)
        return
      }
      detenerTodo()
      setEstado("detenido")
      setMensaje(null)
      refCallbacks.current.onDetectado(run)
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

      const mediaDevices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices
      if (!mediaDevices?.getUserMedia) {
        abandonar(MENSAJE_SIN_CAMARA)
        return
      }

      let stream: MediaStream
      try {
        stream = await mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      } catch (error) {
        if (!cancelado) abandonar(mensajeDeCamara(error))
        return
      }
      if (cancelado) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      refStream.current = stream
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

      let leyendo = false
      refIntervalo.current = setInterval(() => {
        if (refTerminado.current || leyendo) return
        const actual = refVideo.current
        if (!actual) return
        leyendo = true
        void estrategia
          .leer(actual)
          .then((texto) => {
            if (texto) procesar(texto)
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
  }, [detenerTodo])

  const cancelar = () => {
    detenerTodo()
    setEstado("detenido")
    onCancelar()
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-md border p-3"
      role="region"
      aria-label="Escáner de QR de la cédula"
    >
      <video
        ref={refVideo}
        className="h-48 w-full rounded-md bg-black object-cover"
        aria-label="Previsualización de la cámara"
        autoPlay
        muted
        playsInline
      />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {estado === "iniciando" ? "Pidiendo permiso para usar la cámara…" : null}
        {estado === "escaneando" ? "Acerca el anverso de la cédula: el QR va arriba del retrato." : null}
        {estado === "detenido" && !mensaje ? "Escaneo detenido." : null}
      </p>
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
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={cancelar}>
          Cancelar escaneo
        </Button>
      </div>
    </div>
  )
}
