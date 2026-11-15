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
 *
 * T15 (S10, advisory R3-walk-sin-cobertura) — la caminata multi-página. La
 * consola camina las páginas de `/api/co/alcance-masivo` hasta el `total`
 * declarado, pero los stubs que pinneaban T14 devolvían UNA sola página cuya
 * `data.length` ya igualaba el `total`: el cuerpo del loop nunca se ejecutaba
 * y la promesa central de T14 —el envío sale COMPLETO cuando la comunidad pasa
 * de cien filas— sólo estaba afirmada a nivel de envelope de la API. Acá la
 * caminata se ejecuta de verdad: `total = 250` y tres páginas (100 + 100 + 50)
 * servidas por número de `page`, el payload del envío con los 250 y las tres
 * URLs pedidas. El control negativo fija los dos comportamientos que hoy están
 * en el código: tercera página vacía con el `total` en 250 → el loop corta sin
 * colgar ni inventar filas, y el recorte del transporte queda declarado.
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
 *
 * R3-001 (T15): una URL que el caso no declaró LANZA — el stub que respondía
 * vacío se tragaba una pantalla mal ruteada: la consulta a otro endpoint lucía
 * verde con un alcance vacío en silencio.
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
        throw new Error(`[stub] URL inesperada para este caso: ${url}`)
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

/**
 * Stub de `fetch` que sirve el alcance POR PÁGINA: la caminata pide `page=1..n`
 * y el stub resuelve cada número por separado. Devuelve el `page` de cada URL
 * pedida, en orden, para afirmar cuántas páginas caminó la pantalla.
 */
function stubAlcancePorPagina(
  respuestaDePagina: (page: number) => { data: unknown[]; total: number } | { status: number; cuerpo: unknown }
): { paginasPedidas: string[] } {
  const paginasPedidas: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      // R3-001 (T15): igual que `stubAlcance` — URL no declarada es error nombrado,
      // no un alcance vacío en silencio.
      if (!url.startsWith("/api/co/alcance-masivo")) {
        throw new Error(`[stub] URL inesperada para este caso: ${url}`)
      }
      const page = new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("page") ?? "1"
      paginasPedidas.push(page)
      const respuesta = respuestaDePagina(Number(page))
      if ("status" in respuesta) {
        return Promise.resolve(
          new Response(JSON.stringify(respuesta.cuerpo), {
            status: respuesta.status,
            headers: { "content-type": "application/json" },
          })
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ...respuesta, page: Number(page), pageSize: 100 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    })
  )
  return { paginasPedidas }
}

/**
 * T16 (R3-error-sin-reintento) — stub que sirve el alcance por página con FALLAS
 * inyectadas: para cada página con entrada en `fallas`, las primeras `veces`
 * llamadas fallan — con `red: true` lanza el TypeError del fallo de red, con
 * `status` responde ese HTTP con `cuerpo` — y las siguientes devuelven el lote
 * normal. Cuenta las llamadas por página: el reintento acotado tiene que poder
 * verse en esa cuenta (UNA llamada más, no un bucle).
 */
