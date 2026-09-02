import { existsSync, readFileSync } from "fs"
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
}

export interface QaEstadoData {
  runs: QaRun[]
}

const QA_ESTADO_PATH = path.join(process.cwd(), "qa-estado.json")
const MAX_RUNS = 10

export function getQaEstado(): QaEstadoData | null {
  if (!existsSync(QA_ESTADO_PATH)) return null
  try {
    const raw = JSON.parse(readFileSync(QA_ESTADO_PATH, "utf8")) as QaEstadoData
    if (!Array.isArray(raw.runs)) return null
    return { runs: raw.runs.slice(-MAX_RUNS) }
  } catch {
    return null
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
