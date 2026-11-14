// @vitest-environment jsdom
/**
 * La tarjeta de titularidad en `/admin/metricas` — el conteo que no puede mentir.
 *
 * Un cero en esta tarjeta se leería como «todas las unidades tienen dueño», así
 * que el error de la API se muestra con SU mensaje (nunca como cero) y el estado
 * bueno (cero incidentes) se dice con palabras, no con un número solo.
 *
 * Los hooks de datos se reemplazan por fakes controlados: lo que se prueba acá
 * es la PRESENTACIÓN del contrato de `use-titularidad`, no la red.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import type { TitularidadRespuesta } from "@/app/admin/metricas/use-titularidad"

const estadoTitularidad = vi.hoisted(() => ({
  titularidad: null as TitularidadRespuesta | null,
  isLoading: false,
  error: null as Error | null,
}))

vi.mock("@/lib/api/use-unidades", () => ({
  useUnidades: () => ({ items: [], isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-tipos-unidad", () => ({
  useTiposUnidad: () => ({ items: [], isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-maestros", () => ({
  useMaestros: () => ({ data: [], isLoading: false, error: null }),
}))
vi.mock("@/lib/api/use-emisiones-gc", () => ({
  useEmisionesGC: () => ({ items: [], isLoading: false, error: null }),
}))
vi.mock("@/app/admin/metricas/use-kpi-vigencia", () => ({
  useKpiVigencia: () => ({ kpi: null, isLoading: false, error: null }),
}))
vi.mock("@/app/admin/metricas/use-titularidad", () => ({
  useTitularidad: () => estadoTitularidad,
}))

import MetricasPage from "@/app/admin/metricas/page"

const TITULO_SECCION = "Módulo: Titularidad de Unidades"
const ETIQUETA_CONTEO = "Unidades sin propietario vigente"
const ESTADO_BUENO =
  "Todas las unidades evaluadas tienen propietario vigente."

/** La sección completa de titularidad, partiendo del rótulo del encabezado. */
function seccionTitularidad(): HTMLElement {
  const rotulo = screen.getByText(TITULO_SECCION)
  const seccion = rotulo.closest("section")
  if (!seccion) {
    throw new Error("la sección de titularidad no tiene contenedor <section>")
  }
  return seccion
}

/** El valor de un ModuleMetric de la sección, por el texto de su rótulo. */
function valorDeMetrica(seccion: HTMLElement, etiqueta: string): string {
  const rotulo = within(seccion).getByText(etiqueta)
  const tarjeta = rotulo.parentElement
  if (!tarjeta) {
    throw new Error(`la métrica «${etiqueta}» no tiene contenedor`)
  }
  // ModuleMetric: [rótulo, valor, sub] — el valor es el segundo hijo.
  const valor = tarjeta.children[1]
  return valor?.textContent ?? ""
}

beforeEach(() => {
  estadoTitularidad.titularidad = null
  estadoTitularidad.isLoading = false
  estadoTitularidad.error = null
})

afterEach(() => {
  cleanup()
})

