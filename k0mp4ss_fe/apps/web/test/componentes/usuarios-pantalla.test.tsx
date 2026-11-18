// @vitest-environment jsdom
/**
 * Cuentas y acceso — la pantalla que abre el sistema (F42 · T2 · S1/S4).
 *
 * Qué fija este archivo:
 *
 *   1. Una fila por cuenta con su ROL DE ACCESO y el estado de su invitación tal
 *      como lo devolvió el servidor (pendiente / vencida / usada, con fechas).
 *      El navegador no deriva el estado: lo lee.
 *   2. La pantalla deshace la confusión en su propio texto: el rol de la persona
 *      en la comunidad (propietario, arrendatario, personal) NO da acceso; el
 *      acceso es la cuenta con su rol.
 *   3. El alta manda lo que corresponde —persona del padrón + rol— a su ruta y,
 *      si sale bien, vuelve a leer el listado y dice que la invitación quedó
 *      emitida y que el envío por correo todavía no existe (F43). Nadie puede
 *      creer que la persona ya fue avisada.
 *   4. Un 409 del servidor se muestra con su texto tal cual, sin releer y sin
 *      cambiar ninguna fila: la pantalla no declara un acto que no ocurrió.
 *   5. El reenvío emite una invitación nueva y la pantalla relee: la fecha que
 *      pinta después es la del servidor, no una calculada acá. Que la anterior
 *      deje de servir es del servidor y lo prueba `test/api/admin-usuarios-reenvio.test.ts`.
 *   6. El único acto sobre una invitación ya usada es ninguno: no hay botón de
 *      reenvío que el servidor vaya a rechazar.
 *   7. La entrada de menú «Cuentas y acceso» existe para administración y no
 *      para comité (la matriz de `admin:usuarios` sólo la abre el wildcard).
 *
 * Se monta la consola (no el `page.tsx`) porque la página es un server component
 * `async` que espera `auth()`; lo único que decide es el portón y pasa a la
 * consola, igual que `vigencia-registro-pantalla.test.tsx`.
 *
 * El servidor REST es falso vía `vi.stubGlobal("fetch", …)`; `instalarEntornoRadix()`
 * es el que usan los tests que abren un `Dialog`/`Select` de Radix, y el
 * `SWRConfig` con provider propio aísla la caché SWR entre casos.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { instalarEntornoRadix } from "./entorno-radix"
import { ConsolaUsuarios } from "@/app/admin/usuarios/_componentes/consola-usuarios"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@workspace/ui/components/sidebar"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

// Mismo piso que el resto de los tests de componentes: Radix + SWR rozan el
// default de Vitest en una máquina cargada.
vi.setConfig({ testTimeout: 60_000 })

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/usuarios" }))

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
  {
    id: "per-2",
    nombres: "Bruno",
    apellidos: "Soto",
    rut: "22.222.222-2",
    nombreCompleto: "Bruno Soto",
    email: "bruno@test.cl",
    telefonoMovil: "+56922222222",
    estadoCuenta: "activa",
    roles: [],
    condicionesEspecialesIds: [],
  },
]

interface CuentaFalsa {
  membresiaId: string
  rol: string
  comunidadId: string
  usuario: { id: string; email: string; personaId: string | null; activo: boolean }
  invitacion: {
    id: string
    estado: "pendiente" | "vencida" | "usada"
    expiraEn: string
    usadoEn: string | null
    creadoEn: string
  } | null
}

/** Las cuatro formas del estado de la invitación, una por fila. */
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
    },
  },
  {
    membresiaId: "m-3",
    rol: "conserjeria",
    comunidadId: "com-1",
    usuario: { id: "u-3", email: "conserjeria@test.cl", personaId: "per-2", activo: true },
    invitacion: {
      id: "inv-3",
      estado: "vencida",
      expiraEn: "2026-11-01T12:00:00.000Z",
      usadoEn: null,
      creadoEn: "2026-10-29T12:00:00.000Z",
    },
  },
  {
    membresiaId: "m-4",
    rol: "comite",
    comunidadId: "com-1",
    usuario: { id: "u-4", email: "comite@test.cl", personaId: null, activo: true },
    invitacion: null,
  },
]

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

function llamadasQueEmpiezan(prefix: string): unknown[][] {
  return fetchFalso.mock.calls.filter((llamada) =>
    String(llamada[0]).startsWith(prefix)
  )
}

function cuerpoDe(llamada: unknown[] | undefined): unknown {
  const init = llamada?.[1] as RequestInit | undefined
  return typeof init?.body === "string" ? JSON.parse(init.body) : null
}

