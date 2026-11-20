// @vitest-environment jsdom
/**
 * La solicitud de datos de la credencial de correo, en criollo (F33 · U5).
 *
 * El dueño abrió la consola y su queja fue que el formulario no le decía qué poner:
 * pedía el buzón como dirección completa, cuando el dominio ya está escrito arriba en
 * el servidor SMTP, y el remitente no explicaba qué rol cumple —no es el usuario con
 * el que se entra al sistema, es la dirección que ve el vecino— hasta el punto de que
 * la contraseña se buscaba en la pestaña de Configuración Global, que no la tiene.
 *
 * Lo que este test fija:
 *
 *   1. escribir SÓLO la parte local (`soporte`) completa el dominio que se deduce del
 *      servidor (`smtp.comunidadlosalmendros.cl` → `comunidadlosalmendros.cl`), el
 *      resultado completo se VE antes de guardar y es lo que viaja al endpoint;
 *   2. pegar una dirección completa la respeta tal cual: la pantalla no reescribe lo
 *      que ya viene completo, ni siquiera cuando el servidor es de un proveedor
 *      público;
 *   3. cuando del servidor no se puede deducir un dominio (`smtp.gmail.com`) la
 *      pantalla NO inventa: pide la dirección completa y no deja guardar a medias;
 *   4. la ayuda del remitente dice qué ve el vecino y que no es el usuario del
 *      sistema, y la pestaña «Correo SMTP» de Configuración Global avisa que la
 *      credencial con contraseña se carga en la consola de la comunidad (el enlace).
 *
 * Se monta la consola y, para el punto 4, la pantalla de Configuración Global con su
 * `useConfiguracion` real y un `fetch` falso, igual que `reglamento-gc.test.tsx`: la
 * pestaña sólo existe montada de verdad.
 */
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { ConsolaCredencialCorreo } from "@/app/admin/configuracion/correo/_componentes/correo"
import ConfiguracionPage from "@/app/admin/configuracion/page"
import { configuracionDefault } from "@/data/admin/configuracion"
import { instalarEntornoRadix } from "./entorno-radix"

vi.setConfig({ testTimeout: 60_000 })

const RUTA_CREDENCIAL = "/api/configuracion/correo"

/** La contraseña del buzón: el único dato que la pantalla nunca devuelve. */
const SECRETO = "clave-del-buzon-de-la-prueba-4c1f"

/** El dominio propio, escrito en el servidor: de ahí sale lo que el campo no repite. */
const DOMINIO_PROPIO = "comunidadlosalmendros.cl"
const SERVIDOR_PROPIO = `smtp.${DOMINIO_PROPIO}`

/** El servidor de un proveedor público: detrás hay millones de buzones ajenos. */
const SERVIDOR_PUBLICO = "smtp.gmail.com"

/**
 * La configuración de la base, con el buzón y el remitente en direcciones distintas:
 * el seed los deja iguales y así el campo del remitente se puede señalar solo.
 */
const CONFIGURACION = {
  ...configuracionDefault,
  smtpUser: "buzon@comunidad.test",
  smtpFrom: "remitente@comunidad.test",
}

/** Una comunidad que todavía no guardó credencial: el estado vacío del contrato. */
const CREDENCIAL_AUSENTE = {
  configurada: false,
  host: null,
  puerto: null,
  usuario: null,
  actualizadoEn: null,
  actualizadoPor: null,
} as const

/**
 * El resultado completo de la casilla, a la vista: no se completa en silencio.
 * La forma la fija la pantalla, y el test la repite entera para que un cambio de
 * texto no pase inadvertido.
 */
const PREVIO_DOMINIO_COMPLETADO = `Se va a guardar como soporte@${DOMINIO_PROPIO}. El dominio lo completa la pantalla a partir del servidor.`
const PREVIO_DIRECCION_COMPLETA =
  "Se va a guardar como ventas@comunidadvecinos.cl."

/** Lo que la pantalla dice cuando del servidor no se puede deducir el dominio. */
const AVISO_SIN_DOMINIO =
  "Del servidor no se puede deducir el dominio: escribí la dirección completa, con arroba."

/** La ayuda del remitente: el rol, que es la queja textual del dueño (F33 · U5). */
const AYUDA_REMITENTE =
  "Es la dirección que va a ver el vecino cuando abra su correo. No es tu usuario para entrar al sistema: es la cara pública de la comunidad. Conviene que sea del mismo dominio del servidor, o el correo puede caer en spam."

/** La ayuda del nombre del remitente: cómo se ve la comunidad al lado de la dirección. */
const AYUDA_NOMBRE_REMITENTE =
  "Cómo se ve la comunidad al lado de la dirección, por ejemplo Administración Los Almendros."

