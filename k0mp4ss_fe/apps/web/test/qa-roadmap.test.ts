/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import path from "node:path"

const fsState = vi.hoisted(() => ({
  files: new Map<string, string>(),
  mtimeMs: Date.now(),
}))

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>()
  return {
    ...actual,
    existsSync: (p: Parameters<typeof actual.existsSync>[0]) =>
      fsState.files.has(String(p)) || actual.existsSync(p),
    readFileSync: ((p: Parameters<typeof actual.readFileSync>[0], ...rest: unknown[]) => {
      const key = String(p)
      if (fsState.files.has(key)) return fsState.files.get(key)
      return (actual.readFileSync as (...a: unknown[]) => unknown)(p, ...rest)
    }) as typeof actual.readFileSync,
    writeFileSync: ((p: Parameters<typeof actual.writeFileSync>[0], data: unknown) => {
      fsState.files.set(String(p), String(data))
    }) as typeof actual.writeFileSync,
    statSync: ((p: Parameters<typeof actual.statSync>[0]) => {
      const key = String(p)
      if (fsState.files.has(key)) return { mtimeMs: fsState.mtimeMs }
      return (actual.statSync as (...a: unknown[]) => unknown)(p)
    }) as unknown as typeof actual.statSync,
  }
})

const QA_ESTADO_PATH = path.join(process.cwd(), "qa-estado.json")
const QA_ROADMAP_LIVE_PATH = path.join(process.cwd(), "qa-roadmap-live.json")

function seedQaEstado(data: unknown): void {
  fsState.files.set(QA_ESTADO_PATH, JSON.stringify(data, null, 2))
}

function runFactory(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    fecha: "2026-09-01T10:00:00-04:00",
    tipo: "e2e",
    alcance: "suite completa",
    visualizacion: "headless (como CI)",
    comando: "npx playwright test",
    sistema: { loadAvg1: 2, cores: 2, nota: "" },
    estimadoMinutos: 20,
    resultado: {
      estado: "passed",
      passed: 30,
      failed: 0,
      skipped: 0,
      duracion: "15m",
      fallos: [
        { archivo: "e2e/flujo/ciclo.spec.ts", test: "ciclo", causa: "causa de run" },
      ],
    },
    ...overrides,
  }
}

beforeEach(() => {
  fsState.files.clear()
  fsState.mtimeMs = Date.now()
})

describe("planRoadmap", () => {
  it("suite completa → 11 etapas en orden y total > 0", async () => {
    const { planRoadmap, ROADMAP_ETAPAS } = await import("@/lib/qa-estado")
    const { etapas, totalMinutos } = planRoadmap("suite completa", 1)
    expect(etapas).toHaveLength(11)
    expect(etapas.map((e) => e.id)).toEqual(ROADMAP_ETAPAS.map((d) => d.id))
    expect([...etapas].map((e) => e.orden)).toEqual([...etapas].map((e) => e.orden).sort((a, b) => a - b))
    expect(etapas.every((e) => e.estado === "pendiente")).toBe(true)
    expect(etapas.every((e) => e.chispa.length > 0 && e.comando.startsWith("npx playwright test"))).toBe(true)
    expect(totalMinutos).toBeGreaterThan(0)
    const suma = Math.round(etapas.reduce((t, e) => t + e.minutosEstimados, 0) * 10) / 10
    expect(totalMinutos).toBe(suma)
  })

  it("alcance smoke → solo setup + smoke", async () => {
    const { planRoadmap } = await import("@/lib/qa-estado")
    const { etapas, totalMinutos } = planRoadmap("smoke", 1)
    expect(etapas.map((e) => e.id)).toEqual(["setup", "smoke"])
    expect(totalMinutos).toBe(Math.round((1.0 + 2.5) * 10) / 10)
  })

  it("alcance crud incluye setup + los 7 lotes crud", async () => {
    const { planRoadmap } = await import("@/lib/qa-estado")
    const { etapas } = planRoadmap("crud", 1)
    expect(etapas).toHaveLength(8)
    expect(etapas[0]?.id).toBe("setup")
    expect(etapas.slice(1).every((e) => e.id.startsWith("crud-"))).toBe(true)
  })

  it("alcance desconocido → plan vacío", async () => {
    const { planRoadmap } = await import("@/lib/qa-estado")
    const { etapas, totalMinutos } = planRoadmap("otro", 1)
    expect(etapas).toEqual([])
    expect(totalMinutos).toBe(0)
  })

  it("factor 1.4 escala los estimados con precisión de 0.1", async () => {
    const { planRoadmap } = await import("@/lib/qa-estado")
    const { etapas } = planRoadmap("smoke", 1.4)
    const setup = etapas.find((e) => e.id === "setup")
    const smoke = etapas.find((e) => e.id === "smoke")
    expect(setup?.minutosEstimados).toBe(1.4)
    expect(smoke?.minutosEstimados).toBe(3.5)
  })

  it("merge de baselinesEtapa pisa el default y preserva las demás", async () => {
    const { planRoadmap } = await import("@/lib/qa-estado")
    const { etapas } = planRoadmap("suite completa", 1.4, {
      smoke: { minutosBase: 99, fuente: "medido 2026-09-01" },
    })
    const smoke = etapas.find((e) => e.id === "smoke")
    const auth = etapas.find((e) => e.id === "auth")
    expect(smoke?.minutosBase).toBe(99)
    expect(smoke?.minutosEstimados).toBe(138.6)
    expect(auth?.minutosBase).toBe(2.5)
  })
})

