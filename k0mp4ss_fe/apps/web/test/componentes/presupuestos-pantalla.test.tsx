// @vitest-environment jsdom
/**
 * Pantalla del presupuesto por partidas (U3 de «saldar-v2-pantallas-y-barrido» · S1 y S2).
 *
 * `GET` y `POST /api/presupuestos` existen desde F31 y nadie podía aprobar un
 * presupuesto anual sin curl. Lo que este test fija de la pantalla que las pone
 * en la cara:
 *
 *   1. pinta cada versión con lo que devolvió el servidor —período, cuerpo
 *      (copiado del acuerdo), versión, estado, total y el folio del acuerdo— y
 *      despliega sus partidas con nombre, categoría y monto;
 *   2. el alta manda EXACTAMENTE `{ periodo, acuerdoId, partidas: [{ nombre,
 *      categoria, monto }] }`: el cuerpo del presupuesto, la versión, el estado,
 *      el total y el `orden` de cada partida los decide el servidor y no viajan;
 *   3. sólo se ofrecen acuerdos APROBADOS de comité o asamblea, y el cuerpo que
 *      aprobará el presupuesto se muestra como DATO copiado del acuerdo —no hay
 *      ningún control para elegirlo—;
 *   4. la suma de las partidas se muestra mientras se escribe y se declara como
 *      vista previa; cuando el total del servidor no coincide con esa suma, el
 *      número que queda es el del servidor y la pantalla lo dice;
 *   5. antes de registrar, un período que ya tiene un vigente avisa que el alta
 *      lo REEMPLAZA con la versión siguiente y nombra cuál reemplaza;
 *   6. los errores de la API se muestran verbatim: el 400 del acuerdo no
 *      aprobado, y el 400 de «Datos inválidos» con los motivos por campo que la
 *      ruta devuelve en `detalles` (partidas vacías y monto negativo). La
 *      pantalla no adelanta esas reglas: las deja decir al servidor;
 *   7. una comunidad sin presupuestos lo dice explícitamente en vez de pintar
 *      filas falsas;
 *   8. el portón es el de la matriz (`fi:gasto_comun`), no una lista de roles
 *      copiada: `ver` para entrar y `crear` para el alta, que es exactamente lo
 *      que exige cada ruta.
 *
 * Se monta la consola (no el `page.tsx`) porque la página es un server component
 * `async` que espera `auth()` y no se puede montar en jsdom; lo único que decide
 * es el portón y pasar el permiso, así que el caso de permisos se afirma con la
 * matriz real (`tienePermiso`), igual que `convenios-pantalla` y
 * `conciliacion-pantalla`.
 *
 * El servidor REST es falso vía `vi.stubGlobal("fetch", …)`, el mismo patrón de
 * `test/componentes/conciliacion-pantalla.test.tsx`.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { ConsolaPresupuestos } from "@/app/admin/gestion/presupuestos/_componentes/presupuestos"
import {
  puedeCrearPresupuestos,
  puedeVerPresupuestos,
} from "@/app/admin/gestion/presupuestos/alcance"

// Mismo piso que el resto de los tests de componentes: abrir comboboxes Radix
// roza los 5 s (el default de Vitest) en una máquina cargada.
vi.setConfig({ testTimeout: 60_000 })

const RUTA_PRESUPUESTOS = "/api/presupuestos"
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

/** La vista de un presupuesto tal como la devuelve `app/api/presupuestos/_vista.ts`. */
const PRESUPUESTO_2026 = {
  id: "pre-2026-1",
  periodo: "2026",
  cuerpo: "comite",
  acuerdoId: "acu-1",
  version: 1,
  estado: "vigente",
  total: 1200000,
  creadoPor: "usr-admin",
  createdAt: "2026-01-15T12:00:00.000Z",
  acuerdoFolio: "AD-2026-001",
  partidas: [
    {
      id: "par-1",
      nombre: "Remuneración de conserjería",
      categoria: "sueldos",
      monto: 900000,
      orden: 1,
    },
    {
      id: "par-2",
      nombre: "Mantención de ascensores",
      categoria: "mantencion",
      monto: 300000,
      orden: 2,
    },
  ],
}

