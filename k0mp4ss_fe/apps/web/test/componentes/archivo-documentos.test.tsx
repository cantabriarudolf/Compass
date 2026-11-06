// @vitest-environment jsdom
/**
 * Archivo de documentos de la comunidad (F35 serie A, A2 · T10).
 *
 * La pantalla no es la autoridad —la API responde 400/409/403— pero sí tiene que
 * decir la verdad sobre lo que la entidad permite (S1-S6):
 *   - pinta las filas que recibe, con la etiqueta humana de cada tipo, su versión
 *     y la referencia auténtica de los legales;
 *   - un legal está «Vigente» solo si ninguna otra versión legal de su tipo es
 *     mayor (la versión la asigna el servidor; la pantalla la usa, no la calcula);
 *   - un legal no ofrece editar ni borrar: las acciones van deshabilitadas con el
 *     motivo del dominio (`MENSAJE_LEGAL_INMUTABLE`), porque se corrige con una
 *     versión nueva (S2); el comunitario sí se borra (S4);
 *   - el formulario no deja mandar un legal sin `referenciaAutentica` (S3) y, aun
 *     así, un rechazo de la API se muestra con el texto que devuelve la API en vez
 *     de taparse;
 *   - el filtro por naturaleza achica la lista.
 *
 * Se monta `ConsolaArchivo` (no el `page.tsx`) porque la página es un server
 * component `async` que espera `auth()` y no se puede montar en jsdom; la única
 * decisión que toma es pasar `roles`, así que el caso de permisos se afirma con
 * los roles de la matriz (`doc`: administración todo, comité ver+crear,
 * residente ver).
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import {
  ETIQUETAS_TIPO_DOCUMENTAL,
  MENSAJE_LEGAL_INMUTABLE,
  MENSAJE_REFERENCIA_AUTENTICA,
} from "@/lib/documento-archivo"
import type { DocumentoArchivoEnLista } from "@/lib/api/use-documentos"
import { ConsolaArchivo } from "@/app/comunidad/archivo/consola-archivo"

// Mismo piso que el resto de los tests de componentes: los casos que llenan el
// formulario y abren comboboxes Radix rozan los 5 s (el default de Vitest) en una
// máquina cargada y fallan por tiempo, no por comportamiento.
vi.setConfig({ testTimeout: 60_000 })

/** Los cuatro documentos del archivo: tres legales (dos versiones de actas) + uno comunitario. */
const FILAS: DocumentoArchivoEnLista[] = [
  {
    id: "doc-archivo-reglamento-copropiedad",
    naturaleza: "legal",
    tipoDocumental: "reglamento-copropiedad",
    glosa: "Reglamento de copropiedad vigente y sus modificaciones",
    referenciaAutentica:
      "Conservador de Bienes Raíces de Santiago, inscripción 4521 del año 2026",
    archivoNombre: "reglamento-copropiedad.pdf",
    archivoTipoMime: "application/pdf",
    archivoTamanoKB: 5,
    archivoUrl: "/archivo-documentos/reglamento-copropiedad.pdf",
    vigenteDesde: "2026-01-15",
    version: 1,
  },
  {
    id: "doc-archivo-acta-asamblea-2026-03",
    naturaleza: "legal",
    tipoDocumental: "actas-asamblea",
    glosa: "Acta de asamblea ordinaria de marzo 2026",
    referenciaAutentica: "Notaría 4ª de Santiago, fojas 12, 15-03-2026",
    archivoNombre: "acta-asamblea-2026.pdf",
    archivoTipoMime: "application/pdf",
    archivoTamanoKB: 4,
    archivoUrl: "/archivo-documentos/acta-asamblea-2026.pdf",
    vigenteDesde: "2026-03-15",
    version: 1,
  },
  {
    id: "doc-archivo-acta-asamblea-2026-04",
    naturaleza: "legal",
    tipoDocumental: "actas-asamblea",
    glosa: "Acta de asamblea ordinaria de abril 2026",
    referenciaAutentica: "Notaría 4ª de Santiago, fojas 40, 12-04-2026",
    archivoNombre: "acta-asamblea-2026-04.pdf",
    archivoTipoMime: "application/pdf",
    archivoTamanoKB: 4,
    archivoUrl: "/archivo-documentos/acta-asamblea-2026-04.pdf",
    vigenteDesde: "2026-04-12",
    version: 2,
  },
  {
    id: "doc-archivo-circular-emergencia",
    naturaleza: "comunitario",
    tipoDocumental: "otros",
    glosa: "Circular del plan de emergencia",
    archivoNombre: "plan-de-emergencia.pdf",
    archivoTipoMime: "application/pdf",
    archivoTamanoKB: 0,
    archivoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    vigenteDesde: "2026-04-01",
    version: 1,
  },
]

