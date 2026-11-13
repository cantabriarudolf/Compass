// @vitest-environment jsdom
/**
 * Pantalla de la credencial de correo de la comunidad (U5 de
 * «saldar-v2-pantallas-y-barrido» · S1 y S2 · F33).
 *
 * `GET`/`PUT /api/configuracion/correo` y `POST /api/configuracion/correo/probar`
 * existen desde F33 y la credencial por comunidad no tenía cara visible: hasta acá
 * la contraseña del buzón se cargaba con curl. Lo que este test fija de la pantalla
 * que les pone la cara:
 *
 *   1. pinta el estado que devuelve el `GET` —configurada o no— con el host, el
 *      puerto, el usuario y cuándo y quién la actualizó;
 *   2. el SECRETO no está en el DOM: ni el valor, ni una máscara que pretenda
 *      mostrarlo. El `GET` no lo devuelve (su `select` ni siquiera pide las
 *      columnas del cifrado); el test sirve además un cuerpo con `secreto`,
 *      `secretoCifrado`, `iv` y `authTag` para probar que la pantalla lee el
 *      contrato campo por campo y no vuelca la respuesta;
 *   3. el campo de la contraseña arranca VACÍO y se vacía después de guardar: la
 *      guardada no se muestra nunca, así que la persona tiene que escribirla
 *      entera para guardarla o rotarla;
 *   4. el guardado manda EXACTAMENTE `{ host, puerto, usuario, secreto }`, con el
 *      puerto como número, y el éxito se declara con los valores que devolvió el
 *      servidor —no con lo que se tipeó—;
 *   5. el 500 de la clave maestra ausente se muestra verbatim y sin declarar éxito:
 *      es el guardado fallando cerrado, no un defecto de la pantalla;
 *   6. la prueba de envío repite el veredicto del servidor: el texto del proveedor
 *      tal cual cuando falla, y el `messageId` cuando aceptó. La pantalla no
 *      declara «enviado» ni «llegó» por su cuenta;
 *   7. el portón es el de la matriz (`cf`), el mismo que piden las rutas: `ver`
 *      para entrar (administración y comité) y `editar` para guardar y probar
 *      (sólo administración).
 *
 * Se monta la consola (no el `page.tsx`) porque la página es un server component
 * `async` que espera `auth()` y no se puede montar en jsdom; lo único que decide es
 * el portón y pasar el permiso, así que el caso de permisos se afirma con la matriz
 * real (`tienePermiso`), igual que el resto de las pantallas de esta serie.
 *
 * El servidor REST es falso vía `vi.stubGlobal("fetch", …)`.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import { ConsolaCredencialCorreo } from "@/app/admin/configuracion/correo/_componentes/correo"
import {
  puedeEditarCredencialCorreo,
  puedeVerCredencialCorreo,
} from "@/app/admin/configuracion/correo/alcance"

const RUTA_CREDENCIAL = "/api/configuracion/correo"
const RUTA_PRUEBA = "/api/configuracion/correo/probar"

/**
 * La contraseña del buzón: el único dato de F33 que no puede salir del servidor.
 * El valor es deliberadamente inconfundible para poder buscarlo en el DOM.
 */
const SECRETO_SERVIDOR = "clave-smtp-que-nunca-viaja-9f3a"
const SECRETO_NUEVO = "clave-que-escribe-la-persona-7b21"

/** El estado configurado, con la forma EXACTA del contrato del `GET`. */
const CREDENCIAL_CONFIGURADA = {
  configurada: true,
  host: "smtp.comunidad.cl",
  puerto: 587,
  usuario: "notificaciones@comunidad.cl",
  actualizadoEn: "2026-03-05T12:00:00.000Z",
  actualizadoPor: "usr-admin",
} as const

/** Una comunidad que todavía no guardó credencial: el estado vacío explícito. */
const CREDENCIAL_AUSENTE = {
  configurada: false,
  host: null,
  puerto: null,
  usuario: null,
  actualizadoEn: null,
  actualizadoPor: null,
} as const

/**
 * El 500 del guardado cuando falta la clave maestra
 * (`app/api/configuracion/correo/route.ts`): la pantalla lo pinta tal cual, así que
 * el texto del test es el de la ruta, no una paráfrasis.
 */
const MENSAJE_SIN_CLAVE =
  "No se puede guardar la credencial de correo: falta la clave maestra de secretos en el servidor (CLAVE_MAESTRA_SECRETOS)."

