// @vitest-environment jsdom
/**
 * Calendario de reservas RA — la fila ajena se ve, su identidad y su dinero no.
 *
 * Serie «permisos por objeto», T18 (decisión A del owner): un residente ve la
 * OCUPACIÓN de la comunidad (qué tramo, de qué amenity, en qué estado) pero no
 * quién reservó, ni qué unidad, ni cuánto costó. La API lo resuelve redactando la
 * fila ajena (`app/api/ra/reservas/_alcance.ts` → `proyectarReservaRA`): los
 * campos de identidad y dinero llegan en `null`.
 *
 * Estos casos fijan lo observable en la pantalla (`app/operaciones/reservas/page.tsx`):
 * - la fila ajena se sigue viendo (folio, tramo, estado), con «Reservado» y «—»;
 * - ninguna celda de dinero llama a `toLocaleString` sobre `null` ni pinta `$0`;
 * - la fila propia conserva nombre, unidad y montos, y es la única con el botón
 *   «Retener garantía» (el diálogo lee `montoGarantia`, así que para una fila
 *   redactada no puede abrirse);
 * - una cancelación ajena muestra «tardía» sin la penalización.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { instalarEntornoRadix } from "./entorno-radix"
import type { ElementoRA, ReservaRA } from "@/lib/schemas"

const ELEMENTO: ElementoRA = {
  id: "el-quincho",
  nombre: "Quincho",
  tipo: "espacio_fisico",
  franja: "bloques_horas",
  duracionBloqueHoras: 2,
  tarifaUso: 15000,
  garantiaRequerida: 5000,
  activo: true,
}

/**
 * Fila PROPIA: todo lo que el servidor entrega al dueño de la reserva.
 */
const PROPIA = {
  id: "rs-propia",
  comunidadId: "com-a",
  folio: "RA-0001",
  elementoId: ELEMENTO.id,
  solicitantePersonaId: "p-ana",
  unidadId: "u-101",
  fecha: "2026-11-20",
  horaInicio: "10:00",
  horaFin: "12:00",
  estado: "confirmada",
  montoTarifa: 15000,
  montoGarantia: 5000,
  cancelacion: null,
  garantiaRetenida: null,
  cargoFIReferencia: null,
} as unknown as ReservaRA

/**
 * Fila AJENA tal como la recibe un residente: la respuesta redactada del
 * servidor (`solicitantePersonaId`, `unidadId` y montos en `null`). El tipo
 * `ReservaRA` describe la fila de la BD, no la transportada — de ahí el cast.
 */
const AJENA = {
  ...PROPIA,
  id: "rs-ajena",
  folio: "RA-0002",
  solicitantePersonaId: null,
  unidadId: null,
  montoTarifa: null,
  montoGarantia: null,
  horaInicio: "12:00",
  horaFin: "14:00",
} as unknown as ReservaRA

/** Fila AJENA cancelada: conserva los hechos del tramo, no la penalización. */
const AJENA_CANCELADA = {
  ...AJENA,
  id: "rs-ajena-cancelada",
  folio: "RA-0003",
  estado: "cancelada",
  horaInicio: "16:00",
  horaFin: "18:00",
  cancelacion: { fecha: "2026-11-10", tardia: true, penalizacion: null },
} as unknown as ReservaRA

vi.mock("@/lib/api/use-ra", () => ({
  useElementosRA: () => ({
    items: [ELEMENTO],
    total: 1,
    isLoading: false,
    error: null,
    hasMore: false,
    cargarMas: vi.fn(),
    cargandoMas: false,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
  }),
  useReservasRA: () => ({
    items: [PROPIA, AJENA, AJENA_CANCELADA],
    total: 3,
    isLoading: false,
    error: null,
    hasMore: false,
    cargarMas: vi.fn(),
    cargandoMas: false,
    create: vi.fn(async () => ({ ok: true })),
    update: vi.fn(async () => ({ ok: true })),
    remove: vi.fn(async () => ({ ok: true })),
  }),
}))

