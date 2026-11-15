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
 *   · el recorte del SELECTOR DE UNIDAD se declara en pantalla — ese techo de
 *     `useUnidades` sigue teniendo sujeto en el filtro del envío masivo.
 *
 * T14: el alcance del envío masivo se movió al servidor (`GET /api/co/alcance-masivo`),
 * así que el tercer caso CAMBIÓ DE SUJETO — pinnea el aviso del selector de unidad y el
 * alcance que resuelve el endpoint, no el padrón del cliente que ya no se consulta. No
 * se retiró ninguna guarda por comodidad: el pin que existía sobre el padrón moría con
 * el cálculo cliente que protegía.
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
  /** Unidades montadas y total del servidor, para el aviso del selector (T14). */
  unidadesFilas: [] as { id: string; numero: string; etiqueta: string; microSectorId: string }[],
  unidadesTotal: 0,
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
  useUnidades: () => coleccion(padron.unidadesFilas, padron.unidadesTotal),
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

/** 100 unidades montadas de 166 que reporta el servidor: el techo de `useUnidades`. */
const LOTE_UNIDADES = Array.from({ length: 100 }, (_, i) => ({
  id: `s10-uni-${String(i + 1).padStart(3, "0")}`,
  numero: String(101 + i),
  etiqueta: "Depto",
  microSectorId: "s10-micro-1",
}))

/** Fila que responde `GET /api/co/alcance-masivo` y NINGÚN hook del cliente tiene (T14). */
const FILA_FUERA_DEL_PADRON = {
  personaId: "s10-per-fuera",
  unidadId: "s10-uni-100",
  personaNombre: "Zoila Fuera Del Padron",
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
  padron.unidadesFilas = []
  padron.unidadesTotal = 0
})

/** Stub de fetch que responde la búsqueda del servidor y graba cada URL pedida.
 *
 *  T14: la consola también consulta `/api/co/alcance-masivo` al montar; el despacho
 *  por URL devuelve el alcance que pide cada caso (vacío por defecto) y deja la
 *  búsqueda del reportante igual que siempre.
 */
function stubBuscarReportante(
  alcance: { data: unknown[]; total: number } = { data: [], total: 0 }
): { llamadas: string[] } {
  const llamadas: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      llamadas.push(url)
      if (url.startsWith("/api/co/alcance-masivo")) {
        return Promise.resolve(
          new Response(JSON.stringify({ ...alcance, page: 1, pageSize: 100 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        )
      }
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

  it("el recorte del selector de unidad se declara y el alcance ya no sale del padrón del cliente", async () => {
    // T14 movió el alcance al servidor: con los hooks truncados (1 persona y 100
    // unidades montadas de 166 cada una), el endpoint devuelve una persona que
    // NINGÚN hook tiene y la pantalla la muestra. El pin anterior («Mostrando 1 de
    // 166» del padrón) protegía el cálculo cliente que T14 retiró.
    padron.total = 166
    padron.filas = [
      { id: "s10-per-primera", nombres: "Primera", apellidos: "Fila", estadoCuenta: "activa", roles: [] },
    ]
    padron.unidadesFilas = LOTE_UNIDADES
    padron.unidadesTotal = 166
    stubBuscarReportante({ data: [FILA_FUERA_DEL_PADRON], total: 1 })
    render(<ConsolaComunicacionCO />)

    // El alcance del SERVIDOR incluye a quien el padrón truncado no monta.
    expect(await screen.findByText("Zoila Fuera Del Padron")).toBeTruthy()
    expect(screen.getByText("Alcance resuelto: 1 destinatario(s)")).toBeTruthy()

    // El aviso del SELECTOR DE UNIDAD sigue declarando su recorte (T14 no lo toca;
    // también queda pineado en comunicacion-alcance-masivo.test.tsx).
    expect(screen.getByText(/Mostrando 100 de 166/)).toBeTruthy()
    // El aviso del padrón —el sujeto que T14 retiró— ya no existe.
    expect(screen.queryByText(/Mostrando 1 de 166/)).toBeNull()
  }, PRESUPUESTO_CARGA)
})
