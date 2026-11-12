// @vitest-environment jsdom
/**
 * Pantalla de convenios de pago (U1 de «saldar-v2-pantallas-y-barrido» · S1 y S2).
 *
 * Las dos rutas de `/api/convenios` existían desde F29 y nadie podía usarlas sin
 * curl. Lo que este test fija de la pantalla que las pone en la cara:
 *
 *   1. pinta el listado con lo que devolvió el servidor —unidad, deudor, monto
 *      total, cuotas, estado y los totales pagado y pendiente que ya calculó la
 *      vista— y despliega las cuotas con número, monto, vencimiento y estado;
 *   2. el pago de una cuota manda EXACTAMENTE `{ convenioId, numero }` a su ruta
 *      y sólo declara el pago cuando el servidor lo confirmó;
 *   3. el alta manda EXACTAMENTE el cuerpo que el esquema del servidor exige
 *      (`unidadId`, `personaId`, `acuerdoId`, `montoTotal`, `numeroCuotas`,
 *      `primeraCuota`, `observaciones`) y muestra la aritmética que el servidor
 *      va a aplicar sin persistir nada: los montos y los vencimientos los
 *      calcula el servidor;
 *   4. el acuerdo del Comité se elige entre los APROBADOS: uno rechazado o de la
 *      asamblea no se ofrece, porque la ruta responde 400;
 *   5. los errores de la API se muestran verbatim —el 400 de la comunidad sin
 *      fondo de gasto común y el 409 del segundo convenio vigente— y la pantalla
 *      no declara un éxito que el servidor no confirmó;
 *   6. una comunidad sin convenios lo dice explícitamente en vez de pintar filas
 *      falsas;
 *   7. el portón es el de la matriz (`fi:cobranza`), no una lista de roles
 *      copiada: `ver` para entrar, `crear` para el alta y `editar` para el pago,
 *      que es exactamente lo que pide cada ruta.
 *
 * Se monta la consola (no el `page.tsx`) porque la página es un server component
 * `async` que espera `auth()` y no se puede montar en jsdom; lo único que decide
 * es el portón y pasar los dos permisos, así que el caso de permisos se afirma
 * con la matriz real (`tienePermiso`), igual que en `vigencia-registro-pantalla`.
 *
 * El servidor REST es falso vía `vi.stubGlobal("fetch", …)`, el mismo patrón de
 * `test/componentes/vigencia-registro-pantalla.test.tsx`; `instalarEntornoRadix()`
 * es el que necesitan los `Select` y el `Dialog` de Radix.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { ConsolaConvenios } from "@/app/admin/gestion/convenios/_componentes/convenios"
import {
  puedeCrearConvenios,
  puedeRegistrarPagoConvenio,
  puedeVerConvenios,
} from "@/app/admin/gestion/convenios/alcance"

// Mismo piso que el resto de los tests de componentes: abrir comboboxes Radix
// roza los 5 s (el default de Vitest) en una máquina cargada.
vi.setConfig({ testTimeout: 60_000 })

const RUTA_ALTA = "/api/convenios"
const RUTA_PAGO = "/api/convenios/pago"
const RUTA_UNIDADES = "/api/unidades"
const RUTA_PERSONAS = "/api/personas"
const RUTA_ACUERDOS = "/api/acuerdos"

const fetchFalso = vi.fn()

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function initDe(llamada: unknown[] | undefined): RequestInit | undefined {
  return llamada?.[1] as RequestInit | undefined
}

/** Las llamadas GET hechas a un prefijo de ruta, en orden. */
function lecturas(prefijo: string): unknown[][] {
  return fetchFalso.mock.calls.filter(
    (llamada) =>
      String(llamada[0]).startsWith(prefijo) &&
      (initDe(llamada)?.method ?? "GET") === "GET"
  )
}

/** Las llamadas POST hechas a una ruta exacta, en orden. */
function posts(url: string): unknown[][] {
  return fetchFalso.mock.calls.filter(
    (llamada) =>
      String(llamada[0]) === url && initDe(llamada)?.method === "POST"
  )
}

/** El cuerpo JSON de una llamada, o `null` si no viajó cuerpo. */
function cuerpoDe(llamada: unknown[] | undefined): unknown {
  const cuerpo = initDe(llamada)?.body
  return typeof cuerpo === "string" ? JSON.parse(cuerpo) : null
}

