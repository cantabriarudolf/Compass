// @vitest-environment jsdom
/**
 * Pantalla del registro de acuerdos de gobernanza (U3b · F28/F29/F31).
 *
 * Las rutas del registro existían desde U3a (alta del acuerdo y voto inmutable) y
 * nadie podía usarlas sin curl: no había lectura. Lo que este test fija de la
 * pantalla que pone las dos piezas en la cara:
 *
 *   1. pinta UNA tarjeta por acuerdo con folio, cuerpo, materia, estado y los
 *      conteos de decisión, con el PESO cuando el cuerpo es la asamblea (ahí el
 *      voto se pondera por prorrateo, no por persona) y con los votos en
 *      unidades cuando el cuerpo es el comité;
 *   2. el resultado que muestra es el que DERIVÓ el servidor (`resultado.motivo`
 *      y sus totales): la pantalla no recomputa la mayoría en el navegador;
 *   3. el detalle de cada voto muestra quién votó, qué decidió, cuánto pesó y
 *      cuándo: el peso es la evidencia, no un adorno;
 *   4. el voto propio se ofrece sólo mientras el acuerdo está `abierto` —uno
 *      resuelto no admite votos y el servidor lo rechaza con 409— y manda
 *      EXCLUSIVAMENTE `{ decision }`: quién puede votar, con qué peso y cuál es
 *      el resultado lo decide el servidor;
 *   5. un 409 de la API se muestra con su texto tal cual y no se declara un
 *      éxito que no ocurrió (ni se relee como si hubiera pasado algo);
 *   6. el alta de un acuerdo manda cuerpo, materia y regla de quórum, con el
 *      nombre legal de cada regla y su ayuda a la vista: la pantalla no inventa
 *      quórums;
 *   7. una comunidad sin acuerdos lo dice explícitamente y un error de lectura
 *      se muestra con el mensaje de la API;
 *   8. el portón de la pantalla es el de la matriz (`gd` ver para entrar, `gd`
 *      crear para el alta), no una lista de roles copiada.
 *
 * Se monta la consola (no el `page.tsx`) porque la página es un server component
 * `async` que espera `auth()` y no se puede montar en jsdom; lo único que decide
 * es el portón y pasar el permiso del alta, así que el caso de permisos se afirma
 * con la matriz real (`alcance.ts`), igual que en `vigencia-registro-pantalla`.
 *
 * El servidor REST es falso vía `vi.stubGlobal("fetch", …)`, el mismo patrón de
 * `test/componentes/vigencia-registro-pantalla.test.tsx`, y `instalarEntornoRadix`
 * es el que usan los tests que abren un `Dialog` de Radix.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { ConsolaAcuerdos } from "@/app/comunidad/directiva/acuerdos/consola-acuerdos"
import {
  puedeRegistrarAcuerdos,
  puedeVerRegistroAcuerdos,
} from "@/app/comunidad/directiva/acuerdos/alcance"

// Mismo piso que el resto de los tests de componentes: los casos que abren un
// diálogo Radix y llenan un formulario rozan los 5 s (el default de Vitest) en
// una máquina cargada.
vi.setConfig({ testTimeout: 60_000 })

const RUTA_LISTA = "/api/acuerdos"
const rutaVoto = (id: string) => `/api/acuerdos/${id}/voto`

const fetchFalso = vi.fn()

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Las llamadas hechas a una ruta, en orden. */
function llamadas(url: string): unknown[][] {
  return fetchFalso.mock.calls.filter((llamada) => String(llamada[0]) === url)
}

/**
 * Las LECTURAS del registro. Se separan de `llamadas` porque el alta usa la misma
 * URL con POST: contar las llamadas por URL a secas mezclaría la relectura con el
 * POST del acuerdo.
 */
function lecturasDelRegistro(): unknown[][] {
  return llamadas(RUTA_LISTA).filter((llamada) => metodoDe(llamada) === "GET")
}

