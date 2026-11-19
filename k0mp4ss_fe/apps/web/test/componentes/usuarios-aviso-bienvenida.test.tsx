// @vitest-environment jsdom
/**
 * Cuentas y acceso — el estado del correo de bienvenida (F43 · T4 · S4/S5).
 *
 * Qué fija este archivo:
 *
 *   1. El envío del aviso es un EJE DISTINTO del estado de la invitación y se
 *      pinta en su propia columna: la invitación dice si el enlace sirve
 *      (pendiente / usada / vencida), el correo dice qué pasó con el aviso.
 *      Ninguno se deriva del otro ni se mezclan en un solo chip.
 *   2. Los tres estados que registra el servidor tienen su propio chip: el
 *      envío aceptado (`enviado`), la cola sin emisor (`pendiente`) y el rechazo
 *      del servidor (`fallido`). En `pendiente` y `fallido` el motivo se muestra
 *      TAL CUAL lo escribió el servidor, sin traducirlo a un «reintentá» genérico
 *      que borraría la razón real.
 *   3. `envio: null` es su propio texto: nadie intentó ese envío (invitaciones
 *      anteriores a F43 o sin intento registrado). Nunca un chip vacío, nunca una
 *      raya, nunca la palabra `pendiente`, que afirmaría un intento que no hubo.
 *   4. El reenvío NO se pinta desde el 200 del clic. El estado sale del servidor:
 *      la respuesta trae el enlace nuevo y la constancia aparece en la relectura
 *      del listado, que es la única que conoce el desenlace real. Un envío
 *      `fallido` se pinta `fallido` con su motivo, jamás `enviado`.
 *
 * El servidor REST es falso vía `vi.stubGlobal("fetch", …)`, igual que
 * `usuarios-pantalla.test.tsx`: se monta la consola (no el `page.tsx`, que es un
 * server component `async`), con `instalarEntornoRadix()` para los `Select` y un
 * `SWRConfig` con provider propio para que la caché no sangre entre casos.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { instalarEntornoRadix } from "./entorno-radix"
import { ConsolaUsuarios } from "@/app/admin/usuarios/_componentes/consola-usuarios"

// Mismo piso que el resto de los tests de componentes: Radix + SWR rozan el
// default de Vitest en una máquina cargada.
vi.setConfig({ testTimeout: 60_000 })

const RUTA_CUENTAS = "/api/admin/usuarios"
const RUTA_LISTA = "/api/admin/usuarios?comunidadId=com-1"
const RUTA_REENVIO = "/api/admin/usuarios/invitacion?comunidadId=com-1"
const COMUNIDAD = { id: "com-1", nombre: "Comunidad Test", rol: "administrador" }
type ComunidadFalsa = typeof COMUNIDAD

const PERSONAS = [
  {
    id: "per-1",
    nombres: "Ana",
    apellidos: "Pérez",
    rut: "11.111.111-1",
    nombreCompleto: "Ana Pérez",
    email: "ana@test.cl",
    telefonoMovil: "+56911111111",
    estadoCuenta: "activa",
    roles: [],
    condicionesEspecialesIds: [],
  },
]

/**
 * Motivos literales, con la forma que persiste el servidor: el de la cola sin
 * emisor (`MOTIVO_SIN_SMTP`) y el de un rebote con el texto del emisor. El test
 * comprueba que la pantalla los pinte VERBATIM, así que la aserción es sobre la
 * misma cadena: si la pantalla la retoca, falla.
 */
const MOTIVO_SIN_EMISOR =
  "Sin emisor SMTP configurado (F4): el correo del aviso queda en la cola de salida (outbox) y no se reporta como enviado."
const MOTIVO_ACEPTADO = "Aceptado por el servidor SMTP (id f43-bienvenida-1)."
const MOTIVO_REBOTE =
  "550 relay not permitted: el servidor rechazó el mensaje del dominio de la comunidad."

type EstadoEnvioFalso = "enviado" | "pendiente" | "fallido"

interface EnvioFalso {
  estado: EstadoEnvioFalso
  motivo: string | null
  enviadoEn: string | null
}

interface InvitacionFalsa {
  id: string
  estado: "pendiente" | "vencida" | "usada"
  expiraEn: string
  usadoEn: string | null
  creadoEn: string
  envio: EnvioFalso | null
}

interface CuentaFalsa {
  membresiaId: string
  rol: string
  comunidadId: string
  usuario: { id: string; email: string; personaId: string | null; activo: boolean }
  invitacion: InvitacionFalsa | null
}

