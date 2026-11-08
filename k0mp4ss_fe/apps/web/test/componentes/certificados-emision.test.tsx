// @vitest-environment jsdom
/**
 * /comunidad/certificados — el filtro de tipologías por rol (F34).
 *
 * Un permiso que la pantalla no ofrece es un derecho que nadie puede ejercer; un
 * botón que la API rechaza es una mentira de la interfaz. Después de F34 la ruta
 * sólo deja al residente emitir el certificado de residencia (la Ley 21.442
 * reserva al administrador los certificados sobre el estado de deudas: art. 20
 * N° 4 y art. 15), así que la pantalla NO puede seguir ofreciendo las cuatro.
 *
 * Lo que se fija acá, en dos capas:
 *   1. el PORTÓN y el FILTRO del servidor (`page.tsx`), invocando el server
 *      component como función con `auth()` mockeado — mismo patrón que
 *      `directorio-pagina-rol.test.tsx`;
 *   2. lo que ve el usuario: el componente cliente dibuja EXACTAMENTE las
 *      tipologías que recibió, sin recortar ni completar por su cuenta.
 *
 * El filtro no es cosmético: la API vuelve a validar cada emisión
 * (`test/api/certificados-ct-emision-residente.test.ts`). La pantalla no autoriza.
 */
import * as React from "react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// El server component de Next 16 no importa React; en vitest el transform es
// clásico y busca el global. Se expone antes de importar la página.
;(globalThis as unknown as { React: typeof React }).React = React

const PRESUPUESTO_CARGA = 60_000

/** Roles de la sesión que devuelve `auth()` en cada caso. */
const sesion = vi.hoisted(() => ({ roles: [] as string[] }))

vi.mock("@/lib/auth", () => ({
  auth: () =>
    Promise.resolve(
      sesion.roles.length > 0
        ? { user: { id: "cert-emision-usuario", roles: sesion.roles } }
        : null
    ),
}))

vi.mock("@/lib/api/use-certificados-ct", () => ({
  useCertificadosCT: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({
    personas: [],
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-vinculos", () => ({
  useVinculos: () => ({
    vinculos: [],
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-configuracion", () => ({
  useConfiguracion: () => ({
    config: null,
    isLoading: false,
    error: null,
    updateConfig: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-periodos-directiva", () => ({
  usePeriodosDirectiva: () => ({
    periodos: [],
    vigente: undefined,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    cerrar: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-liquidaciones", () => ({
  useLiquidaciones: () => ({
    items: [],
    liquidaciones: [],
    total: 0,
    isLoading: false,
    error: null,
    remove: vi.fn(),
    generar: vi.fn(),
    confirmar: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-cobros-fi", () => ({
  useCobrosFI: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

const { default: CertificadosPage } = await import("@/app/comunidad/certificados/page")
const { default: CertificadosEmision, TIPO_LABEL } = await import(
  "@/app/comunidad/certificados/_componentes/certificados-emision"
)

const TODAS = ["residencia", "estado_cuenta", "liquidacion_sueldo", "al_dia"] as const

beforeAll(() => {
  // Radix (Select) en jsdom necesita los stubs del popper.
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  window.HTMLElement.prototype.scrollTo = vi.fn()
  Object.defineProperty(window.HTMLElement.prototype, "hasPointerCapture", {
    value: () => false,
    configurable: true,
  })
  Object.defineProperty(window.HTMLElement.prototype, "releasePointerCapture", {
    value: () => {},
    configurable: true,
  })
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "ResizeObserver", {
    value: ResizeObserverStub,
    configurable: true,
    writable: true,
  })
})

beforeEach(() => {
  sesion.roles = []
})

afterEach(() => {
  cleanup()
})

/** Digest del redirect de Next, o `null` si la página simplemente renderizó. */
async function renderizarPagina(): Promise<{
  digest: string | null
  tipos: readonly string[] | null
}> {
  try {
    // `page.tsx` es un server component: se invoca como función y se lee la prop
    // que recibe el componente cliente, sin renderizarlo.
    const elemento = (await CertificadosPage()) as React.ReactElement<{
      tiposEmisibles: readonly string[]
    }>
    return { digest: null, tipos: elemento.props.tiposEmisibles }
  } catch (e) {
    return { digest: (e as Error & { digest?: string }).digest ?? "", tipos: null }
  }
}

/** Abre el selector de tipología y devuelve el texto de sus opciones. */
async function opcionesDelSelect(
  user: ReturnType<typeof userEvent.setup>
): Promise<string[]> {
  const combos = screen.getAllByRole("combobox")
  await user.click(combos[0]!)
  const listbox = await screen.findByRole("listbox", {}, { timeout: 5_000 })
  return within(listbox)
    .getAllByRole("option")
    .map((o) => o.textContent ?? "")
}

describe("la pantalla de certificados — portón y filtro del servidor", () => {
  it("sin sesión manda a /ingresar", async () => {
    const { digest } = await renderizarPagina()
    expect(digest).toContain("NEXT_REDIRECT")
    expect(digest).toContain("/ingresar")
  })

  it("un rol sin `ct` ver no entra: manda a /dashboard", async () => {
    // mantención no tiene `ct` en la matriz: la pantalla no es suya.
    sesion.roles = ["mantencion"]
    const { digest } = await renderizarPagina()
    expect(digest).toContain("NEXT_REDIRECT")
    expect(digest).toContain("/dashboard")
  })

  it("al residente le llega SÓLO el certificado de residencia", async () => {
    sesion.roles = ["residente"]
    const { digest, tipos } = await renderizarPagina()
    expect(digest).toBeNull()
    expect(tipos).toEqual(["residencia"])
  })

  it("a la administración le llegan las cuatro tipologías", async () => {
    sesion.roles = ["administrador"]
    const { tipos } = await renderizarPagina()
    expect(tipos).toEqual([...TODAS])
  })

  it("al comité, que sólo lee, no le llega ninguna tipología", async () => {
    sesion.roles = ["comite"]
    const { digest, tipos } = await renderizarPagina()
    expect(digest).toBeNull()
    expect(tipos).toEqual([])
  })
})

describe("la pantalla de certificados — lo que ve cada rol", () => {
  it("el residente no ve la tipología reservada: sólo residencia en el selector", async () => {
    const user = userEvent.setup()
    render(<CertificadosEmision tiposEmisibles={["residencia"]} />)

    const opciones = await opcionesDelSelect(user)
    expect(opciones).toHaveLength(1)
    expect(opciones[0]).toMatch(/Certificado de Residencia/i)
    for (const reservada of ["Estado de Cuenta", "Liquidación de Sueldo", "Al Día"]) {
      expect(opciones.join(" | ")).not.toContain(reservada)
    }
  }, PRESUPUESTO_CARGA)

  it("la administración sí ve las cuatro", async () => {
    const user = userEvent.setup()
    render(<CertificadosEmision tiposEmisibles={[...TODAS]} />)

    const opciones = await opcionesDelSelect(user)
    expect(opciones).toEqual(TODAS.map((tipo) => TIPO_LABEL[tipo]))
  }, PRESUPUESTO_CARGA)

  it("sin tipologías emisibles explica el motivo en vez de mostrar un formulario vacío", async () => {
    render(<CertificadosEmision tiposEmisibles={[]} />)

    expect(
      screen.getByText(/Emisión reservada a la administración/i)
    ).toBeTruthy()
    expect(screen.queryAllByRole("combobox")).toHaveLength(0)
    expect(
      screen.queryByRole("button", { name: /Generar certificado PDF firmado/i })
    ).toBeNull()
  })
})
