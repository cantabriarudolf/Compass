// @vitest-environment jsdom
/**
 * Pantalla del reparto de gasto por sector (U4 de «saldar-v2-pantallas-y-barrido» ·
 * S1 y S2 · F32).
 *
 * `GET` y `POST /api/repartos-sector` existen desde F32 —el reglamento manda que el
 * gasto de un bien o servicio que sirve a UN solo sector se cargue sólo a ese
 * sector, en proporción al avalúo fiscal de sus unidades— y nadie podía emitir uno
 * sin curl. Lo que este test fija de la pantalla que les pone la cara:
 *
 *   1. pinta cada reparto con lo que devolvió el servidor —sector, período,
 *      concepto, monto total y cuántas unidades entraron— y despliega sus cuotas
 *      con el número de unidad, el `avaluoUsado` CONGELADO y el monto;
 *   2. pinta, por reparto, la lista de unidades que quedaron FUERA porque no tenían
 *      avalúo fiscal declarado, con su número, y dice que no pagan su parte ni se
 *      las compensa. La lista es el SNAPSHOT congelado al emitir —la devuelve el
 *      servidor desde la fila del reparto—: no se deduce acá de `cuotas` ni del
 *      padrón de hoy, porque una unidad dada de alta después no existía cuando el
 *      reparto se emitió y mostrarla como excluida sería falso. Si la lista llega
 *      vacía, la pantalla dice que todas las unidades del sector tenían avalúo;
 *   3. el alta manda EXACTAMENTE `{ microSectorId, periodo, concepto, montoTotal }`:
 *      el avalúo de cada unidad lo LEE el servidor de la base y las cuotas, el
 *      avalúo total y el estado los escribe él;
 *   4. antes de emitir, la pantalla dice que el reparto es proporcional al avalúo y
 *      que la unidad sin avalúo no paga: el usuario tiene que saber que el dinero
 *      no se divide en partes iguales;
 *   5. el 400 del sector sin ninguna unidad con avalúo declarado se muestra
 *      verbatim y sin declarar éxito ni releer la lista: no se creó nada;
 *   6. una comunidad sin repartos lo dice explícitamente en vez de pintar filas
 *      falsas;
 *   7. el portón es el de la matriz (`fi:gasto_comun`), no una lista de roles
 *      copiada: `ver` para entrar y `crear` para emitir, que es exactamente lo que
 *      exige cada ruta.
 *
 * Se monta la consola (no el `page.tsx`) porque la página es un server component
 * `async` que espera `auth()` y no se puede montar en jsdom; lo único que decide es
 * el portón y pasar el permiso, así que el caso de permisos se afirma con la matriz
 * real (`tienePermiso`), igual que `presupuestos-pantalla`,
 * `convenios-pantalla` y `conciliacion-pantalla`.
 *
 * El servidor REST es falso vía `vi.stubGlobal("fetch", …)`, el mismo patrón de
 * `test/componentes/presupuestos-pantalla.test.tsx`.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { ConsolaRepartosSector } from "@/app/admin/gestion/repartos-sector/_componentes/repartos-sector"
import {
  puedeCrearRepartosSector,
  puedeVerRepartosSector,
} from "@/app/admin/gestion/repartos-sector/alcance"

// Mismo piso que el resto de los tests de componentes: abrir comboboxes Radix
// roza los 5 s (el default de Vitest) en una máquina cargada.
vi.setConfig({ testTimeout: 60_000 })

const RUTA_REPARTOS = "/api/repartos-sector"
const RUTA_SECTORES = "/api/micro-sectores"

/**
 * El 400 de la ruta cuando ninguna unidad del sector tiene avalúo declarado
 * (`app/api/repartos-sector/route.ts`): la pantalla lo pinta tal cual, así que el
 * texto del test es el de la ruta, no una paráfrasis.
 */
const MENSAJE_SIN_AVALUO =
  "No se puede emitir el reparto: el sector no tiene unidades con avalúo fiscal declarado, y sin avalúo no se reparte entre las unidades del sector."

