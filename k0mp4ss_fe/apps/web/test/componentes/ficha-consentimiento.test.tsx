// @vitest-environment jsdom
/**
 * F18 — consentimiento expreso de datos sensibles en la ficha laboral.
 *
 * El servidor (`app/api/personas/route.ts`) ya descarta los campos sensibles
 * cuando `consentimientoDatosSensibles.otorgado` no es `true`. Estos casos
 * cubren la cara visible:
 *
 * - (a) la ficha arranca sin tilde y los campos sensibles deshabilitados;
 * - (b) al tildar los campos se habilitan;
 * - (c) el guardado incluye `consentimientoDatosSensibles.otorgado: true`
 *   con la versión vigente de la política y fecha del día.
 *
 * La página completa se monta con `fetch` stubbeado (mismo patrón que
 * `carga-inicial.test.tsx`: GET responde `{ data, page, pageSize, total }`,
 * POST se registra para afirmar el cuerpo enviado). El bloque en sí vive en
 * `components/personas/consentimiento-datos-sensibles.tsx` y tiene sus propios
 * casos para los tres estados (sin consentimiento, otorgado, revocado).
 */
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import PersonalPage from "@/app/personas/personal/page"
import { SWRConfig } from "swr"
import { ConsentimientoDatosSensibles } from "@/components/personas/consentimiento-datos-sensibles"
import { VERSION_POLITICA_PRIVACIDAD } from "@/lib/politica-privacidad"
import { instalarEntornoRadix } from "./entorno-radix"

const TEXTO_CHECK = /Autorizo el registro de mi ficha médica/i

/** Persona con ficha laboral ya cargada (con FKs a maestros, sin consentimiento aún). */
function personaConFicha(consentimiento?: { otorgado: boolean; fecha: string; version: string }) {
  return {
    id: "p-1",
    rut: "12.345.678-9",
    nombres: "Ana",
    apellidos: "Rojas",
    nombreCompleto: "Ana Rojas",
    email: "ana@ejemplo.cl",
    roles: ["personal"],
    estadoCuenta: "activa",
    datosLaborales: {
      id: "dl-1",
      cargo: "Conserje",
      afp: "AfpUno",
      prevision: "Fonasa",
      fechaIngreso: "2026-01-02",
      afpId: "afp-1",
      saludId: "salud-1",
      bancoId: "banco-1",
      horasExtras: [],
      evaluaciones: [],
      ...(consentimiento ? { consentimientoDatosSensibles: consentimiento } : {}),
    },
  }
}

/** Fila que sirve el GET /api/personas; cada caso la ajusta. */
let personaActual: ReturnType<typeof personaConFicha>

interface Peticion {
  metodo: string
  url: string
  cuerpo?: unknown
}

function responderJson(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { "content-type": "application/json" },
  })
}

const peticiones: Peticion[] = []

const fetchFalso = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input)
  const metodo = init?.method ?? "GET"
  const cuerpo = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
  peticiones.push({ metodo, url, cuerpo })
  if (metodo === "GET" && url.startsWith("/api/personas")) {
    return responderJson({ data: [personaActual], page: 1, pageSize: 100, total: 1 })
  }
  // POST /api/personas (guardado de la ficha) y el resto de las lecturas
  // (maestros, PE, configuración): respuestas mínimas y vacías.
  return responderJson({ data: [], page: 1, pageSize: 100, total: 0 })
})

beforeEach(() => {
  instalarEntornoRadix()
  personaActual = personaConFicha()
  vi.stubGlobal("fetch", fetchFalso)
})

afterEach(() => {
  cleanup()
  peticiones.length = 0
  fetchFalso.mockClear()
  vi.unstubAllGlobals()
})

/** Abre la ficha de la persona y devuelve el checkbox de consentimiento. */
async function abrirFicha(): Promise<HTMLElement> {
  const user = userEvent.setup()
  // Caché SWR aislada por render: cada caso sirve su propia persona sin
  // arrastrar la respuesta del caso anterior.
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <PersonalPage />
    </SWRConfig>
  )
  expect(await screen.findByText("Ana Rojas")).toBeTruthy()
  await user.click(screen.getByRole("button", { name: "Editar" }))
  const dialogo = await screen.findByRole("dialog")
  return within(dialogo).getByRole("checkbox", { name: TEXTO_CHECK })
}

