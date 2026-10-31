// P2 — rp-pruebas-roles: accesos por rol con storageState + denegaciones API
// Fuente matriz ampliada: ver design.md mapping antes/después.
// Usa test.use({ storageState }) por archivo; no 5 proyectos en config.
import { expect, test } from "@playwright/test"

const GRUPOS = ["Inicio","Operaciones","Finanzas","Comunidad","Inventario","Personas","Sistema"] as const

type Matriz = Record<string, { visibles: string[]; ocultos: string[] }>

// Matriz ampliada tras fix hallazgo P2 (ver design.md):
// Inicio: [admin,conserjeria,residente,comite,mantencion] (todos)
// Operaciones: [admin,conserjeria,residente,mantencion]
// Finanzas: [admin,residente,comite] (Remuneraciones: [admin] granular)
// Comunidad: [admin,residente,comite]
// Inventario: [admin,mantencion] (Estructura/Tipos solo admin; Recursos/Mantenimiento admin+mantencion)
// Personas: [admin]
// Sistema: [admin,comite] (Reportería: [admin,comite]; resto admin)
const MATRIZ: Matriz = {
  "comite@test.cl": {
    visibles: ["Inicio","Finanzas","Comunidad","Sistema"],
    ocultos: ["Operaciones","Inventario","Personas"],
  },
  "conserjeria@test.cl": {
    visibles: ["Inicio","Operaciones"],
    ocultos: ["Finanzas","Comunidad","Inventario","Personas","Sistema"],
  },
  "residente@test.cl": {
    visibles: ["Inicio","Operaciones","Finanzas","Comunidad"],
    ocultos: ["Inventario","Personas","Sistema"],
  },
  "arrendatario@test.cl": {
    visibles: ["Inicio","Operaciones","Finanzas","Comunidad"],
    ocultos: ["Inventario","Personas","Sistema"],
  },
  "mantencion@test.cl": {
    visibles: ["Inicio","Operaciones","Inventario"],
    ocultos: ["Finanzas","Comunidad","Personas","Sistema"],
  },
}

// Helper: navegar estable a /admin/gestion con sidebar hidratado
async function gotoEstable(page: import("@playwright/test").Page) {
  await page.goto("/admin/gestion")
  await expect(page).toHaveURL(/\/admin\/gestion/, { timeout: 30_000 })
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(()=>{})
  await page.waitForTimeout(1200)
}

// --- COMITE via storageState ---
test.describe("comite@test.cl — matriz + 403 admin:usuarios", () => {
  test.use({ storageState: "e2e/.auth/comite.json" })
  test("menu visible/oculto + fetch 403 admin:usuarios", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", e=>errores.push(e.message))
    await gotoEstable(page)
    const { visibles, ocultos } = MATRIZ["comite@test.cl"]!
    for (const g of visibles) await expect(page.getByText(g,{exact:true}).first()).toBeVisible({timeout:10_000})
    for (const g of ocultos) await expect(page.getByText(g,{exact:true})).toBeHidden({timeout:10_000})
    // Granular: Remuneraciones oculto para comite
    await page.getByRole("button",{name:"Finanzas"}).click().catch(()=>{})
    await page.waitForTimeout(600)
    await expect(page.getByText("Remuneraciones",{exact:true})).toBeHidden({timeout:10_000})
    // Granular Sistema: Reportería visible, Gestión oculta — Sistema está expandido por defecto en /admin/gestion (active), no click necesario
    await page.waitForTimeout(500)
    await expect(page.getByRole("link",{name:/Reportería/})).toHaveCount(1, { timeout: 10_000 })
    // Gestión Administrativa debe estar ausente del DOM para comite (filtrado por roles)
    await expect(page.locator('a[href="/admin/gestion"]')).toHaveCount(0)
    // Denegación server-side real
    const status = await page.evaluate(async () => {
      const r = await fetch("/api/admin/usuarios?comunidadId=comunidad-a")
      return r.status
    })
    expect(status).toBe(403)
    expect(errores).toEqual([])
  })
})

test.describe("conserjeria@test.cl — matriz + 403", () => {
  test.use({ storageState: "e2e/.auth/conserjeria.json" })
  test("menu + 403 admin:usuarios", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", e=>errores.push(e.message))
    await gotoEstable(page)
    const { visibles, ocultos } = MATRIZ["conserjeria@test.cl"]!
    for (const g of visibles) await expect(page.getByText(g,{exact:true}).first()).toBeVisible({timeout:10_000})
    for (const g of ocultos) await expect(page.getByText(g,{exact:true})).toBeHidden({timeout:10_000})
    const status = await page.evaluate(async () => {
      const r = await fetch("/api/admin/usuarios?comunidadId=comunidad-a")
      return r.status
    })
    expect(status).toBe(403)
    expect(errores).toEqual([])
  })
})

