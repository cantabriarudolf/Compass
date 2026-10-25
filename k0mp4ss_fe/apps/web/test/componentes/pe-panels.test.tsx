// @vitest-environment jsdom
/**
 * Casos de los tres paneles PE contra el servidor REST falso (`api-pe-falsa.ts`).
 *
 * Los paneles ya no usan el store zustand: leen y escriben con los hooks de `lib/api/`. Cada caso
 * refleja la fuente de verdad (la base): el cuerpo de la petición que el panel manda, la fila que
 * se renderiza y el mensaje que recibe el usuario.
 */
import React from "react"
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { instalarApiPE } from "./api-pe-falsa"
import { EncomiendasPanel } from "@/components/pe/encomiendas-panel"
import { VisitasPanel } from "@/components/pe/visitas-panel"
import { ContratistasPanel } from "@/components/pe/contratistas-panel"

vi.setConfig({ testTimeout: 30_000 })

/**
 * Presupuesto explícito por caso para los paneles PE (Radix Select/Dialog en jsdom).
 *
 * Los casos que abren comboboxes tardan ~5 s en aislamiento, pero la misma máquina bajo carga
 * (suite completa en paralelo, CI compartido) los estira por encima de los 30 s del default:
 * medido 26.8 s con 2 núcleos cargados y "Test timed out in 30000ms" con carga alta (E3 de la
 * serie deuda-3). Es presupuesto insuficiente, no comportamiento: el presupuesto global de
 * `vi.setConfig` no alcanza, así que se fija uno por caso con el objeto de opciones.
 *
 * NO usar `test.use({ timeout })`: no es un fixture válido en Vitest y se ignora en silencio
 * (lección de la corrección de `e2e/crud/proyectos.spec.ts`).
 */
const PRESUPUESTO_CARGA = 120_000

const HOY = new Date().toISOString().slice(0, 10)

/** URL del QR del anverso de la cédula de Juan Pérez González (p-1, 15.123.456-9). */
const URL_CEDULA_P1 =
  "https://www.registrocivil.cl/servicios-en-linea/valida-documento?RUN=15.123.456-9&type=CEDULA"
/** RUN válido que NO está en el padrón del servidor falso: fuerza la visita externa. */
const URL_CEDULA_EXTERNA =
  "https://www.registrocivil.cl/servicios-en-linea/valida-documento?RUN=19.876.543-0&type=CEDULA"

/** Filtra el registro del servidor falso por método y prefijo de ruta. */
function buscarPeticiones(
  api: ReturnType<typeof instalarApiPE>,
  metodo: string,
  prefijoRuta: string
) {
  return api.peticiones.filter((p) => p.metodo === metodo && p.url.startsWith(prefijoRuta))
}

/** Ningún onSuccess/onError recibió mensaje de error legible. */
function sinErrores(onError: ReturnType<typeof vi.fn>): void {
  expect(onError.mock.calls.filter((c) => c[0]).map((c) => String(c[0]))).toEqual([])
}

/**
 * Cámara falsa para jsdom: `getUserMedia` devuelve un stream con `stop()` espiable.
 * La limpieza (afterEach) borra `mediaDevices` para no contaminar otros paneles.
 */
function instalarCamara(): void {
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn(async () => stream) },
    configurable: true,
  })
}

/** `BarcodeDetector` falso: devuelve el valor indicado y luego vacío. */
function instalarDetector(valor: string): void {
  let entregado = false
  class DetectorFalso {
    detect = async () => {
      if (entregado) return []
      entregado = true
      return [{ rawValue: valor }]
    }
  }
  Object.defineProperty(globalThis, "BarcodeDetector", {
    value: DetectorFalso,
    configurable: true,
    writable: true,
  })
}

beforeAll(() => {
  // Radix (Select/Switch/Dialog) en jsdom: el bloque de stubs vive en `entorno-radix.ts`.
  instalarEntornoRadix()
  // jsdom no implementa la reproducción de media: el preview del escáner la usa.
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true })
})

/** Abre el N-ésimo combobox del scope y elige la primera opción real (salta "Sin ..."). */
async function elegirOpcion(user: ReturnType<typeof userEvent.setup>, comboIndex: number) {
  const combos = screen.getAllByRole("combobox")
  await user.click(combos[comboIndex]!)
  // Opciones SOLO del listbox abierto (portales cerrados pueden quedar un tick en el DOM)
  const listbox = await screen.findByRole("listbox", {}, { timeout: 5_000 })
  const opciones = within(listbox).getAllByRole("option")
  const real = opciones.find((o) => !/^Sin /.test(o.textContent ?? "")) ?? opciones[0]!
  await user.click(real)
}

