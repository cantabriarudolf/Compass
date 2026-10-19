// AD — poda de gobernanza por pérdida del rol directiva, por el camino REAL de
// la UI (formulario de persona en /comunidad/personas). Hoy el fix del change
// `ad-audit-poda-gobernanza` solo tenía cobertura de API; este spec cierra el
// camino del formulario: quitar el rol `directiva` debe (a) fijar
// `datosGobernanza = null` en BD y (b) emitir UN evento de auditoría
// `AD_DIRECTIVA_DESVINCULADA` con el `comunidadId` correcto. El caso negativo
// prueba que conservar el rol NO poda ni audita.
//
// Nota de out-of-band: la pestaña "Gobernanza" de la ficha solo se renderiza si
// `persona.roles.includes("directiva")` (app/comunidad/personas/[id]/page.tsx:437),
// así que tras la poda la UI esconde la pestaña entera y su empty state queda
// inalcanzable. Por eso la desaparición de la ficha se verifica leyendo la API
// (GET /api/personas/[id]) y la UI solo confirma la señal visible: la pestaña ya
// no existe.
import { expect, test } from "@playwright/test"
import {
  crearPersonaTEST,
  hoyISOTEST,
  limpiarPersonaTEST,
} from "../helpers/datos-test"
import { guardarDialogo } from "../helpers/form-dialog"

test.use({ actionTimeout: 30_000 })

type FilaPersonaAPI = {
  id: string
  comunidadId: string
  datosGobernanza: { cargoDirectiva: string } | null
}

type EventoAuditoriaAPI = {
  tipoAccion: string
  referenciaId: string
  comunidadId: string
}

async function leerPersona(
  request: import("@playwright/test").APIRequestContext,
  id: string
): Promise<FilaPersonaAPI> {
  const res = await request.get(`/api/personas/${id}`)
  expect(res.ok(), `GET /api/personas/${id} debe responder`).toBe(true)
  return (await res.json()) as FilaPersonaAPI
}

async function eventosPodaDe(
  request: import("@playwright/test").APIRequestContext,
  personaId: string,
  comunidadId: string
): Promise<EventoAuditoriaAPI[]> {
  const res = await request.get(
    `/api/auditoria?tipoAccion=AD_DIRECTIVA_DESVINCULADA&q=${encodeURIComponent(personaId)}&comunidadId=${encodeURIComponent(comunidadId)}&pageSize=100`
  )
  expect(res.ok(), "GET /api/auditoria debe responder").toBe(true)
  const json = (await res.json()) as { eventos?: EventoAuditoriaAPI[] }
  return (json.eventos ?? []).filter((e) => e.referenciaId === personaId)
}