test.describe("residente@test.cl — matriz + 403", () => {
  test.use({ storageState: "e2e/.auth/residente.json" })
  test("menu + 403 admin:usuarios + Gastos Comunes visible", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", e=>errores.push(e.message))
    await gotoEstable(page)
    const { visibles, ocultos } = MATRIZ["residente@test.cl"]!
    for (const g of visibles) await expect(page.getByText(g,{exact:true}).first()).toBeVisible({timeout:10_000})
    for (const g of ocultos) await expect(page.getByText(g,{exact:true})).toBeHidden({timeout:10_000})
    // Gastos Comunes hereda Finanzas visible
    await page.getByRole("button",{name:"Finanzas"}).click().catch(()=>{})
    await page.waitForTimeout(600)
    await expect(page.getByText("Gastos Comunes",{exact:true})).toBeVisible({timeout:10_000})
    await expect(page.getByText("Remuneraciones",{exact:true})).toBeHidden({timeout:10_000})
    const status = await page.evaluate(async () => {
      const r = await fetch("/api/admin/usuarios?comunidadId=comunidad-a")
      return r.status
    })
    expect(status).toBe(403)
    expect(errores).toEqual([])
  })
})

test.describe("mantencion@test.cl — matriz + 403 + granular Inventario", () => {
  test.use({ storageState: "e2e/.auth/mantencion.json" })
  test("menu + granular Inventario + 403", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", e=>errores.push(e.message))
    await gotoEstable(page)
    const { visibles, ocultos } = MATRIZ["mantencion@test.cl"]!
    for (const g of visibles) await expect(page.getByText(g,{exact:true}).first()).toBeVisible({timeout:10_000})
    for (const g of ocultos) await expect(page.getByText(g,{exact:true})).toBeHidden({timeout:10_000})
    // Inventario granular: Mantenimiento visible, Tipos oculto
    await page.getByRole("button",{name:"Inventario"}).click().catch(()=>{})
    await page.waitForTimeout(600)
    await expect(page.getByText("Mantenimiento",{exact:true})).toBeVisible({timeout:10_000})
    await expect(page.getByText("Recursos y EPP",{exact:true})).toBeVisible({timeout:10_000})
    await expect(page.getByText("Tipos de Unidad",{exact:true})).toBeHidden({timeout:10_000})
    const status = await page.evaluate(async () => {
      const r = await fetch("/api/admin/usuarios?comunidadId=comunidad-a")
      return r.status
    })
    expect(status).toBe(403)
    expect(errores).toEqual([])
  })
})

test.describe("arrendatario@test.cl — matriz + 403", () => {
  test.use({ storageState: "e2e/.auth/arrendatario.json" })
  test("menu + 403 admin:usuarios + Gastos Comunes visible", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", e=>errores.push(e.message))
    await gotoEstable(page)
    const { visibles, ocultos } = MATRIZ["arrendatario@test.cl"]!
    for (const g of visibles) await expect(page.getByText(g,{exact:true}).first()).toBeVisible({timeout:10_000})
    for (const g of ocultos) await expect(page.getByText(g,{exact:true})).toBeHidden({timeout:10_000})
    // Gastos Comunes hereda Finanzas visible (igual que residente: login rol residente)
    await page.getByRole("button",{name:"Finanzas"}).click().catch(()=>{})
    await page.waitForTimeout(600)
    await expect(page.getByText("Gastos Comunes",{exact:true})).toBeVisible({timeout:10_000})
    await expect(page.getByText("Remuneraciones",{exact:true})).toBeHidden({timeout:10_000})
    const status = await page.evaluate(async () => {
      const r = await fetch("/api/admin/usuarios?comunidadId=comunidad-a")
      return r.status
    })
    expect(status).toBe(403)
    expect(errores).toEqual([])
  })
})

test.describe("admin@test.cl — control 200 admin:usuarios", () => {
  test.use({ storageState: "e2e/.auth/admin.json" })
  test("admin ve 8/8 y 200 en admin:usuarios", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", e=>errores.push(e.message))
    await gotoEstable(page)
    for (const g of GRUPOS) await expect(page.getByText(g,{exact:true}).first()).toBeVisible({timeout:10_000})
    await page.getByRole("button",{name:"Finanzas"}).click().catch(()=>{})
    await page.waitForTimeout(600)
    await expect(page.getByText("Remuneraciones",{exact:true})).toBeVisible({timeout:10_000})
    const status = await page.evaluate(async () => {
      const r = await fetch("/api/admin/usuarios?comunidadId=comunidad-a")
      return r.status
    })
    expect(status).toBe(200)
    expect(errores).toEqual([])
  })
})