function metodoDe(llamada: unknown[] | undefined): string {
  const init = llamada?.[1] as RequestInit | undefined
  return init?.method ?? "GET"
}

interface PostFalso {
  status?: number
  cuerpo: unknown
}

/**
 * Servidor falso. El listado se sirve con `cuentas` (mutable: el caso del reenvío
 * cambia la fila para probar que la pantalla pinta lo que devuelve el SERVIDOR).
 */
function servir(manejadores: {
  comunidades?: ComunidadFalsa[]
  cuentas?: () => CuentaFalsa[]
  estadoLista?: number
  alta?: (cuerpo: unknown) => PostFalso
  reenvio?: (cuerpo: unknown) => PostFalso
} = {}): void {
  fetchFalso.mockImplementation(
    async (entrada: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(entrada)
      const metodo = init?.method ?? "GET"

      if (metodo === "GET" && url === RUTA_CUENTAS) {
        return respuestaJson({ comunidades: manejadores.comunidades ?? [COMUNIDAD] })
      }
      if (metodo === "GET" && url === RUTA_LISTA) {
        const estado = manejadores.estadoLista ?? 200
        if (estado !== 200) {
          return respuestaJson(
            { error: "Permiso denegado. Requiere rol administrador." },
            estado
          )
        }
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
      if (metodo === "GET" && url === "/api/comunidad-actual") {
        return respuestaJson({ data: { nombre: COMUNIDAD.nombre, logoUrl: null } })
      }
      if (metodo === "POST" && url === RUTA_REENVIO) {
        const post = manejadores.reenvio?.(cuerpoDe([entrada, init]))
        if (!post) throw new Error(`sin respuesta falsa para ${url}`)
        return respuestaJson(post.cuerpo, post.status ?? 201)
      }
      if (metodo === "POST" && url.startsWith(`${RUTA_CUENTAS}?`)) {
        const post = manejadores.alta?.(cuerpoDe([entrada, init]))
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

/** Elige una opción de un `Select` de Radix por el texto visible. */
async function elegirOpcion(
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  patron: RegExp
): Promise<void> {
  await user.click(trigger)
  const listbox = await screen.findByRole("listbox")
  const opcion = within(listbox)
    .getAllByRole("option")
    .find((o) => patron.test(o.textContent ?? ""))
  if (!opcion) throw new Error(`sin opción ${String(patron)}`)
  await user.click(opcion)
}

beforeEach(() => {
  instalarEntornoRadix()
  vi.stubGlobal("fetch", fetchFalso)
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (consulta: string) => ({
      matches: false,
      media: consulta,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

afterEach(() => {
  cleanup()
  fetchFalso.mockReset()
  vi.unstubAllGlobals()
  // `userEvent.setup()` instala su propio portapapeles; el caso que lo necesita
  // lo redefine después de montar. Acá se devuelve el navegador a su estado base.
  Reflect.deleteProperty(window.navigator, "clipboard")
})

describe("Cuentas y acceso — el estado lo dice el servidor", () => {
  it("lista cada cuenta con su rol de acceso y el estado de su invitación con fechas", async () => {
    servir()
    montarConsola()

    const residente = await waitFor(() => filaDe("residente@test.cl"))
    expect(within(residente).getByText("Residente")).toBeTruthy()
    expect(within(residente).getByText("Pendiente")).toBeTruthy()
    expect(within(residente).getByText("Vence el 21-11-2026")).toBeTruthy()

    const conserjeria = filaDe("conserjeria@test.cl")
    expect(within(conserjeria).getByText("Conserjería")).toBeTruthy()
    expect(within(conserjeria).getByText("Vencida")).toBeTruthy()
    expect(within(conserjeria).getByText("Venció el 01-11-2026")).toBeTruthy()

    // Usada: el enlace ya se consumió y el servidor dice cuándo.
    const admin = filaDe("admin@test.cl")
    expect(within(admin).getByText("Administrador")).toBeTruthy()
    expect(within(admin).getByText("Usada")).toBeTruthy()
    expect(within(admin).getByText("Usada el 09-11-2026")).toBeTruthy()
    // Sobre una invitación consumida no hay nada que reenviar.
    expect(
      within(admin).queryByRole("button", { name: "Reenviar invitación" })
    ).toBeNull()

    // Sin invitación también es un estado, y se dice: no se pinta una fila vacía.
    const comite = filaDe("comite@test.cl")
    expect(within(comite).getByText("Comité")).toBeTruthy()
    expect(within(comite).getByText("Sin invitación")).toBeTruthy()
    expect(
      within(comite).queryByRole("button", { name: "Reenviar invitación" })
    ).toBeNull()

    // Pendiente y vencida sí se pueden reenviar.
    expect(
      within(residente).getByRole("button", { name: "Reenviar invitación" })
    ).toBeTruthy()
    expect(
      within(conserjeria).getByRole("button", { name: "Reenviar invitación" })
    ).toBeTruthy()

    // El estado viene del servidor: una lectura del listado y ninguna invención.
    expect(llamadas(RUTA_LISTA)).toHaveLength(1)
  })

  it("dice en su propio texto que el rol de la persona en la comunidad no da acceso", async () => {
    servir()
    montarConsola()
    await waitFor(() => filaDe("residente@test.cl"))

    expect(
      screen.getByText(
        /El rol de la persona en la comunidad .*no da acceso por sí mismo/i
      )
    ).toBeTruthy()
    // Y la confusión se deshace nombrando el acceso real.
    expect(screen.getByText(/El acceso es la cuenta con su rol/i)).toBeTruthy()
  })

  it("avisa que el envío por correo todavía no existe (F43)", async () => {
    servir()
    montarConsola()
    await waitFor(() => filaDe("residente@test.cl"))

    expect(
      screen.getByText(/El envío por correo todavía no existe \(F43\)/i)
    ).toBeTruthy()
  })

  it("un 403 de la ruta se muestra con su texto tal cual", async () => {
    servir({ estadoLista: 403 })
    montarConsola()

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe(
      "Permiso denegado. Requiere rol administrador."
    )
  })

  it("sin comunidad asignada lo dice, en vez de pintar una lista vacía", async () => {
    servir({ comunidades: [] })
    montarConsola()

    const estado = await screen.findByRole("status")
    expect(estado.textContent).toContain("no tiene una comunidad asignada")
    // No se pidió el listado de una comunidad que no existe.
    expect(llamadas(RUTA_LISTA)).toHaveLength(0)
  })
})

describe("Cuentas y acceso — el alta manda persona y rol", () => {
  it("crea la cuenta con la persona del padrón y el rol elegidos, y después dice que la invitación quedó emitida", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      alta: () => ({
        cuerpo: {
          ok: true,
          usuario: {
            id: "u-9",
            email: "bruno@test.cl",
            personaId: "per-2",
            activo: true,
          },
          membresia: { id: "m-9", comunidadId: "com-1", rol: "conserjeria" },
          invitacion: {
            id: "inv-9",
            estado: "pendiente",
            expiraEn: "2026-11-21T12:00:00.000Z",
            usadoEn: null,
            creadoEn: "2026-11-18T12:00:00.000Z",
          },
        },
      }),
    })
    montarConsola()
    await waitFor(() => filaDe("residente@test.cl"))

    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Persona del padrón" }),
      /Bruno Soto/
    )
    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Rol de acceso" }),
      /Conserjería/
    )
    await user.click(
      screen.getByRole("button", { name: "Crear cuenta e invitación" })
    )

    await waitFor(() =>
      expect(llamadas(RUTA_LISTA).filter((l) => metodoDe(l) === "GET")).toHaveLength(2)
    )
    const altas = fetchFalso.mock.calls.filter(
      (llamada) =>
        String(llamada[0]) === RUTA_LISTA &&
        ((llamada[1] as RequestInit | undefined)?.method ?? "GET") === "POST"
    )
    expect(altas).toHaveLength(1)
    expect(cuerpoDe(altas[0])).toEqual({ personaId: "per-2", rol: "conserjeria" })

    // El acto ocurrió: el estado se relee (dos lecturas del listado) y el aviso
    // dice las dos cosas — invitación emitida y correo que todavía no existe.
    const estado = await screen.findByRole("status")
    expect(estado.textContent).toContain("La invitación quedó emitida")
    expect(estado.textContent).toContain("El envío por correo todavía no existe (F43)")
  })

  it("un 409 del servidor se muestra tal cual, sin releer y sin cambiar la fila", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      alta: () => ({
        status: 409,
        cuerpo: { error: "La persona ya tiene una cuenta." },
      }),
    })
    montarConsola()
    await waitFor(() => filaDe("residente@test.cl"))

    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Persona del padrón" }),
      /Ana Pérez/
    )
    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Rol de acceso" }),
      /Residente/
    )
    await user.click(
      screen.getByRole("button", { name: "Crear cuenta e invitación" })
    )

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe("La persona ya tiene una cuenta.")

    // Sin éxito no hay relectura ni mensaje de invitación emitida, y tampoco
    // enlace: el servidor no emitió nada que entregar.
    expect(llamadas(RUTA_LISTA).filter((l) => metodoDe(l) === "GET")).toHaveLength(1)
    expect(screen.queryByText(/La invitación quedó emitida/i)).toBeNull()
    expect(
      screen.queryByRole("region", { name: "Enlace de la invitación" })
    ).toBeNull()
    // La fila que ya estaba sigue igual.
    const residente = filaDe("residente@test.cl")
    expect(within(residente).getByText("Pendiente")).toBeTruthy()
    expect(within(residente).getByText("Vence el 21-11-2026")).toBeTruthy()
  })
})

