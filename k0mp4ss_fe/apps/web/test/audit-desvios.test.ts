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

import {
  EXCEPCIONES,
  auditar,
  clavesDeMatriz,
  hermanosGranulares,
  recursosDeclarados,
} from "../scripts/audit-desvios.mjs"

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

describe("R1 · raíz desnuda con hermanos granulares", () => {
  it("lee los hermanos granulares de una raíz y no inventa los que no existen", () => {
    const claves = clavesDeMatriz(AUTHZ_MIN)
    expect(hermanosGranulares(claves, "in")).toEqual(["in:apelar"])
    expect(hermanosGranulares(claves, "fi")).toEqual([])
  })

  it("reporta la raíz desnuda y nombra la ruta, el recurso usado y el hermano granular", () => {
    const raiz = crearRaiz({
      "lib/authz.ts": AUTHZ_MIN,
      "app/api/in/denuncias/route.ts": `import { puede } from "@/lib/authz"

export function GET(rol: string) {
  if (!puede(rol, "ver", "in")) return null
  return { ok: true }
}
`,
    })
    const hallazgos = hallazgosDe(raiz, "R1")
    expect(hallazgos).toHaveLength(1)
    const [hallazgo] = hallazgos
    expect(hallazgo?.archivo).toBe("app/api/in/denuncias/route.ts")
    expect(hallazgo?.linea).toBe(4)
    // El mensaje dice qué recurso se usó, qué hermano granular existe y qué hacer.
    expect(hallazgo?.detalle).toContain('raíz desnuda "in"')
    expect(hallazgo?.detalle).toContain('"in:apelar"')
    expect(hallazgo?.accion).toContain('"in:apelar"')
  })

  it("acepta el recurso granular de la misma raíz", () => {
    const raiz = crearRaiz({
      "lib/authz.ts": AUTHZ_MIN,
      "app/api/in/infracciones/route.ts": `import { puede } from "@/lib/authz"

export function POST(rol: string) {
  if (!puede(rol, "crear", "in:apelar")) return null
  return { ok: true }
}
`,
    })
    expect(hallazgosDe(raiz, "R1")).toHaveLength(0)
  })

  it("la entrada de baseline cubre solo las rutas que nombra", () => {
    const raiz = crearRaiz({
      "lib/authz.ts": AUTHZ_MIN,
      "app/api/in/denuncias/route.ts": `import { puede } from "@/lib/authz"

export function GET(rol: string) {
  return puede(rol, "ver", "in")
}
`,
      "app/api/in/consultas/route.ts": `import { puede } from "@/lib/authz"

export function GET(rol: string) {
  return puede(rol, "ver", "in")
}
`,
    })
    // Sin allowlist, las dos rutas son hallazgo.
    expect(
      auditar({ raiz, excepciones: { R1: [] } }).filter((h) => h.regla === "R1")
    ).toHaveLength(2)

    const conBaseline = auditar({
      raiz,
      excepciones: {
        R1: [
          {
            recurso: "in",
            rutas: ["app/api/in/denuncias/route.ts"],
            motivo: "estado medido: la ruta base del módulo usa la raíz",
          },
        ],
      },
    }).filter((h) => h.regla === "R1")
    // La ruta listada se acepta; la que no está en la lista sigue siendo hallazgo.
    expect(conBaseline).toHaveLength(1)
    expect(conBaseline[0]?.archivo).toBe("app/api/in/consultas/route.ts")
  })

  it("no reporta la raíz desnuda en una página de UI (el guard de ruta vive en app/api)", () => {
    const raiz = crearRaiz({
      "lib/authz.ts": AUTHZ_MIN,
      "app/comunidad/page.tsx": `import { puede } from "@/lib/authz"

export function Panel({ rol }: { rol: string }) {
  return puede(rol, "ver", "in") ? null : null
}
`,
    })
    expect(hallazgosDe(raiz, "R1")).toHaveLength(0)
  })

  it("`pe` ya no tiene baseline de raíz desnuda: las cuatro familias piden su recurso granular", () => {
    type EntradaBaseline = { recurso?: string; rutas?: string[] }
    const pe = (EXCEPCIONES.R1 as EntradaBaseline[]).find(
      (excepcion) => excepcion.recurso === "pe"
    )
    // Decisión del owner 2026-11-05: bitacora-visitas → `pe:bitacora`,
    // cierres-turno → `pe:cierre_turno`, encomiendas → `pe:encomienda`,
    // ingresos-contratistas → `pe:ingreso_contratista`. Ninguna ruta PE queda
    // heredando la raíz, así que la entrada del baseline desapareció.
    expect(pe).toBeUndefined()
  })

  it("el repo real queda en verde con el baseline (la deuda de `pe` está cubierta)", () => {
    expect(hallazgosDe(RAIZ_APP, "R1")).toHaveLength(0)
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

describe("R6 · búsqueda por LIKE sin comodines escapados", () => {
  it("reporta el contains armado con el término de búsqueda y sin rechazo declarado", () => {
    const raiz = crearRaiz({
      "app/api/personas/buscar/route.ts": `import { prisma } from "@/lib/prisma"

export async function GET(q: string) {
  const personas = await prisma.persona.findMany({
    where: { OR: [{ nombreCompleto: { contains: q } }] },
  })
  return personas
}
`,
    })
    const hallazgos = hallazgosDe(raiz, "R6")
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]?.archivo).toBe("app/api/personas/buscar/route.ts")
    expect(hallazgos[0]?.detalle).toContain('contains sobre "q"')
    expect(hallazgos[0]?.accion).toContain("COMODINES_LIKE")
  })

  it("no reporta la ruta que declara el rechazo de % y _ con .test(", () => {
    const raiz = crearRaiz({
      "app/api/personas/buscar/route.ts": `import { prisma } from "@/lib/prisma"

const COMODINES_LIKE = /[%_]/

export async function GET(q: string) {
  if (COMODINES_LIKE.test(q)) return null
  return prisma.persona.findMany({
    where: { OR: [{ nombreCompleto: { contains: q } }] },
  })
}
`,
    })
    expect(hallazgosDe(raiz, "R6")).toHaveLength(0)
  })

  it("no reporta el contains con un literal fijo (no es término de búsqueda)", () => {
    const raiz = crearRaiz({
      "app/api/inventario/route.ts": `import { prisma } from "@/lib/prisma"

export async function GET() {
  return prisma.item.findMany({
    where: { nombre: { contains: "literal fijo" } },
  })
}
`,
    })
    expect(hallazgosDe(raiz, "R6")).toHaveLength(0)
  })

  it("no repite el hallazgo cuando una misma línea arma dos contains del mismo término", () => {
    const raiz = crearRaiz({
      "app/api/personas/buscar/route.ts": `import { prisma } from "@/lib/prisma"

export async function GET(q: string) {
  return prisma.persona.findMany({
    where: { OR: [{ nombreCompleto: { contains: q } }, { rut: { contains: q } }] },
  })
}
`,
    })
    const hallazgos = hallazgosDe(raiz, "R6")
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]?.detalle).toContain("nombreCompleto")
  })

  it("la allowlist de R6 nombra exactamente las seis rutas medidas, cada una con su motivo", () => {
    const rutasMedidas = [
      "app/api/personas/route.ts",
      "app/api/fi/route.ts",
      "app/api/auditoria/route.ts",
      "app/api/pe/unidades/route.ts",
      "app/api/pe/personas/route.ts",
      "app/api/convenios/unidades-con-deuda/route.ts",
    ]
    const entradas = EXCEPCIONES.R6 ?? []
    expect(entradas.map((e) => e.archivo).sort()).toEqual([...rutasMedidas].sort())
    expect(entradas.every((e) => e.motivo.trim().length > 0)).toBe(true)
  })
})