/** El convenio que devuelve la vista del servidor, con sus tres cuotas. */
const CONVENIO = {
  id: "conv-1",
  unidadId: "uni-101",
  personaId: "per-ana",
  acuerdoId: "acu-1",
  montoTotal: 666666,
  numeroCuotas: 3,
  fechaSuscripcion: "2026-11-12T12:00:00.000Z",
  primeraCuota: 166666,
  estado: "vigente",
  observaciones: "Acordado con la administración en noviembre",
  unidadNumero: "101",
  deudorNombre: "Ana Pérez",
  acuerdoFolio: "AC-2026-014",
  cuotas: [
    {
      numero: 0,
      monto: 166666,
      venceEn: "2026-11-12T12:00:00.000Z",
      estado: "pagada",
      pagadaEn: "2026-11-12T12:00:00.000Z",
      registradaPor: "usr-admin",
    },
    {
      numero: 1,
      monto: 166666.66,
      venceEn: "2026-12-12T12:00:00.000Z",
      estado: "pendiente",
      pagadaEn: null,
      registradaPor: null,
    },
    {
      numero: 2,
      monto: 166666.66,
      venceEn: "2027-01-12T12:00:00.000Z",
      estado: "pendiente",
      pagadaEn: null,
      registradaPor: null,
    },
    {
      numero: 3,
      monto: 166666.68,
      venceEn: "2027-02-12T12:00:00.000Z",
      estado: "pendiente",
      pagadaEn: null,
      registradaPor: null,
    },
  ],
  // Los totales los calcula el servidor sobre las cuotas: la pantalla los pinta.
  totales: { pagado: 166666, pendiente: 500000 },
}

const UNIDADES = [
  { id: "uni-101", numero: "101", etiqueta: "Depto" },
  { id: "uni-102", numero: "102", etiqueta: "Oficina" },
]

const PERSONAS = [
  { id: "per-ana", nombreCompleto: "Ana Pérez", rut: "11.111.111-1" },
  { id: "per-luis", nombreCompleto: "Luis Soto", rut: "22.222.222-2" },
]

const ACUERDOS = [
  {
    id: "acu-1",
    folio: "AC-2026-014",
    cuerpo: "comite",
    materia: "Convenio de pago de la deuda de la unidad 101",
    estado: "aprobado",
  },
  {
    id: "acu-2",
    folio: "AC-2026-015",
    cuerpo: "comite",
    materia: "Convenio de pago rechazado por el Comité",
    estado: "rechazado",
  },
  {
    id: "acu-3",
    folio: "AC-2026-016",
    cuerpo: "asamblea",
    materia: "Convenio aprobado en asamblea, no por el Comité",
    estado: "aprobado",
  },
]

interface PostFalso {
  status?: number
  cuerpo: unknown
}

/**
 * Instala el servidor falso: el listado de convenios y las tres colecciones que
 * necesita el alta, más lo que el caso declare para los POST. El listado se sirve
 * siempre igual: lo que se afirma de la relectura es que OCURRIÓ, no que cambió
 * la fila (eso lo decide el servidor de verdad).
 */
function servir(manejadores: {
  convenios?: unknown[]
  /** Lo que responde el listado cuando el caso prueba una lectura fallida. */
  listado?: PostFalso
  post?: (url: string) => PostFalso
}): void {
  const convenios = manejadores.convenios ?? [CONVENIO]
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      if ((init?.method ?? "GET") === "POST") {
        const post = manejadores.post?.(url)
        if (!post) return respuestaJson({ error: "POST no previsto" }, 500)
        return respuestaJson(post.cuerpo, post.status ?? 200)
      }
      if (url.startsWith(RUTA_PAGO)) {
        return respuestaJson({ error: "El pago se registra por POST." }, 405)
      }
      if (url.startsWith(RUTA_ALTA)) {
        const listado = manejadores.listado
        if (listado) return respuestaJson(listado.cuerpo, listado.status ?? 200)
        return respuestaJson({
          data: convenios,
          total: convenios.length,
          mostrados: convenios.length,
        })
      }
      if (url.startsWith(RUTA_UNIDADES)) {
        return respuestaJson({
          data: UNIDADES,
          page: 1,
          pageSize: 100,
          total: UNIDADES.length,
        })
      }
      if (url.startsWith(RUTA_PERSONAS)) {
        return respuestaJson({
          data: PERSONAS,
          page: 1,
          pageSize: 100,
          total: PERSONAS.length,
        })
      }
      if (url.startsWith(RUTA_ACUERDOS)) {
        return respuestaJson({
          data: ACUERDOS,
          total: ACUERDOS.length,
          limite: 100,
          mostrados: ACUERDOS.length,
        })
      }
      return respuestaJson({ error: "ruta no prevista" }, 500)
    }
  )
}

