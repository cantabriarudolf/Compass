// @vitest-environment jsdom
/**
 * F29 · T2b — la constancia de entrega del papel firmado, en la fila.
 *
 * La constancia del papel firmado del convenio vive en el servidor
 * (`EnvioDocumento`): la pantalla la PINTA, nunca la adivina. Lo que este
 * archivo fija de esa fila:
 *
 *   1. el chip de estado —`pendiente` / `entregado` / `fallido`— y el motivo,
 *      con el texto TAL CUAL que devolvió el servidor, sin traducirlo;
 *   2. el botón de reenvío se ofrece SOLO donde la ruta lo admite (`pendiente` y
 *      `fallido`): sobre `entregado` la ruta responde 409 y un botón condenado
 *      miente sobre el estado;
 *   3. después del reenvío, el estado nuevo lo dice el servidor: si respondió
 *      `fallido`, la fila muestra `fallido` y su motivo —la pantalla NUNCA pinta
 *      `entregado` porque el click se cursó bien—, y la colección se relee
 *      (la vista del listado es la única fuente);
 *   4. un convenio SIN papel archivado lo dice con su propio texto, no con un
 *      chip vacío ni un «—» ambiguo;
 *   5. el portón es el de la matriz: sin `fi:cobranza` editar no hay reenvío,
 *      igual que no hay pago ni anulación.
 *
 * Se monta la consola (no el `page.tsx` server component) y el servidor REST es
 * falso vía `vi.stubGlobal("fetch", …)`, el mismo patrón de
 * `test/componentes/convenios-pantalla.test.tsx`.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { ConsolaConvenios } from "@/app/admin/gestion/convenios/_componentes/convenios"

vi.setConfig({ testTimeout: 60_000 })

const RUTA_LISTADO = "/api/convenios"
const RUTA_REENVIO = "/api/convenios/documento/reenviar"

/**
 * Motivos EXACTOS que el servidor devuelve. La constancia nace con su motivo,
 * la aceptación dice el id del mensaje y el rebote deja el error del SMTP.
 */
const MOTIVO_NACIMIENTO =
  "El convenio firmado quedó archivado, pero su entrega al deudor todavía no se cursó por ningún canal: la constancia queda pendiente hasta que exista un envío real. El estado `entregado` sólo se registra si el servidor de correo aceptó el mensaje."
const MOTIVO_FALLO_PRIMERO =
  "Falló el envío por SMTP: 550 5.1.1 Buzón inexistente del servidor de correo de prueba."
const MOTIVO_FALLO_SEGUNDO =
  "Falló el envío por SMTP: 535 5.7.8 Autenticación rechazada del servidor de correo de prueba."
const MOTIVO_ACEPTACION =
  "Aceptado por el servidor SMTP (id test-constancia-0002)."
/** El 409 literal de la ruta cuando la constancia ya está entregada. */
const MENSAJE_YA_ENTREGADO =
  "La constancia de entrega del convenio ya figura como entregado: el servidor de correo aceptó el mensaje y el reenvío no se cursa de nuevo."

/** El texto PROPIO de la fila sin papel archivado (no un chip ni un «—»). */
const TEXTO_SIN_PAPEL = "Sin papel firmado archivado."

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

function lecturas(ruta: string): unknown[][] {
  return fetchFalso.mock.calls.filter((llamada) => {
    if ((initDe(llamada)?.method ?? "GET") !== "GET") return false
    try {
      return new URL(String(llamada[0]), "http://localhost").pathname === ruta
    } catch {
      return false
    }
  })
}

function posts(url: string): unknown[][] {
  return fetchFalso.mock.calls.filter(
    (llamada) => String(llamada[0]) === url && initDe(llamada)?.method === "POST"
  )
}

function cuerpoDe(llamada: unknown[] | undefined): unknown {
  const cuerpo = initDe(llamada)?.body
  return typeof cuerpo === "string" ? JSON.parse(cuerpo) : null
}

/**
 * Un convenio del listado tal como lo devuelve la vista del servidor, con el
 * papel y su constancia en el estado que el caso necesita. Cada unidad tiene un
 * número propio para encontrar su fila.
 */
function convenioConConstancia(
  numero: string,
  datos: { documentoId: string | null; constancia: { estado: string; motivo: string | null } | null }
) {
  return {
    id: `conv-${numero}`,
    unidadId: `uni-${numero}`,
    personaId: "per-ana",
    acuerdoId: "acu-1",
    montoTotal: 100_000,
    numeroCuotas: 1,
    fechaSuscripcion: "2026-11-20T12:00:00.000Z",
    primeraCuota: 50_000,
    estado: "vigente",
    observaciones: null,
    unidadNumero: numero,
    deudorNombre: "Ana Pérez",
    acuerdoFolio: "AC-2026-014",
    documentoId: datos.documentoId,
    constanciaEntrega: datos.constancia,
    cuotas: [
      {
        numero: 0,
        monto: 50_000,
        venceEn: "2026-11-20T12:00:00.000Z",
        estado: "pagada",
        pagadaEn: "2026-11-20T12:00:00.000Z",
        registradaPor: "usr-admin",
      },
      {
        numero: 1,
        monto: 50_000,
        venceEn: "2026-12-20T12:00:00.000Z",
        estado: "pendiente",
        pagadaEn: null,
        registradaPor: null,
      },
    ],
    totales: { pagado: 50_000, pendiente: 50_000 },
  }
}

