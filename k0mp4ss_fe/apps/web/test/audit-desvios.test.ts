/**
 * test/audit-desvios.test.ts — contrato del candado `npm run audit:desvios`.
 *
 * Cada regla se prueba con fixtures mínimos en `os.tmpdir()` (nunca sobre el repo) y en dos
 * direcciones: detecta el patrón, y NO lo reporta cuando la excepción está justificada.
 * El objetivo es que el candado no se pueda "arreglar" aflojándolo: si alguien borra una
 * heurística o una excepción, acá se cae.
 */

import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

import { auditar, recursosDeclarados } from "../scripts/audit-desvios.mjs"

type Archivos = Record<string, string>

const RAIZ_APP = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const SCRIPT = join(RAIZ_APP, "scripts", "audit-desvios.mjs")

/** MATRIZ mínima: `fi` declarado, `in:apelar` declara también su raíz `in`. */
const AUTHZ_MIN = `export const ROLES = ["administrador", "comite"] as const

const MATRIZ = {
  administrador: {
    "*": new Set<Accion>(["ver", "crear", "editar", "eliminar", "ejecutar"]),
  },
  comite: {
    "fi": new Set<Accion>(["ver"]),
    "in:apelar": new Set<Accion>(["crear"]),
  },
}
`

const raicesCreadas: string[] = []

function crearRaiz(archivos: Archivos): string {
  const raiz = mkdtempSync(join(tmpdir(), "audit-desvios-"))
  raicesCreadas.push(raiz)
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const absoluta = join(raiz, ruta)
    mkdirSync(dirname(absoluta), { recursive: true })
    writeFileSync(absoluta, contenido, "utf8")
  }
  return raiz
}

function hallazgosDe(raiz: string, regla: string) {
  return auditar({ raiz }).filter((h) => h.regla === regla)
}

afterEach(() => {
  for (const raiz of raicesCreadas.splice(0))
    rmSync(raiz, { recursive: true, force: true })
})

describe("R1 · recursos de permisos", () => {
  it("lee de la MATRIZ las claves y la raíz de cada recurso granular", () => {
    const declarados = recursosDeclarados(AUTHZ_MIN)
    expect(declarados.has("fi")).toBe(true)
    expect(declarados.has("in:apelar")).toBe(true)
    // La raíz se declara para que `puede()` resuelva el fallback de prefijo.
    expect(declarados.has("in")).toBe(true)
    // El wildcard no declara nada: es lo que hace invisible el defecto.
    expect(declarados.has("*")).toBe(false)
  })

  it("reporta el recurso que solo el wildcard del admin alcanza", () => {
    const raiz = crearRaiz({
      "lib/authz.ts": AUTHZ_MIN,
      "app/api/x/route.ts": `import { puede } from "@/lib/authz"

export function GET(rol: string) {
  const ok = puede(rol, "ver", "zzz")
  return ok
}
`,
    })
    const hallazgos = hallazgosDe(raiz, "R1")
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]?.detalle).toContain('"zzz"')
    expect(hallazgos[0]?.archivo).toBe("app/api/x/route.ts")
    expect(hallazgos[0]?.linea).toBe(4)
  })

  it("no reporta recursos declarados ni constantes que resuelven a un recurso declarado", () => {
    const raiz = crearRaiz({
      "lib/authz.ts": AUTHZ_MIN,
      "app/api/y/route.ts": `import { puede, puedeContextual } from "@/lib/authz"

export const RECURSO_PROPIO = "FI"

export function GET(rol: string) {
  return puede(rol, "ver", "fi") || puedeContextual(rol, "ver", RECURSO_PROPIO, {})
}
`,
    })
    expect(hallazgosDe(raiz, "R1")).toHaveLength(0)
  })

  it("la allowlist exceptúa por recurso, no por archivo", () => {
    const plataforma = crearRaiz({
      "lib/authz.ts": AUTHZ_MIN,
      "app/api/admin/route.ts": `import { puede } from "@/lib/authz"

export function GET(rol: string) {
  return puede(rol, "ver", "admin:usuarios")
}
`,
    })
    // `admin:usuarios` es capacidad de plataforma y ya está en la allowlist real.
    expect(hallazgosDe(plataforma, "R1")).toHaveLength(0)

    const otraCapacidad = crearRaiz({
      "lib/authz.ts": AUTHZ_MIN,
      "app/api/admin/route.ts": `import { puede } from "@/lib/authz"

export function GET(rol: string) {
  return puede(rol, "ver", "admin:roles")
}
`,
    })
    // Mismo archivo, recurso distinto: la excepción no lo tapa.
    expect(hallazgosDe(otraCapacidad, "R1")).toHaveLength(1)

    const conExcepcion = auditar({
      raiz: otraCapacidad,
      excepciones: {
        R1: [{ recurso: "admin:roles", motivo: "capacidad de plataforma" }],
      },
    })
    expect(conExcepcion.filter((h) => h.regla === "R1")).toHaveLength(0)
  })
})

