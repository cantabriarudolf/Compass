// @vitest-environment jsdom
/**
 * Pantalla del registro de acuerdos — la cara del acuerdo PRESENCIAL (T3 ·
 * S1/S2/S5 de `odd/tasks/acuerdo-presencial-y-respaldo.md`).
 *
 * La API ya valida las reglas en `test/api/acuerdos-presencial.test.ts` y
 * `test/api/acuerdos-documento.test.ts`; lo que este test fija de la consola:
 *
 *   1. la fila presencial muestra la MODALIDAD, el resultado PROCLAMADO en la
 *      sala (presentes y quórum) y si el acta firmada está archivada — todo
 *      leído del servidor (`GET /api/acuerdos`), nunca deducido en el navegador;
 *   2. SIN el acta firmada archivada el botón de cierre está deshabilitado: la
 *      pantalla no ofrece lo que el servidor va a rechazar (S1). Forzando el
 *      envío, el 409 del servidor se muestra verbatim y la fila no cambia ni se
 *      relee;
 *   3. con el acta subida al archivo legal (`POST /api/acuerdos/[id]/documento`)
 *      la pantalla RELEE y «archivada» lo dice el servidor, no el click; el
 *      cierre manda el resultado tal como se cargó y la fila queda cerrada con
 *      lo que devolvió el servidor (la regla de honestidad de convenios);
 *   4. el acta del libro se elige del listado real (`GET /api/actas-gd`), que
 *      ofrece sólo las publicadas con folio: el flujo borrador → publicada →
 *      cerrar es recorrible en la consola sin callejón sin salida;
 *   5. la lista de asistencia y los poderes se suben cuando existen y NO
 *      condicionan el cierre; el 409 de la subida repetida se muestra verbatim;
 *   6. el alta electrónica manda exactamente el cuerpo de siempre (sin
 *      `modalidad`: el default de la base manda, S4) y el alta presencial
 *      declara `modalidad: "presencial"`.
 *
 * Mismo arnés que `acuerdos-pantalla.test.tsx`: fetch falso por `vi.stubGlobal`,
 * Radix instalado y la consola montada sin el `page.tsx` (server component).
 * El servidor falso clona las filas en cada GET para que las MUTACIONES que el
 * caso simula (subida, cierre) se vean en la relectura, como en la base real.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { ConsolaAcuerdos } from "@/app/comunidad/directiva/acuerdos/consola-acuerdos"

vi.setConfig({ testTimeout: 60_000 })

const RUTA_LISTA = "/api/acuerdos"
const RUTA_ACTAS = "/api/actas-gd"
const rutaCierre = (id: string) => `/api/acuerdos/${id}`
const rutaDocumento = (id: string) => `/api/acuerdos/${id}/documento`

/** El 409 del cierre sin acta subida, verbatim de `app/api/acuerdos/[id]/route.ts`. */
const MENSAJE_409_FIRMADA =
  "No se puede cerrar un acuerdo presencial sin el acta firmada subida al archivo legal: la documentación se sube, no se referencia por URL."

/** El 409 del papel repetido, verbatim de `app/api/acuerdos/[id]/documento/route.ts`. */
const MENSAJE_409_PAPEL =
  "El acuerdo ya tiene este papel subido al archivo legal: cada papel se sube una sola vez."

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

/** El cuerpo JSON de una llamada, o `null` si no viajó cuerpo. */
function cuerpoDe(llamada: unknown[] | undefined): unknown {
  const init = llamada?.[1] as RequestInit | undefined
  return typeof init?.body === "string" ? JSON.parse(init.body) : null
}

function metodoDe(llamada: unknown[] | undefined): string {
  const init = llamada?.[1] as RequestInit | undefined
  return init?.method ?? "GET"
}

/** Las lecturas del registro (GET), separadas de los POST a la misma base. */
function lecturasDelRegistro(): unknown[][] {
  return llamadas(RUTA_LISTA).filter((llamada) => metodoDe(llamada) === "GET")
}

