/**
 * @vitest-environment node
 *
 * Cobertura de las utilidades de validación de `lib/schemas.ts` que quedaron sin
 * ejecutar tras el retiro del store legacy, más los refinamientos D1 que solo
 * corren cuando el schema recibe una URL embebida (`data:`/`blob:`):
 *
 * - `formatoErrorZod` (campo + mensaje, tope de 3 detalles, sin ruta).
 * - `validarMaestro` (clave soportada / clave desconocida).
 * - `UrlReferenciaIRSchema` (D1 en `fichaTecnicaUrl`/`facturaUrl`).
 * - `CertificadoCTSchema.firmaUrl` (D1 en la firma digitalizada).
 *
 * Los mensajes se asertan contra el texto real del schema: son contrato de la
 * API (`jsonError(400, ...)` los devuelve al cliente).
 */
import { describe, it, expect } from "vitest"
import { z } from "zod"
import {
  CertificadoCTSchema,
  ImagenReferenciaSchema,
  PeriodoDirectivaSchema,
  RecursoIRSchema,
  formatoErrorZod,
  validarConEsquema,
  validarMaestro,
} from "@/lib/schemas"

/** Recurso IR mínimo válido; cada test sobrescribe solo el campo que estudia. */
function recursoIR(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ir-rec-1",
    nombre: "Extintor ABC 6kg",
    categoria: "epp",
    estadoActivo: "disponible",
    stock: 5,
    esCritico: false,
    ...overrides,
  }
}

/** Certificado CT mínimo válido; `firmaUrl` es el campo bajo estudio. */
function certificadoCT(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ct-1",
    folio: "CT-0001",
    codigoVerificacion: "ABC123",
    tipo: "residencia",
    solicitanteNombre: "Ana Pérez",
    resumen: "Certificado de residencia",
    detalle: [{ clave: "Unidad", valor: "101" }],
    fechaEmision: "2026-01-15",
    ...overrides,
  }
}

describe("formatoErrorZod — resumen legible de un ZodError", () => {
  it("antepone el campo al mensaje cuando el issue tiene ruta", () => {
    const resultado = z
      .object({ nombre: z.string({ required_error: "El nombre es obligatorio." }) })
      .safeParse({})
    expect(resultado.success).toBe(false)
    if (resultado.success) return
    expect(formatoErrorZod(resultado.error)).toBe(
      "Datos inválidos: nombre: El nombre es obligatorio."
    )
  })

  it("no antepone campo cuando el issue es de raíz (refine de objeto)", () => {
    const schema = z
      .object({ a: z.string() })
      .refine(() => false, { message: "Regla de negocio incumplida." })
    const resultado = schema.safeParse({ a: "x" })
    expect(resultado.success).toBe(false)
    if (resultado.success) return
    expect(formatoErrorZod(resultado.error)).toBe(
      "Datos inválidos: Regla de negocio incumplida."
    )
  })

  it("con exactamente 3 detalles no agrega elipsis", () => {
    const schema = z.object({
      a: z.string({ required_error: "falta a." }),
      b: z.string({ required_error: "falta b." }),
      c: z.string({ required_error: "falta c." }),
    })
    const resultado = schema.safeParse({})
    if (resultado.success) throw new Error("se esperaba fallo de validación")
    const texto = formatoErrorZod(resultado.error)
    expect(texto).toBe("Datos inválidos: a: falta a.; b: falta b.; c: falta c.")
    expect(texto).not.toContain("…")
  })

  it("con más de 3 detalles recorta a los 3 primeros y cierra con elipsis", () => {
    const schema = z.object({
      a: z.string({ required_error: "falta a." }),
      b: z.string({ required_error: "falta b." }),
      c: z.string({ required_error: "falta c." }),
      d: z.string({ required_error: "falta d." }),
    })
    const resultado = schema.safeParse({})
    if (resultado.success) throw new Error("se esperaba fallo de validación")
    expect(formatoErrorZod(resultado.error)).toBe(
      "Datos inválidos: a: falta a.; b: falta b.; c: falta c.…"
    )
  })
})