describe("getQaRoadmapData (GET /api/qa-roadmap)", () => {
  it("runs sin etapas no rompen la consulta; memoria viene del run con etapas", async () => {
    seedQaEstado({
      runs: [
        runFactory("run-viejo-sin-etapas"),
        runFactory("run-con-etapas", {
          fecha: "2026-09-02T10:00:00-04:00",
          etapas: [
            {
              id: "flujo",
              nombre: "El Poblador",
              chispa: "chispa",
              comando: "npx playwright test e2e/flujo/",
              specGlobs: ["e2e/flujo/"],
              minutosBase: 3.6,
              minutosEstimados: 3.6,
              orden: 4,
              estado: "fallida",
              duracionRealMin: 5,
              nota: "server frío",
              fallos: [{ archivo: "e2e/flujo/ciclo.spec.ts", test: "ciclo", causa: "timeout bajo carga" }],
            },
            {
              id: "smoke",
              nombre: "El Tour",
              chispa: "chispa",
              comando: "npx playwright test e2e/smoke/",
              specGlobs: ["e2e/smoke/"],
              minutosBase: 2.5,
              minutosEstimados: 2.5,
              orden: 2,
              estado: "ok",
              duracionRealMin: 2,
              nota: "impecable",
            },
          ],
        }),
      ],
    })
    const { getQaRoadmapData } = await import("@/lib/qa-estado")
    const data = getQaRoadmapData("suite completa")
    expect(data.live).toBeNull()
    expect(data.runReferenciaId).toBe("run-con-etapas")
    const flujo = data.etapas.find((e) => e.id === "flujo")
    const smoke = data.etapas.find((e) => e.id === "smoke")
    const setup = data.etapas.find((e) => e.id === "setup")
    expect(flujo?.estado).toBe("fallida")
    expect(flujo?.duracionRealMin).toBe(5)
    expect(flujo?.historico).toEqual({ fecha: "2026-09-02T10:00:00-04:00", causa: "timeout bajo carga" })
    expect(flujo?.nota).toBe("server frío")
    expect(smoke?.estado).toBe("ok")
    expect(smoke?.nota).toBe("impecable")
    expect(setup?.estado).toBe("pendiente")
    expect(setup?.historico).toBeNull()
    expect(setup?.nota).toBeNull()
  })

  it("mergea baselinesEtapa persistidas en qa-estado.json", async () => {
    seedQaEstado({
      runs: [],
      baselinesEtapa: { flujo: { minutosBase: 9, fuente: "medido 2026-09-02" } },
    })
    const { getQaRoadmapData } = await import("@/lib/qa-estado")
    const data = getQaRoadmapData("suite completa")
    const flujo = data.etapas.find((e) => e.id === "flujo")
    expect(flujo?.minutosBase).toBe(9)
    expect(flujo?.minutosEstimados).toBe(Math.round(9 * data.factorCarga * 10) / 10)
  })

  it("qa-estado.json inexistente → plan con nodos sin memoria", async () => {
    const { getQaRoadmapData } = await import("@/lib/qa-estado")
    const data = getQaRoadmapData("smoke")
    expect(data.etapas.map((e) => e.id)).toEqual(["setup", "smoke"])
    expect(data.live).toBeNull()
    expect(data.runReferenciaId).toBeNull()
    expect(data.etapas.every((e) => e.estado === "pendiente" && e.historico === null && e.nota === null)).toBe(true)
  })
})

