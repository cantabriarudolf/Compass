// @vitest-environment jsdom
/**
 * T4 cobro-gastos-comunes-parametrico (S1/S3) — versión del reglamento del
 * gasto común en la configuración del administrador.
 *
 * La versión es append-only y `version` la asigna el servidor: lo observable
 * es que la pantalla muestre la versión que rige (con sus unidades y sin
 * redondear), que sin versión avise que la emisión está bloqueada, y que el
 * alta mande los valores tipeados tal cual, sin `version`.
 *
 * `fetch` se stubbea (mismo patrón que `ficha-consentimiento.test.tsx`): el GET
 * devuelve la versión o el 404 del servidor y el POST se registra para afirmar
 * el cuerpo enviado.
 */
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { ReglamentoGC } from "@/components/admin/reglamento-gc"
import ConfiguracionPage from "@/app/admin/configuracion/page"
import { configuracionDefault } from "@/data/admin/configuracion"
import { instalarEntornoRadix } from "./entorno-radix"

// Mismo piso que el resto de los tests de componentes: bajo la instrumentación
// de cobertura del suite completo el caso (f) roza los 5 s (el default de
// Vitest) y falla por tiempo, no por comportamiento.
vi.setConfig({ testTimeout: 60_000 })

/** Versión vigente de fixture: acta real, números con decimales que no se redondean. */
const VERSION = {
  id: "vreg-1",
  comunidadId: "com-1",
  version: 2,
  vigenteDesde: "2026-03",
  fuenteInstrumento: "acta_asamblea",
  actaRef: "Acta de asamblea N° 12, 2026-02-20",
  formaContribucion: "coeficiente",
  parametros: {
    porcentajeReserva: 8.5,
    diasPagoGc: 12,
    tasaMoraMensualPct: 1.2345,
    topeMoraPct: 37.5,
    cuotasCorte: 3,
    diasPreavisoCorte: 5,
    ipcActivo: true,
  },
  createdAt: "2026-02-21T00:00:00.000Z",
}

interface Peticion {
  metodo: string
  url: string
  cuerpo?: unknown
}

const peticiones: Peticion[] = []

function responderJson(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** GET: la versión vigente o el 404 de «todavía no declarada». POST: lo que diga el caso. */
let versionVigente: unknown = null
let respuestaPost = { status: 201, cuerpo: { id: "vreg-2", version: 3 } as unknown }

const fetchFalso = vi.fn(
  async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const metodo = init?.method ?? "GET"
    const cuerpo = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    peticiones.push({ metodo, url, cuerpo })
    if (metodo === "POST" && url.startsWith("/api/reglamento")) {
      return responderJson(respuestaPost.cuerpo, respuestaPost.status)
    }
    // La página de configuración lee su propia config; el bloque nuevo no la toca.
    if (url === "/api/configuracion") return responderJson(configuracionDefault)
    if (versionVigente) return responderJson(versionVigente)
    return responderJson(
      {
        error:
          "La comunidad no tiene una versión del reglamento vigente para el período 2026-11.",
      },
      404
    )
  }
)

beforeEach(() => {
  instalarEntornoRadix()
  // El guardado de la configuración responde con `alert`; sin stub, jsdom avisa.
  vi.spyOn(window, "alert").mockImplementation(() => {})
  versionVigente = null
  respuestaPost = { status: 201, cuerpo: { id: "vreg-2", version: 3 } }
  vi.stubGlobal("fetch", fetchFalso)
})

afterEach(() => {
  cleanup()
  peticiones.length = 0
  fetchFalso.mockClear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Caché SWR aislada por caso: el 404 de un test no se arrastra al siguiente. */
function montar(): void {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ReglamentoGC />
    </SWRConfig>
  )
}

/** La página completa: el bloque vive dentro de `<form id="config-form">`. */
function montarPagina(): void {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ConfiguracionPage />
    </SWRConfig>
  )
}

/**
 * La página completa, esperando al FORMULARIO y no al marco.
 *
 * `a3ba4f4` cambió la pantalla a propósito: el marco y las cinco pestañas se
 * pintan siempre —también mientras la configuración no llegó, y con tarjeta de
 * error y «Reintentar» si la API falla—, así que la pestaña «Gasto Común» existe
 * ANTES de que existan sus campos y su panel todavía no está montado. Esperar el
 * botón «Guardar Cambios» (que sólo se pinta con los datos cargados) deja la
 * pestaña lista para el click sin ablandar ninguna aserción: los campos que se
 * piden abajo siguen siendo obligatorios, y ahora la prueba distingue «no cargó»
 * de «no muestra».
 */
async function montarPaginaConFormulario(): Promise<void> {
  montarPagina()
  await screen.findByRole("button", { name: "Guardar Cambios" })
}

