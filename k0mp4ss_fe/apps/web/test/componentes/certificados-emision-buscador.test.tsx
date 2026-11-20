// @vitest-environment jsdom
/**
 * F36 — el buscador de personas del formulario de emisión (pantalla de gestión).
 *
 * El certificado de residencia es un documento legal sobre UNA persona y el
 * formulario la ofrecía en un `Select` truncado: la primera página de 100 de
 * `/api/personas`, filtrada en el cliente con la primera página de 100 de
 * `/api/vinculos`. Quien quedó fuera de esas páginas no podía ser certificada.
 *
 * Lo que se fija acá es el REEMPLAZO (regla C de F36):
 *   · el campo «Persona solicitante» pregunta al SERVIDOR
 *     (`GET /api/certificados-ct/buscar-personas?q=…`), no al padrón truncado;
 *   · la emisión se arma con la FILA BUSCADA: los hooks del padrón del cliente
 *     (`usePersonas`, `useVinculos`, `useUnidades`) llegan VACÍOS a propósito, así
 *     que si el payload dependiera de las colecciones truncadas, el test falla con
 *     el error «El certificado de residencia exige persona y unidad.»;
 *   · el resumen y el detalle del certificado quedan byte a byte iguales a los que
 *     producía la lista cerrada (mismos datos, mismas frases);
 *   · los errores verbatim se conservan: quitar la persona vuelve a pedir persona
 *     y unidad con la misma frase de siempre.
 */
import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"

const PRESUPUESTO_CARGA = 60_000

/**
 * Estado compartido con las factories de `vi.mock`. Las colecciones del padrón del
 * cliente van VACÍAS a propósito: la emisión de la persona buscada NO puede
 * depender de ellas (ese es el defecto de la lista truncada).
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

/**
 * La CF que devuelve `GET /api/configuracion` (app/api/configuracion/route.ts, ~89):
 * los dos campos van PROYECTADOS desde el firmante derivado de la membresía
 * administrador (`?? ""` cuando no hay administrador con ficha en el padrón).
 * Sin firmante la pantalla no emite —falla cerrada—, así que el fixture trae
 * nombre y RUT no vacíos y las validaciones de este arnés vuelven a ejecutarse.
 */
const CF_CON_FIRMANTE = vi.hoisted(() => ({
  administradorResponsable: "Rosa Firmante del Padrón",
  rutAdministrador: "12.345.678-9",
  firmaDigitalizadaUrl: null,
}))

vi.mock("@/lib/api/use-configuracion", () => ({
  useConfiguracion: () => ({
    config: CF_CON_FIRMANTE,
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

/** Fila que responde `GET /api/certificados-ct/buscar-personas?q=ana`. */
const FILA_BUSCADA = {
  id: "f36-per-1",
  nombres: "Ana",
  apellidos: "Buscada",
  rut: "7.123.456-8",
  vinculos: [
    { id: "f36-vin-101", unidadId: "f36-uni-101", unidad: "Depto 101", rol: "propietario" },
    { id: "f36-vin-102", unidadId: "f36-uni-102", unidad: "Depto 102", rol: "arrendatario" },
  ],
}

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  fuente.crear.mockClear()
})

/** Stub de fetch que responde la búsqueda del servidor y graba cada URL pedida. */
function stubBuscarPersonas(): { llamadas: string[] } {
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

/** Busca a la persona en el campo nuevo y la elige. */
async function elegirPersonaBuscada(
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  const input = screen.getByPlaceholderText("Buscar por nombre o RUT…")
  await user.type(input, "ana")
  await screen.findByText("Ana Buscada")
  await user.click(screen.getByText("Ana Buscada"))
}

describe("F36 — la persona solicitante se busca en el servidor", () => {
  it("consulta /api/certificados-ct/buscar-personas y emite con la fila buscada, sin padrón del cliente", async () => {
    const { llamadas } = stubBuscarPersonas()
    const user = userEvent.setup()
    // La gestión con las cuatro tipologías: la inicial es `residencia`.
    render(
      <CertificadosEmision
        tiposEmisibles={["residencia", "estado_cuenta", "liquidacion_sueldo", "al_dia"]}
      />
    )

    await elegirPersonaBuscada(user)

    // La consulta fue al endpoint ligero, con `q` y la página — no al padrón truncado.
    expect(llamadas.some((u) => u.startsWith("/api/certificados-ct/buscar-personas?q=ana"))).toBe(true)

    // La persona elegida queda a la vista y la unidad sale de sus vínculos VIGENTES
    // resueltos por el servidor (los hooks del cliente están vacíos: no hay otra fuente).
    expect(screen.getByText("Ana Buscada")).toBeTruthy()
    // El placeholder vive dentro del SelectTrigger (con `pointer-events: none`):
    // el click va al trigger, como lo haría el usuario.
    const comboUnidad = screen
      .getByText("Selecciona unidad")
      .closest('[role="combobox"]') as HTMLElement
    await user.click(comboUnidad)
    const listbox = await screen.findByRole("listbox", {}, { timeout: 5_000 })
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((o) => o.textContent ?? "")
    ).toEqual(["Depto 101", "Depto 102"])

    await user.click(within(listbox).getByText("Depto 102"))
    await user.type(screen.getByPlaceholderText("Nombre de quien solicita"), "QA F36")
    await user.click(screen.getByRole("button", { name: /Generar certificado PDF firmado/i }))

    expect(fuente.crear).toHaveBeenCalledTimes(1)
    const registro = fuente.crear.mock.calls[0]?.[0] as {
      tipo: string
      personaId?: string
      unidadId?: string
      origenRef?: string
      solicitanteNombre: string
      resumen: string
      detalle: { clave: string; valor: string }[]
    }
    expect(registro.tipo).toBe("residencia")
    expect(registro.personaId).toBe("f36-per-1")
    expect(registro.unidadId).toBe("f36-uni-102")
    // El vínculo elegido es el de la unidad elegida (el segundo vínculo vigente).
    expect(registro.origenRef).toBe("f36-vin-102")
    // Resumen byte a byte igual al que producía la lista cerrada con los mismos datos.
    expect(registro.resumen).toBe(
      "Se certifica que Ana Buscada (RUT 7.123.456-8) reside actualmente en Depto 102 según los registros de vinculación vigentes."
    )
    expect(registro.solicitanteNombre).toBe("QA F36")
    expect(registro.detalle).toEqual([
      { clave: "Residente", valor: "Ana Buscada" },
      { clave: "RUT", valor: "7.123.456-8" },
      { clave: "Unidad", valor: "Depto 102" },
      { clave: "Rol", valor: "arrendatario" },
    ])
  }, PRESUPUESTO_CARGA)

  it("quitar la persona deja el formulario sin destino y el error verbatim pide persona y unidad", async () => {
    stubBuscarPersonas()
    const user = userEvent.setup()
    render(
      <CertificadosEmision
        tiposEmisibles={["residencia", "estado_cuenta", "liquidacion_sueldo", "al_dia"]}
      />
    )

    await elegirPersonaBuscada(user)
    await user.click(screen.getByRole("button", { name: "Quitar selección" }))

    await user.type(screen.getByPlaceholderText("Nombre de quien solicita"), "QA F36")
    await user.click(screen.getByRole("button", { name: /Generar certificado PDF firmado/i }))

    // La frase exacta de siempre: el reemplazo del selector no cambió los mensajes.
    expect(await screen.findByText("El certificado de residencia exige persona y unidad.")).toBeTruthy()
    expect(fuente.crear).not.toHaveBeenCalled()
  }, PRESUPUESTO_CARGA)
})
