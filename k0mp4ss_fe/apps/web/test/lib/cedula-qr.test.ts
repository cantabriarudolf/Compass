// @vitest-environment node
/**
 * Contrato de la lectura del QR de la cédula (PE-visitas).
 *
 * Lo que fija:
 * - `extraerRunDeQr` acepta la URL del Registro Civil (`?RUN=…`) y un RUN
 *   pelado, y normaliza puntos/guiones/minúsculas a `cuerpo-DV`.
 * - `validarRun` es la puerta: dígito verificador módulo 11, incluido el caso
 *   K y el inválido (un QR leído NUNCA se asume válido).
 * - `mascararRun` esconde el cuerpo salvo los dos primeros dígitos (lo que se
 *   muestra al conserje antes de confirmar) y conserva el DV.
 * - `variantesRun` alimenta el filtro server-side por RUT del padrón.
 * - `centroDentroDelMarco` decide si el código detectado está dentro del
 *   recuadro guía (evita leer un QR del fondo) y `lecturaEncuadrada` aplica la
 *   política: sin geometría del motor no se bloquea la lectura.
 */
import { describe, expect, it } from "vitest"
import {
  centroDentroDelMarco,
  centroEnCaja,
  extraerRunDeQr,
  lecturaEncuadrada,
  marcoEnVideo,
  marcoGuia,
  type CajaVideo,
  type Marco,
  type Punto,
} from "@/lib/cedula-qr"
import { mascararRun, normalizarRun, validarRun, variantesRun } from "@/lib/validacion-rut"

const URL_CEDULA =
  "https://www.registrocivil.cl/servicios-en-linea/valida-documento?RUN=16.444.555-0&type=CEDULA"
const URL_CEDULA_K =
  "https://www.registrocivil.cl/servicios-en-linea/valida-documento?type=CEDULA&run=1000005-k"

describe("extraerRunDeQr", () => {
  it("extrae el RUN del parámetro RUN de la URL del Registro Civil", () => {
    expect(extraerRunDeQr(URL_CEDULA)).toBe("16444555-0")
  })

  it("acepta el parámetro en minúscula y el DV K en minúscula", () => {
    expect(extraerRunDeQr(URL_CEDULA_K)).toBe("1000005-K")
  })

  it("acepta el RUN pelado con puntos, con guion o sin guion", () => {
    expect(extraerRunDeQr("16.444.555-0")).toBe("16444555-0")
    expect(extraerRunDeQr("16444555-0")).toBe("16444555-0")
    expect(extraerRunDeQr("164445550")).toBe("16444555-0")
    expect(extraerRunDeQr("  16444555-0 \n")).toBe("16444555-0")
  })

  it("devuelve null cuando el texto no es una cédula", () => {
    expect(extraerRunDeQr("Hola, ¿cómo estás?")).toBeNull()
    expect(extraerRunDeQr("https://example.com/promo?foo=1")).toBeNull()
    expect(extraerRunDeQr("")).toBeNull()
    expect(extraerRunDeQr("1234")).toBeNull()
    expect(extraerRunDeQr("16444555-")).toBeNull()
  })

  it("extrae el RUN aunque el DV sea inválido: validar es responsabilidad de validarRun", () => {
    // Un solo carácter cambiado en el DV ya rompe el módulo 11.
    const urlConDvInvalido =
      "https://www.registrocivil.cl/valida-documento?type=CEDULA&RUN=16444555-1"
    expect(extraerRunDeQr(urlConDvInvalido)).toBe("16444555-1")
    expect(validarRun("16444555-1")).toBe(false)
  })
})

describe("normalizarRun", () => {
  it("normaliza a cuerpo-DV sin puntos y con DV en mayúscula", () => {
    expect(normalizarRun("15.123.456-9")).toBe("15123456-9")
    expect(normalizarRun("151234569")).toBe("15123456-9")
    expect(normalizarRun("1000005k")).toBe("1000005-K")
  })

  it("rechaza lo que no tiene forma de RUN", () => {
    expect(normalizarRun("")).toBeNull()
    expect(normalizarRun("abc")).toBeNull()
    expect(normalizarRun("1234567890123")).toBeNull()
    expect(normalizarRun("16444555-X")).toBeNull()
  })
})

