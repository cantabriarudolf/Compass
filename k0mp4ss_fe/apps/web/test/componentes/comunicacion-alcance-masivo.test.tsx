// @vitest-environment jsdom
/**
 * T14 (S10) — la pantalla ya no calcula los destinatarios del envío masivo.
 *
 * `consola-comunicacion.tsx` cruzaba TRES colecciones paginadas a cien (personas,
 * vínculos y unidades) en un `useMemo` del cliente: el alcance mostrado era el
 * alcance enviado, así que una comunidad con más de cien filas recibía el envío
 * incompleto y nadie se entera. Ahora el alcance lo resuelve
 * `GET /api/co/alcance-masivo` y la pantalla sólo consulta.
 *
 * Lo que se fija acá:
 *   · con los hooks del cliente truncados (100 de 166) y el endpoint devolviendo
 *     un alcance que INCLUYE a una persona que ningún hook tiene, la pantalla
 *     muestra ese alcance y el payload del envío lo lleva completo — con el
 *     MISMO shape de antes (`destinatarios: {personaId, unidadId}[]`);
 *   · con el endpoint fallando, el error del servidor se muestra VERBATIM y el
 *     envío queda bloqueado: no se manda nada sobre un alcance vacío en silencio;
 *   · el recorte del selector de unidad (el filtro, no el alcance) se sigue
 *     declarando con su aviso, tal como quedó en 228fe26.
 */
import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"

const PRESUPUESTO_CARGA = 60_000

/** Estado compartido con las factories de `vi.mock`. */
const estado = vi.hoisted(() => ({
  crearEnvio: vi.fn<(registro: unknown) => Promise<{ ok: true }>>(async () => ({ ok: true })),
}))

/** Colección truncada: 100 filas montadas de 166 que reporta el servidor. */
function loteDe(cien: (n: number) => unknown): unknown[] {
  return Array.from({ length: 100 }, (_, i) => cien(i + 1))
}

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
  // Colección truncada a propósito: 100 de 166. Después de T14 la pantalla ni
  // siquiera la consulta para el alcance — el mock documenta el techo heredado.
  usePersonas: () => ({
    personas: loteDe((n) => ({
      id: `t14c-per-${String(n).padStart(3, "0")}`,
      nombres: `Montada`,
      apellidos: `${String(n).padStart(3, "0")}`,
      estadoCuenta: "activa",
      roles: ["propietario"],
    })),
    total: 166,
    isLoading: false,
    error: null,
    hasMore: true,
    cargarMas: vi.fn(),
    cargandoMas: false,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-vinculos", () => ({
  useVinculos: () => ({
    vinculos: loteDe((n) => ({
      id: `t14c-v-${String(n).padStart(3, "0")}`,
      personaId: `t14c-per-${String(n).padStart(3, "0")}`,
      unidadId: `t14c-uni-${String(n).padStart(3, "0")}`,
      rol: "propietario",
      fechaFin: null,
    })),
    isLoading: false,
    error: null,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))

vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () =>
    coleccion(
      loteDe((n) => ({
        id: `t14c-uni-${String(n).padStart(3, "0")}`,
        numero: String(100 + n),
        etiqueta: "Depto",
        microSectorId: "t14c-micro-1",
      })),
      166
    ),
}))

vi.mock("@/lib/api/use-macro-sectores", () => ({
  useMacroSectores: () => coleccion([]),
}))

vi.mock("@/lib/api/use-micro-sectores", () => ({
  useMicroSectores: () => coleccion([]),
}))

vi.mock("@/lib/api/use-co", () => ({
  usePlantillasCO: () => coleccion([]),
  useEnviosCO: () => ({ ...coleccion([]), create: estado.crearEnvio }),
  useMensajesBuzonCO: () => coleccion([]),
}))

const { ConsolaComunicacionCO } = await import(
  "@/app/comunidad/comunicacion/consola-comunicacion"
)

/** La persona que NINGÚN hook del cliente tiene (está fuera de las primeras 100). */
const FILA_FUERA_DEL_PADRON = {
  personaId: "t14c-per-166",
  unidadId: "t14c-uni-166",
  personaNombre: "Zoraida Mas Alla",
}
const FILA_MONTADA = {
  personaId: "t14c-per-001",
  unidadId: "t14c-uni-001",
  personaNombre: "Ana Montada",
}

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  estado.crearEnvio.mockClear()
})