/** El aviso que la pantalla declara ANTES de emitir. */
const AVISO_PROPORCIONAL =
  /El gasto se reparte entre las unidades del sector EN PROPORCIÓN A SU AVALÚO FISCAL: no se divide en partes iguales\./

/** El aviso que acompaña a la lista de unidades excluidas del reparto. */
const AVISO_EXCLUIDAS =
  /Quedaron fuera del reparto porque no tienen avalúo fiscal declarado/

/** Lo que la pantalla pide hacer con las unidades que no pagaron. */
const AVISO_COMO_RESOLVER =
  /Cargá el avalúo fiscal en la ficha de cada unidad y emití un reparto nuevo/

/** El cierre del caso sin excluidas: no se pinta una caja vacía. */
const AVISO_SIN_EXCLUIDAS =
  "Todas las unidades del sector tenían avalúo fiscal declarado al emitir: ninguna quedó fuera del reparto."

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

/**
 * Un reparto tal como lo devuelve `app/api/repartos-sector/_vista.ts`: el sector,
 * el período, el concepto, los dos totales PERSISTIDOS y las cuotas ordenadas por
 * monto descendente, con el avalúo que se usó al emitir.
 */
const REPARTO_ASCENSOR = {
  id: "rse-1",
  microSectorId: "mic-1",
  microSectorNombre: "Torre A · Ascensores",
  periodo: "2026-03",
  concepto: "Mantención del ascensor de la Torre A",
  montoTotal: 100000,
  avaluoTotal: 8000000,
  estado: "emitido",
  creadoPor: "usr-admin",
  createdAt: "2026-03-05T12:00:00.000Z",
  cuotas: [
    {
      id: "cru-1",
      unidadId: "uni-101",
      unidadNumero: "101",
      avaluoUsado: 5000000,
      monto: 62500,
    },
    {
      id: "cru-2",
      unidadId: "uni-102",
      unidadNumero: "102",
      avaluoUsado: 3000000,
      monto: 37500,
    },
  ],
  // La unidad 103 no tenía avalúo declarado al emitir: el servidor la congeló
  // como excluida y ese snapshot es lo que la pantalla pinta.
  unidadesExcluidas: [{ unidadId: "uni-103", unidadNumero: "103" }],
}

/**
 * El segundo reparto: otro sector, otro período y una cuota cuya unidad ya no
 * existe (`unidadNumero: null`). El monto tiene centavos porque el reparto opera
 * en centavos enteros y la pantalla no redondea lo que el servidor congeló.
 */
const REPARTO_JARDIN = {
  id: "rse-2",
  microSectorId: "mic-2",
  microSectorNombre: "Torre B · Jardines",
  periodo: "2026-02",
  concepto: "Reposición de la bomba de riego",
  montoTotal: 45000.5,
  avaluoTotal: 6000000,
  estado: "emitido",
  creadoPor: "usr-comite",
  createdAt: "2026-02-11T12:00:00.000Z",
  cuotas: [
    {
      id: "cru-3",
      unidadId: "uni-201",
      unidadNumero: "201",
      avaluoUsado: 6000000,
      monto: 30000.5,
    },
    {
      id: "cru-4",
      unidadId: "uni-202",
      unidadNumero: null,
      avaluoUsado: 4000000,
      monto: 15000,
    },
  ],
  // Todas las unidades del sector tenían avalúo declarado: lista vacía, no ausente.
  unidadesExcluidas: [],
}

/** Los sectores de la comunidad, lo mínimo para elegir dónde se carga el gasto. */
const SECTORES = [
  {
    id: "mic-1",
    macroSectorId: "mac-1",
    nombre: "Torre A · Ascensores",
    etiqueta: "Sub-sector",
  },
  {
    id: "mic-2",
    macroSectorId: "mac-2",
    nombre: "Torre B · Jardines",
    etiqueta: "Sub-sector",
  },
]

interface RespuestaFalsa {
  status?: number
  cuerpo: unknown
}

/**
 * Instala el servidor falso: el listado de repartos y los sectores que necesita el
 * alta, más lo que el caso declare para el POST. El listado se sirve siempre igual:
 * lo que se afirma de la relectura es que OCURRIÓ, no que cambió la fila (eso lo
 * decide el servidor de verdad).
 */
