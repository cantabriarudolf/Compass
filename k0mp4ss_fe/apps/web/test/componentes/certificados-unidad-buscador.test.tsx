// @vitest-environment jsdom
/**
 * T13 (S10) — la unidad de los certificados de `estado_cuenta`/`al_dia` se BUSCA
 * en el servidor, no se ofrece en la lista truncada.
 *
 * `certificados-emision.tsx` ofrecía la unidad en un `Select` montado sobre
 * `useUnidades()` (`/api/unidades?pageSize=100`): una unidad fuera de las
 * primeras cien filas del padrón no podía certificarse — el mismo defecto que
 * F36 arregló para la persona y que quedó en la unidad.
 *
 * Lo que se fija acá, con el padrón de unidades del cliente VACÍO a propósito
 * (la forma más punzante del recorte: en una comunidad simulada de 166 unidades
 * la primera página no puede traer la unidad buscada):
 *   · la consulta va al endpoint del padrón con `q` — el servidor resuelve la
 *     búsqueda sobre TODA la colección (`{ data, page, pageSize, total }`);
 *   · la unidad buscada se puede ELEGIR y el payload del certificado la lleva
 *     (tipo `estado_cuenta`, `unidadId` de la fila buscada);
 *   · el resumen y el detalle del papel usan el rótulo de la FILA BUSCADA
 *     («Depto 966»), no el id crudo que devolvería el padrón vacío del cliente;
 *   · quitar la selección vuelve a pedir unidad con el error verbatim.
 */
import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"

const PRESUPUESTO_CARGA = 60_000

/**
 * Estado compartido con las factories de `vi.mock`. El padrón de unidades del
 * cliente va VACÍO a propósito: la unidad del certificado NO puede salir de esa
 * colección truncada. El `total: 166` es el que reporta el servidor; la pantalla
 * simula «100 de 166 truncadas» en su forma límite (0 en el cliente).
 */
const fuente = vi.hoisted(() => ({
  crear: vi.fn<(registro: unknown) => Promise<{ ok: false; error: string }>>(
    async () => ({ ok: false as const, error: "Sin POST en el test (paridad)" })
  ),
}))

vi.mock("@/lib/api/use-certificados-ct", () => ({
  useCertificadosCT: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    create: fuente.crear,
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({
    personas: [],
    total: 0,
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
    total: 166,
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

const { default: CertificadosEmision } = await import(
  "@/app/comunidad/certificados/_componentes/certificados-emision"
)

/**
 * Fila que responde la búsqueda del servidor: la unidad 966 de 166 NO está en la
 * primera página del padrón del cliente (vacío acá) y sin el buscador no se
 * podría certificar.
 */
const FILA_UNIDAD = {
  id: "t13-uni-966",
  etiqueta: "Depto",
  numero: "966",
  rolSii: "1-966",
}

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  fuente.crear.mockClear()
})

/** Stub de fetch que responde la búsqueda de unidades y graba cada URL pedida. */
function stubBuscarUnidades(): { llamadas: string[] } {
  const llamadas: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      llamadas.push(url)
      return Promise.resolve(
        new Response(JSON.stringify({ data: [FILA_UNIDAD], page: 1, pageSize: 50, total: 166 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    })
  )
  return { llamadas }
}

/** Busca la unidad en el campo nuevo y la elige. */
async function elegirUnidadBuscada(
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  const input = screen.getByPlaceholderText("Buscar por etiqueta, número o rol SII…")
  await user.type(input, "966")
  await screen.findByText("Depto 966")
  await user.click(screen.getByText("Depto 966"))
}

describe("T13 — la unidad de estado de cuenta se busca en el servidor", () => {
  it("consulta /api/unidades con q y emite con la fila buscada, sin padrón del cliente", async () => {
    const { llamadas } = stubBuscarUnidades()
    const user = userEvent.setup()
    render(<CertificadosEmision tiposEmisibles={["estado_cuenta", "al_dia"]} />)

    await elegirUnidadBuscada(user)

    // La consulta fue al endpoint del padrón, con `q` y la página — el servidor
    // resuelve la búsqueda sobre toda la colección, no sobre la página 1.
    expect(llamadas.some((u) => u.startsWith("/api/unidades?q=966"))).toBe(true)

    // La unidad elegida queda a la vista.
    expect(screen.getByText("Depto 966")).toBeTruthy()

    await user.type(screen.getByPlaceholderText("Nombre de quien solicita"), "QA T13")
    await user.click(screen.getByRole("button", { name: /Generar certificado PDF firmado/i }))

    expect(fuente.crear).toHaveBeenCalledTimes(1)
    const registro = fuente.crear.mock.calls[0]?.[0] as {
      tipo: string
      unidadId?: string
      solicitanteNombre: string
      resumen: string
      detalle: { clave: string; valor: string }[]
    }
    expect(registro.tipo).toBe("estado_cuenta")
    // La unidad buscada (fuera de las primeras 100) viaja en el payload.
    expect(registro.unidadId).toBe("t13-uni-966")
    expect(registro.solicitanteNombre).toBe("QA T13")
    // El rótulo del papel sale de la FILA BUSCADA, no del padrón del cliente
    // (vacío acá: sin la fila buscada, `refUnidadUI` habría escrito el id crudo).
    expect(registro.resumen).toBe(
      "Estado de cuenta oficial de Depto 966: detalle de gastos comunes pagados, cuotas extraordinarias y fondos pendientes según el libro de Finanzas."
    )
    expect(registro.detalle).toEqual([
      { clave: "Unidad", valor: "Depto 966" },
      { clave: "Propietario", valor: "—" },
      { clave: "Cobros registrados", valor: "0" },
      { clave: "Total cargado", valor: "$0" },
      { clave: "Saldo pendiente", valor: "$0" },
    ])
  }, PRESUPUESTO_CARGA)

  it("quitar la unidad deja el formulario sin destino y el error verbatim pide la unidad", async () => {
    stubBuscarUnidades()
    const user = userEvent.setup()
    render(<CertificadosEmision tiposEmisibles={["estado_cuenta", "al_dia"]} />)

    await elegirUnidadBuscada(user)
    await user.click(screen.getByRole("button", { name: "Quitar selección" }))

    await user.type(screen.getByPlaceholderText("Nombre de quien solicita"), "QA T13")
    await user.click(screen.getByRole("button", { name: /Generar certificado PDF firmado/i }))

    // La frase exacta de siempre: el reemplazo del selector no cambió los mensajes.
    expect(await screen.findByText("El certificado de estado de cuenta exige una unidad.")).toBeTruthy()
    expect(fuente.crear).not.toHaveBeenCalled()
  }, PRESUPUESTO_CARGA)
})
