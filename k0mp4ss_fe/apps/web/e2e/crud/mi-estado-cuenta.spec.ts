// e2e/crud/mi-estado-cuenta.spec.ts
//
// «El residente ve su propia deuda» — la pantalla `/comunidad/mi-estado-cuenta`
// en un navegador real.
//
// Decisión del owner (2026-11-08): el residente ve su deuda SIEMPRE y SOLO la
// suya; la bandera `residenteVeMorosidad` no gobierna la pantalla (queda como
// columna `@deprecated`). Lo que garantiza el alcance es el filtro por fila de
// `GET /api/cobros-fi/mi-estado-cuenta`, que resuelve los vínculos vigentes en
// el servidor.
//
// Qué prueba este archivo:
//   1. el residente entra por el MENÚ (no por URL directa), y la pantalla pinta
//      al menos un período con su saldo, sin excepciones de página;
//   2. conserjería y mantención NO ven la entrada, con el grupo «Comunidad»
//      abierto (la ausencia no puede ser un grupo colapsado).
//
// Datos: la base de la lane e2e (`npm run e2e:reseed-base`) no trae cobros, así
// que el spec deja UN cargo de prueba por la vía de la app —`POST /api/cobros-fi`
// con la sesión del administrador, la misma ruta que usa Finanzas— y lo borra en
// su `finally`. Nada de SQL ni de tocar `prisma/dev.db` a mano. El `id` lleva el
// prefijo `test-` que `scripts/limpiar-e2e.mjs` purga, así que una corrida
// interrumpida no deja basura permanente.
//
// El período es `2099-01` a propósito: no colisiona con los períodos del seed
// (2026-08..2026-10) ni con los que emiten otros specs, y ordena primero en la
// pantalla (período descendente).
import { expect, test } from "@playwright/test"

const PERIODO_QA = "2099-01"
const MONTO_QA = 47_000

/** Monto con el formato de la pantalla (`$47.000`, es-CL). */
const comoCLP = (monto: number): string =>
  `$${Math.round(monto).toLocaleString("es-CL")}`

/**
 * Abre el grupo «Comunidad» del menú lateral y espera a que sus ítems existan.
 *
 * El grupo se expande solo cuando la ruta activa cae dentro de él, así que en
 * `/dashboard` arranca cerrado. Se espera por un ítem conocido del grupo
 * («Directorio de Emergencias», visible para todos los roles) en vez de por un
 * atributo de Radix: así la aserción de «no veo la entrada» corre con el grupo
 * realmente abierto y no sobre un DOM colapsado.
 */
async function abrirGrupoComunidad(
  page: import("@playwright/test").Page
): Promise<void> {
  const boton = page.getByRole("button", { name: "Comunidad" })
  await expect(boton).toBeVisible({ timeout: 30_000 })

  const directorio = page.getByRole("link", { name: "Directorio de Emergencias" })
  if (!(await directorio.isVisible().catch(() => false))) {
    await boton.click()
  }
  await expect(directorio).toBeVisible({ timeout: 15_000 })
}

