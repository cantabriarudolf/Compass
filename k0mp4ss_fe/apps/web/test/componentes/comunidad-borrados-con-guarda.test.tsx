// @vitest-environment jsdom
/**
 * Borrados de Comunidad con guarda (T3, S1/S2) — las cinco pantallas del lote.
 *
 * La regla es la misma que fijaron T2 y sus paneles PE (`pe-borrados-con-guarda`):
 * el primer click en la papelera **no borra**; abre el diálogo con el nombre
 * concreto de la entidad y la consecuencia literal que midió T1 en
 * `odd/tasks/borrados-con-guarda.md`. La baja recién viaja al confirmar, una
 * sola vez, y el hook es quien la ejecuta: acá se mockea el módulo del hook
 * para afirmar que el primer click no lo llama.
 *
 * Las dos bajas que no son «eliminar» conservan su verbo: el acta de directiva
 * se **archiva** (el servidor la deja `desestimada`, no la borra) y el vínculo
 * se **desvincula**. El vínculo tenía su propio `AlertDialog`: la guarda única
 * lo reemplaza y el archivo no puede volver a montar uno propio, que es lo que
 * afirma el último caso (sobre el fuente, como `sin-store.ts`).
 */
import React from "react"
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import type { ActaGD, AvisoCV, PlantillaCO, PublicacionPortal } from "@/lib/schemas"
import type { Persona } from "@/data/comunidad/personas"
import type { VinculoUnidad } from "@/data/comunidad/vinculos"

vi.setConfig({ testTimeout: 60_000 })

const DIA = "2026-11-26"

/* -------------------------------------------------------------------------- */
/* Consecuencias y títulos literales (tabla de medición fina, T1).             */
/* -------------------------------------------------------------------------- */

const ARIA_AVISO = "Eliminar el aviso «Corte de agua programado»"
const TITULO_AVISO = "Eliminar el aviso «Corte de agua programado»"
const CONSECUENCIA_AVISO =
  "Se pierde el texto del aviso, sin forma de recuperarlo."

const ARIA_PUBLICACION = "Eliminar la publicación de Depto 101"
const TITULO_PUBLICACION = "Eliminar la publicación de Depto 101 · venta"
const CONSECUENCIA_PUBLICACION =
  "Se pierden fotos y descripción; las consultas que captó quedan sin publicación."

const ARIA_ACTA = "Archivar el acta folio AD-2026-014"
const TITULO_ACTA = "Archivar el acta folio AD-2026-014 del 2026-11-26 · 19:00"
const CONSECUENCIA_ACTA =
  "El acta sale del libro y queda desestimada; los acuerdos y publicaciones que la citan apuntan a un acta desestimada."

const ARIA_PLANTILLA = "Eliminar la plantilla «Aviso de corte de agua»"
const TITULO_PLANTILLA = "Eliminar la plantilla «Aviso de corte de agua» · urgente"
const CONSECUENCIA_PLANTILLA =
  "Se pierde la plantilla; los envíos que la usaron quedan sin la plantilla que los originó."

const ARIA_VINCULO = "Desvincular Depto 101 de Ana Pérez"
const TITULO_VINCULO = "Desvincular Depto 101 de Ana Pérez"
const CONSECUENCIA_VINCULO =
  "Se elimina el vínculo de Depto 101 (Propietario) para Ana Pérez: la unidad deja de contar a esa persona como Propietario. Esta acción no se puede deshacer."

/* -------------------------------------------------------------------------- */
/* Fixtures: una fila por pantalla, con los maestros que la fila nombra.       */
/* -------------------------------------------------------------------------- */

const AVISOS: AvisoCV[] = [
  {
    id: "cv-1",
    titulo: "Corte de agua programado",
    cuerpo: "El suministro se suspende de 09:00 a 13:00 por mantención de la matriz.",
    tipologia: "advertencia",
    duracionSegundos: 15,
    pantallaCompleta: false,
    tags: ["mantención"],
    estado: "borrador",
    requiereVistoBueno: false,
    origen: "manual",
    fechaCreacion: DIA,
  },
]

