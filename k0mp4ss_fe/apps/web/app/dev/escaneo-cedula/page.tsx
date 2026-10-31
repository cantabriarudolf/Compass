"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { notFound } from "next/navigation"

/**
 * Herramienta de prueba (dev) — spike de lectura del PDF417 de una cédula de
 * identidad antigua chilena. No forma parte del producto: no hay integración,
 * no hay ruta de API y no hay persistencia.
 *
 * Privacidad por diseño. El cuadro capturado vive solo en memoria y en el
 * <canvas> de esta pantalla: no se escribe en el almacenamiento del navegador,
 * no se registra en consola, no se copia al portapapeles y no se envía a ningún
 * servidor. Por eso este archivo no usa esas APIs en ningún punto.
 */

const MENSAJE_SIN_LECTURA =
  "no se pudo leer: acercá la cédula, evitá reflejos y volvé a intentar"

const MENSAJE_SIN_CAMARA =
  "no se pudo abrir la cámara: revisá el permiso del navegador y que haya un dispositivo disponible."

/** Motor que se intentó usar en la última captura. */
type Motor = "nativo" | "zxing" | "ninguno"

interface CodigoDetectado {
  rawValue: string
}

interface DetectorNativo {
  detect(origen: CanvasImageSource): Promise<CodigoDetectado[]>
}

interface ConstructorDetectorNativo {
  new (opciones?: { formats?: string[] }): DetectorNativo
  getSupportedFormats(): Promise<string[]>
}

/**
 * `BarcodeDetector` todavía no está en el lib DOM de TypeScript, así que se
 * describe la forma mínima que usa esta página y se lee del global en tiempo de
 * ejecución.
 */
function constructorNativo(): ConstructorDetectorNativo | null {
  if (!("BarcodeDetector" in window)) return null
  const candidato = (
    window as unknown as { BarcodeDetector?: ConstructorDetectorNativo }
  ).BarcodeDetector
  return candidato ?? null
}

interface Diagnostico {
  longitud: number
  pareceUrl: boolean
  pareceJson: boolean
  noImprimibles: number
  puntosNoImprimibles: string
}

function esImprimible(codigo: number): boolean {
  if (codigo < 0x20) return false
  if (codigo === 0x7f) return false
  return !(codigo >= 0x80 && codigo <= 0x9f)
}

function pareceJson(texto: string): boolean {
  const recortado = texto.trim()
  if (!recortado.startsWith("{") && !recortado.startsWith("[")) return false
  try {
    const valor: unknown = JSON.parse(recortado)
    return typeof valor === "object" && valor !== null
  } catch {
    return false
  }
}

/**
 * Diagnóstico automático del texto crudo: sirve para decidir si lo decodificado
 * es legible o si el PDF417 entregó basura.
 */
function diagnosticar(texto: string): Diagnostico {
  const codigos = Array.from(texto, (caracter) => caracter.codePointAt(0) ?? 0)
  const noImprimibles = codigos.filter((codigo) => !esImprimible(codigo))
  const unicos = [...new Set(noImprimibles)]
  return {
    longitud: texto.length,
    pareceUrl: /^(https?|ftp):\/\//i.test(texto.trim()),
    pareceJson: pareceJson(texto),
    noImprimibles: noImprimibles.length,
    puntosNoImprimibles: unicos
      .map((codigo) => `U+${codigo.toString(16).toUpperCase().padStart(4, "0")}`)
      .join(", "),
  }
}

/** Motor nativo del navegador. Devuelve null si no existe o no soporta PDF417. */
async function leerConNativo(canvas: HTMLCanvasElement): Promise<string | null> {
  const Constructor = constructorNativo()
  if (!Constructor) return null

  let formatos: string[]
  try {
    formatos = await Constructor.getSupportedFormats()
  } catch {
    return null
  }
  if (!formatos.includes("pdf417")) return null

  const detector = new Constructor({ formats: ["pdf417"] })
  try {
    const codigos = await detector.detect(canvas)
    return codigos[0]?.rawValue ?? null
  } catch {
    return null
  }
}

/** Respaldo con @zxing/library, cargado en diferido para no pesar en el bundle. */
async function leerConZxing(canvas: HTMLCanvasElement): Promise<string | null> {
  const contexto = canvas.getContext("2d")
  if (!contexto) return null
  const ancho = canvas.width
  const alto = canvas.height
  if (ancho === 0 || alto === 0) return null

  const cuadro = contexto.getImageData(0, 0, ancho, alto)

  const { BinaryBitmap, HybridBinarizer, PDF417Reader, RGBLuminanceSource } =
    await import("@zxing/library")

  // RGBLuminanceSource espera un Int32Array en formato ARGB (0x00RRGGBB).
  const pixeles = new Int32Array(ancho * alto)
  for (let i = 0; i < pixeles.length; i++) {
    const base = i * 4
    const rojo = cuadro.data[base] ?? 0
    const verde = cuadro.data[base + 1] ?? 0
    const azul = cuadro.data[base + 2] ?? 0
    pixeles[i] = (rojo << 16) | (verde << 8) | azul
  }

  try {
    const luminancia = new RGBLuminanceSource(pixeles, ancho, alto)
    const mapaDeBits = new BinaryBitmap(new HybridBinarizer(luminancia))
    const resultado = new PDF417Reader().decode(mapaDeBits)
    return resultado.getText()
  } catch {
    return null
  }
}

