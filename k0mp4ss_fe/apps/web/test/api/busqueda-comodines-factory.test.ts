// @vitest-environment node
/**
 * F44 — la búsqueda por texto del `crud-factory` rechaza los comodines de LIKE.
 *
 * F39 cerró las seis rutas de `app/api/**` que arman el `contains` a mano y dejó
 * afuera el camino compartido: `lib/api/crud-factory.ts` construye el `OR` de
 * `contains` con el término de la query y no lo rechazaba. Por ahí nacen las
 * colecciones nuevas, así que el hueco se reabría solo. Hoy `/api/unidades` es la
 * única colección que declara `busqueda:` (`numero`, `etiqueta` y `rolSii`), y esa
 * búsqueda alimenta los selectores de reservas, PE, GE y FI.
 *
 * Lo que este archivo mide:
 *
 *   · `q=%`, `q=__` y `q=a%b` responden 400 con el mensaje literal de la serie y
 *     sin filas; `101_` (un término legítimo con un comodín pegado) también: la
 *     guarda mira el carácter, no la forma del término;
 *   · un término normal devuelve las mismas filas que antes, sobre los TRES campos
 *     declarados: la medición de S3 no encontró ningún `numero`, `etiqueta` ni
 *     `rolSii` que use `_` —ni en la semilla, ni en el esquema, ni en los
 *     importadores—, así que ningún campo sale del `OR`. El envelope observado se
 *     imprime para que el diferencial contra el factory de HEAD sea literal;
 *   · sin `q`, con `q` vacío y con `q` en blanco la respuesta es exactamente la de
 *     antes (la guarda no convierte el browse en un 400);
 *   · una colección de la factory que no declara `busqueda:` sigue ignorando `q` igual
 *     que antes: la guarda vive donde se arma el `contains`, no en todas las colecciones;
 *   · R6 mira el punto `busqueda:` del factory: una copia del archivo real con la
 *     guarda arrancada produce hallazgo y el archivo real produce cero. La sonda se
 *     arma en un directorio temporal, nunca sobre el árbol de trabajo.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { cookieDeUsuario, invocarApi } from "../helpers/api-sesion"
import { auditar } from "../../scripts/audit-desvios.mjs"

const state = vi.hoisted(() => ({ cookie: "" }))
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(
      new Headers(
        state.cookie
          ? { cookie: state.cookie, "x-forwarded-proto": "http" }
          : { "x-forwarded-proto": "http" }
      )
    ),
}))

/** Mensaje exacto del rechazo: el mismo literal de los seis buscadores de F39. */
const MENSAJE_COMODINES = "El parámetro q no acepta los comodines % y _."

const COMUNIDAD = "f44-comunidad"
const USUARIO_ADMIN = "f44-usuario-admin"
const EMAIL_ADMIN = "f44-admin@test.cl"

interface SemillaUnidad {
  id: string
  numero: string
  etiqueta: string
  rolSii: string
}

/**
 * Formas reales de la semilla (`data/inventario/estructura.ts`): número de depto,
 * número de estacionamiento con guion, etiqueta de categoría y rol SII. Ninguna
 * usa `_`: es la medición de S3, y por eso los tres campos siguen en la búsqueda.
 */
const UNIDADES: SemillaUnidad[] = [
  { id: "f44-u-101", numero: "101", etiqueta: "Depto", rolSii: "123-A101" },
  { id: "f44-u-102", numero: "102", etiqueta: "Depto", rolSii: "123-A102" },
  { id: "f44-u-201", numero: "201", etiqueta: "Oficina", rolSii: "999-O201" },
  { id: "f44-u-E-001", numero: "E-001", etiqueta: "Estacionamiento", rolSii: "" },
]

const TODAS = UNIDADES.map((u) => u.id)

/** Colección de la factory que NO declara `busqueda:` (PRESERVE del camino compartido). */
const MACRO_SECTOR = "f44-macro-torre"

interface FilaUnidad {
  id: string
  numero: string
  etiqueta: string
  rolSii: string
  comunidadId: string
}

interface PaginaUnidades {
  data: FilaUnidad[]
  page: number
  pageSize: number
  total: number
}

interface CuerpoError {
  error?: string
  data?: unknown
}

/** GET a la colección real de unidades (factory incluido) con la query serializada. */
function pedir(query = ""): Promise<Response> {
  return invocarApi(import("@/app/api/unidades/route"), "GET", `unidades${query}`)
}

