// @vitest-environment jsdom
/**
 * Borrados de Finanzas con guarda (T4, S1/S2) — las tres pantallas del lote.
 *
 * La regla es la misma que fijaron T2 y T3: el primer click en la papelera **no
 * borra**; abre el diálogo con el nombre concreto de la entidad y la
 * consecuencia literal que midió T1 en `odd/tasks/borrados-con-guarda.md` (qué
 * se pierde, nunca un «¿estás seguro?» vacío). La baja recién viaja al
 * confirmar, una sola vez, y el hook es quien la ejecuta: acá se mockea el
 * módulo del hook para afirmar que el primer click no lo llama.
 *
 * `gastos-comunes` es la migración y no una pantalla nueva: montaba
 * `ConfirmarEliminacion` crudo —el patrón que el resto copió— y pasa a la
 * guarda única. Conserva su título, su consecuencia y su manejo de error (el
 * 409 del servidor por movimientos o proyectos se sigue leyendo en el banner y
 * ahora también dentro del diálogo), y el archivo no puede volver a montar el
 * diálogo crudo. Eso último se afirma sobre el fuente, como `sin-store.ts`.
 *
 * En `multas` la baja del catálogo no se confunde con «desestimar» un
 * expediente: desestimar es una transición de estado y no se toca.
 */
import React from "react"
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import type { FondoFI, TipoInfraccionIN } from "@/lib/schemas"

vi.setConfig({ testTimeout: 60_000 })

/* -------------------------------------------------------------------------- */
/* Consecuencias y títulos literales (tabla de medición fina, T1).             */
/* -------------------------------------------------------------------------- */

const ARIA_LIQUIDACION = "Eliminar la liquidación LIQ-0007"
const TITULO_LIQUIDACION =
  "Eliminar la liquidación LIQ-0007 de Ana Pérez · periodo 2026-11"
const CONSECUENCIA_LIQUIDACION =
  "Se pierden los haberes y descuentos calculados; los adelantos que la nombraban quedan sin liquidación."
/** La liquidación confirmada no se ofrece para borrar: no tiene papelera. */
const ARIA_LIQUIDACION_CONFIRMADA = "Eliminar la liquidación LIQ-0008"

const ARIA_TIPO = "Eliminar el tipo de infracción «Ruidos Molestos»"
const TITULO_TIPO = "Eliminar el tipo de infracción «Ruidos Molestos» · Leve"
const CONSECUENCIA_TIPO =
  "Las multas aplicadas con él quedan sin la categoría ni el monto que las fundó."

const ARIA_FONDO = 'Eliminar el fondo "Fondo de Reserva"'
const TITULO_FONDO = '¿Eliminar el fondo "Fondo de Reserva"?'
const CONSECUENCIA_FONDO =
  "Los egresos, ingresos y proyectos de mantenimiento que lo usan quedan sin fondo. Si el fondo tiene movimientos, el sistema no lo va a borrar."

/* -------------------------------------------------------------------------- */
/* Fixtures: una fila por pantalla, con los maestros que la fila nombra.       */
/* -------------------------------------------------------------------------- */

const PERSONAS = [{ id: "p-ana", nombres: "Ana", apellidos: "Pérez" }]

/** Lo que la tabla del historial lee de una liquidación (no el schema entero). */
interface LiquidacionFalsa {
  id: string
  folio: string
  periodo: string
  trabajadorPersonaId: string
  totalImponible: number
  totalDescuentos: number
  descuentoAnticipos: number
  liquidoAPagar: number
  estado: "borrador" | "confirmada"
}

const LIQUIDACIONES: LiquidacionFalsa[] = [
  {
    id: "liq-1",
    folio: "LIQ-0007",
    periodo: "2026-11",
    trabajadorPersonaId: "p-ana",
    totalImponible: 812_000,
    totalDescuentos: 162_000,
    descuentoAnticipos: 0,
    liquidoAPagar: 650_000,
    estado: "borrador",
  },
  {
    id: "liq-2",
    folio: "LIQ-0008",
    periodo: "2026-10",
    trabajadorPersonaId: "p-ana",
    totalImponible: 812_000,
    totalDescuentos: 162_000,
    descuentoAnticipos: 0,
    liquidoAPagar: 650_000,
    estado: "confirmada",
  },
]

const TIPO: TipoInfraccionIN = {
  id: "tin-1",
  nombre: "Ruidos Molestos",
  categoria: "leve",
  tipoSancion: "monto_fijo",
  valor: 30_000,
}

