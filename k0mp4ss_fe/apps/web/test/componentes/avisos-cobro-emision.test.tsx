// @vitest-environment jsdom
/**
 * F27 — el administrador emite el aviso de cobro de un período ya emitido y
 * después lo entrega de forma explícita (serie `aviso-de-cobro`, spec
 * «Aviso de Cobro Congelado…» y «Entrega del Aviso con Prueba»).
 *
 * Lo que este test fija, y que antes no existía en ninguna pantalla:
 *
 *   1. sin emisión de gasto común no hay papel: la acción no se ofrece;
 *   2. los tres conteos que ya devuelve la ruta se informan tal cual —creados
 *      (filas que volvieron), omitidos (unidades con cobro que la corrida no cubrió; NO son unidades sin cobro:
 *      período, que la ruta saltea) y el rechazo con su motivo, sin suavizarlo;
 *   3. EMITIR NUNCA ENTREGA: al emitir no se llama a `entregarAvisoCobro`;
 *   4. la entrega es explícita, un pedido por aviso, y su resultado —incluido
 *      el que falla— se refleja en la pantalla.
 *
 * Sólo se mockean las dos acciones de la API: la emisión devuelve las filas
 * creadas y la entrega se registra por aviso.
 */
import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { AvisoCobro } from "@/lib/schemas"

/** Dobles de las dos acciones del hook; cada caso reescribe su resultado. */
const fuente = vi.hoisted(() => ({
  emitirAvisosCobro: vi.fn(),
  entregarAvisoCobro: vi.fn(),
}))

vi.mock("@/lib/api/use-avisos-cobro", () => ({
  emitirAvisosCobro: fuente.emitirAvisosCobro,
  entregarAvisoCobro: fuente.entregarAvisoCobro,
}))

import { AccionAvisoDeCobro } from "@/app/finanzas/gastos-comunes/page"

/** Las tres filas que devolvería la ruta al emitir para 3 de 14 unidades. */
const AVISOS = [
  { id: "avi-1", folio: "AC-0001", periodo: "2026-09" },
  { id: "avi-2", folio: "AC-0002", periodo: "2026-09" },
  { id: "avi-3", folio: "AC-0003", periodo: "2026-09" },
] as unknown as AvisoCobro[]

const texto = (el: HTMLElement | null) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim()

const emitir = (props: {
  periodo?: string
  unidadesEmitidas?: number
  emisiones?: Array<{ periodo: string }>
}) =>
  render(
    <AccionAvisoDeCobro
      periodo={props.periodo ?? "2026-09"}
      unidadesEmitidas={props.unidadesEmitidas ?? 14}
      emisiones={props.emisiones ?? [{ periodo: "2026-09" }]}
    />
  )

beforeEach(() => {
  fuente.emitirAvisosCobro.mockReset()
  fuente.entregarAvisoCobro.mockReset()
})

afterEach(() => {
  cleanup()
})

describe("gastos comunes — el administrador emite y entrega el aviso (F27)", () => {
  it("no ofrece emitir avisos para un período sin emisión de gasto común", () => {
    emitir({ periodo: "2026-09", emisiones: [{ periodo: "2026-08" }] })

    expect(
      screen.queryByRole("button", { name: /emitir avisos/i })
    ).not.toBeInTheDocument()
    expect(texto(document.body)).toMatch(/sin emisión de gasto común/i)
  })

  it("antes de emitir solo ofrece el botón: no hay entregas ni estado inventado", () => {
    emitir({ unidadesEmitidas: 14 })

    // Preserva lo que la pantalla ya hacía: el historial no muestra nada del
    // aviso hasta que el administrador emite, y nada se entrega solo.
    expect(
      screen.getAllByRole("button", { name: /emitir avisos del período 2026-09/i })
    ).toHaveLength(1)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /entregar/i })).not.toBeInTheDocument()
    expect(fuente.emitirAvisosCobro).not.toHaveBeenCalled()
    expect(fuente.entregarAvisoCobro).not.toHaveBeenCalled()
  })

  it("emite y reporta los tres conteos: creados, omitidos y rechazados", async () => {
    fuente.emitirAvisosCobro.mockResolvedValue({ ok: true, avisos: AVISOS })
    const user = userEvent.setup()
    emitir({ unidadesEmitidas: 14 })

    await user.click(
      screen.getByRole("button", { name: /emitir avisos del período 2026-09/i })
    )

    expect(fuente.emitirAvisosCobro).toHaveBeenCalledWith("2026-09")
    const bloque = texto(await screen.findByRole("status"))
    // 3 filas creadas; 14 unidades en la emisión - 3 con cobro = 11 omitidas.
    expect(bloque).toContain("3 creados")
    expect(bloque).toContain("11 sin aviso")
    expect(bloque).toContain("0 rechazados")
    // La entrega es un paso aparte: emitir no entrega.
    expect(fuente.entregarAvisoCobro).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", { name: /entregar los 3 avisos por el visor/i })
    ).toBeInTheDocument()
  })

  it("muestra el rechazo de la ruta tal cual y no habilita entregar", async () => {
    const motivo =
      "La comunidad no tiene fondos de caja: el saldo al cierre del período no es computable."
    fuente.emitirAvisosCobro.mockResolvedValue({
      ok: false,
      error: motivo,
      avisos: [],
    })
    const user = userEvent.setup()
    emitir({ unidadesEmitidas: 14 })

    await user.click(
      screen.getByRole("button", { name: /emitir avisos del período 2026-09/i })
    )

    const bloque = texto(await screen.findByRole("status"))
    expect(bloque).toContain("0 creados")
    // Un rechazo no omite unidades: no se emitió nada y no se salteó a nadie.
    expect(bloque).toContain("0 sin aviso")
    expect(bloque).toContain("1 rechazado")
    expect(bloque).toContain(motivo)
    expect(
      screen.queryByRole("button", { name: /entregar/i })
    ).not.toBeInTheDocument()
    expect(fuente.entregarAvisoCobro).not.toHaveBeenCalled()
  })

  it("entrega por aviso cuando se lo piden y refleja el resultado de cada uno", async () => {
    fuente.emitirAvisosCobro.mockResolvedValue({ ok: true, avisos: AVISOS })
    fuente.entregarAvisoCobro.mockImplementation(async (id: string) => {
      if (id === "avi-3") {
        return { ok: false, error: "La unidad 103 no tiene propietario vigente." }
      }
      return {
        ok: true,
        folio: id === "avi-1" ? "AC-0001" : "AC-0002",
        mensaje: `${id}: visor entregado, email pendiente (sin emisor SMTP).`,
      }
    })
    const user = userEvent.setup()
    emitir({ unidadesEmitidas: 14 })

    await user.click(
      screen.getByRole("button", { name: /emitir avisos del período 2026-09/i })
    )
    expect(fuente.entregarAvisoCobro).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole("button", { name: /entregar los 3 avisos por el visor/i })
    )

    // Un pedido de entrega por aviso, en el orden en que la ruta los creó.
    expect(fuente.entregarAvisoCobro.mock.calls.map((c) => c[0])).toEqual([
      "avi-1",
      "avi-2",
      "avi-3",
    ])
    const bloque = texto(await screen.findByRole("status"))
    expect(bloque).toContain("AC-0001 · avi-1: visor entregado")
    expect(bloque).toContain("email pendiente (sin emisor SMTP)")
    expect(bloque).toContain(
      "AC-0003 · No se entregó: La unidad 103 no tiene propietario vigente."
    )
  })
})