/**
 * Las cinco formas de la constancia, una por fila:
 *
 *   · `admin@test.cl`        envío aceptado (y una invitación ya usada)
 *   · `residente@test.cl`    cola sin emisor: `pendiente` con el motivo del servidor
 *   · `comite@test.cl`       rebote: `fallido` con el motivo del servidor
 *   · `conserjeria@test.cl`  `envio: null`: nadie intentó ese envío
 *   · `mantencion@test.cl`   sin invitación: no hay correo que juzgar
 *
 * `enviado` viaja con motivo porque el servidor lo escribe («aceptado por el
 * servidor SMTP»): la fila lo lee y NO lo pinta, porque el chip ya dice el hecho
 * y la fecha es el dato útil.
 */
const CUENTAS: CuentaFalsa[] = [
  {
    membresiaId: "m-1",
    rol: "administrador",
    comunidadId: "com-1",
    usuario: { id: "u-1", email: "admin@test.cl", personaId: null, activo: true },
    invitacion: {
      id: "inv-1",
      estado: "usada",
      expiraEn: "2026-11-10T12:00:00.000Z",
      usadoEn: "2026-11-09T15:30:00.000Z",
      creadoEn: "2026-11-06T15:30:00.000Z",
      envio: {
        estado: "enviado",
        motivo: MOTIVO_ACEPTADO,
        enviadoEn: "2026-11-06T15:30:00.000Z",
      },
    },
  },
  {
    membresiaId: "m-2",
    rol: "residente",
    comunidadId: "com-1",
    usuario: { id: "u-2", email: "residente@test.cl", personaId: "per-1", activo: true },
    invitacion: {
      id: "inv-2",
      estado: "pendiente",
      expiraEn: "2026-11-21T12:00:00.000Z",
      usadoEn: null,
      creadoEn: "2026-11-18T12:00:00.000Z",
      envio: {
        estado: "pendiente",
        motivo: MOTIVO_SIN_EMISOR,
        enviadoEn: null,
      },
    },
  },
  {
    membresiaId: "m-3",
    rol: "comite",
    comunidadId: "com-1",
    usuario: { id: "u-3", email: "comite@test.cl", personaId: null, activo: true },
    invitacion: {
      id: "inv-3",
      estado: "pendiente",
      expiraEn: "2026-11-22T12:00:00.000Z",
      usadoEn: null,
      creadoEn: "2026-11-19T12:00:00.000Z",
      envio: {
        estado: "fallido",
        motivo: MOTIVO_REBOTE,
        enviadoEn: null,
      },
    },
  },
  {
    membresiaId: "m-4",
    rol: "conserjeria",
    comunidadId: "com-1",
    usuario: {
      id: "u-4",
      email: "conserjeria@test.cl",
      personaId: null,
      activo: true,
    },
    invitacion: {
      id: "inv-4",
      estado: "usada",
      expiraEn: "2026-11-12T12:00:00.000Z",
      usadoEn: "2026-11-11T09:00:00.000Z",
      creadoEn: "2026-11-08T09:00:00.000Z",
      envio: null,
    },
  },
  {
    membresiaId: "m-5",
    rol: "mantencion",
    comunidadId: "com-1",
    usuario: {
      id: "u-5",
      email: "mantencion@test.cl",
      personaId: null,
      activo: true,
    },
    invitacion: null,
  },
]

const ENLACE_REENVIO = "https://compass.test/invitacion?token=EnlaceDelReenvioF43"

/** Invitación que el servidor devuelve después de un reenvío rechazado por el emisor. */
const INVITACION_REENVIADA: InvitacionFalsa = {
  id: "inv-2b",
  estado: "pendiente",
  expiraEn: "2026-11-24T12:00:00.000Z",
  usadoEn: null,
  creadoEn: "2026-11-18T13:00:00.000Z",
  envio: {
    estado: "fallido",
    motivo: MOTIVO_REBOTE,
    enviadoEn: null,
  },
}

const fetchFalso = vi.fn()

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function llamadas(url: string): unknown[][] {
  return fetchFalso.mock.calls.filter((llamada) => String(llamada[0]) === url)
}

/** Lecturas del listado: el `POST` del alta comparte URL con el `GET`. */
function lecturasDelListado(): unknown[][] {
  return llamadas(RUTA_LISTA).filter((llamada) => {
    const init = llamada[1] as RequestInit | undefined
    return (init?.method ?? "GET") === "GET"
  })
}

interface PostFalso {
  status?: number
  cuerpo: unknown
}

/**
 * Servidor falso. El listado se sirve con `cuentas` (mutable: el caso del reenvío
 * cambia la fila para probar que la pantalla pinta lo que devuelve el SERVIDOR) y
 * el reenvío responde como la ruta: el enlace nuevo y la invitación proyectada
 * antes de que el correo salga, así que su `envio` todavía es `null`. La
 * constancia real sólo aparece en la relectura del listado.
 */