/** Mutaciones de la colección: se espía lo que la pantalla manda, sin red. */
const api = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock("@/lib/api/use-documentos", () => ({
  useDocumentos: () => ({
    items: FILAS,
    total: FILAS.length,
    isLoading: false,
    error: null,
    hasMore: false,
    cargandoMas: false,
    cargarMas: async () => {},
    create: api.create,
    update: api.update,
    remove: api.remove,
  }),
}))

beforeEach(() => {
  instalarEntornoRadix()
  api.create.mockReset()
  api.update.mockReset()
  api.remove.mockReset()
  api.create.mockImplementation(async () => ({ ok: true }))
  api.update.mockImplementation(async () => ({ ok: true }))
  api.remove.mockImplementation(async () => ({ ok: true }))
})

afterEach(() => {
  cleanup()
})

function renderConsola(roles: string[]) {
  return render(<ConsolaArchivo roles={roles} />)
}

/** Abre un `Select` Radix por su etiqueta y elige la opción que matchea el patrón. */
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

/** Completa el alta legal con los datos mínimos, dejando la referencia en manos del caso. */
async function completarAltaLegal(
  user: ReturnType<typeof userEvent.setup>,
  referenciaAutentica?: string
): Promise<void> {
  await user.type(
    screen.getByLabelText("Glosa"),
    "Reglamento de copropiedad actualizado"
  )
  await user.type(screen.getByLabelText("Nombre del archivo"), "reglamento-2027.pdf")
  await user.type(
    screen.getByLabelText("URL del archivo"),
    "/archivo-documentos/reglamento-2027.pdf"
  )
  if (referenciaAutentica !== undefined) {
    await user.type(screen.getByLabelText("Referencia auténtica"), referenciaAutentica)
  }
}