function servir(manejadores: {
  repartos?: unknown[]
  /** Lo que responde el listado cuando el caso prueba una lectura fallida. */
  listado?: RespuestaFalsa
  /** Lo que responde la colección de sectores cuando el caso prueba su 403. */
  sectores?: RespuestaFalsa
  post?: () => RespuestaFalsa
}): void {
  const repartos = manejadores.repartos ?? [REPARTO_ASCENSOR, REPARTO_JARDIN]
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      if ((init?.method ?? "GET") === "POST") {
        const post = manejadores.post?.()
        if (!post) return respuestaJson({ error: "POST no previsto" }, 500)
        return respuestaJson(post.cuerpo, post.status ?? 200)
      }
      if (url.startsWith(RUTA_SECTORES)) {
        const sectores = manejadores.sectores
        if (sectores) {
          return respuestaJson(sectores.cuerpo, sectores.status ?? 200)
        }
        return respuestaJson({
          data: SECTORES,
          page: 1,
          pageSize: 100,
          total: SECTORES.length,
        })
      }
      if (url.startsWith(RUTA_REPARTOS)) {
        const listado = manejadores.listado
        if (listado) return respuestaJson(listado.cuerpo, listado.status ?? 200)
        return respuestaJson({
          data: repartos,
          total: repartos.length,
          mostrados: repartos.length,
        })
      }
      return respuestaJson({ error: "ruta no prevista" }, 500)
    }
  )
}

