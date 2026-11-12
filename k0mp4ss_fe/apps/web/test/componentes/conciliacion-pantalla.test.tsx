// @vitest-environment jsdom
/**
 * Pantalla de conciliación bancaria (U2 de «saldar-v2-pantallas-y-barrido» · S1 y S2).
 *
 * Las tres rutas de `/api/conciliacion` existían desde F30 y nadie podía usarlas
 * sin curl — y, sobre todo, la cola de `no_conciliado` no tenía dónde resolverse,
 * que es la razón de ser del módulo. Lo que este test fija de la pantalla:
 *
 *   1. pinta cada cartola con los contadores que ya calculó el servidor
 *      (`filas`, `conciliadas`, `noConciliadas`) y cada movimiento con su fecha,
 *      descripción, monto, tipo, estado y el enlace que quedó (`cargoReferencia`)
 *      con su origen (automático o a mano): la pantalla no concilia nada;
 *   2. la importación manda EXACTAMENTE `{ nombreArchivo, contenido }` con el
 *      texto que se pegó —no una ruta— y sólo declara el resultado con los
 *      contadores que devolvió el servidor, releyendo el listado después;
 *   3. el 400 de la cartola con filas ilegibles se muestra verbatim, con la lista
 *      de errores por fila TAL CUAL y la constancia explícita de que no se
 *      importó nada: la importación es todo o nada;
 *   4. la cola lista SÓLO los `no_conciliado` —ni los conciliados por la regla ni
 *      los resueltos a mano—, y resolver manda exactamente
 *      `{ movimientoId, cargoReferencia }`; con el 2xx la fila sale de la cola y
 *      los contadores de la cartola pasan a los que informó el servidor;
 *   5. un error de resolución no declara un éxito ni saca la fila: el 409 se pinta
 *      con el texto de la API;
 *   6. una comunidad sin cartolas y una cola vacía lo dicen explícitamente en vez
 *      de pintar filas falsas;
 *   7. el portón es el de la matriz (`fi:cobranza`), no una lista de roles
 *      copiada: `ver` para entrar, `crear` para importar y `editar` para resolver,
 *      que es exactamente lo que exige cada ruta.
 *
 * Se monta la consola (no el `page.tsx`) porque la página es un server component
 * `async` que espera `auth()` y no se puede montar en jsdom; lo único que decide
 * es el portón y pasar los dos permisos, así que el caso de permisos se afirma
 * con la matriz real (`tienePermiso`), igual que en `convenios-pantalla`.
 *
 * El servidor REST es falso vía `vi.stubGlobal("fetch", …)`, el mismo patrón de
 * `test/componentes/convenios-pantalla.test.tsx`.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { ConsolaConciliacion } from "@/app/admin/gestion/conciliacion/_componentes/conciliacion"
import {
  puedeImportarCartola,
  puedeResolverMovimiento,
  puedeVerConciliacion,
} from "@/app/admin/gestion/conciliacion/alcance"

// Mismo piso que el resto de los tests de componentes: en una máquina cargada el
// default de 15 s del config se queda corto con el `userEvent` completo.
vi.setConfig({ testTimeout: 60_000 })

const RUTA_CARTOLAS = "/api/conciliacion"
const RUTA_IMPORTAR = "/api/conciliacion/importar"
const RUTA_RESOLVER = "/api/conciliacion/resolver"

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

/** Un movimiento de la cartola tal como lo devuelve `_vista.ts`. */
const MOV_AUTORRESUELTO = {
  id: "mov-1",
  cartolaId: "cart-1",
  fecha: "2026-11-03",
  descripcion: "Transferencia unidad 101",
  referencia: "AV-2026-0031",
  contraparte: "101",
  monto: 150000,
  tipo: "abono",
  estado: "conciliado",
  origen: "autorresuelto",
  resueltoPor: null,
  resueltoEn: null,
  cargoReferencia: "cobro-1#pago-1",
}

