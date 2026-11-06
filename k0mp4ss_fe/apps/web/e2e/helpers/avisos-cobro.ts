// Helper compartido del aviso de cobro para specs E2E (serie aviso-de-cobro).
//
// Qué resuelve: el flujo del aviso arranca SIEMPRE en un período que ya tiene
// emisión de gasto común (`POST /api/avisos-cobro` responde 409 sin ella) y que
// todavía no tiene avisos emitidos (un aviso emitido no se reemplaza). Este
// helper deja esa precondición resuelta por la vía que usan los demás specs:
// setup por API REST con la sesión ya autenticada (mismo criterio que
// `datos-test.ts`), nunca por SQL ni leyendo la base.
//
// Orden de preferencia (para no inventar datos cuando el seed alcanza):
//   1. una emisión del seed cuyo período todavía no tiene avisos y que cubre la
//      unidad que se va a avisar;
//   2. si ninguna sirve, se emite el gasto común de un período libre ACOTADO a
//      esa unidad (`POST /api/emisiones-gc`), que es la misma ruta que usa la
//      pantalla «Emisión GC». Ojo: el aviso emitido NO se puede borrar (409 por
//      diseño, Ley 21.442 art. 32), así que la corrida siguiente elige el
//      período libre siguiente en vez de reusar el que ya quedó avisado.
//
// Emitir exige una versión del reglamento con fuente real (compuerta S1), y
// desde F35 A4 · S9 esa versión nueva apunta al documento `legal` del archivo
// de la comunidad que la respalda (`documentoId`), no a un `actaRef` suelto: por
// eso el branch de emisión deja también esa acta en el archivo, con id estable y
// sin duplicar (lo legal es append-only: un POST repetido responde 409).
//
// Nada de esto crea personas, vínculos ni unidades: usa los del seed.
import { expect, type APIRequestContext } from "@playwright/test"

/** Gasto total con el que se emite un período cuando el seed no trae uno libre. */
const GASTO_TOTAL_EMISION_TEST = 1_000_000

/** Tope de páginas al recorrer una colección (pageSize máximo del factory: 100). */
const MAX_PAGINAS = 20

const FORMATO_PERIODO = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/

type Pagina<T> = { data?: T[]; total?: number }

/** GET JSON que exige respuesta OK y devuelve el cuerpo con su mensaje real. */
async function jsonDe<T>(
  request: APIRequestContext,
  ruta: string,
): Promise<Pagina<T>> {
  const res = await request.get(ruta)
  const texto = await res.text()
  expect(
    res.ok(),
    `GET ${ruta} debe responder: ${res.status()} ${texto.slice(0, 300)}`,
  ).toBe(true)
  return JSON.parse(texto) as Pagina<T>
}

/** Recorre la colección paginada completa (el factory tope en 100 por página). */
async function coleccionCompleta<T>(
  request: APIRequestContext,
  ruta: string,
): Promise<T[]> {
  const items: T[] = []
  const separador = ruta.includes("?") ? "&" : "?"
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const pagina = await jsonDe<T>(
      request,
      `${ruta}${separador}page=${page}&pageSize=100`,
    )
    const fila = pagina.data ?? []
    items.push(...fila)
    if (fila.length < 100) break
    if (typeof pagina.total === "number" && items.length >= pagina.total) break
  }
  return items
}

/** personaId de la cuenta autenticada (`/api/mis-datos`, el mismo ARCO del residente). */
export async function personaIdPropia(request: APIRequestContext): Promise<string> {
  const res = await request.get("/api/mis-datos")
  const texto = await res.text()
  expect(
    res.ok(),
    `GET /api/mis-datos debe responder: ${res.status()} ${texto.slice(0, 300)}`,
  ).toBe(true)
  const cuerpo = JSON.parse(texto) as { persona?: { id?: string } }
  const personaId = cuerpo.persona?.id
  expect(personaId, "la cuenta autenticada debe tener ficha de persona").toBeTruthy()
  return personaId as string
}

type VinculoFila = {
  personaId?: string
  unidadId?: string
  rol?: string
  fechaFin?: string | null
}

/**
 * Unidades donde la persona es propietaria VIGENTE (`fechaFin` nulo): es
 * exactamente el destinatario que exige la entrega del aviso (S3), así que un
 * aviso de estas unidades siempre tiene a quién entregarse.
 */