test.describe("MP — quitar rol directiva poda la gobernanza y audita (AD)", () => {
  test.use({ storageState: "e2e/.auth/admin.json" })

  test("la UI poda la ficha y emite AD_DIRECTIVA_DESVINCULADA; conservar el rol no", async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000)
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    const ts = Date.now()
    const sufijo = String(ts).slice(-6)
    const nombrePoda = `TEST Gobernanza ${sufijo}`
    const nombreConserva = `TEST Gobernanza Conserva ${sufijo}`

    let personaPodaId: string | undefined
    let personaConservaId: string | undefined

    try {
      // 1) Fixture propia (no se toca el seed): rol directiva + ficha real.
      //    `datosGobernanza` siempre objeto — el schema lo declara .optional(),
      //    no nullable (lib/schemas.ts:541).
      const personaPoda = await crearPersonaTEST(request, "gob", ts, {
        roles: ["residente", "directiva"],
        // nombreCompleto explícito: el helper lo defaultea a `TEST P1 <prefix> <ts>`
        // y el aria-label de editar usa `nombres + apellidos`; alinearlos evita
        // que la ficha muestre un nombre distinto al buscado.
        nombreCompleto: nombrePoda,
        nombres: "TEST",
        apellidos: `Gobernanza ${sufijo}`,
        datosGobernanza: {
          id: `gob-${ts}`,
          cargoDirectiva: "presidente",
          fechaAsuncion: hoyISOTEST(),
        },
      })
      personaPodaId = personaPoda.id

      const filaInicial = await leerPersona(request, personaPodaId)
      const comunidadId = filaInicial.comunidadId
      expect(
        filaInicial.datosGobernanza,
        "la fixture debe traer ficha de gobernanza"
      ).toBeTruthy()

      // 2) Precondición UI: la pestaña Gobernanza muestra el cargo de la ficha.
      await page.goto(`/comunidad/personas/${personaPodaId}`)
      await expect(
        page.getByRole("heading", { name: nombrePoda })
      ).toBeVisible({ timeout: 30_000 })
      const tabGobernanza = page.getByRole("tab", { name: /Gobernanza/ })
      await expect(tabGobernanza).toBeVisible({ timeout: 15_000 })
      await tabGobernanza.click()
      await expect(page.getByText("Cargo Directivo")).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByText("presidente", { exact: true })).toBeVisible()

      // 3) Acción por la UI: abrir el formulario y quitar el rol directiva.
      await page.goto("/comunidad/personas")
      await expect(
        page.getByRole("heading", { name: "Directorio de Comunidad" })
      ).toBeVisible({ timeout: 30_000 })
      await page
        .getByPlaceholder("Buscar por nombre o RUT...")
        .fill(nombrePoda)
      const btnEditar = page.getByRole("button", {
        name: `Editar ${nombrePoda}`,
      })
      await expect(btnEditar).toBeVisible({ timeout: 20_000 })
      await btnEditar.click()

      const dialog = page.getByRole("dialog")
      await expect(
        dialog.getByRole("heading", { name: "Editar Identidad" })
      ).toBeVisible({ timeout: 15_000 })
      const chkDirectiva = dialog.getByRole("checkbox", { name: "directiva" })
      await expect(chkDirectiva).toBeChecked()
      await chkDirectiva.click()
      await expect(chkDirectiva).not.toBeChecked()

      const btnGuardar = dialog.getByRole("button", { name: "Guardar Cambios" })
      // Single-shot idempotente (helper form-dialog): la edición se verifica
      // out-of-band vía API (poda en BD), no por fila; sin `fila` no hay
      // reenvío a ciegas.
      await guardarDialogo(page, { boton: btnGuardar, dialogo: dialog, timeoutMs: 20_000 })

      // 4a) Poda en BD (out-of-band: la pestaña se oculta con el rol).
      await expect
        .poll(
          async () => (await leerPersona(request, personaPodaId!)).datosGobernanza,
          { timeout: 15_000 }
        )
        .toBeNull()

      // 4b) Señal visible: la pestaña Gobernanza ya no existe en la ficha.
      await page.goto(`/comunidad/personas/${personaPodaId}`)
      await expect(
        page.getByRole("heading", { name: nombrePoda })
      ).toBeVisible({ timeout: 30_000 })
      await expect(
        page.getByRole("tab", { name: /Gobernanza/ })
      ).toHaveCount(0)

      // 5a) Auditoría por API: exactamente UN evento con el comunidadId correcto.
      const eventosPoda = await eventosPodaDe(
        request,
        personaPodaId,
        comunidadId
      )
      expect(eventosPoda).toHaveLength(1)
      expect(eventosPoda[0]!.tipoAccion).toBe("AD_DIRECTIVA_DESVINCULADA")
      expect(eventosPoda[0]!.comunidadId).toBe(comunidadId)

      // 5b) Auditoría visible en la UI (/admin/logs): la referencia es el id.
      await page.goto("/admin/logs")
      await expect(
        page.getByRole("heading", { name: "Logs de Auditoría" })
      ).toBeVisible({ timeout: 30_000 })
      await page.getByLabel("Buscar eventos").fill(personaPodaId)
      await expect
        .poll(
          async () =>
            page
              .getByRole("cell")
              .filter({ hasText: "AD_DIRECTIVA_DESVINCULADA" })
              .count(),
          { timeout: 25_000, intervals: [500] }
        )
        .toBeGreaterThanOrEqual(1)
      await expect(
        page.getByRole("cell").filter({ hasText: personaPodaId! })
      ).not.toHaveCount(0)

      // 6) Caso negativo: conservar directiva NO poda ni audita.
      const personaConserva = await crearPersonaTEST(request, "gob-neg", ts, {
        roles: ["directiva"],
        nombreCompleto: nombreConserva,
        nombres: "TEST",
        apellidos: `Gobernanza Conserva ${sufijo}`,
        datosGobernanza: {
          id: `gob-neg-${ts}`,
          cargoDirectiva: "tesorero",
          fechaAsuncion: hoyISOTEST(),
        },
      })
      personaConservaId = personaConserva.id

      await page.goto("/comunidad/personas")
      await expect(
        page.getByRole("heading", { name: "Directorio de Comunidad" })
      ).toBeVisible({ timeout: 30_000 })
      await page
        .getByPlaceholder("Buscar por nombre o RUT...")
        .fill(nombreConserva)
      const btnEditarConserva = page.getByRole("button", {
        name: `Editar ${nombreConserva}`,
      })
      await expect(btnEditarConserva).toBeVisible({ timeout: 20_000 })
      await btnEditarConserva.click()

      const dialogConserva = page.getByRole("dialog")
      await expect(
        dialogConserva.getByRole("heading", { name: "Editar Identidad" })
      ).toBeVisible({ timeout: 15_000 })
      // Edición real que conserva directiva: agrega residente.
      const chkResidente = dialogConserva.getByRole("checkbox", {
        name: "residente",
      })
      await expect(chkResidente).not.toBeChecked()
      await chkResidente.click()
      await expect(chkResidente).toBeChecked()
      await expect(
        dialogConserva.getByRole("checkbox", { name: "directiva" })
      ).toBeChecked()

      const btnGuardarConserva = dialogConserva.getByRole("button", {
        name: "Guardar Cambios",
      })
      // Single-shot idempotente (helper form-dialog): conservar el rol se
      // verifica out-of-band vía API; sin `fila` no hay reenvío a ciegas.
      await guardarDialogo(page, {
        boton: btnGuardarConserva,
        dialogo: dialogConserva,
        timeoutMs: 20_000,
      })

      // Ficha intacta en BD.
      await expect
        .poll(
          async () =>
            (await leerPersona(request, personaConservaId!)).datosGobernanza
              ?.cargoDirectiva ?? null,
          { timeout: 15_000 }
        )
        .toBe("tesorero")

      // La ficha sigue visible en el perfil.
      await page.goto(`/comunidad/personas/${personaConservaId}`)
      await expect(
        page.getByRole("heading", { name: nombreConserva })
      ).toBeVisible({ timeout: 30_000 })
      const tabGobernanzaConserva = page.getByRole("tab", {
        name: /Gobernanza/,
      })
      await expect(tabGobernanzaConserva).toBeVisible({ timeout: 15_000 })
      await tabGobernanzaConserva.click()
      await expect(page.getByText("tesorero", { exact: true })).toBeVisible({
        timeout: 15_000,
      })

      // Ningún evento de poda para quien conservó el rol.
      const eventosConserva = await eventosPodaDe(
        request,
        personaConservaId,
        comunidadId
      )
      expect(eventosConserva).toHaveLength(0)

      expect(errores, "Excepciones no capturadas en comunidad/personas").toEqual(
        []
      )
    } finally {
      // Cleanup idempotente. El evento de auditoría del caso positivo es
      // inmutable por diseño y no se puede borrar: queda como pista de auditoría
      // (referencia al id TEST ya eliminado). La re-ejecución sigue limpia porque
      // cada corrida filtra por su propio id único.
      if (personaPodaId) await limpiarPersonaTEST(request, personaPodaId)
      if (personaConservaId) await limpiarPersonaTEST(request, personaConservaId)
    }
  })
})