/**
 * El motivo que devuelve `POST …/probar` cuando el proveedor rechaza el envío: el
 * texto del proveedor —código y detalle— tal como lo reenvía `lib/smtp.ts`.
 */
const MOTIVO_PROVEEDOR =
  "Falló el envío por SMTP: 535 5.7.8 Autenticación rechazada: credenciales inválidas"

/** El párrafo que explica por qué el 500 de la clave maestra no es un bug. */
const EXPLICACION_CIFRADO =
  "La contraseña se guarda cifrada en la base (AES-256-GCM) con una clave maestra que vive sólo en el entorno del servidor: no está en la base, no viaja al navegador y no vuelve en ninguna respuesta. Si esa clave falta o es inválida el guardado falla cerrado —responde 500 nombrando CLAVE_MAESTRA_SECRETOS y no escribe nada—, así que ese 500 no es un defecto de la pantalla."

const AVISO_SIN_CREDENCIAL =
  "La comunidad no tiene una credencial de correo guardada."

const AVISO_SIN_CREDENCIAL_PRUEBA =
  "Mientras no haya una credencial guardada, la prueba de envío responde que no hay nada que probar."

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

/** Las llamadas a un método concreto sobre una ruta exacta, en orden. */
function llamadas(url: string, metodo: string): unknown[][] {
  return fetchFalso.mock.calls.filter(
    (llamada) =>
      String(llamada[0]) === url && (initDe(llamada)?.method ?? "GET") === metodo
  )
}

/** El cuerpo JSON de una llamada, o `null` si no viajó cuerpo. */
function cuerpoDe(llamada: unknown[] | undefined): unknown {
  const cuerpo = initDe(llamada)?.body
  return typeof cuerpo === "string" ? JSON.parse(cuerpo) : null
}

interface RespuestaFalsa {
  status?: number
  cuerpo: unknown
}

/**
 * Instala el servidor falso. El `GET` de la credencial y el `PUT` comparten ruta, así
 * que se separan por método; el `POST` de la prueba vive en `…/probar` y se despacha
 * antes de la ruta base para no confundir el prefijo.
 */
function servir(manejadores: {
  credencial?: RespuestaFalsa
  put?: () => RespuestaFalsa
  probar?: () => RespuestaFalsa
}): void {
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      const metodo = init?.method ?? "GET"

      if (metodo === "POST" && url === RUTA_PRUEBA) {
        const probar = manejadores.probar?.()
        if (!probar) return respuestaJson({ error: "POST no previsto" }, 500)
        return respuestaJson(probar.cuerpo, probar.status ?? 200)
      }
      if (metodo === "PUT" && url === RUTA_CREDENCIAL) {
        const put = manejadores.put?.()
        if (!put) return respuestaJson({ error: "PUT no previsto" }, 500)
        return respuestaJson(put.cuerpo, put.status ?? 200)
      }
      if (metodo === "GET" && url === RUTA_CREDENCIAL) {
        const credencial = manejadores.credencial
        return respuestaJson(
          credencial ? credencial.cuerpo : CREDENCIAL_AUSENTE,
          credencial ? (credencial.status ?? 200) : 200
        )
      }
      return respuestaJson({ error: "ruta no prevista" }, 500)
    }
  )
}