function servir(
  manejadores: {
    comunidades?: ComunidadFalsa[]
    cuentas?: () => CuentaFalsa[]
    reenvio?: (cuerpo: unknown) => PostFalso
  } = {}
): void {
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      const metodo = init?.method ?? "GET"

      if (metodo === "GET" && url === RUTA_CUENTAS) {
        return respuestaJson({ comunidades: manejadores.comunidades ?? [COMUNIDAD] })
      }
      if (metodo === "GET" && url === RUTA_LISTA) {
        const cuentas = (manejadores.cuentas ?? (() => CUENTAS))()
        return respuestaJson({
          comunidadId: COMUNIDAD.id,
          comunidadNombre: COMUNIDAD.nombre,
          total: cuentas.length,
          membresias: cuentas,
        })
      }
      if (metodo === "GET" && url.startsWith("/api/personas")) {
        return respuestaJson({
          data: PERSONAS,
          total: PERSONAS.length,
          page: 1,
          pageSize: 100,
        })
      }
      if (metodo === "POST" && url === RUTA_REENVIO) {
        const post = manejadores.reenvio?.(null)
        if (!post) throw new Error(`sin respuesta falsa para ${url}`)
        return respuestaJson(post.cuerpo, post.status ?? 201)
      }
      throw new Error(`fetch inesperado: ${metodo} ${url}`)
    }
  )
}

/** Monta la consola con caché SWR propia (sin sangrado entre casos). */
function montarConsola(): ReturnType<typeof render> {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ConsolaUsuarios />
    </SWRConfig>
  )
}

function filaDe(email: string): HTMLElement {
  return screen.getByRole("row", { name: new RegExp(email) })
}

/**
 * Celda de una fila por índice de columna, para poder afirmar que los dos ejes
 * (invitación y correo) viven en celdas distintas y no se mezclaron:
 * 0 = correo de la cuenta, 1 = rol, 2 = invitación, 3 = correo de bienvenida,
 * 4 = acción.
 */
