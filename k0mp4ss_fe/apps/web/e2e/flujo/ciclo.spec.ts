/* eslint-disable @typescript-eslint/no-explicit-any -- fixture localStorage compass-store (estado completo, no tipado para tests) */
import { expect, test } from "@playwright/test"

// Serie QA-LAB P3 — cierre integral: ciclo limpiar→poblar→validar→limpiar
// y guard clean-first (segunda corrida bloqueada). Cada test parte con
// localStorage vacío (Playwright context fresco) y prepara su propio estado.
// Patrón quirúrgico: click "Poblar todo de una vez" con evaluate fallback,
// timeouts generosos, test.setTimeout generoso (turbopack cold-start).

test.use({ actionTimeout: 30_000 })

async function clickBorrar(page: import("@playwright/test").Page) {
  const btn = page.getByRole("button", { name: /Borrar todo lo de prueba/ })
  await expect(btn).toBeVisible({ timeout: 15_000 })
  await btn.evaluate((b: HTMLElement) => b.click()).catch(async () => {
    await btn.click({ force: true, noWaitAfter: true }).catch(() => {})
  })
}

async function clickPoblar(page: import("@playwright/test").Page) {
  const btn = page.getByRole("button", { name: /Poblar todo de una vez/ })
  await expect(btn).toBeVisible({ timeout: 15_000 })
  const dialogo = page.getByRole("dialog")
  const clic = () =>
    btn.evaluate((b: HTMLElement) => b.click()).catch(async () => {
      await btn.click({ force: true, noWaitAfter: true }).catch(() => {})
    })
  // Estado del Lab leído del DOM: el aviso previo solo se va al COMPLETAR,
  // así que NO sirve como señal de arranque. Señales de efecto: diálogo del
  // guard, botón deshabilitado (loading), insignia de carga o de listo.
  const conEfecto = () =>
    dialogo.isVisible().catch(() => false).then(async (hayDialogo) => {
      if (hayDialogo) return true
      if (await btn.isDisabled().catch(() => false)) return true
      const txt = await page.evaluate(() => document.body.innerText).catch(() => "")
      return txt.includes("Cargando") || txt.includes("🟢 Listo")
    })
  // Un solo click efectivo: los re-clicks durante un poblar en curso
  // re-disparan runFase y abren el diálogo del guard (fondo inerte),
  // bloqueando los pasos siguientes. Solo se re-clickEA si NADA cambió
  // (click caído pre-hidratación).
  for (let i = 0; i < 3; i++) {
    await clic()
    let efecto = false
    for (let j = 0; j < 16; j++) {
      await page.waitForTimeout(500)
      if (await conEfecto()) { efecto = true; break }
    }
    if (efecto) break
  }
  // Si el guard abrió el diálogo (restos de una corrida caída), usar su
  // acción idempotente en vez de dejarlo abierto bloqueando el fondo.
  if (await dialogo.isVisible().catch(() => false)) {
    const btnLimpiarPoblar = page.getByRole("button", { name: /Limpiar y poblar/ })
    if (await btnLimpiarPoblar.isVisible().catch(() => false)) {
      await btnLimpiarPoblar.click({ force: true, noWaitAfter: true }).catch(() => {})
    }
  }
}

async function clickRevisar(page: import("@playwright/test").Page) {
  const btn = page.getByRole("button", { name: /Revisar que nada quedó suelto/ })
  await expect(btn).toBeVisible({ timeout: 15_000 })
  await btn.evaluate((b: HTMLElement) => b.click()).catch(async () => {
    await btn.click({ force: true, noWaitAfter: true }).catch(() => {})
  })
}

