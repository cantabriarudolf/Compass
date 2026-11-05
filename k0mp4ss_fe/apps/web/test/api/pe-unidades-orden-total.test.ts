/**
 * @vitest-environment node
 *
 * F6 — `GET /api/pe/unidades`: la paginación necesita un orden TOTAL para ser estable.
 *
 * El selector de «Unidad destino» (`components/selector-buscable.tsx`) recorre el padrón de a una
 * página con «Cargar más resultados», así que la ruta tiene que cortar el resultado con un orden
 * determinista. `orderBy: [{ numero }, { rolSii }]` NO lo es: el número se repite entre
 * microsectores (el schema lo declara a propósito: «No unique on [comunidadId, numero]», C3b/D5) y
 * `rolSii` se repite en todo el padrón que no tiene rol (las filas sembradas con `rolSii: ""`).
 * Con empates en la última columna ordenada, el motor queda libre de devolver esas filas en
 * cualquier orden, y entonces dos pedidos iguales pueden traer páginas distintas y dos páginas
 * consecutivas pueden solaparse o saltear filas.
 *
 * El fixture replica ese empate al extremo: todas las filas comparten `numero` y `rolSii`, y se
 * insertan en un orden que NO coincide con el de sus ids. Sólo el desempate final por `id` puede
 * dar un orden estable.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

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

const AUTH_SECRET = "test-secret-12345678"

const COMUNIDAD = "f6-pe-ord-comunidad"
const CUENTA = { id: "f6-pe-ord-user", email: "f6-pe-ord@test.cl", rol: "conserjeria" }

/** Total de filas empatadas: más de dos páginas de 5, para poder encadenar página 1 y 2. */
const FILAS = 12
const PAGE_SIZE = 5

/** Ids ascendentes: el orden esperado una vez que el desempate final es `id`. */
const IDS_ASCENDENTES = Array.from(
  { length: FILAS },
  (_, i) => `f6-pe-ord-u-${String(i).padStart(2, "0")}`
)

/**
 * Orden de inserción deliberadamente distinto del de los ids: si el motor resuelve los empates por
 * orden físico, la primera página no coincide con los primeros ids.
 */
const ORDEN_INSERCION = [
  "f6-pe-ord-u-07",
  "f6-pe-ord-u-02",
  "f6-pe-ord-u-11",
  "f6-pe-ord-u-00",
  "f6-pe-ord-u-05",
  "f6-pe-ord-u-09",
  "f6-pe-ord-u-03",
  "f6-pe-ord-u-10",
  "f6-pe-ord-u-01",
  "f6-pe-ord-u-08",
  "f6-pe-ord-u-04",
  "f6-pe-ord-u-06",
]

/** Todas empatadas en `numero` y en `rolSii`: sólo el id las distingue. */
const UNIDADES = ORDEN_INSERCION.map((id) => ({
  id,
  comunidadId: COMUNIDAD,
  microSectorId: "f6-pe-ord-micro",
  numero: "101",
  etiqueta: "Depto",
  tipoUnidadId: "f6-pe-ord-tipo",
  metraje: 50,
  prorrateo: 0.01,
  rolSii: "",
  estadoId: "vacante",
  servicios: {},
}))

interface RespuestaUnidades {
  data: { id: string; numero: string; etiqueta: string; rolSii: string }[]
  page: number
  pageSize: number
  total: number
}

describe("GET /api/pe/unidades — paginación con orden total", () => {
  let GET: (req: Request) => Promise<Response>
  let cookie = ""

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad F6 PE Orden", slug: COMUNIDAD },
    })
    await prisma.usuario.upsert({
      where: { email: CUENTA.email },
      update: {},
      create: { id: CUENTA.id, email: CUENTA.email, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: CUENTA.id } })
    await prisma.membresia.create({
      data: { usuarioId: CUENTA.id, comunidadId: COMUNIDAD, rol: CUENTA.rol },
    })

    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    cookie = await cookieSesionAuthjs({ sub: CUENTA.id, email: CUENTA.email })

    await prisma.unidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
    for (const fila of UNIDADES) await prisma.unidad.create({ data: fila })

    const ruta = await import("@/app/api/pe/unidades/route")
    GET = ruta.GET
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      await prisma.unidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.membresia.deleteMany({ where: { usuarioId: CUENTA.id } })
      await prisma.usuario.deleteMany({ where: { id: CUENTA.id } })
      await prisma.comunidad.deleteMany({ where: { id: COMUNIDAD } })
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function pedir(query: string): Promise<RespuestaUnidades> {
    state.cookie = cookie
    const res = await GET(new NextRequest(`http://localhost/api/pe/unidades${query}`))
    expect(res.status).toBe(200)
    return (await res.json()) as RespuestaUnidades
  }

  it("dos pedidos idénticos devuelven la misma página, en el mismo orden", async () => {
    const primera = await pedir(`?q=101&page=1&pageSize=${PAGE_SIZE}`)
    const segunda = await pedir(`?q=101&page=1&pageSize=${PAGE_SIZE}`)

    expect(primera.data.map((u) => u.id)).toEqual(segunda.data.map((u) => u.id))
    expect(primera.data).toHaveLength(PAGE_SIZE)
    expect(primera.total).toBe(FILAS)
    // El fixture tiene empates en `numero` y `rolSii`: la página está ordenada por el desempate
    // final (`id`), que es lo único que la hace reproducible.
    expect(primera.data.map((u) => u.id)).toEqual(IDS_ASCENDENTES.slice(0, PAGE_SIZE))
  })

  it("página 1 y página 2 no se solapan ni dejan huecos: cubren las primeras 10 del listado", async () => {
    const completa = await pedir(`?q=101&pageSize=100`)
    const paginaUno = await pedir(`?q=101&page=1&pageSize=${PAGE_SIZE}`)
    const paginaDos = await pedir(`?q=101&page=2&pageSize=${PAGE_SIZE}`)

    const idsCompleta = completa.data.map((u) => u.id)
    expect(idsCompleta).toHaveLength(FILAS)

    const idsUno = paginaUno.data.map((u) => u.id)
    const idsDos = paginaDos.data.map((u) => u.id)

    // Sin solapamiento: ninguna fila se repite entre páginas consecutivas.
    expect(idsDos.filter((id) => idsUno.includes(id))).toEqual([])
    // Sin huecos: la unión en orden es exactamente el prefijo del listado completo.
    expect([...idsUno, ...idsDos]).toEqual(idsCompleta.slice(0, PAGE_SIZE * 2))
    // Y ese prefijo es el de menor id, no el que dejó el azar del motor.
    expect([...idsUno, ...idsDos]).toEqual(IDS_ASCENDENTES.slice(0, PAGE_SIZE * 2))
  })

  it("las páginas recorren el total sin perder ni duplicar filas", async () => {
    const completa = await pedir(`?q=101&pageSize=100`)
    const recorridas: string[] = []
    const paginas = Math.ceil(FILAS / PAGE_SIZE)
    for (let page = 1; page <= paginas; page++) {
      const j = await pedir(`?q=101&page=${page}&pageSize=${PAGE_SIZE}`)
      recorridas.push(...j.data.map((u) => u.id))
    }

    // Recorrer página a página el mismo `q` devuelve el listado completo, una sola vez cada fila.
    expect(recorridas).toEqual(completa.data.map((u) => u.id))
    expect(recorridas).toEqual(IDS_ASCENDENTES)
  })
})