/** Completa el formulario con lo que la persona escribiría para guardar o rotar. */
async function completarFormulario(
  user: ReturnType<typeof userEvent.setup>,
  opciones: {
    host?: string
    puerto?: string
    usuario?: string
    secreto?: string
  } = {}
): Promise<void> {
  await user.type(
    screen.getByLabelText("Servidor SMTP"),
    opciones.host ?? "smtp.comunidad.cl"
  )
  await user.type(screen.getByLabelText("Puerto"), opciones.puerto ?? "587")
  await user.type(
    screen.getByLabelText("Usuario SMTP"),
    opciones.usuario ?? "notificaciones@comunidad.cl"
  )
  await user.type(
    screen.getByLabelText("Contraseña SMTP"),
    opciones.secreto ?? SECRETO_NUEVO
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

describe("Credencial de correo — el estado lo dice el servidor", () => {
  it("pinta la credencial configurada y el secreto no aparece en el DOM", async () => {
    servir({
      credencial: {
        cuerpo: {
          ...CREDENCIAL_CONFIGURADA,
          // La ruta NO devuelve estos campos: su `select` ni siquiera pide las
          // columnas del cifrado. El test los sirve igual para probar que la
          // pantalla pinta el contrato campo por campo y no vuelca la respuesta:
          // si algún día el servidor los mandara, tampoco llegarían a la pantalla.
          secreto: SECRETO_SERVIDOR,
          secretoCifrado: "paquete-cifrado-que-tampoco-se-pinta",
          iv: "iv-que-tampoco-se-pinta",
          authTag: "auth-tag-que-tampoco-se-pinta",
        },
      },
    })

    const { container } = render(<ConsolaCredencialCorreo puedeEditar />)

    // Lo que devolvió el servidor, tal cual: el host, el puerto, el usuario, cuándo
    // se guardó y quién lo hizo.
    expect(await screen.findByText("Configurada")).toBeTruthy()
    expect(screen.getByText("smtp.comunidad.cl")).toBeTruthy()
    expect(screen.getByText("587")).toBeTruthy()
    expect(screen.getByText("notificaciones@comunidad.cl")).toBeTruthy()
    expect(screen.getByText("2026-03-05 12:00 UTC")).toBeTruthy()
    expect(screen.getByText("usr-admin")).toBeTruthy()
    expect(lecturas(RUTA_CREDENCIAL)).toHaveLength(1)

    // El secreto no está en el documento —ni el valor, ni el paquete cifrado— …
    const html = container.innerHTML
    expect(html).not.toContain(SECRETO_SERVIDOR)
    expect(html).not.toContain("paquete-cifrado-que-tampoco-se-pinta")
    expect(html).not.toContain("auth-tag-que-tampoco-se-pinta")

    // …ni un sustituto que aparente mostrarlo: el campo de la contraseña está
    // vacío y su placeholder no promete una máscara de la guardada.
    const campoSecreto = screen.getByLabelText(
      "Contraseña SMTP"
    ) as HTMLInputElement
    expect(campoSecreto.value).toBe("")
    expect(campoSecreto.type).toBe("password")
    expect(campoSecreto.getAttribute("placeholder") ?? "").not.toContain(
      SECRETO_SERVIDOR
    )
    expect(campoSecreto.getAttribute("placeholder") ?? "").not.toMatch(
      /•|\*/
    )
    expect(container.textContent ?? "").not.toMatch(/•+|\*{3,}|·{3,}/)

    // La explicación del cifrado está en pantalla antes de que falle nada.
    expect(screen.getByText(EXPLICACION_CIFRADO)).toBeTruthy()
  })

  it("sin credencial lo dice explícitamente y no inventa valores", async () => {
    servir({})

    render(<ConsolaCredencialCorreo puedeEditar />)

    expect(await screen.findByText(AVISO_SIN_CREDENCIAL)).toBeTruthy()
    expect(screen.getByText(AVISO_SIN_CREDENCIAL_PRUEBA)).toBeTruthy()
    expect(screen.queryByText("Configurada")).toBeNull()
    // No se pinta el bloque de datos con valores vacíos: sin credencial no hay nada
    // que leer (el formulario, en cambio, sí existe para poder guardarla).
    expect(screen.queryByText("Actualizada")).toBeNull()
    expect(screen.queryByText("Actualizada por")).toBeNull()
    // La explicación del cifrado no depende de que haya credencial.
    expect(screen.getByText(EXPLICACION_CIFRADO)).toBeTruthy()
  })

  it("si la lectura falla se muestra el error de la API y no se afirma el estado", async () => {
    servir({
      credencial: { status: 403, cuerpo: { error: "Permiso denegado." } },
    })

    render(<ConsolaCredencialCorreo puedeEditar />)

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Permiso denegado."
    )
    // Sin lectura no se declara «configurada» ni «sin credencial»: no se sabe.
    expect(screen.queryByText("Configurada")).toBeNull()
    expect(screen.queryByText(AVISO_SIN_CREDENCIAL)).toBeNull()
  })
})

describe("Credencial de correo — guardar manda el cuerpo exacto", () => {
  it("guarda con { host, puerto, usuario, secreto } y vacía la contraseña", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      credencial: { cuerpo: CREDENCIAL_AUSENTE },
      put: () => ({ status: 201, cuerpo: CREDENCIAL_CONFIGURADA }),
    })

    const { container } = render(<ConsolaCredencialCorreo puedeEditar />)
    await screen.findByText(AVISO_SIN_CREDENCIAL)

    // El campo de la contraseña arranca vacío: la guardada no se muestra nunca.
    expect(
      (screen.getByLabelText("Contraseña SMTP") as HTMLInputElement).value
    ).toBe("")

    await completarFormulario(user)
    await user.click(
      screen.getByRole("button", { name: "Guardar credencial" })
    )

    await waitFor(() => expect(llamadas(RUTA_CREDENCIAL, "PUT")).toHaveLength(1))
    // EXACTAMENTE el cuerpo de `CredencialCorreoComunidadSchema`: el `puerto` viaja
    // como número y no hay `id`, `comunidadId` ni `actualizadoPor` — el scope y la
    // auditoría los decide el servidor.
    expect(cuerpoDe(llamadas(RUTA_CREDENCIAL, "PUT")[0])).toEqual({
      host: "smtp.comunidad.cl",
      puerto: 587,
      usuario: "notificaciones@comunidad.cl",
      secreto: SECRETO_NUEVO,
    })

    // El éxito se declara con lo que devolvió el servidor, no con lo tipeado.
    expect(
      await screen.findByText(
        "El servidor guardó la credencial de correo de la comunidad: smtp.comunidad.cl:587 como notificaciones@comunidad.cl."
      )
    ).toBeTruthy()

    // El estado que se pinta es el de la respuesta del PUT…
    expect(screen.getByText("2026-03-05 12:00 UTC")).toBeTruthy()

    // …y la contraseña tipeada no queda en el formulario ni en el documento.
    const campoSecreto = screen.getByLabelText(
      "Contraseña SMTP"
    ) as HTMLInputElement
    expect(campoSecreto.value).toBe("")
    expect(container.innerHTML).not.toContain(SECRETO_NUEVO)
    // No se releyó la credencial: la respuesta del PUT es la fuente del estado nuevo.
    expect(lecturas(RUTA_CREDENCIAL)).toHaveLength(1)
  })

  it("el 500 de la clave maestra ausente se muestra verbatim y no declara éxito", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      credencial: { cuerpo: CREDENCIAL_AUSENTE },
      put: () => ({ status: 500, cuerpo: { error: MENSAJE_SIN_CLAVE } }),
    })

    render(<ConsolaCredencialCorreo puedeEditar />)
    await screen.findByText(AVISO_SIN_CREDENCIAL)

    await completarFormulario(user)
    await user.click(
      screen.getByRole("button", { name: "Guardar credencial" })
    )

    // El mensaje del servidor, tal cual: falla cerrada y nombra la variable.
    expect((await screen.findByRole("alert")).textContent).toBe(
      MENSAJE_SIN_CLAVE
    )
    // La pantalla ya explicó que ese 500 es la protección y no un bug…
    expect(screen.getByText(EXPLICACION_CIFRADO)).toBeTruthy()
    // …y no declara guardada una credencial que no se escribió.
    expect(screen.queryByText(/El servidor guardó/)).toBeNull()
    expect(screen.getByText(AVISO_SIN_CREDENCIAL)).toBeTruthy()
    // El formulario conserva lo escrito: nada se guardó y nada se limpia.
    expect(
      (screen.getByLabelText("Servidor SMTP") as HTMLInputElement).value
    ).toBe("smtp.comunidad.cl")
  })
})

