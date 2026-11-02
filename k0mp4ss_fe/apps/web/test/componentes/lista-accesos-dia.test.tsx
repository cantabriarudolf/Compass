// @vitest-environment jsdom
/**
 * Lista única del día (T3 de `odd/tasks/acceso-unico.md`).
 *
 * El owner pidió ver en una sola lista lo que hoy vive en tres paneles: visitas,
 * encomiendas y trabajos del día consultado. La lista es de SOLO LECTURA: no
 * crea, no edita ni transiciona nada; eso sigue en cada panel.
 *
 * Los casos afirman lo que el conserje ve: el orden por hora descendente, el
 * filtro por tipo, la marca de la encomienda (que no registra hora) y la
 * columna «Avisó / por quién», que solo muestra datos reales del modelo.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SWRConfig } from "swr"
import { instalarEntornoRadix } from "./entorno-radix"
import { instalarApiPE, type OpcionesApiPE } from "./api-pe-falsa"
import { ListaAccesosDia } from "@/components/pe/lista-accesos-dia"
import type { BitacoraVisitaPE, EncomiendaPE, IngresoContratistaPE } from "@/lib/schemas"

vi.setConfig({ testTimeout: 120_000 })

/** Día fijo: la lista recibe el día por prop, así que no depende del reloj. */
const HOY = "2026-11-02"

/** Fila de encomienda tal como la devuelve la API: Prisma agrega `createdAt`. */
type EncomiendaConCreacion = EncomiendaPE & { createdAt?: string }

beforeAll(() => {
  instalarEntornoRadix()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function visita(extra: Partial<BitacoraVisitaPE> = {}): BitacoraVisitaPE {
  return {
    id: "pe-vis-1",
    fecha: HOY,
    nombre: "Ana Torres",
    dni: "16.444.555-0",
    jornadaId: "j-manana",
    origenAgenda: "sin_aviso",
    estado: "ingresada",
    horaIngreso: "09:15",
    ...extra,
  }
}

function encomienda(extra: Partial<EncomiendaConCreacion> = {}): EncomiendaConCreacion {
  return {
    id: "pe-enc-1",
    courierId: "co-chilex",
    fechaRecepcion: HOY,
    estado: "recibida",
    ...extra,
  }
}

function ingreso(extra: Partial<IngresoContratistaPE> = {}): IngresoContratistaPE {
  return {
    id: "pe-cont-1",
    contratistaId: "ct-servex",
    motivo: "Mantención del ascensor",
    fecha: HOY,
    jornadaId: "j-manana",
    agendadoPor: "administracion",
    estado: "ingresado",
    horaIngreso: "11:00",
    ...extra,
  }
}

/** Monta la lista con un servidor falso por caso y sin caché SWR compartida. */
function montar(opciones: OpcionesApiPE = {}) {
  const api = instalarApiPE(opciones)
  render(
    <SWRConfig
      value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}
    >
      <ListaAccesosDia diaReporte={HOY} />
    </SWRConfig>
  )
  return api
}

/** Filas del cuerpo de la tabla (sin la cabecera), en el orden en que se ven. */
async function filasDelCuerpo(): Promise<HTMLElement[]> {
  const tabla = await screen.findByRole("table")
  return within(tabla).getAllByRole("row").slice(1)
}

describe("ListaAccesosDia — lista única del día", () => {
  it("mezcla visitas, encomiendas y trabajos, y ordena por hora descendente", async () => {
    montar({
      bitacora: [visita({ destinoPersonaId: "p-1", unidadId: "u-A-101" })],
      encomiendas: [encomienda({ createdAt: "2026-11-02T14:32:00", destinatarioPersonaId: "p-1" })],
      ingresos: [ingreso()],
    })

    const filas = await filasDelCuerpo()
    expect(filas).toHaveLength(3)

    // 14:32 (encomienda) → 11:00 (trabajo) → 09:15 (visita)
    expect(filas[0]!.textContent).toContain("14:32*")
    expect(filas[0]!.textContent).toContain("Encomienda")
    expect(filas[0]!.textContent).toContain("Chilexpress")
    expect(filas[1]!.textContent).toContain("11:00")
    expect(filas[1]!.textContent).toContain("Trabajo")
    expect(filas[1]!.textContent).toContain("Servex Ltda.")
    expect(filas[2]!.textContent).toContain("09:15")
    expect(filas[2]!.textContent).toContain("Visita")
    expect(filas[2]!.textContent).toContain("Ana Torres")

    // Solo lectura: la lista no ofrece acciones sobre los registros.
    const tabla = screen.getByRole("table")
    expect(within(tabla).queryByRole("button")).toBeNull()
  })

  it("el filtro por tipo deja solo las filas de ese tipo", async () => {
    const user = userEvent.setup()
    montar({
      bitacora: [visita()],
      encomiendas: [encomienda({ createdAt: "2026-11-02T14:32:00" })],
      ingresos: [ingreso()],
    })

    expect(await filasDelCuerpo()).toHaveLength(3)

    await user.click(screen.getByRole("combobox", { name: "Filtrar por tipo" }))
    await user.click(await screen.findByRole("option", { name: "Visitas" }))

    const filas = await filasDelCuerpo()
    expect(filas).toHaveLength(1)
    expect(filas[0]!.textContent).toContain("Ana Torres")
    expect(screen.queryByText("Chilexpress")).toBeNull()
    expect(screen.queryByText("Servex Ltda.")).toBeNull()
  })

  it("la encomienda se muestra con la hora de creación marcada y la nota al pie", async () => {
    montar({
      encomiendas: [encomienda({ createdAt: "2026-11-02T14:32:00" })],
    })

    const filas = await filasDelCuerpo()
    expect(filas).toHaveLength(1)
    expect(filas[0]!.textContent).toContain("14:32*")
    expect(filas[0]!.textContent).not.toContain("14:32 ")
    // La nota explica por qué la hora lleva asterisco.
    expect(screen.getByText(/La encomienda no registra hora/i)).toBeTruthy()
  })

  it("«Avisó / por quién» muestra el residente que agendó y «Administración» si no", async () => {
    montar({
      ingresos: [
        ingreso({
          id: "pe-cont-res",
          motivo: "Reparación del portón",
          agendadoPor: "residente",
          personaAgendaId: "p-1",
          horaIngreso: "10:00",
        }),
        ingreso({ id: "pe-cont-adm", horaIngreso: "08:30" }),
      ],
    })

    const filas = await filasDelCuerpo()
    expect(filas).toHaveLength(2)
    expect(filas[0]!.textContent).toContain("10:00")
    expect(filas[0]!.textContent).toContain("Juan Pérez González")
    expect(filas[1]!.textContent).toContain("Administración")
  })

  it("sin accesos del día lo dice explícitamente", async () => {
    montar()

    expect(
      await screen.findByText("No hay accesos registrados para este día.")
    ).toBeTruthy()
    expect(screen.queryByRole("table")).toBeNull()
  })
})
