// @vitest-environment jsdom
/**
 * Padrón completo en `inventario/proyectos` — responsable y unidad fuera de la
 * página 1 (F38/F40, lote «cerrar el techo de 100», T5).
 *
 * `app/inventario/proyectos/page.tsx` resuelve la identidad con
 * `personas.find()` (`nombrePersona`, columna Responsable de la tabla de
 * trabajos) y `unidades.find()` (`refUbicacion`, columna Ubicación), y llena el
 * Select de «Unidad EF» y el de «Responsable interno» con esos mismos padrones.
 * `usePersonas()` y `useUnidades()` son `pageSize=100`; con un padrón de dos
 * páginas: el responsable de la página 2 se imprime como id crudo, la unidad de
 * la página 2 se imprime como «—», y ni la persona ni la unidad de la página 2
 * se pueden elegir en el formulario.
 *
 * La palanca ya existe en los dos hooks: `{ todasLasPaginas: true }` (universo
 * acotado: el padrón de una comunidad). El caso monta los hooks REALES de
 * personas y unidades y sustituye solo la capa de red con el arnés
 * `api-ir-mt-falsa`, que ya sirve `/api/personas` y `/api/unidades` con
 * `?page=N` respetado: el RED cae por identidad o por opción ausente, no por
 * una petición ausente. Las claves de `mutateGlobal("/api/mt/trabajos…")` son
 * la revalidación de la lista que la pantalla muestra y NO son un selector;
 * microSectores y activos IR son otras colecciones y no se tocan.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SWRConfig } from "swr"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { instalarEntornoRadix } from "./entorno-radix"
import {
  estadoVacio,
  instalarApiIrMt,
  trabajo,
  type ApiIrMt,
  type EstadoApiIrMt,
} from "./api-ir-mt-falsa"
import ProyectosPage from "@/app/inventario/proyectos/page"

vi.setConfig({ testTimeout: 60_000 })

/** Presupuesto de carga: varias colecciones SWR por pantalla. */
const PRESUPUESTO_CARGA = 60_000

function personaFalsa(
  id: string,
  nombres: string,
  apellidos: string,
  estadoCuenta: string
): Record<string, unknown> {
  return { id, nombres, apellidos, estadoCuenta }
}

function unidadFalsa(id: string, numero: string, etiqueta: string): Record<string, unknown> {
  return { id, numero, etiqueta }
}

/** El trabajo referencia responsable y unidad que viven en la página 2 del padrón. */
function estadoConPadronDeDosPaginas(): EstadoApiIrMt {
  const estado = estadoVacio()
  for (let i = 1; i <= 100; i++) {
    estado.personas.push(personaFalsa(`p-f-${String(i).padStart(3, "0")}`, `Relleno ${i}`, "Padron", "activa"))
    estado.unidades.push(unidadFalsa(`u-f-${String(i).padStart(3, "0")}`, String(i), "Depto"))
  }
  // Página 2: Eva es activa (debe poder elegirse y resolverse por nombre) y
  // Rosa inactiva (no debe ofrecerse nunca, tampoco desde el padrón completo).
  estado.personas.push(personaFalsa("p-eva", "Eva", "Fuera De Pagina", "activa"))
  estado.personas.push(personaFalsa("p-rosa", "Rosa", "Inactiva", "inactiva"))
  estado.unidades.push(unidadFalsa("u-fuera-907", "907", "Casa"))
  estado.trabajos.push(
    trabajo("mt-fuera", "MT-QA-99", "QA-FUERA", {
      responsablePersonaId: "p-eva",
      unidadId: "u-fuera-907",
    })
  )
  return estado
}

beforeEach(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Cache SWR fresco por render: un caso no hereda las filas del anterior. */
function renderPagina(): void {
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <ProyectosPage />
    </SWRConfig>
  )
}

describe("inventario/proyectos — padrón completo para la identidad", () => {
  it(
    "la fila imprime el responsable y la unidad de la página 2, no el id ni «—»",
    { timeout: PRESUPUESTO_CARGA },
    async () => {
      const api: ApiIrMt = instalarApiIrMt(estadoConPadronDeDosPaginas())
      renderPagina()

      // La fila del trabajo referencia persona y unidad que viven en la página 2
      // de los padrones: el nombre y el rótulo se resuelven, sin ids ni guiones.
      const fila = (await screen.findByText("MT-QA-99")).closest("tr") as HTMLElement
      await waitFor(
        () => {
          expect(within(fila).getByText("Eva Fuera De Pagina")).toBeInTheDocument()
          expect(within(fila).getByText("Casa 907")).toBeInTheDocument()
        },
        { timeout: 10_000 }
      )
      expect(within(fila).queryByText("p-eva")).toBeNull()

      // La identidad salió de las páginas 2 de ambos padrones: se caminaron.
      expect(api.peticiones).toContain("/api/personas?pageSize=100&page=2")
      expect(api.peticiones).toContain("/api/unidades?pageSize=100&page=2")
    }
  )
})

