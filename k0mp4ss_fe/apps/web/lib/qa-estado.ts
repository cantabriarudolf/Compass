import { existsSync, readFileSync, statSync, writeFileSync } from "fs"
import os from "os"
import path from "path"

export interface QaSistema {
  loadAvg1: number
  loadAvg5: number
  loadAvg15: number
  cores: number
  memTotalMB: number
  memLibreMB: number
  swapTotalMB: number
  swapLibreMB: number
}

export interface QaFactor {
  factorCarga: number
  ahogada: boolean
  motivo: string | null
}

export interface QaEstimado {
  id: string
  etiqueta: string
  motor: "cli" | "chrome"
  minutosBase: number
  minutosEstimados: number
  fuente: string
}

export interface QaFallo {
  archivo: string
  test: string
  causa: string
}

export type QaEtapaEstado = "pendiente" | "en_curso" | "ok" | "fallida" | "omitida"

export interface QaEtapa {
  id: string
  nombre: string
  chispa: string
  comando: string
  specGlobs: string[]
  minutosBase: number
  minutosEstimados: number
  orden: number
  estado: QaEtapaEstado
  duracionRealMin?: number
  nota?: string | null
  fallos?: QaFallo[]
}

export interface QaEtapaDef {
  id: string
  nombre: string
  chispa: string
  comando: string
  specGlobs: string[]
  minutosBaseDefault: number
  orden: number
}

export interface QaBaselineEtapa {
  minutosBase: number
  fuente: string
}

export interface QaRoadmapLiveEtapa {
  id: string
  estado: QaEtapaEstado
  duracionRealMin?: number
  passed?: number
  total?: number
}

export interface QaRoadmapLive {
  runId: string
  alcance: string
  modo: "seguido" | "por etapas"
  iniciado: string
  etapas: QaRoadmapLiveEtapa[]
  testActual?: string
}

export interface QaRun {
  id: string
  fecha: string
  tipo: "unit" | "e2e" | "ambas"
  alcance: string
  visualizacion: string
  comando: string
  cuenta?: string | null
  sistema: { loadAvg1: number; cores: number; nota: string }
  estimadoMinutos: number | null
  resultado: {
    estado: "passed" | "failed" | "parcial"
    passed: number
    failed: number
    skipped: number
    duracion: string
    fallos: QaFallo[]
  }
  etapas?: QaEtapa[]
}

export interface QaEstadoData {
  runs: QaRun[]
  baselinesEtapa?: Record<string, QaBaselineEtapa>
}

const QA_ESTADO_PATH = path.join(process.cwd(), "qa-estado.json")
const MAX_RUNS = 10
const QA_ROADMAP_LIVE_PATH = path.join(process.cwd(), "qa-roadmap-live.json")
const LIVE_FRESCO_MS = 5 * 60 * 1000

export function getQaEstado(): QaEstadoData | null {
  if (!existsSync(QA_ESTADO_PATH)) return null
  try {
    const raw = JSON.parse(readFileSync(QA_ESTADO_PATH, "utf8")) as QaEstadoData
    if (!Array.isArray(raw.runs)) return null
    return { runs: raw.runs.slice(-MAX_RUNS), baselinesEtapa: raw.baselinesEtapa }
  } catch {
    return null
  }
}

function escribirQaEstado(data: QaEstadoData): boolean {
  try {
    writeFileSync(QA_ESTADO_PATH, JSON.stringify(data, null, 2) + "\n", "utf8")
    return true
  } catch {
    return false
  }
}

function readSwapMB(): { total: number; libre: number } {
  try {
    const meminfo = readFileSync("/proc/meminfo", "utf8")
    const match = (label: string) => {
      const m = meminfo.match(new RegExp(`${label}:\\s+(\\d+) kB`))
      return m ? Math.round(Number(m[1]) / 1024) : 0
    }
    return { total: match("SwapTotal"), libre: match("SwapFree") }
  } catch {
    return { total: 0, libre: 0 }
  }
}

export function getSistema(): QaSistema {
  const [load1 = 0, load5 = 0, load15 = 0] = os.loadavg()
  const swap = readSwapMB()
  return {
    loadAvg1: Math.round(load1 * 100) / 100,
    loadAvg5: Math.round(load5 * 100) / 100,
    loadAvg15: Math.round(load15 * 100) / 100,
    cores: os.cpus().length,
    memTotalMB: Math.round(os.totalmem() / 1024 / 1024),
    memLibreMB: Math.round(os.freemem() / 1024 / 1024),
    swapTotalMB: swap.total,
    swapLibreMB: swap.libre,
  }
}