describe("Credencial de correo — la prueba de envío repite el veredicto del servidor", () => {
  it("muestra el error exacto del proveedor cuando no se pudo enviar", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      credencial: { cuerpo: CREDENCIAL_CONFIGURADA },
      probar: () => ({
        status: 200,
        cuerpo: { enviado: false, motivo: MOTIVO_PROVEEDOR },
      }),
    })

    render(<ConsolaCredencialCorreo puedeEditar />)
    await screen.findByText("Configurada")

    await user.click(screen.getByRole("button", { name: "Probar envío" }))

    // El texto del proveedor, verbatim: es la única fuente de la verdad del envío.
    expect((await screen.findByRole("alert")).textContent).toBe(
      MOTIVO_PROVEEDOR
    )
    // Sin éxito declarado por la pantalla: `enviado: false` no se pinta como éxito.
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByText(/aceptó el envío/)).toBeNull()

    // Un POST a la ruta de prueba, sin cuerpo: el destinatario es el correo de la
    // sesión y lo resuelve el servidor, no la pantalla.
    expect(llamadas(RUTA_PRUEBA, "POST")).toHaveLength(1)
    expect(cuerpoDe(llamadas(RUTA_PRUEBA, "POST")[0])).toBeNull()
  })

  it("cuando el servidor aceptó, repite su veredicto y no afirma que llegó", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      credencial: { cuerpo: CREDENCIAL_CONFIGURADA },
      probar: () => ({
        status: 200,
        cuerpo: {
          enviado: true,
          messageId: "<20260305.1@smtp.comunidad.cl>",
        },
      }),
    })

    render(<ConsolaCredencialCorreo puedeEditar />)
    await screen.findByText("Configurada")

    await user.click(screen.getByRole("button", { name: "Probar envío" }))

    const estado = await screen.findByRole("status")
    expect(estado.textContent).toBe(
      "El servidor aceptó el envío de prueba (messageId: <20260305.1@smtp.comunidad.cl>)."
    )
    // «Aceptado» no es «entregado»: la constancia de la entrega no la tiene la API.
    expect(
      screen.getByText(
        "Que el correo llegue a la bandeja lo confirma quien lo recibe: la pantalla sólo repite lo que respondió el servidor."
      )
    ).toBeTruthy()
    expect(screen.queryByText(/llegó|entregado/)).toBeNull()
  })

  it("el 500 de la clave maestra al probar también se muestra verbatim", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      credencial: { cuerpo: CREDENCIAL_CONFIGURADA },
      probar: () => ({
        status: 500,
        cuerpo: {
          error:
            "No se puede probar el envío: falta la clave maestra de secretos en el servidor (CLAVE_MAESTRA_SECRETOS).",
        },
      }),
    })

    render(<ConsolaCredencialCorreo puedeEditar />)
    await screen.findByText("Configurada")

    await user.click(screen.getByRole("button", { name: "Probar envío" }))

    expect((await screen.findByRole("alert")).textContent).toBe(
      "No se puede probar el envío: falta la clave maestra de secretos en el servidor (CLAVE_MAESTRA_SECRETOS)."
    )
    expect(screen.queryByRole("status")).toBeNull()
  })
})

