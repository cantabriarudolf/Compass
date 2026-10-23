// e2e/flujo/lectura-residente.spec.ts
//
// Change co-lectura-residente, tarea 1.9 · S1, S2 y S6.
//
// Cubre el flujo real de lectura, con dos sesiones simultáneas:
//   1. la Administración crea por API una comunicación con DOS destinatarios
//      (p-3 = residente@test.cl y p-2) y ve «0/2 leídos» con el descargo de S9;
//   2. el residente abre `/comunidad/comunicacion`, ve SU comunicación, la abre
//      (POST …/leer) y la bandeja muestra la fecha y hora de su lectura;
//   3. la Administración recarga y ve «1/2 leídos» — la lectura es real, no simulada.
//
// Y un segundo caso, sin datos: el residente NO ve la consola de administración
// ni ningún selector de vista (S1: el rol lo decide el servidor).
//
// Reglas de la lane: base fresca (`npm run e2e:reseed-base` / `e2e:fresh`) y
// NUNCA correr `e2e/auth/rate-limit.spec.ts` antes (bloquea la IP 15 min y aborta
// `auth.setup`). El envío TEST se crea por API y se borra en `finally`.
import { expect, test } from "@playwright/test"

test.setTimeout(120_000)

const AUTH_RESIDENTE = "e2e/.auth/residente.json"

/** Descargo literal del dictamen (design §Textos de UI, punto 2). */
const DESCARGO_METRICA =
  "Dato estadístico de recepción del canal; no acredita conocimiento del contenido ni constituye notificación legal por sí solo."

/** Aviso literal de registro de lectura (design §Textos de UI, punto 1). */
const AVISO_LECTURA = /Al abrir esta comunicación se registra tu lectura/

test.describe("CO — el residente abre su comunicación y la Administración ve la lectura", () => {
  test.use({ storageState: "e2e/.auth/admin.json" })

  test("0/2 → el residente lee → 1/2 leídos en la consola", async ({ page, browser }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const asunto = `QA Lectura residente ${ts}`
    const cuerpo = `Comunicación TEST ${ts}: corte de agua programado para el martes.`

    // (1) Alta por API: dos destinatarios, ninguno leído todavía.
    const alta = await page.request.post("/api/co/envios", {
      data: {
        id: `env-qa-lectura-${ts}`,
        asunto,
        cuerpo,
        destinatarios: [
          { personaId: "p-3", unidadId: "u-B-201" },
          { personaId: "p-2", unidadId: "u-A-101" },
        ],
        fechaEnvio: new Date().toISOString().slice(0, 10),
        lecturas: [],
      },
    })
    expect(
      alta.ok(),
      `POST /api/co/envios debe crear el envío (status ${alta.status()}: ${await alta.text()})`
    ).toBe(true)
    const envio = (await alta.json()) as { id: string }

    try {
      // (2) La consola del administrador arranca en 0/2 con el descargo de S9.
      await page.goto("/comunidad/comunicacion")
      await expect(page.getByRole("heading", { name: /Comunicación/ }).first()).toBeVisible({
        timeout: 30_000,
      })
      const filaAdmin = page.getByRole("listitem").filter({ hasText: asunto })
      await expect(filaAdmin).toBeVisible({ timeout: 30_000 })
      await expect(filaAdmin.getByText("0/2 leídos")).toBeVisible({ timeout: 15_000 })
      await expect(filaAdmin.getByText(DESCARGO_METRICA)).toBeVisible()

      // (3) El residente, en su propia sesión, abre la bandeja y su comunicación.
      const contextoResidente = await browser.newContext({ storageState: AUTH_RESIDENTE })
      const pageResidente = await contextoResidente.newPage()
      try {
        await pageResidente.goto("/comunidad/comunicacion")
        await expect(
          pageResidente.getByRole("heading", { name: /Comunicación/ }).first()
        ).toBeVisible({ timeout: 30_000 })
        await expect(pageResidente.getByText(AVISO_LECTURA).first()).toBeVisible({
          timeout: 30_000,
        })

        const filaResidente = pageResidente.getByRole("listitem").filter({ hasText: asunto })
        await expect(filaResidente).toBeVisible({ timeout: 30_000 })
        await expect(filaResidente.getByText("Sin leer")).toBeVisible()

        await filaResidente.getByRole("button", { name: "Abrir" }).click()

        // El cuerpo se despliega y la lectura propia queda registrada con fecha y hora.
        await expect(pageResidente.getByText(cuerpo)).toBeVisible({ timeout: 15_000 })
        await expect(
          pageResidente.getByText(/Leído el \d{2}-\d{2}-\d{4} \d{2}:\d{2}/)
        ).toBeVisible({ timeout: 15_000 })
      } finally {
        await contextoResidente.close()
      }

      // (4) La Administración ve la lectura REAL: 1/2.
      await page.reload()
      const filaAdminDespues = page.getByRole("listitem").filter({ hasText: asunto })
      await expect(filaAdminDespues).toBeVisible({ timeout: 30_000 })
      await expect(filaAdminDespues.getByText("1/2 leídos")).toBeVisible({ timeout: 30_000 })

      expect(errores, "Excepciones no capturadas en la consola de CO").toEqual([])
    } finally {
      // Limpieza: el envío TEST se borra (cascadea sus filas de destinatarios).
      await page.request.delete(`/api/co/envios/${envio.id}`).catch(() => {})
    }
  })
})

test.describe("CO — el residente no ve la consola de administración", () => {
  test.use({ storageState: AUTH_RESIDENTE })

  test("sin selector de vista y sin pestañas de la consola", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/comunidad/comunicacion")
    await expect(page.getByRole("heading", { name: /Comunicación/ }).first()).toBeVisible({
      timeout: 30_000,
    })

    // La vista la decide el servidor: no hay control para cambiarla.
    await expect(page.getByText("Vista:", { exact: false })).toHaveCount(0)
    // Ni la consola del administrador (pestañas, redacción, envío masivo)…
    await expect(page.getByRole("tab")).toHaveCount(0)
    await expect(page.getByRole("button", { name: /Enviar a destinatarios filtrados/ })).toHaveCount(
      0
    )
    await expect(page.getByRole("button", { name: /Nueva plantilla/ })).toHaveCount(0)
    // …ni la nómina de destinatarios.
    await expect(page.getByText(/Alcance resuelto/)).toHaveCount(0)

    // La bandeja propia sí está, con su aviso de tratamiento (S7).
    await expect(page.getByText(/Responsable: /).first()).toBeVisible({ timeout: 30_000 })

    expect(errores, "Excepciones no capturadas en la bandeja del residente").toEqual([])
  })
})