function celdaDe(email: string, indice: number): HTMLElement {
  const celdas = within(filaDe(email)).getAllByRole("cell")
  const celda = celdas[indice]
  if (!celda) {
    throw new Error(`la fila ${email} no tiene la celda ${indice}`)
  }
  return celda
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

describe("Correo de bienvenida — cada estado del servidor tiene su chip", () => {
  it("el envío aceptado se pinta con su chip y su fecha, sin el motivo del servidor", async () => {
    servir()
    montarConsola()

    await waitFor(() => filaDe("admin@test.cl"))
    const aviso = celdaDe("admin@test.cl", 3)

    expect(within(aviso).getByText("Correo enviado")).toBeTruthy()
    expect(within(aviso).getByText("Enviado el 06-11-2026")).toBeTruthy()
    // El motivo del servidor existe y no se pinta: en un envío aceptado no hay
    // nada que explicar, y la pantalla no inventa una razón.
    expect(aviso.textContent).not.toContain(MOTIVO_ACEPTADO)
  })

  it("el envío pendiente se pinta con su chip y el motivo del servidor tal cual", async () => {
    servir()
    montarConsola()

    await waitFor(() => filaDe("residente@test.cl"))
    const aviso = celdaDe("residente@test.cl", 3)

    expect(within(aviso).getByText("Correo pendiente")).toBeTruthy()
    expect(within(aviso).getByText(MOTIVO_SIN_EMISOR)).toBeTruthy()
    // El servidor dio la razón: no se reemplaza por un «reintentá» genérico ni
    // por un estado que afirme otra cosa.
    expect(aviso.textContent).not.toMatch(/reintent|volv[eé] a intentar/i)
    expect(aviso.textContent).not.toContain("Correo enviado")
  })

  it("el envío fallido se pinta con su chip y el motivo del servidor tal cual", async () => {
    servir()
    montarConsola()

    await waitFor(() => filaDe("comite@test.cl"))
    const aviso = celdaDe("comite@test.cl", 3)

    expect(within(aviso).getByText("Correo fallido")).toBeTruthy()
    expect(within(aviso).getByText(MOTIVO_REBOTE)).toBeTruthy()
    expect(aviso.textContent).not.toContain("Correo enviado")
    expect(aviso.textContent).not.toMatch(/reintent|volv[eé] a intentar/i)
  })

  it("sin intento de envío lo dice con su propio texto, nunca con la palabra pendiente", async () => {
    servir()
    montarConsola()

    await waitFor(() => filaDe("conserjeria@test.cl"))
    const aviso = celdaDe("conserjeria@test.cl", 3)

    expect(within(aviso).getByText("Nunca se intentó")).toBeTruthy()
    // Nadie intentó el envío: `pendiente` afirmaría un intento que no existió, y
    // una raya o un chip vacío dejarían la columna sin decir nada.
    expect(aviso.textContent).not.toMatch(/pendiente/i)
    expect(aviso.textContent).not.toContain("—")
    expect(aviso.textContent?.trim()).not.toBe("")
  })
})

describe("Correo de bienvenida — dos ejes que no se mezclan", () => {
  it("la invitación pendiente y el correo fallido conviven en celdas distintas", async () => {
    servir()
    montarConsola()

    await waitFor(() => filaDe("comite@test.cl"))
    const invitacion = celdaDe("comite@test.cl", 2)
    const aviso = celdaDe("comite@test.cl", 3)

    // La invitación sigue diciendo lo suyo, con su fecha del servidor.
    expect(within(invitacion).getByText("Pendiente")).toBeTruthy()
    expect(within(invitacion).getByText("Vence el 22-11-2026")).toBeTruthy()
    // Y el correo lo suyo: el rechazo del emisor, en su propia celda.
    expect(within(aviso).getByText("Correo fallido")).toBeTruthy()
    expect(within(aviso).getByText(MOTIVO_REBOTE)).toBeTruthy()

    // Ni un eje se cuela en el otro: un solo chip por celda.
    expect(invitacion.textContent).not.toMatch(/correo/i)
    expect(aviso.textContent).not.toContain("Vence el")
  })

  it("una cuenta sin invitación no finge un estado de correo", async () => {
    servir()
    montarConsola()

    await waitFor(() => filaDe("mantencion@test.cl"))
    const aviso = celdaDe("mantencion@test.cl", 3)

    // Sin invitación no hay correo que juzgar: se dice el hecho, y no se pinta un
    // `enviado`, un `pendiente` ni el texto de «nunca se intentó», que habla del
    // intento de envío de una invitación que no existe.
    expect(within(aviso).getByText("No hay invitación")).toBeTruthy()
    expect(aviso.textContent).not.toMatch(/pendiente|enviado|nunca se intentó/i)
  })
})

describe("Correo de bienvenida — el reenvío no se pinta desde el 200", () => {
  it("un reenvío que el servidor registra fallido se pinta fallido con su motivo, nunca enviado", async () => {
    const user = userEvent.setup({ delay: null })
    let cuentas = CUENTAS
    servir({
      cuentas: () => cuentas,
      reenvio: () => {
        // La ruta emite la invitación nueva y el correo sale en el mismo acto; la
        // constancia la escribe el servidor. La relectura del listado ya la trae.
        cuentas = CUENTAS.map((cuenta) =>
          cuenta.usuario.email === "residente@test.cl"
            ? { ...cuenta, invitacion: INVITACION_REENVIADA }
            : cuenta
        )
        return {
          cuerpo: {
            ok: true,
            // Proyección de la invitación ANTES del envío: su `envio` todavía es
            // `null`, así que este cuerpo no puede ser la fuente del chip.
            invitacion: { ...INVITACION_REENVIADA, envio: null },
            invalidadas: 1,
            enlace: ENLACE_REENVIO,
          },
        }
      },
    })
    montarConsola()

    const antes = await waitFor(() => filaDe("residente@test.cl"))
    expect(within(celdaDe("residente@test.cl", 3)).getByText("Correo pendiente"))
      .toBeTruthy()

    await user.click(
      within(antes).getByRole("button", { name: "Reenviar invitación" })
    )

    await waitFor(() => expect(llamadas(RUTA_REENVIO)).toHaveLength(1))
    // El veredicto se relee: la pantalla vuelve a pedir el listado después del acto.
    await waitFor(() => expect(lecturasDelListado()).toHaveLength(2))

    await waitFor(() =>
      expect(within(celdaDe("residente@test.cl", 3)).getByText("Correo fallido"))
        .toBeTruthy()
    )
    const despues = celdaDe("residente@test.cl", 3)
    expect(within(despues).getByText(MOTIVO_REBOTE)).toBeTruthy()
    expect(within(despues).queryByText("Correo enviado")).toBeNull()
    expect(within(despues).queryByText("Correo pendiente")).toBeNull()

    // El enlace nuevo también viene del servidor: es la puerta que queda cuando
    // el correo no salió.
    const region = await screen.findByRole("region", {
      name: "Enlace de la invitación",
    })
    expect(within(region).getByDisplayValue(ENLACE_REENVIO)).toBeTruthy()

    // Y el aviso del acto no declara un envío que el servidor no confirmó.
    const estado = await screen.findByRole("status")
    expect(estado.textContent).not.toMatch(/enviado/i)
    expect(estado.textContent).toContain("La invitación quedó emitida")
  })
})
