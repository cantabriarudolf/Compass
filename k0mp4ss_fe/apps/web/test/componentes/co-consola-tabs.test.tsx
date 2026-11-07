// @vitest-environment jsdom
/**
 * T11 · la consola de Comunicación ya no ofrece la pestaña «Biblioteca».
 *
 * El owner decidió que el Archivo de Documentos (`/comunidad/archivo`) absorbe la
 * antigua «Biblioteca de Documentos Comunales»: dos listados de documentos en la
 * UI son dos verdades. Esta spec fija las dos mitades del retiro:
 *   (a) la pestaña «Biblioteca» NO existe en la consola;
 *   (b) las otras tres pestañas siguen ahí y su contenido sigue renderizando
 *       (retirar una pestaña no puede llevarse la consola puesta).
 *
 * El mock de `@/lib/api/use-co` no expone `useDocumentosCO` a propósito: el hook se
 * retiró junto con la tabla `documentos_co` (F35 serie A, A5). Si la consola volviera
 * a pedir esa colección —ahora inexistente— el caso falla, en vez de pasar leyendo
 * una lista que ya no se muestra.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { instalarEntornoRadix } from "./entorno-radix"

/** Colección CO vacía tal como la entrega `useCrudCollection` sin datos. */
const { coleccionVacia } = vi.hoisted(() => ({
  coleccionVacia: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    hasMore: false,
    cargandoMas: false,
    cargarMas: async () => {},
    create: async () => ({ ok: true as const }),
    update: async () => ({ ok: true as const }),
    remove: async () => ({ ok: true as const }),
  }),
}))

vi.mock("@/lib/api/use-co", () => ({
  usePlantillasCO: coleccionVacia,
  useEnviosCO: coleccionVacia,
  useMensajesBuzonCO: coleccionVacia,
}))

// Maestros que la consola usa para resolver destinatarios del envío masivo.
vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({ personas: [], isLoading: false }),
}))
vi.mock("@/lib/api/use-vinculos", () => ({
  useVinculos: () => ({ vinculos: [], isLoading: false }),
}))
vi.mock("@/lib/api/use-unidades", () => ({ useUnidades: coleccionVacia }))
vi.mock("@/lib/api/use-macro-sectores", () => ({ useMacroSectores: coleccionVacia }))
vi.mock("@/lib/api/use-micro-sectores", () => ({ useMicroSectores: coleccionVacia }))

import { ConsolaComunicacionCO } from "@/app/comunidad/comunicacion/consola-comunicacion"

beforeEach(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
})

describe("Consola de Comunicación — pestañas después de retirar la Biblioteca", () => {
  it("no renderiza la pestaña Biblioteca y conserva las otras tres", () => {
    render(<ConsolaComunicacionCO />)

    const pestanas = screen.getAllByRole("tab").map((pestana) => pestana.textContent?.trim())
    expect(pestanas).toEqual(["Masivos", "Plantillas", "Buzón Ciudadano"])
    expect(screen.queryByRole("tab", { name: /Biblioteca/i })).toBeNull()

    // La pestaña que se muestra por defecto sigue rindiendo su contenido.
    expect(screen.getByText("Redactar comunicación oficial")).toBeInTheDocument()
  })
})
