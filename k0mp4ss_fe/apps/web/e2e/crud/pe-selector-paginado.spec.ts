// Selector de «Unidad destino» (PE) — la búsqueda recorre TODO el resultado, no la primera página.
//
// Defecto que fija este spec: `buscarUnidades` pedía `pageSize=25` y lanzaba la respuesta como
// lista suelta, así que `components/selector-buscable.tsx` no tenía `hayMas` y no ofrecía
// «Cargar más resultados». Un término amplio (en el padrón semillado, «Depto» coincide con 80
// unidades destino) dejaba al conserje viendo 25 y sin forma de ver las 55 restantes.
//
// Lo observable, sin depender del tamaño exacto del seed: la primera página trae 25 opciones, el
// botón aparece, y cargando páginas se llega EXACTAMENTE al `total` que reporta la propia API.
// El total se pide a `/api/pe/unidades?q=Depto&pageSize=1` con la misma sesión del navegador, así
// el número queda anclado al servidor y no a un conteo escrito a mano.
import { expect, test, type Page } from "@playwright/test"

test.use({ actionTimeout: 30_000 })

const TERMINO_AMPLIO = "Depto"
const PRIMERA_PAGINA = 25
/** Tope de «Cargar más resultados» que pulsamos: corta un bucle si el botón no desaparece. */
const MAXIMO_PAGINAS = 10

/** Resultados del combobox «Unidad destino» (la lista lleva ese nombre en `aria-label`). */
function resultadosUnidad(page: Page) {
  return page.getByRole("listbox", { name: /Resultados de Unidad destino/ })
}

test.describe("CRUD — PE selector de unidad destino pagina en el servidor", () => {
  test("un término amplio se recorre completo hasta el total de la API", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    // Total real del servidor para el término, con la sesión de la página.
    const respuesta = await page.request.get(
      `/api/pe/unidades?q=${TERMINO_AMPLIO}&pageSize=1`
    )
    expect(respuesta.status()).toBe(200)
    const total = ((await respuesta.json()) as { total?: number }).total ?? 0
    // El caso solo tiene sentido si el término coincide con más de una página.
    expect(total).toBeGreaterThan(PRIMERA_PAGINA)

    await page.goto("/operaciones/accesos")
    await expect(page.getByText("¿A qué viene?").first()).toBeVisible({ timeout: 15_000 })
    await page.getByRole("button", { name: /Viene a ver a alguien/ }).click()

    const campo = page.getByLabel("Unidad destino")
    await expect(campo).toBeVisible({ timeout: 10_000 })
    // `fill` dispara un único evento: una sola consulta debounced, sin peticiones por tecla.
    await campo.fill(TERMINO_AMPLIO)

    const opciones = resultadosUnidad(page).getByRole("option")
    // Estado anterior al arreglo: acá se quedaba, 25 opciones y nada más.
    await expect(opciones).toHaveCount(PRIMERA_PAGINA)

    const cargarMas = page.getByRole("button", { name: "Cargar más resultados" })
    await expect(cargarMas).toBeVisible()
    await cargarMas.click()
    // Segunda página: el conserje ya ve lo que antes era invisible.
    await expect(opciones).toHaveCount(PRIMERA_PAGINA * 2)

    // Se puede llegar hasta el final de la búsqueda. Cada clic espera a que la página aterrice
    // (crece el conteo) antes de volver a mirar el botón: mientras carga, el botón dice
    // «Cargando…» y desaparece del locator.
    for (let intento = 0; intento < MAXIMO_PAGINAS; intento++) {
      if (!(await cargarMas.isVisible())) break
      const antes = await opciones.count()
      await cargarMas.click()
      await expect.poll(() => opciones.count()).toBeGreaterThan(antes)
    }
    await expect(cargarMas).toHaveCount(0)
    await expect(opciones).toHaveCount(total)

    expect(errores, "Excepciones no capturadas en operaciones/accesos").toEqual([])
  })

  test("sin `page` la primera página es idéntica: mismos ids y mismos campos", async ({ page }) => {
    // Regresión: un consumidor que NO pagina (el padrón de `pageSize=100`, la preselección del QR)
    // tiene que recibir exactamente lo de antes. Se compara contra `page=1`, no contra un número
    // escrito a mano: lo que cambia con el arreglo es solo la posibilidad de pedir más.
    const sinPagina = (await (
      await page.request.get(`/api/pe/unidades?q=${TERMINO_AMPLIO}&pageSize=${PRIMERA_PAGINA}`)
    ).json()) as { data: Record<string, unknown>[]; total: number }
    const conPaginaUno = (await (
      await page.request.get(
        `/api/pe/unidades?q=${TERMINO_AMPLIO}&pageSize=${PRIMERA_PAGINA}&page=1`
      )
    ).json()) as { data: Record<string, unknown>[]; total: number }

    expect(sinPagina.data.map((fila) => fila.id)).toEqual(
      conPaginaUno.data.map((fila) => fila.id)
    )
    expect(sinPagina.total).toBe(conPaginaUno.total)
    // El conjunto de campos de cada fila no crece: la proyección sigue siendo de cuatro campos
    // (sin metraje, prorrateo, estado ni servicios) porque estos endpoints sirven al guard.
    const primeraUnidad = sinPagina.data[0] ?? {}
    expect(Object.keys(primeraUnidad).sort()).toEqual([
      "etiqueta",
      "id",
      "numero",
      "rolSii",
    ])

    // El mismo `page` aditivo existe en `/api/pe/personas`, con su proyección de identidad intacta.
    const personasUno = (await (
      await page.request.get("/api/pe/personas?q=na&pageSize=25")
    ).json()) as { data: Record<string, unknown>[]; total: number }
    const personasDos = (await (
      await page.request.get("/api/pe/personas?q=na&pageSize=25&page=2")
    ).json()) as { data: Record<string, unknown>[]; total: number }

    expect(personasUno.total).toBeGreaterThan(25)
    const idsPrimera = new Set(personasUno.data.map((fila) => fila.id as string))
    expect(personasDos.data.length).toBeGreaterThan(0)
    // Páginas disjuntas: la segunda trae las que la primera no mostraba.
    expect(personasDos.data.every((fila) => !idsPrimera.has(fila.id as string))).toBe(true)
    expect(Object.keys(personasUno.data[0] ?? {}).sort()).toEqual([
      "id",
      "nombreCompleto",
      "rut",
    ])
  })
})