const MOV_EN_COLA_CARGO = {
  id: "mov-2",
  cartolaId: "cart-1",
  fecha: "2026-11-05",
  descripcion: "Pago proveedor ascensores",
  referencia: null,
  contraparte: "Ascensores Andes",
  monto: 89000,
  tipo: "cargo",
  estado: "no_conciliado",
  origen: null,
  resueltoPor: null,
  resueltoEn: null,
  cargoReferencia: null,
}

const MOV_EN_COLA_ABONO = {
  id: "mov-3",
  cartolaId: "cart-1",
  fecha: "2026-11-07",
  descripcion: "Transferencia sin referencia",
  referencia: null,
  contraparte: null,
  monto: 45000,
  tipo: "abono",
  estado: "no_conciliado",
  origen: null,
  resueltoPor: null,
  resueltoEn: null,
  cargoReferencia: null,
}

/** Un movimiento que una persona ya resolvió en una cartola anterior. */
const MOV_MANUAL = {
  id: "mov-0",
  cartolaId: "cart-0",
  fecha: "2026-10-14",
  descripcion: "Pago proveedor de aseo",
  referencia: null,
  contraparte: "Aseo Total",
  monto: 32000,
  tipo: "cargo",
  estado: "resuelto_manual",
  origen: "manual",
  resueltoPor: "usr-admin",
  resueltoEn: "2026-10-15T12:00:00.000Z",
  cargoReferencia: "egr-9",
}

const CARTOLA = {
  id: "cart-1",
  nombreArchivo: "cartola-noviembre-2026.csv",
  importadaPor: "usr-admin",
  filas: 3,
  conciliadas: 1,
  noConciliadas: 2,
  createdAt: "2026-11-12T10:00:00.000Z",
  movimientos: [MOV_AUTORRESUELTO, MOV_EN_COLA_CARGO, MOV_EN_COLA_ABONO],
}

const CARTOLA_ANTERIOR = {
  id: "cart-0",
  nombreArchivo: "cartola-octubre-2026.csv",
  importadaPor: "usr-admin",
  filas: 1,
  conciliadas: 1,
  noConciliadas: 0,
  createdAt: "2026-10-15T10:00:00.000Z",
  movimientos: [MOV_MANUAL],
}

/** El texto que el administrador pega en el textarea: el archivo, no una ruta. */
const CSV = [
  "fecha,descripcion,monto,tipo,referencia,contraparte",
  "2026-11-03,Transferencia unidad 101,150000,abono,AV-2026-0031,101",
  "2026-11-05,Pago proveedor ascensores,89000,cargo,,Ascensores Andes",
  "2026-11-07,Transferencia sin referencia,45000,abono,,",
].join("\n")

interface PostFalso {
  status?: number
  cuerpo: unknown
}

/**
 * Instala el servidor falso: el listado de cartolas con sus movimientos y lo que
 * el caso declare para los POST. El listado se sirve siempre igual: lo que se
 * afirma de la relectura es que OCURRIÓ, no que cambió la fila (eso lo decide el
 * servidor de verdad).
 */
function servir(manejadores: {
  cartolas?: unknown[]
  /** Lo que responde el listado cuando el caso prueba una lectura fallida. */
  listado?: PostFalso
  post?: (url: string) => PostFalso
}): void {
  const cartolas = manejadores.cartolas ?? [CARTOLA, CARTOLA_ANTERIOR]
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      if ((init?.method ?? "GET") === "POST") {
        const post = manejadores.post?.(url)
        if (!post) return respuestaJson({ error: "POST no previsto" }, 500)
        return respuestaJson(post.cuerpo, post.status ?? 200)
      }
      if (url.startsWith(RUTA_IMPORTAR) || url.startsWith(RUTA_RESOLVER)) {
        return respuestaJson({ error: "Estas rutas se usan por POST." }, 405)
      }
      if (url.startsWith(RUTA_CARTOLAS)) {
        const listado = manejadores.listado
        if (listado) return respuestaJson(listado.cuerpo, listado.status ?? 200)
        return respuestaJson({
          data: cartolas,
          total: cartolas.length,
          mostrados: cartolas.length,
        })
      }
      return respuestaJson({ error: "ruta no prevista" }, 500)
    }
  )
}

