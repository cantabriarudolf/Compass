// Alerta de reservas (panel del administrador) + regla aditiva de autorización.
//
// Qué prueba, en orden de importancia:
// 1. RETROCOMPATIBILIDAD: un elemento sin `requiereAutorizacion` sigue creando
//    reservas `confirmada` por el mismo camino de siempre, y las reservas que ya
//    existían no cambian de estado por este cambio.
// 2. La reserva de un elemento que SÍ exige autorización nace `solicitada`.
// 3. `/admin/reservas` lista solo lo pendiente y la búsqueda ACOTA por solicitante
//    y por unidad (servidor, no filtro de un arreglo precargado).
// 4. Autorizar → `confirmada`; rechazar → `cancelada` con motivo.
// 5. El portón del servidor: conserjería → `/dashboard`, sin sesión → `/ingresar`.
//
// Los datos llevan prefijo `QA-` y viven en un elemento propio para que
// `npm run e2e:limpiar` los reclame (regla `elementos_ra` + `reservas_ra`).
import { expect, test, type Page } from "@playwright/test"

test.use({ actionTimeout: 30_000 })
test.describe.configure({ timeout: 180_000 })

const PREFIJO_QA = "QA-Alerta-"

/** Mañana en ISO: una reserva futura no dispara penalizaciones de cancelación. */
function fechaManana(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
}

/** Id único por corrida: la suite borra por prefijo, no por id. */
function idUnico(base: string): string {
  return `${base}-${Date.now()}-${Math.round(Math.random() * 1e6)}`
}

interface ElementoQA {
  id: string
  nombre: string
}

interface ReservaQA {
  id: string
  folio: string
  estado: string
  cancelacion?: { motivo?: string } | null
}

interface PersonaQA {
  id: string
  nombreCompleto: string
}

interface UnidadQA {
  id: string
  numero: string
  etiqueta: string
  rolSii?: string
}

/** Etiqueta visible de la unidad: la misma composición que usa el servidor. */
function etiquetaDeUnidad(unidad: UnidadQA): string {
  const base = `${unidad.etiqueta} ${unidad.numero}`.trim()
  return unidad.rolSii?.trim() ? `${base} · ${unidad.rolSii.trim()}` : base
}

/** Elemento reservable de prueba; `requiereAutorizacion` decide el estado inicial. */
async function crearElemento(
  page: Page,
  requiereAutorizacion: boolean
): Promise<ElementoQA> {
  const id = idUnico("ra-el-qa")
  const nombre = `${PREFIJO_QA}${id}`
  const res = await page.request.post("/api/ra/elementos", {
    data: {
      id,
      nombre,
      tipo: "espacio_fisico",
      franja: "dia_completo",
      tarifaUso: 0,
      garantiaRequerida: 0,
      activo: true,
      requiereAutorizacion,
    },
  })
  expect(res.status(), await res.text()).toBe(201)
  const creado = (await res.json()) as { requiereAutorizacion?: boolean }
  // La API acepta el flag de forma aditiva: el elemento guardado lo refleja.
  expect(creado.requiereAutorizacion).toBe(requiereAutorizacion)
  return { id, nombre }
}

/** Alta por el camino existente (POST /api/ra/reservas, el que usa Operaciones). */
async function crearReserva(
  page: Page,
  datos: {
    elementoId: string
    personaId: string
    unidadId: string
    horaInicio: string
    horaFin: string
  }
): Promise<ReservaQA> {
  const res = await page.request.post("/api/ra/reservas", {
    data: {
      id: idUnico("ra-rs-qa"),
      elementoId: datos.elementoId,
      solicitantePersonaId: datos.personaId,
      unidadId: datos.unidadId,
      fecha: fechaManana(),
      horaInicio: datos.horaInicio,
      horaFin: datos.horaFin,
      // Lo que hoy manda Operaciones al confirmar una reserva.
      estado: "confirmada",
    },
  })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()) as ReservaQA
}

/** Detalle por id: la fuente de verdad de la transición de estado. */
async function detalleReserva(page: Page, id: string): Promise<ReservaQA> {
  const res = await page.request.get(`/api/ra/reservas/${id}`)
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as ReservaQA
}

/** Mapa id → estado de las reservas visibles (para probar que nadie se movió). */
async function estadosActuales(page: Page): Promise<Record<string, string>> {
  const res = await page.request.get("/api/ra/reservas?pageSize=100")
  expect(res.status(), await res.text()).toBe(200)
  const coleccion = (await res.json()) as {
    data: { id: string; estado: string }[]
  }
  return Object.fromEntries(coleccion.data.map((r) => [r.id, r.estado]))
}

