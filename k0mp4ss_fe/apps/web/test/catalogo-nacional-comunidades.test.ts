/**
 * @vitest-environment node
 *
 * F20 fase 2 — el catálogo del país es UNO SOLO, compartido por todas las
 * comunidades. La clave primaria del maestro es sólo `id`: `afp-habitat` (y
 * cada fila de la semilla) existe una sola vez en toda la base, así que no
 * hubo que migrar el esquema; la lectura se volvió global en la ruta
 * (`app/api/maestros/[tipo]/route.ts`) y el ocultamiento sigue siendo por
 * comunidad (`MaestroOculto`).
 *
 * Lo que se afirma acá (a las rutas reales, con cookie de sesión de cada
 * comunidad, no a Prisma: lo que se verifica es la ruta):
 *   a) tras sembrar el catálogo para la comunidad A, la comunidad B también
 *      lo ve (lectura global por id).
 *   b) una entrada PROPIA de A (id fuera de la semilla) no aparece en B.
 *   c) ocultar una fila nacional en B no la oculta en A —y con
 *      `?incluirOcultos=1` B la recupera anotada como `oculto`.
 *   d) el seed (`scripts/seed-catalogo-nacional.ts`) es idempotente y no
 *      reasigna filas entre comunidades: `comunidadId` es sólo la etiqueta de
 *      quien sembró primero y nadie se la roba con una segunda corrida.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { PrismaClient } from "@prisma/client"
import { asegurarCatalogoNacional } from "../scripts/seed-catalogo-nacional"
import { idsNacionales } from "@/lib/maestros-nacionales"

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

// Prisma directo: este archivo no pasa por lib/prisma para no importar el
// guard de modelo ni Next en el arranque del suite.
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

const AUTH_SECRET = "test-secret-12345678"

const COM_A = "cn-comunidad-a"
const COM_B = "cn-comunidad-b"

// Catálogo de prueba: afps (nacional). Las filas de bancos las manipulan
// otras suites (f20) sobre la misma base descartable; afp no entra en
// ninguna otra suite de API para que este archivo no las pise.
const TIPO = "afps"
const IDS_NACIONALES = idsNacionales(TIPO)
const PROPIO_ID = "cn-afp-propio"

interface RespuestaColeccion {
  data: { id: string; oculto?: boolean }[]
  total?: number
}

describe("catálogo nacional compartido entre comunidades (F20 fase 2)", () => {
  let cookieA = ""
  let cookieB = ""

  async function GET(tipo: string, incluirOcultos = false): Promise<Response> {
    const ruta = await import("@/app/api/maestros/[tipo]/route")
    const q = incluirOcultos ? "?incluirOcultos=1" : ""
    return ruta.GET(new NextRequest(`http://localhost/api/maestros/${tipo}${q}`), {
      params: Promise.resolve({ tipo }),
    })
  }

  async function OCULTAR(tipo: string, body: unknown): Promise<Response> {
    const ruta = await import("@/app/api/maestros/[tipo]/ocultar/route")
    return ruta.PUT(
      new NextRequest(`http://localhost/api/maestros/${tipo}/ocultar`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ tipo }) }
    )
  }

  async function idsEnRespuesta(res: Response): Promise<string[]> {
    const cuerpo = (await res.json()) as RespuestaColeccion
    return cuerpo.data.map((f) => f.id)
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    // Zona limpia para este archivo: sólo los ids que puede pisar lo que
    // prueba (los nacionales de afps y la entrada propia).
    await prisma.maestroOculto.deleteMany({
      where: { comunidadId: { in: [COM_A, COM_B] }, tipo: TIPO },
    })
    await prisma.afp.deleteMany({
      where: {
        OR: [
          { id: { in: [...IDS_NACIONALES] } },
          { id: PROPIO_ID },
          { comunidadId: { in: [COM_A, COM_B] } },
        ],
      },
    })
    for (const usuarioId of ["cn-usuario-a", "cn-usuario-b"]) {
      await prisma.membresia.deleteMany({ where: { usuarioId } })
      await prisma.usuario.delete({ where: { id: usuarioId } }).catch(() => {})
    }
    await prisma.comunidad.deleteMany({ where: { id: { in: [COM_A, COM_B] } } })

    for (const c of [
      { id: COM_A, nombre: "Comunidad catálogo A", slug: COM_A },
      { id: COM_B, nombre: "Comunidad catálogo B", slug: COM_B },
    ]) {
      await prisma.comunidad.upsert({
        where: { id: c.id },
        update: {},
        create: c,
      })
    }
    const cuentaDe = (id: string): { id: string; email: string; comunidadId: string } => ({
      id,
      email: `${id}@test.cl`,
      comunidadId: id === "cn-usuario-a" ? COM_A : COM_B,
    })
    const { cookieSesionAuthjs } = await import("./helpers/sesion-authjs")
    for (const cuenta of [cuentaDe("cn-usuario-a"), cuentaDe("cn-usuario-b")]) {
      await prisma.usuario.upsert({
        where: { email: cuenta.email },
        update: {},
        create: { id: cuenta.id, email: cuenta.email, activo: true },
      })
      await prisma.membresia.create({
        data: {
          usuarioId: cuenta.id,
          comunidadId: cuenta.comunidadId,
          rol: "administrador",
        },
      })
      const cookie = await cookieSesionAuthjs({ sub: cuenta.id, email: cuenta.email })
      if (cuenta.comunidadId === COM_A) cookieA = cookie
      else cookieB = cookie
    }

    // "Tras sembrar para la comunidad A": el seed de los ocho catálogos del
    // país con las filas etiquetadas con COM_A.
    await asegurarCatalogoNacional(prisma, COM_A)
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      await prisma.maestroOculto.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.afp.deleteMany({
        where: {
          OR: [
            { id: { in: [...IDS_NACIONALES] } },
            { id: PROPIO_ID },
          ],
        },
      })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["cn-usuario-a", "cn-usuario-b"] } },
      })
      await prisma.usuario.deleteMany({
        where: { id: { in: ["cn-usuario-a", "cn-usuario-b"] } },
      })
      await prisma.comunidad.deleteMany({
        where: { id: { in: [COM_A, COM_B] } },
      })
    } catch {
      // limpieza best-effort
    }
    await prisma.$disconnect()
  }, 30_000)

  it("(a) la comunidad B ve el catálogo sembrado para A aunque no tenga ninguna fila propia", async () => {
    // B no tiene ninguna fila de AFP en su nombre: la lectura es global por id.
    expect(await prisma.afp.count({ where: { comunidadId: COM_B } })).toBe(0)

    state.cookie = cookieB
    const res = await GET(TIPO)
    expect(res.status).toBe(200)
    const cuerpo = (await res.json()) as RespuestaColeccion
    for (const id of IDS_NACIONALES) {
      expect(cuerpo.data.map((f) => f.id), `B no ve la fila nacional ${id}`).toContain(id)
    }
    expect(cuerpo.total).toBeGreaterThanOrEqual(IDS_NACIONALES.length)
  }, 30_000)

  it("(b) la entrada propia de A no se filtra a B", async () => {
    // Crearla por la ruta real: admin de A hace POST con un id fuera de la semilla.
    state.cookie = cookieA
    const ruta = await import("@/app/api/maestros/[tipo]/route")
    const propia = await ruta.POST(
      new NextRequest(`http://localhost/api/maestros/${TIPO}`, {
        method: "POST",
        body: JSON.stringify({
          id: PROPIO_ID,
          nombre: "AFP Propia de Prueba",
          tasaCotizacion: 0.5,
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ tipo: TIPO }) }
    )
    expect(propia.status).toBe(201)

    // A la ve (es suya): en la base quedó etiquetada con COM_A.
    const idsA = await idsEnRespuesta(await GET(TIPO))
    expect(idsA).toContain(PROPIO_ID)

    // B no la ve: no es nacional y no es suya.
    state.cookie = cookieB
    const idsB = await idsEnRespuesta(await GET(TIPO))
    expect(idsB).not.toContain(PROPIO_ID)
  }, 30_000)

  it("(c) ocultar una fila nacional en B no la oculta en A", async () => {
    const nacional = IDS_NACIONALES[0]!

    state.cookie = cookieB
    const oculta = await OCULTAR(TIPO, { maestroId: nacional, oculto: true })
    expect(oculta.status).toBe(200)

    // B la deja de ver en el listado normal...
    const idsB = await idsEnRespuesta(await GET(TIPO))
    expect(idsB).not.toContain(nacional)

    // ...pero la recupera con ?incluirOcultos=1 (la envoltura de lectura global
    // sigue activa acá, sólo que sin la exclusión), anotada como oculto.
    const conOcultas = (await (await GET(TIPO, true)).json()) as RespuestaColeccion
    const fila = conOcultas.data.find((f) => f.id === nacional)
    expect(fila?.oculto).toBe(true)

    // A sigue viendo la fila: el ocultamiento es por comunidad.
    state.cookie = cookieA
    const idsA = await idsEnRespuesta(await GET(TIPO))
    expect(idsA).toContain(nacional)

    // Volver a mostrar limpia la marca.
    state.cookie = cookieB
    await OCULTAR(TIPO, { maestroId: nacional, oculto: false })
  }, 30_000)

  it("(d) el seed es idempotente y no reasigna filas entre comunidades", async () => {
    // Todas las filas nacionales de afps existen una sola vez en la base,
    // etiquetadas con COM_A (quien las sembró primero).
    const antes = await prisma.afp.findMany({
      where: { id: { in: [...IDS_NACIONALES] } },
      orderBy: { id: "asc" },
    })
    expect(antes).toHaveLength(IDS_NACIONALES.length)
    expect(antes.map((f) => f.comunidadId)).toEqual(
      IDS_NACIONALES.map(() => COM_A)
    )

    // Sembrarlo "para B" (corrida 2×) no duplica, no reescribe y no reasigna:
    // el upsert sólo asegura la existencia (update vacío).
    await asegurarCatalogoNacional(prisma, COM_B)
    await asegurarCatalogoNacional(prisma, COM_B)

    const despues = await prisma.afp.findMany({
      where: { id: { in: [...IDS_NACIONALES] } },
      orderBy: { id: "asc" },
    })
    expect(despues).toEqual(antes)
    expect(
      await prisma.afp.count({ where: { id: { in: [...IDS_NACIONALES] } } })
    ).toBe(IDS_NACIONALES.length)
  }, 30_000)
})
