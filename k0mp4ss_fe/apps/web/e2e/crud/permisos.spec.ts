import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

test.describe("Permisos y Roles (RP) — vista read-only en /admin/permisos", () => {
  test("matriz por rol + membresías de la comunidad scoping, sin mutaciones", async ({
    page,
  }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    // 0) Precondición: seed authz si la BD no tiene membresías (auto-suficiente,
    //    usa el seed liviano de usuarios TEST del QA Lab — NO "Poblar todo").
    await page.goto("/admin/permisos")
    const sinMembresias = page.getByText("Tu usuario no tiene membresías registradas")
    if (await sinMembresias.isVisible().catch(() => false)) {
      await page.goto("/admin/qa-lab")
      const botonSeed = page.getByRole("button", { name: /Crear usuarios TEST/ })
      await botonSeed.waitFor({ state: "visible", timeout: 30_000 })
      await botonSeed.click({ force: true, noWaitAfter: true })
      await expect(page.getByText(/Seed AU B3 OK/)).toBeVisible({ timeout: 60_000 })
      await page.goto("/admin/permisos")
    }

    // 1) Header read-only
    await expect(page.getByRole("heading", { name: "Permisos y Roles" })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText("solo lectura", { exact: true })).toBeVisible()

    // 2) Matriz por rol: wildcard del administrador + recursos de otros roles
    await expect(page.getByText("Administrador Maestro")).toBeVisible()
    await expect(page.getByText("wildcard", { exact: true })).toBeVisible()
    await expect(page.getByText("Miembro del Comité")).toBeVisible()
    await expect(page.getByText("Conserjería / Seguridad")).toBeVisible()
    await expect(page.getByText("Propietario / Residente")).toBeVisible()
    await expect(page.getByText("Personal de Mantención")).toBeVisible()
    await expect(page.getByText("sin acciones (bloqueado)").first()).toBeVisible()
    await expect(page.getByText("ct:propio").first()).toBeVisible()

    // 3) Selector de comunidad: membresías propias del admin (comunidades TEST A y B)
    const selector = page.getByRole("combobox", { name: "Elegir comunidad" })
    await selector.click({ force: true, noWaitAfter: true })
    await page.getByRole("option", { name: /Los Aromos/ }).click()

    // 4) Tabla de membresías scoping por comunidad A (seed: 5 roles)
    await expect(page.getByText(/5 membresía\(s\)/)).toBeVisible({ timeout: 30_000 })
    for (const email of [
      "admin@test.cl",
      "comite@test.cl",
      "conserjeria@test.cl",
      "residente@test.cl",
      "mantencion@test.cl",
    ]) {
      await expect(page.getByRole("cell").filter({ hasText: email })).toBeVisible()
    }
    await expect(page.getByText("activo").first()).toBeVisible()

    // 5) Scoping: cambiar a comunidad B (solo admin)
    await selector.click({ force: true, noWaitAfter: true })
    await page.getByRole("option", { name: /Las Palmas/ }).click()
    await expect(page.getByText(/1 membresía\(s\)/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("cell").filter({ hasText: "comite@test.cl" })).toHaveCount(0)

    // 6) Solo lectura: sin acciones de mutación en toda la página
    await expect(page.getByRole("button", { name: /eliminar|editar|borrar|asignar|crear/i })).toHaveCount(0)

    expect(errores).toEqual([])
  })
})