describe("validarRun (dígito verificador módulo 11)", () => {
  it("acepta RUN válidos en cualquier grafía", () => {
    expect(validarRun("16.444.555-0")).toBe(true)
    expect(validarRun("16444555-0")).toBe(true)
    expect(validarRun("164445550")).toBe(true)
    expect(validarRun("15.123.456-9")).toBe(true)
    expect(validarRun("12345678-5")).toBe(true)
  })

  it("acepta el DV K cuando corresponde", () => {
    expect(validarRun("1000005-K")).toBe(true)
    expect(validarRun("1000005k")).toBe(true)
    expect(validarRun("10000050")).toBe(false) // el DV de 1000005 es K, no 0
    expect(validarRun("1000005-0")).toBe(false)
  })

  it("rechaza RUN con dígito verificador incorrecto", () => {
    expect(validarRun("15.123.456-0")).toBe(false)
    expect(validarRun("16.444.555-1")).toBe(false)
    expect(validarRun("12345678-4")).toBe(false)
  })

  it("rechaza basura sin intentar adivinar", () => {
    expect(validarRun("")).toBe(false)
    expect(validarRun("sin-run")).toBe(false)
    expect(validarRun("16444555")).toBe(false)
  })
})

describe("variantesRun", () => {
  it("devuelve las grafías con y sin puntos para el filtro server-side", () => {
    expect(variantesRun("16444555-0")).toEqual(["16444555-0", "16.444.555-0", "164445550"])
  })

  it("devuelve [] cuando el valor no es un RUN", () => {
    expect(variantesRun("pasaporte-AB123456")).toEqual([])
  })
})

describe("mascararRun", () => {
  it("esconde el cuerpo salvo el primer grupo de miles y conserva el DV", () => {
    expect(mascararRun("16.444.555-0")).toBe("16.***.***-0")
    expect(mascararRun("1000005-K")).toBe("1.***.***-K")
  })

  it("devuelve null si no es un RUN", () => {
    expect(mascararRun("n/a")).toBeNull()
  })
})

// Recuadro guía del escáner: 200x200 px con origen en (100, 50).
const MARCO: Marco = { x: 100, y: 50, ancho: 200, alto: 200 }

/** Centro del recuadro (200, 150): el caso feliz. */
const CENTRO_ADENTRO: Punto = { x: 200, y: 150 }

describe("centroDentroDelMarco (recuadro guía del escáner)", () => {
  it("acepta el centro que cae dentro del recuadro", () => {
    expect(centroDentroDelMarco(CENTRO_ADENTRO, MARCO)).toBe(true)
    expect(centroDentroDelMarco({ x: 101, y: 51 }, MARCO)).toBe(true)
    expect(centroDentroDelMarco({ x: 299, y: 249 }, MARCO)).toBe(true)
  })

  it("rechaza el centro que cae fuera del recuadro por cualquier lado", () => {
    expect(centroDentroDelMarco({ x: 99, y: 150 }, MARCO)).toBe(false)
    expect(centroDentroDelMarco({ x: 301, y: 150 }, MARCO)).toBe(false)
    expect(centroDentroDelMarco({ x: 200, y: 49 }, MARCO)).toBe(false)
    expect(centroDentroDelMarco({ x: 200, y: 251 }, MARCO)).toBe(false)
  })

  it("cuenta el borde exacto como adentro", () => {
    expect(centroDentroDelMarco({ x: 100, y: 150 }, MARCO)).toBe(true)
    expect(centroDentroDelMarco({ x: 300, y: 150 }, MARCO)).toBe(true)
    expect(centroDentroDelMarco({ x: 200, y: 50 }, MARCO)).toBe(true)
    expect(centroDentroDelMarco({ x: 200, y: 250 }, MARCO)).toBe(true)
    // La esquina inferior derecha también es borde.
    expect(centroDentroDelMarco({ x: 300, y: 250 }, MARCO)).toBe(true)
  })

  it("un recuadro de tamaño cero no contiene ningún centro", () => {
    const enOrigen: Punto = { x: 100, y: 50 }
    expect(centroDentroDelMarco(enOrigen, { x: 100, y: 50, ancho: 0, alto: 0 })).toBe(false)
    expect(centroDentroDelMarco(enOrigen, { x: 100, y: 50, ancho: 0, alto: 200 })).toBe(false)
    expect(centroDentroDelMarco(enOrigen, { x: 100, y: 50, ancho: 200, alto: 0 })).toBe(false)
  })
})