export function getFactorCarga(s: QaSistema): QaFactor {
  const factor = Math.max(1, Math.round((s.loadAvg1 / Math.max(1, s.cores)) * 10) / 10)
  const swapLleno = s.swapTotalMB > 0 && s.swapLibreMB / s.swapTotalMB < 0.1
  const ramBaja = s.memLibreMB < 700
  if (swapLleno && ramBaja) {
    return { factorCarga: factor, ahogada: true, motivo: "Swap llena y RAM baja — riesgo de flakes (timeouts, GPU crashes)" }
  }
  if (swapLleno) {
    return { factorCarga: factor, ahogada: true, motivo: "Swap llena — tiempos inflados" }
  }
  if (factor > 2) {
    return { factorCarga: factor, ahogada: true, motivo: "Load muy sobre los cores — CPU saturada" }
  }
  return { factorCarga: factor, ahogada: false, motivo: null }
}

// Baselines medidos 2026-08-29 (máquina local, load bajo). El skill los
// recalibra con cada corrida real (ver SKILL.md §Estimados).
const BASELINES: Omit<QaEstimado, "minutosEstimados">[] = [
  { id: "unit-suite", etiqueta: "Unit — suite completa (455 tests)", motor: "cli", minutosBase: 3.5, fuente: "medido 208s" },
  { id: "unit-archivo", etiqueta: "Unit — un archivo", motor: "cli", minutosBase: 0.2, fuente: "aprox" },
  { id: "e2e-smoke", etiqueta: "E2E Chrome — smoke (8 módulos)", motor: "chrome", minutosBase: 2.5, fuente: "medido ~150s" },
  { id: "e2e-auth", etiqueta: "E2E Chrome — auth (login/guard + roles)", motor: "chrome", minutosBase: 2.5, fuente: "medido ~90s + roles-menu/accesos" },
  { id: "e2e-flujo", etiqueta: "E2E Chrome — flujo (journey + personas)", motor: "chrome", minutosBase: 3.6, fuente: "medido 3.6m" },
  { id: "e2e-crud", etiqueta: "E2E Chrome — CRUD general (30 specs incl. roles-journeys)", motor: "chrome", minutosBase: 12, fuente: "medido 11.8m" },
  { id: "e2e-suite", etiqueta: "E2E Chrome — suite completa", motor: "chrome", minutosBase: 20, fuente: "medido 15.8m (37 activos +2 skip + setup 5)" },
  { id: "report", etiqueta: "show-report (HTML último run)", motor: "chrome", minutosBase: 0.1, fuente: "instantáneo" },
]

export function getEstimados(s: QaSistema, factor: QaFactor): QaEstimado[] {
  return BASELINES.map((b) => ({
    ...b,
    minutosEstimados: Math.round(b.minutosBase * factor.factorCarga * 10) / 10,
  }))
}

export function getQaDashboardData() {
  const sistema = getSistema()
  const factor = getFactorCarga(sistema)
  return {
    estado: getQaEstado(),
    sistema,
    factor,
    estimados: getEstimados(sistema, factor),
  }
}