/** Persona y unidad del padrón: la búsqueda del panel debe encontrarlas. */
async function padron(page: Page): Promise<{ personas: PersonaQA[]; unidades: UnidadQA[] }> {
  const personasRes = await page.request.get("/api/personas?pageSize=5")
  expect(personasRes.status()).toBe(200)
  const personas = ((await personasRes.json()) as { data: PersonaQA[] }).data
  const unidadesRes = await page.request.get("/api/unidades?pageSize=5")
  expect(unidadesRes.status()).toBe(200)
  const unidades = ((await unidadesRes.json()) as { data: UnidadQA[] }).data
  expect(personas.length).toBeGreaterThan(1)
  expect(unidades.length).toBeGreaterThan(1)
  return { personas, unidades }
}

/**
 * Lista de solicitudes del panel.
 *
 * Scoping deliberado: el sidebar también son `<ul>/<li>`, así que se ancla a la
 * lista por su nombre accesible en vez de barrer todos los listitem de la página.
 */
function listaDeSolicitudes(page: Page) {
  return page.getByRole("list", { name: "Solicitudes por autorizar" })
}

/** Filtra el panel por solicitante con el combobox canónico (búsqueda al servidor). */async function filtrarPorSolicitante(page: Page, nombre: string): Promise<void> {
  const campo = page.getByRole("combobox", { name: "Solicitante" })
  await campo.fill(nombre)
  await page.getByRole("option", { name: nombre, exact: true }).first().click()
}

/** Filtra el panel por unidad de la misma forma (busca por rol SII o número). */
async function filtrarPorUnidad(page: Page, unidad: UnidadQA): Promise<void> {
  const campo = page.getByRole("combobox", { name: "Unidad" })
  // El término tiene que ser algo que el servidor sepa buscar (`numero`,
  // `etiqueta` o `rolSii`), no la etiqueta compuesta que se muestra.
  await campo.fill(unidad.rolSii?.trim() || unidad.numero)
  await page
    .getByRole("option", { name: etiquetaDeUnidad(unidad), exact: true })
    .first()
    .click()
}