/** Completa el formulario de importación con el texto pegado y lo envía. */
async function importar(
  user: ReturnType<typeof userEvent.setup>,
  nombreArchivo = "cartola-noviembre-2026.csv"
): Promise<void> {
  await user.type(screen.getByLabelText("Nombre del archivo"), nombreArchivo)
  await user.type(screen.getByLabelText("Contenido de la cartola (CSV)"), CSV)
  await user.click(screen.getByRole("button", { name: "Importar cartola" }))
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

describe("Conciliación — las cartolas y sus movimientos los dice el servidor", () => {
  it("pinta cada cartola con sus contadores y cada movimiento con su enlace", async () => {
    servir({})

    render(<ConsolaConciliacion puedeImportar puedeResolver />)

    const region = await screen.findByRole("region", {
      name: "Cartola cartola-noviembre-2026.csv",
    })
    // Los contadores son los de la vista, no una cuenta del navegador.
    expect(within(region).getByText("3 fila(s)")).toBeTruthy()
    expect(within(region).getByText("1 conciliada(s)")).toBeTruthy()
    expect(within(region).getByText("2 en la cola")).toBeTruthy()

    const filaConciliada = within(region).getByRole("row", {
      name: /Transferencia unidad 101/,
    })
    expect(within(filaConciliada).getByText("2026-11-03")).toBeTruthy()
    expect(within(filaConciliada).getByText("$150.000")).toBeTruthy()
    expect(within(filaConciliada).getByText("Abono")).toBeTruthy()
    expect(within(filaConciliada).getByText("Conciliado")).toBeTruthy()
    // El enlace que guardó el servidor, con su origen y la referencia.
    expect(
      within(filaConciliada).getByText("Enlazado automáticamente")
    ).toBeTruthy()
    expect(within(filaConciliada).getByText("cobro-1#pago-1")).toBeTruthy()

    const filaEnCola = within(region).getByRole("row", {
      name: /Pago proveedor ascensores/,
    })
    expect(within(filaEnCola).getByText("2026-11-05")).toBeTruthy()
    expect(within(filaEnCola).getByText("$89.000")).toBeTruthy()
    expect(within(filaEnCola).getByText("Cargo")).toBeTruthy()
    expect(within(filaEnCola).getByText("No conciliado")).toBeTruthy()
    expect(
      within(filaEnCola).getByText("En la cola de conciliación")
    ).toBeTruthy()

    // La cartola anterior muestra un movimiento resuelto a mano con su autor.
    const anterior = await screen.findByRole("region", {
      name: "Cartola cartola-octubre-2026.csv",
    })
    const filaManual = within(anterior).getByRole("row", {
      name: /Pago proveedor de aseo/,
    })
    expect(within(filaManual).getByText("Resuelto a mano")).toBeTruthy()
    expect(
      within(filaManual).getByText("Resuelto a mano por usr-admin")
    ).toBeTruthy()
    expect(within(filaManual).getByText("egr-9")).toBeTruthy()

    // Una sola lectura del listado.
    expect(lecturas(RUTA_CARTOLAS)).toHaveLength(1)
  })

  it("una comunidad sin cartolas y una cola vacía lo dicen explícitamente", async () => {
    servir({ cartolas: [] })

    render(<ConsolaConciliacion puedeImportar puedeResolver />)

    expect(
      await screen.findByText("La comunidad todavía no importó ninguna cartola.")
    ).toBeTruthy()
    expect(
      screen.getByText("La cola está vacía: no hay movimientos sin conciliar.")
    ).toBeTruthy()
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("un error de lectura se muestra con el mensaje de la API", async () => {
    servir({
      listado: { status: 403, cuerpo: { error: "Permiso denegado." } },
    })

    render(<ConsolaConciliacion puedeImportar puedeResolver />)

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe("Permiso denegado.")
    expect(
      screen.queryByRole("table", { name: "Cola de no conciliados" })
    ).toBeNull()
  })
})

describe("Conciliación — la importación manda el texto y el servidor decide", () => {
  it("manda nombreArchivo y el contenido pegado, y declara los contadores del 201", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      post: (url) =>
        url === RUTA_IMPORTAR
          ? {
              status: 201,
              cuerpo: { importados: 3, conciliados: 1, noConciliados: 2 },
            }
          : { cuerpo: { error: "POST no previsto" }, status: 500 },
    })

    render(<ConsolaConciliacion puedeImportar puedeResolver />)
    await screen.findByRole("region", {
      name: "Cartola cartola-noviembre-2026.csv",
    })

    await importar(user)

    await waitFor(() => expect(posts(RUTA_IMPORTAR)).toHaveLength(1))
    // El cuerpo es EXACTAMENTE el esquema del servidor: el texto de la cartola,
    // no una ruta ni un nombre de archivo inventado.
    expect(cuerpoDe(posts(RUTA_IMPORTAR)[0])).toEqual({
      nombreArchivo: "cartola-noviembre-2026.csv",
      contenido: CSV,
    })

    // El resultado se declara con los números que devolvió el servidor…
    expect(
      await screen.findByText(
        /Cartola importada: 3 movimiento\(s\), 1 conciliado\(s\) automáticamente y 2 en la cola de conciliación/
      )
    ).toBeTruthy()
    // …y la pantalla relee porque las filas nuevas las dice el servidor.
    await waitFor(() => expect(lecturas(RUTA_CARTOLAS)).toHaveLength(2))
  })

  it("el 400 de la cartola con filas ilegibles se muestra verbatim y con la lista por fila", async () => {
    const user = userEvent.setup({ delay: null })
    const MENSAJE =
      "La cartola tiene filas inválidas: no se importó ningún movimiento."
    const ERROR_MONTO = "fila 3: el monto «abc» no es un número válido."
    const ERROR_DESCRIPCION = "fila 5: la descripción es obligatoria."
    servir({
      post: () => ({
        status: 400,
        cuerpo: { error: MENSAJE, errores: [ERROR_MONTO, ERROR_DESCRIPCION] },
      }),
    })

    render(<ConsolaConciliacion puedeImportar puedeResolver />)
    await screen.findByRole("region", {
      name: "Cartola cartola-noviembre-2026.csv",
    })

    await importar(user)

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe(MENSAJE)
    // Los errores por fila, tal cual los escribió el servidor: son lo único que
    // le dice al administrador qué corregir del archivo del banco.
    expect(screen.getByText(ERROR_MONTO)).toBeTruthy()
    expect(screen.getByText(ERROR_DESCRIPCION)).toBeTruthy()
    // Y la constancia explícita de que la cartola no entró a medias.
    expect(
      screen.getByText("No se importó nada: la cartola entra completa o no entra.")
    ).toBeTruthy()

    // Sin éxito declarado y sin relectura: nada se importó.
    expect(screen.queryByText(/Cartola importada:/)).toBeNull()
    expect(lecturas(RUTA_CARTOLAS)).toHaveLength(1)
  })

  it("no envía una cartola vacía y no declara nada antes de la respuesta", async () => {
    servir({})

    render(<ConsolaConciliacion puedeImportar puedeResolver />)
    await screen.findByRole("region", {
      name: "Cartola cartola-noviembre-2026.csv",
    })

    expect(
      screen.getByRole("button", { name: "Importar cartola" }).hasAttribute(
        "disabled"
      )
    ).toBe(true)
    expect(posts(RUTA_IMPORTAR)).toHaveLength(0)
  })
})