/** GET a una colección de la factory SIN `busqueda:` declarada. */
function pedirMacroSectores(query = ""): Promise<Response> {
  return invocarApi(
    import("@/app/api/macro-sectores/route"),
    "GET",
    `macro-sectores${query}`
  )
}

function buscar(q: string): Promise<Response> {
  return pedir(`?q=${encodeURIComponent(q)}`)
}

/**
 * Parte comparable del envelope: ids ordenados más la paginación declarada. Las
 * filas completas llevan `createdAt`/`updatedAt`, que no sirven para comparar una
 * corrida con otra.
 */
function resumen(j: PaginaUnidades) {
  return {
    ids: j.data.map((fila) => fila.id).sort(),
    page: j.page,
    pageSize: j.pageSize,
    total: j.total,
  }
}

async function json200(res: Response, contexto: string): Promise<PaginaUnidades> {
  expect(res.status, contexto).toBe(200)
  return (await res.json()) as PaginaUnidades
}

async function conSesion<T>(fn: () => Promise<T>): Promise<T> {
  state.cookie = await cookieDeUsuario(EMAIL_ADMIN)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "test-secret-12345678"

  await prisma.comunidad.create({
    data: { id: COMUNIDAD, nombre: "Comunidad F44", slug: COMUNIDAD },
  })
  await prisma.usuario.create({ data: { id: USUARIO_ADMIN, email: EMAIL_ADMIN } })
  await prisma.membresia.create({
    data: { usuarioId: USUARIO_ADMIN, comunidadId: COMUNIDAD, rol: "administrador" },
  })
  await prisma.unidad.createMany({
    data: UNIDADES.map((u) => ({
      ...u,
      comunidadId: COMUNIDAD,
      microSectorId: "f44-microsector",
      tipoUnidadId: "f44-tipo",
      metraje: 50,
      prorrateo: 0.01,
      estadoId: "vacante",
      servicios: {},
    })),
  })
  await prisma.macroSector.create({
    data: {
      id: MACRO_SECTOR,
      comunidadId: COMUNIDAD,
      nombre: "Torre única F44",
      etiqueta: "Torre",
    },
  })
}, 30_000)

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.unidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.macroSector.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.membresia.deleteMany({ where: { usuarioId: USUARIO_ADMIN } })
    await prisma.usuario.delete({ where: { id: USUARIO_ADMIN } }).catch(() => {})
    await prisma.comunidad.delete({ where: { id: COMUNIDAD } }).catch(() => {})
  } catch {
    // intencional: limpieza best-effort del padrón del test
  }
})

describe("F44 · GET /api/unidades rechaza los comodines de LIKE", () => {
  it("q=%, q=__, q=a%b y q=101_ responden 400 con el mensaje exacto y sin filas", async () => {
    await conSesion(async () => {
      for (const q of ["%", "__", "a%b", "101_"]) {
        const contexto = `q=${JSON.stringify(q)}`
        const res = await buscar(q)
        expect(res.status, contexto).toBe(400)
        const cuerpo = (await res.json()) as CuerpoError
        expect(cuerpo.error, contexto).toBe(MENSAJE_COMODINES)
        expect(cuerpo.data, contexto).toBeUndefined()
      }
    })
  })

  it("un término normal devuelve las mismas filas que antes, en los tres campos", async () => {
    await conSesion(async () => {
      const porNumero = await json200(await buscar("101"), "por numero")
      expect(resumen(porNumero)).toEqual({
        ids: ["f44-u-101"],
        page: 1,
        pageSize: 50,
        total: 1,
      })
      // Evidencia del diferencial (S4): la MISMA aserción corre contra el factory
      // de HEAD —sin guarda— y contra el de este cambio, y las dos imprimen esta
      // línea. La búsqueda normal no cambia; sólo la del comodín.
      console.log(`[F44 diferencial] q=101 → ${JSON.stringify(resumen(porNumero))}`)

      const porNumeroConGuion = await json200(await buscar("E-001"), "por numero con guion")
      expect(resumen(porNumeroConGuion)).toEqual({
        ids: ["f44-u-E-001"],
        page: 1,
        pageSize: 50,
        total: 1,
      })

      const porEtiqueta = await json200(await buscar("Depto"), "por etiqueta")
      expect(resumen(porEtiqueta)).toEqual({
        ids: ["f44-u-101", "f44-u-102"],
        page: 1,
        pageSize: 50,
        total: 2,
      })

      const porRolSii = await json200(await buscar("123-A"), "por rolSii")
      expect(resumen(porRolSii)).toEqual({
        ids: ["f44-u-101", "f44-u-102"],
        page: 1,
        pageSize: 50,
        total: 2,
      })
    })
  })

  it("sin q, con q vacío y con q en blanco responde exactamente lo de antes", async () => {
    await conSesion(async () => {
      const esperado = { ids: [...TODAS].sort(), page: 1, pageSize: 50, total: 4 }

      const sinQ = await json200(await pedir("?pageSize=50"), "sin q")
      expect(resumen(sinQ)).toEqual(esperado)

      const vacio = await json200(await pedir("?q=&pageSize=50"), "q vacío")
      expect(resumen(vacio)).toEqual(esperado)

      const blanco = await json200(await pedir("?q=%20%20&pageSize=50"), "q en blanco")
      expect(resumen(blanco)).toEqual(esperado)
    })
  })
})

