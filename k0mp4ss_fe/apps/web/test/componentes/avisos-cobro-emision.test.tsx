// @vitest-environment jsdom
/**
 * F27 — el administrador emite el aviso de cobro de un período ya emitido y
 * después lo entrega de forma explícita (serie `aviso-de-cobro`, spec
 * «Aviso de Cobro Congelado…» y «Entrega del Aviso con Prueba»).
 *
 * Lo que este test fija, y que antes no existía en ninguna pantalla:
 *
 *   1. sin emisión de gasto común no hay papel: la acción no se ofrece;
 *   2. los conteos que devuelve la ruta se informan tal cual —creados (filas que
 *      volvieron), sin aviso y rechazado con su motivo, sin suavizarlo— y, para
 *      las unidades sin aviso, TAMBIÉN el motivo que declaró el SERVIDOR
 *      (`sin_cobro`, `ya_tiene_aviso`, `otro`). La pantalla ya no deduce ese
 *      número restando las líneas de la emisión: no podía decir el porqué y el
 *      porqué inventado se lee como una falla del sistema;
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

/**
 * Lo que la ruta declara sin aviso, con su motivo. No es una resta: cada fila
 * trae la causa que el servidor pudo afirmar, y la última ni número ni etiqueta
 * (el cargo apuntaba a una unidad que ya no existe).
 */
const SIN_AVISO = [
  { unidadId: "u-103", numero: "103", etiqueta: "Depto 103", motivo: "sin_cobro" },
  { unidadId: "u-104", numero: "104", etiqueta: "Depto 104", motivo: "ya_tiene_aviso" },
  { unidadId: "u-fantasma", numero: null, etiqueta: null, motivo: "otro" },
]

const texto = (el: HTMLElement | null) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim()

const emitir = (props: {
  periodo?: string
  emisiones?: Array<{ periodo: string }>
}) =>
  render(
    <AccionAvisoDeCobro
      periodo={props.periodo ?? "2026-09"}
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
    emitir({})

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

  it("emite y reporta creados, rechazados y el motivo de CADA unidad sin aviso", async () => {
    fuente.emitirAvisosCobro.mockResolvedValue({
      ok: true,
      avisos: AVISOS,
      sinAviso: SIN_AVISO,
    })
    const user = userEvent.setup()
    emitir({})

    await user.click(
      screen.getByRole("button", { name: /emitir avisos del período 2026-09/i })
    )

    expect(fuente.emitirAvisosCobro).toHaveBeenCalledWith("2026-09")
    const bloque = texto(await screen.findByRole("status"))
    // 3 filas creadas y 3 unidades declaradas sin aviso por la ruta.
    expect(bloque).toContain("3 creados")
    expect(bloque).toContain("3 sin aviso")
    expect(bloque).toContain("0 rechazados")
    // El motivo de cada una lo dice el servidor: la pantalla no lo supone.
    expect(bloque).toContain("Sin aviso: Depto 103 — no tiene cargo en el período")
    expect(bloque).toContain("Sin aviso: Depto 104 — ya tiene aviso de este período")
    expect(bloque).toContain("Sin aviso: u-fantasma — no se pudo determinar la causa")
    // La entrega es un paso aparte: emitir no entrega.
    expect(fuente.entregarAvisoCobro).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", { name: /entregar los 3 avisos por el visor/i })
    ).toBeInTheDocument()
  })

  it("el conteo «sin aviso» sale de la lista del servidor, no de una resta", async () => {
    // Dos motivos, tres avisos creados. La pantalla no recibe la cantidad de
    // unidades de la emisión: si el número se dedujera, no existiría.
    fuente.emitirAvisosCobro.mockResolvedValue({
      ok: true,
      avisos: AVISOS,
      sinAviso: SIN_AVISO.slice(0, 2),
    })
    const user = userEvent.setup()
    emitir({})

    await user.click(
      screen.getByRole("button", { name: /emitir avisos del período 2026-09/i })
    )

    const bloque = texto(await screen.findByRole("status"))
    expect(bloque).toContain("2 sin aviso")
    expect(bloque).not.toContain("no se pudo determinar la causa")
  })

  it("muestra el rechazo de la ruta tal cual y no habilita entregar", async () => {
    const motivo =
      "La comunidad no tiene fondos de caja: el saldo al cierre del período no es computable."
    fuente.emitirAvisosCobro.mockResolvedValue({
      ok: false,
      error: motivo,
      avisos: [],
      sinAviso: [],
    })
    const user = userEvent.setup()
    emitir({})

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
    fuente.emitirAvisosCobro.mockResolvedValue({ ok: true, avisos: AVISOS, sinAviso: [] })
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
    emitir({})

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