/** La nota honesta de la pestaña «Correo SMTP» de Configuración Global. */
const AVISO_CREDENCIAL_EN_CONSOLA =
  "La contraseña del buzón no se edita acá: se carga cifrada en la consola de la comunidad, junto con el servidor, el puerto y la casilla, y esa credencial se usa antes que la del entorno."

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

/**
 * Servidor falso de la consola: el `GET` dice que la comunidad no tiene credencial y
 * el `PUT` devuelve la credencial guardada con lo que llegó, que es lo que haría la
 * ruta real. Así el éxito de la pantalla se afirma contra la respuesta y no contra lo
 * tipeado.
 */
function servirConsola(): void {
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      const metodo = init?.method ?? "GET"
      if (metodo === "PUT" && url === RUTA_CREDENCIAL) {
        const cuerpo = cuerpoDe([entrada, init]) ?? {}
        return respuestaJson(
          {
            configurada: true,
            host: cuerpo.host,
            puerto: cuerpo.puerto,
            usuario: cuerpo.usuario,
            actualizadoEn: "2026-04-02T09:30:00.000Z",
            actualizadoPor: "usr-admin",
          },
          201
        )
      }
      if (metodo === "GET" && url === RUTA_CREDENCIAL) {
        return respuestaJson(CREDENCIAL_AUSENTE)
      }
      return respuestaJson({ error: "ruta no prevista" }, 500)
    }
  )
}