/**
 * Las cuatro filas de referencia: un convenio por estado de la constancia y uno
 * SIN papel, que la vista devuelve con `documentoId: null` y sin constancia.
 */
function filasDeReferencia() {
  return [
    convenioConConstancia("401", {
      documentoId: "doc-entregado",
      constancia: { estado: "entregado", motivo: MOTIVO_ACEPTACION },
    }),
    convenioConConstancia("402", {
      documentoId: "doc-fallido",
      constancia: { estado: "fallido", motivo: MOTIVO_FALLO_PRIMERO },
    }),
    convenioConConstancia("403", {
      documentoId: "doc-pendiente",
      constancia: { estado: "pendiente", motivo: MOTIVO_NACIMIENTO },
    }),
    convenioConConstancia("404", { documentoId: null, constancia: null }),
  ]
}

/** Un listado con las cuatro filas, o el que el caso declare. */
function servir(manejadores: {
  /** Lo que responde el listado DESDE LA SEGUNDA lectura (la revalidación); la
   *  primera siempre devuelve las filas de referencia. */
  relectura?: () => { status?: number; cuerpo: unknown }
  /** Lo que responde el POST de reenvío. */
  reenvio?: () => { status?: number; cuerpo: unknown }
}): void {
  const filas = filasDeReferencia()
  let lectura = 0
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      if ((init?.method ?? "GET") === "POST") {
        if (url !== RUTA_REENVIO) {
          return respuestaJson({ error: "POST no previsto" }, 500)
        }
        const post = manejadores.reenvio
        if (!post) return respuestaJson({ error: "reenvío no previsto" }, 500)
        const { status, cuerpo } = post()
        return respuestaJson(cuerpo, status ?? 200)
      }
      if (url === RUTA_LISTADO || url.startsWith(`${RUTA_LISTADO}?`)) {
        if (lectura > 0 && manejadores.relectura) {
          const { status, cuerpo } = manejadores.relectura()
          return respuestaJson(cuerpo, status ?? 200)
        }
        lectura += 1
        return respuestaJson({ data: filas, total: filas.length, mostrados: filas.length })
      }
      return respuestaJson({ error: "ruta no prevista" }, 500)
    }
  )
}