/** La fila del reparto por su sector (la primera celda de la tabla). */
function filaDelSector(sector: string): HTMLElement {
  return screen.getByRole("row", { name: new RegExp(`^${sector}`) })
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

/** Completa el alta mínima: el sector al que se carga el gasto y sus datos. */
async function completarAlta(
  user: ReturnType<typeof userEvent.setup>,
  opciones: {
    sector?: RegExp
    periodo?: string
    concepto?: string
    monto?: string
  } = {}
): Promise<void> {
  await elegirOpcion(
    user,
    screen.getByRole("combobox", { name: "Sector" }),
    opciones.sector ?? /Torre A · Ascensores/
  )
  await user.type(
    screen.getByLabelText("Período (AAAA-MM)"),
    opciones.periodo ?? "2026-04"
  )
  await user.type(
    screen.getByLabelText("Concepto"),
    opciones.concepto ?? "Reparación de la bomba del jardín"
  )
  await user.type(
    screen.getByLabelText("Monto total a repartir"),
    opciones.monto ?? "250000"
  )
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

describe("Reparto por sector — los repartos y sus cuotas los dice el servidor", () => {
  it("pinta sector, período, concepto, monto total y las cuotas con su avalúo usado", async () => {
    const user = userEvent.setup({ delay: null })
    servir({})

    render(<ConsolaRepartosSector puedeCrear={false} />)

    const fila = await waitFor(() => filaDelSector("Torre A · Ascensores"))
    expect(within(fila).getByText("2026-03")).toBeTruthy()
    expect(
      within(fila).getByText("Mantención del ascensor de la Torre A")
    ).toBeTruthy()
    expect(within(fila).getByText("$100.000")).toBeTruthy()
    // Cuántas unidades entraron al reparto: el dato sale de las cuotas, no de una
    // cuenta del navegador sobre el padrón.
    expect(within(fila).getByText("2 unidades")).toBeTruthy()

    // Las cuotas no se muestran hasta que se piden: la lista queda legible.
    expect(
      screen.queryByRole("region", {
        name: "Cuotas del reparto de Torre A · Ascensores 2026-03",
      })
    ).toBeNull()

    await user.click(within(fila).getByRole("button", { name: "Ver cuotas" }))

    const detalle = await screen.findByRole("region", {
      name: "Cuotas del reparto de Torre A · Ascensores 2026-03",
    })
    // Cada cuota: la unidad, el avalúo CONGELADO con el que se calculó y el monto.
    expect(within(detalle).getByText("Unidad 101")).toBeTruthy()
    expect(within(detalle).getByText("Avalúo usado 5.000.000")).toBeTruthy()
    expect(within(detalle).getByText("$62.500")).toBeTruthy()
    expect(within(detalle).getByText("Unidad 102")).toBeTruthy()
    expect(within(detalle).getByText("Avalúo usado 3.000.000")).toBeTruthy()
    expect(within(detalle).getByText("$37.500")).toBeTruthy()
    expect(
      within(detalle).getByText(
        "Entraron 2 unidades al reparto (avalúo total congelado al emitir: 8.000.000)."
      )
    ).toBeTruthy()

    // El punto de la pantalla: qué unidades quedaron afuera y por qué. La lista
    // viene del snapshot que congeló el servidor al emitir.
    expect(within(detalle).getByText(AVISO_EXCLUIDAS)).toBeTruthy()
    expect(within(detalle).getByText("Unidad 103")).toBeTruthy()
    expect(within(detalle).getByText(AVISO_COMO_RESOLVER)).toBeTruthy()

    // El otro reparto se pinta con su propio sector y período, y su cuota sin
    // número de unidad no se inventa.
    const otro = await waitFor(() => filaDelSector("Torre B · Jardines"))
    expect(within(otro).getByText("2026-02")).toBeTruthy()
    await user.click(within(otro).getByRole("button", { name: "Ver cuotas" }))
    const detalleOtro = await screen.findByRole("region", {
      name: "Cuotas del reparto de Torre B · Jardines 2026-02",
    })
    expect(within(detalleOtro).getByText("Unidad 201")).toBeTruthy()
    expect(within(detalleOtro).getByText("Unidad sin número")).toBeTruthy()
    // Sin excluidas no se pinta una caja vacía: se dice que todas tenían avalúo.
    expect(within(detalleOtro).getByText(AVISO_SIN_EXCLUIDAS)).toBeTruthy()
    expect(within(detalleOtro).queryByText(AVISO_EXCLUIDAS)).toBeNull()

    // Una sola lectura del listado.
    expect(lecturas(RUTA_REPARTOS)).toHaveLength(1)
  })

  it("una comunidad sin repartos lo dice y no pinta filas falsas", async () => {
    servir({ repartos: [] })

    render(<ConsolaRepartosSector puedeCrear={false} />)

    expect(
      await screen.findByText(
        "La comunidad todavía no emitió ningún reparto por sector."
      )
    ).toBeTruthy()
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("un error de lectura se muestra con el mensaje de la API", async () => {
    servir({
      listado: { status: 403, cuerpo: { error: "Permiso denegado." } },
    })

    render(<ConsolaRepartosSector puedeCrear={false} />)

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe("Permiso denegado.")
    expect(screen.queryByRole("table")).toBeNull()
  })
})

describe("Reparto por sector — el alta manda el sector, el período, el concepto y el monto", () => {
  it("avisa que el reparto es proporcional al avalúo y manda el cuerpo exacto", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      repartos: [],
      post: () => ({
        status: 201,
        cuerpo: {
          ...REPARTO_ASCENSOR,
          id: "rse-9",
          periodo: "2026-04",
          concepto: "Reparación de la bomba del jardín",
          montoTotal: 250000,
        },
      }),
    })

    render(<ConsolaRepartosSector puedeCrear />)
    await screen.findByText(
      "La comunidad todavía no emitió ningún reparto por sector."
    )

    // Antes de emitir, la pantalla dice que el reparto no es en partes iguales y
    // que la unidad sin avalúo no paga.
    expect(screen.getByText(AVISO_PROPORCIONAL)).toBeTruthy()

    await completarAlta(user)

    // El aviso sigue en pantalla con el formulario completo: no es un texto de
    // bienvenida que desaparece al escribir.
    expect(screen.getByText(AVISO_PROPORCIONAL)).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Emitir reparto" }))

    await waitFor(() => expect(posts(RUTA_REPARTOS)).toHaveLength(1))
    // EXACTAMENTE el cuerpo de `RepartoSectorCreacionSchema`: sin `avaluoTotal`,
    // sin `cuotas`, sin `estado` y sin el avalúo de ninguna unidad — el avalúo se
    // LEE de la base, y si el cliente pudiera mandarlo, movería la carga de una
    // unidad a otra.
    expect(cuerpoDe(posts(RUTA_REPARTOS)[0])).toEqual({
      microSectorId: "mic-1",
      periodo: "2026-04",
      concepto: "Reparación de la bomba del jardín",
      montoTotal: 250000,
    })

    // El alta se declara con lo que devolvió el servidor, y la lista se relee.
    expect(
      await screen.findByText(
        "Reparto de Torre A · Ascensores para 2026-04 emitido por $250.000 entre 2 unidades con avalúo fiscal declarado."
      )
    ).toBeTruthy()
    await waitFor(() => expect(lecturas(RUTA_REPARTOS)).toHaveLength(2))
  })

  it("el 400 del sector sin ninguna unidad con avalúo se muestra verbatim y no crea nada", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      repartos: [],
      post: () => ({ status: 400, cuerpo: { error: MENSAJE_SIN_AVALUO } }),
    })

    render(<ConsolaRepartosSector puedeCrear />)
    await screen.findByText(
      "La comunidad todavía no emitió ningún reparto por sector."
    )

    await completarAlta(user)
    await user.click(screen.getByRole("button", { name: "Emitir reparto" }))

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe(MENSAJE_SIN_AVALUO)

    // Sin éxito declarado y sin relectura: el reparto NO se emitió.
    expect(screen.queryByText(/emitido por/)).toBeNull()
    expect(lecturas(RUTA_REPARTOS)).toHaveLength(1)
    // El formulario conserva lo escrito: nada se registró y nada se limpia.
    expect(
      (screen.getByLabelText("Concepto") as HTMLInputElement).value
    ).toBe("Reparación de la bomba del jardín")
  })

  it("si la colección de sectores responde 403 se lee tal cual y no se ofrece un sector inventado", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      repartos: [],
      sectores: { status: 403, cuerpo: { error: "Permiso denegado." } },
    })

    render(<ConsolaRepartosSector puedeCrear />)

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Permiso denegado."
    )
    // Sin lista de sectores no se puede elegir ninguno: el botón queda inhabilitado
    // en vez de mandar un `microSectorId` inventado.
    const emitir = await screen.findByRole("button", { name: "Emitir reparto" })
    expect((emitir as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole("combobox", { name: "Sector" }))
    const listbox = await screen.findByRole("listbox")
    expect(within(listbox).queryAllByRole("option")).toHaveLength(0)
  })
})