describe("validarConEsquema / validarMaestro — despacho de maestros", () => {
  it("validarConEsquema devuelve data tipada en éxito", () => {
    const res = validarConEsquema(
      z.object({ id: z.string(), nombre: z.string() }),
      { id: "m-1", nombre: "AFP Uno" }
    )
    expect(res).toEqual({ ok: true, data: { id: "m-1", nombre: "AFP Uno" } })
  })

  it("validarConEsquema devuelve el error formateado en fallo", () => {
    const res = validarConEsquema(
      z.object({ nombre: z.string({ required_error: "El nombre es obligatorio." }) }),
      {}
    )
    expect(res).toEqual({
      ok: false,
      error: "Datos inválidos: nombre: El nombre es obligatorio.",
    })
  })

  it("validarMaestro valida una clave soportada (afps)", () => {
    const res = validarMaestro("afps", {
      id: "afp-1",
      nombre: "AFP Habitat",
      tasaCotizacion: 10.58,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toEqual({ id: "afp-1", nombre: "AFP Habitat", tasaCotizacion: 10.58 })
  })

  it("validarMaestro devuelve error formateado cuando el ítem es inválido", () => {
    const res = validarMaestro("afps", { id: "afp-1", nombre: "", tasaCotizacion: 10 })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.startsWith("Datos inválidos: ")).toBe(true)
    expect(res.error).toContain("nombre: El nombre es obligatorio.")
  })

  it("validarMaestro con clave desconocida no consulta ningún schema", () => {
    expect(validarMaestro("maestroInexistente", {})).toEqual({
      ok: false,
      error: 'Maestro "maestroInexistente" no soportado.',
    })
  })
})

describe("UrlReferenciaIRSchema — D1: solo referencias, nunca binario embebido", () => {
  it("acepta una URL https de ficha técnica", () => {
    const parsed = RecursoIRSchema.safeParse(
      recursoIR({ fichaTecnicaUrl: "https://cdn.test.cl/ficha.pdf" })
    )
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.fichaTecnicaUrl).toBe("https://cdn.test.cl/ficha.pdf")
  })

  it("rechaza fichaTecnicaUrl data-URL con el mensaje D1", () => {
    const parsed = RecursoIRSchema.safeParse(
      recursoIR({ fichaTecnicaUrl: "data:application/pdf;base64,AAA" })
    )
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "fichaTecnicaUrl")
    expect(issue?.message).toBe(
      "Media por referencia (D1): no se permiten data-URL ni Blob embebidos."
    )
  })

  it("rechaza facturaUrl blob: sin importar mayúsculas", () => {
    const parsed = RecursoIRSchema.safeParse(
      recursoIR({ facturaUrl: "BLOB:https://interno/factura.png" })
    )
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.issues.some((i) => i.path.join(".") === "facturaUrl")).toBe(true)
  })

  it("rechaza una URL de más de 2048 caracteres con el mensaje de largo", () => {
    const larga = `https://cdn.test.cl/${"a".repeat(2048)}`
    const parsed = RecursoIRSchema.safeParse(recursoIR({ fichaTecnicaUrl: larga }))
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "fichaTecnicaUrl")
    expect(issue?.message).toBe("La URL excede el largo permitido.")
  })
})

describe("CertificadoCTSchema.firmaUrl — D1 en la firma digitalizada", () => {
  it("acepta la firma como URL de referencia", () => {
    const parsed = CertificadoCTSchema.safeParse(
      certificadoCT({ firmaUrl: "https://cdn.test.cl/firma-admin.png" })
    )
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.firmaUrl).toBe("https://cdn.test.cl/firma-admin.png")
  })

  it("acepta el certificado sin firma (campo opcional)", () => {
    expect(CertificadoCTSchema.safeParse(certificadoCT()).success).toBe(true)
  })

  it("rechaza una firma data-URL con el mensaje D1 de la firma", () => {
    const parsed = CertificadoCTSchema.safeParse(
      certificadoCT({ firmaUrl: "data:image/png;base64,AAAA" })
    )
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "firmaUrl")
    expect(issue?.message).toBe(
      "Media por referencia (D1): la firma debe ser una URL, no contenido embebido."
    )
  })
})

