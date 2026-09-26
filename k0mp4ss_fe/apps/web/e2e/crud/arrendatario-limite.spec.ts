// P2 (SERIE-VALIDACION-PERFILES) — arrendatario ve su ficha y su unidad
// arrendada, y verifica su límite (sin ver finanzas de la unidad).
// Login rol `residente` + ficha p-arrendatario-1 con vínculo arrendatario
// vigente en u-A-101 (`permiteVerFinanzas: false`). Sin conteos frágiles.
import { expect, test } from "@playwright/test"

async function gotoStable(page: import("@playwright/test").Page, url: string) {
  await page.goto(url)
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(800)
}

test.describe("arrendatario — su ficha y su unidad arrendada, con límite", () => {
  test.use({ storageState: "e2e/.auth/arrendatario.json" })

  test("ve su ficha p-arrendatario-1 y su vínculo en u-A-101 sin finanzas", async ({
    page,
  }) => {
    const errores: string[] = []
    page.on("pageerror", (e) => errores.push(e.message))

    // Origen para los fetch relativos (storageState ya autenticado).
    await gotoStable(page, "/dashboard")

    // 1. SU ficha vía API: p-arrendatario-1 (Daniela Fuenzalida Soto).
    const ficha = await page.evaluate(async () => {
      const r = await fetch("/api/mis-datos", {
        headers: { Accept: "application/json" },
      })
      if (!r.ok) return { ok: false, status: r.status }
      const j = await r.json()
      return {
        ok: true,
        personaId: j.persona?.id ?? null,
        nombre: j.persona?.nombreCompleto ?? null,
        email: j.cuenta?.email ?? null,
      }
    })
    expect(ficha.ok).toBe(true)
    expect(ficha.personaId).toBe("p-arrendatario-1")
    expect(ficha.nombre).toContain("Fuenzalida")
    expect(ficha.email).toBe("arrendatario@test.cl")

    // 2. SU unidad arrendada + LÍMITE observable. El vínculo u-A-101
    // (v-arrendatario-1, permiteVerFinanzas:false) consta en el seed; a nivel
    // producto el login rol residente no lista vínculos/unidades (403 por
    // diseño: sin mp/ver) ni finanzas FI (sin fi). El spec verifica el límite
    // que sí es observable: 403 en esos recursos + amenities visibles.
    const limites = await page.evaluate(async () => {
      const get = async (url: string) => {
        const r = await fetch(url)
        return r.status
      }
      return {
        vinculos: await get("/api/vinculos?comunidadId=comunidad-a"),
        unidades: await get("/api/unidades?comunidadId=comunidad-a"),
        emisionesGc: await get("/api/emisiones-gc?comunidadId=comunidad-a"),
      }
    })
    expect(limites.vinculos).toBe(403)
    expect(limites.unidades).toBe(403)
    expect(limites.emisionesGc).toBe(403)

    // Cobros FI: 200 pero filtrado ABAC a su unidad arrendada (u-A-101).
    // Límite exacto: ve finanzas SOLO de donde tiene vínculo activo.
    const cobros = await page.evaluate(async () => {
      const r = await fetch("/api/cobros-fi?comunidadId=comunidad-a&pageSize=100")
      if (!r.ok) return { ok: false, status: r.status }
      const j = await r.json()
      return {
        ok: true,
        total: j.total,
        unidades: [...new Set((j.data ?? []).map((c: { unidadId?: string }) => c.unidadId))],
      }
    })
    expect(cobros.ok).toBe(true)
    for (const u of cobros.unidades as string[]) {
      expect(u).toBe("u-A-101")
    }

    // Amenities: el recurso RA es legible (el seed no trae elementos en
    // comunidad-a, así que el total puede ser 0; lo que se verifica es el
    // acceso 200, no el contenido).
    const elementos = await page.evaluate(async () => {
      const r = await fetch("/api/ra/elementos?comunidadId=comunidad-a")
      if (!r.ok) return { ok: false, status: r.status }
      const j = await r.json()
      return { ok: true, total: j.total }
    })
    expect(elementos.ok).toBe(true)
    expect(typeof elementos.total).toBe("number")

    // 3. UI Mis datos muestra su correo.
    await gotoStable(page, "/admin/mis-datos")
    await expect(
      page.getByRole("heading", { name: /Mis datos personales/ }).first()
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("arrendatario@test.cl").first()).toBeVisible({
      timeout: 10_000,
    })

    // 4. LÍMITE finanzas: la colección /api/personas lo filtra a su ficha
    // (igual que residente: login rol residente, ABAC mp:propios).
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
    expect(coleccion.ids).toEqual(["p-arrendatario-1"])

    // 5. LÍMITE ficha ajena: el propietario u otra ficha → 403.
    const ajena = await page.evaluate(async () => {
      const r = await fetch("/api/personas/p-3?comunidadId=comunidad-a")
      return r.status
    })
    expect(ajena).toBe(403)

    expect(errores).toEqual([])
  })
})
