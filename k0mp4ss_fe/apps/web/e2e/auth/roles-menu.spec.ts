// P1 — rp-menu-sesion: matriz rol×grupos via sesion real (union de membresias)
// Login por FORM (fill email/password Test1234!) — storageStates llegan en P2.
// Verifica data real normalizada del sidebar (authz aliases).
import { expect, test } from "@playwright/test"

test.use({ storageState: { cookies: [], origins: [] } })

const PASSWORD_TEST = "Test1234!"

const GRUPOS = [
  "Inicio",
  "Operaciones",
  "Finanzas",
  "Comunidad",
  "Inventario",
  "Personas",
  "Desarrollo AI",
  "Sistema",
] as const

type Matriz = Record<string, { visibles: string[]; ocultos: string[] }>

// Matriz normalizada tras alias authz (ver design.md):
// - Inicio: ["administrador","conserjeria","residente"]
// - Operaciones: ["administrador","conserjeria","residente"]
// - Finanzas: ["administrador","residente"] (Remuneraciones: ["administrador"] granular)
// - Comunidad: ["administrador","residente"]
// - Inventario: ["administrador"]
// - Personas: ["administrador"]
// - Desarrollo AI: ["administrador"]
// - Sistema: ["administrador"]
const MATRIZ: Matriz = {
  "admin@test.cl": {
    visibles: [...GRUPOS],
    ocultos: [],
  },
  "conserjeria@test.cl": {
    visibles: ["Inicio", "Operaciones"],
    ocultos: [
      "Finanzas",
      "Comunidad",
      "Inventario",
      "Personas",
      "Desarrollo AI",
      "Sistema",
    ],
  },
  "residente@test.cl": {
    visibles: ["Inicio", "Operaciones", "Finanzas", "Comunidad"],
    ocultos: ["Inventario", "Personas", "Desarrollo AI", "Sistema"],
  },
}

async function loginAs(page: import("@playwright/test").Page, email: string) {
  await page.goto("/ingresar")
  await page.getByLabel("Correo electrónico").fill(email)
  await page.getByLabel("Contraseña").fill(PASSWORD_TEST)
  await page.getByRole("button", { name: "Ingresar" }).click()
  await expect(page).toHaveURL(/\/admin/, { timeout: 60_000 })
  // /admin redirige a /admin/gestion pero la navegacion client puede quedar en /admin:
  // forzar goto estable a /admin/gestion para sidebar consistente (ver debugClean2)
  await page.goto("/admin/gestion")
  await expect(page).toHaveURL(/\/admin\/gestion/, { timeout: 30_000 })
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {})
  // dar tiempo a hidratacion del sidebar (client)
  await page.waitForTimeout(1500)
  // capturar errores de consola
  const errores: string[] = []
  page.on("pageerror", (e) => errores.push(e.message))
  return errores
}

for (const [email, { visibles, ocultos }] of Object.entries(MATRIZ)) {
  test(`matriz rol×grupos — ${email} visibles [${visibles.join(", ")}] ocultos [${ocultos.join(", ")}]`, async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on("pageerror", (e) => pageErrors.push(e.message))

    await loginAs(page, email)

    // Sidebar groups — usar SidebarGroupLabel texto (scoping estricto)
    for (const grupo of visibles) {
      await expect(page.getByText(grupo, { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      })
    }
    for (const grupo of ocultos) {
      await expect(page.getByText(grupo, { exact: true })).toBeHidden({
        timeout: 10_000,
      })
    }

    // Item granular: Remuneraciones solo admin (dentro de Finanzas collapsible)
    if (email === "admin@test.cl") {
      // Expandir Finanzas para ver subitems (boton collapsible, no label)
      await page
        .getByRole("button", { name: "Finanzas" })
        .click()
        .catch(() => {})
      await page.waitForTimeout(800)
      await expect(
        page.getByText("Remuneraciones", { exact: true })
      ).toBeVisible({ timeout: 10_000 })
    } else {
      // Residente y conserjeria no deben ver Remuneraciones
      // Si Finanzas oculto para conserjeria, item tampoco; para residente, Finanzas visible pero item filtrado
      // Solo intentar expandir si Finanzas visible
      if (visibles.includes("Finanzas")) {
        await page
          .getByRole("button", { name: "Finanzas" })
          .click()
          .catch(() => {})
        await page.waitForTimeout(800)
      }
      await expect(
        page.getByText("Remuneraciones", { exact: true })
      ).toBeHidden({ timeout: 10_000 })
    }

    expect(pageErrors, `0 pageerror para ${email}`).toEqual([])
  })
}

test.describe("residente — item sin roles hereda visibilidad del grupo", () => {
  test("Gastos Comunes visible para residente (item sin roles, grupo Finanzas visible)", async ({
    page,
  }) => {
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))
    await loginAs(page, "residente@test.cl")
    await page
      .getByRole("button", { name: "Finanzas" })
      .click()
      .catch(() => {})
    await page.waitForTimeout(800)
    await expect(page.getByText("Gastos Comunes", { exact: true })).toBeVisible(
      { timeout: 10_000 }
    )
    await expect(page.getByText("Recaudación", { exact: true })).toBeVisible({
      timeout: 10_000,
    })
    expect(errors).toEqual([])
  })
})