export async function unidadesComoPropietario(
  request: APIRequestContext,
  personaId: string,
): Promise<string[]> {
  const vinculos = await coleccionCompleta<VinculoFila>(request, "/api/vinculos")
  const propias = vinculos.filter(
    (v) => v.personaId === personaId && v.rol === "propietario" && !v.fechaFin,
  )
  return [...new Set(propias.map((v) => v.unidadId).filter((u): u is string => Boolean(u)))]
}

/** Período listo para emitir avisos sobre `unidadId`. */
export type PeriodoParaAvisos = {
  periodo: string
  /** `true` cuando la emisión de gasto común la creó este spec. */
  emisionCreada: boolean
  /** Unidades que la emisión del período repartió (lo que cuenta la UI). */
  unidadesEmitidas: number
}

type EmisionFila = { periodo?: string; lineas?: unknown[] }

/**
 * Parámetros con los que se declara la versión del reglamento en la base
 * descartable: los mismos de referencia del repo (`test/api/reglamento.test.ts`)
 * y los que documenta el backfill de la migración `add_version_reglamento`
 * (10 días de pago, mora 1% con tope 50%, 3 cuotas de corte, 5 días de
 * preaviso). `porcentajeReserva: 10` imputa el recargo al `fondo-reserva` que
 * siembra `db:fondos-fi`, igual que el reglamento de la comunidad.
 */
const PARAMETROS_REGLAMENTO_TEST = {
  porcentajeReserva: 10,
  diasPagoGc: 10,
  tasaMoraMensualPct: 1,
  topeMoraPct: 50,
  cuotasCorte: 3,
  diasPreavisoCorte: 5,
  ipcActivo: false,
} as const

type VersionReglamento = { fuenteInstrumento?: string; vigenteDesde?: string }

/**
 * Acta LEGAL del archivo que respalda la versión del reglamento (F35 A4 · S9).
 *
 * El alta de una versión exige `documentoId` de un `Documento` de naturaleza
 * `legal` de la MISMA comunidad (y lo legal exige `referenciaAutentica`), así que
 * una base descartable necesita uno: el archivo del seed lo trae, pero no se
 * puede asumir que el seed corrió (`db:push` sin `seed:datos` deja la tabla
 * vacía). Por eso el id es fijo —`asegurar`, no «crear siempre»— y los metadatos
 * declaran que es de prueba, igual que los PDF sintéticos del archivo
 * (`public/archivo-documentos/`): media por referencia, nunca bytes (D1).
 */
const DOCUMENTO_ACTA_REGLAMENTO_TEST = {
  id: "doc-archivo-acta-asamblea-e2e-avisos",
  naturaleza: "legal",
  tipoDocumental: "actas-asamblea",
  glosa:
    "Acta de asamblea que aprobó los parámetros de cobro (documento de respaldo de la suite E2E)",
  referenciaAutentica:
    "Acta de prueba de la suite E2E, sin valor legal: fojas 12, 15-03-2026",
  archivoNombre: "acta-asamblea-2026.pdf",
  archivoTipoMime: "application/pdf",
  archivoTamanoKB: 4,
  archivoUrl: "/archivo-documentos/acta-asamblea-2026.pdf",
  vigenteDesde: "2026-03-15",
} as const

/** Fila mínima del archivo para resolver si el acta ya está. */
type DocumentoFila = { id?: string; naturaleza?: string }

/**
 * Deja el acta legal en el archivo y devuelve su id. Se busca primero en el
 * listado —y no en el detalle, porque abrir un documento deja rastro de
 * auditoría (T11)— y solo se crea si falta: `POST /api/documentos` es upsert por
 * `id`, pero sobre una fila legal existente responde 409 a propósito (S2).
 */
async function asegurarDocumentoRespaldo(
  request: APIRequestContext,
): Promise<string> {
  const archivo = await coleccionCompleta<DocumentoFila>(request, "/api/documentos")
  const existente = archivo.find((d) => d.id === DOCUMENTO_ACTA_REGLAMENTO_TEST.id)
  if (existente) {
    expect(
      existente.naturaleza,
      "el acta de respaldo de la versión debe ser un documento legal del archivo",
    ).toBe("legal")
    return DOCUMENTO_ACTA_REGLAMENTO_TEST.id
  }

  const alta = await request.post("/api/documentos", {
    data: DOCUMENTO_ACTA_REGLAMENTO_TEST,
  })
  const textoAlta = await alta.text()
  expect(
    alta.ok(),
    `POST /api/documentos debe dejar el acta legal que respalda la versión: ${alta.status()} ${textoAlta.slice(0, 300)}`,
  ).toBe(true)
  return DOCUMENTO_ACTA_REGLAMENTO_TEST.id
}

