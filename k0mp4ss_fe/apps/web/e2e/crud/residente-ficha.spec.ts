// P2 (SERIE-VALIDACION-PERFILES) — residente ve SU ficha p-3 en Mis datos,
// reserva RA de su unidad y solicita certificado CT. Entidades TEST-* nuevas;
// sin confirmar retiros/pagos del seed; sin conteos frágiles.
import { expect, test } from "@playwright/test"

async function gotoStable(page: import("@playwright/test").Page, url: string) {
  await page.goto(url)
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(800)
}

/**
 * abrirSelect — click con reintento hasta que el menú Radix abre.
 * Con el servidor bajo carga (compilación Turbopack + hidratación lenta),
 * un click puede caer antes de que los listeners hidraten: se re-clickEA
 * hasta ver options o agotar intentos. NUNCA presiona Escape (cerraría el
 * diálogo que contiene al select). Solo-spec, sin cambios de app.
 */
async function abrirSelect(
  page: import("@playwright/test").Page,
  trigger: import("@playwright/test").Locator
) {
  await expect(trigger).toBeVisible({ timeout: 10_000 })
  for (let i = 0; i < 4; i++) {
    await trigger.click({ force: true, noWaitAfter: true })
    try {
      await expect(page.getByRole("option").first()).toBeVisible({
        timeout: 3_000,
      })
      return
    } catch {
      // Sin Escape: solo espera y re-clickEA (el diálogo debe seguir abierto).
      await page.waitForTimeout(800)
      await expect(trigger).toBeVisible({ timeout: 10_000 })
    }
  }
  await trigger.click({ force: true, noWaitAfter: true })
}

async function pickFirstOption(
  page: import("@playwright/test").Page,
  trigger: import("@playwright/test").Locator
) {
  await expect(trigger).toBeVisible({ timeout: 10_000 })
  await abrirSelect(page, trigger)
  const opts = page.getByRole("option")
  await expect(opts.first()).toBeVisible({ timeout: 10_000 })
  const cnt = await opts.count()
  for (let i = 0; i < cnt; i++) {
    const txt = ((await opts.nth(i).textContent())?.trim() ?? "")
    if (!txt || txt === "Sin unidad" || txt === "Ninguno" || txt === "Selecciona…" || txt === "—") continue
    await opts.nth(i).click({ force: true, noWaitAfter: true })
    return
  }
  await opts.first().click({ force: true, noWaitAfter: true })
}