/** La versión anterior del mismo módulo, ya reemplazada: conserva su historia. */
const PRESUPUESTO_2025 = {
  id: "pre-2025-1",
  periodo: "2025",
  cuerpo: "asamblea",
  acuerdoId: "acu-0",
  version: 1,
  estado: "reemplazado",
  total: 1050000,
  creadoPor: "usr-admin",
  createdAt: "2025-01-10T12:00:00.000Z",
  acuerdoFolio: "AD-2025-004",
  partidas: [
    {
      id: "par-0a",
      nombre: "Seguridad de la comunidad",
      categoria: "servicios",
      monto: 1050000,
      orden: 1,
    },
  ],
}

/** El libro de acuerdos: dos aprobados (comité y asamblea) y dos que no habilitan. */
const ACUERDOS = [
  {
    id: "acu-1",
    folio: "AD-2026-001",
    cuerpo: "comite",
    materia: "Presupuesto anual de gastos comunes 2026",
    estado: "aprobado",
  },
  {
    id: "acu-9",
    folio: "AD-2026-009",
    cuerpo: "asamblea",
    materia: "Presupuesto aprobado en asamblea",
    estado: "aprobado",
  },
  {
    id: "acu-2",
    folio: "AD-2026-002",
    cuerpo: "comite",
    materia: "Presupuesto rechazado por el Comité",
    estado: "rechazado",
  },
  {
    id: "acu-3",
    folio: "AD-2026-003",
    cuerpo: "comite",
    materia: "Presupuesto que todavía está abierto",
    estado: "abierto",
  },
]

interface RespuestaFalsa {
  status?: number
  cuerpo: unknown
}

/**
 * Instala el servidor falso: el listado de presupuestos y el libro de acuerdos
 * que necesita el alta, más lo que el caso declare para el POST. El listado se
 * sirve siempre igual: lo que se afirma de la relectura es que OCURRIÓ, no que
 * cambió la fila (eso lo decide el servidor de verdad).
 */
function servir(manejadores: {
  presupuestos?: unknown[]
  /** Lo que responde el listado cuando el caso prueba una lectura fallida. */
  listado?: RespuestaFalsa
  /** Lo que responde el libro de acuerdos cuando el caso prueba su 403. */
  acuerdos?: RespuestaFalsa
  post?: () => RespuestaFalsa
}): void {
  const presupuestos = manejadores.presupuestos ?? [
    PRESUPUESTO_2026,
    PRESUPUESTO_2025,
  ]
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      if ((init?.method ?? "GET") === "POST") {
        const post = manejadores.post?.()
        if (!post) return respuestaJson({ error: "POST no previsto" }, 500)
        return respuestaJson(post.cuerpo, post.status ?? 200)
      }
      if (url.startsWith(RUTA_ACUERDOS)) {
        const acuerdos = manejadores.acuerdos
        if (acuerdos) {
          return respuestaJson(acuerdos.cuerpo, acuerdos.status ?? 200)
        }
        return respuestaJson({
          data: ACUERDOS,
          total: ACUERDOS.length,
          limite: 100,
          mostrados: ACUERDOS.length,
        })
      }
      if (url.startsWith(RUTA_PRESUPUESTOS)) {
        const listado = manejadores.listado
        if (listado) return respuestaJson(listado.cuerpo, listado.status ?? 200)
        return respuestaJson({
          data: presupuestos,
          total: presupuestos.length,
          mostrados: presupuestos.length,
        })
      }
      return respuestaJson({ error: "ruta no prevista" }, 500)
    }
  )
}