/**
 * La emisión de gasto común exige una versión del reglamento que funde la forma
 * de contribución: la que crea el backfill de la migración es
 * `migracion_automatica` y NO habilita emitir (compuerta S1), así que una base
 * descartable recién sembrada no puede emitir ningún período. Acá se declara la
 * versión real por la misma ruta que usa la pantalla (`POST /api/reglamento`),
 * solo si la vigente no autoriza. Es el mismo patrón «asegurar» que
 * `asegurarParamsLegalesTEST` de `datos-test.ts`.
 *
 * S9: la versión nueva se respalda con el acta `legal` del archivo
 * (`documentoId`), no con un `actaRef` de texto: el alta sin ese documento
 * responde 400 y el acta ya está resuelta acá antes de postear.
 */
async function asegurarVersionReglamento(
  request: APIRequestContext,
  periodo: string,
): Promise<void> {
  const res = await request.get(`/api/reglamento?periodo=${periodo}`)
  const texto = await res.text()
  if (res.ok()) {
    const vigente = JSON.parse(texto) as VersionReglamento
    if (vigente.fuenteInstrumento && vigente.fuenteInstrumento !== "migracion_automatica") {
      return
    }
  } else {
    // 404 = la comunidad no declaró ninguna versión: hay que declararla igual.
    expect(
      res.status(),
      `GET /api/reglamento debe responder 200 o 404: ${res.status()} ${texto.slice(0, 300)}`,
    ).toBe(404)
  }

  const documentoId = await asegurarDocumentoRespaldo(request)
  const alta = await request.post("/api/reglamento", {
    data: {
      vigenteDesde: periodo,
      fuenteInstrumento: "reglamento_copropiedad",
      documentoId,
      formaContribucion: "coeficiente",
      parametros: PARAMETROS_REGLAMENTO_TEST,
    },
  })
  const textoAlta = await alta.text()
  expect(
    alta.ok(),
    `POST /api/reglamento debe declarar la versión vigente desde ${periodo}: ${alta.status()} ${textoAlta.slice(0, 300)}`,
  ).toBe(true)
}

/** Primer período libre (sin emisión) desde el mes en curso, en UTC. */
function siguientePeriodoLibre(emitidos: ReadonlySet<string>): string {
  const hoy = new Date()
  for (let avance = 0; avance < 24; avance++) {
    const fecha = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + avance, 1))
    const periodo = fecha.toISOString().slice(0, 7)
    if (!emitidos.has(periodo)) return periodo
  }
  throw new Error(
    "No hay período libre en 24 meses para emitir el gasto común del aviso.",
  )
}

/**
 * Deja un período con emisión de gasto común, sin avisos todavía y con cobro en
 * `unidadId`; si el seed no tiene ninguno así, emite el gasto común de un
 * período libre acotado a esa unidad.
 */
export async function asegurarPeriodoParaAvisos(
  request: APIRequestContext,
  unidadId: string,
): Promise<PeriodoParaAvisos> {
  const emisiones = await jsonDe<EmisionFila>(request, "/api/emisiones-gc?pageSize=100")
  const emitidos = emisiones.data ?? []

  const avisos = await coleccionCompleta<{ periodo?: string }>(
    request,
    "/api/avisos-cobro",
  )
  const periodosConAviso = new Set(avisos.map((a) => a.periodo).filter(Boolean))

  // El aviso se emite para TODAS las unidades con cobro del período, así que un
  // período que ya tiene aunque sea un aviso responde 409: se descarta entero.
  const candidatos = emitidos
    .map((e) => e.periodo ?? "")
    .filter((p) => FORMATO_PERIODO.test(p) && !periodosConAviso.has(p))
    .sort((a, b) => b.localeCompare(a))

  for (const periodo of candidatos) {
    const cobros = await jsonDe<{ id?: string }>(
      request,
      `/api/cobros-fi?periodo=${periodo}&unidadId=${encodeURIComponent(unidadId)}&pageSize=1`,
    )
    if ((cobros.data ?? []).length > 0) {
      const emision = emitidos.find((e) => e.periodo === periodo)
      return {
        periodo,
        emisionCreada: false,
        unidadesEmitidas: (emision?.lineas ?? []).length,
      }
    }
  }

  const periodo = siguientePeriodoLibre(
    new Set(emitidos.map((e) => e.periodo ?? "").filter(Boolean)),
  )
  // Sin versión real del reglamento la emisión de gasto común se bloquea (S1):
  // la base descartable trae la migración automática, que no habilita emitir.
  await asegurarVersionReglamento(request, periodo)
  const res = await request.post("/api/emisiones-gc", {
    data: {
      periodo,
      modo: "variable",
      gastoTotal: GASTO_TOTAL_EMISION_TEST,
      unidadIds: [unidadId],
    },
  })
  const texto = await res.text()
  expect(
    res.ok(),
    `POST /api/emisiones-gc (${periodo}) debe emitir el gasto común del período: ${res.status()} ${texto.slice(0, 300)}`,
  ).toBe(true)
  return { periodo, emisionCreada: true, unidadesEmitidas: 1 }
}

