// e2e/crud/descargas-documentos.spec.ts
//
// Las dos descargas de documentos ya existentes, probadas con un CLIC real en un
// navegador (F27 aviso de cobro + T10 liquidación de sueldo).
//
// Por qué este archivo: la ruta que sirve cada papel y su botón ya estaban
// probados por API (`test/api/permisos-por-objeto.test.ts` afirma
// `application/pdf`, el nombre de `Content-Disposition` y la cabecera `%PDF-`) y
// por componente (jsdom), pero nadie había hecho clic en el enlace de la fila.
// Un `href` mal armado, un `download` que el navegador no honra o una ruta que
// responde JSON en vez de binario pasaban inadvertidos: el smoke sólo prueba que
// las dos pantallas renderizan.
//
// Qué se verifica, con una sesión real y en orden:
//   1. `/comunidad/avisos-cobro` → el enlace de la fila del aviso baja
//      `aviso-cobro-<folio>.pdf`, con bytes y cabecera `%PDF-`.
//   2. `/comunidad/mis-liquidaciones` → el enlace de la fila de la liquidación
//      baja `liquidacion-<periodo>-<folio>.pdf`, con las mismas condiciones.
//   3. Ninguna de las dos pantallas lanza una excepción JS (`pageerror`).
//
// Por qué la sesión del ADMINISTRADOR para los dos flujos y no dos sesiones: las
// dos pantallas abren con el portón de la matriz y el alcance por FILA lo
// resuelve el servidor; la administración (`fi:gasto_comun` ver y `pl` ver) lee
// las filas de toda la comunidad, así que una sola sesión —la canónica de
// `e2e/auth.setup.ts`, sin inventar un segundo camino de login— cubre los dos
// documentos. El residente bajando SU aviso ya está cubierto, y no se repite, en
// `e2e/crud/avisos-cobro.spec.ts`.
//
// Setup (sólo por las rutas que usan los demás specs, nunca SQL ni mocks):
//   - el período con emisión de gasto común y el aviso, con el helper
//     `asegurarPeriodoParaAvisos` + `POST /api/avisos-cobro` acotado a la unidad;
//   - el trabajador, con `crearTrabajadorTEST` (helper compartido: maestros
//     legales, parámetros CF y ficha PE), y la liquidación con
//     `POST /api/liquidaciones`.
// La unidad avisada es una donde el residente del seed es propietario VIGENTE:
// es la precondición real de la emisión de GC (exige responsable por unidad), y
// se resuelve con la identidad del propio residente, no eligiendo una unidad a
// ciegas. Su contexto se usa SÓLO para eso y se cierra enseguida.
//
// Limpieza: este spec no borra nada a mano, y no debe hacerlo. La lane purga
// antes de cada corrida (`scripts/limpiar-e2e.mjs --apply` desde `globalSetup`)
// las filas que este spec crea: `liquidaciones_pl` con
// `trabajadorPersonaId LIKE 'test-%'` y la persona `test-…` del helper. El aviso
// emitido no lo borra nadie porque un aviso emitido NO se reemplaza (Ley 21.442
// art. 32): el helper elige un período libre en cada corrida, igual que
// `avisos-cobro.spec.ts`, así que la corrida siguiente no choca con el 409.
import fs from "node:fs"
import {
  expect,
  test,
  type Download,
  type Locator,
  type Page,
} from "@playwright/test"
import {
  asegurarPeriodoParaAvisos,
  avisosDeUnidad,
  personaIdPropia,
  unidadesComoPropietario,
} from "../helpers/avisos-cobro"
import { crearTrabajadorTEST } from "../helpers/datos-test"

const AUTH_RESIDENTE = "e2e/.auth/residente.json"

/**
 * Período del documento PL. Fijo y futuro: el trabajador es NUEVO en cada
 * corrida (`test-descargas-trab-<ts>`), así que el único + período del POST no
 * puede chocar nunca, y el folio correlativo (`LIQ-####`) sale del servidor.
 */
const PERIODO_LIQUIDACION = "2027-01"

/**
 * Piso de bytes del archivo descargado. Un PDF de una carilla (pdfmake, fuentes
 * embebidas) pesa varios KB; un cuerpo JSON de error o un archivo vacío no
 * llega ni cerca. No se afirma un tamaño exacto: el papel no lo promete.
 */
const PISO_BYTES_PDF = 1_000

/** Cabecera que distingue un PDF de cualquier otra respuesta (`%PDF-`). */
const CABECERA_PDF = "%PDF-"