/** La fila del presupuesto por su período (la primera celda de la tabla). */
function filaDe(periodo: string): HTMLElement {
  return screen.getByRole("row", { name: new RegExp(`^${periodo}`) })
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

/** Completa el alta mínima: el acuerdo aprobado del comité y el período. */
async function completarAlta(
  user: ReturnType<typeof userEvent.setup>,
  periodo = "2027"
): Promise<void> {
  await elegirOpcion(
    user,
    screen.getByRole("combobox", { name: "Acuerdo aprobado" }),
    /AD-2026-001/
  )
  await user.type(screen.getByLabelText("Período (AAAA)"), periodo)
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

describe("Presupuesto por partidas — las versiones y el desglose los dice el servidor", () => {
  it("pinta período, cuerpo copiado, versión, estado, total y las partidas", async () => {
    const user = userEvent.setup({ delay: null })
    servir({})

    render(<ConsolaPresupuestos puedeCrear={false} />)

    const fila = await waitFor(() => filaDe("2026"))
    expect(within(fila).getByText("Comité")).toBeTruthy()
    expect(within(fila).getByText("Versión 1")).toBeTruthy()
    expect(within(fila).getByText("Vigente")).toBeTruthy()
    expect(within(fila).getByText("$1.200.000")).toBeTruthy()
    // El folio del acuerdo que lo aprueba es lo que lo hace auditable.
    expect(within(fila).getByText("Aprobado por AD-2026-001")).toBeTruthy()

    // Las partidas no se muestran hasta que se piden: la lista queda legible.
    expect(
      screen.queryByRole("region", {
        name: "Partidas del presupuesto 2026 versión 1",
      })
    ).toBeNull()

    await user.click(
      within(fila).getByRole("button", { name: "Ver partidas" })
    )

    const detalle = await screen.findByRole("region", {
      name: "Partidas del presupuesto 2026 versión 1",
    })
    expect(within(detalle).getByText("Remuneración de conserjería")).toBeTruthy()
    expect(within(detalle).getByText("Sueldos")).toBeTruthy()
    expect(within(detalle).getByText("$900.000")).toBeTruthy()
    expect(within(detalle).getByText("Mantención de ascensores")).toBeTruthy()
    expect(within(detalle).getByText("Mantención")).toBeTruthy()
    expect(within(detalle).getByText("$300.000")).toBeTruthy()
    // El total del desglose es el snapshot persistido, no una suma del navegador.
    expect(
      within(detalle).getByText("Total congelado al registrar: $1.200.000")
    ).toBeTruthy()

    // La versión anterior conserva su estado y su cuerpo.
    const anterior = await waitFor(() => filaDe("2025"))
    expect(within(anterior).getByText("Asamblea")).toBeTruthy()
    expect(within(anterior).getByText("Reemplazado")).toBeTruthy()
    expect(within(anterior).getByText("Aprobado por AD-2025-004")).toBeTruthy()

    // Una sola lectura del listado.
    expect(lecturas(RUTA_PRESUPUESTOS)).toHaveLength(1)
  })

  it("una comunidad sin presupuestos lo dice y no pinta filas falsas", async () => {
    servir({ presupuestos: [] })

    render(<ConsolaPresupuestos puedeCrear />)

    expect(
      await screen.findByText(
        "La comunidad todavía no registró ningún presupuesto por partidas."
      )
    ).toBeTruthy()
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("un error de lectura se muestra con el mensaje de la API", async () => {
    servir({
      listado: { status: 403, cuerpo: { error: "Permiso denegado." } },
    })

    render(<ConsolaPresupuestos puedeCrear={false} />)

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe("Permiso denegado.")
    expect(screen.queryByRole("table")).toBeNull()
  })
})

describe("Presupuesto por partidas — el alta manda el período, el acuerdo y las partidas", () => {
  it("ofrece sólo acuerdos aprobados, copia su cuerpo y manda el cuerpo exacto", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      presupuestos: [],
      post: () => ({
        status: 201,
        cuerpo: {
          ...PRESUPUESTO_2026,
          id: "pre-2027-1",
          periodo: "2027",
          cuerpo: "asamblea",
          acuerdoId: "acu-9",
          acuerdoFolio: "AD-2026-009",
          total: 1020000,
          partidas: [],
        },
      }),
    })

    render(<ConsolaPresupuestos puedeCrear />)

    expect(
      await screen.findByText(
        "La comunidad todavía no registró ningún presupuesto por partidas."
      )
    ).toBeTruthy()
    expect(screen.getByText("Nuevo presupuesto por partidas")).toBeTruthy()

    // Sólo los acuerdos APROBADOS: el rechazado y el que sigue abierto no se
    // ofrecen porque la ruta responde 400. El cuerpo viaja como dato del acuerdo.
    await user.click(screen.getByRole("combobox", { name: "Acuerdo aprobado" }))
    const listbox = await screen.findByRole("listbox")
    const opciones = within(listbox)
      .getAllByRole("option")
      .map((o) => o.textContent ?? "")
    expect(opciones).toEqual([
      "AD-2026-001 · Presupuesto anual de gastos comunes 2026 · Comité",
      "AD-2026-009 · Presupuesto aprobado en asamblea · Asamblea",
    ])
    await user.click(
      within(listbox).getByRole("option", { name: /AD-2026-009/ })
    )

    // El cuerpo que aprobará el presupuesto se LEE del acuerdo: no hay control
    // para elegirlo, y la pantalla lo dice con el acuerdo que se eligió.
    expect(
      await screen.findByText(
        "Cuerpo que el servidor copiará del acuerdo: Asamblea."
      )
    ).toBeTruthy()
    expect(
      screen.queryByRole("combobox", { name: /Cuerpo del presupuesto/i })
    ).toBeNull()

    await user.type(screen.getByLabelText("Período (AAAA)"), "2027")

    await user.type(
      screen.getByLabelText("Nombre de la partida 1"),
      "Remuneración de conserjería"
    )
    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Categoría de la partida 1" }),
      /^Sueldos$/
    )
    await user.type(screen.getByLabelText("Monto de la partida 1"), "900000")

    await user.click(screen.getByRole("button", { name: "Agregar partida" }))
    await user.type(
      screen.getByLabelText("Nombre de la partida 2"),
      "Mantención de ascensores"
    )
    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Categoría de la partida 2" }),
      /^Mantención$/
    )
    await user.type(screen.getByLabelText("Monto de la partida 2"), "120000")

    await user.click(
      screen.getByRole("button", { name: "Registrar presupuesto" })
    )

    await waitFor(() => expect(posts(RUTA_PRESUPUESTOS)).toHaveLength(1))
    // EXACTAMENTE el cuerpo de `PresupuestoCreacionSchema`: sin `cuerpo`, sin
    // `version`, sin `total` y sin `orden` — todo eso lo escribe el servidor.
    expect(cuerpoDe(posts(RUTA_PRESUPUESTOS)[0])).toEqual({
      periodo: "2027",
      acuerdoId: "acu-9",
      partidas: [
        {
          nombre: "Remuneración de conserjería",
          categoria: "sueldos",
          monto: 900000,
        },
        {
          nombre: "Mantención de ascensores",
          categoria: "mantencion",
          monto: 120000,
        },
      ],
    })

    // El alta se declara con lo que devolvió el servidor, y la lista se relee.
    expect(
      await screen.findByText(
        "Presupuesto 2027 versión 1 registrado por $1.020.000."
      )
    ).toBeTruthy()
    await waitFor(() => expect(lecturas(RUTA_PRESUPUESTOS)).toHaveLength(2))
  })

  it("la suma se muestra mientras se escribe y el total del servidor es el que queda", async () => {
    const user = userEvent.setup({ delay: null })
    // El servidor devuelve un total distinto de la suma previa (acento perdido en
    // el camino): el número registrado es el suyo, no el del navegador.
    servir({
      presupuestos: [],
      post: () => ({
        status: 201,
        cuerpo: {
          ...PRESUPUESTO_2026,
          id: "pre-2027-1",
          periodo: "2027",
          total: 350001,
          version: 1,
        },
      }),
    })

    render(<ConsolaPresupuestos puedeCrear />)
    await screen.findByText(
      "La comunidad todavía no registró ningún presupuesto por partidas."
    )

    // La vista previa arranca en cero y se actualiza con lo que se escribe.
    expect(screen.getByText("Suma de las partidas: $0")).toBeTruthy()

    await completarAlta(user)

    await user.type(
      screen.getByLabelText("Nombre de la partida 1"),
      "Seguridad"
    )
    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Categoría de la partida 1" }),
      /^Servicios$/
    )
    await user.type(screen.getByLabelText("Monto de la partida 1"), "100000")
    expect(await screen.findByText("Suma de las partidas: $100.000")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Agregar partida" }))
    await user.type(
      screen.getByLabelText("Nombre de la partida 2"),
      "Aseo"
    )
    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Categoría de la partida 2" }),
      /^Servicios$/
    )
    await user.type(screen.getByLabelText("Monto de la partida 2"), "250000")
    expect(await screen.findByText("Suma de las partidas: $350.000")).toBeTruthy()

    // La pantalla no promete haber persistido esa suma.
    expect(
      screen.getByText(
        "El servidor calcula y congela el total al registrar: esta suma es sólo una vista previa."
      )
    ).toBeTruthy()

    await user.click(
      screen.getByRole("button", { name: "Registrar presupuesto" })
    )

    // El éxito declara el total DEL SERVIDOR y avisa que la suma previa no se
    // persistió: la diferencia se ve, no se esconde.
    expect(
      await screen.findByText(
        /Presupuesto 2027 versión 1 registrado por \$350\.001\./
      )
    ).toBeTruthy()
    expect(
      screen.getByText(/la suma previa de la pantalla era \$350\.000/)
    ).toBeTruthy()
  })

  it("avisa que el alta reemplaza al vigente del período y dice cuál reemplaza", async () => {
    const user = userEvent.setup({ delay: null })
    servir({})

    render(<ConsolaPresupuestos puedeCrear />)
    await waitFor(() => filaDe("2026"))

    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Acuerdo aprobado" }),
      /AD-2026-001/
    )

    // El período que ya tiene un vigente avisa ANTES de registrar, con la
    // versión y el total del que va a quedar reemplazado.
    await user.type(screen.getByLabelText("Período (AAAA)"), "2026")
    expect(
      await screen.findByText(
        "El período 2026 ya tiene un presupuesto vigente (versión 1, $1.200.000): registrarlo de nuevo lo REEMPLAZA y el servidor le asigna la versión 2."
      )
    ).toBeTruthy()

    // El 2025 sólo tiene una versión reemplazada: no hay nada vigente que avisar.
    await user.clear(screen.getByLabelText("Período (AAAA)"))
    await user.type(screen.getByLabelText("Período (AAAA)"), "2025")
    await waitFor(() =>
      expect(
        screen.queryByText(/ya tiene un presupuesto vigente/)
      ).toBeNull()
    )

    // Un período nuevo tampoco avisa nada.
    await user.clear(screen.getByLabelText("Período (AAAA)"))
    await user.type(screen.getByLabelText("Período (AAAA)"), "2028")
    expect(screen.queryByText(/ya tiene un presupuesto vigente/)).toBeNull()
  })
})