function ContenidoEscaneo() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [camaraActiva, setCamaraActiva] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [texto, setTexto] = useState<string | null>(null)
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null)
  const [motor, setMotor] = useState<Motor>("ninguno")

  const apagarCamara = useCallback(() => {
    const stream = streamRef.current
    if (stream) {
      for (const pista of stream.getTracks()) pista.stop()
    }
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamaraActiva(false)
  }, [])

  // La cámara se apaga al salir de la página: no queda ninguna pista viva.
  useEffect(() => apagarCamara, [apagarCamara])

  const encenderCamara = useCallback(async () => {
    setAviso(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play().catch(() => undefined)
      }
      setCamaraActiva(true)
    } catch {
      setAviso(MENSAJE_SIN_CAMARA)
    }
  }, [])

  const capturarYDecodificar = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ancho = video.videoWidth
    const alto = video.videoHeight
    if (ancho === 0 || alto === 0) {
      setAviso(
        "la cámara todavía no entrega imagen: esperá un segundo y volvé a intentar."
      )
      return
    }

    canvas.width = ancho
    canvas.height = alto
    const contexto = canvas.getContext("2d")
    if (!contexto) {
      setAviso("el navegador no expuso el lienzo 2D: no se pudo capturar el cuadro.")
      return
    }
    contexto.drawImage(video, 0, 0, ancho, alto)

    setTrabajando(true)
    setAviso(null)
    setTexto(null)
    setDiagnostico(null)

    let usado: Motor = "nativo"
    let leido: string | null = await leerConNativo(canvas).catch(() => null)
    let falloDeCarga = false

    if (leido === null) {
      usado = "zxing"
      try {
        leido = await leerConZxing(canvas)
      } catch {
        falloDeCarga = true
      }
    }

    setMotor(usado)
    setTrabajando(false)

    if (leido === null) {
      setAviso(
        falloDeCarga
          ? `no se pudo cargar el decodificador de respaldo. ${MENSAJE_SIN_LECTURA}`
          : MENSAJE_SIN_LECTURA
      )
      return
    }

    setTexto(leido)
    setDiagnostico(diagnosticar(leido))
  }, [])

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Escaneo de cédula antigua (prueba)</h1>

      <p className="text-sm leading-relaxed">
        Herramienta de prueba (dev). La imagen y el texto decodificado{" "}
        <strong>no salen de esta pantalla</strong>: no se guardan, no se registran en
        consola y no se envían a ningún servidor.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={encenderCamara}
          disabled={camaraActiva || trabajando}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Encender cámara
        </button>
        <button
          type="button"
          onClick={capturarYDecodificar}
          disabled={!camaraActiva || trabajando}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Capturar y decodificar
        </button>
        <button
          type="button"
          onClick={apagarCamara}
          disabled={!camaraActiva}
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Apagar cámara
        </button>
      </div>

      <video
        ref={videoRef}
        muted
        playsInline
        className="w-full rounded-md border bg-black"
      />

      <canvas ref={canvasRef} className="w-full rounded-md border bg-black" />

      {aviso !== null && (
        <p role="alert" className="rounded-md border border-amber-500 p-3 text-sm">
          {aviso}
        </p>
      )}

      <p className="text-sm">
        Motor de la última captura:{" "}
        <span className="font-mono">
          {motor === "nativo" && "nativo (BarcodeDetector)"}
          {motor === "zxing" && "respaldo (@zxing/library)"}
          {motor === "ninguno" && "ninguno todavía"}
        </span>
      </p>

      {texto !== null && diagnostico !== null && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Texto crudo</h2>
          <pre className="overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
            {texto}
          </pre>

          <h2 className="text-lg font-semibold">Diagnóstico</h2>
          <ul className="flex flex-col gap-1 text-sm">
            <li>Longitud: {diagnostico.longitud} caracteres</li>
            <li>Parece URL: {diagnostico.pareceUrl ? "sí" : "no"}</li>
            <li>Parece JSON: {diagnostico.pareceJson ? "sí" : "no"}</li>
            <li>
              Caracteres no imprimibles: {diagnostico.noImprimibles}
              {diagnostico.puntosNoImprimibles !== "" &&
                ` (${diagnostico.puntosNoImprimibles})`}
            </li>
          </ul>
        </section>
      )}
    </main>
  )
}

/**
 * Guarda dura: fuera de desarrollo la página no existe. `process.env.NODE_ENV` se
 * reemplaza en tiempo de build, así que en producción esto resuelve a 404 antes
 * de montar cualquier efecto.
 */
export default function PaginaEscaneoCedula() {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }

  return <ContenidoEscaneo />
}