function stubAlcanceConFallas(
  respuestaDePagina: (page: number) => { data: unknown[]; total: number },
  fallas: Record<number, { veces: number; status?: number; cuerpo?: unknown; red?: boolean }>
): { llamadasPorPagina: Record<string, number> } {
  const llamadasPorPagina: Record<string, number> = {}
  const restantes = new Map(Object.entries(fallas).map(([p, f]) => [Number(p), { ...f }]))
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      // R3-001 (T15): URL no declarada es error nombrado, no un vacío en silencio.
      if (!url.startsWith("/api/co/alcance-masivo")) {
        throw new Error(`[stub] URL inesperada para este caso: ${url}`)
      }
      const page = Number(new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("page") ?? "1")
      llamadasPorPagina[String(page)] = (llamadasPorPagina[String(page)] ?? 0) + 1
      const fallo = restantes.get(page)
      if (fallo && fallo.veces > 0) {
        fallo.veces -= 1
        if (fallo.red) return Promise.reject(new TypeError("Failed to fetch"))
        return Promise.resolve(
          new Response(JSON.stringify(fallo.cuerpo ?? {}), {
            status: fallo.status ?? 503,
            headers: { "content-type": "application/json" },
          })
        )
      }
      const respuesta = respuestaDePagina(page)
      return Promise.resolve(
        new Response(JSON.stringify({ ...respuesta, page, pageSize: 100 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    })
  )
  return { llamadasPorPagina }
}

/** Fila del alcance con ids deterministas por orden global (1..250). */
function filaAlcance(n: number): { personaId: string; unidadId: string; personaNombre: string } {
  const orden = String(n).padStart(3, "0")
  return {
    personaId: `t14w-per-${orden}`,
    unidadId: `t14w-uni-${orden}`,
    personaNombre: `Caminata ${orden}`,
  }
}

/** Rango contiguo de filas [desde..hasta]: una página del stub. */
function loteAlcance(desde: number, hasta: number): unknown[] {
  return Array.from({ length: hasta - desde + 1 }, (_, i) => filaAlcance(desde + i))
}

/** Destinatario del payload: el shape exacto que arma la pantalla ({personaId, unidadId}). */
function destinatariosDe(desde: number, hasta: number): { personaId: string; unidadId: string }[] {
  return Array.from({ length: hasta - desde + 1 }, (_, i) => {
    const fila = filaAlcance(desde + i)
    return { personaId: fila.personaId, unidadId: fila.unidadId }
  })
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
    // T16 (R3-orden-locale): el orden CAMBIA — el alcance resuelto se ordena con la
    // collation española sobre el nombre, así que el payload (mismo estado) viaja en
    // orden determinista y no en el orden de la colación de la base. Contenido y
    // shape intactos.
    await enviarMasivo(user)
    expect(estado.crearEnvio).toHaveBeenCalledTimes(1)
    const registro = estado.crearEnvio.mock.calls[0]?.[0] as RegistroEnvio
    expect(registro.asunto).toBe("Corte de agua")
    expect(registro.lecturas).toEqual([])
    expect(registro.plantillaId).toBeUndefined()
    expect(typeof registro.id).toBe("string")
    expect(registro.destinatarios).toEqual([
      { personaId: "t14c-per-001", unidadId: "t14c-uni-001" }, // «Ana Montada»
      { personaId: "t14c-per-166", unidadId: "t14c-uni-166" }, // «Zoraida Mas Alla»
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

describe("T15 — la caminata multi-página del alcance masivo (advisory R3-walk-sin-cobertura)", () => {
  it("camina 100+100+50 hasta el total 250: el envío lleva los 250, sin repetidos, y pide exactamente tres páginas", async () => {
    // Tres páginas reales servidas por `page`: 100 + 100 + 50 filas, `total` 250.
    const { paginasPedidas } = stubAlcancePorPagina((page) => ({
      data: loteAlcance((page - 1) * 100 + 1, Math.min(page * 100, 250)),
      total: 250,
    }))
    const user = userEvent.setup()
    render(<ConsolaComunicacionCO />)

    expect(await screen.findByText("Alcance resuelto: 250 destinatario(s)")).toBeTruthy()

    // Se pidieron EXACTAMENTE las tres páginas, una vez cada una, en orden.
    expect(paginasPedidas).toEqual(["1", "2", "3"])

    await enviarMasivo(user)
    expect(estado.crearEnvio).toHaveBeenCalledTimes(1)
    const registro = estado.crearEnvio.mock.calls[0]?.[0] as RegistroEnvio
    // Los 250, con los ids de las TRES páginas, en orden, sin repetidos —
    // y el shape del payload intacto ({personaId, unidadId}, sin nombre).
    expect(registro.destinatarios).toEqual([
      ...destinatariosDe(1, 100),
      ...destinatariosDe(101, 200),
      ...destinatariosDe(201, 250),
    ])
    const ids = registro.destinatarios.map((d) => d.personaId)
    expect(new Set(ids).size).toBe(250)
    expect(ids[0]).toBe("t14w-per-001") // primera de la página 1
    expect(ids[100]).toBe("t14w-per-101") // primera de la página 2
    expect(ids[249]).toBe("t14w-per-250") // última de la página 3
  }, PRESUPUESTO_CARGA)

  it("tercera página vacía con total en 250: el loop corta, no cuelga, no inventa filas y declara el recorte", async () => {
    // Control negativo barato (comportamientos tal como están en el código):
    // las dos primeras páginas completas y la tercera VACÍA con el `total`
    // todavía en 250. El loop corta en la vacía: no cuelga pidiendo páginas
    // hasta el `total` ni rellena filas para alcanzarlo.
    const { paginasPedidas } = stubAlcancePorPagina((page) => {
      if (page === 1) return { data: loteAlcance(1, 100), total: 250 }
      if (page === 2) return { data: loteAlcance(101, 200), total: 250 }
      return { data: [], total: 250 }
    })
    const user = userEvent.setup()
    render(<ConsolaComunicacionCO />)

    // 100 + 100 conservadas; ni una fila inventada para llegar a 250.
    expect(await screen.findByText("Alcance resuelto: 200 destinatario(s)")).toBeTruthy()
    // El recorte del TRANSPORTE queda declarado por el aviso, no escondido.
    expect(await screen.findByText(/Mostrando 200 de 250/)).toBeTruthy()

    // Se pidió la página vacía y NINGUNA más: el break es lo que evita el colgado.
    expect(paginasPedidas).toEqual(["1", "2", "3"])

    await enviarMasivo(user)
    expect(estado.crearEnvio).toHaveBeenCalledTimes(1)
    const registro = estado.crearEnvio.mock.calls[0]?.[0] as RegistroEnvio
    expect(registro.destinatarios).toEqual([
      ...destinatariosDe(1, 100),
      ...destinatariosDe(101, 200),
    ])
  }, PRESUPUESTO_CARGA)
})

describe("T16 — los huecos chicos de la caminata del alcance", () => {
  it("dos páginas que se solapan no empujan la misma fila dos veces (dedupe por persona|unidad)", async () => {
    // R3-walk-duplicados (T16): la página 2 devuelve filas que la página 1 ya trajo
    // (51..100 repetidas). Sin deduplicar, el alcance mostrado y el payload del envío
    // llevan 300 filas con 50 repetidas — el mismo destinatario recibiría el envío
    // dos veces. La caminata conserva la primera aparición de cada fila.
    const { paginasPedidas } = stubAlcancePorPagina((page) => {
      if (page === 1) return { data: loteAlcance(1, 100), total: 250 }
      if (page === 2) return { data: loteAlcance(51, 150), total: 250 }
      return { data: loteAlcance(151, 250), total: 250 }
    })
    const user = userEvent.setup()
    render(<ConsolaComunicacionCO />)

    expect(await screen.findByText("Alcance resuelto: 250 destinatario(s)")).toBeTruthy()
    expect(paginasPedidas).toEqual(["1", "2", "3"])

    await enviarMasivo(user)
    expect(estado.crearEnvio).toHaveBeenCalledTimes(1)
    const registro = estado.crearEnvio.mock.calls[0]?.[0] as RegistroEnvio
    // Los 250 ÚNICOS, en orden de primera aparición: el solape de la página 2 no
    // duplica filas y las 50 que faltaban (151..250) vienen de la página 3.
    expect(registro.destinatarios).toEqual(destinatariosDe(1, 250))
    const claves = registro.destinatarios.map((d) => `${d.personaId}|${d.unidadId ?? ""}`)
    expect(new Set(claves).size).toBe(250)
  }, PRESUPUESTO_CARGA)

  it("una desconexión en la primera página reintenta UNA vez y la caminata sigue completa", async () => {
    // R3-error-sin-reintento (T16): UN reintento por página, sólo para error de red o
    // 5xx. La primera llamada a la página 1 cae en red; el reintento (misma señal)
    // alcanza el 200 y las tres páginas llegan completas.
    const { llamadasPorPagina } = stubAlcanceConFallas(
      (page) => ({ data: loteAlcance((page - 1) * 100 + 1, Math.min(page * 100, 250)), total: 250 }),
      { 1: { veces: 1, red: true } }
    )
    const user = userEvent.setup()
    render(<ConsolaComunicacionCO />)

    expect(
      await screen.findByText("Alcance resuelto: 250 destinatario(s)", undefined, { timeout: 3000 })
    ).toBeTruthy()
    // La página 1 se llamó DOS veces (el reintento), el resto una sola vez.
    expect(llamadasPorPagina["1"]).toBe(2)
    expect(llamadasPorPagina["2"]).toBe(1)
    expect(llamadasPorPagina["3"]).toBe(1)

    await enviarMasivo(user)
    const registro = estado.crearEnvio.mock.calls[0]?.[0] as RegistroEnvio
    expect(registro.destinatarios).toEqual(destinatariosDe(1, 250))
  }, PRESUPUESTO_CARGA)

  it("un 503 en la primera página reintenta UNA vez y el alcance llega completo", async () => {
    // Misma regla que la desconexión, con la otra señal reintentable: 5xx.
    const { llamadasPorPagina } = stubAlcanceConFallas(
      (page) => ({ data: loteAlcance((page - 1) * 100 + 1, Math.min(page * 100, 250)), total: 250 }),
      { 1: { veces: 1, status: 503, cuerpo: { error: "Servicio momentáneamente no disponible." } } }
    )
    const user = userEvent.setup()
    render(<ConsolaComunicacionCO />)

    expect(
      await screen.findByText("Alcance resuelto: 250 destinatario(s)", undefined, { timeout: 3000 })
    ).toBeTruthy()
    expect(llamadasPorPagina["1"]).toBe(2)
    expect(llamadasPorPagina["2"]).toBe(1)
    expect(llamadasPorPagina["3"]).toBe(1)
  }, PRESUPUESTO_CARGA)

  it("el segundo intento que también falla deja el error verbatim, y el reintento es UNO por página", async () => {
    // Cuando el segundo intento también falla, el error del servidor viaja VERBATIM
    // (sin traducir ni reemplazar) y la caminata no insiste: dos llamadas, no tres.
    const { llamadasPorPagina } = stubAlcanceConFallas(
      () => ({ data: [], total: 0 }),
      { 1: { veces: 2, status: 503, cuerpo: { error: "Error interno del servidor." } } }
    )
    render(<ConsolaComunicacionCO />)

    expect(
      await screen.findByText("Error interno del servidor.", undefined, { timeout: 3000 })
    ).toBeTruthy()
    expect(llamadasPorPagina["1"]).toBe(2)
  }, PRESUPUESTO_CARGA)

  it("un 4xx no reintenta: la respuesta definitiva del servidor viaja verbatim al primer intento", async () => {
    // El reintento es sólo para error de red o 5xx: un 4xx es una respuesta
    // definitiva (aquí, el portón) y se muestra al primer intento, una sola vez.
    const { llamadasPorPagina } = stubAlcanceConFallas(
      () => ({ data: [], total: 0 }),
      { 1: { veces: 99, status: 403, cuerpo: { error: "Permiso denegado." } } }
    )
    render(<ConsolaComunicacionCO />)

    expect(await screen.findByText("Permiso denegado.", undefined, { timeout: 3000 })).toBeTruthy()
    expect(llamadasPorPagina["1"]).toBe(1)
  }, PRESUPUESTO_CARGA)

  it("el orden del alcance es la collation española sobre el nombre, no la colación de la base", async () => {
    // R3-orden-locale (T16): el orden del alcance heredaba la colación de la base —
    // en SQLite el orden binario deja los nombres acentuados al final («Á» es
    // U+00C1, mayor que «Z»). El stub devuelve las filas en ese orden de base y la
    // vista previa tiene que mostrarlas en orden es: Álvarez, Ana, Zúñiga.
    stubAlcancePorPagina(() => ({
      data: [
        { personaId: "t16-per-z", unidadId: "t16-uni-z", personaNombre: "Zúñiga Última" },
        { personaId: "t16-per-a2", unidadId: "t16-uni-a2", personaNombre: "Álvarez Acentuada" },
        { personaId: "t16-per-a1", unidadId: "t16-uni-a1", personaNombre: "Ana Llana" },
      ],
      total: 3,
    }))
    render(<ConsolaComunicacionCO />)

    expect(await screen.findByText("Alcance resuelto: 3 destinatario(s)")).toBeTruthy()
    const alvarez = screen.getByText("Álvarez Acentuada")
    const ana = screen.getByText("Ana Llana")
    const zuniga = screen.getByText("Zúñiga Última")
    expect(alvarez.compareDocumentPosition(ana) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(ana.compareDocumentPosition(zuniga) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // El orden determinista también llega al payload del envío (mismo estado).
    const user = userEvent.setup()
    await enviarMasivo(user)
    const registro = estado.crearEnvio.mock.calls[0]?.[0] as RegistroEnvio
    expect(registro.destinatarios.map((d) => d.personaId)).toEqual([
      "t16-per-a2",
      "t16-per-a1",
      "t16-per-z",
    ])
  }, PRESUPUESTO_CARGA)
})
