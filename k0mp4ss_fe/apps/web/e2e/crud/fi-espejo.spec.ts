import { expect, test } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

/**
 * NOTA (pe-paneles-bd, N3): este spec ya NO compara contra el store legacy. El panel
 * «Espejo BD (ST)» (`components/fi-espejo-bd.tsx`) nació para verificar el sync
 * store→BD mientras duró la migración; hoy el store ya no es fuente de datos en
 * ninguna pantalla operativa (la allowlist de audit-store quedó en las 3 páginas del
 * módulo QA/dev) y el punto cero se siembra por script (`npm run db:punto-cero`,
 * enganchado a `e2e:reseed-base`), no por el espejo. Lo que sigue siendo cierto y
 * valioso: /finanzas renderiza sin pageerror y el histórico 2023-2024 vive en la
 * base, legible vía GET /api/fi con la sesión admin del contexto del navegador.
 * POST /api/fi/sync queda cubierto por test/api-fi-sync.test.ts (Prisma real), así
 * que no se duplica acá.
 */
test.describe("/finanzas lee el histórico de la base", () => {
  test("renderiza sin pageerror y la base expone el punto cero 2023-2024", async ({
    page,
  }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/finanzas")
    await expect(
      page.getByRole("heading", { name: "Finanzas" })
    ).toBeVisible({ timeout: 15_000 })
    expect(errores, "Excepciones no capturadas en /finanzas").toEqual([])

    // El histórico vive en la base (sembrada por db:punto-cero): 182 egresos y
    // 44 ingresos del punto cero, fondo CC con apertura 17.082.694 → saldo 0.
    // En BD compartida puede haber datos TEST de otros specs → se afirma ≥.
    const api = await page.evaluate(async () => {
      const res = await fetch("/api/fi?pageSize=1")
      if (!res.ok) return null
      return (await res.json()) as {
        egresos: { total: number }
        ingresos: { total: number }
        totalesPorFondo: {
          fondoId: string
          saldoInicial: number
          montoEgresos: number
          montoIngresos: number
          saldo: number
        }[]
      }
    })
    expect(api, "GET /api/fi debe responder desde el contexto admin").not.toBeNull()
    expect(api!.egresos.total).toBeGreaterThanOrEqual(182)
    expect(api!.ingresos.total).toBeGreaterThanOrEqual(44)

    const ccBD = api!.totalesPorFondo.find(
      (t) => t.fondoId === "fondo-cc-punto-cero"
    )
    expect(ccBD, "fondo CC del punto cero presente en BD").toBeTruthy()
    // Montos del libro 2023-2024 (dos dígitos de millón), ≥ por datos TEST eventuales
    expect(
      ccBD!.montoEgresos,
      "monto egresos del libro ≥ $62.491.011"
    ).toBeGreaterThanOrEqual(62_491_011)
    expect(
      ccBD!.montoIngresos,
      "monto ingresos del libro ≥ $45.408.317"
    ).toBeGreaterThanOrEqual(45_408_317)
    // Con BD limpia (CI), el punto cero cuadra exactamente: saldo CC = 0
    if (api!.egresos.total === 182 && api!.ingresos.total === 44) {
      expect(ccBD!.saldoInicial, "apertura CC del punto cero").toBe(17_082_694)
      expect(Math.round(ccBD!.saldo), "saldo CC cuadrado").toBe(0)
    }

    expect(errores, "Excepciones no capturadas en /finanzas (histórico BD)").toEqual([])
  })
})