/** Elige la unidad «Depto 101 · 123-A11» del seed en el selector buscable (F6). */
async function elegirUnidadDestino(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Unidad destino"), "101")
  const lista = await screen.findByRole(
    "listbox",
    { name: /Resultados de Unidad destino/ },
    { timeout: 10_000 }
  )
  await user.click(await within(lista).findByRole("option", { name: /Depto 101 · 123-A11/ }))
}

describe("EncomiendasPanel (componente, RTL)", () => {
  it("renderiza el form y la tabla vacía del día", { timeout: PRESUPUESTO_CARGA }, async () => {
    instalarApiPE()
    render(<EncomiendasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)
    // SWR arranca cargando: se espera el estado final, no el «Cargando…» transitorio.
    expect(await screen.findByText(/Encomiendas del día/)).toBeTruthy()
    expect(await screen.findByText("Sin encomiendas para esta fecha.")).toBeTruthy()
    expect(screen.getByLabelText("Descripción del paquete")).toBeTruthy()
  })

  it("recibe una encomienda TEST: fila + POST a la API", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const api = instalarApiPE()

    render(<EncomiendasPanel diaReporte={HOY} onError={onError} onSuccess={onSuccess} />)

    await elegirOpcion(user, 0) // Courier
    await elegirOpcion(user, 1) // Destinatario
    await elegirOpcion(user, 2) // Unidad
    await user.type(screen.getByLabelText("Descripción del paquete"), "TEST-RTL paquete")
    await user.click(screen.getByRole("button", { name: /Registrar recepción/ }))

    await waitFor(() => expect(buscarPeticiones(api, "POST", "/api/pe/encomiendas")).toHaveLength(1))
    const post = buscarPeticiones(api, "POST", "/api/pe/encomiendas")[0]!
    expect(post.url).toBe("/api/pe/encomiendas")
    const cuerpo = post.cuerpo as Record<string, unknown>
    expect(cuerpo.estado).toBe("recibida")
    expect(cuerpo.fechaRecepcion).toBe(HOY)
    expect((cuerpo.id as string).startsWith("pe-enc-")).toBe(true)
    expect(String(cuerpo.courierId)).toBeTruthy()
    expect(cuerpo.descripcionPaquete).toBe("TEST-RTL paquete")

    sinErrores(onError)
    expect(await screen.findByText("TEST-RTL paquete")).toBeTruthy()
    expect(screen.getByText("Recibida")).toBeTruthy()
    expect(onSuccess).toHaveBeenCalled()
  })

  it("retiro de encomienda: dialog exige retiradoPor y marca Retirada", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const api = instalarApiPE()
    render(<EncomiendasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={onSuccess} />)

    await elegirOpcion(user, 0)
    await elegirOpcion(user, 1)
    await elegirOpcion(user, 2)
    await user.type(screen.getByLabelText("Descripción del paquete"), "TEST-RTL retiro")
    await user.click(screen.getByRole("button", { name: /Registrar recepción/ }))

    await screen.findByRole("button", { name: "Registrar retiro" })
    await user.click(screen.getByRole("button", { name: "Registrar retiro" }))
    const dialogo = screen.getByRole("dialog")
    const retPor = within(dialogo).getByLabelText("Retirado por *")
    await user.clear(retPor)
    await user.type(retPor, "María TEST")
    await user.click(within(dialogo).getByRole("button", { name: "Confirmar retiro" }))

    await waitFor(() => expect(buscarPeticiones(api, "PUT", "/api/pe/encomiendas/")).toHaveLength(1))
    const put = buscarPeticiones(api, "PUT", "/api/pe/encomiendas/")[0]!
    expect(/^\/api\/pe\/encomiendas\/pe-enc-/.test(put.url)).toBe(true)
    const cuerpo = put.cuerpo as Record<string, unknown>
    expect(cuerpo.estado).toBe("retirada")
    expect((cuerpo.retiro as Record<string, unknown>).retiradoPor).toBe("María TEST")
    expect(onSuccess).toHaveBeenCalledWith("Retiro registrado.")
    expect(await screen.findByText(/Retirada por María TEST/)).toBeTruthy()
  })

  it("el retiro sin nombre no viaja al servidor", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const onError = vi.fn()
    const api = instalarApiPE()
    render(<EncomiendasPanel diaReporte={HOY} onError={onError} onSuccess={vi.fn()} />)

    await elegirOpcion(user, 0)
    await elegirOpcion(user, 1)
    await elegirOpcion(user, 2)
    await user.type(screen.getByLabelText("Descripción del paquete"), "TEST-RTL sin nombre")
    await user.click(screen.getByRole("button", { name: /Registrar recepción/ }))
    await screen.findByRole("button", { name: "Registrar retiro" })

    await user.click(screen.getByRole("button", { name: "Registrar retiro" }))
    const dialogo = screen.getByRole("dialog")
    const retPor = within(dialogo).getByLabelText("Retirado por *")
    await user.clear(retPor)
    await user.click(within(dialogo).getByRole("button", { name: "Confirmar retiro" }))

    expect(onError).toHaveBeenCalledWith("Debe identificar quién retira la encomienda.")
    expect(buscarPeticiones(api, "PUT", "/api/pe/encomiendas/")).toHaveLength(0)
  })
})