/** La fila del convenio por el número de su unidad. */
function filaDe(numero: string): HTMLElement {
  return screen.getByRole("row", { name: new RegExp(numero) })
}

/**
 * Elige una opción de un `Select` Radix: el trigger es un `combobox` y las
 * opciones viven en el `listbox` que monta el portal.
 */
async function elegirOpcion(
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  patron: RegExp
): Promise<void> {
  await user.click(trigger)
  const listbox = await screen.findByRole("listbox", {}, { timeout: 5_000 })
  const opcion = within(listbox)
    .getAllByRole("option")
    .find((o) => patron.test(o.textContent ?? ""))
  if (!opcion) throw new Error(`sin opción ${String(patron)}`)
  await user.click(opcion)
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

describe("Convenios de pago — el listado y las cuotas los dice el servidor", () => {
  it("pinta una fila por convenio con los totales de la vista y despliega sus cuotas", async () => {
    const user = userEvent.setup({ delay: null })
    servir({})

    render(<ConsolaConvenios puedeCrear puedeRegistrarPago />)

    const fila = await waitFor(() => filaDe("101"))
    expect(within(fila).getByText("Ana Pérez")).toBeTruthy()
    expect(within(fila).getByText("$666.666")).toBeTruthy()
    expect(within(fila).getByText("3 mensuales")).toBeTruthy()
    expect(within(fila).getByText("Vigente")).toBeTruthy()
    // Pagado y pendiente son los del servidor, no una resta del navegador.
    expect(within(fila).getByText("$166.666")).toBeTruthy()
    expect(within(fila).getByText("$500.000")).toBeTruthy()

    // Las cuotas no se muestran hasta que se piden: la lista queda legible.
    expect(
      screen.queryByRole("region", {
        name: "Cuotas del convenio de la unidad 101",
      })
    ).toBeNull()

    await user.click(
      within(fila).getByRole("button", { name: /Ver cuotas/ })
    )

    const detalle = await screen.findByRole("region", {
      name: "Cuotas del convenio de la unidad 101",
    })
    // La cuota 0 es el pago al suscribir y se lee primero, con su estado.
    expect(within(detalle).getByText("Primera cuota")).toBeTruthy()
    expect(within(detalle).getByText("Cuota 1")).toBeTruthy()
    expect(within(detalle).getByText("Cuota 2")).toBeTruthy()
    expect(within(detalle).getByText("Cuota 3")).toBeTruthy()
    expect(within(detalle).getByText("Pagada")).toBeTruthy()
    expect(within(detalle).getAllByText("Pendiente")).toHaveLength(3)
    expect(within(detalle).getByText("Vence el 2026-12-12")).toBeTruthy()
    expect(within(detalle).getByText("Vence el 2027-02-12")).toBeTruthy()
    // Los montos que la vista calculó, con el centavo que absorbe la última.
    expect(within(detalle).getAllByText("$166.666,66")).toHaveLength(2)
    expect(within(detalle).getByText("$166.666,68")).toBeTruthy()

    // La primera cuota ya está pagada: no ofrece un acto condenado al 409.
    expect(
      within(detalle).queryByRole("button", {
        name: "Registrar pago de la cuota 0",
      })
    ).toBeNull()

    // Una sola lectura del listado.
    expect(lecturas(RUTA_ALTA)).toHaveLength(1)
  })

  it("el pago de una cuota manda convenioId y número, y confirma lo que el servidor aceptó", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      post: (url) =>
        url === RUTA_PAGO
          ? {
              cuerpo: {
                ...CONVENIO,
                totales: { pagado: 333332.66, pendiente: 333333.34 },
                cuotaPagada: 1,
              },
            }
          : { cuerpo: CONVENIO, status: 201 },
    })

    render(<ConsolaConvenios puedeCrear puedeRegistrarPago />)

    const fila = await waitFor(() => filaDe("101"))
    await user.click(within(fila).getByRole("button", { name: /Ver cuotas/ }))
    const detalle = await screen.findByRole("region", {
      name: "Cuotas del convenio de la unidad 101",
    })

    await user.click(
      within(detalle).getByRole("button", {
        name: "Registrar pago de la cuota 1",
      })
    )

    const dialogo = await screen.findByRole("dialog")
    await user.click(
      within(dialogo).getByRole("button", { name: "Registrar pago" })
    )

    await waitFor(() => expect(posts(RUTA_PAGO)).toHaveLength(1))
    // El cuerpo es EXACTAMENTE lo que valida el esquema del servidor.
    expect(cuerpoDe(posts(RUTA_PAGO)[0])).toEqual({
      convenioId: "conv-1",
      numero: 1,
    })

    // El éxito sólo se declara después del 200 del servidor…
    expect(
      await screen.findByText("Pago registrado de la cuota 1.")
    ).toBeTruthy()
    // …y la pantalla relee porque el estado nuevo lo dice el servidor.
    await waitFor(() => expect(lecturas(RUTA_ALTA)).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("sin permiso para registrar pagos no se ofrece el acto", async () => {
    const user = userEvent.setup({ delay: null })
    servir({})

    render(<ConsolaConvenios puedeCrear={false} puedeRegistrarPago={false} />)

    const fila = await waitFor(() => filaDe("101"))
    // El comité audita (`ver`) pero no ejecuta la cobranza: lee y no paga.
    expect(within(fila).getByText("Ana Pérez")).toBeTruthy()
    expect(within(fila).queryByRole("button", { name: /Ver cuotas/ })).toBeTruthy()
    await user.click(within(fila).getByRole("button", { name: /Ver cuotas/ }))
    const detalle = await screen.findByRole("region", {
      name: "Cuotas del convenio de la unidad 101",
    })
    expect(
      within(detalle).queryByRole("button", { name: /Registrar pago de la cuota/ })
    ).toBeNull()
    // Y sin permiso de alta no se pide el catálogo ni se pinta el formulario.
    expect(lecturas(RUTA_UNIDADES)).toHaveLength(0)
    expect(screen.queryByRole("button", { name: "Suscribir convenio" })).toBeNull()
  })

  it("una comunidad sin convenios lo dice y no pinta filas falsas", async () => {
    servir({ convenios: [] })

    render(<ConsolaConvenios puedeCrear puedeRegistrarPago />)

    expect(
      await screen.findByText(/no tiene convenios de pago suscritos/i)
    ).toBeTruthy()
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("un error de lectura se muestra con el mensaje de la API", async () => {
    // Sólo falla el listado: el catálogo del alta se lee bien, así que la única
    // alerta de la pantalla es la de la lectura que el servidor rechazó.
    servir({
      listado: { status: 403, cuerpo: { error: "Permiso denegado." } },
    })

    render(<ConsolaConvenios puedeCrear puedeRegistrarPago />)

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe("Permiso denegado.")
    expect(screen.queryByRole("table")).toBeNull()
  })
})

describe("Convenios de pago — el alta manda los términos y el servidor hace las cuentas", () => {
  it("ofrece la aritmética del servidor y manda el cuerpo exacto del convenio", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      convenios: [],
      post: (url) =>
        url === RUTA_ALTA
          ? { status: 201, cuerpo: CONVENIO }
          : { cuerpo: { error: "POST no previsto" }, status: 500 },
    })

    render(<ConsolaConvenios puedeCrear puedeRegistrarPago={false} />)

    // El formulario está a la vista, pero aún no hay aritmética que mostrar.
    expect(screen.getByText("Nuevo convenio de pago")).toBeTruthy()
    expect(screen.queryByText(/se reparte en .* cuotas mensuales/)).toBeNull()

    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Unidad" }),
      /^101/
    )
    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Deudor" }),
      /^Ana Pérez/
    )

    // Sólo los acuerdos APROBADOS del Comité: el rechazado y el de la asamblea
    // no se ofrecen porque la ruta responde 400.
    await user.click(screen.getByRole("combobox", { name: "Acuerdo del Comité" }))
    const listbox = await screen.findByRole("listbox")
    const folios = within(listbox)
      .getAllByRole("option")
      .map((o) => o.textContent ?? "")
    expect(folios).toEqual(["AC-2026-014 · Convenio de pago de la deuda de la unidad 101"])
    await user.click(
      within(listbox).getByRole("option", { name: /AC-2026-014/ })
    )

    await user.type(screen.getByLabelText("Monto total"), "666666")
    await user.type(screen.getByLabelText("Cuotas mensuales del saldo"), "3")
    await user.type(screen.getByLabelText("Primera cuota"), "166666")

    // La aritmética que el servidor va a aplicar, antes de suscribir: primera
    // cuota + saldo / cuotas, con el centavo que absorbe la última.
    const aritmetica = await screen.findByText(
      /se reparte en 3 cuotas mensuales/
    )
    expect(aritmetica.textContent).toContain("$166.666")
    expect(aritmetica.textContent).toContain("$500.000")
    expect(aritmetica.textContent).toContain("$166.666,66")
    expect(aritmetica.textContent).toContain("$166.666,68")
    // Frontera: la pantalla no promete haber persistido nada.
    expect(
      screen.getByText(/Los montos y los vencimientos los calcula el servidor/)
    ).toBeTruthy()

    await user.type(
      screen.getByLabelText("Observaciones"),
      "Acordado con la administración en noviembre"
    )
    await user.click(screen.getByRole("button", { name: "Suscribir convenio" }))

    await waitFor(() => expect(posts(RUTA_ALTA)).toHaveLength(1))
    // El cuerpo es EXACTAMENTE el del esquema `ConvenioPagoCreacionSchema`.
    expect(cuerpoDe(posts(RUTA_ALTA)[0])).toEqual({
      unidadId: "uni-101",
      personaId: "per-ana",
      acuerdoId: "acu-1",
      montoTotal: 666666,
      numeroCuotas: 3,
      primeraCuota: 166666,
      observaciones: "Acordado con la administración en noviembre",
    })

    // El alta se declara con lo que devolvió el servidor, y la lista se relee.
    expect(
      await screen.findByText(/Convenio conv-1 suscrito con 3 cuota/)
    ).toBeTruthy()
    await waitFor(() => expect(lecturas(RUTA_ALTA)).toHaveLength(2))
  })

  it("el 400 de la comunidad sin fondo de gasto común se muestra verbatim", async () => {
    const user = userEvent.setup({ delay: null })
    const MENSAJE =
      "No se puede suscribir el convenio: la comunidad no tiene un fondo de gasto común activo donde imputar las cuotas."
    servir({
      convenios: [],
      post: () => ({ status: 400, cuerpo: { error: MENSAJE } }),
    })

    render(<ConsolaConvenios puedeCrear puedeRegistrarPago={false} />)
    await completarAlta(user)

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe(MENSAJE)
    // Sin éxito declarado y sin relectura: el convenio NO se suscribió.
    expect(screen.queryByText(/Convenio .* suscrito/)).toBeNull()
    expect(lecturas(RUTA_ALTA)).toHaveLength(1)
  })

  it("el 409 de un segundo convenio vigente en la unidad se muestra verbatim", async () => {
    const user = userEvent.setup({ delay: null })
    const MENSAJE = "La unidad ya tiene un convenio de pago vigente."
    servir({
      convenios: [],
      post: () => ({ status: 409, cuerpo: { error: MENSAJE } }),
    })

    render(<ConsolaConvenios puedeCrear puedeRegistrarPago={false} />)
    await completarAlta(user)

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe(MENSAJE)
    expect(screen.queryByText(/Convenio .* suscrito/)).toBeNull()
    expect(lecturas(RUTA_ALTA)).toHaveLength(1)
  })
})

