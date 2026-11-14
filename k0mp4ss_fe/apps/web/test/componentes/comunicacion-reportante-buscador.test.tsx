// @vitest-environment jsdom
/**
 * S10 — el reportante del buzón ciudadano se busca en el servidor.
 *
 * La consola de comunicación ofrecía al reportante en un `Select` que montaba
 * `usePersonas()` (`/api/personas?pageSize=100`): una persona fuera de las primeras cien
 * filas del padrón no se podía elegir. Peor: el payload hacía
 * `reportanteId || personas[0]?.id`, así que elegir «La Administración» registraba el
 * reclamo **a nombre de la primera fila del padrón**, un vecino que nadie eligió.
 *
 * Lo que se fija acá:
 *   · el campo pregunta al SERVIDOR (`GET /api/comunicacion/buscar-personas?q=…`) y el
 *     reclamo se arma con la fila buscada, aunque el padrón del cliente esté VACÍO;
 *   · sin selección, el reclamo queda a nombre de la Administración y NO hereda la
 *     primera fila del padrón (con el código anterior este caso guardaba «Primera Fila»);
 *   · el recorte del padrón se DECLARA en pantalla cuando el total del servidor supera
 *     las filas montadas (los destinatarios del envío masivo se resuelven en el cliente,
 *     así que callarlo sería peor que la lista ciega original).
 */
import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"

const PRESUPUESTO_CARGA = 60_000

/**
 * Estado compartido con las factories de `vi.mock`. `total` es el que declara el
 * servidor y `personas` lo que se montó: el test de recorte mueve los dos.
 */
const padron = vi.hoisted(() => ({
  total: 0,
  filas: [] as {
    id: string
    nombres: string
    apellidos: string
    estadoCuenta: string
    roles: string[]
  }[],
  crearBuzon: vi.fn<(registro: unknown) => Promise<{ ok: false; error: string }>>(
    async () => ({ ok: true as unknown as false, error: "" })
  ),
}))

function coleccion<T>(items: T[], total = items.length) {
  return {
    items,
    total,
    isLoading: false,
    error: null,
    hasMore: items.length < total,
    cargarMas: vi.fn(),
    cargandoMas: false,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }
}

vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({
    personas: padron.filas,
    total: padron.total,
    isLoading: false,
    error: null,
    hasMore: padron.filas.length < padron.total,
    cargarMas: vi.fn(),
    cargandoMas: false,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () => coleccion([]),
}))

vi.mock("@/lib/api/use-vinculos", () => ({
  useVinculos: () => ({ vinculos: [], isLoading: false, error: null, create: vi.fn(), update: vi.fn(), remove: vi.fn() }),
}))

vi.mock("@/lib/api/use-macro-sectores", () => ({
  useMacroSectores: () => coleccion([]),
}))

vi.mock("@/lib/api/use-micro-sectores", () => ({
  useMicroSectores: () => coleccion([]),
}))

vi.mock("@/lib/api/use-co", () => ({
  usePlantillasCO: () => coleccion([]),
  useEnviosCO: () => coleccion([]),
  useMensajesBuzonCO: () => ({ ...coleccion([]), create: padron.crearBuzon }),
}))

const { ConsolaComunicacionCO } = await import(
  "@/app/comunidad/comunicacion/consola-comunicacion"
)

/** Fila que responde `GET /api/comunicacion/buscar-personas?q=ana`. */
const FILA_BUSCADA = {
  id: "s10-per-1",
  nombres: "Ana",
  apellidos: "Vecina",
  rut: "7.123.456-8",
}

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  padron.crearBuzon.mockClear()
  padron.total = 0
  padron.filas = []
})

/** Stub de fetch que responde la búsqueda del servidor y graba cada URL pedida. */
function stubBuscarReportante(): { llamadas: string[] } {
  const llamadas: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      llamadas.push(url)
      return Promise.resolve(
        new Response(JSON.stringify({ data: [FILA_BUSCADA], page: 1, pageSize: 25, total: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    })
  )
  return { llamadas }
}

async function abrirBuzon(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  render(<ConsolaComunicacionCO />)
  await user.click(screen.getByRole("tab", { name: /Buzón Ciudadano/i }))
}

/** Completa asunto y cuerpo y envía el reclamo. */
async function enviarReclamo(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByPlaceholderText("Resume tu mensaje"), "Filtración en el subterráneo")
  await user.type(screen.getByPlaceholderText("Detalla tu felicitación, sugerencia o reclamo…"), "Desde el martes.")
  await user.click(screen.getByRole("button", { name: /Enviar al buzón/i }))
}

interface RegistroBuzon {
  reportantePersonaId?: string
  reportanteNombre: string
  asunto: string
}

describe("S10 — el reportante del buzón se busca en el servidor", () => {
  it("busca al vecino en el servidor y registra el reclamo a su nombre", async () => {
    const { llamadas } = stubBuscarReportante()
    const user = userEvent.setup()
    await abrirBuzon(user)

    await user.type(screen.getByPlaceholderText("Buscar por nombre o RUT…"), "ana")
    await screen.findByText("Ana Vecina")
    await user.click(screen.getByText("Ana Vecina"))

    await enviarReclamo(user)

    // La consulta fue al endpoint del buzón, con `q`: no al padrón truncado del cliente.
    expect(llamadas.some((u) => u.startsWith("/api/comunicacion/buscar-personas?q=ana"))).toBe(true)
    expect(padron.crearBuzon).toHaveBeenCalledTimes(1)
    const registro = padron.crearBuzon.mock.calls[0]?.[0] as RegistroBuzon
    expect(registro.reportantePersonaId).toBe("s10-per-1")
    expect(registro.reportanteNombre).toBe("Ana Vecina")
    expect(registro.asunto).toBe("Filtración en el subterráneo")
  }, PRESUPUESTO_CARGA)

  it("sin selección el reclamo queda a nombre de la Administración y no hereda la primera fila del padrón", async () => {
    // Con el código anterior este caso guardaba `reportantePersonaId: "s10-per-primera"`
    // y `reportanteNombre: "Primera Fila"`: el vecino que nadie eligió.
    padron.total = 1
    padron.filas = [
      { id: "s10-per-primera", nombres: "Primera", apellidos: "Fila", estadoCuenta: "activa", roles: [] },
    ]
    stubBuscarReportante()
    const user = userEvent.setup()
    await abrirBuzon(user)

    expect(screen.getByText(/Sin selección, el reclamo se registra con tu propia identidad/)).toBeTruthy()
    await enviarReclamo(user)

    expect(padron.crearBuzon).toHaveBeenCalledTimes(1)
    const registro = padron.crearBuzon.mock.calls[0]?.[0] as RegistroBuzon
    expect(registro.reportantePersonaId).toBeUndefined()
    expect(registro.reportanteNombre).toBe("Administración")
  }, PRESUPUESTO_CARGA)

  it("el padrón recortado se declara en pantalla en vez de esconderse", async () => {
    // 166 personas en la comunidad, una sola montada: el alcance del envío masivo sale
    // recortado y el operador tiene que verlo.
    padron.total = 166
    padron.filas = [
      { id: "s10-per-primera", nombres: "Primera", apellidos: "Fila", estadoCuenta: "activa", roles: [] },
    ]
    stubBuscarReportante()
    render(<ConsolaComunicacionCO />)

    expect(screen.getByText(/Mostrando 1 de 166/)).toBeTruthy()
  }, PRESUPUESTO_CARGA)
})