/** Completa el formulario de la consola con lo que escribiría una persona. */
async function completarConsola(
  user: ReturnType<typeof userEvent.setup>,
  opciones: { host: string; usuario: string }
): Promise<void> {
  await user.type(screen.getByLabelText("Servidor de correo"), opciones.host)
  await user.type(screen.getByLabelText("Puerto"), "587")
  await user.type(screen.getByLabelText("Casilla de correo"), opciones.usuario)
  await user.type(
    screen.getByLabelText("Contraseña del buzón"),
    SECRETO
  )
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

describe("Credencial de correo — la casilla no repite el dominio", () => {
  it("escribir sólo la parte local completa el dominio del servidor y es lo que viaja", async () => {
    const user = userEvent.setup({ delay: null })
    servirConsola()

    render(<ConsolaCredencialCorreo puedeEditar />)
    await screen.findByText(
      "La comunidad no tiene una credencial de correo guardada."
    )

    await completarConsola(user, { host: SERVIDOR_PROPIO, usuario: "soporte" })

    // El resultado completo se VE antes de guardar: el dominio lo puso la pantalla
    // con el del servidor, y lo dice.
    expect(screen.getByText(PREVIO_DOMINIO_COMPLETADO)).toBeTruthy()

    await user.click(
      screen.getByRole("button", { name: "Guardar credencial" })
    )
    await waitFor(() => expect(llamadas(RUTA_CREDENCIAL, "PUT")).toHaveLength(1))

    // Lo que viaja al endpoint es la dirección COMPLETA: el contrato no cambia.
    expect(cuerpoDe(llamadas(RUTA_CREDENCIAL, "PUT")[0])?.usuario).toBe(
      `soporte@${DOMINIO_PROPIO}`
    )
    // Y el éxito se declara con lo que devolvió el servidor.
    expect(
      await screen.findByText(
        `El servidor guardó la credencial de correo de la comunidad: ${SERVIDOR_PROPIO}:587 como soporte@${DOMINIO_PROPIO}.`
      )
    ).toBeTruthy()
  })

  it("pegar la dirección completa la deja igual, aunque el servidor sea de un proveedor público", async () => {
    const user = userEvent.setup({ delay: null })
    servirConsola()

    render(<ConsolaCredencialCorreo puedeEditar />)
    await screen.findByText(
      "La comunidad no tiene una credencial de correo guardada."
    )

    await completarConsola(user, {
      host: SERVIDOR_PUBLICO,
      usuario: "ventas@comunidadvecinos.cl",
    })

    // Se ve tal cual se escribió: no se reescribe lo que ya viene completo.
    expect(screen.getByText(PREVIO_DIRECCION_COMPLETA)).toBeTruthy()

    await user.click(
      screen.getByRole("button", { name: "Guardar credencial" })
    )
    await waitFor(() => expect(llamadas(RUTA_CREDENCIAL, "PUT")).toHaveLength(1))

    expect(cuerpoDe(llamadas(RUTA_CREDENCIAL, "PUT")[0])).toEqual({
      host: SERVIDOR_PUBLICO,
      puerto: 587,
      usuario: "ventas@comunidadvecinos.cl",
      secreto: SECRETO,
    })
  })

  it("de un servidor público no deduce dominio: pide la dirección completa y no inventa nada", async () => {
    const user = userEvent.setup({ delay: null })
    servirConsola()

    const { container } = render(<ConsolaCredencialCorreo puedeEditar />)
    await screen.findByText(
      "La comunidad no tiene una credencial de correo guardada."
    )

    await completarConsola(user, { host: SERVIDOR_PUBLICO, usuario: "soporte" })

    // Lo dice con todas las letras: sin dominio deducible, la dirección va completa.
    expect(screen.getByText(AVISO_SIN_DOMINIO)).toBeTruthy()
    // No hay resultado inventado: ni un `soporte@gmail.com` de fantasía.
    expect(screen.queryByText(/Se va a guardar como/)).toBeNull()
    expect(container.textContent ?? "").not.toContain("soporte@gmail.com")

    // Y no se puede guardar a medias: el botón queda deshabilitado y no sale nada.
    const guardar = screen.getByRole("button", {
      name: "Guardar credencial",
    }) as HTMLButtonElement
    expect(guardar.disabled).toBe(true)
    await user.click(guardar)
    expect(llamadas(RUTA_CREDENCIAL, "PUT")).toHaveLength(0)
  })
  it("sin servidor tampoco completa el dominio: lo dice en vez de adivinar", async () => {
    const user = userEvent.setup({ delay: null })
    servirConsola()

    render(<ConsolaCredencialCorreo puedeEditar />)
    await screen.findByText(
      "La comunidad no tiene una credencial de correo guardada."
    )

    // Sólo la parte local y ningún servidor del que sacar el dominio.
    await user.type(screen.getByLabelText("Casilla de correo"), "soporte")

    expect(
      screen.getByText(
        "El dominio se completa desde el servidor: escribí primero el servidor, o la dirección completa con arroba."
      )
    ).toBeTruthy()
    expect(screen.queryByText(/Se va a guardar como/)).toBeNull()
    expect(
      (screen.getByRole("button", {
        name: "Guardar credencial",
      }) as HTMLButtonElement).disabled
    ).toBe(true)
  })
})

describe("Configuración Global — el remitente explica su rol y la credencial vive en su consola", () => {
  it("la ayuda del remitente dice qué ve el vecino y que no es el usuario del sistema", async () => {
    const user = userEvent.setup({ delay: null })
    fetchFalso.mockImplementation(
      async (entrada: unknown): Promise<Response> =>
        String(entrada) === "/api/configuracion"
          ? respuestaJson(CONFIGURACION)
          : respuestaJson({ error: "ruta no prevista" }, 404)
    )

    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ConfiguracionPage />
      </SWRConfig>
    )
    // El formulario se pinta con la configuración de la base ya cargada.
    await screen.findByRole("button", { name: "Guardar Cambios" })
    await user.click(screen.getByRole("tab", { name: /Correo SMTP/ }))

    const ayudaRemitente = await screen.findByText(AYUDA_REMITENTE)
    // El rol, que es la queja: la cara pública de la comunidad, no la cuenta de acceso.
    expect(ayudaRemitente.textContent).toContain(
      "Es la dirección que va a ver el vecino cuando abra su correo."
    )
    expect(ayudaRemitente.textContent).toContain(
      "No es tu usuario para entrar al sistema"
    )
    expect(screen.getByText(AYUDA_NOMBRE_REMITENTE)).toBeTruthy()

    // La trampa de la pestaña, dicha: la contraseña se carga en la consola, y el
    // enlace lleva ahí.
    expect(screen.getByText(AVISO_CREDENCIAL_EN_CONSOLA)).toBeTruthy()
    expect(
      screen.getByRole("link", {
        name: "Ir a la credencial de correo de la comunidad",
      })
    ).toHaveAttribute("href", "/admin/configuracion/correo")
  })

  it("los campos de la pestaña siguen editándose como antes", async () => {
    const user = userEvent.setup({ delay: null })
    fetchFalso.mockImplementation(
      async (entrada: unknown): Promise<Response> =>
        String(entrada) === "/api/configuracion"
          ? respuestaJson(CONFIGURACION)
          : respuestaJson({ error: "ruta no prevista" }, 404)
    )

    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ConfiguracionPage />
      </SWRConfig>
    )
    await screen.findByRole("button", { name: "Guardar Cambios" })
    await user.click(screen.getByRole("tab", { name: /Correo SMTP/ }))

    // El formulario no cambió: el remitente sigue siendo un campo editable con el
    // valor de la base como valor inicial.
    const remitente = screen.getByDisplayValue(
      CONFIGURACION.smtpFrom
    ) as HTMLInputElement
    await user.clear(remitente)
    await user.type(remitente, "remitente@comunidadlosalmendros.cl")
    expect(remitente.value).toBe("remitente@comunidadlosalmendros.cl")
  })
})
