// @vitest-environment jsdom
/**
 * «Configuración Global» deja de parecer el lugar donde se configura el correo de
 * la comunidad.
 *
 * El problema medido: hay dos pantallas de correo —la consola de la comunidad
 * (`/admin/configuracion/correo`, contraseña incluida, cifrada) y esta pestaña— y las
 * dos se leían como «la» configuración. La precedencia real la fija el emisor y el
 * dueño la quiere escrita en la pantalla: `lib/smtp.ts:513-518` decide que la
 * credencial de la comunidad manda sobre servidor/puerto/usuario y sobre el secreto,
 * y que el remitente y la seguridad siguen viniendo de CF; `lib/smtp.ts:295` elige el
 * secreto (`credencial.secreto` o `SMTP_PASSWORD`).
 *
 * Lo que este test fija, en la pestaña «Correo SMTP»:
 *
 *   1. el bloque de la credencial se declara RESPALDO, con su condición escrita;
 *   2. la frase de precedencia dice en criollo cuál manda y enlaza a la consola de la
 *      comunidad;
 *   3. los tres datos de la credencial (servidor, puerto, usuario) siguen editables y
 *      viajan al guardado con el mismo cuerpo que antes;
 *   4. el remitente, su nombre y el BCC —lo que sólo vive acá y aplica siempre—
 *      siguen en su bloque, con sus ayudas intactas.
 *
 * Se monta la pantalla real con su `useConfiguracion` y un `fetch` falso, igual que
 * `configuracion-correo-comunidad.test.tsx`: la pestaña sólo existe montada de verdad.
 */
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import ConfiguracionPage from "@/app/admin/configuracion/page"
import { configuracionDefault } from "@/data/admin/configuracion"
import { instalarEntornoRadix } from "./entorno-radix"

vi.setConfig({ testTimeout: 60_000 })

const RUTA_CONFIGURACION = "/api/configuracion"

/**
 * El título del bloque del respaldo: dice que es respaldo y cuándo se usa. Sin la
 * condición («sólo si la comunidad no cargó su credencial») sería otro bloque de
 * credencial más, que es exactamente lo que la pantalla hacía.
 */
const TITULO_RESPALDO =
  "Respaldo del servidor (sólo si la comunidad no cargó su credencial)"

/**
 * La frase que ordena la cabeza, textual del dueño: la credencial de la comunidad
 * manda, el respaldo entra cuando no la hay, y la contraseña se carga en la consola.
 */
const FRASE_PRECEDENCIA =
  "Si la comunidad cargó su credencial, esa manda y estos datos no se usan. Si no la cargó, el sistema usa esto. La contraseña de la comunidad se carga allá, no acá."

/** El enlace que lleva a la consola de la comunidad desde la frase de precedencia. */
const ENLACE_CONSOLA = "Ir a la consola de la comunidad"
const RUTA_CONSOLA = "/admin/configuracion/correo"

/** El título del bloque de lo que sólo vive acá y se aplica siempre. */
const TITULO_SIEMPRE = "Estos datos se usan siempre"

/** Las ayudas del remitente, sin cambios de texto (F33 · U5). */
const AYUDA_REMITENTE =
  "Es la dirección que va a ver el vecino cuando abra su correo. No es tu usuario para entrar al sistema: es la cara pública de la comunidad. Conviene que sea del mismo dominio del servidor, o el correo puede caer en spam."
const AYUDA_NOMBRE_REMITENTE =
  "Cómo se ve la comunidad al lado de la dirección, por ejemplo Administración Los Almendros."

/**
 * La configuración de la base, con cada valor distinguishable: así el campo que se
 * edita y su viaje al endpoint se afirman sin adivinar cuál campo es cuál.
 */
const CONFIGURACION = {
  ...configuracionDefault,
  smtpHost: "smtp.comunidadlosalmendros.cl",
  smtpPort: 587,
  smtpUser: "buzon@comunidadlosalmendros.cl",
  smtpFrom: "remitente@comunidadlosalmendros.cl",
  smtpFromName: "Administración Los Almendros",
  smtpBcc: "auditoria@comunidadlosalmendros.cl",
}

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

/** Las llamadas a un método concreto sobre una ruta exacta, en orden. */
function llamadas(url: string, metodo: string): unknown[][] {
  return fetchFalso.mock.calls.filter(
    (llamada) =>
      String(llamada[0]) === url && (initDe(llamada)?.method ?? "GET") === metodo
  )
}

/** El cuerpo JSON de una llamada, o `null` si no viajó cuerpo. */
function cuerpoDe(llamada: unknown[] | undefined): Record<string, unknown> | null {
  const cuerpo = initDe(llamada)?.body
  return typeof cuerpo === "string"
    ? (JSON.parse(cuerpo) as Record<string, unknown>)
    : null
}

/** La pantalla real: lee la configuración y responde el guardado como la API. */
function servirConfiguracion(): void {
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      const metodo = init?.method ?? "GET"
      if (url === RUTA_CONFIGURACION) {
        // El PUT devuelve el cuerpo que llegó, que es lo que hace la ruta real.
        return metodo === "PUT"
          ? respuestaJson(cuerpoDe([entrada, init]) ?? CONFIGURACION)
          : respuestaJson(CONFIGURACION)
      }
      return respuestaJson({ error: "ruta no prevista" }, 404)
    }
  )
}

