/* eslint-disable @typescript-eslint/no-explicit-any -- fixture localStorage compass-store (estado completo, no tipado para tests) */
import { expect, test } from "@playwright/test"

// P1 C2 — Guard QA Lab pasa de bloquear a confirmación "Limpiar y poblar de una vez"
// + e2e de idempotencia. Replica patrón de clicks quirúrgicos de SERIE-CRUD-E2E
// (evaluate fallback, force/noWaitAfter) y timeouts generosos de poblamiento.spec.ts.

test.use({ actionTimeout: 30_000 })

async function clickPoblar(page: import("@playwright/test").Page) {
  const btn = page.getByRole("button", { name: /Poblar todo de una vez/ })
  await expect(btn).toBeVisible({ timeout: 15_000 })
  await btn.evaluate((b: HTMLElement) => b.click()).catch(async () => {
    await btn.click({ force: true, noWaitAfter: true }).catch(() => {})
  })
}

async function clickBorrar(page: import("@playwright/test").Page) {
  const btn = page.getByRole("button", { name: /Borrar todo lo de prueba/ })
  await expect(btn).toBeVisible({ timeout: 15_000 })
  await btn.evaluate((b: HTMLElement) => b.click()).catch(async () => {
    await btn.click({ force: true, noWaitAfter: true }).catch(() => {})
  })
}

test.describe("CRUD — QA Lab poblado idempotente (P1 C2)", () => {
  test.setTimeout(300_000)

  test("poblado idempotente: segunda corrida via dialog confirmar → limpiar+poblar con 22/22 🟢", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/admin/qa-lab")
    await expect(page.getByRole("heading", { name: /Laboratorio QA/ })).toBeVisible({ timeout: 15_000 })

    // 0) Estado limpio determinista
    await clickBorrar(page)
    await expect(page.getByText(/TEST-\* limpio correctamente/)).toBeVisible({ timeout: 30_000 })

    // 1) Primera corrida completa
    await clickPoblar(page)
    await expect(page.getByText("🟢 Listo").first()).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/Carga completa OK/)).toBeVisible({ timeout: 30_000 })
    const tarjetas = page.locator('[id^="mod-"]')
    await expect(tarjetas).toHaveCount(22, { timeout: 30_000 } as any)
    await expect(tarjetas.getByText("🟢 Listo")).toHaveCount(22, { timeout: 10_000 } as any)
    await expect(page.getByText("🔴 Con error")).toHaveCount(0, { timeout: 5_000 } as any)

    // 2) Segunda corrida SIN limpiar → debe abrir Dialog de confirmación
    await clickPoblar(page)
    // El dialog muestra "Existen datos TEST-*" en título y "¿Limpiar y poblar de una vez?"
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/Existen datos TEST-\*/).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/¿Limpiar y poblar de una vez\?/)).toBeVisible({ timeout: 10_000 })
    const btnConfirmar = page.getByRole("button", { name: /Limpiar y poblar/ })
    await expect(btnConfirmar).toBeVisible({ timeout: 10_000 })

    // 3) Confirmar → ejecuta limpiar() + runFase("todo") (segunda corrida completa, 35-60s)
    await btnConfirmar.evaluate((b: HTMLElement) => b.click()).catch(async () => {
      await btnConfirmar.click({ force: true, noWaitAfter: true }).catch(() => {})
    })

    // La secuencia incluye el mensaje de limpieza y luego la carga completa.
    // Debido a que runFase hace setMsg(null) al iniciar, el mensaje intermedio
    // puede ser breve; esperamos directamente la carga final con timeout generoso.
    await expect(page.getByText(/Carga completa OK/)).toBeVisible({ timeout: 120_000 })

    // 4) Afirmar via UI del lab que las 22 tarjetas están 🟢 y 0 🔴
    await expect(page.locator('[id^="mod-"]')).toHaveCount(22, { timeout: 30_000 } as any)
    await expect(page.locator('[id^="mod-"]').getByText("🟢 Listo")).toHaveCount(22, { timeout: 10_000 } as any)
    await expect(page.getByText("🔴 Con error")).toHaveCount(0, { timeout: 5_000 } as any)

    // Limpieza para no contaminar siguiente test
    await clickBorrar(page)
    await expect(page.getByText(/TEST-\* limpio correctamente/)).toBeVisible({ timeout: 30_000 })

    expect(errores, "Excepciones no capturadas en poblado idempotente confirmar").toEqual([])
  })

  test("cancelar en el dialog no muta nada (sigue 22/22 🟢)", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/admin/qa-lab")
    await expect(page.getByRole("heading", { name: /Laboratorio QA/ })).toBeVisible({ timeout: 15_000 })

    await clickBorrar(page)
    await expect(page.getByText(/TEST-\* limpio correctamente/)).toBeVisible({ timeout: 30_000 })

    await clickPoblar(page)
    await expect(page.getByText("🟢 Listo").first()).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/Carga completa OK/)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[id^="mod-"]')).toHaveCount(22, { timeout: 30_000 } as any)
    await expect(page.locator('[id^="mod-"]').getByText("🟢 Listo")).toHaveCount(22)

    // Segunda corrida → dialog
    await clickPoblar(page)
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/¿Limpiar y poblar de una vez\?/)).toBeVisible({ timeout: 10_000 })

    const btnCancelar = page.getByRole("button", { name: /^Cancelar$/ })
    await expect(btnCancelar).toBeVisible({ timeout: 10_000 })
    await btnCancelar.evaluate((b: HTMLElement) => b.click()).catch(async () => {
      await btnCancelar.click({ force: true, noWaitAfter: true }).catch(() => {})
    })

    // Dialog cerrado
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 })

    // No cambió nada: siguen 22 tarjetas 🟢 y 0 🔴, y no apareció error nuevo
    await expect(page.locator('[id^="mod-"]')).toHaveCount(22, { timeout: 10_000 } as any)
    await expect(page.locator('[id^="mod-"]').getByText("🟢 Listo")).toHaveCount(22)
    await expect(page.getByText("🔴 Con error")).toHaveCount(0)
    // El mensaje anterior de Carga completa OK debe seguir visible (no se reseteó)
    await expect(page.getByText(/Carga completa OK/)).toBeVisible({ timeout: 10_000 })

    await clickBorrar(page)
    await expect(page.getByText(/TEST-\* limpio correctamente/)).toBeVisible({ timeout: 30_000 })

    expect(errores, "Excepciones no capturadas en poblado idempotente cancelar").toEqual([])
  })
})