describe("R2 · marcadores de postergación", () => {
  it("reporta el pendiente escrito en el código (con y sin tilde)", () => {
    const raiz = crearRaiz({
      "lib/authz.ts": AUTHZ_MIN,
      "app/api/infracciones/route.ts": `// Residentes: desvio declarado, se abre cuando RP lo otorgue.
export function GET() {
  // se deja solo admin hasta que RP lo revise
  return null
}
`,
    })
    const hallazgos = hallazgosDe(raiz, "R2")
    expect(hallazgos.length).toBeGreaterThanOrEqual(2)
    expect(
      hallazgos.every((h) => h.archivo === "app/api/infracciones/route.ts")
    ).toBe(true)
  })

  it("no reporta la mención que documenta una decisión ya cerrada (allowlist)", () => {
    const raiz = crearRaiz({
      "lib/reloj.ts": "// Tolerancia por desvío de reloj del TOTP (±1 paso).\n",
    })
    const excepciones = {
      R2: [
        {
          archivo: "lib/reloj.ts",
          fragmento: "desvío de reloj",
          motivo: "deriva de reloj, no un permiso",
        },
      ],
    }
    expect(hallazgosDe(raiz, "R2")).toHaveLength(1)
    expect(
      auditar({ raiz, excepciones }).filter((h) => h.regla === "R2")
    ).toHaveLength(0)
  })

  it("la allowlist real cubre el falso positivo del reloj del TOTP", () => {
    const raiz = crearRaiz({
      "lib/two-factor.ts":
        "// Acepta ventana ±1 paso (90s) para tolerar desvío de reloj.\n",
    })
    expect(hallazgosDe(raiz, "R2")).toHaveLength(0)
  })
})

describe("R3 · tests apagados", () => {
  it("reporta el skip sin motivo y la aserción complaciente", () => {
    const raiz = crearRaiz({
      "test/apagado.test.ts": `import { it, expect } from "vitest"

it.skip("no corre", () => {
  expect(true).toBe(true)
})
`,
    })
    const hallazgos = hallazgosDe(raiz, "R3")
    expect(hallazgos.map((h) => h.linea)).toEqual([3, 4])
  })

  it("acepta el motivo en la línea anterior y el skip condicionado por entorno", () => {
    const raiz = crearRaiz({
      "test/justificado.test.ts": `import { it, test } from "vitest"

// Motivo: el flujo exige SMTP real y rompería la suite local.
it.skip("envío de correo", () => {})

test.skip(process.env.E2E_SMTP !== "1", "necesita E2E_SMTP=1")
`,
    })
    expect(hallazgosDe(raiz, "R3")).toHaveLength(0)
  })
})