/** Monta la pantalla y deja abierta la pestaña «Correo SMTP». */
async function abrirPestanaCorreo(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup({ delay: null })
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ConfiguracionPage />
    </SWRConfig>
  )
  // El formulario se pinta con la configuración de la base ya cargada.
  await screen.findByRole("button", { name: "Guardar Cambios" })
  await user.click(screen.getByRole("tab", { name: /Correo SMTP/ }))
  return user
}

beforeEach(() => {
  instalarEntornoRadix()
  vi.spyOn(window, "alert").mockImplementation(() => {})
  vi.stubGlobal("fetch", fetchFalso)
})

afterEach(() => {
  cleanup()
  fetchFalso.mockReset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("Configuración Global — el respaldo se declara respaldo", () => {
  it("el bloque del servidor, puerto y usuario se titula como respaldo y dice cuándo se usa", async () => {
    servirConfiguracion()
    await abrirPestanaCorreo()

    const titulo = await screen.findByRole("heading", { name: TITULO_RESPALDO })
    // Lo dice con todas las letras: es respaldo, no «la» configuración.
    expect(titulo.textContent).toContain("Respaldo del servidor")
    expect(titulo.textContent).toContain(
      "sólo si la comunidad no cargó su credencial"
    )

    // Los campos no se eliminan ni se deshabilitan: siguen siendo el respaldo.
    const bloque = screen.getByRole("region", { name: TITULO_RESPALDO })
    for (const valor of [
      CONFIGURACION.smtpHost,
      String(CONFIGURACION.smtpPort),
      CONFIGURACION.smtpUser,
    ]) {
      const campo = within(bloque).getByDisplayValue(valor) as HTMLInputElement
      expect(campo.disabled).toBe(false)
    }
  })

  it("la frase de precedencia dice que la credencial de la comunidad manda y enlaza a su consola", async () => {
    servirConfiguracion()
    await abrirPestanaCorreo()

    const frase = await screen.findByText(FRASE_PRECEDENCIA)
    // En criollo: primero la credencial de la comunidad, después esto.
    expect(frase.textContent).toContain("esa manda y estos datos no se usan")
    expect(frase.textContent).toContain("no la cargó, el sistema usa esto")

    // El enlace a la consola viaja DENTRO de la misma frase: no queda como pie de página.
    const enlace = within(frase).getByRole("link", { name: ENLACE_CONSOLA })
    expect(enlace).toHaveAttribute("href", RUTA_CONSOLA)
  })
})

describe("Configuración Global — la credencial se sigue guardando igual", () => {
  it("servidor, puerto y usuario siguen editables y viajan con el mismo cuerpo de antes", async () => {
    servirConfiguracion()
    const user = await abrirPestanaCorreo()

    const servidor = screen.getByDisplayValue(
      CONFIGURACION.smtpHost
    ) as HTMLInputElement
    await user.clear(servidor)
    await user.type(servidor, "smtp.respaldo-nuevo.cl")

    const puerto = screen.getByDisplayValue(
      String(CONFIGURACION.smtpPort)
    ) as HTMLInputElement
    await user.clear(puerto)
    await user.type(puerto, "2525")

    const usuario = screen.getByDisplayValue(
      CONFIGURACION.smtpUser
    ) as HTMLInputElement
    await user.clear(usuario)
    await user.type(usuario, "buzon-respaldo@respaldo-nuevo.cl")

    await user.click(screen.getByRole("button", { name: "Guardar Cambios" }))
    await waitFor(() =>
      expect(llamadas(RUTA_CONFIGURACION, "PUT")).toHaveLength(1)
    )

    // El reagrupamiento es visual: el guardado manda la configuración completa, con
    // los tres valores nuevos y todo lo demás igual que hoy.
    expect(cuerpoDe(llamadas(RUTA_CONFIGURACION, "PUT")[0])).toEqual({
      ...CONFIGURACION,
      smtpHost: "smtp.respaldo-nuevo.cl",
      smtpPort: 2525,
      smtpUser: "buzon-respaldo@respaldo-nuevo.cl",
    })
  })
})

describe("Configuración Global — lo que sólo vive acá queda primero y claro", () => {
  it("el remitente, su nombre y el BCC viven en el bloque que se usa siempre, con sus ayudas intactas", async () => {
    servirConfiguracion()
    await abrirPestanaCorreo()

    const bloque = await screen.findByRole("region", { name: TITULO_SIEMPRE })

    expect(
      within(bloque).getByDisplayValue(CONFIGURACION.smtpFrom)
    ).toBeTruthy()
    expect(
      within(bloque).getByDisplayValue(CONFIGURACION.smtpFromName)
    ).toBeTruthy()
    expect(
      within(bloque).getByDisplayValue(CONFIGURACION.smtpBcc)
    ).toBeTruthy()

    // Las ayudas del remitente no cambian de texto.
    expect(within(bloque).getByText(AYUDA_REMITENTE)).toBeTruthy()
    expect(within(bloque).getByText(AYUDA_NOMBRE_REMITENTE)).toBeTruthy()

    // Y no están mezclados con el respaldo: la credencial vive en otro bloque.
    const respaldo = screen.getByRole("region", { name: TITULO_RESPALDO })
    expect(
      within(respaldo).queryByDisplayValue(CONFIGURACION.smtpFrom)
    ).toBeNull()
  })
})