describe("Archivo de documentos — la pantalla dice lo que la entidad permite", () => {
  it("pinta las filas con su tipo, versión, referencia y la marca de vigente de los legales", () => {
    renderConsola(["administrador"])

    // La etiqueta humana del tipo sale de ETIQUETAS_TIPO_DOCUMENTAL: nunca se hardcodea.
    const tabla = screen.getByRole("table")
    expect(
      within(tabla).getByText(ETIQUETAS_TIPO_DOCUMENTAL["reglamento-copropiedad"])
    ).toBeInTheDocument()
    expect(within(tabla).getAllByText(ETIQUETAS_TIPO_DOCUMENTAL["actas-asamblea"])).toHaveLength(2)

    // La glosa y la referencia auténtica del legal se leen tal cual.
    expect(
      screen.getByText("Reglamento de copropiedad vigente y sus modificaciones")
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Conservador de Bienes Raíces de Santiago, inscripción 4521 del año 2026"
      )
    ).toBeInTheDocument()

    // La versión que asignó el servidor es la que se muestra.
    const filaAbril = screen.getByRole("row", {
      name: /Acta de asamblea ordinaria de abril 2026/,
    })
    expect(within(filaAbril).getByText("v2")).toBeInTheDocument()

    // S2/A2: la vigencia de un legal es la versión más alta de su tipo.
    expect(within(filaAbril).getByText("Vigente")).toBeInTheDocument()
    const filaMarzo = screen.getByRole("row", {
      name: /Acta de asamblea ordinaria de marzo 2026/,
    })
    expect(within(filaMarzo).getByText("Reemplazado")).toBeInTheDocument()

    // Lo comunitario no lleva marca de vigencia: se reemplaza, no se versiona en serie.
    const filaComunitaria = screen.getByRole("row", { name: /Circular del plan de emergencia/ })
    expect(within(filaComunitaria).queryByText("Vigente")).toBeNull()

    // El archivo se abre por referencia (D1): URL tal cual, en pestaña nueva.
    expect(
      screen.getByRole("link", {
        name: "Abrir Reglamento de copropiedad vigente y sus modificaciones en una pestaña nueva",
      })
    ).toHaveAttribute("href", "/archivo-documentos/reglamento-copropiedad.pdf")
  })

  it("no ofrece editar ni borrar un legal, y sí borrar el comunitario", async () => {
    const user = userEvent.setup({ delay: null })
    renderConsola(["administrador"])

    // S2 · el motivo viaja en el título y la acción queda deshabilitada.
    const editarLegal = screen.getByRole("button", {
      name: "Editar Reglamento de copropiedad vigente y sus modificaciones",
    })
    expect(editarLegal).toBeDisabled()
    expect(editarLegal).toHaveAttribute("title", MENSAJE_LEGAL_INMUTABLE)

    const eliminarLegal = screen.getByRole("button", {
      name: "Eliminar Reglamento de copropiedad vigente y sus modificaciones",
    })
    expect(eliminarLegal).toBeDisabled()
    expect(eliminarLegal).toHaveAttribute("title", MENSAJE_LEGAL_INMUTABLE)

    // S4 · lo comunitario se elimina con la clave `doc`.
    const eliminarComunitario = screen.getByRole("button", {
      name: "Eliminar Circular del plan de emergencia",
    })
    expect(eliminarComunitario).toBeEnabled()
    await user.click(eliminarComunitario)
    expect(api.remove).toHaveBeenCalledWith("doc-archivo-circular-emergencia")
  })

  it("no deja registrar un legal sin referencia auténtica y manda el archivo derivado de la extensión", async () => {
    const user = userEvent.setup({ delay: null })
    renderConsola(["administrador"])

    // La naturaleza por defecto es legal, así que la referencia está a la vista.
    await completarAltaLegal(user)
    await user.click(screen.getByRole("button", { name: "Registrar documento" }))

    // S3 · aviso del cliente, con el mismo texto que responde el 400 de la ruta.
    expect(screen.getByRole("alert")).toHaveTextContent(MENSAJE_REFERENCIA_AUTENTICA)
    expect(api.create).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText("Referencia auténtica"), "Notaría 4ª, fojas 9")
    await user.click(screen.getByRole("button", { name: "Registrar documento" }))

    expect(api.create).toHaveBeenCalledTimes(1)
    const enviado = api.create.mock.calls[0]?.[0] as Record<string, unknown>
    expect(enviado.naturaleza).toBe("legal")
    expect(enviado.referenciaAutentica).toBe("Notaría 4ª, fojas 9")
    // D1/S6 · el MIME se deriva del nombre/URL y el tamaño no se inventa.
    expect(enviado.archivoTipoMime).toBe("application/pdf")
    expect(enviado.archivoTamanoKB).toBe(0)
    // El id lo genera la app con el mismo helper que el resto de las pantallas.
    expect(String(enviado.id)).toMatch(/^doc-\d+/)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("muestra el texto de la API cuando el guardado vuelve 400 y cuando el borrado vuelve 409", async () => {
    const user = userEvent.setup({ delay: null })
    renderConsola(["administrador"])

    // 400 · la ruta vuelve a validar el payload completo: la pantalla pasó su
    // control, el servidor rechaza y su texto es el que se lee.
    api.create.mockResolvedValueOnce({ ok: false, error: MENSAJE_REFERENCIA_AUTENTICA })
    await completarAltaLegal(user, "Notaría 4ª, fojas 9")
    await user.click(screen.getByRole("button", { name: "Registrar documento" }))
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("alert")).toHaveTextContent(MENSAJE_REFERENCIA_AUTENTICA)

    // 409 · la fila comunitaria cambió de naturaleza entre el render y el click:
    // el texto que explica el rechazo es el de la API, no uno inventado acá.
    api.remove.mockResolvedValueOnce({ ok: false, error: MENSAJE_LEGAL_INMUTABLE })
    await user.click(
      screen.getByRole("button", { name: "Eliminar Circular del plan de emergencia" })
    )
    expect(screen.getByRole("alert")).toHaveTextContent(MENSAJE_LEGAL_INMUTABLE)
  })

  it("el filtro por naturaleza achica la lista", async () => {
    const user = userEvent.setup({ delay: null })
    renderConsola(["administrador"])

    const filtro = screen.getByRole("combobox", { name: "Filtrar por naturaleza" })

    await elegirOpcion(user, filtro, /^Legal$/)
    expect(
      screen.getByText("Reglamento de copropiedad vigente y sus modificaciones")
    ).toBeInTheDocument()
    expect(screen.queryByText("Circular del plan de emergencia")).toBeNull()

    await elegirOpcion(user, filtro, /^Comunitario$/)
    expect(screen.queryByText("Reglamento de copropiedad vigente y sus modificaciones")).toBeNull()
    expect(screen.getByText("Circular del plan de emergencia")).toBeInTheDocument()
  })
})