/** Abre el combobox `nombre` y elige la opción cuyo texto matchea `patron`. */
async function elegir(
  user: ReturnType<typeof userEvent.setup>,
  nombre: RegExp,
  patron: RegExp
): Promise<void> {
  await user.click(screen.getByRole("combobox", { name: nombre }))
  const listbox = await screen.findByRole("listbox", {}, { timeout: 5_000 })
  const opcion = within(listbox)
    .getAllByRole("option")
    .find((o) => patron.test(o.textContent ?? ""))
  if (!opcion) {
    throw new Error(`sin opción ${String(patron)} en el combobox ${String(nombre)}`)
  }
  await user.click(opcion)
}

/** Los decimales van por `change` directo: `type=number` + tipeo en jsdom pierde el punto. */
function escribir(id: RegExp, valor: string): void {
  fireEvent.change(screen.getByLabelText(id), { target: { value: valor } })
}

/**
 * Completa los siete números y la declaración. Los dos interruptores quedan en
 * su valor por defecto (IPC apagado, recargo de reserva encima del presupuesto)
 * salvo que el caso los toque a propósito.
 */
async function completar(
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  await user.type(screen.getByLabelText(/Vigente desde/), "2026-04")
  await elegir(user, /Instrumento que la funda/, /Reglamento de copropiedad/)
  await user.type(
    screen.getByLabelText(/Acta o artículo de referencia/),
    "Reglamento de copropiedad, art. 11"
  )
  await elegir(user, /Forma de contribución/, /Por coeficiente/)
  escribir(/Fondo de reserva/, "12.5")
  escribir(/Plazo de pago/, "10")
  escribir(/Tasa de mora mensual/, "1.2345")
  escribir(/Tope de mora/, "2.75")
  escribir(/Cuotas impagas para el corte/, "3")
  escribir(/Preaviso del corte/, "5")
  await user.click(screen.getByRole("switch", { name: "Reajuste por IPC" }))
}