describe("R4 · truncamientos silenciosos", () => {
  it("reporta el recorte de una lista que no avisa cuántos quedan fuera", () => {
    const raiz = crearRaiz({
      "app/finanzas/page.tsx": `export function Panel({ personas }: { personas: string[] }) {
  const primeras = personas.slice(0, 5)
  return <ul>{primeras.map((p) => <li key={p}>{p}</li>)}</ul>
}
`,
    })
    const hallazgos = hallazgosDe(raiz, "R4")
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]?.linea).toBe(2)
  })

  it("no reporta recortes de texto (fechas, ids, mensajes)", () => {
    const raiz = crearRaiz({
      "app/fechas/page.tsx": `export function hoy() {
  return new Date().toISOString().slice(0, 10)
}
`,
      "app/ids/page.tsx": `export function id() {
  return \`bono-\${randomUUID().slice(0, 8)}\`
}
`,
    })
    expect(hallazgosDe(raiz, "R4")).toHaveLength(0)
  })

  it("no reporta si el archivo monta AvisoTruncamiento o cuenta el total", () => {
    const conAviso = crearRaiz({
      "components/pe/panel.tsx": `import { AvisoTruncamiento, LIMITE_SELECT } from "@/components/pe/aviso-truncamiento"

export function Panel({ personas }: { personas: string[] }) {
  const visibles = personas.slice(0, LIMITE_SELECT)
  return <><ul>{visibles.map((p) => <li key={p}>{p}</li>)}</ul><AvisoTruncamiento mostrados={visibles.length} total={personas.length} /></>
}
`,
    })
    const conConteo = crearRaiz({
      "app/finanzas/otro.tsx": `export function Panel({ personas }: { personas: string[] }) {
  const primeras = personas.slice(0, 5)
  return <p>Mostrando {primeras.length} de {personas.length} personas</p>
}
`,
    })
    expect(hallazgosDe(conAviso, "R4")).toHaveLength(0)
    expect(hallazgosDe(conConteo, "R4")).toHaveLength(0)
  })
})

describe("R5 · catch vacío que confirma éxito", () => {
  it("reporta el catch que se traga el error y devuelve ok", () => {
    const raiz = crearRaiz({
      "app/api/guardar/route.ts": `import { NextResponse } from "next/server"

export async function POST() {
  try {
    await prisma.x.upsert({})
  } catch {
  }
  return NextResponse.json({ ok: true })
}
`,
    })
    const hallazgos = hallazgosDe(raiz, "R5")
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]?.linea).toBe(6)
  })

  it("no reporta el catch que falla cerrado", () => {
    const raiz = crearRaiz({
      "app/api/cerrado/route.ts": `import { NextResponse } from "next/server"

export async function POST() {
  try {
    await prisma.x.upsert({})
  } catch {
  }
  return NextResponse.json({ ok: false }, { status: 500 })
}
`,
    })
    expect(hallazgosDe(raiz, "R5")).toHaveLength(0)
  })

  it("no reporta el catch vacío que no confirma nada", () => {
    const raiz = crearRaiz({
      "app/api/limpio/route.ts": `export async function limpiar() {
  await prisma.x.delete({}).catch(() => {})
}
`,
    })
    expect(hallazgosDe(raiz, "R5")).toHaveLength(0)
  })
})

describe("CLI", () => {
  it("sale 1 con hallazgos y 0 con un árbol limpio", () => {
    const limpio = crearRaiz({ "lib/authz.ts": AUTHZ_MIN })
    const sucio = crearRaiz({
      "lib/authz.ts": AUTHZ_MIN,
      "app/api/x/route.ts": `export function GET(rol: string) {
  return puede(rol, "ver", "zzz")
}
`,
    })
    const ok = spawnSync(process.execPath, [SCRIPT, "--raiz", limpio], {
      encoding: "utf8",
    })
    const falla = spawnSync(
      process.execPath,
      [SCRIPT, "--raiz", sucio, "--json"],
      { encoding: "utf8" }
    )

    expect(ok.status).toBe(0)
    expect(ok.stdout).toContain("RESUMEN: 0 hallazgos")

    expect(falla.status).toBe(1)
    const salida = JSON.parse(falla.stdout) as {
      hallazgos: unknown[]
      excepciones: Record<string, unknown[]>
    }
    expect(salida.hallazgos.length).toBeGreaterThan(0)
    // La allowlist viaja en el JSON: el reporte puede citar cada motivo.
    expect(salida.excepciones.R1).toBeDefined()
    expect(salida.excepciones.R1?.length).toBeGreaterThan(0)
  })
})