describe("inventario/proyectos — padrón completo para los selectores", () => {
  it(
    "la persona activa y la unidad de la página 2 se pueden elegir en el formulario de trabajo",
    { timeout: PRESUPUESTO_CARGA },
    async () => {
      const api: ApiIrMt = instalarApiIrMt(estadoConPadronDeDosPaginas())
      renderPagina()

      // La tabla debe estar servida antes de abrir el diálogo; la caminata del
      // padrón sigue en vuelo y el listbox la refleja mientras está abierto.
      await screen.findByText("MT-QA-99")

      const user = userEvent.setup({ delay: null })
      await user.click(screen.getByRole("button", { name: /nuevo trabajo/i }))
      const dialogo = await screen.findByRole("dialog")
      const combos = within(dialogo).getAllByRole("combobox")
      // 0: Unidad EF · 1: Sub-sector EF · 2: Equipo crítico · 3: Responsable interno
      await user.click(combos[0]!)
      const listaUnidades = await screen.findByRole("listbox", {}, { timeout: 5_000 })
      // La caminata completa el padrón con el listbox abierto: la unidad de la
      // página 2 tiene que TERMINAR en el listbox, no sólo en los datos.
      await waitFor(
        () => {
          const textos = within(listaUnidades)
            .getAllByRole("option")
            .map((o) => o.textContent)
          expect(textos).toContain("Casa 907")
        },
        { timeout: 10_000 }
      )
      await user.click(
        within(listaUnidades)
          .getAllByRole("option")
          .find((o) => o.textContent === "Casa 907") as HTMLElement
      )
      expect(await within(dialogo).findByText("Casa 907")).toBeInTheDocument()

      const combosTrasUnidad = within(dialogo).getAllByRole("combobox")
      await user.click(combosTrasUnidad[3]!)
      const listaPersonas = await screen.findByRole("listbox", {}, { timeout: 5_000 })
      await waitFor(
        () => {
          const textos = within(listaPersonas)
            .getAllByRole("option")
            .map((o) => o.textContent)
          expect(textos).toContain("Eva Fuera De Pagina")
        },
        { timeout: 10_000 }
      )
      // La inactiva de la página 2 sigue sin ofrecerse con el padrón completo.
      expect(within(listaPersonas).queryByText("Rosa Inactiva")).toBeNull()
      await user.click(
        within(listaPersonas)
          .getAllByRole("option")
          .find((o) => o.textContent === "Eva Fuera De Pagina") as HTMLElement
      )
      expect(await within(dialogo).findByText("Eva Fuera De Pagina")).toBeInTheDocument()

      // Los dos Select se llenaron con el padrón completo: se caminó la página 2.
      expect(api.peticiones).toContain("/api/personas?pageSize=100&page=2")
      expect(api.peticiones).toContain("/api/unidades?pageSize=100&page=2")
    }
  )
})

describe("inventario/proyectos — padrones en una sola página", () => {
  it(
    "la identidad y los selectores no cambian y no se piden páginas extra",
    { timeout: PRESUPUESTO_CARGA },
    async () => {
      const estado = estadoVacio()
      estado.personas.push(personaFalsa("p-lidia", "Lidia", "Propietaria", "activa"))
      estado.unidades.push(unidadFalsa("u-1", "1", "Depto"))
      estado.trabajos.push(
        trabajo("mt-1", "MT-QA-01", "QA-UNO", {
          responsablePersonaId: "p-lidia",
          unidadId: "u-1",
        })
      )
      const api: ApiIrMt = instalarApiIrMt(estado)
      renderPagina()

      // Todo cabe en una página: la identidad se resuelve igual.
      const fila = (await screen.findByText("MT-QA-01")).closest("tr") as HTMLElement
      await waitFor(() =>
        expect(within(fila).getByText("Lidia Propietaria")).toBeInTheDocument()
      )
      expect(within(fila).getByText("Depto 1")).toBeInTheDocument()

      // El formulario ofrece lo mismo que antes: la unidad de la única página.
      const user = userEvent.setup({ delay: null })
      await user.click(screen.getByRole("button", { name: /nuevo trabajo/i }))
      const dialogo = await screen.findByRole("dialog")
      const combos = within(dialogo).getAllByRole("combobox")
      await user.click(combos[0]!)
      const listaUnidades = await screen.findByRole("listbox", {}, { timeout: 5_000 })
      expect(within(listaUnidades).getByRole("option", { name: "Depto 1" })).toBeInTheDocument()

      // Ningún padrón pidió completarse: completarlos no agrega peticiones.
      expect(api.peticiones.some((p) => p.includes("&page=2"))).toBe(false)
    }
  )
})