// Etapas del recorrido QA narrativo (D1): comandos validados según el mapa de la
// skill `pruebas` y lotes CRUD por SERIE-CRUD-E2E. Fuente de verdad del plan
// (`planRoadmap`) y del reporter de Playwright (F2). El dashboard que las leía se
// retiró con el módulo QA/dev (F9); el reporter sigue siendo consumidor vivo.
export const ROADMAP_ETAPAS: QaEtapaDef[] = [
  {
    id: "setup",
    nombre: "La Puerta",
    chispa:
      "5 logins reales (test1234) crean los storageStates; si falla no corre nada más. Última causa típica: server frío compilando bajo carga.",
    comando: "npx playwright test e2e/auth.setup.ts",
    specGlobs: ["e2e/auth.setup.ts"],
    minutosBaseDefault: 1.0,
    orden: 1,
  },
  {
    id: "smoke",
    nombre: "El Tour",
    chispa:
      "8 módulos renderizan sin pageerror. Si algo rompe aquí, es de infraestructura (rutas/SSR), no de lógica de módulo.",
    comando: "npx playwright test e2e/smoke/",
    specGlobs: ["e2e/smoke/"],
    minutosBaseDefault: 2.5,
    orden: 2,
  },
  {
    id: "auth",
    nombre: "El Guardián de Cuentas",
    chispa:
      "Login/guard + matriz rol×grupos (5 cuentas). Mirar redirects a /ingresar y permisos de sidebar. rate-limit.spec está GATED: jamás correrlo local.",
    comando: "npx playwright test e2e/auth/ingresar.spec.ts e2e/auth/roles-menu.spec.ts e2e/auth/roles-accesos.spec.ts",
    specGlobs: ["e2e/auth/ingresar.spec.ts", "e2e/auth/roles-menu.spec.ts", "e2e/auth/roles-accesos.spec.ts"],
    minutosBaseDefault: 2.5,
    orden: 3,
  },
  {
    id: "flujo",
    nombre: "El Poblador",
    chispa:
      "Journey QA Lab + ciclo limpiar→poblar→validar→limpiar + CRUD personas. Mirar 'Carga completa OK', el guard de 2ª corrida y 0 huérfanos. Si falla, cae todo lo gated.",
    comando: "npx playwright test e2e/flujo/",
    specGlobs: ["e2e/flujo/"],
    minutosBaseDefault: 3.6,
    orden: 4,
  },
  {
    id: "crud-maestros",
    nombre: "Maestros y Config",
    chispa:
      "Catálogos admin + configuración persistente + reportería + personal. Mirar guardado/persistencia de sub-tabs y exports de reportes; alert() nativo en configuración es quirúrgico.",
    comando:
      "npx playwright test e2e/crud/admin-maestros.spec.ts e2e/crud/admin-configuracion.spec.ts e2e/crud/admin-reporteria.spec.ts e2e/crud/personal.spec.ts",
    specGlobs: [
      "e2e/crud/admin-maestros.spec.ts",
      "e2e/crud/admin-configuracion.spec.ts",
      "e2e/crud/admin-reporteria.spec.ts",
      "e2e/crud/personal.spec.ts",
    ],
    minutosBaseDefault: 2.0,
    orden: 5,
  },
  {
    id: "crud-inventario",
    nombre: "Inventario",
    chispa:
      "Tipos de unidad alimentan prorrateo; estructura es la raíz de FKs (unidades borradas rompen VU/IN/RA).",
    comando:
      "npx playwright test e2e/crud/tipos.spec.ts e2e/crud/estructura.spec.ts e2e/crud/recursos.spec.ts e2e/crud/proyectos.spec.ts",
    specGlobs: [
      "e2e/crud/tipos.spec.ts",
      "e2e/crud/estructura.spec.ts",
      "e2e/crud/recursos.spec.ts",
      "e2e/crud/proyectos.spec.ts",
    ],
    minutosBaseDefault: 2.0,
    orden: 6,
  },
  {
    id: "crud-operaciones",
    nombre: "Operaciones",
    chispa:
      "RA valida anti-overbooking y gate de morosidad; GE auto-En Revisión; bitacora marca Ingresada.",
    comando:
      "npx playwright test e2e/crud/reservas.spec.ts e2e/crud/solicitudes.spec.ts e2e/crud/bitacora.spec.ts e2e/crud/proveedores.spec.ts e2e/crud/accesos.spec.ts e2e/crud/paqueteria.spec.ts",
    specGlobs: [
      "e2e/crud/reservas.spec.ts",
      "e2e/crud/solicitudes.spec.ts",
      "e2e/crud/bitacora.spec.ts",
      "e2e/crud/proveedores.spec.ts",
      "e2e/crud/accesos.spec.ts",
      "e2e/crud/paqueteria.spec.ts",
    ],
    minutosBaseDefault: 2.5,
    orden: 7,
  },
  {
    id: "crud-comunidad",
    nombre: "Comunidad",
    chispa:
      "GD acta→CV encadenado, visor público, switches de privacidad de /admin/gestion alimentan el ABAC.",
    comando:
      "npx playwright test e2e/crud/comunicacion.spec.ts e2e/crud/directiva.spec.ts e2e/crud/visor.spec.ts e2e/crud/gestion.spec.ts e2e/crud/residentes.spec.ts",
    specGlobs: [
      "e2e/crud/comunicacion.spec.ts",
      "e2e/crud/directiva.spec.ts",
      "e2e/crud/visor.spec.ts",
      "e2e/crud/gestion.spec.ts",
      "e2e/crud/residentes.spec.ts",
    ],
    minutosBaseDefault: 2.5,
    orden: 8,
  },
  {
    id: "crud-finanzas",
    nombre: "Finanzas",
    chispa:
      "Cobros gated (poblar QA Lab primero), folios FE-####, punto cero 2023-2024 (saldo CC=0) y espejo BD. Multas aplicadas nacen como cobro real.",
    comando:
      "npx playwright test e2e/crud/gastos-comunes.spec.ts e2e/crud/multas.spec.ts e2e/crud/pagos.spec.ts e2e/crud/punto-cero.spec.ts e2e/crud/fi-espejo.spec.ts",
    specGlobs: [
      "e2e/crud/gastos-comunes.spec.ts",
      "e2e/crud/multas.spec.ts",
      "e2e/crud/pagos.spec.ts",
      "e2e/crud/punto-cero.spec.ts",
      "e2e/crud/fi-espejo.spec.ts",
    ],
    minutosBaseDefault: 3.0,
    orden: 9,
  },
  {
    id: "crud-complejos",
    nombre: "Complejos gated",
    chispa:
      "PDF firmado, liquidaciones con cálculo legal completo, vitrina portal + el guard idempotente del poblado.",
    comando:
      "npx playwright test e2e/crud/certificados.spec.ts e2e/crud/remuneraciones.spec.ts e2e/crud/portal.spec.ts e2e/crud/poblado-idempotente.spec.ts",
    specGlobs: [
      "e2e/crud/certificados.spec.ts",
      "e2e/crud/remuneraciones.spec.ts",
      "e2e/crud/portal.spec.ts",
      "e2e/crud/poblado-idempotente.spec.ts",
    ],
    minutosBaseDefault: 2.5,
    orden: 10,
  },
  {
    id: "crud-lectura",
    nombre: "Lectura y roles",
    chispa:
      "Logs sobre BD real con export CSV, matriz RBAC+ABAC read-only, 4 journeys por rol no-admin. Aquí se valida el menor privilegio.",
    comando: "npx playwright test e2e/crud/logs.spec.ts e2e/crud/permisos.spec.ts e2e/crud/roles-journeys.spec.ts",
    specGlobs: ["e2e/crud/logs.spec.ts", "e2e/crud/permisos.spec.ts", "e2e/crud/roles-journeys.spec.ts"],
    minutosBaseDefault: 2.0,
    orden: 11,
  },
]