/**
 * `ImagenReferenciaSchema.url` — la regla D1 del archivo por referencia.
 *
 * El schema es la pieza que comparten publicaciones del portal, evidencias MT y
 * comprobantes FI, y hasta el retiro de `documentos_co` (F35 A5) el único test que
 * ejercitaba su `url` era el de la tabla retirada. La regla sigue viva, así que se
 * prueba acá: si mañana alguien acepta un binario embebido en cualquier adjunto, el
 * que falla es este caso.
 */
describe("ImagenReferenciaSchema.url — D1 en los adjuntos por referencia", () => {
  const imagen = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    nombre: "circular-fachada.pdf",
    tipoMime: "application/pdf",
    tamanoKB: 120,
    url: "https://cdn.test.cl/circular.pdf",
    ...overrides,
  })

  it("acepta una URL https de referencia", () => {
    const parsed = ImagenReferenciaSchema.safeParse(imagen())
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.url).toBe("https://cdn.test.cl/circular.pdf")
  })

  it("rechaza una data-URL con el mensaje D1 de los adjuntos", () => {
    const parsed = ImagenReferenciaSchema.safeParse(
      imagen({ url: "data:application/pdf;base64,AAA" })
    )
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "url")
    expect(issue?.message).toBe(
      "Media por referencia: no se permiten data-URL ni Blob embebidos (D1)."
    )
  })

  it("rechaza un blob: sin importar mayúsculas", () => {
    const parsed = ImagenReferenciaSchema.safeParse(imagen({ url: "BLOB:interno/foto.png" }))
    expect(parsed.success).toBe(false)
  })
})

/**
 * `PeriodoDirectivaSchema.fechaInscripcion` — la fecha de inscripción del
 * período es referencial: la ley no exige inscribir la directiva, así que el
 * campo acepta `""` (= la comunidad no inscribió). Por eso no es un
 * `FechaISOSchema` pelado sino una unión con su propio mensaje: un cliente que
 * manda `01/02/2026` tiene que recibir qué formato se espera, no el error
 * genérico de la unión.
 */
describe("PeriodoDirectivaSchema.fechaInscripcion — fecha referencial o vacía", () => {
  /** Período mínimo válido; cada test sobrescribe solo `fechaInscripcion`. */
  function periodo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: "gd-per-1",
      fechaInicio: "2026-01-15",
      duracionMeses: 24,
      estado: "vigente",
      miembros: [],
      ...overrides,
    }
  }

  it("un valor que no es texto recibe el mensaje del contrato", () => {
    const parsed = PeriodoDirectivaSchema.safeParse(periodo({ fechaInscripcion: 20260201 }))
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "fechaInscripcion")
    expect(issue?.message).toBe(
      "Debe ser una fecha con formato AAAA-MM-DD o quedar vacía."
    )
  })

  it("una fecha con formato equivocado recibe el formato esperado, no un error genérico", () => {
    const parsed = PeriodoDirectivaSchema.safeParse(
      periodo({ fechaInscripcion: "01/02/2026" })
    )
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "fechaInscripcion")
    expect(issue?.message).toContain("AAAA-MM-DD")
  })

  it("acepta vacío (la comunidad no inscribió el período) y una fecha ISO", () => {
    const vacio = PeriodoDirectivaSchema.safeParse(periodo({ fechaInscripcion: "" }))
    expect(vacio.success).toBe(true)
    if (vacio.success) expect(vacio.data.fechaInscripcion).toBe("")

    const conFecha = PeriodoDirectivaSchema.safeParse(
      periodo({ fechaInscripcion: "2026-02-01" })
    )
    expect(conFecha.success).toBe(true)
    if (conFecha.success) expect(conFecha.data.fechaInscripcion).toBe("2026-02-01")
  })
})
