import type { FullConfig, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter"
import { writeFileSync } from "fs"
import path from "path"
import { ROADMAP_ETAPAS, type QaEtapaEstado, type QaRoadmapLive } from "@/lib/qa-estado"

const LIVE_PATH = path.join(process.cwd(), "qa-roadmap-live.json")

interface EtapaRuntime {
  id: string
  estado: QaEtapaEstado
  passed: number
  failed: number
  finished: number
  total: number
  duracionMs: number
}

function specPertenece(specFile: string, glob: string): boolean {
  const file = specFile.split(path.sep).join("/")
  if (glob.endsWith("/")) return file.includes(glob)
  return file === glob || file.endsWith(`/${glob}`)
}

export default class RoadmapReporter implements Reporter {
  private etapas: EtapaRuntime[] = []
  private etapaPorArchivo = new Map<string, EtapaRuntime>()
  private estadoPorTest = new Map<string, "passed" | "failed">()
  private live: QaRoadmapLive | null = null
  private falloLogueado = false

  onBegin(_config: FullConfig, suite: Suite): void {
    const archivos = new Map<string, number>()
    for (const test of suite.allTests()) {
      archivos.set(test.location.file, (archivos.get(test.location.file) ?? 0) + 1)
    }
    this.etapas = [...ROADMAP_ETAPAS]
      .sort((a, b) => a.orden - b.orden)
      .map((def) => {
        const total = [...archivos.entries()]
          .filter(([file]) => def.specGlobs.some((glob) => specPertenece(file, glob)))
          .reduce((suma, [, n]) => suma + n, 0)
        return { id: def.id, estado: (total > 0 ? "pendiente" : "omitida") as QaEtapaEstado, passed: 0, failed: 0, finished: 0, total, duracionMs: 0 }
      })
    for (const def of ROADMAP_ETAPAS) {
      for (const file of archivos.keys()) {
        if (def.specGlobs.some((glob) => specPertenece(file, glob))) {
          const etapa = this.etapas.find((e) => e.id === def.id)
          if (etapa) this.etapaPorArchivo.set(file, etapa)
        }
      }
    }
    this.live = {
      runId: `run-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`,
      alcance: "corrida",
      modo: "seguido",
      iniciado: new Date().toISOString(),
      etapas: [],
    }
    this.sincronizar()
    this.escribir()
  }

  onTestBegin(test: TestCase): void {
    const etapa = this.etapaPorArchivo.get(test.location.file)
    if (!etapa || !this.live) return
    if (etapa.estado === "pendiente") etapa.estado = "en_curso"
    this.live.testActual = test.title
    this.sincronizar()
    this.escribir()
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const etapa = this.etapaPorArchivo.get(test.location.file)
    if (!etapa || !this.live) return
    const previo = this.estadoPorTest.get(test.id)
    const falla = result.status === "failed" || result.status === "timedOut" || result.status === "interrupted"
    if (result.status === "passed" && previo !== "passed") {
      etapa.passed++
      if (previo === "failed") etapa.failed--
      this.estadoPorTest.set(test.id, "passed")
    } else if (falla && previo !== "failed") {
      etapa.failed++
      if (previo === "passed") etapa.passed--
      this.estadoPorTest.set(test.id, "failed")
    }
    if (previo === undefined) etapa.finished++
    etapa.duracionMs += result.duration
    if (etapa.total > 0 && etapa.finished >= etapa.total) {
      etapa.estado = etapa.failed > 0 ? "fallida" : "ok"
    } else if (etapa.estado === "pendiente") {
      etapa.estado = "en_curso"
    }
    this.live.testActual = test.title
    this.sincronizar()
    this.escribir()
  }

  onEnd(): void {
    for (const etapa of this.etapas) {
      if (etapa.estado === "en_curso" || etapa.estado === "pendiente") {
        etapa.estado = etapa.failed > 0 ? "fallida" : "ok"
      }
    }
    this.sincronizar()
    this.escribir()
  }

  private sincronizar(): void {
    if (!this.live) return
    this.live.etapas = this.etapas.map((e) => ({
      id: e.id,
      estado: e.estado,
      ...(e.duracionMs > 0 ? { duracionRealMin: Math.round((e.duracionMs / 60000) * 10) / 10 } : {}),
      ...(e.total > 0 ? { passed: e.passed, total: e.total } : {}),
    }))
  }

  private escribir(): void {
    if (!this.live) return
    try {
      writeFileSync(LIVE_PATH, JSON.stringify(this.live, null, 2) + "\n", "utf8")
    } catch (error) {
      if (!this.falloLogueado) {
        this.falloLogueado = true
        console.warn("[roadmap-reporter] No se pudo escribir qa-roadmap-live.json; la corrida continúa:", error)
      }
    }
  }
}