describe("tarjeta de titularidad en /admin/metricas", () => {
  it("muestra el conteo, el desglose por las dos causas y la lista por número", () => {
    estadoTitularidad.titularidad = {
      sinTitular: 3,
      nuncaDeclarado: 2,
      vinculoCerradoSinReemplazo: 1,
      unidades: [
        { numero: "101", causa: "nunca_declarado" },
        { numero: "L-02", causa: "nunca_declarado" },
        { numero: "E-045", causa: "vinculo_cerrado_sin_reemplazo" },
      ],
    }
    render(<MetricasPage />)
    const seccion = seccionTitularidad()

    expect(valorDeMetrica(seccion, ETIQUETA_CONTEO)).toBe("3")

    const nunca = within(seccion).getByText("Nunca declarado:")
    const cerrado = within(seccion).getByText("Vínculo cerrado sin reemplazo:")
    expect(nunca.parentElement?.textContent).toContain("2")
    expect(cerrado.parentElement?.textContent).toContain("1")

    // La lista corta: número de unidad y su causa, sin datos de persona.
    expect(within(seccion).getByText("101")).toBeTruthy()
    expect(within(seccion).getByText("L-02")).toBeTruthy()
    expect(within(seccion).getByText("E-045")).toBeTruthy()
    // Dos filas nunca declaradas y una con vínculo cerrado (los badges llevan
    // dos puntos, las filas no: por eso el conteo exacto no los cruza).
    expect(within(seccion).getAllByText("Nunca declarado")).toHaveLength(2)
    expect(
      within(seccion).getAllByText("Vínculo cerrado sin reemplazo")
    ).toHaveLength(1)
  })

  it("muestra el error de la API tal cual y NO un cero que diría que todo está bien", () => {
    estadoTitularidad.error = new Error("Permiso denegado.")
    render(<MetricasPage />)
    const seccion = seccionTitularidad()

    expect(within(seccion).getByText("Permiso denegado.")).toBeTruthy()
    // Sin error no hay métricas: el cero que engaña no existe en la sección.
    expect(within(seccion).queryByText(ETIQUETA_CONTEO)).toBeNull()
    expect(within(seccion).queryByText("0")).toBeNull()
  })

  it("con cero unidades sin dueño lo dice con palabras: ese es el estado bueno", () => {
    estadoTitularidad.titularidad = {
      sinTitular: 0,
      nuncaDeclarado: 0,
      vinculoCerradoSinReemplazo: 0,
      unidades: [],
    }
    render(<MetricasPage />)
    const seccion = seccionTitularidad()

    expect(valorDeMetrica(seccion, ETIQUETA_CONTEO)).toBe("0")
    expect(within(seccion).getByText(ESTADO_BUENO)).toBeTruthy()
  })

  it("dos unidades pueden compartir número: cada fila sobrevive con SU causa (sin claves duplicadas)", () => {
    // No unique en [comunidadId, numero] (C3b/D5): números repetibles entre
    // micro-sectores. Una clave por número haría que React vea dos hijos con la
    // misma clave y concilie mal la lista.
    estadoTitularidad.titularidad = {
      sinTitular: 2,
      nuncaDeclarado: 1,
      vinculoCerradoSinReemplazo: 1,
      unidades: [
        { numero: "101", causa: "nunca_declarado" },
        { numero: "101", causa: "vinculo_cerrado_sin_reemplazo" },
      ],
    }
    const errores: unknown[] = []
    const espia = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        errores.push(args)
      })
    try {
      render(<MetricasPage />)
      const seccion = seccionTitularidad()

      // Las dos filas existen aunque compartan número, cada una con SU causa.
      expect(within(seccion).getAllByText("101")).toHaveLength(2)
      expect(within(seccion).getAllByText("Nunca declarado")).toHaveLength(1)
      expect(
        within(seccion).getAllByText("Vínculo cerrado sin reemplazo")
      ).toHaveLength(1)

      // Y React no avisa claves duplicadas durante el render.
      const textoErrores = errores
        .map((e) => (Array.isArray(e) ? e.map(String).join(" ") : String(e)))
        .join("\n")
      expect(textoErrores).not.toMatch(/same key|duplicate key/i)
    } finally {
      espia.mockRestore()
    }
  })

  it("con más unidades sin dueño que las que trae la lista, declara cuántas muestra de cuántas son", () => {
    // La API corta la lista en 50 y declara el total aparte: la nota debe decir
    // ambos números (el mostrado y el real), nunca sólo el recorte.
    estadoTitularidad.titularidad = {
      sinTitular: 52,
      nuncaDeclarado: 52,
      vinculoCerradoSinReemplazo: 0,
      unidades: Array.from({ length: 50 }, (_, i) => ({
        numero: `C-${String(i + 1).padStart(2, "0")}`,
        causa: "nunca_declarado" as const,
      })),
    }
    render(<MetricasPage />)
    const seccion = seccionTitularidad()

    // La métrica sigue declarando el TOTAL, no el recorte.
    expect(valorDeMetrica(seccion, ETIQUETA_CONTEO)).toBe("52")
    // La nota lleva los dos números: mostrados y totales.
    expect(
      within(seccion).getByText("Mostrando 50 de 52 unidades sin titular.")
    ).toBeTruthy()
  })
})