/** Completa el alta mínima con un acuerdo aprobado del Comité. */
async function completarAlta(
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  await elegirOpcion(
    user,
    screen.getByRole("combobox", { name: "Unidad" }),
    /^101/
  )
  await elegirOpcion(
    user,
    screen.getByRole("combobox", { name: "Deudor" }),
    /^Ana Pérez/
  )
  await elegirOpcion(
    user,
    screen.getByRole("combobox", { name: "Acuerdo del Comité" }),
    /AC-2026-014/
  )
  await user.type(screen.getByLabelText("Monto total"), "666666")
  await user.type(screen.getByLabelText("Cuotas mensuales del saldo"), "3")
  await user.type(screen.getByLabelText("Primera cuota"), "166666")
  await user.click(screen.getByRole("button", { name: "Suscribir convenio" }))
}

describe("Convenios de pago — el portón es el de la matriz", () => {
  it("administración administra los convenios; el comité sólo los audita", () => {
    // Las tres claves que piden las rutas: `ver` para leer (GET), `crear` para el
    // alta (POST) y `editar` para registrar un pago (POST /pago).
    expect(puedeVerConvenios(["administrador"])).toBe(true)
    expect(puedeCrearConvenios(["administrador"])).toBe(true)
    expect(puedeRegistrarPagoConvenio(["administrador"])).toBe(true)

    // El comité AUDITA la cobranza (`fi:cobranza` ver) pero no la ejecuta.
    expect(puedeVerConvenios(["comite"])).toBe(true)
    expect(puedeCrearConvenios(["comite"])).toBe(false)
    expect(puedeRegistrarPagoConvenio(["comite"])).toBe(false)

    // Ni el residente ni conserjería ni mantención alcanzan la clave.
    for (const rol of ["residente", "conserjeria", "mantencion"]) {
      expect(puedeVerConvenios([rol])).toBe(false)
      expect(puedeCrearConvenios([rol])).toBe(false)
      expect(puedeRegistrarPagoConvenio([rol])).toBe(false)
    }
    expect(puedeVerConvenios([])).toBe(false)
  })
})