export const ALCANCES_ROADMAP = ["suite completa", "smoke", "auth", "flujo", "crud", "crud general"] as const
export type AlcanceRoadmap = (typeof ALCANCES_ROADMAP)[number]

// Alcance desconocido → plan vacío (el endpoint valida y responde 400).
export function planRoadmap(
  alcance: string,
  factor: number,
  baselines?: Record<string, QaBaselineEtapa>
): { etapas: QaEtapa[]; totalMinutos: number } {
  const factorSeguro = Number.isFinite(factor) && factor > 0 ? factor : 1
  const defs = ROADMAP_ETAPAS.filter((d) => {
    if (alcance === "suite completa") return true
    if (alcance === "smoke") return d.id === "setup" || d.id === "smoke"
    if (alcance === "auth") return d.id === "setup" || d.id === "auth"
    if (alcance === "flujo") return d.id === "setup" || d.id === "flujo"
    if (alcance === "crud" || alcance === "crud general") return d.id === "setup" || d.id.startsWith("crud-")
    return false
  })
  const etapas: QaEtapa[] = defs.map((d) => {
    const minutosBase = baselines?.[d.id]?.minutosBase ?? d.minutosBaseDefault
    return {
      id: d.id,
      nombre: d.nombre,
      chispa: d.chispa,
      comando: d.comando,
      specGlobs: d.specGlobs,
      minutosBase,
      minutosEstimados: Math.round(minutosBase * factorSeguro * 10) / 10,
      orden: d.orden,
      estado: "pendiente",
    }
  })
  const totalMinutos = Math.round(etapas.reduce((t, e) => t + e.minutosEstimados, 0) * 10) / 10
  return { etapas, totalMinutos }
}

export type QaAccionResultado = { ok: true; mensaje: string } | { ok: false; error: string }

export function guardarNotaEtapa(runId: string, etapaId: string, texto: string): QaAccionResultado {
  const id = runId.trim()
  const etapaIdLimpio = etapaId.trim()
  const nota = texto.trim()
  if (!id || !etapaIdLimpio) return { ok: false, error: "runId y etapaId son obligatorios" }
  if (!nota) return { ok: false, error: "La nota no puede estar vacía" }
  const data = getQaEstado()
  if (!data) return { ok: false, error: "qa-estado.json no existe o es inválido" }
  const run = data.runs.find((r) => r.id === id)
  if (!run) return { ok: false, error: `Run no encontrado: ${id}` }
  const entrada = run.etapas?.find((e) => e.id === etapaIdLimpio)
  if (!entrada) return { ok: false, error: `La etapa ${etapaIdLimpio} no existe en el run ${id}` }
  entrada.nota = nota
  if (!escribirQaEstado(data)) return { ok: false, error: "No se pudo escribir qa-estado.json" }
  return { ok: true, mensaje: "Nota guardada" }
}