describe("R7 · hook de colección que fija el techo sin palanca", () => {
  // Censo medido el 2026-11-16 sobre el árbol real (ver "el repo real, sin allowlist"):
  // ocho hooks en deuda + use-cobros-fi, falso positivo declarado de la regla textual.
  const HOOKS_MEDIDOS_R7 = [
    "lib/api/use-actas-gd.ts",
    "lib/api/use-avisos-cobro.ts",
    "lib/api/use-cobros-fi.ts",
    "lib/api/use-controles-propiedad.ts",
    "lib/api/use-maestros.ts",
    "lib/api/use-pe.ts",
    "lib/api/use-periodos-directiva.ts",
    "lib/api/use-resumen-fi.ts",
    "lib/api/use-vinculos.ts",
  ]

  it("reporta el hook que arma su propia petición paginada y no expone la palanca", () => {
    const raiz = crearRaiz({
      // Ruta de fixture sin choque con la allowlist: una ruta exceptuada queda silenciada.
      "lib/api/use-sonda-actas.ts": `"use client"

import useSWR from "swr"

const LISTA = "/api/sonda-actas"

/** Lista paginada de actas de la sonda (el servidor filtra por rol). */
export function useSondaActas() {
  const url = \`\${LISTA}?pageSize=100\`
  const { data, error, isLoading } = useSWR(url, traer)
  return { items: data?.data ?? [], error, isLoading }
}
`,
    })
    const hallazgos = hallazgosDe(raiz, "R7")
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]?.archivo).toBe("lib/api/use-sonda-actas.ts")
    expect(hallazgos[0]?.linea).toBe(9)
    expect(hallazgos[0]?.detalle).toContain("pageSize=100")
    expect(hallazgos[0]?.accion).toContain("todasLasPaginas")
  })

  it("no reporta el hook que expone la palanca, con todasLasPaginas o con cargarMas", () => {
    const conOpcion = crearRaiz({
      "lib/api/use-sonda-actas.ts": `"use client"

import useSWR from "swr"

const LISTA = "/api/sonda-actas"

export interface UseSondaActasOpciones {
  /** Completa la colección pidiendo las páginas siguientes hasta agotar el total. */
  todasLasPaginas?: boolean
}

export function useSondaActas(opciones: UseSondaActasOpciones = {}) {
  const url = \`\${LISTA}?pageSize=100\`
  const completa = opciones.todasLasPaginas === true
  const { data } = useSWR(url, traer)
  return { items: completa ? (data?.data ?? []) : [], error: null }
}
`,
    })
    const conFuncion = crearRaiz({
      "lib/api/use-sonda-actas.ts": `"use client"

import useSWR from "swr"

const LISTA = "/api/sonda-actas"

export function useSondaActas() {
  const url = \`\${LISTA}?pageSize=100\`
  const { data, mutate } = useSWR(url, traer)
  const cargarMas = async () => {
    await mutate()
  }
  return { items: data?.data ?? [], cargarMas }
}
`,
    })
    expect(hallazgosDe(conOpcion, "R7")).toHaveLength(0)
    expect(hallazgosDe(conFuncion, "R7")).toHaveLength(0)
  })

  it("la mención del techo en un doc comment no lo fija: mencionar no es armar la petición", () => {
    const raiz = crearRaiz({
      "lib/api/use-sonda-lectura.ts": `"use client"

import useSWR from "swr"

/**
 * Lista de lectura. Sin opciones la petición es la de siempre (\`?pageSize=100\`),
 * la misma clave SWR de los consumidores que ya existían.
 */
const LISTA = "/api/sonda-lectura"

export function useSondaLectura() {
  const { data } = useSWR(LISTA, traer)
  return { items: data?.data ?? [] }
}
`,
    })
    expect(hallazgosDe(raiz, "R7")).toHaveLength(0)
  })

  it("la constante interpolada en la URL fija el techo, pero sólo si vale 100", () => {
    const fijaCien = crearRaiz({
      "lib/api/use-sonda-padron.ts": `"use client"

import useSWR from "swr"

const LISTA = "/api/sonda-padron"

/** Techo por petición de la colección de la sonda. */
const PAGE_SIZE_SONDA = 100

export function useSondaPadron() {
  const url = \`\${LISTA}?pageSize=\${PAGE_SIZE_SONDA}\`
  const { data } = useSWR(url, traer)
  return { items: data?.data ?? [] }
}
`,
    })
    const fijaVeinticinco = crearRaiz({
      "lib/api/use-sonda-busqueda.ts": `"use client"

import useSWR from "swr"

const LISTA = "/api/sonda-busqueda"

/** Tamaño de página de la búsqueda: el resto la resuelve el servidor con \`q\`. */
const PAGE_SIZE_BUSQUEDA_SONDA = 25

export function useSondaBusqueda() {
  const url = \`\${LISTA}?q=x&pageSize=\${PAGE_SIZE_BUSQUEDA_SONDA}\`
  const { data } = useSWR(url, traer)
  return { items: data?.data ?? [] }
}
`,
    })
    const fija = hallazgosDe(fijaCien, "R7")
    expect(fija).toHaveLength(1)
    expect(fija[0]?.linea).toBe(11)
    expect(hallazgosDe(fijaVeinticinco, "R7")).toHaveLength(0)
  })

  it("la regla es textual: delegar en el factory sin nombrar la palanca se registra como falso positivo declarado, no se silencia con heurística", () => {
    const contenido = `"use client"

import { useCrudCollection, type CrudCollection } from "./use-crud-collection"

const BASE = "/api/sonda-cobros"

export function useSondaCobros(): CrudCollection<{ id: string }> {
  const params = new URLSearchParams({ pageSize: "100" })
  return useCrudCollection("/api/sonda-cobros", params.toString())
}
`
    // Con una ruta sin entrada en la allowlist, la regla textual lo reporta.
    const sonda = crearRaiz({ "lib/api/use-sonda-cobros.ts": contenido })
    expect(hallazgosDe(sonda, "R7")).toHaveLength(1)
    // El caso real del árbol (misma forma, ruta allowlistada) queda declarado, no tapado:
    // el silencio vive en la entrada de EXCEPCIONES_R7, que documenta por qué no es deuda.
    const real = crearRaiz({ "lib/api/use-cobros-fi.ts": contenido })
    expect(hallazgosDe(real, "R7")).toHaveLength(0)

    const propia = crearRaiz({
      "lib/api/use-sonda-cobros.ts": `"use client"

import useSWR from "swr"

const BASE = "/api/sonda-cobros"

export function useSondaCobros() {
  const params = new URLSearchParams({ pageSize: "100" })
  const { data } = useSWR(\`\${BASE}?\${params.toString()}\`, traer)
  return { items: data?.data ?? [] }
}
`,
    })
    const hallazgos = hallazgosDe(propia, "R7")
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]?.linea).toBe(8)
  })

  it("hasMore solo no es la palanca: el booleano sin la función que completa sigue siendo hallazgo", () => {
    const raiz = crearRaiz({
      "lib/api/use-sonda-activos.ts": `"use client"

import useSWR from "swr"

const LISTA = "/api/sonda-activos"

export function useSondaActivos() {
  const url = \`\${LISTA}?pageSize=100\`
  const { data } = useSWR(url, traer)
  const total = data?.total ?? 0
  const hasMore = (data?.data?.length ?? 0) < total
  return { items: data?.data ?? [], hasMore }
}
`,
    })
    const hallazgos = hallazgosDe(raiz, "R7")
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]?.linea).toBe(8)
  })

  it("no mira los dos helpers que son la palanca o la completan", () => {
    const raiz = crearRaiz({
      "lib/api/use-crud-collection.ts": `export function useCrudCollection<T extends { id: string }>(base: string) {
  const url = \`\${base}?pageSize=100\`
  return { url, items: [] as T[] }
}
`,
      "lib/api/use-coleccion-completa.ts": `const PAGE_SIZE_COLECCION = 100

export function useColeccionCompleta(base: string) {
  const url = \`\${base}?pageSize=\${PAGE_SIZE_COLECCION}\`
  return { url, completa: false }
}
`,
    })
    expect(hallazgosDe(raiz, "R7")).toHaveLength(0)
  })

  it("la allowlist de R7 nombra exactamente los nueve hooks medidos, cada uno con su motivo", () => {
    const entradas = (EXCEPCIONES.R7 ?? []) as { archivo?: string; motivo: string }[]
    expect(entradas.map((e) => e.archivo).sort()).toEqual([...HOOKS_MEDIDOS_R7].sort())
    expect(entradas.every((e) => e.motivo.trim().length > 0)).toBe(true)
    expect(entradas.every((e) => e.motivo.includes("Estado medido"))).toBe(true)
  })

  it("el repo real, sin allowlist, da exactamente los nueve hallazgos medidos", () => {
    const sinAllowlist = auditar({ raiz: RAIZ_APP, excepciones: { R7: [] } }).filter(
      (h) => h.regla === "R7"
    )
    expect(sinAllowlist.map((h) => h.archivo).sort()).toEqual([...HOOKS_MEDIDOS_R7].sort())
    expect(sinAllowlist.every((h) => h.linea > 0)).toBe(true)
  })

  it("el repo real queda en verde con la allowlist medida", () => {
    expect(hallazgosDe(RAIZ_APP, "R7")).toHaveLength(0)
  })
})