const FONDO: FondoFI = {
  id: "fdo-1",
  nombre: "Fondo de Reserva",
  tipo: "reserva",
  descripcion: "Reserva legal para imprevistos de la comunidad.",
  activo: true,
  saldoInicial: 0,
}

/* -------------------------------------------------------------------------- */
/* Espías de baja: lo que la guarda tiene que NO llamar en el primer click.    */
/* -------------------------------------------------------------------------- */

const removeLiquidacion = vi.fn(async () => ({ ok: true }))
const removeTipo = vi.fn(async () => ({ ok: true }))
const removeFondo = vi.fn(async () => ({ ok: true }))

/** Colección con el contrato de `useCrudCollection`, sin red. */
function coleccion<T>(
  items: T[],
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>
) {
  return {
    items,
    total: items.length,
    isLoading: false,
    error: null,
    hasMore: false,
    cargandoMas: false,
    cargarMas: vi.fn(async () => {}),
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove,
  }
}

vi.mock("@/lib/api/use-liquidaciones", () => ({
  useLiquidaciones: () => ({
    liquidaciones: LIQUIDACIONES,
    items: LIQUIDACIONES,
    total: LIQUIDACIONES.length,
    isLoading: false,
    error: null,
    remove: removeLiquidacion,
    generar: vi.fn(async () => ({ ok: true })),
    confirmar: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-adelantos-pl", () => ({
  useAdelantosPL: () => ({
    adelantos: [],
    total: 0,
    isLoading: false,
    error: null,
    crear: vi.fn(async () => ({ ok: true })),
    desestimar: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({ personas: PERSONAS, total: PERSONAS.length, isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-configuracion", () => ({
  useConfiguracion: () => ({
    config: null,
    isLoading: false,
    error: null,
    updateConfig: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-maestros", () => ({
  useMaestros: () => ({ data: [], total: 0, isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-in", () => ({
  useTiposInfraccionIN: () => coleccion([TIPO], removeTipo),
  useInfraccionesIN: () => ({
    ...coleccion([], vi.fn(async () => ({ ok: true }))),
    aplicar: vi.fn(async () => ({ ok: true })),
    desestimar: vi.fn(async () => ({ ok: true })),
    apelar: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-co", () => ({
  useMensajesBuzonCO: () => coleccion([], vi.fn(async () => ({ ok: true }))),
}))
vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () => coleccion([], vi.fn(async () => ({ ok: true }))),
}))
vi.mock("@/lib/api/use-tipos-unidad", () => ({
  useTiposUnidad: () => coleccion([], vi.fn(async () => ({ ok: true }))),
}))
vi.mock("@/lib/api/use-vinculos", () => ({
  useVinculos: () => ({
    vinculos: [],
    isLoading: false,
    error: null,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-fondos-fi", () => ({
  useFondosFI: () => coleccion([FONDO], removeFondo),
}))
vi.mock("@/lib/api/use-egresos-fi", () => ({
  useEgresosFI: () => coleccion([], vi.fn(async () => ({ ok: true }))),
}))
vi.mock("@/lib/api/use-ingresos-fi", () => ({
  useIngresosFI: () => coleccion([], vi.fn(async () => ({ ok: true }))),
}))
vi.mock("@/lib/api/use-emisiones-gc", () => ({
  useEmisionesGC: () => ({
    ...coleccion([], vi.fn(async () => ({ ok: true }))),
    emitir: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-cobros-fi", () => ({
  useCobrosFI: () => coleccion([], vi.fn(async () => ({ ok: true }))),
  useAccionesCobranzaFI: () => ({
    enviarCobranza: vi.fn(async () => ({ ok: true })),
    actualizarCanalesGlobal: vi.fn(async () => ({ ok: true })),
    actualizarPreferenciaCanal: vi.fn(async () => ({ ok: true })),
  }),
  useCanalesCobranzaFI: () => ({
    global: { visor: true, email: true },
    personas: [],
    propio: null,
    isLoading: false,
    error: null,
  }),
  resumenDeCanales: () => "",
}))

import RemuneracionesPage from "@/app/finanzas/remuneraciones/page"
import MultasPage from "@/app/finanzas/multas/page"
import GastosComunesPage from "@/app/finanzas/gastos-comunes/page"

function json(cuerpo: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  )
}

/** Baja diferida: deja el DELETE en vuelo hasta que el test lo resuelve. */
function bajaDiferida() {
  let resolver: (resultado: { ok: boolean; error?: string }) => void = () => {}
  const promesa = new Promise<{ ok: boolean; error?: string }>((resolve) => {
    resolver = resolve
  })
  return { promesa, resolver: (resultado: { ok: boolean; error?: string }) => resolver(resultado) }
}

beforeEach(() => {
  instalarEntornoRadix()
  vi.clearAllMocks()
  removeLiquidacion.mockImplementation(async () => ({ ok: true }))
  removeTipo.mockImplementation(async () => ({ ok: true }))
  removeFondo.mockImplementation(async () => ({ ok: true }))
  // Ninguna pantalla debe golpear la red con los hooks mockeados; el stub deja
  // el run determinista si alguna lectura residual pide una URL (la guarda
  // global de MSW responde `error` a lo no declarado).
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      if (url.startsWith("/api/configuracion")) return json({ data: null })
      return json({ data: [], total: 0 })
    })
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Abre el diálogo desde la papelera y devuelve el diálogo para leerlo. */
async function abrirDesdePapelera(
  usuario: ReturnType<typeof userEvent.setup>,
  ariaLabel: string
): Promise<HTMLElement> {
  await usuario.click(await screen.findByRole("button", { name: ariaLabel }))
  return screen.findByRole("alertdialog")
}

/** Entra al catálogo de faltas (la única pestaña que borra en `multas`). */
async function abrirCatalogo(usuario: ReturnType<typeof userEvent.setup>): Promise<void> {
  await usuario.click(screen.getByRole("tab", { name: "Catálogo de faltas" }))
}

describe("el primer click en la papelera no borra: abre la guarda", () => {
  it("remuneraciones: nombra la liquidación con su folio, trabajador y periodo", async () => {
    const usuario = userEvent.setup()
    render(<RemuneracionesPage />)

    const dialogo = await abrirDesdePapelera(usuario, ARIA_LIQUIDACION)

    expect(within(dialogo).getByText(TITULO_LIQUIDACION)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_LIQUIDACION)
    expect(removeLiquidacion).not.toHaveBeenCalled()
  })

  it("multas: nombra el tipo de infracción con su categoría y sus multas quedan sin fundamento", async () => {
    const usuario = userEvent.setup()
    render(<MultasPage />)

    await abrirCatalogo(usuario)
    const dialogo = await abrirDesdePapelera(usuario, ARIA_TIPO)

    expect(within(dialogo).getByText(TITULO_TIPO)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_TIPO)
    expect(removeTipo).not.toHaveBeenCalled()
  })

  it("gastos comunes: el fondo conserva su título y su consecuencia, y no se borra al abrir", async () => {
    const usuario = userEvent.setup()
    render(<GastosComunesPage />)

    const dialogo = await abrirDesdePapelera(usuario, ARIA_FONDO)

    expect(within(dialogo).getByText(TITULO_FONDO)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_FONDO)
    expect(removeFondo).not.toHaveBeenCalled()
  })
})

describe("confirmar ejecuta la baja una sola vez y cierra", () => {
  it("remuneraciones: la papelera + confirmar llama al hook con el id de la liquidación", async () => {
    const usuario = userEvent.setup()
    render(<RemuneracionesPage />)

    const dialogo = await abrirDesdePapelera(usuario, ARIA_LIQUIDACION)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(removeLiquidacion).toHaveBeenCalledTimes(1))
    expect(removeLiquidacion).toHaveBeenCalledWith("liq-1")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })

  it("multas: la papelera + confirmar llama al hook con el id del tipo", async () => {
    const usuario = userEvent.setup()
    render(<MultasPage />)

    await abrirCatalogo(usuario)
    const dialogo = await abrirDesdePapelera(usuario, ARIA_TIPO)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(removeTipo).toHaveBeenCalledTimes(1))
    expect(removeTipo).toHaveBeenCalledWith("tin-1")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })

  it("gastos comunes: borra el fondo una vez, cierra y conserva su mensaje de éxito", async () => {
    const usuario = userEvent.setup()
    render(<GastosComunesPage />)

    const dialogo = await abrirDesdePapelera(usuario, ARIA_FONDO)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(removeFondo).toHaveBeenCalledTimes(1))
    expect(removeFondo).toHaveBeenCalledWith("fdo-1")
    expect(await screen.findByText("Fondo eliminado.")).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })
})

describe("con la baja en vuelo un segundo click no dispara otra baja", () => {
  it("remuneraciones: dos clicks sobre confirmar dejan una sola llamada", async () => {
    const usuario = userEvent.setup()
    const baja = bajaDiferida()
    removeLiquidacion.mockImplementationOnce(() => baja.promesa)
    render(<RemuneracionesPage />)

    const dialogo = await abrirDesdePapelera(usuario, ARIA_LIQUIDACION)
    const confirmar = within(dialogo).getByRole("button", { name: "Eliminar" })
    await usuario.click(confirmar)
    await usuario.click(confirmar)

    expect(removeLiquidacion).toHaveBeenCalledTimes(1)

    baja.resolver({ ok: true })
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(removeLiquidacion).toHaveBeenCalledTimes(1)
  })

  it("multas: dos clicks sobre confirmar dejan una sola llamada", async () => {
    const usuario = userEvent.setup()
    const baja = bajaDiferida()
    removeTipo.mockImplementationOnce(() => baja.promesa)
    render(<MultasPage />)

    await abrirCatalogo(usuario)
    const dialogo = await abrirDesdePapelera(usuario, ARIA_TIPO)
    const confirmar = within(dialogo).getByRole("button", { name: "Eliminar" })
    await usuario.click(confirmar)
    await usuario.click(confirmar)

    expect(removeTipo).toHaveBeenCalledTimes(1)

    baja.resolver({ ok: true })
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(removeTipo).toHaveBeenCalledTimes(1)
  })

  it("gastos comunes: dos clicks sobre confirmar dejan una sola llamada", async () => {
    const usuario = userEvent.setup()
    const baja = bajaDiferida()
    removeFondo.mockImplementationOnce(() => baja.promesa)
    render(<GastosComunesPage />)

    const dialogo = await abrirDesdePapelera(usuario, ARIA_FONDO)
    const confirmar = within(dialogo).getByRole("button", { name: "Eliminar" })
    await usuario.click(confirmar)
    await usuario.click(confirmar)

    expect(removeFondo).toHaveBeenCalledTimes(1)

    baja.resolver({ ok: true })
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(removeFondo).toHaveBeenCalledTimes(1)
  })
})

describe("gastos comunes: la guarda de fondos con movimientos se sigue leyendo", () => {
  it("el motivo del servidor sale dentro del diálogo y el diálogo no se cierra", async () => {
    const MOTIVO =
      "No se puede eliminar el fondo: tiene 2 egreso(s) y 1 proyecto(s) asociados."
    removeFondo.mockImplementationOnce(async () => ({ ok: false, error: MOTIVO }))
    const usuario = userEvent.setup()
    render(<GastosComunesPage />)

    const dialogo = await abrirDesdePapelera(usuario, ARIA_FONDO)
    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))

    // Se lee DENTRO del diálogo (el overlay tapa el banner de la pantalla) y
    // además queda en el aviso inline, que es el manejo de error que ya existía.
    const sigueAbierto = await screen.findByRole("alertdialog")
    expect(within(sigueAbierto).getByRole("alert")).toHaveTextContent(MOTIVO)
    expect(screen.getAllByText(MOTIVO).length).toBe(2)
    expect(removeFondo).toHaveBeenCalledTimes(1)
  })

  it("el archivo monta la guarda única y no el diálogo crudo", () => {
    const fuente = readFileSync(
      path.resolve(__dirname, "../../app/finanzas/gastos-comunes/page.tsx"),
      "utf8"
    )

    expect(fuente).toContain("@/components/eliminar-con-confirmacion")
    expect(fuente).not.toContain("@/components/confirmar-eliminacion")
    expect(fuente).not.toContain("<ConfirmarEliminacion")
  })
})

describe("lo que ya hacía cada pantalla sigue igual", () => {
  it("remuneraciones: sólo el borrador ofrece la baja y conserva el botón Confirmar", () => {
    render(<RemuneracionesPage />)

    expect(screen.queryByRole("button", { name: ARIA_LIQUIDACION_CONFIRMADA })).toBeNull()
    expect(screen.getByRole("button", { name: ARIA_LIQUIDACION })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeTruthy()
  })

  it("multas: la fila del catálogo sigue ofreciendo Editar con el tipo precargado", async () => {
    const usuario = userEvent.setup()
    render(<MultasPage />)

    await abrirCatalogo(usuario)
    await usuario.click(screen.getByRole("button", { name: "Editar" }))

    const formulario = await screen.findByRole("dialog")
    expect(within(formulario).getByText("Editar tipo de falta")).toBeTruthy()
    expect(within(formulario).getByDisplayValue("Ruidos Molestos")).toBeTruthy()
    expect(removeTipo).not.toHaveBeenCalled()
  })
})