describe("VisitasPanel (componente, RTL)", () => {
  it("registrar visita sin aviso: fila + POST", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const api = instalarApiPE()

    render(<VisitasPanel diaReporte={HOY} onError={onError} onSuccess={onSuccess} />)

    await user.type(screen.getByLabelText("Nombre *"), "Visitante TEST-RTL")
    await user.type(screen.getByLabelText("DNI *"), "16.444.555-0")
    await elegirOpcion(user, 0) // Jornada
    await elegirUnidadDestino(user)
    await user.click(screen.getByRole("button", { name: /Registrar visita/ }))

    await waitFor(() =>
      expect(buscarPeticiones(api, "POST", "/api/pe/bitacora-visitas")).toHaveLength(1)
    )
    const post = buscarPeticiones(api, "POST", "/api/pe/bitacora-visitas")[0]!
    expect(post.url).toBe("/api/pe/bitacora-visitas")
    const cuerpo = post.cuerpo as Record<string, unknown>
    expect(cuerpo.estado).toBe("ingresada")
    expect(/^\d{2}:\d{2}$/.test(String(cuerpo.horaIngreso))).toBe(true)
    expect(cuerpo.fecha).toBe(HOY)

    sinErrores(onError)
    expect(await screen.findByText("Visitante TEST-RTL")).toBeTruthy()
    expect(onSuccess).toHaveBeenCalled()
  })

  it("pre-agendada: estado Agendada hasta confirmar ingreso", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const api = instalarApiPE()

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.type(screen.getByLabelText("Nombre *"), "Visita Agendada TEST")
    await user.type(screen.getByLabelText("DNI *"), "16.444.555-0")
    await elegirOpcion(user, 0) // Jornada
    await elegirUnidadDestino(user)
    await user.click(screen.getByRole("switch"))
    await user.click(screen.getByRole("button", { name: /Registrar visita/ }))

    await waitFor(() =>
      expect(buscarPeticiones(api, "POST", "/api/pe/bitacora-visitas")).toHaveLength(1)
    )
    const cuerpoPost = buscarPeticiones(api, "POST", "/api/pe/bitacora-visitas")[0]!
      .cuerpo as Record<string, unknown>
    expect(cuerpoPost.estado).toBe("agendada")
    expect("horaIngreso" in cuerpoPost).toBe(false)
    expect(await screen.findByText("Agendada")).toBeTruthy()

    await user.click(await screen.findByRole("button", { name: "Marcar Ingresada" }))
    await waitFor(() =>
      expect(buscarPeticiones(api, "PUT", "/api/pe/bitacora-visitas/")).toHaveLength(1)
    )
    const put = buscarPeticiones(api, "PUT", "/api/pe/bitacora-visitas/")[0]!
    expect(/^\/api\/pe\/bitacora-visitas\/pe-vis-/.test(put.url)).toBe(true)
    const cuerpoPut = put.cuerpo as Record<string, unknown>
    expect(cuerpoPut.estado).toBe("ingresada")
    expect(/^\d{2}:\d{2}$/.test(String(cuerpoPut.horaIngreso))).toBe(true)
    expect(await screen.findByText(/Ingresada \d{2}:\d{2}/)).toBeTruthy()
  })

  it("Escanear QR de la cédula identifica al residente y NO registra la visita", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const api = instalarApiPE()
    instalarCamara()
    instalarDetector(URL_CEDULA_P1)

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /Escanear QR de la cédula/ }))
    expect(screen.getByRole("region", { name: "Escáner de QR de la cédula" })).toBeTruthy()

    const resultado = await screen.findByRole(
      "region",
      { name: "Resultado del escaneo" },
      { timeout: 10_000 }
    )
    // Nombre, RUT enmascarado, unidad y vínculo antes de confirmar.
    expect(within(resultado).getByText("Juan Pérez González")).toBeTruthy()
    expect(within(resultado).getByText("15.***.***-9")).toBeTruthy()
    expect(within(resultado).getByText("Depto 101 · 123-A11")).toBeTruthy()
    expect(within(resultado).getByText("Propietario")).toBeTruthy()
    // El escaneo por sí solo registra NADA en la bitácora de la base.
    expect(buscarPeticiones(api, "POST", "/api/pe/bitacora-visitas")).toHaveLength(0)

    await user.click(within(resultado).getByRole("button", { name: /Confirmar identidad/ }))
    // La confirmación solo completa el formulario: tampoco guarda la visita.
    expect(buscarPeticiones(api, "POST", "/api/pe/bitacora-visitas")).toHaveLength(0)
    expect((screen.getByLabelText("Nombre *") as HTMLInputElement).value).toBe("Juan Pérez González")
    expect((screen.getByLabelText("DNI *") as HTMLInputElement).value).toBe("15123456-9")
    // La unidad del vínculo queda preseleccionada y visible en el control buscable.
    expect(screen.getAllByText("Depto 101 · 123-A11").length).toBeGreaterThanOrEqual(1)

    await user.click(screen.getByRole("button", { name: /Registrar visita/ }))
    await waitFor(() =>
      expect(buscarPeticiones(api, "POST", "/api/pe/bitacora-visitas")).toHaveLength(1)
    )
    const cuerpo = buscarPeticiones(api, "POST", "/api/pe/bitacora-visitas")[0]!
      .cuerpo as Record<string, unknown>
    expect(cuerpo.destinoPersonaId).toBe("p-1")
  })

  it("sin coincidencia en el padrón ofrece la visita externa con el RUT leído", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const api = instalarApiPE()
    instalarCamara()
    instalarDetector(URL_CEDULA_EXTERNA)

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /Escanear QR de la cédula/ }))
    const resultado = await screen.findByRole(
      "region",
      { name: "Resultado del escaneo" },
      { timeout: 10_000 }
    )
    expect(within(resultado).getByText(/Sin coincidencia en el padrón/)).toBeTruthy()
    expect(within(resultado).getByText(/19\.\*\*\*\.\*\*\*-0/)).toBeTruthy()

    await user.click(within(resultado).getByRole("button", { name: /Usar el RUT leído/ }))
    expect((screen.getByLabelText("DNI *") as HTMLInputElement).value).toBe("19876543-0")
    // La visita externa tampoco se registra sola: falta el nombre y el botón.
    expect(buscarPeticiones(api, "POST", "/api/pe/bitacora-visitas")).toHaveLength(0)
  })

  it("si el padrón del servidor no responde, busca en el padrón local sin bloquear", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    // El listado del padrón responde bien, pero la consulta puntual `?rut=` falla:
    // el panel debe resolver con el padrón ya cargado y avisarlo en pantalla.
    instalarApiPE({ fallarRutPersona: true })
    instalarCamara()
    instalarDetector(URL_CEDULA_P1)

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /Escanear QR de la cédula/ }))
    const resultado = await screen.findByRole(
      "region",
      { name: "Resultado del escaneo" },
      { timeout: 10_000 }
    )
    expect(within(resultado).getByText("Juan Pérez González")).toBeTruthy()
    expect(screen.getByText(/se buscó en el padrón local/)).toBeTruthy()
  })

  it("búsqueda manual por RUT: completa el formulario solo al confirmar", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const api = instalarApiPE()

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    // Fallback obligatorio de la cédula vieja / sin cámara: se escribe el RUT.
    await user.type(screen.getByLabelText("DNI *"), "15.123.456-9")
    await user.click(screen.getByRole("button", { name: /Buscar en el padrón/ }))

    const resultado = await screen.findByRole(
      "region",
      { name: "Resultado del escaneo" },
      { timeout: 10_000 }
    )
    // El RUN viaja a la proyección `?rut=` (scoping de comunidad en la ruta), no al store.
    await waitFor(() =>
      expect(api.peticiones.some((p) => p.url.includes("/api/pe/personas?rut="))).toBe(true)
    )
    expect(within(resultado).getByText("Juan Pérez González")).toBeTruthy()
    expect(buscarPeticiones(api, "POST", "/api/pe/bitacora-visitas")).toHaveLength(0)

    await user.click(within(resultado).getByRole("button", { name: /Confirmar identidad/ }))
    expect((screen.getByLabelText("Nombre *") as HTMLInputElement).value).toBe("Juan Pérez González")
    expect(buscarPeticiones(api, "POST", "/api/pe/bitacora-visitas")).toHaveLength(0)
  })
})

