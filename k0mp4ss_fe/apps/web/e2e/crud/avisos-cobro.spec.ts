// e2e/crud/avisos-cobro.spec.ts
//
// Serie aviso-de-cobro — la prueba de punta a punta del papel con el que se
// cobra (Ley 21.442 arts. 31 y 32), en un navegador real y con dos sesiones:
//
//   1. el ADMINISTRADOR, en `/finanzas/gastos-comunes`, emite los avisos de un
//      período YA emitido en gasto común; la pantalla reporta sus conteos y NO
//      entrega nada (emitir congela el papel, entregar es un hecho posterior);
//   2. el administrador dispara la entrega explícita y la pantalla reporta su
//      resultado: visor `entregado`, correo `pendiente` (sin SMTP, F4);
//   3. el RESIDENTE abre `/comunidad/avisos-cobro`, ve SU aviso con su folio y
//      el total adeudado consolidado congelado, y descarga el PDF firmado.
//
// Reglas de la spec que este archivo verifica (y que no se ablandan acá):
//   S3 — la entrega es explícita y deja prueba (la notificación del visor).
//   S4 — el total que el residente ve es el CONSOLIDADO congelado del contenido.
//   S7 — el aviso nace con folio `AC-####` y no se reescribe.
//
// Setup: `e2e/helpers/avisos-cobro.ts` deja un período con emisión de gasto
// común, sin avisos y con cobro en una unidad del residente, por API REST con la
// sesión del administrador (reusa el seed; emite el período sólo si hace falta).
// Autenticación: la canónica del repo — storageState que produce
// `e2e/auth.setup.ts` con el login real de NextAuth, uno por rol, sin inventar
// un segundo camino. El residente se abre en su propio contexto, igual que en
// `e2e/flujo/lectura-residente.spec.ts`.
import fs from "node:fs"
import { expect, test } from "@playwright/test"
import {
  asegurarPeriodoParaAvisos,
  avisosDeUnidad,
  avisosDelPeriodo,
  enviosDelAviso,
  montoCLP,
  personaIdPropia,
  referenciaUnidadDe,
  totalAdeudadoDe,
  unidadesComoPropietario,
  type AvisoDelListado,
} from "../helpers/avisos-cobro"

const AUTH_RESIDENTE = "e2e/.auth/residente.json"

test.use({ storageState: "e2e/.auth/admin.json", actionTimeout: 30_000 })
test.setTimeout(300_000)