describe("Presupuesto por partidas — los errores de la API se muestran verbatim", () => {
  it("el 400 del acuerdo que no está aprobado se muestra tal cual", async () => {
    const user = userEvent.setup({ delay: null })
    const MENSAJE = "No se puede crear el presupuesto: el acuerdo no está aprobado."
    // El acuerdo estaba aprobado cuando se leyó el libro y dejó de estarlo antes
    // del alta: el servidor es la autoridad y su 400 se pinta sin reescribir.
    servir({
      presupuestos: [],
      post: () => ({ status: 400, cuerpo: { error: MENSAJE } }),
    })

    render(<ConsolaPresupuestos puedeCrear />)
    await screen.findByText(
      "La comunidad todavía no registró ningún presupuesto por partidas."
    )

    await completarAlta(user)
    await user.type(
      screen.getByLabelText("Nombre de la partida 1"),
      "Remuneración de conserjería"
    )
    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Categoría de la partida 1" }),
      /^Sueldos$/
    )
    await user.type(screen.getByLabelText("Monto de la partida 1"), "900000")
    await user.click(
      screen.getByRole("button", { name: "Registrar presupuesto" })
    )

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe(MENSAJE)
    // Sin éxito declarado y sin relectura: el presupuesto NO se registró.
    expect(screen.queryByText(/registrado por/)).toBeNull()
    expect(lecturas(RUTA_PRESUPUESTOS)).toHaveLength(1)
  })

  it("el 400 de las partidas vacías manda la lista vacía y muestra el motivo del servidor", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      presupuestos: [],
      post: () => ({
        status: 400,
        cuerpo: {
          error: "Datos inválidos.",
          detalles: {
            formErrors: [],
            fieldErrors: {
              partidas: ["El presupuesto debe tener al menos una partida."],
            },
          },
        },
      }),
    })

    render(<ConsolaPresupuestos puedeCrear />)
    await screen.findByText(
      "La comunidad todavía no registró ningún presupuesto por partidas."
    )

    await completarAlta(user)
    // Quitar la única fila deja el alta sin partidas: la pantalla NO decide que
    // eso es inválido, lo manda y el servidor contesta con su motivo.
    await user.click(screen.getByRole("button", { name: "Quitar partida 1" }))
    expect(
      screen.getByText(
        "No hay partidas cargadas: el alta viaja con la lista vacía y el servidor dice qué falta."
      )
    ).toBeTruthy()

    await user.click(
      screen.getByRole("button", { name: "Registrar presupuesto" })
    )

    await waitFor(() => expect(posts(RUTA_PRESUPUESTOS)).toHaveLength(1))
    expect(cuerpoDe(posts(RUTA_PRESUPUESTOS)[0])).toEqual({
      periodo: "2027",
      acuerdoId: "acu-1",
      partidas: [],
    })

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe("Datos inválidos.")
    // El motivo por campo es el que escribió la ruta: se pinta sin traducirlo.
    expect(
      screen.getByText(/El presupuesto debe tener al menos una partida\./)
    ).toBeTruthy()
    expect(lecturas(RUTA_PRESUPUESTOS)).toHaveLength(1)
  })

  it("el monto negativo viaja y el 400 del servidor se muestra verbatim", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      presupuestos: [],
      post: () => ({
        status: 400,
        cuerpo: {
          error: "Datos inválidos.",
          detalles: {
            formErrors: [],
            fieldErrors: {
              "partidas.0.monto": [
                "El monto de la partida no puede ser negativo.",
              ],
            },
          },
        },
      }),
    })

    render(<ConsolaPresupuestos puedeCrear />)
    await screen.findByText(
      "La comunidad todavía no registró ningún presupuesto por partidas."
    )

    await completarAlta(user)
    await user.type(
      screen.getByLabelText("Nombre de la partida 1"),
      "Seguridad"
    )
    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Categoría de la partida 1" }),
      /^Servicios$/
    )
    await user.type(screen.getByLabelText("Monto de la partida 1"), "-5000")
    await user.click(
      screen.getByRole("button", { name: "Registrar presupuesto" })
    )

    await waitFor(() => expect(posts(RUTA_PRESUPUESTOS)).toHaveLength(1))
    // La regla del dinero es del servidor: la pantalla manda el monto tal cual y
    // no lo bloquea por su cuenta.
    expect(cuerpoDe(posts(RUTA_PRESUPUESTOS)[0])).toEqual({
      periodo: "2027",
      acuerdoId: "acu-1",
      partidas: [{ nombre: "Seguridad", categoria: "servicios", monto: -5000 }],
    })

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe("Datos inválidos.")
    expect(
      screen.getByText(/El monto de la partida no puede ser negativo\./)
    ).toBeTruthy()
    expect(lecturas(RUTA_PRESUPUESTOS)).toHaveLength(1)
  })
})