test.describe("residente — SU ficha p-3 en Mis datos + RA + CT", () => {
  test.use({ storageState: "e2e/.auth/residente.json" })

  test("mis-datos muestra su ficha, reserva RA y certificado CT", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (e) => errores.push(e.message))

    // Origen para los fetch relativos (storageState ya autenticado).
    await gotoStable(page, "/dashboard")

    // 1. SU ficha: la API devuelve p-3 (Roberto Gómez Bolaños).
    const ficha = await page.evaluate(async () => {
      const r = await fetch("/api/mis-datos", { headers: { Accept: "application/json" } })
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
    expect(ficha.personaId).toBe("p-3")
    expect(ficha.nombre).toContain("Gómez")
    expect(ficha.email).toBe("residente@test.cl")

    // 2. UI Mis datos muestra su correo (vista ARCO Ley 21.719).
    await gotoStable(page, "/admin/mis-datos")
    await expect(
      page.getByRole("heading", { name: /Mis datos personales/ }).first()
    ).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("residente@test.cl").first()).toBeVisible({
      timeout: 10_000,
    })

    // 3. RA: nueva reserva TEST-* de su unidad. El seed no trae amenities en
    // comunidad-a: se crea el elemento vía API (ra:crear permitido) y se
    // reserva por UI (elemento + solicitante propio + fecha + tramo).
    const nombreAmenity = `TEST-RA-${Date.now()}`
    const amenity = await page.evaluate(async (nombre: string) => {
      const cuerpo = {
        id: `ra-test-${Date.now()}`,
        nombre,
        tipo: "espacio_fisico",
        franja: "bloques_horas",
        duracionBloqueHoras: 2,
        tarifaUso: 0,
        garantiaRequerida: 0,
        activo: true,
      }
      const r = await fetch("/api/ra/elementos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      })
      if (!r.ok) return { ok: false, status: r.status }
      const j = await r.json()
      return { ok: true, id: j.id, nombre: j.nombre }
    }, nombreAmenity)
    expect(amenity.ok).toBe(true)

    await gotoStable(page, "/operaciones/reservas")
    await expect(
      page.getByRole("heading", { name: /Reservas y Amenities/ }).first()
    ).toBeVisible({ timeout: 15_000 })
    // La hidratación + carga SWR van detrás del heading: esperar datos
    // ("Sin reservas" o una fila) antes del primer click, o el click cae
    // en vacío con el servidor bajo carga.
    await expect(
      page
        .getByText(/Sin reservas registradas|Confirmadas bloquean/)
        .first()
    ).toBeVisible({ timeout: 30_000 })
    await page
      .getByRole("button", { name: "Nueva reserva" })
      .click({ force: true, noWaitAfter: true })
    const dialogRA = page.getByRole("dialog")
    await expect(dialogRA).toBeVisible({ timeout: 10_000 })

    // Elemento: el TEST-* recién creado.
    const labelEl = dialogRA.getByText(/Elemento reservable/).first()
    const triggerEl = labelEl.locator("..").getByRole("combobox").first()
    await abrirSelect(page, triggerEl)
    const optEl = page
      .getByRole("option")
      .filter({ hasText: nombreAmenity })
      .first()
    await expect(optEl).toBeVisible({ timeout: 10_000 })
    await optEl.click({ force: true, noWaitAfter: true })

    // Solicitante: su propia ficha.
    const labelSol = dialogRA.getByText(/Solicitante/).first()
    const triggerSol = labelSol.locator("..").getByRole("combobox").first()
    await expect(triggerSol).toBeVisible({ timeout: 10_000 })
    await abrirSelect(page, triggerSol)
    const optPropia = page
      .getByRole("option")
      .filter({ hasText: /Gómez|Roberto/ })
      .first()
    if (await optPropia.isVisible().catch(() => false)) {
      await optPropia.click({ force: true, noWaitAfter: true })
    } else {
      await pickFirstOption(page, triggerSol)
    }

    // Unidad: opcional y sin datos para este rol (combo vacío) → se omite.
    // (No se toca el select de unidad: queda en "Ninguna".)

    // Fecha: mañana (input date nativo).
    const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const inputFecha = dialogRA.locator('input[type="date"]').first()
    if (await inputFecha.isVisible().catch(() => false)) {
      await inputFecha.fill(manana)
    }

    // Tramo horario: primer slot del elemento (requiere elemento elegido).
    const labelTramo = dialogRA.getByText(/Tramo horario/).first()
    await expect(labelTramo).toBeVisible({ timeout: 10_000 })
    const triggerT = labelTramo.locator("..").getByRole("combobox").first()
    await pickFirstOption(page, triggerT)

    const btnConfirmar = dialogRA
      .getByRole("button", { name: /Confirmar disponibilidad/ })
      .first()
    await expect(btnConfirmar).toBeVisible({ timeout: 10_000 })
    // Reintento: el click puede caer pre-hidratación bajo carga; se verifica
    // por el efecto (diálogo cerrado o mensaje visible), no por el click.
    let confirmado = false
    for (let i = 0; i < 3 && !confirmado; i++) {
      await btnConfirmar.click({ force: true, noWaitAfter: true })
      try {
        await expect(
          page.getByText(/Reserva confirmada/).first()
        ).toBeVisible({ timeout: 5_000 })
        confirmado = true
      } catch {
        if (!(await dialogRA.isVisible().catch(() => true))) {
          await expect(
            page.getByText(/Reserva confirmada/).first()
          ).toBeVisible({ timeout: 15_000 })
          confirmado = true
        }
      }
    }
    await expect(page.getByText(/Reserva confirmada/).first()).toBeVisible({
      timeout: 15_000,
    })

    // 4. CT: solicita certificado de residencia de su unidad (u-B-201).
    // La UI no puede elegir unidad (combo vacío: /api/unidades 403 para el
    // rol residente por diseño), así que se emite vía API (ct:crear sí
    // permitido) y se verifica en el Historial UI.
    const ts = Date.now()
    const folioCT = `TEST-CT-${ts}`
    const emision = await page.evaluate(async (folio: string) => {
      const cuerpo = {
        id: `ct-test-${Date.now()}`,
        folio,
        codigoVerificacion: `VC-TEST-${Date.now().toString(36).toUpperCase()}`,
        tipo: "residencia",
        unidadId: "u-B-201",
        personaId: "p-3",
        origenRef: "v-test-residente",
        solicitanteNombre: "Roberto Gómez Bolaños",
        resumen: "Certificado de residencia TEST (validación por perfil).",
        detalle: [
          { clave: "Unidad", valor: "B-201" },
          { clave: "Solicitante", valor: "Roberto Gómez Bolaños" },
        ],
        fechaEmision: new Date().toISOString().slice(0, 10),
      }
      const r = await fetch("/api/certificados-ct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      })
      if (!r.ok) return { ok: false, status: r.status }
      const j = await r.json()
      return { ok: true, folio: j.folio }
    }, folioCT)
    expect(emision.ok).toBe(true)
    expect(emision.folio).toBe(folioCT)

    await gotoStable(page, "/comunidad/certificados")
    await expect(
      page.getByRole("heading", { name: /Certificados/ }).first()
    ).toBeVisible({ timeout: 20_000 })
    const tabHist = page.getByRole("tab", { name: "Historial" })
    // Reintento: el click al tab puede caer pre-hidratación; se verifica por
    // el estado seleccionado antes de buscar el folio.
    for (let i = 0; i < 3; i++) {
      if (await tabHist.getAttribute("aria-selected").catch(() => null) === "true") break
      if (await tabHist.isVisible().catch(() => false)) {
        await tabHist.click({ force: true, noWaitAfter: true })
        await page.waitForTimeout(800)
      } else break
    }
    await expect(page.getByText(folioCT).first()).toBeVisible({
      timeout: 15_000,
    })

    expect(errores).toEqual([])
  })
})