describe("F44 · una colección sin busqueda: sigue ignorando q (PRESERVE)", () => {
  it("macro-sectores responde lo de siempre, también con q de comodines", async () => {
    // La guarda vive donde se arma el `contains` de la búsqueda declarada. Sin
    // `busqueda:` no hay patrón que armar, así que `q` se sigue ignorando igual que
    // antes (200 con la colección): el arreglo no cambia rutas que no buscan.
    await conSesion(async () => {
      for (const query of ["", "?q=%25", "?q=__", "?q=Torre"]) {
        const contexto = `macro-sectores ${query || "(sin q)"}`
        const res = await pedirMacroSectores(query)
        expect(res.status, contexto).toBe(200)
        const j = (await res.json()) as PaginaUnidades
        expect(j.total, contexto).toBe(1)
        expect(j.data.map((fila) => fila.id), contexto).toEqual([MACRO_SECTOR])
      }
    })
  })
})

describe("F44 · R6 mira el punto busqueda: del factory (S2)", () => {
  const RAIZ_APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
  const FACTORY = "lib/api/crud-factory.ts"
  const factoryReal = readFileSync(join(RAIZ_APP, FACTORY), "utf8")

  /** Declaración de la guarda y bloque del rechazo, tal como viven en el factory. */
  const CONST_GUARDA = /const COMODINES_LIKE = \/\[%_\]\/\n/
  const BLOQUE_GUARDA =
    /if \(q && camposBusqueda\.length > 0 && COMODINES_LIKE\.test\(q\)\) \{\n\s*return jsonError\(400, "El parámetro q no acepta los comodines % y _\."\)\n\s*\}/

  /** Audita una copia del factory en un directorio temporal y devuelve sólo R6. */
  function hallazgosR6De(contenido: string) {
    const raiz = mkdtempSync(join(tmpdir(), "f44-factory-"))
    try {
      mkdirSync(dirname(join(raiz, FACTORY)), { recursive: true })
      writeFileSync(join(raiz, FACTORY), contenido, "utf8")
      return auditar({ raiz }).filter(
        (h: { regla: string }) => h.regla === "R6"
      ) as { regla: string; archivo: string; linea: number; detalle: string }[]
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  }

  /**
   * Copia del factory real sin la guarda. Si la guarda cambió de forma, la sonda
   * NO puede fingir que midió: falla acá, que es el punto de tener una sonda.
   */
  function factorySinGuarda(): string {
    expect(CONST_GUARDA.test(factoryReal)).toBe(true)
    expect(BLOQUE_GUARDA.test(factoryReal)).toBe(true)
    const sinGuarda = factoryReal
      .replace(CONST_GUARDA, "")
      .replace(BLOQUE_GUARDA, "")
    expect(sinGuarda).not.toContain("COMODINES_LIKE")
    expect(sinGuarda).not.toContain(MENSAJE_COMODINES)
    expect(sinGuarda).toContain("contains: q")
    return sinGuarda
  }

  it("la copia del factory SIN la guarda produce hallazgo", () => {
    const hallazgos = hallazgosR6De(factorySinGuarda())
    expect(hallazgos).toHaveLength(1)
    expect(hallazgos[0]?.archivo).toBe(FACTORY)
    expect(hallazgos[0]?.detalle).toContain('contains sobre "q"')
  })

  it("el factory real, con la guarda, no produce ningún hallazgo", () => {
    expect(hallazgosR6De(factoryReal)).toEqual([])
  })
})