describe("Cuentas y acceso — el reenvío", () => {
  it("emite una invitación nueva y la pantalla relee el estado del servidor", async () => {
    const user = userEvent.setup({ delay: null })
    let cuentas = CUENTAS
    servir({
      cuentas: () => cuentas,
      reenvio: () => {
        // El servidor reemplaza la invitación: la anterior queda vencida (eso lo
        // prueba la ruta) y el listado pasa a devolver la nueva.
        cuentas = CUENTAS.map((cuenta) =>
          cuenta.usuario.id === "u-2"
            ? {
                ...cuenta,
                invitacion: {
                  id: "inv-2b",
                  estado: "pendiente",
                  expiraEn: "2026-11-24T12:00:00.000Z",
                  usadoEn: null,
                  creadoEn: "2026-11-18T13:00:00.000Z",
                },
              }
            : cuenta
        )
        return {
          cuerpo: {
            ok: true,
            invitacion: cuentas[1]!.invitacion,
            invalidadas: 1,
          },
        }
      },
    })
    montarConsola()

    const residente = await waitFor(() => filaDe("residente@test.cl"))
    expect(within(residente).getByText("Vence el 21-11-2026")).toBeTruthy()

    await user.click(
      within(residente).getByRole("button", { name: "Reenviar invitación" })
    )

    await waitFor(() => expect(llamadas(RUTA_REENVIO)).toHaveLength(1))
    const reenvio = llamadas(RUTA_REENVIO)[0]
    expect(metodoDe(reenvio)).toBe("POST")
    expect(cuerpoDe(reenvio)).toEqual({ usuarioId: "u-2" })

    // Después del acto se relee y se pinta la fecha del servidor.
    await waitFor(() =>
      expect(llamadas(RUTA_LISTA).filter((l) => metodoDe(l) === "GET")).toHaveLength(2)
    )
    const residenteDespues = await waitFor(() => filaDe("residente@test.cl"))
    expect(within(residenteDespues).getByText("Vence el 24-11-2026")).toBeTruthy()
    expect(within(residenteDespues).queryByText("Vence el 21-11-2026")).toBeNull()

    const estado = await screen.findByRole("status")
    expect(estado.textContent).toContain("La invitación quedó emitida")
    expect(estado.textContent).toContain("El envío por correo todavía no existe (F43)")
  })

  it("el 409 del reenvío se muestra tal cual y no reescribe la fila", async () => {
    const user = userEvent.setup({ delay: null })
    servir({
      reenvio: () => ({
        status: 409,
        cuerpo: {
          error: "La cuenta ya definió su contraseña: la invitación no se puede reenviar.",
        },
      }),
    })
    montarConsola()

    const residente = await waitFor(() => filaDe("residente@test.cl"))
    await user.click(
      within(residente).getByRole("button", { name: "Reenviar invitación" })
    )

    const alerta = await screen.findByRole("alert")
    expect(alerta.textContent).toBe(
      "La cuenta ya definió su contraseña: la invitación no se puede reenviar."
    )
    expect(llamadas(RUTA_LISTA).filter((l) => metodoDe(l) === "GET")).toHaveLength(1)
    expect(within(residente).getByText("Vence el 21-11-2026")).toBeTruthy()
    expect(screen.queryByText(/La invitación quedó emitida/i)).toBeNull()
    // Un rechazo no revela ningún enlace.
    expect(
      screen.queryByRole("region", { name: "Enlace de la invitación" })
    ).toBeNull()
  })
})