describe("Presupuesto por partidas — el portón es el de la matriz", () => {
  it("administración registra; el comité sólo audita el presupuesto", () => {
    // Las dos claves que piden las rutas: `ver` para leer (GET) y `crear` para
    // el alta (POST), ambas sobre `fi:gasto_comun`.
    expect(puedeVerPresupuestos(["administrador"])).toBe(true)
    expect(puedeCrearPresupuestos(["administrador"])).toBe(true)

    // El comité LEE el presupuesto (`fi:gasto_comun` ver) pero no lo registra:
    // la clave del comité no declara `crear`.
    expect(puedeVerPresupuestos(["comite"])).toBe(true)
    expect(puedeCrearPresupuestos(["comite"])).toBe(false)

    // Ni el residente ni conserjería ni mantención alcanzan la clave.
    for (const rol of ["residente", "conserjeria", "mantencion"]) {
      expect(puedeVerPresupuestos([rol])).toBe(false)
      expect(puedeCrearPresupuestos([rol])).toBe(false)
    }
    expect(puedeVerPresupuestos([])).toBe(false)
  })

  it("sin permiso de alta se lee el presupuesto y no se ofrece el formulario", async () => {
    servir({})

    render(<ConsolaPresupuestos puedeCrear={false} />)

    // El comité entra y lee las versiones…
    const fila = await waitFor(() => filaDe("2026"))
    expect(within(fila).getByText("Vigente")).toBeTruthy()

    // …pero no se le pide el libro de acuerdos ni se le pinta un alta condenada
    // al 403.
    expect(lecturas(RUTA_ACUERDOS)).toHaveLength(0)
    expect(screen.queryByText("Nuevo presupuesto por partidas")).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Registrar presupuesto" })
    ).toBeNull()
  })
})