type ArchivoDescargado = { nombre: string; bytes: Buffer }

/**
 * Clic en un enlace `download` y lectura del archivo que el SERVIDOR sirvió.
 *
 * La espera del evento va junto al clic (`Promise.all`): el enlace apunta a
 * `GET /api/<recurso>/<id>/pdf`, que responde `attachment`, así que el clic baja
 * el archivo en vez de navegar. Si la ruta falla, el evento `download` no llega
 * y el motivo queda en el timeout con el nombre del enlace en el mensaje.
 */
async function descargarDesde(
  page: Page,
  enlace: Locator,
  etiqueta: string,
): Promise<ArchivoDescargado> {
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    enlace.click(),
  ])
  const archivo: Download = descarga
  const ruta = await archivo.path()
  expect(
    ruta,
    `${etiqueta}: la descarga debe dejar el archivo en disco`,
  ).toBeTruthy()
  return {
    nombre: archivo.suggestedFilename(),
    bytes: fs.readFileSync(ruta as string),
  }
}

/** Un PDF de verdad: el nombre que impone el servidor, bytes y cabecera. */
function afirmarPdf(
  descargado: ArchivoDescargado,
  nombreEsperado: string,
  etiqueta: string,
): void {
  expect(
    descargado.nombre,
    `${etiqueta}: el nombre sale de Content-Disposition, no del cliente`,
  ).toBe(nombreEsperado)
  expect(
    descargado.bytes.length,
    `${etiqueta}: el documento descargado no puede estar vacío`,
  ).toBeGreaterThan(PISO_BYTES_PDF)
  expect(
    descargado.bytes.subarray(0, 5).toString("latin1"),
    `${etiqueta}: el archivo descargado debe ser un PDF (cabecera ${CABECERA_PDF})`,
  ).toBe(CABECERA_PDF)
}

test.use({ storageState: "e2e/.auth/admin.json", actionTimeout: 30_000 })
test.setTimeout(300_000)