describe("Reparto por sector — el portón es el de la matriz", () => {
  it("administración emite; el comité sólo lee el reparto", () => {
    // Las dos claves que piden las rutas: `ver` para leer (GET) y `crear` para
    // emitir (POST), ambas sobre `fi:gasto_comun`.
    expect(puedeVerRepartosSector(["administrador"])).toBe(true)
    expect(puedeCrearRepartosSector(["administrador"])).toBe(true)

    // El comité FISCALIZA lo que se cobra (`fi:gasto_comun` ver) pero no emite: la
    // clave del comité no declara `crear`.
    expect(puedeVerRepartosSector(["comite"])).toBe(true)
    expect(puedeCrearRepartosSector(["comite"])).toBe(false)

    // Ni el residente ni conserjería ni mantención alcanzan la clave.
    for (const rol of ["residente", "conserjeria", "mantencion"]) {
      expect(puedeVerRepartosSector([rol])).toBe(false)
      expect(puedeCrearRepartosSector([rol])).toBe(false)
    }
    expect(puedeVerRepartosSector([])).toBe(false)
  })

  it("sin permiso de emisión se leen los repartos y no se ofrece el formulario", async () => {
    servir({})

    render(<ConsolaRepartosSector puedeCrear={false} />)

    // El comité entra y lee los repartos…
    const fila = await waitFor(() => filaDelSector("Torre A · Ascensores"))
    expect(within(fila).getByText("$100.000")).toBeTruthy()

    // …pero no se le pide la colección de sectores ni se le pinta un alta condenada
    // al 403.
    expect(lecturas(RUTA_SECTORES)).toHaveLength(0)
    expect(screen.queryByText("Emitir un reparto por sector")).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Emitir reparto" })
    ).toBeNull()
  })
})