describe("Credencial de correo — el portón es el de la matriz", () => {
  it("administración ve y edita; el comité sólo lee; el resto no entra", () => {
    // Las dos claves que piden las rutas: `cf` con `ver` (GET) y con `editar`
    // (PUT y la prueba de envío). La administración entra por el wildcard.
    expect(puedeVerCredencialCorreo(["administrador"])).toBe(true)
    expect(puedeEditarCredencialCorreo(["administrador"])).toBe(true)

    // El comité LEE la configuración para auditarla, pero no la opera: la matriz le
    // da `cf` ver y no `cf` editar, y las rutas responden 403 igual.
    expect(puedeVerCredencialCorreo(["comite"])).toBe(true)
    expect(puedeEditarCredencialCorreo(["comite"])).toBe(false)

    // Ni el residente ni conserjería ni mantención alcanzan la clave.
    for (const rol of ["residente", "conserjeria", "mantencion"]) {
      expect(puedeVerCredencialCorreo([rol])).toBe(false)
      expect(puedeEditarCredencialCorreo([rol])).toBe(false)
    }
    expect(puedeVerCredencialCorreo([])).toBe(false)
  })

  it("sin `editar` se lee el estado y no se ofrece guardar ni probar", async () => {
    servir({ credencial: { cuerpo: CREDENCIAL_CONFIGURADA } })

    render(<ConsolaCredencialCorreo puedeEditar={false} />)

    // El comité entra y lee la credencial de la comunidad…
    expect(await screen.findByText("Configurada")).toBeTruthy()
    expect(screen.getByText("smtp.comunidad.cl")).toBeTruthy()

    // …pero no se le pinta un formulario ni una prueba condenados al 403 de la ruta.
    expect(screen.queryByRole("button", { name: "Guardar credencial" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Probar envío" })).toBeNull()
    expect(screen.queryByLabelText("Contraseña SMTP")).toBeNull()
    // Y no se le pide nada al servidor que no pueda hacer.
    expect(llamadas(RUTA_CREDENCIAL, "PUT")).toHaveLength(0)
    expect(llamadas(RUTA_PRUEBA, "POST")).toHaveLength(0)
  })
})