/** La fila del convenio por el número de su unidad. */
function filaDe(numero: string): HTMLElement {
  return screen.getByRole("row", { name: new RegExp(numero) })
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

describe("Convenios — la constancia del papel firmado la pinta el servidor", () => {
  it("pinta el estado y el motivo de la constancia tal como el servidor los tiene, y el sin papel dice lo suyo", async () => {
    servir({})

    render(<ConsolaConvenios puedeCrear={false} puedeRegistrarPago />)

    // ENTREGADO: chip con el estado, el motivo verbatim y NINGÚN reenvío: la
    // ruta responde 409 y un botón condenado miente sobre el estado.
    const entregada = await waitFor(() => filaDe("401"))
    expect(within(entregada).getByText("Entregado")).toBeTruthy()
    expect(within(entregada).getByText(MOTIVO_ACEPTACION)).toBeTruthy()
    expect(within(entregada).queryByRole("button", { name: /Reenviar/ })).toBeNull()

    // FALLIDO: chip, el error del SMTP verbatim y el reenvío ofrecido.
    const fallida = filaDe("402")
    expect(within(fallida).getByText("Fallido")).toBeTruthy()
    expect(within(fallida).getByText(MOTIVO_FALLO_PRIMERO)).toBeTruthy()
    expect(
      within(fallida).getByRole("button", { name: /Reenviar/ })
    ).toBeTruthy()

    // PENDIENTE: chip, el motivo con el que la constancia nace y el reenvío.
    const pendiente = filaDe("403")
    expect(within(pendiente).getByText("Pendiente")).toBeTruthy()
    expect(within(pendiente).getByText(MOTIVO_NACIMIENTO)).toBeTruthy()
    expect(
      within(pendiente).getByRole("button", { name: /Reenviar/ })
    ).toBeTruthy()

    // SIN PAPEL: su propio texto, ni chip ni «—» ambiguo ni botón.
    const sinPapel = filaDe("404")
    expect(within(sinPapel).getByText(TEXTO_SIN_PAPEL)).toBeTruthy()
    expect(within(sinPapel).queryByText("Entregado")).toBeNull()
    expect(within(sinPapel).queryByText("Pendiente")).toBeNull()
    expect(within(sinPapel).queryByText("Fallido")).toBeNull()
    expect(within(sinPapel).queryByRole("button", { name: /Reenviar/ })).toBeNull()
  })

  it("el reenvío sobre fallido manda convenioId y pinta lo que el servidor respondió, aunque sea fallido", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      reenvio: () => ({
        cuerpo: {
          ok: true,
          convenioId: "conv-402",
          constancia: {
            id: "env-fallido",
            estado: "fallido",
            personaId: "per-ana",
            motivo: MOTIVO_FALLO_SEGUNDO,
          },
        },
      }),
      relectura: () => ({
        // La revalidación devuelve la fila con el motivo NUEVO del intento que
        // la ruta acababa de cursar (sigue `fallido`).
        cuerpo: {
          data: filasDeReferencia().map((fila) =>
            fila.id === "conv-402"
              ? {
                  ...fila,
                  constanciaEntrega: { estado: "fallido", motivo: MOTIVO_FALLO_SEGUNDO },
                }
              : fila
          ),
          total: 4,
          mostrados: 4,
        },
      }),
    })

    render(<ConsolaConvenios puedeCrear={false} puedeRegistrarPago />)

    const fallida = await waitFor(() => filaDe("402"))
    await user.click(
      within(fallida).getByRole("button", { name: /Reenviar/ })
    )

    // El cuerpo es exactamente el que la ruta de reenvío espera.
    await waitFor(() => expect(posts(RUTA_REENVIO)).toHaveLength(1))
    expect(cuerpoDe(posts(RUTA_REENVIO)[0])).toEqual({ convenioId: "conv-402" })

    // El estado NUEVO lo dice el servidor: la colección se relee.
    await waitFor(() => expect(lecturas(RUTA_LISTADO)).toHaveLength(2))

    // El servidor respondió fallido: la fila muestra fallido y el motivo NUEVO.
    // La pantalla no pinta «entregado» porque el click se cursó bien.
    const filaTrasReenvio = filaDe("402")
    expect(within(filaTrasReenvio).queryByText("Entregado")).toBeNull()
    expect(within(filaTrasReenvio).getByText("Fallido")).toBeTruthy()
    expect(within(filaTrasReenvio).getByText(MOTIVO_FALLO_SEGUNDO)).toBeTruthy()
    // Y el reenvío sigue ofrecido: el estado no era entregado.
    expect(
      within(filaTrasReenvio).getByRole("button", { name: /Reenviar/ })
    ).toBeTruthy()
  })

  it("el reenvío sobre pendiente deja entregado sólo porque el servidor lo dijo", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      reenvio: () => ({
        cuerpo: {
          ok: true,
          convenioId: "conv-403",
          constancia: {
            id: "env-pendiente",
            estado: "entregado",
            personaId: "per-ana",
            motivo: MOTIVO_ACEPTACION,
          },
        },
      }),
      relectura: () => ({
        // La revalidación devuelve la fila con la constancia entregada, tal
        // como el servidor la tiene.
        cuerpo: {
          data: filasDeReferencia().map((fila) =>
            fila.id === "conv-403"
              ? {
                  ...fila,
                  constanciaEntrega: { estado: "entregado", motivo: MOTIVO_ACEPTACION },
                }
              : fila
          ),
          total: 4,
          mostrados: 4,
        },
      }),
    })

    render(<ConsolaConvenios puedeCrear={false} puedeRegistrarPago />)

    const pendiente = await waitFor(() => filaDe("403"))
    await user.click(
      within(pendiente).getByRole("button", { name: /Reenviar/ })
    )

    await waitFor(() => expect(lecturas(RUTA_LISTADO)).toHaveLength(2))

    // El chip nuevo viene del servidor, con su motivo, y SIN botón de reenvío.
    const entregada = filaDe("403")
    expect(within(entregada).getByText("Entregado")).toBeTruthy()
    expect(within(entregada).getByText(MOTIVO_ACEPTACION)).toBeTruthy()
    expect(within(entregada).queryByRole("button", { name: /Reenviar/ })).toBeNull()
  })

  it("el 409 de la ruta se muestra verbatim y la fila no cambia sin confirmación del servidor", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      reenvio: () => ({ status: 409, cuerpo: { error: MENSAJE_YA_ENTREGADO } }),
    })

    render(<ConsolaConvenios puedeCrear={false} puedeRegistrarPago />)

    const pendiente = await waitFor(() => filaDe("403"))
    await user.click(
      within(pendiente).getByRole("button", { name: /Reenviar/ })
    )

    // El error de la API se muestra tal cual; la constancia sigue pendiente y
    // sin relectura: la fila no cambia porque el servidor no la cambió.
    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe(MENSAJE_YA_ENTREGADO)
    expect(lecturas(RUTA_LISTADO)).toHaveLength(1)
    const filaSinCambio = filaDe("403")
    expect(within(filaSinCambio).getByText("Pendiente")).toBeTruthy()
  })

  it("sin `fi:cobranza` editar no se ofrece el reenvío, aunque la constancia lo pida", async () => {
    servir({})

    render(<ConsolaConvenios puedeCrear={false} puedeRegistrarPago={false} />)

    await waitFor(() => filaDe("402"))
    expect(screen.queryByRole("button", { name: /Reenviar/ })).toBeNull()
  })
})
