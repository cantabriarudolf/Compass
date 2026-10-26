// @vitest-environment jsdom
/**
 * F6 — rótulos de filas del día cuya unidad o persona quedó fuera de la primera página
 * del padrón (`pageSize=100`).
 *
 * El panel pide el padrón de la operación recortado a 100 filas. Una visita del día cuyo
 * `unidadId` o `destinoPersonaId` no está en esa página se renderiza con el id crudo
 * (`u-Z-707`) hasta que el efecto de rótulos la resuelve UNA vez contra `?ids=` de las
 * proyecciones `/api/pe/unidades` y `/api/pe/personas`. Este caso fija el estado final
 * observable: la tabla muestra la etiqueta de la unidad y el nombre de la persona, no ids.
 *
 * El servidor falso (`api-pe-falsa.ts`) soporta ambas rutas con `?ids=`: la lista cerrada de
 * unidades no se trunca por pageSize y la de personas se filtra antes del recorte. La visita
 * del día se siembra por el estado del servidor, no por `localStorage`.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import { instalarEntornoRadix } from "./entorno-radix"
import { instalarApiPE } from "./api-pe-falsa"
import { VisitasPanel } from "@/components/pe/visitas-panel"

vi.setConfig({ testTimeout: 120_000 })

const HOY = new Date().toISOString().slice(0, 10)

/** Unidad de la fila: la número 101 del estado, fuera de la primera página del padrón. */
const UNIDAD_FUERA = { id: "u-Z-707", numero: "707", etiqueta: "Depto", rolSii: "707-Z11" }
const ETIQUETA_FUERA = "Depto 707 · 707-Z11"

/** Persona destino de la fila: también fuera de la primera página del padrón. */
const PERSONA_FUERA = { id: "p-Z-999", rut: "17.777.777-7", nombreCompleto: "María Ríos Soto" }

/** 100 unidades de relleno: llenan la primera página del padrón y dejan a la de arriba fuera. */
function rellenoUnidades() {
  return Array.from({ length: 100 }, (_, i) => ({
    id: `u-R-${i + 1}`,
    numero: String(i + 1),
    etiqueta: "Depto",
    rolSii: `100-R${i + 1}`,
  }))
}

/** 100 personas de relleno con el mismo propósito, para el padrón de personas. */
function rellenoPersonas() {
  return Array.from({ length: 100 }, (_, i) => ({
    id: `p-R-${i + 1}`,
    rut: `12.345.6${String(i).padStart(2, "0")}-${(i % 9) + 1}`,
    nombreCompleto: `Relleno ${i + 1} Apellido`,
  }))
}

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("VisitasPanel — rótulos fuera de la primera página (F6)", () => {
  it("resuelve por ?ids= la unidad y la persona de una visita del día fuera del padrón", async () => {
    const api = instalarApiPE({
      unidades: [...rellenoUnidades(), UNIDAD_FUERA],
      personas: [...rellenoPersonas(), PERSONA_FUERA],
      vinculos: [],
      bitacora: [
        {
          id: "pe-vis-fuera",
          fecha: HOY,
          nombre: "Visita Fuera de Página",
          dni: "16.444.555-0",
          unidadId: UNIDAD_FUERA.id,
          destinoPersonaId: PERSONA_FUERA.id,
          jornadaId: "j-manana",
          origenAgenda: "sin_aviso",
          estado: "agendada",
        },
      ],
    })

    render(<VisitasPanel diaReporte={HOY} onError={vi.fn()} onSuccess={vi.fn()} />)

    const fila = await screen.findByRole("row", { name: /Visita Fuera de Página/ })

    // El rótulo viaja por la lista cerrada `?ids=` de las dos proyecciones de la operación.
    await waitFor(() => {
      expect(
        api.peticiones.some(
          (p) => p.metodo === "GET" && p.url === `/api/pe/unidades?ids=${UNIDAD_FUERA.id}`
        )
      ).toBe(true)
      expect(
        api.peticiones.some(
          (p) => p.metodo === "GET" && p.url === `/api/pe/personas?ids=${PERSONA_FUERA.id}`
        )
      ).toBe(true)
    })

    // Estado final de la fila: etiqueta de la unidad y nombre de la persona, no ids crudos.
    await waitFor(() => {
      expect(within(fila).getByText(ETIQUETA_FUERA)).toBeTruthy()
      expect(within(fila).getByText(PERSONA_FUERA.nombreCompleto)).toBeTruthy()
    })
    expect(within(fila).queryByText(UNIDAD_FUERA.id)).toBeNull()
    expect(within(fila).queryByText(PERSONA_FUERA.id)).toBeNull()
  })
})
