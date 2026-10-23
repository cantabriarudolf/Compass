// @vitest-environment jsdom
/**
 * Visor de mensajes — el recorte del pie se ve.
 *
 * Hallazgo de la auditoría: el pie "Próximas reservas" cortaba con `.slice(0, 5)` sin
 * declarar cuántas reservas quedaban fuera, así que en pantalla el residente creía que
 * esas cinco eran todas las de los próximos 7 días.
 *
 * Patrón aplicado: el "…y N más" que ya usa comunicación (app/comunidad/comunicacion/page.tsx:444)
 * — el visor es una pantalla de kiosco sobre fondo negro, donde el bloque ámbar de
 * `AvisoTruncamiento` (pensado para formularios sobre superficie clara) no encaja.
 *
 * Casos fijados: 8 reservas → 5 visibles + "…y 3 más"; 3 reservas → 3 visibles y sin aviso.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { AvisoCV, ElementoRA, ReservaRA } from "@/lib/schemas"

const estado = {
  reservas: [] as ReservaRA[],
  elementos: [] as ElementoRA[],
}

vi.mock("@/lib/api/use-cv", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api/use-cv")>()
  return {
    ...real,
    useAvisosCV: () => ({
      items: avisos(),
      total: avisos().length,
      isLoading: false,
      error: null,
      create: vi.fn(async () => ({ ok: true })),
      update: vi.fn(async () => ({ ok: true })),
      remove: vi.fn(async () => ({ ok: true })),
    }),
  }
})
vi.mock("@/lib/api/use-ra", () => ({
  useReservasRA: () => ({ items: estado.reservas, total: estado.reservas.length, isLoading: false }),
  useElementosRA: () => ({ items: estado.elementos, total: estado.elementos.length, isLoading: false }),
}))
vi.mock("@/lib/api/use-configuracion", () => ({
  useConfiguracion: () => ({ config: undefined, isLoading: false }),
}))

import VisorMensajesPage from "@/app/visor-mensajes/page"

/** Fecha ISO a N días de hoy (el pie filtra los próximos 7 días). */
function enDias(dias: number): string {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

function avisos(): AvisoCV[] {
  return [
    {
      id: "cv-1",
      titulo: "Mantención de ascensores",
      cuerpo: "El lunes se interviene el ascensor del block A entre 9:00 y 13:00.",
      tipologia: "info",
      duracionSegundos: 10,
      pantallaCompleta: false,
      tags: ["mantenimiento"],
      estado: "publicado",
      requiereVistoBueno: false,
      origen: "manual",
      fechaCreacion: enDias(-1),
      fechaPublicacion: enDias(-1),
    },
  ]
}

function reserva(id: string, indice: number): ReservaRA {
  return {
    id,
    folio: `RA-${indice}`,
    elementoId: estado.elementos[indice % estado.elementos.length]!.id,
    solicitantePersonaId: "p-1",
    fecha: enDias((indice % 5) + 1),
    horaInicio: "10:00",
    horaFin: "12:00",
    estado: "confirmada",
    montoTarifa: 15_000,
    montoGarantia: 10_000,
  }
}

beforeEach(() => {
  estado.elementos = [
    {
      id: "el-quincho",
      nombre: "Quincho",
      tipo: "espacio_fisico",
      franja: "bloques_horas",
      duracionBloqueHoras: 2,
      tarifaUso: 15_000,
      garantiaRequerida: 10_000,
      activo: true,
    },
    {
      id: "el-sala",
      nombre: "Sala multiuso",
      tipo: "espacio_fisico",
      franja: "bloques_horas",
      duracionBloqueHoras: 2,
      tarifaUso: 20_000,
      garantiaRequerida: 10_000,
      activo: true,
    },
  ]
  estado.reservas = Array.from({ length: 8 }, (_, i) => reserva(`ra-${i + 1}`, i))
})

afterEach(() => {
  cleanup()
})

describe("visor-mensajes — pie de próximas reservas", () => {
  it("con 8 reservas muestra 5 y declara las 3 que quedan fuera", () => {
    render(<VisorMensajesPage />)

    for (const nombre of ["Quincho", "Sala multiuso"]) {
      expect(screen.getAllByText(nombre).length).toBeGreaterThan(0)
    }

    const aviso = screen.getByRole("status")
    expect((aviso.textContent ?? "").replace(/\s+/g, " ").trim()).toBe("…y 3 más")

    // 5 fichas visibles: 8 reservas → 5 en el pie + 1 aviso = 6 nodos, 3 reservas ocultas.
    expect(estado.reservas).toHaveLength(8)
    expect(screen.getAllByText(/10:00–12:00/)).toHaveLength(5)
  })

  it("con 3 reservas muestra las 3 y no hay aviso de recorte", () => {
    estado.reservas = Array.from({ length: 3 }, (_, i) => reserva(`ra-${i + 1}`, i))

    render(<VisorMensajesPage />)

    expect(screen.getAllByText(/10:00–12:00/)).toHaveLength(3)
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByText(/…y \d+ más/)).toBeNull()
  })
})