describe("Conciliación — la cola de no conciliados es donde se resuelve", () => {
  it("lista sólo los no_conciliado, sin los conciliados ni los resueltos a mano", async () => {
    servir({})

    render(<ConsolaConciliacion puedeImportar puedeResolver />)

    const cola = await screen.findByRole("table", {
      name: "Cola de no conciliados",
    })
    expect(
      within(cola).getByRole("row", { name: /Pago proveedor ascensores/ })
    ).toBeTruthy()
    expect(
      within(cola).getByRole("row", { name: /Transferencia sin referencia/ })
    ).toBeTruthy()
    // El conciliado por la regla y el resuelto a mano YA no están en la cola.
    expect(
      within(cola).queryByRole("row", { name: /Transferencia unidad 101/ })
    ).toBeNull()
    expect(
      within(cola).queryByRole("row", { name: /Pago proveedor de aseo/ })
    ).toBeNull()

    const fila = within(cola).getByRole("row", {
      name: /Pago proveedor ascensores/,
    })
    // El contexto de la fila: de qué cartola salió y de qué tipo es.
    expect(within(fila).getByText("Cargo")).toBeTruthy()
    expect(within(fila).getByText("$89.000")).toBeTruthy()
    expect(within(fila).getByText("2026-11-05")).toBeTruthy()
    expect(within(fila).getByText("cartola-noviembre-2026.csv")).toBeTruthy()
  })

  it("resolver manda el cuerpo exacto, saca la fila de la cola y toma los contadores del servidor", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      post: (url) =>
        url === RUTA_RESOLVER
          ? {
              cuerpo: {
                movimiento: {
                  ...MOV_EN_COLA_CARGO,
                  estado: "resuelto_manual",
                  origen: "manual",
                  resueltoPor: "usr-admin",
                  resueltoEn: "2026-11-12T11:00:00.000Z",
                  cargoReferencia: "egr-77",
                },
                cartola: {
                  id: "cart-1",
                  filas: 3,
                  conciliadas: 2,
                  noConciliadas: 1,
                },
              },
            }
          : { cuerpo: { error: "POST no previsto" }, status: 500 },
    })

    render(<ConsolaConciliacion puedeImportar puedeResolver />)

    const cola = await screen.findByRole("table", {
      name: "Cola de no conciliados",
    })
    const fila = within(cola).getByRole("row", {
      name: /Pago proveedor ascensores/,
    })
    await user.type(
      within(fila).getByLabelText("Referencia del cargo"),
      "egr-77"
    )
    await user.click(within(fila).getByRole("button", { name: "Resolver" }))

    await waitFor(() => expect(posts(RUTA_RESOLVER)).toHaveLength(1))
    // EXACTAMENTE el esquema de la ruta: el movimiento y la referencia escrita.
    expect(cuerpoDe(posts(RUTA_RESOLVER)[0])).toEqual({
      movimientoId: "mov-2",
      cargoReferencia: "egr-77",
    })

    // El 200 confirma la resolución: la fila sale de la cola…
    await waitFor(() =>
      expect(
        within(cola).queryByRole("row", { name: /Pago proveedor ascensores/ })
      ).toBeNull()
    )
    // …y se declara con lo que devolvió el servidor.
    expect(
      await screen.findByText(
        /quedó conciliado contra la referencia egr-77/
      )
    ).toBeTruthy()

    // Los contadores de la cartola pasan a los que informó la respuesta: la
    // pantalla no suma ni resta por su cuenta.
    const region = screen.getByRole("region", {
      name: "Cartola cartola-noviembre-2026.csv",
    })
    expect(within(region).getByText("2 conciliada(s)")).toBeTruthy()
    expect(within(region).getByText("1 en la cola")).toBeTruthy()
    // Y la fila de la cartola quedó como resuelta, con su referencia.
    const filaConciliada = within(region).getByRole("row", {
      name: /Pago proveedor ascensores/,
    })
    expect(within(filaConciliada).getByText("Resuelto a mano")).toBeTruthy()
    expect(within(filaConciliada).getByText("egr-77")).toBeTruthy()

    // No hubo relectura: el estado nuevo vino en la respuesta.
    expect(lecturas(RUTA_CARTOLAS)).toHaveLength(1)
  })

  it("el 409 de un movimiento que ya dejó la cola se muestra verbatim y no saca la fila", async () => {
    const user = userEvent.setup({ delay: null })
    const MENSAJE = "El movimiento ya está conciliado."
    servir({
      post: () => ({ status: 409, cuerpo: { error: MENSAJE } }),
    })

    render(<ConsolaConciliacion puedeImportar puedeResolver />)

    const cola = await screen.findByRole("table", {
      name: "Cola de no conciliados",
    })
    const fila = within(cola).getByRole("row", {
      name: /Pago proveedor ascensores/,
    })
    await user.type(
      within(fila).getByLabelText("Referencia del cargo"),
      "egr-77"
    )
    await user.click(within(fila).getByRole("button", { name: "Resolver" }))

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe(MENSAJE)
    // La fila sigue en la cola y los contadores no se movieron: no se declaró un
    // acto que el servidor rechazó.
    expect(
      within(cola).getByRole("row", { name: /Pago proveedor ascensores/ })
    ).toBeTruthy()
    const region = screen.getByRole("region", {
      name: "Cartola cartola-noviembre-2026.csv",
    })
    expect(within(region).getByText("1 conciliada(s)")).toBeTruthy()
    expect(screen.queryByText(/quedó conciliado contra la referencia/)).toBeNull()
  })
})