/** El cuerpo JSON de una llamada, o `null` si no viajó cuerpo. */
function cuerpoDe(llamada: unknown[] | undefined): unknown {
  const init = llamada?.[1] as RequestInit | undefined
  return typeof init?.body === "string" ? JSON.parse(init.body) : null
}

function metodoDe(llamada: unknown[] | undefined): string {
  const init = llamada?.[1] as RequestInit | undefined
  return init?.method ?? "GET"
}

/**
 * Dos acuerdos: uno de asamblea ABIERTO (60 derechos a favor y 40 en
 * abstención, el peso extraído del padrón) y uno de comité APROBADO (dos votos
 * de un miembro cada uno). Los números son los que devuelve el servidor; la
 * pantalla no los recalcula.
 */
const FILAS = [
  {
    id: "acu-asm-1",
    folio: "AD-2026-0007",
    cuerpo: "asamblea",
    materia: "Presupuesto 2027 por partidas",
    estado: "abierto",
    quorumRequerido: "mayoria_absoluta_derechos",
    fecha: "2026-11-02T12:00:00.000Z",
    resueltoEn: null,
    actaId: "acta-asamblea-2027",
    derechosTotales: 100,
    resultado: {
      resultado: "pendiente",
      aFavor: 60,
      enContra: 0,
      abstenciones: 40,
      motivo:
        "Mayoría absoluta de los derechos de la comunidad: 60 a favor de 100 derechos de la comunidad; restan 0 derechos por pronunciarse y el resultado todavía puede cambiar.",
    },
    votos: [
      {
        personaId: "per-own-60",
        nombre: "Propietario Sesenta",
        decision: "a_favor",
        peso: 60,
        unidadId: "uni-101",
        fecha: "2026-11-03T12:00:00.000Z",
      },
      {
        personaId: "per-own-40",
        nombre: "Propietario Cuarenta",
        decision: "abstencion",
        peso: 40,
        unidadId: "uni-102",
        fecha: "2026-11-04T12:00:00.000Z",
      },
    ],
  },
  {
    id: "acu-com-1",
    folio: "AD-2026-0003",
    cuerpo: "comite",
    materia: "Corte de servicios de la unidad 102 por tres cuotas impagas",
    estado: "aprobado",
    quorumRequerido: "un_voto_por_miembro",
    fecha: "2026-10-20T12:00:00.000Z",
    resueltoEn: "2026-10-21T12:00:00.000Z",
    actaId: null,
    derechosTotales: 3,
    resultado: {
      resultado: "aprobado",
      aFavor: 2,
      enContra: 0,
      abstenciones: 0,
      motivo:
        "Mayoría absoluta de los votos emitidos por el comité: 2 a favor de 2 votos emitidos; se alcanzó la mayoría exigida.",
    },
    votos: [
      {
        personaId: "per-presidente",
        nombre: "Miembro Uno",
        decision: "a_favor",
        peso: 1,
        unidadId: null,
        fecha: "2026-10-20T13:00:00.000Z",
      },
      {
        personaId: "per-tesorero",
        nombre: "Miembro Dos",
        decision: "a_favor",
        peso: 1,
        unidadId: null,
        fecha: "2026-10-20T14:00:00.000Z",
      },
    ],
  },
]

interface RespuestaFalsa {
  status?: number
  cuerpo: unknown
}

/**
 * Instala el servidor falso: el listado por GET y, si el caso lo declara, lo que
 * responde el POST de una acción. El listado se sirve siempre igual porque lo
 * que se afirma de la relectura es que OCURRIÓ, no que cambió la fila (eso lo
 * decide el servidor de verdad).
 */