/**
 * Stub de `fetch` para el endpoint del alcance. `respuesta` puede ser un cuerpo
 * 200 o un par `{ status, cuerpo }` para los casos de error.
 */
function stubAlcance(
  respuesta: { data: unknown[]; total: number } | { status: number; cuerpo: unknown }
): { llamadas: string[] } {
  const llamadas: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      llamadas.push(url)
      if (!url.startsWith("/api/co/alcance-masivo")) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [], total: 0 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        )
      }
      if ("status" in respuesta) {
        return Promise.resolve(
          new Response(JSON.stringify(respuesta.cuerpo), {
            status: respuesta.status,
            headers: { "content-type": "application/json" },
          })
        )
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ ...respuesta, page: 1, pageSize: 100 }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    })
  )
  return { llamadas }
}

interface Destinatario {
  personaId: string
  unidadId?: string
}
interface RegistroEnvio {
  id: string
  asunto: string
  cuerpo: string
  plantillaId?: string
  destinatarios: Destinatario[]
  fechaEnvio: string
  lecturas: string[]
}

async function enviarMasivo(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByPlaceholderText("Ej: CORTE DE AGUA EMERGENCIA"), "Corte de agua")
  await user.type(screen.getByPlaceholderText("Estimado/a [Nombre_Usuario]…"), "Corte programado.")
  await user.click(screen.getByRole("button", { name: /Enviar a destinatarios filtrados/i }))
}

describe("T14 — el alcance del envío masivo se consulta al servidor", () => {
  it("muestra un alcance que incluye a la persona que los hooks truncados no tienen, y la envía", async () => {
    const { llamadas } = stubAlcance({ data: [FILA_FUERA_DEL_PADRON, FILA_MONTADA], total: 2 })
    const user = userEvent.setup()
    render(<ConsolaComunicacionCO />)

    // El alcance del SERVIDOR incluye a quien el padrón del cliente no monta.
    expect(await screen.findByText("Zoraida Mas Alla")).toBeTruthy()
    expect(screen.getByText("Alcance resuelto: 2 destinatario(s)")).toBeTruthy()

    // La consulta fue al endpoint, con el filtro de roles de la pantalla.
    expect(llamadas.some((u) => u.startsWith("/api/co/alcance-masivo?"))).toBe(true)
    expect(llamadas.some((u) => u.includes("roles=propietario"))).toBe(true)

    // El envío lleva el alcance completo, con el MISMO payload shape de antes.
    await enviarMasivo(user)
    expect(estado.crearEnvio).toHaveBeenCalledTimes(1)
    const registro = estado.crearEnvio.mock.calls[0]?.[0] as RegistroEnvio
    expect(registro.asunto).toBe("Corte de agua")
    expect(registro.lecturas).toEqual([])
    expect(registro.plantillaId).toBeUndefined()
    expect(typeof registro.id).toBe("string")
    expect(registro.destinatarios).toEqual([
      { personaId: "t14c-per-166", unidadId: "t14c-uni-166" },
      { personaId: "t14c-per-001", unidadId: "t14c-uni-001" },
    ])
  }, PRESUPUESTO_CARGA)

  it("con el endpoint fallando muestra el error verbatim y no deja enviar en silencio", async () => {
    stubAlcance({ status: 500, cuerpo: { error: "Error interno del servidor." } })
    const user = userEvent.setup()
    render(<ConsolaComunicacionCO />)

    // El mensaje del servidor, sin traducir ni reemplazar.
    expect(await screen.findByText("Error interno del servidor.")).toBeTruthy()

    // El alcance quedó vacío y el envío está bloqueado: ni click ni payload.
    const boton = screen.getByRole("button", { name: /Enviar a destinatarios filtrados/i })
    expect(boton).toBeDisabled()
    await user.click(boton)
    expect(estado.crearEnvio).not.toHaveBeenCalled()
  }, PRESUPUESTO_CARGA)

  it("el recorte del selector de unidad se sigue declarando (228fe26, intacto)", async () => {
    // El AvisoTruncamiento del FILTRO de unidad mira `useUnidades` (100 de 166):
    // ese techo no lo arregla T14, y declararlo sigue siendo la regla.
    stubAlcance({ data: [FILA_MONTADA], total: 1 })
    render(<ConsolaComunicacionCO />)

    expect(await screen.findByText("Alcance resuelto: 1 destinatario(s)")).toBeTruthy()
    expect(screen.getByText(/Mostrando 100 de 166/)).toBeTruthy()
  }, PRESUPUESTO_CARGA)
})