test.describe("Descargas — aviso de cobro y liquidación de sueldo", () => {
  test("la fila del aviso y la de la liquidación bajan su PDF desde la pantalla", async ({
    page,
    browser,
  }) => {
    const errores: string[] = []
    page.on("pageerror", (err) => errores.push(err.message))

    // ── 0. La unidad avisada: una donde el residente es propietario vigente ─
    // La emisión de GC rechaza la corrida si alguna unidad objetivo no tiene
    // responsable (propietario con vínculo vigente), así que la unidad sale de
    // los vínculos del propio residente y no de una lista a ciegas.
    const contextoResidente = await browser.newContext({
      storageState: AUTH_RESIDENTE,
    })
    let unidadId = ""
    try {
      // La identidad sale de la sesión del propio residente (`/api/mis-datos`,
      // el ARCO que el residente sí puede leer) y sus unidades, del padrón de
      // vínculos, que sólo la administración puede listar: por eso esa lectura
      // va con el request del admin, igual que en `avisos-cobro.spec.ts`.
      const personaId = await personaIdPropia(contextoResidente.request)
      const unidades = await unidadesComoPropietario(page.request, personaId)
      // La emisión no reparte estacionamientos (`u-E-*`): se prefiere una unidad
      // que sí entra en el reparto, igual que `avisos-cobro.spec.ts`.
      unidadId = unidades.find((u) => !u.startsWith("u-E-")) ?? ""
      expect(
        unidadId,
        "el residente del seed debe ser propietario vigente de una unidad que entre en la emisión de GC",
      ).not.toBe("")
    } finally {
      await contextoResidente.close()
    }

    // ── 1. Aviso de cobro: período + aviso emitidos por API, clic en la fila ──
    const preparado = await asegurarPeriodoParaAvisos(page.request, unidadId)
    const periodoAviso = preparado.periodo

    // Acotado a la unidad: el período puede venir de una emisión del seed que
    // repartió varias, y acá se necesita UNA fila determinista. Es la misma ruta
    // que dispara el botón de la pantalla de emisión.
    const altaAviso = await page.request.post("/api/avisos-cobro", {
      data: { periodo: periodoAviso, unidadId },
    })
    const textoAltaAviso = await altaAviso.text()
    expect(
      altaAviso.ok(),
      `POST /api/avisos-cobro debe emitir el aviso de ${periodoAviso}: ${altaAviso.status()} ${textoAltaAviso.slice(0, 300)}`,
    ).toBe(true)

    const avisos = await avisosDeUnidad(page.request, unidadId)
    const aviso = avisos.find((a) => a.periodo === periodoAviso)
    expect(
      aviso,
      `el aviso de la unidad ${unidadId} del período ${periodoAviso} debe existir en la base`,
    ).toBeTruthy()
    const avisoEmitido = aviso as { id: string; folio: string; periodo: string }
    expect(
      avisoEmitido.folio,
      "el aviso nace con folio AC-#### asignado por el servidor",
    ).toMatch(/^AC-\d{4}$/)

    await page.goto("/comunidad/avisos-cobro")
    await expect(
      page.getByRole("heading", { name: /Avisos de Cobro/ }),
    ).toBeVisible({ timeout: 60_000 })

    const filaAviso = page.getByRole("row").filter({ hasText: avisoEmitido.folio })
    await expect(
      filaAviso,
      `la pantalla debe ofrecer la fila del aviso ${avisoEmitido.folio}`,
    ).toHaveCount(1, { timeout: 60_000 })

    const enlaceAviso = filaAviso.getByRole("link", {
      name: `Descargar el PDF del aviso ${avisoEmitido.folio} (período ${periodoAviso})`,
    })
    // El enlace apunta al aviso de ESTA fila: el `id` del papel emitido es lo
    // único que entra en la URL (el alcance lo resuelve el servidor).
    await expect(enlaceAviso).toHaveAttribute(
      "href",
      `/api/avisos-cobro/${avisoEmitido.id}/pdf`,
    )
    await expect(enlaceAviso).toBeEnabled({ timeout: 30_000 })

    afirmarPdf(
      await descargarDesde(page, enlaceAviso, "aviso de cobro"),
      `aviso-cobro-${avisoEmitido.folio}.pdf`,
      "aviso de cobro",
    )
    expect(
      errores,
      "Excepciones no capturadas en /comunidad/avisos-cobro",
    ).toEqual([])

    // ── 2. Liquidación: trabajador + liquidación por API, clic en la fila ────
    const ts = Date.now()
    const trabajador = await crearTrabajadorTEST(page.request, "descargas", ts)

    const altaLiquidacion = await page.request.post("/api/liquidaciones", {
      data: {
        trabajadorPersonaId: trabajador.id,
        periodo: PERIODO_LIQUIDACION,
        diasTrabajados: 30,
      },
    })
    const textoAltaLiquidacion = await altaLiquidacion.text()
    expect(
      altaLiquidacion.ok(),
      `POST /api/liquidaciones debe generar el documento: ${altaLiquidacion.status()} ${textoAltaLiquidacion.slice(0, 300)}`,
    ).toBe(true)
    const liquidacion = JSON.parse(textoAltaLiquidacion) as {
      id: string
      folio: string
      periodo: string
    }
    expect(
      liquidacion.folio,
      "la liquidación nace con folio LIQ-#### asignado por el servidor",
    ).toMatch(/^LIQ-\d{4}$/)
    expect(liquidacion.periodo).toBe(PERIODO_LIQUIDACION)

    await page.goto("/comunidad/mis-liquidaciones")
    await expect(
      page.getByRole("heading", { name: /Liquidaciones de Sueldo/ }),
    ).toBeVisible({ timeout: 60_000 })

    const filaLiquidacion = page
      .getByRole("row")
      .filter({ hasText: liquidacion.folio })
    await expect(
      filaLiquidacion,
      `la pantalla debe ofrecer la fila de la liquidación ${liquidacion.folio}`,
    ).toHaveCount(1, { timeout: 60_000 })

    const enlaceLiquidacion = filaLiquidacion.getByRole("link", {
      name: `Descargar el PDF de la liquidación ${liquidacion.folio} (período ${liquidacion.periodo})`,
    })
    await expect(enlaceLiquidacion).toHaveAttribute(
      "href",
      `/api/liquidaciones/${liquidacion.id}/pdf`,
    )
    await expect(enlaceLiquidacion).toBeEnabled({ timeout: 30_000 })

    afirmarPdf(
      await descargarDesde(page, enlaceLiquidacion, "liquidación"),
      `liquidacion-${liquidacion.periodo}-${liquidacion.folio}.pdf`,
      "liquidación",
    )
    expect(
      errores,
      "Excepciones no capturadas en /comunidad/mis-liquidaciones",
    ).toEqual([])

    // ── 3. Ninguna de las dos pantallas lanzó una excepción JS ──────────────
    expect(
      errores,
      "Excepciones no capturadas en las dos pantallas de descarga",
    ).toEqual([])
  })
})