describe("Cuentas y acceso — el enlace se revela una sola vez", () => {
  const TOKEN_ALTA = "EnlaceDelAlta0001"
  const ENLACE_ALTA = `https://compass.test/invitacion?token=${TOKEN_ALTA}`
  const TOKEN_REENVIO = "EnlaceDelReenvio02"
  const ENLACE_REENVIO = `https://compass.test/invitacion?token=${TOKEN_REENVIO}`

  function cuerpoAltaConEnlace(): PostFalso {
    return {
      cuerpo: {
        ok: true,
        usuario: {
          id: "u-9",
          email: "bruno@test.cl",
          personaId: "per-2",
          activo: true,
        },
        membresia: { id: "m-9", comunidadId: "com-1", rol: "conserjeria" },
        invitacion: {
          id: "inv-9",
          estado: "pendiente",
          expiraEn: "2026-11-21T12:00:00.000Z",
          usadoEn: null,
          creadoEn: "2026-11-18T12:00:00.000Z",
        },
        enlace: ENLACE_ALTA,
      },
    }
  }

  it("muestra el enlace del alta, avisa que no se vuelve a mostrar y lo olvida al cerrar", async () => {
    const user = userEvent.setup({ delay: null })
    servir({ alta: cuerpoAltaConEnlace })
    montarConsola()
    await waitFor(() => filaDe("residente@test.cl"))

    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Persona del padrón" }),
      /Bruno Soto/
    )
    await elegirOpcion(
      user,
      screen.getByRole("combobox", { name: "Rol de acceso" }),
      /Conserjería/
    )
    await user.click(
      screen.getByRole("button", { name: "Crear cuenta e invitación" })
    )

    const aviso = await screen.findByRole("region", {
      name: "Enlace de la invitación",
    })
    expect(within(aviso).getByDisplayValue(ENLACE_ALTA)).toBeTruthy()
    // Las dos advertencias, dichas y no escondidas: el enlace no se repite y el
    // correo todavía no existe, así que cerrar sin copiar lo pierde.
    expect(aviso.textContent).toContain("No se vuelve a mostrar")
    expect(aviso.textContent).toContain("El envío por correo todavía no existe (F43)")
    expect(aviso.textContent).toContain("la única salida es reenviar")

    // El enlace vive sólo en el aviso: no se cuela en la fila del listado.
    expect(filaDe("residente@test.cl").textContent).not.toContain(TOKEN_ALTA)

    await user.click(within(aviso).getByRole("button", { name: "Cerrar" }))

    expect(
      screen.queryByRole("region", { name: "Enlace de la invitación" })
    ).toBeNull()
    expect(screen.queryByDisplayValue(ENLACE_ALTA)).toBeNull()
    expect(document.body.textContent).not.toContain(TOKEN_ALTA)
    // Cerrar el aviso no deshace el acto: la fila sigue como la dio el servidor.
    expect(within(filaDe("residente@test.cl")).getByText("Pendiente")).toBeTruthy()
  })

  it("muestra el enlace del reenvío y el botón de copiar lo deja en el portapapeles", async () => {
    const user = userEvent.setup({ delay: null })
    const escribir = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText: escribir },
    })
    servir({
      reenvio: () => ({
        cuerpo: { ok: true, enlace: ENLACE_REENVIO, invalidadas: 1 },
      }),
    })
    montarConsola()

    const residente = await waitFor(() => filaDe("residente@test.cl"))
    await user.click(
      within(residente).getByRole("button", { name: "Reenviar invitación" })
    )

    const aviso = await screen.findByRole("region", {
      name: "Enlace de la invitación",
    })
    expect(within(aviso).getByDisplayValue(ENLACE_REENVIO)).toBeTruthy()
    expect(aviso.textContent).toContain("No se vuelve a mostrar")

    await user.click(within(aviso).getByRole("button", { name: "Copiar enlace" }))
    expect(escribir).toHaveBeenCalledWith(ENLACE_REENVIO)
    expect(within(aviso).getByText("Enlace copiado.")).toBeTruthy()
  })
})

describe("menú — la entrada de Cuentas y acceso", () => {
  function montarSidebar(roles: string[]): void {
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar roles={roles} />
          </SidebarProvider>
        </TooltipProvider>
      </SWRConfig>
    )
  }

  it("aparece en el grupo de administración para quien puede ver admin:usuarios", async () => {
    servir()
    montarSidebar(["administrador"])

    const enlace = await screen.findByRole("link", { name: "Cuentas y acceso" })
    expect(enlace.getAttribute("href")).toBe("/admin/usuarios")
    // Una sola entrada: no se duplica en otro grupo.
    expect(screen.getAllByRole("link", { name: "Cuentas y acceso" })).toHaveLength(1)
  })

  it("no aparece para comité, que no tiene la clave admin:usuarios", async () => {
    servir()
    montarSidebar(["comite"])

    await screen.findByRole("link", { name: "Reportería y Dashboards" })
    expect(screen.queryByRole("link", { name: "Cuentas y acceso" })).toBeNull()
  })
})