describe("getQaRoadmapLive", () => {
  it("sin archivo → null", async () => {
    const { getQaRoadmapLive } = await import("@/lib/qa-estado")
    expect(getQaRoadmapLive()).toBeNull()
  })

  it("archivo viejo (>5 min) → null", async () => {
    fsState.files.set(QA_ROADMAP_LIVE_PATH, JSON.stringify({ runId: "r1", etapas: [] }))
    fsState.mtimeMs = Date.now() - 6 * 60 * 1000
    const { getQaRoadmapLive } = await import("@/lib/qa-estado")
    expect(getQaRoadmapLive()).toBeNull()
  })

  it("archivo fresco → contenido parseado", async () => {
    const live = {
      runId: "2026-09-03-smoke-1200",
      alcance: "smoke",
      modo: "seguido",
      iniciado: "2026-09-03T12:00:00-04:00",
      etapas: [{ id: "smoke", estado: "en_curso", passed: 3, total: 8 }],
      testActual: "e2e/smoke/modulos.spec.ts > módulo finanzas",
    }
    fsState.files.set(QA_ROADMAP_LIVE_PATH, JSON.stringify(live))
    const { getQaRoadmapLive } = await import("@/lib/qa-estado")
    expect(getQaRoadmapLive()).toEqual(live)
  })
})

describe("guardarNotaEtapa (POST accion=nota)", () => {
  it("valida runId/etapaId/texto", async () => {
    const { guardarNotaEtapa } = await import("@/lib/qa-estado")
    expect(guardarNotaEtapa("", "auth", "texto").ok).toBe(false)
    expect(guardarNotaEtapa("run-1", "", "texto").ok).toBe(false)
    expect(guardarNotaEtapa("run-1", "auth", "   ").ok).toBe(false)
    expect(guardarNotaEtapa("run-1", "auth", "texto").ok).toBe(false)
  })

  it("run inexistente y etapa ausente en el run → error", async () => {
    seedQaEstado({ runs: [runFactory("run-1", { etapas: [{ id: "smoke", estado: "ok", orden: 2 }] })] })
    const { guardarNotaEtapa } = await import("@/lib/qa-estado")
    const sinRun = guardarNotaEtapa("no-existe", "auth", "texto")
    expect(sinRun.ok).toBe(false)
    const sinEtapa = guardarNotaEtapa("run-1", "auth", "texto")
    expect(sinEtapa.ok).toBe(false)
  })

  it("persiste la nota en el run y respeta MAX_RUNS al escribir", async () => {
    const runs = Array.from({ length: 11 }, (_, i) => runFactory(`run-${i}`))
    runs[10] = runFactory("run-actual", {
      etapas: [
        {
          id: "auth",
          estado: "ok",
          orden: 3,
          minutosBase: 2.5,
          minutosEstimados: 2.5,
          nombre: "El Guardián de Cuentas",
          chispa: "chispa",
          comando: "npx playwright test e2e/auth/",
          specGlobs: ["e2e/auth/"],
        },
      ],
    })
    seedQaEstado({ runs })
    const { guardarNotaEtapa } = await import("@/lib/qa-estado")
    const res = guardarNotaEtapa("run-actual", "auth", "  Redirects a /ingresar ok  ")
    expect(res.ok).toBe(true)
    const escrito = JSON.parse(fsState.files.get(QA_ESTADO_PATH) ?? "{}")
    expect(escrito.runs).toHaveLength(10)
    expect(escrito.runs[9].id).toBe("run-actual")
    expect(escrito.runs[9].etapas[0].nota).toBe("Redirects a /ingresar ok")
  })
})

describe("recalibrarBaselineEtapa (POST accion=recalibrar)", () => {
  it("valida etapa desconocida y minutosReales inválidos", async () => {
    seedQaEstado({ runs: [] })
    const { recalibrarBaselineEtapa } = await import("@/lib/qa-estado")
    expect(recalibrarBaselineEtapa("no-es-etapa", 2).ok).toBe(false)
    expect(recalibrarBaselineEtapa("smoke", 0).ok).toBe(false)
    expect(recalibrarBaselineEtapa("smoke", -1).ok).toBe(false)
    expect(recalibrarBaselineEtapa("smoke", Number.NaN).ok).toBe(false)
    expect(recalibrarBaselineEtapa("", 2).ok).toBe(false)
  })

  it("pisa el baseline de la etapa y preserva los otros", async () => {
    seedQaEstado({
      runs: [],
      baselinesEtapa: { setup: { minutosBase: 1.2, fuente: "medido 2026-08-29" } },
    })
    const { recalibrarBaselineEtapa } = await import("@/lib/qa-estado")
    const res = recalibrarBaselineEtapa("smoke", 2.02)
    expect(res.ok).toBe(true)
    const escrito = JSON.parse(fsState.files.get(QA_ESTADO_PATH) ?? "{}")
    expect(escrito.baselinesEtapa.setup).toEqual({ minutosBase: 1.2, fuente: "medido 2026-08-29" })
    expect(escrito.baselinesEtapa.smoke.minutosBase).toBe(2)
    expect(escrito.baselinesEtapa.smoke.fuente).toMatch(/^medido \d{4}-\d{2}-\d{2}T/)
  })
})