test.describe("Alerta de reservas — regla aditiva y panel del administrador", () => {
  test("solo el elemento que exige autorización nace solicitada", async ({ page }) => {
    const antes = await estadosActuales(page)

    const exige = await crearElemento(page, true)
    const libre = await crearElemento(page, false)
    const { personas, unidades } = await padron(page)
    const persona = personas[0]!
    const unidad = unidades[0]!

    const solicitada = await crearReserva(page, {
      elementoId: exige.id,
      personaId: persona.id,
      unidadId: unidad.id,
      horaInicio: "08:00",
      horaFin: "09:00",
    })
    // El estado inicial lo decide el servidor, no el cliente.
    expect(solicitada.estado).toBe("solicitada")

    const confirmada = await crearReserva(page, {
      elementoId: libre.id,
      personaId: persona.id,
      unidadId: unidad.id,
      horaInicio: "10:00",
      horaFin: "11:00",
    })
    // Retrocompatibilidad: mismo payload de siempre → mismo resultado de siempre.
    expect(confirmada.estado).toBe("confirmada")

    // Ninguna reserva previa cambió de estado con este cambio.
    const despues = await estadosActuales(page)
    for (const [id, estado] of Object.entries(antes)) {
      expect(despues[id], `la reserva previa ${id} cambió de estado`).toBe(estado)
    }
  })

  test("el panel acota la búsqueda y autoriza una solicitud", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const exige = await crearElemento(page, true)
    const { personas, unidades } = await padron(page)
    const [personaA, personaB] = [personas[0]!, personas[1]!]
    const [unidadA, unidadB] = [unidades[0]!, unidades[1]!]

    const solicitudA = await crearReserva(page, {
      elementoId: exige.id,
      personaId: personaA.id,
      unidadId: unidadA.id,
      horaInicio: "08:00",
      horaFin: "09:00",
    })
    const solicitudB = await crearReserva(page, {
      elementoId: exige.id,
      personaId: personaB.id,
      unidadId: unidadB.id,
      horaInicio: "10:00",
      horaFin: "11:00",
    })

    await page.goto("/admin/reservas")
    await expect(
      page.getByRole("heading", { name: "Reservas por autorizar" })
    ).toBeVisible({ timeout: 20_000 })

    const tarjetas = listaDeSolicitudes(page).getByRole("listitem")
    const tarjetaA = tarjetas.filter({ hasText: solicitudA.folio })
    const tarjetaB = tarjetas.filter({ hasText: solicitudB.folio })
    await expect(tarjetaA).toBeVisible({ timeout: 20_000 })
    await expect(tarjetaB).toBeVisible()

    // La tarjeta muestra quién pide, para qué unidad, qué elemento, cuándo y cuánto.
    await expect(tarjetaA).toContainText(personaA.nombreCompleto)
    await expect(tarjetaA).toContainText(etiquetaDeUnidad(unidadA))
    await expect(tarjetaA).toContainText(exige.nombre)

    // Acota por solicitante: la solicitud de la otra persona desaparece.
    await filtrarPorSolicitante(page, personaA.nombreCompleto)
    await expect(tarjetaB).toHaveCount(0)
    await expect(tarjetaA).toBeVisible()
    for (const texto of await tarjetas.allTextContents()) {
      expect(texto).toContain(personaA.nombreCompleto)
    }

    // Acota por unidad: ahora la solicitud de la unidad A es la única visible.
    await page.getByRole("button", { name: "Quitar selección" }).click()
    await filtrarPorUnidad(page, unidadA)
    await expect(tarjetaB).toHaveCount(0)
    await expect(tarjetaA).toBeVisible()
    for (const texto of await tarjetas.allTextContents()) {
      expect(texto).toContain(etiquetaDeUnidad(unidadA))
    }

    // Autorizar: la tarjeta sale de la lista de pendientes y la reserva queda confirmada.
    await page
      .getByRole("button", { name: `Autorizar la reserva ${solicitudA.folio}` })
      .click()
    await expect(page.getByRole("status")).toContainText(solicitudA.folio)
    await expect(tarjetaA).toHaveCount(0, { timeout: 20_000 })
    expect((await detalleReserva(page, solicitudA.id)).estado).toBe("confirmada")
    // La otra solicitud sigue pendiente: autorizar no toca a las demás.
    expect((await detalleReserva(page, solicitudB.id)).estado).toBe("solicitada")

    expect(errores, "Excepciones no capturadas en /admin/reservas").toEqual([])
  })

  test("el panel rechaza una solicitud y guarda el motivo", async ({ page }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const exige = await crearElemento(page, true)
    const { personas, unidades } = await padron(page)
    const persona = personas[0]!
    const unidad = unidades[0]!
    const motivo = "QA-Sin disponibilidad del recinto en ese horario."

    const solicitud = await crearReserva(page, {
      elementoId: exige.id,
      personaId: persona.id,
      unidadId: unidad.id,
      horaInicio: "12:00",
      horaFin: "13:00",
    })

    await page.goto("/admin/reservas")
    await expect(
      page.getByRole("heading", { name: "Reservas por autorizar" })
    ).toBeVisible({ timeout: 20_000 })

    const tarjeta = listaDeSolicitudes(page)
      .getByRole("listitem")
      .filter({ hasText: solicitud.folio })
    await expect(tarjeta).toBeVisible({ timeout: 20_000 })
    await filtrarPorUnidad(page, unidad)
    await expect(tarjeta).toBeVisible()

    await page
      .getByRole("button", { name: `Rechazar la reserva ${solicitud.folio}` })
      .click()

    const dialogo = page.getByRole("dialog")
    await expect(
      dialogo.getByRole("heading", { name: "Rechazar reserva" })
    ).toBeVisible()
    await dialogo.getByLabel("Motivo del rechazo").fill(motivo)
    await dialogo.getByRole("button", { name: "Confirmar rechazo" }).click()

    // El diálogo se cierra solo cuando el rechazo se guardó. Esperar el `count`
    // de la tarjeta sería una trampa: con el modal abierto el resto de la página
    // queda `aria-hidden` y cualquier locator por rol devuelve 0 al instante.
    await expect(dialogo).toBeHidden({ timeout: 20_000 })
    await expect(page.getByRole("status")).toContainText(solicitud.folio)

    const rechazada = await detalleReserva(page, solicitud.id)
    expect(rechazada.estado).toBe("cancelada")
    expect(rechazada.cancelacion?.motivo).toBe(motivo)
    await expect(tarjeta).toHaveCount(0)

    expect(errores, "Excepciones no capturadas en /admin/reservas").toEqual([])
  })
})

test.describe("Alerta de reservas — portón del servidor", () => {
  test("administrador entra al panel", async ({ page }) => {
    const respuesta = await page.goto("/admin/reservas")
    expect(respuesta?.status()).toBe(200)
    await expect(
      page.getByRole("heading", { name: "Reservas por autorizar" })
    ).toBeVisible({ timeout: 20_000 })
    // El menú del administrador ofrece la entrada nueva junto a Elementos.
    await expect(
      page.getByRole("link", { name: "Alerta de reservas" })
    ).toBeVisible()
  })
})

test.describe("Alerta de reservas — conserjería", () => {
  test.use({ storageState: "e2e/.auth/conserjeria.json" })

  test("conserjería no entra al panel del administrador", async ({ page }) => {
    await page.goto("/admin/reservas")
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
  })
})

test.describe("Alerta de reservas — sin sesión", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("anónimo va a /ingresar", async ({ page }) => {
    await page.goto("/admin/reservas")
    await expect(page).toHaveURL(/\/ingresar/, { timeout: 30_000 })
  })
})