/** Las subidas de papeles, en orden. */
function subidas(ruta: string): unknown[] {
  return llamadas(ruta).map((llamada) => cuerpoDe(llamada))
}

/**
 * Acuerdo presencial ABIERTO de asamblea, sin acta del libro declarada y sin
 * papeles: el punto de partida del flujo que la consola tiene que recorrer.
 */
function filaPresencialAbierta(): Record<string, unknown> {
  return {
    id: "acu-pres-1",
    folio: "AD-2026-0021",
    cuerpo: "asamblea",
    materia: "Aprobación del presupuesto 2027 por partidas",
    estado: "abierto",
    quorumRequerido: "mayoria_absoluta_derechos",
    fecha: "2026-11-10T22:00:00.000Z",
    resueltoEn: null,
    actaId: null,
    modalidad: "presencial",
    actaDocumentoId: null,
    asistenciaDocumentoId: null,
    poderesDocumentoId: null,
    derechosTotales: 100,
    resultado: {
      resultado: "pendiente",
      aFavor: 0,
      enContra: 0,
      abstenciones: 0,
      motivo:
        "El acuerdo presencial todavía no tiene el resultado proclamado en la sala.",
    },
    proclamado: null,
    votos: [],
  }
}

/** Acuerdo electrónico ABIERTO de asamblea: el camino que no cambia (S4). */
const FILA_ELECTRONICA_ABIERTA = {
  id: "acu-elec-1",
  folio: "AD-2026-0009",
  cuerpo: "asamblea",
  materia: "Aprobación del reglamento de uso de espacios comunes",
  estado: "abierto",
  quorumRequerido: "mayoria_absoluta_derechos",
  fecha: "2026-11-01T12:00:00.000Z",
  resueltoEn: null,
  actaId: null,
  modalidad: "electronica",
  actaDocumentoId: null,
  asistenciaDocumentoId: null,
  poderesDocumentoId: null,
  derechosTotales: 100,
  resultado: {
    resultado: "pendiente",
    aFavor: 60,
    enContra: 0,
    abstenciones: 40,
    motivo:
      "Mayoría absoluta de los derechos de la comunidad: 60 a favor de 100 derechos de la comunidad; restan 0 derechos por pronunciarse y el resultado todavía puede cambiar.",
  },
  proclamado: null,
  votos: [
    {
      personaId: "per-own-60",
      nombre: "Propietario Sesenta",
      decision: "a_favor",
      peso: 60,
      unidadId: "uni-101",
      fecha: "2026-11-02T12:00:00.000Z",
    },
  ],
}

/** Acuerdo presencial RESUELTO: lo proclamado y el acta archivada quedan a la vista. */
function filaPresencialResuelta(): Record<string, unknown> {
  return {
    id: "acu-pres-2",
    folio: "AD-2026-0018",
    cuerpo: "asamblea",
    materia: "Extraordinaria: reparación de la cubierta",
    estado: "aprobado",
    quorumRequerido: "mayoria_absoluta_derechos",
    fecha: "2026-11-05T22:00:00.000Z",
    resueltoEn: "2026-11-06T12:00:00.000Z",
    actaId: "acta-pub-1",
    modalidad: "presencial",
    actaDocumentoId: "doc-acta-1",
    asistenciaDocumentoId: "doc-asi-1",
    poderesDocumentoId: null,
    derechosTotales: 100,
    resultado: {
      resultado: "aprobado",
      aFavor: 45,
      enContra: 10,
      abstenciones: 25,
      motivo:
        "Mayoría absoluta de los derechos de la comunidad: resultado proclamado en sala: 45 a favor, 10 en contra, 25 abstenciones, 80 presentes; la sala proclamó que se alcanzó la mayoría exigida.",
    },
    proclamado: {
      aFavor: 45,
      enContra: 10,
      abstenciones: 25,
      presentes: 80,
      quorumAlcanzado: true,
    },
    votos: [],
  }
}