function servir(manejadores: {
  filas?: unknown[]
  total?: number
  post?: (url: string, cuerpo: unknown) => RespuestaFalsa
}): void {
  const filas = manejadores.filas ?? FILAS
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      if ((init?.method ?? "GET") === "GET") {
        return respuestaJson({
          data: filas,
          total: manejadores.total ?? filas.length,
          limite: 100,
          mostrados: filas.length,
        })
      }
      const cuerpo = cuerpoDe([entrada, init])
      const respuesta = manejadores.post?.(url, cuerpo)
      if (!respuesta) return respuestaJson({ ok: true }, 201)
      return respuestaJson(respuesta.cuerpo, respuesta.status ?? 201)
    }
  )
}

/** El botón de detalle de UNA tarjeta: el nombre accesible dice de qué acuerdo. */
function verVotos(folio: string): HTMLElement {
  return screen.getByRole("button", {
    name: `Ver votos del acuerdo ${folio}`,
  })
}

beforeEach(() => {
  instalarEntornoRadix()
  vi.stubGlobal("fetch", fetchFalso)
})

afterEach(() => {
  cleanup()
  fetchFalso.mockReset()
  vi.unstubAllGlobals()
})

describe("Registro de acuerdos — la pantalla muestra el registro y el voto va al servidor", () => {
  it("pinta folio, cuerpo, materia, estado, conteos con peso y el resultado derivado", async () => {
    servir({})

    render(<ConsolaAcuerdos puedeRegistrar />)

    // Asamblea: los conteos se leen en DERECHOS, porque el voto se pondera.
    expect(await screen.findByText("AD-2026-0007")).toBeTruthy()
    expect(screen.getByText("Presupuesto 2027 por partidas")).toBeTruthy()
    expect(screen.getByText("Abierto")).toBeTruthy()
    expect(screen.getByText(/^Asamblea ·/)).toBeTruthy()
    expect(
      screen.getByText(
        "A favor: 60 derechos · En contra: 0 derechos · Abstenciones: 40 derechos"
      )
    ).toBeTruthy()
    // El motivo es el del servidor, tal cual: la pantalla no recomputa la mayoría.
    expect(
      screen.getByText(
        /^Mayoría absoluta de los derechos de la comunidad: 60 a favor de 100 derechos/
      )
    ).toBeTruthy()

    // Comité: un voto por miembro, así que los conteos se leen en VOTOS.
    expect(screen.getByText("AD-2026-0003")).toBeTruthy()
    expect(
      screen.getByText(
        "Corte de servicios de la unidad 102 por tres cuotas impagas"
      )
    ).toBeTruthy()
    expect(screen.getByText("Aprobado")).toBeTruthy()
    expect(screen.getByText(/^Comité ·/)).toBeTruthy()
    expect(
      screen.getByText(
        "A favor: 2 votos · En contra: 0 votos · Abstenciones: 0 votos"
      )
    ).toBeTruthy()

    // El total del libro lo informa el servidor (el listado es el tope).
    expect(screen.getByText("Acuerdos registrados: 2")).toBeTruthy()

    // El voto propio sólo se ofrece en el acuerdo ABIERTO: uno resuelto no admite
    // votos (el servidor responde 409) y ofrecer el botón mentiría.
    expect(
      screen.getAllByRole("button", { name: "Votar a favor" })
    ).toHaveLength(1)

    // Una sola lectura, sin parámetros: la comunidad sale del scope del servidor.
    expect(lecturasDelRegistro()).toHaveLength(1)
    expect(metodoDe(lecturasDelRegistro()[0])).toBe("GET")
  })

  it("el detalle muestra cada voto con su decisión, su peso y su fecha", async () => {
    const user = userEvent.setup({ delay: null })
    servir({})

    render(<ConsolaAcuerdos puedeRegistrar />)
    await screen.findByText("AD-2026-0007")

    // Cerrado por defecto: el detalle se pide.
    expect(screen.queryByRole("table")).toBeNull()
    await user.click(verVotos("AD-2026-0007"))

    const tabla = await screen.findByRole("table")
    const sesenta = within(tabla).getByRole("row", {
      name: /Propietario Sesenta/,
    })
    expect(within(sesenta).getByText("A favor")).toBeTruthy()
    // El peso de la unidad (60 de 100 derechos) es la evidencia del voto.
    expect(within(sesenta).getByText("60")).toBeTruthy()
    expect(within(sesenta).getByText("2026-11-03")).toBeTruthy()

    const cuarenta = within(tabla).getByRole("row", {
      name: /Propietario Cuarenta/,
    })
    expect(within(cuarenta).getByText("Abstención")).toBeTruthy()
    expect(within(cuarenta).getByText("40")).toBeTruthy()

    // El otro acuerdo sigue cerrado: el detalle es por acuerdo.
    expect(screen.getAllByRole("table")).toHaveLength(1)
    await user.click(verVotos("AD-2026-0003"))
    expect(
      within(await screen.findByRole("table", { name: /AD-2026-0003/ }))
        .getByRole("row", { name: /Miembro Uno/ })
    ).toBeTruthy()
  })

  it("votar manda SÓLO la decisión a la ruta del acuerdo y vuelve a leer el registro", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      post: () => ({
        cuerpo: {
          ok: true,
          resultado: { resultado: "pendiente", aFavor: 60, enContra: 0 },
        },
      }),
    })

    render(<ConsolaAcuerdos puedeRegistrar />)
    await screen.findByText("AD-2026-0007")

    await user.click(screen.getByRole("button", { name: "Votar a favor" }))

    await waitFor(() =>
      expect(llamadas(rutaVoto("acu-asm-1"))).toHaveLength(1)
    )
    const voto = llamadas(rutaVoto("acu-asm-1"))[0]
    expect(metodoDe(voto)).toBe("POST")
    // El votante, el peso y el acuerdo los resuelve el servidor: el cuerpo es la
    // decisión y nada más.
    expect(cuerpoDe(voto)).toEqual({ decision: "a_favor" })

    // Después del acto la pantalla relee: el estado nuevo lo dice el servidor.
    await waitFor(() => expect(lecturasDelRegistro()).toHaveLength(2))
  })

  it("un 409 del servidor se muestra tal cual y no declara un éxito", async () => {
    const user = userEvent.setup({ delay: null })
    const mensaje =
      "Ya registraste tu voto en este acuerdo: un voto no se repite ni se edita."
    servir({ post: () => ({ status: 409, cuerpo: { error: mensaje } }) })

    render(<ConsolaAcuerdos puedeRegistrar />)
    await screen.findByText("AD-2026-0007")

    await user.click(screen.getByRole("button", { name: "Votar a favor" }))

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe(mensaje)
    // Sin éxito no hay relectura ni mensaje de voto registrado.
    expect(lecturasDelRegistro()).toHaveLength(1)
    expect(screen.queryByText(/voto registrado/i)).toBeNull()
  })

  it("registrar un acuerdo manda cuerpo, materia y regla, con la ayuda legal de cada quórum", async () => {
    const user = userEvent.setup({ delay: null })
    servir({ post: () => ({ cuerpo: { id: "acu-nuevo", folio: "AD-2026-0011" } }) })

    render(<ConsolaAcuerdos puedeRegistrar />)
    await screen.findByText("AD-2026-0007")

    await user.click(screen.getByRole("button", { name: "Nuevo acuerdo" }))
    const dialogo = await screen.findByRole("dialog")

    // El comité sólo admite un voto por miembro (art. 17): la pantalla no ofrece
    // una regla que el servidor va a rechazar, y dice por qué.
    expect(
      within(dialogo).getByRole("radio", { name: "Comité" })
    ).toBeTruthy()
    expect(
      within(dialogo).getByText(/Cada miembro vale un voto/)
    ).toBeTruthy()

    // La asamblea pondera por derechos (art. 15): sus tres reglas con su ayuda.
    await user.click(within(dialogo).getByRole("radio", { name: "Asamblea" }))
    expect(
      within(dialogo).getByText(/más de la mitad de los derechos presentes/i)
    ).toBeTruthy()
    expect(
      within(dialogo).getByText(/más de la mitad de los derechos de toda la comunidad/i)
    ).toBeTruthy()
    expect(
      within(dialogo).getByText(/al menos el 66% de los derechos/i)
    ).toBeTruthy()

    await user.type(
      within(dialogo).getByLabelText("Materia del acuerdo"),
      "Presupuesto 2028 por partidas"
    )
    await user.click(
      within(dialogo).getByRole("radio", {
        name: "Mayoría reforzada de los derechos de la comunidad",
      })
    )
    await user.click(
      within(dialogo).getByRole("button", { name: "Registrar acuerdo" })
    )

    await waitFor(() => expect(lecturasDelRegistro()).toHaveLength(2))
    const alta = fetchFalso.mock.calls.find(
      (llamada) => metodoDe(llamada) === "POST" && String(llamada[0]) === RUTA_LISTA
    )
    expect(alta).toBeDefined()
    // Sólo los tres campos que elige quien registra: folio, fecha, estado y quién
    // lo registra los pone el servidor.
    expect(cuerpoDe(alta)).toEqual({
      cuerpo: "asamblea",
      materia: "Presupuesto 2028 por partidas",
      quorumRequerido: "mayoria_reforzada_derechos",
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("una comunidad sin acuerdos lo dice y no pinta tarjetas falsas", async () => {
    servir({ filas: [], total: 0 })

    render(<ConsolaAcuerdos puedeRegistrar />)

    expect(
      await screen.findByText(/no tiene acuerdos registrados/i)
    ).toBeTruthy()
    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.getByText("Acuerdos registrados: 0")).toBeTruthy()
  })

  it("un error de lectura se muestra con el mensaje de la API", async () => {
    fetchFalso.mockImplementation(async () =>
      respuestaJson({ error: "Permiso denegado." }, 403)
    )

    render(<ConsolaAcuerdos puedeRegistrar />)

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe("Permiso denegado.")
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("sin permiso de registrar no se ofrece el alta (la API igual la valida)", async () => {
    servir({})

    render(<ConsolaAcuerdos puedeRegistrar={false} />)
    await screen.findByText("AD-2026-0007")

    expect(screen.queryByRole("button", { name: "Nuevo acuerdo" })).toBeNull()
  })
})

describe("Registro de acuerdos — el portón es el de la matriz", () => {
  it("administración y comité leen y registran; los demás roles no leen", () => {
    // Las dos claves que piden las rutas: `gd:ver` para la lectura y `gd:crear`
    // para el alta (la misma del registro de actas).
    expect(puedeVerRegistroAcuerdos(["administrador"])).toBe(true)
    expect(puedeVerRegistroAcuerdos(["comite"])).toBe(true)
    expect(puedeRegistrarAcuerdos(["administrador"])).toBe(true)
    expect(puedeRegistrarAcuerdos(["comite"])).toBe(true)

    // El residente NO lee el registro: expone quién votó qué y `gd:ver` lo
    // tendría, así que la lectura exige `editar`. Votar lo decide el servidor por
    // sus vínculos, no esta pantalla.
    expect(puedeVerRegistroAcuerdos(["residente"])).toBe(false)
    expect(puedeRegistrarAcuerdos(["residente"])).toBe(false)

    // Roles sin `gd`: no entran, y el page.tsx les explica por qué.
    expect(puedeVerRegistroAcuerdos(["conserjeria"])).toBe(false)
    expect(puedeVerRegistroAcuerdos(["mantencion"])).toBe(false)
    expect(puedeRegistrarAcuerdos(["conserjeria"])).toBe(false)
    expect(puedeVerRegistroAcuerdos([])).toBe(false)
  })
})