test.describe("CRUD — Comunidad/Mi Estado de Cuenta", () => {
  // El `page` del test es el administrador: crea y borra el cargo de prueba.
  test.use({ storageState: "e2e/.auth/admin.json" })
  test.setTimeout(180_000)

  test("el residente entra por el menú y ve su período con el saldo", async ({
    page,
    browser,
  }) => {
    const erroresAdmin: string[] = []
    page.on("pageerror", (err) => erroresAdmin.push(err.message))

    // ── El cargo de prueba, por la ruta que usa Finanzas ────────────────────
    const fondosRes = await page.request.get("/api/fondos-fi?pageSize=100")
    expect(fondosRes.ok(), `GET /api/fondos-fi: ${fondosRes.status()}`).toBe(true)
    const fondos = (await fondosRes.json()) as { data?: { id: string }[] }
    const fondoId = fondos.data?.[0]?.id
    expect(
      fondoId,
      "el seed de la lane e2e debe dejar al menos un fondo FI para imputar el cargo",
    ).toBeTruthy()

    const cobroId = `test-mec-cobro-${Date.now()}`
    const alta = await page.request.post("/api/cobros-fi", {
      data: {
        id: cobroId,
        // u-B-201 es la unidad de `residente@test.cl` en el seed.
        unidadId: "u-B-201",
        periodo: PERIODO_QA,
        concepto: "gasto_comun",
        origenModulo: "FI",
        fondoId,
        descripcion: "Cargo QA de Mi Estado de Cuenta",
        montoBase: MONTO_QA,
        fechaCargo: `${PERIODO_QA}-01`,
        fechaVencimiento: `${PERIODO_QA}-15`,
        moras: [],
        pagos: [],
        diferencias: [],
      },
    })
    expect(
      alta.ok(),
      `POST /api/cobros-fi debe crear el cargo de prueba: ${alta.status()} ${await alta.text()}`,
    ).toBe(true)

    const contextoResidente = await browser.newContext({
      storageState: "e2e/.auth/residente.json",
    })
    try {
      const residente = await contextoResidente.newPage()
      const erroresResidente: string[] = []
      residente.on("pageerror", (err) => erroresResidente.push(err.message))

      // ── 1. El residente entra por el MENÚ, no por URL directa ────────────
      await residente.goto("/dashboard")
      await abrirGrupoComunidad(residente)

      const enlace = residente.getByRole("link", { name: "Mi Estado de Cuenta" })
      await expect(enlace).toHaveCount(1, { timeout: 30_000 })
      await enlace.click()

      await expect(residente).toHaveURL(/\/comunidad\/mi-estado-cuenta/, {
        timeout: 30_000,
      })
      await expect(
        residente.getByRole("heading", { name: /Mi Estado de Cuenta/i })
      ).toBeVisible({ timeout: 30_000 })

      // ── 2. Al menos un período, con su saldo ──────────────────────────────
      const fila = residente.getByRole("row").filter({ hasText: PERIODO_QA })
      await expect(fila.first()).toBeVisible({ timeout: 30_000 })
      // El cargo ($47.000) y el saldo ($47.000) están en la misma fila.
      await expect(
        fila.first().getByRole("cell", { name: comoCLP(MONTO_QA), exact: true }).first()
      ).toBeVisible()
      // El saldo total de la pantalla también lo afirma: es la única deuda que
      // el cargo de prueba agregó.
      await expect(
        residente.getByText(comoCLP(MONTO_QA), { exact: true }).first()
      ).toBeVisible()

      expect(
        erroresResidente,
        "la pantalla del residente no debe lanzar excepciones",
      ).toEqual([])
      expect(erroresAdmin, "el administrador no debe lanzar excepciones").toEqual([])
    } finally {
      await contextoResidente.close()
      // Deja la base como estaba: el cargo de prueba no sobrevive al spec. Si la
      // baja falla, el test lo dice en vez de dejar la fila en silencio.
      const baja = await page.request.delete(`/api/cobros-fi/${cobroId}`)
      expect(
        baja.ok(),
        `DELETE /api/cobros-fi/${cobroId} debe limpiar el cargo de prueba: ${baja.status()}`,
      ).toBe(true)
    }
  })
})

test.describe("CRUD — Mi Estado de Cuenta no se abre a otros roles", () => {
  test.use({ storageState: "e2e/.auth/conserjeria.json" })

  test("conserjería no ve la entrada con el grupo Comunidad abierto", async ({
    page,
  }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/dashboard")
    await abrirGrupoComunidad(page)

    // El grupo está abierto (se ve el Directorio) y aun así la entrada no está.
    await expect(
      page.getByRole("link", { name: "Directorio de Emergencias" })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Mi Estado de Cuenta" })
    ).toHaveCount(0)

    expect(errores).toEqual([])
  })
})

test.describe("CRUD — Mi Estado de Cuenta no se abre a mantención", () => {
  test.use({ storageState: "e2e/.auth/mantencion.json" })

  test("mantención no ve la entrada con el grupo Comunidad abierto", async ({
    page,
  }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    await page.goto("/dashboard")
    await abrirGrupoComunidad(page)

    await expect(
      page.getByRole("link", { name: "Directorio de Emergencias" })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Mi Estado de Cuenta" })
    ).toHaveCount(0)

    expect(errores).toEqual([])
  })
})
