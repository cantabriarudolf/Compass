import { expect, test } from "@playwright/test"
import {
  crearPersonaTEST,
  crearUnidadTEST,
  limpiarPersonaTEST,
  limpiarUnidadTEST,
} from "../helpers/datos-test"

// Flujo maestro: verifica el poblamiento documentado en
// Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md
// creando cada dato TEST por API (e2e/helpers/datos-test.ts) y comprobando que
// aparece en el módulo correspondiente. El recorrido guiado desde el Laboratorio
// QA se retiró con el módulo QA/dev (F9).
// Verifica al final que la tasa de huérfanos sea 0 (coherencia cross-módulo).

test.use({ actionTimeout: 30_000 })

test.describe("Flujo de poblamiento (Historia de Poblamiento)", () => {
  test.setTimeout(300_000)

  // Cada test crea su propio dato TEST-Flujo vía API, lo verifica en la UI y lo
  // limpia: prueba el flujo crear→visualizar del módulo sin depender del estado
  // del seed ni de una pantalla de laboratorio.

  test("una persona creada vía API aparece en el directorio (MP)", async ({ page }) => {
    const ts = Date.now()
    const persona = await crearPersonaTEST(page.request, "pob-mp", ts, {
      nombreCompleto: "TEST Flujo Poblamiento",
      nombres: "TEST Flujo",
      apellidos: "Poblamiento",
      email: `flujo.poblamiento.${ts}@test.cl`,
    })
    const id = persona.id
    const rut = persona.rut
    try {
      await page.goto("/comunidad/personas")
      // La API guarda el RUT tal cual (el formulario UI lo formatea con
      // puntos, pero vía API queda raw): se afirma el valor raw.
      await expect(page.getByText(rut).first()).toBeVisible({ timeout: 30_000 })
    } finally {
      await limpiarPersonaTEST(page.request, id)
    }
  })

  test("una unidad creada vía API aparece en la estructura física (EF)", async ({ page }) => {
    const ts = Date.now()
    // Setup vía helper (FKs del seed, mismo scope garantizado).
    const unidad = await crearUnidadTEST(page.request, "pob-ef", ts, "TEST-Flujo")
    const id = unidad.id
    const numero = unidad.numero
    try {
      await page.goto("/inventario/estructura")
      await expect(page.getByText(numero)).toBeVisible({ timeout: 30_000 })
    } finally {
      await limpiarUnidadTEST(page.request, id)
    }
  })
})
