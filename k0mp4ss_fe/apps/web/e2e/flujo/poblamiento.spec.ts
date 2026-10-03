import { expect, test } from "@playwright/test"
import {
  crearPersonaTEST,
  crearUnidadTEST,
  limpiarPersonaTEST,
  limpiarUnidadTEST,
} from "../helpers/datos-test"

// Flujo maestro: recorre la "Historia de Poblamiento" documentada en
// Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md
// usando el Laboratorio QA (/admin/qa-lab), que automatiza todas las fases
// (MA/CF -> TU/MP -> EF -> VU -> PE/IR/CO -> FI/RA/MT -> CT/PL -> AM/RE).
// Verifica al final que la tasa de huérfanos sea 0 (coherencia cross-módulo).

test.use({ actionTimeout: 30_000 })

test.describe("Flujo de poblamiento (Historia de Poblamiento)", () => {
  test.setTimeout(300_000)

  test("puebla la comunidad de prueba y valida coherencia sin huérfanos", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/admin/qa-lab")

    // 0) Limpiar cualquier residuo de prueba previo para dejar estado determinista
    await page
      .getByRole("button", { name: /Borrar todo lo de prueba/ })
      .click({ force: true, noWaitAfter: true })
    await expect(page.getByText(/TEST-\* limpio correctamente/)).toBeVisible({ timeout: 30_000 })

    // 1) Poblar todo de una vez (todas las fases del relato).
    // force + noWaitAfter porque el poblamiento corre un loop pesado que
    // bloquea el hilo y hace que Playwright falle el chequeo de "settle" del click.
    await page
      .getByRole("button", { name: /Poblar todo de una vez/ })
      .click({ force: true, noWaitAfter: true, timeout: 90_000 })

    // El Laboratorio QA marca cada fase con 🟢 Listo al completarse la carga.
    const tarjetasListas = page.getByText("🟢 Listo")
    await expect(tarjetasListas.first()).toBeVisible({ timeout: 90_000 })
    expect(await tarjetasListas.count()).toBeGreaterThan(0)
    await expect(page.getByText(/Carga completa OK/)).toBeVisible({ timeout: 30_000 })

    // 2) Revisar que nada quedó suelto -> validación de FKs (tasa huérfanos = 0)
    await page
      .getByRole("button", { name: /Revisar que nada quedó suelto/ })
      .click({ force: true, noWaitAfter: true })
    await expect(
      page.getByText("Validación OK — tasa huérfanos 0, TEST-* coherente"),
    ).toBeVisible({ timeout: 30_000 })

    expect(errores, "Excepciones no capturadas en QA Lab").toEqual([])
  })

  // P3 E2E-FULL-VERDE: estos dos tests se independizaron del QA-Lab. El
  // "Poblar todo de una vez" escribe al store legacy mientras las páginas
  // migradas (/comunidad/personas, /inventario/estructura) leen BD vía API,
  // así que el relato nunca aparece en esos módulos (gap estructural → P4:
  // QA-Lab a BD o seed BD de fixtures). Cada test crea su propio dato
  // TEST-Flujo vía API, lo verifica en la UI y lo limpia: prueba el flujo
  // crear→visualizar del módulo sin depender del estado del seed/QA-Lab.

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