describe("Conciliación — el portón es el de la matriz", () => {
  it("administración importa y resuelve; el comité sólo audita", () => {
    // Las tres claves que piden las rutas: `ver` para leer (GET), `crear` para
    // importar (POST /importar) y `editar` para resolver (POST /resolver).
    expect(puedeVerConciliacion(["administrador"])).toBe(true)
    expect(puedeImportarCartola(["administrador"])).toBe(true)
    expect(puedeResolverMovimiento(["administrador"])).toBe(true)

    // El comité AUDITA la cobranza (`fi:cobranza` ver) pero no la ejecuta.
    expect(puedeVerConciliacion(["comite"])).toBe(true)
    expect(puedeImportarCartola(["comite"])).toBe(false)
    expect(puedeResolverMovimiento(["comite"])).toBe(false)

    // Ni el residente ni conserjería ni mantención alcanzan la clave.
    for (const rol of ["residente", "conserjeria", "mantencion"]) {
      expect(puedeVerConciliacion([rol])).toBe(false)
      expect(puedeImportarCartola([rol])).toBe(false)
      expect(puedeResolverMovimiento([rol])).toBe(false)
    }
    expect(puedeVerConciliacion([])).toBe(false)
  })

  it("sin permiso de resolver la cola se lee pero no se ofrece el acto", async () => {
    servir({})

    render(<ConsolaConciliacion puedeImportar={false} puedeResolver={false} />)

    // El comité entra, lee las cartolas y la cola…
    await screen.findByRole("region", {
      name: "Cartola cartola-noviembre-2026.csv",
    })
    const cola = screen.getByRole("table", {
      name: "Cola de no conciliados",
    })
    expect(
      within(cola).getByRole("row", { name: /Pago proveedor ascensores/ })
    ).toBeTruthy()

    // …pero no importa ni resuelve: ni el formulario ni los botones condenados
    // al 403.
    expect(screen.queryByText("Importar la cartola del banco")).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Importar cartola" })
    ).toBeNull()
    expect(screen.queryByRole("button", { name: "Resolver" })).toBeNull()
    expect(
      screen.getByText(/Tu rol puede ver la cola pero no resolverla/)
    ).toBeTruthy()
  })
})