describe("lecturaEncuadrada (política: sin geometría no se bloquea)", () => {
  it("acepta la lectura cuando el motor no dio centro o el video no está medido", () => {
    expect(lecturaEncuadrada(null, MARCO)).toBe(true)
    expect(lecturaEncuadrada(CENTRO_ADENTRO, null)).toBe(true)
    expect(lecturaEncuadrada(null, null)).toBe(true)
  })

  it("delega en centroDentroDelMarco cuando hay centro y recuadro", () => {
    expect(lecturaEncuadrada(CENTRO_ADENTRO, MARCO)).toBe(true)
    expect(lecturaEncuadrada({ x: 10, y: 10 }, MARCO)).toBe(false)
  })
})

/** Video real de 640x480 pintado en una caja de 400x192 (más ancha: `object-cover` recorta). */
const CAJA_RECORTADA: CajaVideo = { ancho: 400, alto: 192, anchoReal: 640, altoReal: 480 }
/** El mismo video pintado en una caja de igual proporción, sin recorte. */
const CAJA_COMPLETA: CajaVideo = { ancho: 400, alto: 300, anchoReal: 640, altoReal: 480 }

describe("marcoGuia (recuadro sobre las dimensiones renderizadas)", () => {
  it("es un cuadrado centrado del 60% del ancho cuando la altura alcanza", () => {
    // 400x300: 60% del ancho son 240 px de lado, y caben en los 300 px de alto.
    expect(marcoGuia(CAJA_COMPLETA)).toEqual({ x: 80, y: 30, ancho: 240, alto: 240 })
  })

  it("se achica a la altura disponible para no salirse del área visible", () => {
    // 400x192: 60% del ancho serían 240 px, más que el alto: el lado queda en 192.
    expect(marcoGuia(CAJA_RECORTADA)).toEqual({ x: 104, y: 0, ancho: 192, alto: 192 })
  })

  it("devuelve null mientras el video no tenga dimensiones renderizadas", () => {
    expect(marcoGuia({ ancho: 0, alto: 0 })).toBeNull()
    expect(marcoGuia({ ancho: 0, alto: 300 })).toBeNull()
    expect(marcoGuia({ ancho: 400, alto: 0 })).toBeNull()
  })
})

describe("centroEnCaja (píxeles del video real a píxeles CSS del elemento)", () => {
  it("escala por la relación entre lo renderizado y el video real (no usa píxeles CSS crudos)", () => {
    // Cámara de 1280x960 en una caja de 640x480: cada píxel real vale medio CSS.
    const retina: CajaVideo = { ancho: 640, alto: 480, anchoReal: 1280, altoReal: 960 }
    expect(centroEnCaja({ x: 640, y: 480 }, retina)).toEqual({ x: 320, y: 240 })
    expect(centroEnCaja({ x: 100, y: 200 }, retina)).toEqual({ x: 50, y: 100 })
  })

  it("mantiene el centro del video real en el centro de la caja aunque object-cover recorte", () => {
    expect(centroEnCaja({ x: 320, y: 240 }, CAJA_RECORTADA)).toEqual({ x: 200, y: 96 })
  })

  it("devuelve null sin dimensiones del video real o de la caja", () => {
    expect(centroEnCaja({ x: 10, y: 10 }, { ...CAJA_COMPLETA, anchoReal: 0 })).toBeNull()
    expect(centroEnCaja({ x: 10, y: 10 }, { ...CAJA_COMPLETA, altoReal: 0 })).toBeNull()
    expect(centroEnCaja({ x: 10, y: 10 }, { ...CAJA_COMPLETA, ancho: 0 })).toBeNull()
    expect(centroEnCaja({ x: 10, y: 10 }, { ...CAJA_COMPLETA, alto: 0 })).toBeNull()
  })
})