export function recalibrarBaselineEtapa(etapaId: string, minutosReales: number): QaAccionResultado {
  const etapaIdLimpio = etapaId.trim()
  if (!etapaIdLimpio) return { ok: false, error: "etapaId es obligatorio" }
  if (!ROADMAP_ETAPAS.some((d) => d.id === etapaIdLimpio)) {
    return { ok: false, error: `Etapa desconocida: ${etapaIdLimpio}` }
  }
  if (!Number.isFinite(minutosReales) || minutosReales <= 0) {
    return { ok: false, error: "minutosReales debe ser un número > 0" }
  }
  const data = getQaEstado()
  if (!data) return { ok: false, error: "qa-estado.json no existe o es inválido" }
  const minutosBase = Math.round(minutosReales * 10) / 10
  data.baselinesEtapa = {
    ...data.baselinesEtapa,
    [etapaIdLimpio]: { minutosBase, fuente: `medido ${new Date().toISOString()}` },
  }
  if (!escribirQaEstado(data)) return { ok: false, error: "No se pudo escribir qa-estado.json" }
  return { ok: true, mensaje: `Baseline de ${etapaIdLimpio} recalibrado a ${minutosBase} min` }
}

export function getQaRoadmapLive(): QaRoadmapLive | null {
  if (!existsSync(QA_ROADMAP_LIVE_PATH)) return null
  try {
    const mtimeMs = statSync(QA_ROADMAP_LIVE_PATH).mtimeMs
    if (Date.now() - mtimeMs > LIVE_FRESCO_MS) return null
    const raw = JSON.parse(readFileSync(QA_ROADMAP_LIVE_PATH, "utf8")) as QaRoadmapLive
    if (!raw || typeof raw.runId !== "string" || !Array.isArray(raw.etapas)) return null
    return raw
  } catch {
    return null
  }
}

export interface QaEtapaNodo extends QaEtapa {
  historico: { fecha: string; causa: string } | null
  nota: string | null
}

export interface QaRoadmapData {
  alcance: string
  factorCarga: number
  totalMinutos: number
  etapas: QaEtapaNodo[]
  live: QaRoadmapLive | null
  testActual: string | null
  runReferenciaId: string | null
}

function nodoConMemoria(etapa: QaEtapa, runs: QaRun[]): QaEtapaNodo {
  let historico: { fecha: string; causa: string } | null = null
  let nota: string | null = null
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]
    if (!run) continue
    const entrada = run.etapas?.find((e) => e.id === etapa.id)
    if (!entrada) continue
    if (!historico && entrada.estado === "fallida") {
      const causa = entrada.fallos?.[0]?.causa ?? run.resultado.fallos[0]?.causa ?? "Sin causa registrada"
      historico = { fecha: run.fecha, causa }
    }
    if (nota === null && typeof entrada.nota === "string" && entrada.nota.trim()) {
      nota = entrada.nota.trim()
    }
  }
  return { ...etapa, historico, nota }
}

export function getQaRoadmapData(alcance = "suite completa"): QaRoadmapData {
  const sistema = getSistema()
  const factor = getFactorCarga(sistema)
  const estado = getQaEstado()
  const runs = estado?.runs ?? []
  const live = getQaRoadmapLive()
  const { etapas, totalMinutos } = planRoadmap(alcance, factor.factorCarga, estado?.baselinesEtapa)

  let runReferencia: QaRun | null = null
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i]
    if (r?.etapas && r.etapas.length > 0) {
      runReferencia = r
      break
    }
  }

  const etapasNodo = etapas.map((e) => {
    const nodo = nodoConMemoria(e, runs)
    const enLive = live?.etapas.find((le) => le.id === e.id)
    if (enLive) {
      return { ...nodo, estado: enLive.estado, duracionRealMin: enLive.duracionRealMin }
    }
    const enRun = runReferencia?.etapas?.find((re) => re.id === e.id)
    if (enRun) {
      return { ...nodo, estado: enRun.estado, duracionRealMin: enRun.duracionRealMin ?? nodo.duracionRealMin }
    }
    return nodo
  })

  return {
    alcance,
    factorCarga: factor.factorCarga,
    totalMinutos,
    etapas: etapasNodo,
    live,
    testActual: live?.testActual ?? null,
    runReferenciaId: live?.runId ?? runReferencia?.id ?? null,
  }
}
