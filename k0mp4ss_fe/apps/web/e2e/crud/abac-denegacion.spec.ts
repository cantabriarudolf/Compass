// P2 (SERIE-VALIDACION-PERFILES) — denegación ABAC `mp:propios` a nivel API.
// Residente pide colección ajena → filtrado a su ficha; detalle ajeno → 403;
// admin:usuarios → 403. Control admin → 200 en admin:usuarios y colección
// completa. Sin conteos frágiles (solo total===1 para el propio).
import { expect, test } from "@playwright/test"

test.describe("ABAC mp:propios — residente filtrado + 403 en lo ajeno", () => {
  test.use({ storageState: "e2e/.auth/residente.json" })

  test("colección filtrada a p-3, detalle ajeno 403, admin:usuarios 403", async ({
    page,
  }) => {
    const errores: string[] = []
    page.on("pageerror", (e) => errores.push(e.message))
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(500)

    // 1. Colección: filtrada a SU ficha (no ve las 54+ del seed).
    const coleccion = await page.evaluate(async () => {
      const r = await fetch("/api/personas?comunidadId=comunidad-a&pageSize=100")
      if (!r.ok) return { ok: false, status: r.status }
      const j = await r.json()
      return {
        ok: true,
        total: j.total,
        ids: (j.data ?? []).map((p: { id?: string }) => p.id),
      }
    })
    expect(coleccion.ok).toBe(true)
    expect(coleccion.total).toBe(1)
    expect(coleccion.ids).toEqual(["p-3"])

    // 2. Detalle ajeno (p-5, ficha del admin) → 403 por mp:propios.
    const detalleAjeno = await page.evaluate(async () => {
      const r = await fetch("/api/personas/p-5?comunidadId=comunidad-a")
      return r.status
    })
    expect(detalleAjeno).toBe(403)

    // 3. Detalle propio (p-3) → 200.
    const detallePropio = await page.evaluate(async () => {
      const r = await fetch("/api/personas/p-3?comunidadId=comunidad-a")
      if (!r.ok) return { ok: false, status: r.status }
      const j = await r.json()
      return { ok: true, id: j.id }
    })
    expect(detallePropio.ok).toBe(true)
    expect(detallePropio.id).toBe("p-3")

    // 4. Recurso admin (admin:usuarios) → 403.
    const adminRecurso = await page.evaluate(async () => {
      const r = await fetch("/api/admin/usuarios?comunidadId=comunidad-a")
      return r.status
    })
    expect(adminRecurso).toBe(403)

    expect(errores).toEqual([])
  })
})

test.describe("ABAC — control admin sin filtro mp:propios", () => {
  test.use({ storageState: "e2e/.auth/admin.json" })

  test("admin no recibe 403 en fichas ajenas y 200 en admin:usuarios", async ({
    page,
  }) => {
    const errores: string[] = []
    page.on("pageerror", (e) => errores.push(e.message))
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(500)

    // Colección MP responde 200 (sin filtro mp:propios para admin).
    const coleccion = await page.evaluate(async () => {
      const r = await fetch("/api/personas?comunidadId=comunidad-a&pageSize=5")
      if (!r.ok) return { ok: false, status: r.status }
      const j = await r.json()
      return { ok: true, total: j.total }
    })
    expect(coleccion.ok).toBe(true)
    // El scope del admin es decisión del servidor (última membresía):
    // total numérico sin filtrado por usuario (0 si cae en comunidad-b).
    expect(typeof coleccion.total).toBe("number")

    // Ficha ajena (p-3): admin nunca recibe 403 (200 en scope, 404 fuera).
    const fichaAjena = await page.evaluate(async () => {
      const r = await fetch("/api/personas/p-3?comunidadId=comunidad-a")
      return r.status
    })
    expect([200, 404]).toContain(fichaAjena)

    const adminRecurso = await page.evaluate(async () => {
      const r = await fetch("/api/admin/usuarios?comunidadId=comunidad-a")
      return r.status
    })
    expect(adminRecurso).toBe(200)

    expect(errores).toEqual([])
  })
})