/** El libro de actas: una publicada con folio y una en borrador (sin folio). */
const ACTAS = [
  {
    id: "acta-pub-1",
    folio: "AD-2026-0042",
    estado: "publicada",
    fecha: "2026-11-10T22:00:00.000Z",
    lugar: "Salón comunal",
  },
  {
    id: "acta-borrador-1",
    folio: null,
    estado: "borrador",
    fecha: "2026-11-15T22:00:00.000Z",
    lugar: "Salón comunal",
  },
]

interface RespuestaFalsa {
  status?: number
  cuerpo: unknown
}

/**
 * Instala el servidor falso. Los manejadores opcionales reciben (url, cuerpo) y
 * devuelven la respuesta; pueden MUTAR las filas antes de responder, que es como
 * la base real cambia detrás de la relectura.
 */
function servir(manejadores: {
  filas?: Record<string, unknown>[]
  actas?: unknown[]
  alta?: (url: string, cuerpo: unknown) => RespuestaFalsa | undefined
  documento?: (url: string, cuerpo: unknown) => RespuestaFalsa | undefined
  cierre?: (url: string, cuerpo: unknown) => RespuestaFalsa | undefined
}): void {
  const filas = manejadores.filas ?? []
  const actas = manejadores.actas ?? ACTAS
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      const metodo = init?.method ?? "GET"
      if (metodo === "GET" && url.startsWith(RUTA_ACTAS)) {
        return respuestaJson({ data: actas, page: 1, pageSize: 100, total: actas.length })
      }
      if (metodo === "GET" && url === RUTA_LISTA) {
        // Clon por lectura: la relectura trae la fila tal como quedó en la base.
        return respuestaJson({
          data: filas.map((fila) => ({ ...fila })),
          total: filas.length,
          limite: 100,
          mostrados: filas.length,
        })
      }
      const cuerpo = cuerpoDe([entrada, init])
      if (metodo === "POST" && url === RUTA_LISTA) {
        // Como en el arnés hermano: el manejador declara cuerpo y status, y la
        // conversión a Response es del arnés (el navegador siempre recibe uno).
        const respuesta = manejadores.alta?.(url, cuerpo)
        if (!respuesta) {
          return respuestaJson({ id: "acu-nuevo", folio: "AD-2026-0030" }, 201)
        }
        return respuestaJson(respuesta.cuerpo, respuesta.status ?? 201)
      }
      if (metodo === "POST" && /\/documento$/.test(url)) {
        const respuesta = manejadores.documento?.(url, cuerpo)
        if (!respuesta) {
          return respuestaJson({ id: "doc-nuevo", tipo: "acta" }, 201)
        }
        return respuestaJson(respuesta.cuerpo, respuesta.status ?? 201)
      }
      if (metodo === "POST" && url === rutaCierre("acu-pres-1")) {
        const respuesta = manejadores.cierre?.(url, cuerpo)
        if (!respuesta) {
          return respuestaJson(
            { ok: true, resultado: { resultado: "aprobado" } },
            201
          )
        }
        return respuestaJson(respuesta.cuerpo, respuesta.status ?? 201)
      }
      return respuestaJson({ error: "Ruta no servida por el arnés." }, 404)
    }
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

