// @vitest-environment jsdom
/**
 * S9 — el badge «X/Y leídos» del administrador sale de las lecturas reales y
 * declara que es un dato de recepción del canal, no una notificación legal
 * (change co-lectura-residente, tarea 1.8 · design §Textos de UI punto 2).
 *
 * El texto del dictamen se fija LITERAL acá: si alguien lo parafrasea o lo
 * acorta, este test falla. La métrica nunca se presenta como acuse de recibo.
 */
import React from "react"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MetricaLecturas } from "@/components/co/metrica-lecturas"
import { textoMetricaLecturas } from "@/components/co/textos-lectura"

/** Literal del dictamen (design §Textos de UI, punto 2), con X/Y reemplazados. */
const METRICA_10_DE_32 =
  "10/32 leídos. Dato estadístico de recepción del canal; no acredita conocimiento del contenido ni constituye notificación legal por sí solo."

const DESCARGO =
  "Dato estadístico de recepción del canal; no acredita conocimiento del contenido ni constituye notificación legal por sí solo."

afterEach(() => {
  cleanup()
})

describe("MetricaLecturas — X/Y leídos con descargo de notificación", () => {
  it("compone el texto del dictamen con los totales reales", () => {
    expect(textoMetricaLecturas(10, 32)).toBe(METRICA_10_DE_32)
  })

  it("muestra el conteo y el descargo completo en pantalla", () => {
    render(<MetricaLecturas leidos={10} total={32} />)
    expect(screen.getByText("10/32 leídos")).toBeTruthy()
    expect(screen.getByText(DESCARGO)).toBeTruthy()
  })

  it("en cero leídos sigue declarando el descargo", () => {
    render(<MetricaLecturas leidos={0} total={7} />)
    expect(screen.getByText("0/7 leídos")).toBeTruthy()
    expect(screen.getByText(DESCARGO)).toBeTruthy()
  })
})