test.describe("QA Lab — ciclo completo y guard clean-first (Serie QA-LAB P3)", () => {
  test.setTimeout(300_000)

  test("ciclo feliz: limpiar→poblar→validar con 22/22 fases OK y huérfanos 0", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/admin/qa-lab")
    await expect(page.getByRole("heading", { name: /Laboratorio QA/ })).toBeVisible({ timeout: 15_000 })

    // 1) Limpiar residuo previo
    await clickBorrar(page)
    // 120s (no 30s): tolerancia a la purga BD secuencial (~22 DELETEs) y al cold-compile del dev server, igual que poblado-idempotente.spec.ts.
    await expect(page.getByText(/TEST-\* limpio correctamente/)).toBeVisible({ timeout: 120_000 })

    // 2) Poblar todo
    await clickPoblar(page)
    // El Lab marca cada fase con 🟢 Listo; Carga completa OK en toast/msg
    await expect(page.getByText("🟢 Listo").first()).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/Carga completa OK/)).toBeVisible({ timeout: 30_000 })

    // Verificar reporte completo: 22 tarjetas Listo, cero en error
    // Las tarjetas de reporte tienen id="mod-<id>"; el texto instruccional también contiene 🟢 Listo pero no está en esas tarjetas.
    const tarjetas = page.locator('[id^="mod-"]')
    await expect(tarjetas).toHaveCount(22, { timeout: 30_000 } as any)
    await expect(tarjetas.getByText("🟢 Listo")).toHaveCount(22, { timeout: 10_000 } as any)
    await expect(page.getByText("🔴 Con error")).toHaveCount(0, { timeout: 5_000 } as any)

    // 3) Validar coherencia cross-módulo
    await clickRevisar(page)
    await expect(page.getByText("Validación OK — tasa huérfanos 0, TEST-* coherente")).toBeVisible({ timeout: 30_000 })

    // 4) Limpieza final deja estado limpio para siguiente test del suite
    await clickBorrar(page)
    // 120s (no 30s): tolerancia a la purga BD secuencial (~22 DELETEs) y al cold-compile del dev server, igual que poblado-idempotente.spec.ts.
    await expect(page.getByText(/TEST-\* limpio correctamente/)).toBeVisible({ timeout: 120_000 })

    expect(errores, "Excepciones no capturadas en QA Lab ciclo feliz").toEqual([])
  })

  test("guard clean-first: segunda corrida sin limpiar queda BLOQUEADA", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/admin/qa-lab")
    await expect(page.getByRole("heading", { name: /Laboratorio QA/ })).toBeVisible({ timeout: 15_000 })

    // Precondición: store limpio
    await clickBorrar(page)
    // 120s (no 30s): tolerancia a la purga BD secuencial (~22 DELETEs) y al cold-compile del dev server, igual que poblado-idempotente.spec.ts.
    await expect(page.getByText(/TEST-\* limpio correctamente/)).toBeVisible({ timeout: 120_000 })

    // Primera corrida OK
    await clickPoblar(page)
    await expect(page.getByText("🟢 Listo").first()).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/Carga completa OK/)).toBeVisible({ timeout: 30_000 })
    // Capturar snapshot del contador antes del guard (scoped a tarjetas)
    const listasAntes = await page.locator('[id^="mod-"]').count()

    // Segunda corrida SIN limpiar → ahora abre Dialog de confirmación (idempotente P1 C2)
    // El guard ya no bloquea con error, sino que ofrece "Limpiar y poblar"
    await clickPoblar(page)
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/¿Limpiar y poblar de una vez\?/)).toBeVisible({ timeout: 10_000 })
    // Cancelar para no mutar — el estado no debe haber cambiado
    const btnCancelar = page.getByRole("button", { name: /^Cancelar$/ })
    await expect(btnCancelar).toBeVisible({ timeout: 10_000 })
    await btnCancelar.evaluate((b: HTMLElement) => b.click()).catch(async () => {
      await btnCancelar.click({ force: true, noWaitAfter: true }).catch(() => {})
    })
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 })

    // El estado no debe haber cambiado (mismas 22 tarjetas Listo, sin errores nuevos)
    await expect(page.locator('[id^="mod-"]')).toHaveCount(listasAntes, { timeout: 10_000 } as any)
    await expect(page.locator('[id^="mod-"]')).toHaveCount(22, { timeout: 5_000 } as any)
    await expect(page.locator('[id^="mod-"]').getByText("🟢 Listo")).toHaveCount(22)
    await expect(page.getByText("🔴 Con error")).toHaveCount(0)

    // Limpieza de cola estricta de nuevo (qlab-purga-bulk): la purga BD es
    // O(1) requests contra POST /api/qa-lab/purga-test; ver comentario de
    // poblado-idempotente.spec.ts.
    await clickBorrar(page)
    await expect(page.getByText(/TEST-\* limpio correctamente/)).toBeVisible({ timeout: 120_000 })

    expect(errores, "Excepciones no capturadas en guard clean-first").toEqual([])
  })

  test("limpieza conservadora: tras poblar, Borrar todo deja TEST-* limpio", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/admin/qa-lab")
    await expect(page.getByRole("heading", { name: /Laboratorio QA/ })).toBeVisible({ timeout: 15_000 })

    // Asegurar limpio, poblar
    await clickBorrar(page)
    // 120s (no 30s): tolerancia a la purga BD secuencial (~22 DELETEs) y al cold-compile del dev server, igual que poblado-idempotente.spec.ts.
    await expect(page.getByText(/TEST-\* limpio correctamente/)).toBeVisible({ timeout: 120_000 })
    await clickPoblar(page)
    await expect(page.getByText("🟢 Listo").first()).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/Carga completa OK/)).toBeVisible({ timeout: 30_000 })

    // Borrar todo
    await clickBorrar(page)
    // 120s (no 30s): tolerancia a la purga BD secuencial (~22 DELETEs) y al cold-compile del dev server, igual que poblado-idempotente.spec.ts.
    await expect(page.getByText(/TEST-\* limpio correctamente/)).toBeVisible({ timeout: 120_000 })

    // Validar que tras limpiar no quedan huérfanos (store sin TEST-* debe seguir coherente)
    await clickRevisar(page)
    await expect(page.getByText("Validación OK — tasa huérfanos 0, TEST-* coherente")).toBeVisible({ timeout: 30_000 })

    // El reporte debe haberse reseteado (sin tarjetas mod-* Listo; solo queda el texto instruccional con 🟢 Listo)
    await expect(page.locator('[id^="mod-"]')).toHaveCount(0, { timeout: 10_000 } as any)
    // El único 🟢 Listo visible debe ser el de la guía instruccional
    await expect(page.getByText("🟢 Listo")).toHaveCount(1)

    expect(errores, "Excepciones no capturadas en limpieza conservadora").toEqual([])
  })
})