/** Fila del listado de avisos tal como la sirve la API (contenido congelado). */
export type AvisoDelListado = {
  id: string
  periodo: string
  folio: string
  unidadId: string
  vencimiento: string | null
  contenido: Record<string, unknown>
}

/** Avisos de UNA unidad (el alcance lo resuelve el servidor por comunidad). */
export async function avisosDeUnidad(
  request: APIRequestContext,
  unidadId: string,
): Promise<AvisoDelListado[]> {
  const pagina = await jsonDe<AvisoDelListado>(
    request,
    `/api/avisos-cobro?unidadId=${encodeURIComponent(unidadId)}&pageSize=100`,
  )
  return pagina.data ?? []
}

/** Avisos de TODA la comunidad en un período: es el conteo que la pantalla reporta. */
export async function avisosDelPeriodo(
  request: APIRequestContext,
  periodo: string,
): Promise<AvisoDelListado[]> {
  const avisos = await coleccionCompleta<AvisoDelListado>(request, "/api/avisos-cobro")
  return avisos.filter((a) => a.periodo === periodo)
}

/** Fila del registro de entrega (S3): el hecho que el comité audita. */
export type EnvioAviso = {
  id: string
  canal: "visor" | "email"
  estado: "entregado" | "pendiente" | "fallido"
  motivo?: string | null
  notificacionId?: string | null
  fecha?: string
}

/** Historial de entregas del aviso (más reciente primero). */
export async function enviosDelAviso(
  request: APIRequestContext,
  avisoId: string,
): Promise<EnvioAviso[]> {
  const ruta = `/api/avisos-cobro/${encodeURIComponent(avisoId)}/entrega`
  const res = await request.get(ruta)
  const texto = await res.text()
  expect(
    res.ok(),
    `GET ${ruta} debe responder: ${res.status()} ${texto.slice(0, 300)}`,
  ).toBe(true)
  const cuerpo = JSON.parse(texto) as { envios?: EnvioAviso[] }
  return cuerpo.envios ?? []
}

function objetoDe(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

/**
 * Total adeudado congelado del aviso, con la MISMA regla que la pantalla: desde
 * la versión 2 del contenido el papel muestra el consolidado (deuda del período
 * + deuda anterior) y la fila versión 1 cae al total del período. El spec no
 * recalcula ninguna cifra: lee la que el aviso guardó.
 */
export function totalAdeudadoDe(aviso: AvisoDelListado): number | null {
  const montos = objetoDe(aviso.contenido.montos)
  const valor = montos.totalAdeudadoConsolidado ?? montos.totalAdeudado
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null
}

/** Monto con el formato de la pantalla (`$15.000`, es-CL). */
export function montoCLP(valor: number): string {
  return `$${valor.toLocaleString("es-CL")}`
}

/** Referencia legible de la unidad congelada en el contenido (`Depto 101`). */
export function referenciaUnidadDe(aviso: AvisoDelListado): string {
  const unidad = objetoDe(aviso.contenido.unidad)
  const etiqueta = typeof unidad.etiqueta === "string" ? unidad.etiqueta : ""
  const numero = typeof unidad.numero === "string" ? unidad.numero : ""
  return `${etiqueta} ${numero}`.trim()
}