describe("marcoEnVideo (recorte en píxeles nativos del video)", () => {
  it("es la inversa del mapeo de object-cover: el marco CSS vuelve a píxeles nativos", () => {
    // Caja 400x300 con video 640x480: escala 0.625 sin recorte.
    const marco = marcoGuia(CAJA_COMPLETA)!
    expect(marcoEnVideo(marco, CAJA_COMPLETA)).toEqual({ x: 128, y: 48, ancho: 384, alto: 384 })
  })

  it("ida y vuelta: las esquinas del recorte caen en las esquinas del marco CSS", () => {
    const marco = marcoGuia(CAJA_COMPLETA)!
    const recorte = marcoEnVideo(marco, CAJA_COMPLETA)!
    expect(centroEnCaja({ x: recorte.x, y: recorte.y }, CAJA_COMPLETA)).toEqual({
      x: marco.x,
      y: marco.y,
    })
    expect(
      centroEnCaja(
        { x: recorte.x + recorte.ancho, y: recorte.y + recorte.alto },
        CAJA_COMPLETA
      )
    ).toEqual({ x: marco.x + marco.ancho, y: marco.y + marco.alto })
  })

  it("compensa el recorte de object-cover en un video más ancho que la caja", () => {
    const marco = marcoGuia(CAJA_RECORTADA)!
    const recorte = marcoEnVideo(marco, CAJA_RECORTADA)!
    // El marco arranca en y=0 de la caja, que ya está recortada 54 px arriba.
    expect(recorte).toEqual({ x: 166.4, y: 86.4, ancho: 307.2, alto: 307.2 })
    expect(centroEnCaja({ x: recorte.x, y: recorte.y }, CAJA_RECORTADA)).toEqual({
      x: marco.x,
      y: marco.y,
    })
  })

  it("devuelve null sin dimensiones: no hay recorte que dibujar", () => {
    const marco = marcoGuia(CAJA_COMPLETA)!
    expect(marcoEnVideo(marco, { ...CAJA_COMPLETA, anchoReal: 0 })).toBeNull()
    expect(marcoEnVideo(marco, { ...CAJA_COMPLETA, altoReal: 0 })).toBeNull()
    expect(marcoEnVideo(marco, { ...CAJA_COMPLETA, ancho: 0 })).toBeNull()
    expect(marcoEnVideo(marco, { ...CAJA_COMPLETA, alto: 0 })).toBeNull()
  })
})

describe("encuadre de punta a punta (caja medida + código detectado)", () => {
  const marco = marcoGuia(CAJA_COMPLETA)

  it("acepta el QR que el conserje ve dentro del recuadro", () => {
    // QR centrado en el video real: cae en el centro del recuadro.
    const centro = centroEnCaja({ x: 320, y: 240 }, CAJA_COMPLETA)
    expect(lecturaEncuadrada(centro, marco)).toBe(true)
  })

  it("descarta el QR que el conserje ve fuera del recuadro", () => {
    // Esquina superior izquierda del video real: fuera del cuadrado guía.
    const centro = centroEnCaja({ x: 20, y: 20 }, CAJA_COMPLETA)
    expect(lecturaEncuadrada(centro, marco)).toBe(false)
  })
})