vi.mock("@/lib/api/use-personas", () => ({
  usePersonas: () => ({
    personas: [
      {
        id: "p-ana",
        nombres: "Ana",
        apellidos: "Pérez",
        rut: "11111111-1",
        email: "ana@test.cl",
      },
    ],
    total: 1,
    isLoading: false,
  }),
}))

vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () => ({
    items: [{ id: "u-101", numero: "101", etiqueta: "Depto", rolSii: "" }],
    total: 1,
    isLoading: false,
    error: null,
    hasMore: false,
    cargarMas: vi.fn(),
    cargandoMas: false,
  }),
}))

vi.mock("@/lib/api/use-micro-sectores", () => ({
  useMicroSectores: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    hasMore: false,
    cargarMas: vi.fn(),
    cargandoMas: false,
  }),
}))

vi.mock("@/lib/api/use-ir", () => ({
  useRecursosIR: () => ({
    items: [],
    total: 0,
    isLoading: false,
    error: null,
    hasMore: false,
    cargarMas: vi.fn(),
    cargandoMas: false,
  }),
}))

import ReservasPage from "@/app/operaciones/reservas/page"

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
})

/** La fila de la tabla que muestra ese folio. */
function filaDe(folio: string): HTMLElement {
  const celda = screen.getByText(folio)
  const tr = celda.closest("tr")
  if (!tr) throw new Error(`sin fila para ${folio}`)
  return tr as HTMLElement
}

describe("calendario de reservas — redacción de la fila ajena (T18)", () => {
  it("la fila ajena conserva el tramo y muestra «Reservado» y «—», sin nombre ni unidad", () => {
    render(<ReservasPage />)

    const ajena = filaDe("RA-0002")
    // La OCUPACIÓN se ve: elemento, fecha y tramo siguen en la celda.
    expect(within(ajena).getByText("Quincho")).toBeInTheDocument()
    expect(within(ajena).getByText(/12:00–14:00/)).toBeInTheDocument()
    // Y la identidad no: el nombre del solicitante no aparece en esta fila.
    expect(within(ajena).getByText("Reservado")).toBeInTheDocument()
    expect(within(ajena).queryByText(/Ana Pérez/)).toBeNull()
    expect(within(ajena).queryByText(/101/)).toBeNull()
    // Los dos montos redactados: `—`, nunca `$0` y sin tocar `toLocaleString`.
    const redactados = within(ajena).getAllByText("—")
    expect(redactados).toHaveLength(2) // unidad + tarifa
    expect(within(ajena).getByText("garantía —")).toBeInTheDocument()
    expect(within(ajena).queryByText(/\$/)).toBeNull()
  })

  it("la fila propia sigue mostrando nombre, unidad y montos, y es la única con «Retener garantía»", () => {
    render(<ReservasPage />)

    const propia = filaDe("RA-0001")
    expect(within(propia).getByText("Ana Pérez")).toBeInTheDocument()
    expect(within(propia).getByText("Depto 101")).toBeInTheDocument()
    expect(within(propia).getByText(/\$15\.000/)).toBeInTheDocument()
    expect(within(propia).getByText(/garantía \$5\.000/)).toBeInTheDocument()
    expect(
      within(propia).getByRole("button", { name: /Retener garantía/ })
    ).toBeInTheDocument()
    // El botón abre un diálogo que lee `montoGarantia`: para las filas redactadas
    // (garantía `null`) no existe, así que el diálogo no puede renderizarse.
    expect(
      screen.getAllByRole("button", { name: /Retener garantía/ })
    ).toHaveLength(1)
  })

  it("una cancelación ajena muestra «tardía» sin la penalización", () => {
    render(<ReservasPage />)

    const cancelada = filaDe("RA-0003")
    expect(within(cancelada).getByText("Cancelada")).toBeInTheDocument()
    expect(within(cancelada).getByText(/tardía/)).toBeInTheDocument()
    // La penalización viaja en `null`: el sufijo con el monto no se pinta.
    expect(within(cancelada).queryByText(/\$/)).toBeNull()
    expect(within(cancelada).getByText("Reservado")).toBeInTheDocument()
  })
})