describe("La fila presencial se lee del servidor (S2/S5)", () => {
  it("muestra modalidad, lo proclamado en la sala y si el acta está archivada", async () => {
    servir({ filas: [filaPresencialResuelta(), FILA_ELECTRONICA_ABIERTA] })

    render(<ConsolaAcuerdos puedeRegistrar />)

    // La presencial resuelta: modalidad a la vista, junto al cuerpo.
    expect(await screen.findByText("AD-2026-0018")).toBeTruthy()
    expect(screen.getByText(/^Asamblea · Presencial · /)).toBeTruthy()
    // Los conteos son los proclamados, en la unidad del cuerpo (derechos).
    expect(
      screen.getByText(
        "A favor: 45 derechos · En contra: 10 derechos · Abstenciones: 25 derechos"
      )
    ).toBeTruthy()
    // Lo proclamado incluye presentes y el quórum que la sala declaró.
    expect(
      screen.getByText(
        "Proclamado en la sala: 80 derechos presentes · quórum alcanzado"
      )
    ).toBeTruthy()
    // «Archivada» lo dice la fila del servidor, no un click.
    expect(
      screen.getByText("El acta firmada está archivada en el archivo legal.")
    ).toBeTruthy()
    // Resuelto: no se reofrece el cierre ni hay votos por persona.
    expect(screen.getByText(/El acuerdo ya fue resuelto/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Cerrar el acuerdo presencial" })).toBeNull()

    // El electrónico se ve como hoy: modalidad a la vista y el voto se ofrece.
    expect(screen.getByText(/^Asamblea · Electrónica/)).toBeTruthy()
    expect(screen.getAllByRole("button", { name: "Votar a favor" })).toHaveLength(1)
  })

  it("una presencial abierta sin acta dice que falta y ofrece el cierre", async () => {
    // Sólo la presencial: el contraste con la electrónica (que sí ofrece el
    // voto) está en el test de la fila y en el pin del alta.
    servir({ filas: [filaPresencialAbierta()] })

    render(<ConsolaAcuerdos puedeRegistrar />)

    expect(await screen.findByText("AD-2026-0021")).toBeTruthy()
    expect(
      screen.getByText(
        "El acta firmada no está en el archivo legal: se sube al cerrar el acuerdo."
      )
    ).toBeTruthy()
    // El cierre se ofrece; el voto NO (un presencial no acumula votos).
    expect(
      screen.getByRole("button", { name: "Cerrar el acuerdo presencial" })
    ).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Votar a favor" })).toBeNull()
    // El motivo del servidor dice que todavía no hay resultado proclamado.
    expect(
      screen.getByText(
        "El acuerdo presencial todavía no tiene el resultado proclamado en la sala."
      )
    ).toBeTruthy()
  })
})

describe("Cerrar un acuerdo presencial (S1/S5)", () => {
  it("sin el acta subida el botón está deshabilitado; forzando el envío, el 409 se muestra verbatim y la fila no cambia", async () => {
    const user = userEvent.setup({ delay: null })
    const fila = filaPresencialAbierta()
    let cierres = 0
    servir({
      filas: [fila],
      cierre: () => {
        cierres += 1
        return { status: 409, cuerpo: { error: MENSAJE_409_FIRMADA } }
      },
    })

    render(<ConsolaAcuerdos puedeRegistrar />)
    await screen.findByText("AD-2026-0021")

    await user.click(
      screen.getByRole("button", { name: "Cerrar el acuerdo presencial" })
    )
    const dialogo = await screen.findByRole("dialog")

    // El selector del acta del libro sólo ofrece las publicadas con folio.
    const selector = within(dialogo).getByLabelText(
      "Acta del libro que respalda el cierre"
    ) as HTMLSelectElement
    await user.selectOptions(selector, "acta-pub-1")
    expect(
      within(dialogo).queryByText(/2026-11-15/) // la borrador no se ofrece
    ).toBeNull()
    expect(
      Array.from(selector.options).some((opcion) => opcion.value === "acta-borrador-1")
    ).toBe(false)

    await user.type(within(dialogo).getByLabelText("A favor"), "45")
    await user.type(within(dialogo).getByLabelText("En contra"), "10")
    await user.type(within(dialogo).getByLabelText("Abstenciones"), "25")
    await user.type(within(dialogo).getByLabelText("Presentes"), "80")
    await user.click(
      within(dialogo).getByRole("checkbox", {
        name: "La sala alcanzó el quórum exigido",
      })
    )

    // Sin acta firmada subida, el botón de cierre está deshabilitado.
    const boton = within(dialogo).getByRole("button", {
      name: "Cerrar acuerdo",
    }) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    expect(llamadas(rutaCierre("acu-pres-1"))).toHaveLength(0)

    // Envío forzado (lo que un cliente vencido o manipulado podría hacer): la
    // petición viaja y el 409 del servidor se muestra verbatim.
    const formulario = dialogo.querySelector("form")
    expect(formulario).toBeTruthy()
    fireEvent.submit(formulario!)

    await waitFor(() => expect(cierres).toBe(1))
    expect(cuerpoDe(llamadas(rutaCierre("acu-pres-1"))[0])).toEqual({
      resultado: {
        aFavor: 45,
        enContra: 10,
        abstenciones: 25,
        presentes: 80,
        quorumAlcanzado: true,
      },
      actaId: "acta-pub-1",
    })
    const alerta = within(dialogo).getByRole("alert")
    expect(alerta.textContent).toBe(MENSAJE_409_FIRMADA)
    // Sin éxito no hay relectura y la fila sigue abierta.
    expect(lecturasDelRegistro()).toHaveLength(1)
    expect(screen.getByText("Abierto")).toBeTruthy()
  })

  it("con el acta subida al archivo, el cierre manda lo proclamado y la fila queda cerrada con lo que devolvió el servidor", async () => {
    const user = userEvent.setup({ delay: null })
    const fila = filaPresencialAbierta()
    servir({
      filas: [fila],
      documento: () => {
        fila.actaDocumentoId = "doc-acta-1"
        return { cuerpo: { id: "doc-acta-1", tipo: "acta", hash: "sha256" } }
      },
      cierre: () => {
        fila.estado = "aprobado"
        fila.resueltoEn = "2026-11-11T12:00:00.000Z"
        fila.proclamado = {
          aFavor: 45,
          enContra: 10,
          abstenciones: 25,
          presentes: 80,
          quorumAlcanzado: true,
        }
        fila.resultado = {
          resultado: "aprobado",
          aFavor: 45,
          enContra: 10,
          abstenciones: 25,
          motivo:
            "Mayoría absoluta de los derechos de la comunidad: resultado proclamado en sala: 45 a favor, 10 en contra, 25 abstenciones, 80 presentes; la sala proclamó que se alcanzó la mayoría exigida.",
        }
        return {
          cuerpo: {
            ok: true,
            resultado: { resultado: "aprobado", aFavor: 45, enContra: 10, abstenciones: 25 },
          },
        }
      },
    })

    render(<ConsolaAcuerdos puedeRegistrar />)
    await screen.findByText("AD-2026-0021")

    await user.click(
      screen.getByRole("button", { name: "Cerrar el acuerdo presencial" })
    )
    const dialogo = await screen.findByRole("dialog")

    await user.selectOptions(
      within(dialogo).getByLabelText("Acta del libro que respalda el cierre"),
      "acta-pub-1"
    )
    await user.type(within(dialogo).getByLabelText("A favor"), "45")
    await user.type(within(dialogo).getByLabelText("En contra"), "10")
    await user.type(within(dialogo).getByLabelText("Abstenciones"), "25")
    await user.type(within(dialogo).getByLabelText("Presentes"), "80")
    await user.click(
      within(dialogo).getByRole("checkbox", {
        name: "La sala alcanzó el quórum exigido",
      })
    )

    // El acta firmada se SUBE al archivo legal: bytes en base64, no una URL.
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) // %PDF-
    await user.upload(
      within(dialogo).getByLabelText("Acta firmada (PDF)"),
      new File([bytes], "acta-firmada.pdf", { type: "application/pdf" })
    )
    await user.click(within(dialogo).getByRole("button", { name: "Subir acta firmada" }))

    await waitFor(() =>
      expect(subidas(rutaDocumento("acu-pres-1"))).toHaveLength(1)
    )
    expect(subidas(rutaDocumento("acu-pres-1"))[0]).toEqual({
      tipo: "acta",
      nombreArchivo: "acta-firmada.pdf",
      contenidoBase64: "JVBERi0=",
    })
    // La pantalla RELEE después de subir: «archivada» lo dice el servidor.
    await waitFor(() => expect(lecturasDelRegistro()).toHaveLength(2))
    expect(
      within(dialogo).getByText("El acta firmada está archivada en el archivo legal.")
    ).toBeTruthy()

    // Con el acta archivada, el cierre se habilita.
    const boton = within(dialogo).getByRole("button", {
      name: "Cerrar acuerdo",
    }) as HTMLButtonElement
    expect(boton.disabled).toBe(false)
    await user.click(boton)

    await waitFor(() => expect(lecturasDelRegistro()).toHaveLength(3))
    expect(cuerpoDe(llamadas(rutaCierre("acu-pres-1"))[0])).toEqual({
      resultado: {
        aFavor: 45,
        enContra: 10,
        abstenciones: 25,
        presentes: 80,
        quorumAlcanzado: true,
      },
      actaId: "acta-pub-1",
    })
    // El diálogo se cierra y la fila pintada es la que devolvió el servidor.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(screen.getByText("Aprobado")).toBeTruthy()
    expect(
      screen.getByText(
        "Proclamado en la sala: 80 derechos presentes · quórum alcanzado"
      )
    ).toBeTruthy()
    expect(
      screen.getByText("El acta firmada está archivada en el archivo legal.")
    ).toBeTruthy()
    expect(screen.getByText(/Resuelto el 2026-11-11/)).toBeTruthy()
    // Y ya no se ofrece el cierre: lo cerrado no se reescribe (S5).
    expect(
      screen.queryByRole("button", { name: "Cerrar el acuerdo presencial" })
    ).toBeNull()
  })
})

describe("El alta declara la modalidad (S4)", () => {
  it("la electrónica manda el cuerpo de siempre y la presencial declara modalidad", async () => {
    const user = userEvent.setup({ delay: null })
    servir({ filas: [FILA_ELECTRONICA_ABIERTA] })

    render(<ConsolaAcuerdos puedeRegistrar />)
    await screen.findByText("AD-2026-0009")

    // Camino electrónico: por defecto, y el cuerpo NO lleva modalidad.
    await user.click(screen.getByRole("button", { name: "Nuevo acuerdo" }))
    const dialogo = await screen.findByRole("dialog")
    const electronica = within(dialogo).getByRole("radio", {
      name: "Electrónica",
    }) as HTMLInputElement
    expect(electronica.checked).toBe(true)

    await user.type(
      within(dialogo).getByLabelText("Materia del acuerdo"),
      "Presupuesto 2028 por partidas"
    )
    await user.click(
      within(dialogo).getByRole("radio", { name: "Asamblea" })
    )
    await user.click(
      within(dialogo).getByRole("radio", {
        name: "Mayoría absoluta de los derechos de la comunidad",
      })
    )
    await user.click(
      within(dialogo).getByRole("button", { name: "Registrar acuerdo" })
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    // Camino presencial: declara la modalidad en el cuerpo.
    await user.click(screen.getByRole("button", { name: "Nuevo acuerdo" }))
    const dialogoPresencial = await screen.findByRole("dialog")
    expect(
      within(dialogoPresencial).getByText(/No se puede cerrar sin el acta firmada/)
    ).toBeTruthy()
    await user.click(
      within(dialogoPresencial).getByRole("radio", { name: "Presencial" })
    )
    await user.type(
      within(dialogoPresencial).getByLabelText("Materia del acuerdo"),
      "Reparación de la cubierta"
    )
    await user.click(
      within(dialogoPresencial).getByRole("radio", { name: "Asamblea" })
    )
    await user.click(
      within(dialogoPresencial).getByRole("radio", {
        name: "Mayoría absoluta de los derechos de la comunidad",
      })
    )
    await user.click(
      within(dialogoPresencial).getByRole("button", { name: "Registrar acuerdo" })
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    const altas = llamadas(RUTA_LISTA).filter(
      (llamada) => metodoDe(llamada) === "POST"
    )
    expect(altas).toHaveLength(2)
    // Sin modalidad el cuerpo queda byte a byte como hoy (el default de la base manda).
    expect(cuerpoDe(altas[0])).toEqual({
      cuerpo: "asamblea",
      materia: "Presupuesto 2028 por partidas",
      quorumRequerido: "mayoria_absoluta_derechos",
    })
    expect(cuerpoDe(altas[1])).toEqual({
      cuerpo: "asamblea",
      materia: "Reparación de la cubierta",
      quorumRequerido: "mayoria_absoluta_derechos",
      modalidad: "presencial",
    })
  })
})

describe("La asistencia y los poderes se suben cuando existen (S3)", () => {
  it("la subida manda el papel tal cual, relee, y el 409 del repetido se muestra verbatim sin bloquear el cierre", async () => {
    const user = userEvent.setup({ delay: null })
    const fila = filaPresencialAbierta()
    fila.actaDocumentoId = "doc-acta-1" // el acta ya está archivada
    servir({
      filas: [fila],
      documento: (_url, cuerpo) => {
        const papel = (cuerpo as { tipo?: string }).tipo
        if (papel === "asistencia" && fila.asistenciaDocumentoId === null) {
          fila.asistenciaDocumentoId = "doc-asi-1"
          return { cuerpo: { id: "doc-asi-1", tipo: "asistencia" } }
        }
        return { status: 409, cuerpo: { error: MENSAJE_409_PAPEL } }
      },
    })

    render(<ConsolaAcuerdos puedeRegistrar />)
    await screen.findByText("AD-2026-0021")

    await user.click(
      screen.getByRole("button", { name: "Cerrar el acuerdo presencial" })
    )
    const dialogo = await screen.findByRole("dialog")

    // El acta archivada lo dice la fila leída del servidor.
    expect(
      within(dialogo).getByText("El acta firmada está archivada en el archivo legal.")
    ).toBeTruthy()

    await user.selectOptions(
      within(dialogo).getByLabelText("Acta del libro que respalda el cierre"),
      "acta-pub-1"
    )
    await user.type(within(dialogo).getByLabelText("A favor"), "45")
    await user.type(within(dialogo).getByLabelText("En contra"), "10")
    await user.type(within(dialogo).getByLabelText("Abstenciones"), "25")
    await user.type(within(dialogo).getByLabelText("Presentes"), "80")
    await user.click(
      within(dialogo).getByRole("checkbox", {
        name: "La sala alcanzó el quórum exigido",
      })
    )

    // Sin asistencia ni poderes el cierre ya está habilitado: son opcionales.
    const boton = within(dialogo).getByRole("button", {
      name: "Cerrar acuerdo",
    }) as HTMLButtonElement
    expect(boton.disabled).toBe(false)

    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    const archivo = new File([bytes], "asistencia.pdf", { type: "application/pdf" })
    await user.upload(
      within(dialogo).getByLabelText("Lista de asistencia (PDF)"),
      archivo
    )
    await user.click(
      within(dialogo).getByRole("button", { name: "Subir lista de asistencia" })
    )

    await waitFor(() =>
      expect(subidas(rutaDocumento("acu-pres-1"))).toHaveLength(1)
    )
    expect(subidas(rutaDocumento("acu-pres-1"))[0]).toEqual({
      tipo: "asistencia",
      nombreArchivo: "asistencia.pdf",
      contenidoBase64: "JVBERi0=",
    })
    await waitFor(() => expect(lecturasDelRegistro()).toHaveLength(2))
    expect(
      within(dialogo).getByText("Lista de asistencia archivada en el archivo legal.")
    ).toBeTruthy()

    // Repetir la subida: el 409 del servidor, verbatim, sin relectura.
    await user.click(
      within(dialogo).getByRole("button", { name: "Subir lista de asistencia" })
    )
    // La respuesta del servidor llega en su tiempo: se espera el alerta.
    const alerta = await within(dialogo).findByRole("alert")
    expect(alerta.textContent).toBe(MENSAJE_409_PAPEL)
    await waitFor(() => expect(lecturasDelRegistro()).toHaveLength(2))
    // Y el cierre sigue habilitado: los papeles opcionales no lo condicionan.
    expect(boton.disabled).toBe(false)
    // El acta no se vuelve a mandar: ya estaba archivada antes de abrir.
    expect(
      subidas(rutaDocumento("acu-pres-1")).some(
        (cuerpo) => (cuerpo as { tipo?: string })?.tipo === "acta"
      )
    ).toBe(false)
  })
})