test.describe("CRUD — Finanzas/Avisos de Cobro", () => {
  test("emitir no entrega: la entrega explícita deja prueba y el residente ve su folio y descarga el PDF", async ({
    page,
    browser,
  }) => {
    const erroresAdmin: string[] = []
    page.on("pageerror", (err) => erroresAdmin.push(err.message))

    const contextoResidente = await browser.newContext({ storageState: AUTH_RESIDENTE })
    try {
      const pageResidente = await contextoResidente.newPage()
      const erroresResidente: string[] = []
      pageResidente.on("pageerror", (err) => erroresResidente.push(err.message))

      // ── Destinatario y período ───────────────────────────────────────────
      // La identidad sale de la sesión del propio residente; sus unidades, de
      // los vínculos vigentes. El aviso sólo puede entregarse al propietario
      // vigente (S3), así que la unidad que se avisa es una donde lo es.
      const personaId = await personaIdPropia(contextoResidente.request)
      const unidades = await unidadesComoPropietario(page.request, personaId)
      expect(
        unidades.length,
        "el residente debe ser propietario vigente de al menos una unidad",
      ).toBeGreaterThan(0)
      // La emisión de gasto común no reparte estacionamientos (`u-E-*`): la
      // unidad avisada tiene que ser una que sí entra en la emisión.
      const unidadId =
        unidades.find((u) => !u.startsWith("u-E-")) ?? (unidades[0] as string)

      const preparado = await asegurarPeriodoParaAvisos(page.request, unidadId)
      const periodo = preparado.periodo

      // ── 1. El administrador emite los avisos del período ─────────────────
      await page.goto("/finanzas/gastos-comunes")
      await expect(
        page.getByRole("heading", { name: /Gastos Comunes y Fondos/ }),
      ).toBeVisible({ timeout: 60_000 })
      await page.getByRole("tab", { name: "Emisión GC" }).click()

      const tablaEmisiones = page.getByRole("table").filter({
        has: page.getByRole("columnheader", { name: /Aviso de cobro/ }),
      })
      await expect(tablaEmisiones).toBeVisible({ timeout: 60_000 })

      const filaEmision = tablaEmisiones.getByRole("row").filter({
        has: page.getByRole("cell", { name: periodo, exact: true }),
      })
      await expect(
        filaEmision,
        `el historial de emisiones debe ofrecer el período ${periodo}`,
      ).toHaveCount(1, { timeout: 30_000 })

      const botonEmitir = filaEmision.getByRole("button", {
        name: `Emitir avisos del período ${periodo}`,
      })
      await expect(botonEmitir).toBeVisible({ timeout: 30_000 })
      await botonEmitir.click()

      // Los conteos que la pantalla reporta son los que el servidor devolvió:
      // creados = avisos persistidos del período; omitidos = unidades de la
      // emisión que quedaron sin aviso (la ruta las saltea, no las inventa).
      const estadoEmision = filaEmision.getByRole("status")
      await expect(estadoEmision).toBeVisible({ timeout: 60_000 })
      await expect
        .poll(
          async () => (await avisosDeUnidad(page.request, unidadId)).length,
          { timeout: 60_000, intervals: [500] },
        )
        .toBeGreaterThan(0)

      const avisosDelPeriodoEmitido = await avisosDelPeriodo(page.request, periodo)
      const creados = avisosDelPeriodoEmitido.length
      const omitidos = Math.max(0, preparado.unidadesEmitidas - creados)

      const avisosDeLaUnidad = await avisosDeUnidad(page.request, unidadId)
      const aviso = avisosDeLaUnidad.find((a) => a.periodo === periodo)
      expect(
        aviso,
        `el aviso de la unidad ${unidadId} del período ${periodo} debe existir`,
      ).toBeTruthy()
      const avisoEmitido = aviso as AvisoDelListado

      // Reporte exacto: el mismo conteo que quedó en la base, unidad del
      // residente incluida, y ningún rechazo.
      await expect(estadoEmision).toContainText(
        `Avisos del período ${periodo}: ${creados} creados, ${omitidos} sin aviso`,
      )
      await expect(estadoEmision).toContainText("0 rechazados")
      expect(
        avisoEmitido.folio,
        "el aviso nace con folio AC-#### asignado por el servidor",
      ).toMatch(/^AC-\d{4}$/)

      // ── 2. Emitir NO entrega: no hay registro de entrega todavía ─────────
      expect(
        await enviosDelAviso(page.request, avisoEmitido.id),
        "emitir el aviso no registra ninguna entrega: entregar es un paso aparte",
      ).toEqual([])
      await expect(filaEmision.locator("ul li")).toHaveCount(0)

      // ── 3. La entrega explícita, con su prueba ──────────────────────────
      const botonEntregar = filaEmision.getByRole("button", {
        name: /Entregar (el aviso|los \d+ avisos) por el visor/,
      })
      await expect(botonEntregar).toBeVisible({ timeout: 30_000 })
      await botonEntregar.click()

      const lineaEntrega = filaEmision.locator("li").filter({ hasText: avisoEmitido.folio })
      await expect(lineaEntrega).toBeVisible({ timeout: 120_000 })
      await expect(lineaEntrega).toContainText("visor entregado")
      // El propietario sembrado tiene una dirección de prueba: el emisor se niega a
      // enviar y lo registra como fallido con el motivo, en vez de intentarlo y rebotar.
      await expect(lineaEntrega).toContainText("email fallido")

      await expect
        .poll(
          async () => (await enviosDelAviso(page.request, avisoEmitido.id)).length,
          { timeout: 60_000, intervals: [500] },
        )
        .toBeGreaterThan(0)
      const envios = await enviosDelAviso(page.request, avisoEmitido.id)
      const entregaVisor = envios.find((e) => e.canal === "visor")
      expect(entregaVisor, "la entrega deja su registro en el visor").toBeTruthy()
      expect(entregaVisor?.estado).toBe("entregado")
      expect(
        entregaVisor?.notificacionId,
        "la entrega por el visor se materializa en la notificación del residente",
      ).toBeTruthy()
      const entregaEmail = envios.find((e) => e.canal === "email")
      expect(entregaEmail?.estado).toBe("fallido")
      expect(
        entregaEmail?.motivo,
        "el motivo nombra la dirección de prueba y dice que no se envió nada",
      ).toContain("prueba o inexistente")

      // ── 4. El residente ve el aviso con su folio y su total congelado ────
      const totalCongelado = totalAdeudadoDe(avisoEmitido)
      expect(
        totalCongelado,
        "el contenido congelado del aviso debe traer el total adeudado",
      ).not.toBeNull()

      await pageResidente.goto("/comunidad/avisos-cobro")
      await expect(
        pageResidente.getByRole("heading", { name: /Avisos de Cobro/ }),
      ).toBeVisible({ timeout: 60_000 })

      const filaAviso = pageResidente
        .getByRole("row")
        .filter({ hasText: avisoEmitido.folio })
      await expect(
        filaAviso,
        `el residente debe ver el aviso ${avisoEmitido.folio} de su unidad`,
      ).toHaveCount(1, { timeout: 60_000 })
      await expect(filaAviso.getByRole("cell", { name: periodo, exact: true })).toBeVisible()
      await expect(
        filaAviso.getByRole("cell", { name: avisoEmitido.folio, exact: true }),
      ).toBeVisible()
      // El total es el CONSOLIDADO congelado del papel, no el del mes recalculado.
      await expect(
        filaAviso.getByRole("cell", { name: montoCLP(totalCongelado as number), exact: true }),
      ).toBeVisible()
      const referencia = referenciaUnidadDe(avisoEmitido)
      if (referencia) {
        await expect(filaAviso.getByRole("cell", { name: referencia, exact: true })).toBeVisible()
      }

      // ── 5. La descarga produce un PDF de verdad ─────────────────────────
      // La espera va sobre el page del RESIDENTE (el del contexto propio), no
      // sobre el del administrador, y sólo después de que la fila del aviso está
      // visible con su folio y su total.
      const botonDescargar = filaAviso.getByRole("button", { name: "Descargar PDF" })
      await expect(botonDescargar).toBeEnabled({ timeout: 30_000 })

      // El builder de pdfmake corre en el cliente: si revienta, la descarga no
      // llega nunca y el motivo queda en la excepción de la página. La excepción
      // se informa con su mensaje exacto antes que el timeout de la descarga.
      let errorDescarga: Error | null = null
      const esperaDescarga = pageResidente
        .waitForEvent("download", { timeout: 30_000 })
        .then(
          (d) => d,
          (e: Error) => {
            errorDescarga = e
            return null
          },
        )

      await botonDescargar.click()
      const descarga = await esperaDescarga

      await expect(
        erroresResidente,
        "la pantalla del residente no debe lanzar excepciones al armar el PDF",
      ).toEqual([])
      expect(
        errorDescarga,
        "el clic en «Descargar PDF» debe disparar la descarga del documento",
      ).toBeNull()
      expect(descarga, "la descarga del PDF debe dispararse").toBeTruthy()

      const archivo = descarga as import("@playwright/test").Download
      expect(archivo.suggestedFilename()).toBe(`aviso-cobro-${avisoEmitido.folio}.pdf`)
      const rutaPdf = await archivo.path()
      expect(rutaPdf, "la descarga debe dejar el archivo en disco").toBeTruthy()
      const bytes = fs.readFileSync(rutaPdf as string).length
      expect(bytes, "el PDF descargado no puede estar vacío").toBeGreaterThan(1000)

      // Y la pantalla lo reporta con el folio del aviso emitido.
      await expect(
        pageResidente.getByText(
          `PDF ${avisoEmitido.folio} generado con la huella de su contenido congelado.`,
        ),
      ).toBeVisible({ timeout: 30_000 })

      expect(erroresAdmin, "Excepciones no capturadas en finanzas/gastos-comunes").toEqual([])
      expect(erroresResidente, "Excepciones no capturadas en comunidad/avisos-cobro").toEqual([])
    } finally {
      await contextoResidente.close()
    }
  })
})