const UNIDADES = [{ id: "u-101", numero: "101", etiqueta: "Depto" }]

const PUBLICACIONES: PublicacionPortal[] = [
  {
    id: "pub-1",
    unidadId: "u-101",
    operacion: "venta",
    precio: 85000000,
    imagenes: [],
    activa: true,
    fechaPublicacion: DIA,
  },
]

const ACTAS: ActaGD[] = [
  {
    id: "acta-1",
    fecha: DIA,
    hora: "19:00",
    lugar: "Sala de reuniones",
    tablaTemas: ["Corte de agua"],
    presentes: [],
    ausentes: [],
    invitados: [],
    minuta: "",
    adjuntos: [],
    estado: "borrador",
    aprobaciones: [],
    folio: "AD-2026-014",
  },
]

const PLANTILLAS: PlantillaCO[] = [
  {
    id: "pl-1",
    nombre: "Aviso de corte de agua",
    categoria: "urgente",
    asunto: "Corte de agua en la comunidad",
    cuerpo: "Estimados residentes: el suministro se suspenderá de 09:00 a 13:00.",
  },
]

const PERSONA: Persona = {
  id: "p-ana",
  rut: "12.345.678-9",
  nombreCompleto: "Ana Pérez",
  nombres: "Ana",
  apellidos: "Pérez",
  email: "ana.perez@ejemplo.cl",
  telefonoMovil: "+56 9 1234 5678",
  estadoCuenta: "activa",
  condicionesEspecialesIds: [],
  roles: ["propietario"],
}

const VINCULOS: VinculoUnidad[] = [
  {
    id: "v-1",
    personaId: "p-ana",
    unidadId: "u-101",
    rol: "propietario",
    fechaInicio: "2024-01-15",
    permiteVerFinanzas: true,
  },
]

/* -------------------------------------------------------------------------- */
/* Espías de baja: lo que la guarda tiene que NO llamar en el primer click.    */
/* -------------------------------------------------------------------------- */

const removeAviso = vi.fn(async () => ({ ok: true }))
const removePublicacion = vi.fn(async () => ({ ok: true }))
const removeActa = vi.fn(async () => ({ ok: true }))
const removePlantilla = vi.fn(async () => ({ ok: true }))
const removeVinculo = vi.fn(async () => ({ ok: true }))

/** Colección con el contrato de `useCrudCollection`, sin red. */
function coleccion<T>(
  items: T[],
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>
) {
  return {
    items,
    total: items.length,
    isLoading: false,
    error: null,
    hasMore: false,
    cargandoMas: false,
    cargarMas: vi.fn(async () => {}),
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove,
  }
}

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p-ana" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/comunidad/personas/p-ana",
}))

vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({
    personas: [PERSONA],
    total: 1,
    isLoading: false,
    error: null,
    update: vi.fn(async () => ({ ok: true })),
  }),
  usePersona: () => ({
    persona: PERSONA,
    isLoading: false,
    error: null,
    update: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () => ({ items: UNIDADES, total: UNIDADES.length, isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-vinculos", () => ({
  useVinculos: () => ({
    vinculos: VINCULOS,
    isLoading: false,
    error: null,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: removeVinculo,
  }),
}))
vi.mock("@/lib/api/use-maestros", () => ({
  useMaestros: () => ({ data: [], total: 0, isLoading: false, error: null }),
  useMaestro: () => ({ data: undefined, isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-macro-sectores", () => ({
  useMacroSectores: () => ({ items: [], total: 0, isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-micro-sectores", () => ({
  useMicroSectores: () => ({ items: [], total: 0, isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-notificaciones", () => ({
  useNotificaciones: () => ({ ...coleccion([], vi.fn()), marcarLeida: vi.fn() }),
}))
vi.mock("@/lib/api/use-configuracion", () => ({
  useConfiguracion: () => ({
    config: undefined,
    isLoading: false,
    updateConfig: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-publicaciones-portal", () => ({
  usePublicacionesPortal: () => coleccion(PUBLICACIONES, removePublicacion),
}))
vi.mock("@/lib/api/use-leads-portal", () => ({
  useLeadsPortal: () => coleccion([], vi.fn()),
}))
vi.mock("@/lib/api/use-cv", () => ({
  useAvisosCV: () => coleccion(AVISOS, removeAviso),
  usePlantillasCV: () => coleccion([], vi.fn()),
  useActasPublicadasCV: () => ({
    publicaciones: [],
    textoInformativo: "",
    isLoading: false,
    error: null,
    publicar: vi.fn(async () => ({ ok: true })),
    despublicar: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-actas-gd", () => ({
  useActasGD: () => ({
    actas: ACTAS,
    total: ACTAS.length,
    isLoading: false,
    error: null,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: removeActa,
    aprobar: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-periodos-directiva", () => ({
  usePeriodosDirectiva: () => ({
    periodos: [],
    isLoading: false,
    error: null,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
    cerrar: vi.fn(async () => ({ ok: true })),
  }),
}))
vi.mock("@/lib/api/use-controles-propiedad", () => ({
  useControlesPropiedad: () => ({ controles: [], isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-co", () => ({
  usePlantillasCO: () => coleccion(PLANTILLAS, removePlantilla),
  useEnviosCO: () => coleccion([], vi.fn()),
  useMensajesBuzonCO: () => coleccion([], vi.fn()),
}))

import VisorPanelPage from "@/app/comunidad/visor/page"
import PortalInmobiliarioPage from "@/app/comunidad/portal/page"
import DirectivaPage from "@/app/comunidad/directiva/page"
import { ConsolaComunicacionCO } from "@/app/comunidad/comunicacion/consola-comunicacion"
import PersonaPerfilPage from "@/app/comunidad/personas/[id]/page"

function json(cuerpo: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  )
}

beforeEach(() => {
  instalarEntornoRadix()
  vi.clearAllMocks()
  // Cada pantalla consulta su propio maestro al montar: habilitados del visor,
  // sesión del portal (la gestión sólo se ofrece autenticado) y alcance del
  // envío masivo de la consola. Un stub por URL evita que la guarda global de
  // MSW (`onUnhandledRequest: "error"`) vuelva rojo el run.
  vi.stubGlobal(
    "fetch",
    vi.fn((recurso: string | URL | Request) => {
      const url = typeof recurso === "string" ? recurso : String(recurso)
      if (url.startsWith("/api/cv/personas-habilitadas")) return json({ data: [], total: 0 })
      if (url.startsWith("/api/auth/session")) return json({ user: { id: "u-admin" }, expires: "2099-01-01" })
      if (url.startsWith("/api/co/alcance-masivo")) {
        return json({ data: [], total: 0, page: 1, pageSize: 100 })
      }
      return json({ data: [], total: 0 })
    })
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Abre el diálogo desde la papelera y devuelve el diálogo para leerlo. */
async function abrirDesdePapelera(
  usuario: ReturnType<typeof userEvent.setup>,
  ariaLabel: string
): Promise<HTMLElement> {
  await usuario.click(await screen.findByRole("button", { name: ariaLabel }))
  return screen.findByRole("alertdialog")
}

/** Elige una opción de un Select de Radix (la vista de la directiva). */
async function elegirOpcion(
  usuario: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  patron: RegExp
): Promise<void> {
  await usuario.click(trigger)
  const listbox = await screen.findByRole("listbox")
  const opcion = within(listbox)
    .getAllByRole("option")
    .find((o) => patron.test(o.textContent ?? ""))
  if (!opcion) throw new Error(`sin opción ${String(patron)}`)
  await usuario.click(opcion)
}

describe("el primer click en la papelera no borra: abre la guarda", () => {
  it("visor: nombra el aviso y avisa que su texto no se recupera", async () => {
    const usuario = userEvent.setup()
    render(<VisorPanelPage />)

    const disparador = await screen.findByRole("button", { name: ARIA_AVISO })
    // El aviso se borraba con la palabra «Eliminar» a la vista y no se degrada a
    // un icono mudo: la guarda conserva el verbo del disparador. Se mira antes de
    // abrir, porque el modal deja el fondo fuera del árbol accesible.
    expect(disparador).toHaveTextContent("Eliminar")

    const dialogo = await abrirDesdePapelera(usuario, ARIA_AVISO)

    expect(within(dialogo).getByText(TITULO_AVISO)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_AVISO)
    expect(removeAviso).not.toHaveBeenCalled()

    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))
    await waitFor(() => expect(removeAviso).toHaveBeenCalledTimes(1))
    expect(removeAviso).toHaveBeenCalledWith("cv-1")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })

  it("portal: nombra la publicación con su unidad y operación, y sus leads quedan sin publicación", async () => {
    const usuario = userEvent.setup()
    render(<PortalInmobiliarioPage />)

    await usuario.click(await screen.findByRole("button", { name: "Gestionar vitrina" }))
    const dialogo = await abrirDesdePapelera(usuario, ARIA_PUBLICACION)

    expect(within(dialogo).getByText(TITULO_PUBLICACION)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_PUBLICACION)
    expect(removePublicacion).not.toHaveBeenCalled()

    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))
    await waitFor(() => expect(removePublicacion).toHaveBeenCalledTimes(1))
    expect(removePublicacion).toHaveBeenCalledWith("pub-1")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })

  it("directiva: archiva el acta del folio, su fecha y hora, sin borrarla del libro", async () => {
    const usuario = userEvent.setup()
    render(<DirectivaPage />)

    await elegirOpcion(usuario, screen.getByRole("combobox"), /Administrador/)
    const dialogo = await abrirDesdePapelera(usuario, ARIA_ACTA)

    expect(within(dialogo).getByText(TITULO_ACTA)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_ACTA)
    expect(removeActa).not.toHaveBeenCalled()

    // La baja es lógica: el botón dice lo que el servidor hace de verdad.
    await usuario.click(within(dialogo).getByRole("button", { name: "Archivar" }))
    await waitFor(() => expect(removeActa).toHaveBeenCalledTimes(1))
    expect(removeActa).toHaveBeenCalledWith("acta-1")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })

  it("consola de comunicación: nombra la plantilla con su categoría y sus envíos quedan sin origen", async () => {
    const usuario = userEvent.setup()
    render(<ConsolaComunicacionCO />)

    await usuario.click(screen.getByRole("tab", { name: /Plantillas/ }))
    const dialogo = await abrirDesdePapelera(usuario, ARIA_PLANTILLA)

    expect(within(dialogo).getByText(TITULO_PLANTILLA)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_PLANTILLA)
    expect(removePlantilla).not.toHaveBeenCalled()

    await usuario.click(within(dialogo).getByRole("button", { name: "Eliminar" }))
    await waitFor(() => expect(removePlantilla).toHaveBeenCalledTimes(1))
    expect(removePlantilla).toHaveBeenCalledWith("pl-1")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })

  it("vínculo de persona: se desvincula con la guarda única y conserva que no se puede deshacer", async () => {
    const usuario = userEvent.setup()
    render(<PersonaPerfilPage />)

    const dialogo = await abrirDesdePapelera(usuario, ARIA_VINCULO)

    expect(within(dialogo).getByText(TITULO_VINCULO)).toBeTruthy()
    expect(dialogo).toHaveTextContent(CONSECUENCIA_VINCULO)
    expect(removeVinculo).not.toHaveBeenCalled()

    await usuario.click(within(dialogo).getByRole("button", { name: "Desvincular" }))
    await waitFor(() => expect(removeVinculo).toHaveBeenCalledTimes(1))
    expect(removeVinculo).toHaveBeenCalledWith("v-1")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })
})

describe("la ficha de persona no conserva un diálogo de baja propio", () => {
  it("monta la guarda única y no un AlertDialog de baja", () => {
    const fuente = readFileSync(
      path.resolve(__dirname, "../../app/comunidad/personas/[id]/page.tsx"),
      "utf8"
    )

    expect(fuente).toContain("@/components/eliminar-con-confirmacion")
    expect(fuente).not.toContain("AlertDialog")
  })
})