describe("ficha laboral — bloque de consentimiento (componente)", () => {
  it("sin consentimiento: sin tilde y con la línea de ayuda de habilitación", () => {
    const onOtorgado = vi.fn()
    render(<ConsentimientoDatosSensibles otorgado={false} otorgadoInicial={false} onOtorgado={onOtorgado} />)

    const check = screen.getByRole("checkbox", { name: TEXTO_CHECK })
    expect(check.getAttribute("aria-checked")).toBe("false")
    expect(screen.getByText(/se habilitan al autorizar/i)).toBeTruthy()
  })

  it("al tildar: marca otorgado y confirma que los campos quedaron habilitados", async () => {
    const user = userEvent.setup()
    function Envoltura() {
      const [otorgado, setOtorgado] = React.useState(false)
      return <ConsentimientoDatosSensibles otorgado={otorgado} otorgadoInicial={false} onOtorgado={setOtorgado} />
    }
    render(<Envoltura />)

    const check = screen.getByRole("checkbox", { name: TEXTO_CHECK })
    await user.click(check)
    expect(check.getAttribute("aria-checked")).toBe("true")
    expect(screen.getByText(/están habilitados/i)).toBeTruthy()
  })

  it("revocar (ficha que venía otorgada): avisa que al guardar se borrarán los datos", async () => {
    const user = userEvent.setup()
    const onOtorgado = vi.fn()
    function Envoltura() {
      const [otorgado, setOtorgado] = React.useState(true)
      return <ConsentimientoDatosSensibles otorgado={otorgado} otorgadoInicial={true} onOtorgado={v => { onOtorgado(v); setOtorgado(v) }} />
    }
    render(<Envoltura />)

    const check = screen.getByRole("checkbox", { name: TEXTO_CHECK })
    // La ficha cargada con consentimiento arranca tildada.
    expect(check.getAttribute("aria-checked")).toBe("true")

    await user.click(check)
    expect(check.getAttribute("aria-checked")).toBe("false")
    expect(onOtorgado).toHaveBeenCalledWith(false)
    expect(screen.getByText(/al guardar la ficha se borrarán/i)).toBeTruthy()
  })
})

describe("ficha laboral — página completa", () => {
  it("(a) arranca sin tilde: sólo la ficha médica queda deshabilitada", async () => {
    const check = await abrirFicha()

    expect(check.getAttribute("aria-checked")).toBe("false")
    expect(screen.getByText(/se habilitan al autorizar/i)).toBeTruthy()

    // Gated: sólo la ficha médica (decisión del owner 2026-10-27).
    expect(screen.getByLabelText("Medicamentos")).toBeDisabled()
    expect(screen.getByLabelText("Alergias")).toBeDisabled()
    expect(screen.getByLabelText("Condiciones médicas")).toBeDisabled()

    // Previsión, previsional, bancario y familiar operan sin consentimiento: sin
    // ellos no se generan liquidaciones.
    expect(screen.getByRole("combobox", { name: "Fonasa / Isapre" })).not.toHaveAttribute("disabled")
    expect(screen.getByRole("combobox", { name: "AFP" })).not.toHaveAttribute("disabled")
    expect(screen.getByRole("combobox", { name: "Banco (maestro)" })).not.toHaveAttribute("disabled")
    expect(screen.getByLabelText("N° de cargas")).not.toBeDisabled()
    expect(screen.getByLabelText("Número de cuenta")).not.toBeDisabled()
    expect(screen.getByLabelText("Cargo *")).not.toBeDisabled()
    expect(screen.getByRole("button", { name: "Guardar ficha" })).not.toBeDisabled()
  })

  it("(b) al tildar se habilita la ficha médica", async () => {
    const user = userEvent.setup()
    const check = await abrirFicha()

    await user.click(check)
    expect(check.getAttribute("aria-checked")).toBe("true")

    expect(screen.getByLabelText("Medicamentos")).not.toBeDisabled()
    expect(screen.getByLabelText("Alergias")).not.toBeDisabled()
    expect(screen.getByLabelText("Condiciones médicas")).not.toBeDisabled()
  })

  it("(c) el guardado incluye consentimientoDatosSensibles otorgado: true con versión y fecha", async () => {
    const user = userEvent.setup()
    const check = await abrirFicha()

    await user.click(check)
    await user.click(screen.getByRole("button", { name: "Guardar ficha" }))

    await screen.findByText(/Ficha de Ana Rojas guardada/i)
    const guardado = peticiones.find(p => p.metodo === "POST" && p.url.startsWith("/api/personas"))
    expect(guardado).toBeTruthy()
    const dl = (guardado!.cuerpo as { datosLaborales: Record<string, unknown> }).datosLaborales
    expect(dl.consentimientoDatosSensibles).toEqual({
      otorgado: true,
      fecha: new Date().toISOString().slice(0, 10),
      version: VERSION_POLITICA_PRIVACIDAD,
    })
    // Los datos sensibles que traía la ficha siguen en el cuerpo (el servidor
    // los conserva porque hay consentimiento).
    expect(dl.afpId).toBe("afp-1")
    expect(dl.saludId).toBe("salud-1")
    expect(dl.bancoId).toBe("banco-1")
  })

  it("la ficha que venía con consentimiento arranca tildada", async () => {
    personaActual = personaConFicha({ otorgado: true, fecha: "2026-10-26", version: "1.0" })
    const check = await abrirFicha()

    expect(check.getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("combobox", { name: "AFP" })).not.toHaveAttribute("disabled")
  })
})