describe("ContratistasPanel (componente, RTL)", () => {
  it("valida motivo corto con onError y sin mutar la base", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const onError = vi.fn()
    const api = instalarApiPE()

    render(<ContratistasPanel diaReporte={HOY} onError={onError} onSuccess={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /Agendar ingreso/ }))
    expect(onError).toHaveBeenCalledWith("Seleccione la empresa del maestro de contratistas.")
    expect(buscarPeticiones(api, "POST", "/api/pe/ingresos-contratistas")).toHaveLength(0)
  })

  it("el motivo corto con empresa elegida tampoco viaja al servidor", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const onError = vi.fn()
    const api = instalarApiPE()

    render(<ContratistasPanel diaReporte={HOY} onError={onError} onSuccess={vi.fn()} />)

    await elegirOpcion(user, 0) // Empresa
    await user.type(screen.getByLabelText("Motivo específico del ingreso *"), "Rep")
    await user.click(screen.getByRole("button", { name: /Agendar ingreso/ }))

    expect(onError).toHaveBeenCalledWith("Se exige detallar el motivo específico del ingreso.")
    expect(buscarPeticiones(api, "POST", "/api/pe/ingresos-contratistas")).toHaveLength(0)
  })

  it("agendar ingreso TEST: fila + POST", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const onError = vi.fn()
    const api = instalarApiPE()

    render(<ContratistasPanel diaReporte={HOY} onError={onError} onSuccess={vi.fn()} />)

    await elegirOpcion(user, 0) // Empresa (maestro contratistas)
    await user.type(screen.getByLabelText("Motivo específico del ingreso *"), "TEST-RTL reparación")
    await elegirOpcion(user, 1) // Jornada
    await user.click(screen.getByRole("button", { name: /Agendar ingreso/ }))

    await waitFor(() =>
      expect(buscarPeticiones(api, "POST", "/api/pe/ingresos-contratistas")).toHaveLength(1)
    )
    const post = buscarPeticiones(api, "POST", "/api/pe/ingresos-contratistas")[0]!
    const cuerpo = post.cuerpo as Record<string, unknown>
    expect(cuerpo.estado).toBe("agendado")
    expect(cuerpo.motivo).toBe("TEST-RTL reparación")
    expect(cuerpo.fecha).toBe(HOY)
    expect(cuerpo.jornadaId).toBe("j-manana")
    expect(cuerpo.agendadoPor).toBe("administracion")

    sinErrores(onError)
    expect(await screen.findByText(/TEST-RTL reparación/)).toBeTruthy()
  })

  it("Confirmar sella el ingreso", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    const api = instalarApiPE()

    render(<ContratistasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    await elegirOpcion(user, 0) // Empresa
    await user.type(screen.getByLabelText("Motivo específico del ingreso *"), "TEST-RTL revisión")
    await user.click(screen.getByRole("button", { name: /Agendar ingreso/ }))

    await user.click(await screen.findByRole("button", { name: "Confirmar" }))
    await waitFor(() =>
      expect(buscarPeticiones(api, "PUT", "/api/pe/ingresos-contratistas/")).toHaveLength(1)
    )
    const put = buscarPeticiones(api, "PUT", "/api/pe/ingresos-contratistas/")[0]!
    expect(/^\/api\/pe\/ingresos-contratistas\/pe-cont-/.test(put.url)).toBe(true)
    const cuerpo = put.cuerpo as Record<string, unknown>
    expect(cuerpo.estado).toBe("ingresado")
    expect(/^\d{2}:\d{2}$/.test(String(cuerpo.horaIngreso))).toBe(true)
    expect(await screen.findByText(/Ingresado \d{2}:\d{2}/)).toBeTruthy()
  })

  it("el estacionamiento no es destino", { timeout: PRESUPUESTO_CARGA }, async () => {
    const user = userEvent.setup()
    // El padrón del servidor SÍ trae la plaza; el filtro `esUnidadDestino` del panel
    // es el que no la ofrece en «Unidad destino».
    instalarApiPE()
    render(<ContratistasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    const combos = screen.getAllByRole("combobox")
    await user.click(combos[3]!) // Unidad destino
    const listbox = await screen.findByRole("listbox", {}, { timeout: 5_000 })

    expect(within(listbox).queryByText(/Estacionamiento/)).toBeNull()
    expect(within(listbox).getByText(/Depto 101/)).toBeTruthy()
  })
})