describe("ReglamentoGC — versión vigente y alta de versión", () => {
  it("(a) con versión declarada muestra instrumento, período y parámetros sin redondear", async () => {
    versionVigente = VERSION
    montar()

    expect(await screen.findByText("Acta de asamblea")).toBeTruthy()
    expect(screen.getByText("2026-03")).toBeTruthy()
    expect(screen.getByText("Acta de asamblea N° 12, 2026-02-20")).toBeTruthy()
    expect(screen.getByText("Por coeficiente de copropiedad")).toBeTruthy()
    // La compuerta se ve: esta fuente sí habilita emitir.
    expect(screen.getByText("Sí")).toBeTruthy()

    const tabla = screen.getByRole("table")
    // Cada parámetro con su unidad, y los decimales tal como se declararon.
    expect(within(tabla).getByText("8.5")).toBeTruthy()
    expect(within(tabla).getByText("% del gasto común mensual")).toBeTruthy()
    expect(within(tabla).getByText("12")).toBeTruthy()
    expect(within(tabla).getByText("días desde la emisión")).toBeTruthy()
    expect(within(tabla).getByText("1.2345")).toBeTruthy()
    expect(within(tabla).getByText("% mensual")).toBeTruthy()
    expect(within(tabla).getByText("37.5")).toBeTruthy()
    expect(within(tabla).getByText("3")).toBeTruthy()
    expect(within(tabla).getByText("5")).toBeTruthy()
    expect(within(tabla).getByText("Activo")).toBeTruthy()

    // El párrafo explica por qué importa.
    expect(screen.getByText(/los números del mes salen de acá/i)).toBeTruthy()
    expect(screen.queryByText(/sin versión declarada/i)).toBeNull()
  })

  it("(b) sin versión declarada avisa que la emisión está bloqueada e invita a declarar", async () => {
    montar()

    expect(await screen.findByText(/sin versión declarada/i)).toBeTruthy()
    expect(screen.getByText(/la emisión del gasto común está bloqueada/i)).toBeTruthy()
    // No hay tabla que mostrar, y el alta está disponible.
    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.getByRole("button", { name: "Declarar versión" })).toBeTruthy()
    // El 404 del servidor no se muestra como error de lectura.
    expect(screen.queryByText(/no se pudo leer/i)).toBeNull()
  })

  it("(c) el alta manda los valores tipeados y nunca manda `version`", async () => {
    const user = userEvent.setup()
    montar()
    await screen.findByText(/sin versión declarada/i)

    await completar(user)
    await user.click(screen.getByRole("button", { name: "Declarar versión" }))

    expect(await screen.findByText(/versión declarada: rige desde/i)).toBeTruthy()
    const post = peticiones.find((p) => p.metodo === "POST")
    expect(post?.url).toBe("/api/reglamento")
    expect(post?.cuerpo).toEqual({
      vigenteDesde: "2026-04",
      fuenteInstrumento: "reglamento_copropiedad",
      actaRef: "Reglamento de copropiedad, art. 11",
      formaContribucion: "coeficiente",
      parametros: {
        porcentajeReserva: 12.5,
        diasPagoGc: 10,
        tasaMoraMensualPct: 1.2345,
        topeMoraPct: 2.75,
        cuotasCorte: 3,
        diasPreavisoCorte: 5,
        ipcActivo: true,
        // El recargo de reserva se declara por defecto ENCIMA del presupuesto
        // (lectura del art. 39): el interruptor arranca apagado y viaja igual.
        reservaIncluidaEnPresupuesto: false,
      },
    })
    const cuerpo = post?.cuerpo as Record<string, unknown>
    expect(cuerpo).not.toHaveProperty("version")
    expect(cuerpo).not.toHaveProperty("id")
  })

  it("(d) el error del servidor se muestra y no se pierde nada de lo tipeado", async () => {
    const user = userEvent.setup()
    respuestaPost = { status: 400, cuerpo: { error: "Datos inválidos." } }
    montar()
    await screen.findByText(/sin versión declarada/i)

    await completar(user)
    await user.click(screen.getByRole("button", { name: "Declarar versión" }))

    expect(await screen.findByText("Datos inválidos.")).toBeTruthy()
    expect(screen.getByLabelText(/Fondo de reserva/)).toHaveValue("12.5")
    expect(screen.getByLabelText(/Tasa de mora mensual/)).toHaveValue("1.2345")
    expect(screen.getByLabelText(/Vigente desde/)).toHaveValue("2026-04")
    expect(screen.getByLabelText(/Acta o artículo de referencia/)).toHaveValue(
      "Reglamento de copropiedad, art. 11"
    )
    expect(
      screen.getByRole("switch", { name: "Reajuste por IPC" })
    ).toHaveAttribute("aria-checked", "true")
    // Sin mensaje de éxito falso.
    expect(screen.queryByText(/versión declarada: rige desde/i)).toBeNull()
  })

  it("(e) Enter en un campo del reglamento no guarda la configuración", async () => {
    const user = userEvent.setup()
    versionVigente = VERSION
    await montarPaginaConFormulario()
    await user.click(await screen.findByRole("tab", { name: /Gasto Común/ }))

    const campo = await screen.findByLabelText(/Vigente desde/)
    await user.type(campo, "2026-05")

    // El Enter del campo queda cancelado en el bloque: no llega al submit del
    // formulario de la página (que guardaría configuración, no una versión).
    expect(fireEvent.keyDown(campo, { key: "Enter" })).toBe(false)
    await user.keyboard("{Enter}")

    expect(peticiones.filter((p) => p.metodo === "PUT")).toEqual([])
    expect(peticiones.filter((p) => p.metodo === "POST")).toEqual([])
    expect(screen.queryByText(/versión declarada: rige desde/i)).toBeNull()
  })

  it("(f) el bloque no agrega restricciones nativas: la configuración se guarda igual", async () => {
    const user = userEvent.setup()
    versionVigente = VERSION
    await montarPaginaConFormulario()
    await user.click(await screen.findByRole("tab", { name: /Gasto Común/ }))

    // Alta completa, salvo un valor fuera de rango a propósito (el máximo es 60).
    await completar(user)
    escribir(/Plazo de pago/, "99")

    const campos = [
      /Vigente desde/,
      /Acta o artículo de referencia/,
      /Fondo de reserva/,
      /Plazo de pago/,
      /Tasa de mora mensual/,
      /Tope de mora/,
      /Cuotas impagas para el corte/,
      /Preaviso del corte/,
    ].map((etiqueta) => screen.getByLabelText(etiqueta))

    // Ningún campo del bloque lleva restricciones nativas: el navegador no puede
    // frenar el guardado de la configuración por un valor del reglamento.
    for (const campo of campos) {
      expect(campo).not.toHaveAttribute("min")
      expect(campo).not.toHaveAttribute("max")
      expect(campo).not.toHaveAttribute("step")
      expect(campo).not.toHaveAttribute("pattern")
      expect(campo).not.toHaveAttribute("required")
    }
    expect(screen.getByLabelText(/Plazo de pago/)).toBeValid()
    expect(
      screen.queryByText(/Los días de pago deben estar entre 1 y 60/)
    ).toBeNull()

    // El submit de la página sigue su curso y guarda la configuración.
    await user.click(screen.getByRole("button", { name: "Guardar Cambios" }))
    expect(peticiones.find((p) => p.metodo === "PUT")?.url).toBe("/api/configuracion")

    // Y el mensaje del bloque aparece recién al declarar, sin llamar al servidor.
    await user.click(screen.getByRole("button", { name: "Declarar versión" }))
    expect(
      await screen.findByText("Los días de pago deben estar entre 1 y 60.")
    ).toBeTruthy()
    expect(peticiones.filter((p) => p.metodo === "POST")).toEqual([])
  })

  it("(g) cuotas de corte y preaviso exigen enteros ≥ 1", async () => {
    const user = userEvent.setup()
    montar()
    await screen.findByText(/sin versión declarada/i)
    await completar(user)

    escribir(/Cuotas impagas para el corte/, "0")
    await user.click(screen.getByRole("button", { name: "Declarar versión" }))
    expect(
      await screen.findByText(
        "Las cuotas de corte deben ser un entero mayor o igual a 1."
      )
    ).toBeTruthy()
    expect(peticiones.filter((p) => p.metodo === "POST")).toEqual([])

    escribir(/Cuotas impagas para el corte/, "3")
    escribir(/Preaviso del corte/, "0")
    await user.click(screen.getByRole("button", { name: "Declarar versión" }))
    expect(
      await screen.findByText(
        "Los días de preaviso deben ser un entero mayor o igual a 1."
      )
    ).toBeTruthy()
    expect(peticiones.filter((p) => p.metodo === "POST")).toEqual([])

    // Con enteros válidos la declaración sí llega al servidor.
    escribir(/Preaviso del corte/, "5")
    await user.click(screen.getByRole("button", { name: "Declarar versión" }))
    expect(await screen.findByText(/versión declarada: rige desde/i)).toBeTruthy()
    expect(peticiones.filter((p) => p.metodo === "POST")).toHaveLength(1)
  })

  it("(h) el alta declara dónde va el recargo de reserva y lo manda al servidor", async () => {
    const user = userEvent.setup()
    montar()
    await screen.findByText(/sin versión declarada/i)

    const reserva = screen.getByRole("switch", {
      name: /fondo de reserva ya está en el presupuesto/i,
    })
    // Por defecto encima: es la lectura normativa del recargo (S5).
    expect(reserva).toHaveAttribute("aria-checked", "false")
    expect(
      screen.getByText(/se cobra por encima del presupuesto aprobado/i)
    ).toBeTruthy()

    await completar(user)
    await user.click(reserva)
    expect(reserva).toHaveAttribute("aria-checked", "true")
    expect(
      screen.getByText(/ya está dentro del presupuesto aprobado/i)
    ).toBeTruthy()
    expect(
      screen.queryByText(/se cobra por encima del presupuesto aprobado/i)
    ).toBeNull()

    await user.click(screen.getByRole("button", { name: "Declarar versión" }))
    expect(await screen.findByText(/versión declarada: rige desde/i)).toBeTruthy()
    const post = peticiones.find((p) => p.metodo === "POST")
    const parametros = (post?.cuerpo as { parametros: Record<string, unknown> })
      .parametros
    expect(parametros.reservaIncluidaEnPresupuesto).toBe(true)
    // El resto de la declaración no cambia por el interruptor nuevo.
    expect(parametros.porcentajeReserva).toBe(12.5)
  })

  it("(i) la versión vigente muestra que el recargo ya está dentro del presupuesto", async () => {
    versionVigente = {
      ...VERSION,
      parametros: { ...VERSION.parametros, reservaIncluidaEnPresupuesto: true },
    }
    montar()

    expect(
      await screen.findByText("Dentro del presupuesto aprobado")
    ).toBeTruthy()
    expect(screen.queryByText("Encima del presupuesto aprobado")).toBeNull()
  })

  it("(j) una versión sin el dato declarado se lee encima del presupuesto", async () => {
    // La versión persistida antes del interruptor no trae el campo: el esquema
    // completa con la lectura normativa, y la pantalla no puede inventar otra.
    versionVigente = VERSION
    montar()

    expect(
      await screen.findByText("Encima del presupuesto aprobado")
    ).toBeTruthy()
  })
})

/**
 * PRESERVE: la pestaña «Gasto Común» es código que ya existía. Lo único que
 * cambió es que ahora suma el bloque de la versión; su parametrización previa
 * (modo de cálculo y los dos límites del cobro) tiene que seguir ahí.
 */
describe("configuración — la pestaña Gasto Común conserva su parametrización", () => {
  it("mantiene Modo de Cálculo, Día de Corte y Límite de Meses, y suma la versión", async () => {
    const user = userEvent.setup()
    versionVigente = VERSION
    await montarPaginaConFormulario()

    await user.click(await screen.findByRole("tab", { name: /Gasto Común/ }))

    expect(screen.getByText("Modo de Cálculo *")).toBeTruthy()
    expect(screen.getByText("Día de Corte de Pago (1-31) *")).toBeTruthy()
    expect(screen.getByText("Límite de Meses para Aviso de Corte *")).toBeTruthy()

    expect(await screen.findByText("Versión vigente del reglamento")).toBeTruthy()
    expect(screen.getByText("2026-03")).toBeTruthy()
  })
})
