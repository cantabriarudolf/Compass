/**
 * @vitest-environment node
 *
 * F6 — `GET /api/unidades?q=` busca en el servidor (numero | etiqueta | rolSii).
 *
 * Antes el select de unidad destino solo podía filtrar sobre las 100 opciones
 * que ya tenía montadas. Ahora el término viaja a la API, que devuelve las
 * coincidencias de TODA la comunidad manteniendo el scoping de sesión y la
 * paginación (`pageSize` / `total`).
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

const COMUNIDAD = "f6-unidades-comunidad"
const COMUNIDAD_AJENA = "f6-unidades-comunidad-ajena"
const USUARIO_ID = "f6-unidades-usuario"
const USUARIO_EMAIL = "f6-unidades@test.cl"

function unidad(
  id: string,
  comunidadId: string,
  numero: string,
  etiqueta: string,
  rolSii: string
) {
  return {
    id,
    comunidadId,
    microSectorId: "f6-micro",
    numero,
    etiqueta,
    tipoUnidadId: "f6-tipo",
    metraje: 50,
    prorrateo: 0.01,
    rolSii,
    estadoId: "vacante",
    servicios: {},
  }
}

const UNIDADES = [
  unidad("f6-u-101", COMUNIDAD, "101", "Depto", "123-A101"),
  unidad("f6-u-102", COMUNIDAD, "102", "Depto", "123-A102"),
  unidad("f6-u-103", COMUNIDAD, "103", "Depto", "123-A103"),
  unidad("f6-u-201", COMUNIDAD, "201", "Oficina", "999-O201"),
  unidad("f6-u-ajena-1010", COMUNIDAD_AJENA, "1010", "Depto", "123-A1010"),
]

interface PaginaUnidades {
  data: { id: string; numero: string; etiqueta: string; comunidadId: string }[]
  page: number
  pageSize: number
  total: number
}

describe("GET /api/unidades — búsqueda por texto (F6)", () => {
  let GET: (req: Request) => Promise<Response>

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const c of [
      { id: COMUNIDAD, nombre: "Comunidad F6 Unidades", slug: COMUNIDAD },
      {
        id: COMUNIDAD_AJENA,
        nombre: "Comunidad F6 Ajena",
        slug: COMUNIDAD_AJENA,
      },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    await prisma.usuario.upsert({
      where: { email: USUARIO_EMAIL },
      update: {},
      create: { id: USUARIO_ID, email: USUARIO_EMAIL, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: USUARIO_ID } })
    await prisma.membresia.create({
      data: { usuarioId: USUARIO_ID, comunidadId: COMUNIDAD, rol: "administrador" },
    })
    await prisma.unidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_AJENA] } },
    })
    await prisma.unidad.createMany({ data: UNIDADES })

    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: USUARIO_ID, email: USUARIO_EMAIL })
    const ruta = await import("@/app/api/unidades/route")
    GET = ruta.GET
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      await prisma.unidad.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_AJENA] } },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: USUARIO_ID } })
      await prisma.usuario.delete({ where: { id: USUARIO_ID } }).catch(() => {})
      await prisma.comunidad
        .deleteMany({ where: { id: { in: [COMUNIDAD, COMUNIDAD_AJENA] } } })
        .catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function pedir(query = ""): Promise<PaginaUnidades> {
    const res = await GET(new NextRequest(`http://localhost/api/unidades${query}`))
    expect(res.status).toBe(200)
    return (await res.json()) as PaginaUnidades
  }

  it("sin `q` devuelve lo mismo que antes (toda la comunidad, paginado)", async () => {
    const j = await pedir("?pageSize=50")

    expect(j.total).toBe(4)
    expect(j.data.map((u) => u.id).sort()).toEqual([
      "f6-u-101",
      "f6-u-102",
      "f6-u-103",
      "f6-u-201",
    ])
    expect(j.data.every((u) => u.comunidadId === COMUNIDAD)).toBe(true)
  })

  it("`?q=` filtra por etiqueta y devuelve solo la coincidencia", async () => {
    const j = await pedir("?q=Oficina")

    expect(j.total).toBe(1)
    expect(j.data.map((u) => u.id)).toEqual(["f6-u-201"])
  })

  it("`?q=` filtra por número de unidad", async () => {
    const j = await pedir("?q=101")

    expect(j.total).toBe(1)
    expect(j.data.map((u) => u.id)).toEqual(["f6-u-101"])
  })

  it("`?q=` filtra por rol SII", async () => {
    const j = await pedir("?q=123-A")

    expect(j.total).toBe(3)
    expect(j.data.map((u) => u.id).sort()).toEqual([
      "f6-u-101",
      "f6-u-102",
      "f6-u-103",
    ])
  })

  it("la búsqueda respeta `pageSize` y reporta el `total` filtrado", async () => {
    const j = await pedir("?q=Depto&pageSize=2")

    expect(j.pageSize).toBe(2)
    expect(j.data).toHaveLength(2)
    expect(j.total).toBe(3)
    expect(j.data.every((u) => u.etiqueta === "Depto")).toBe(true)
  })

  it("nunca cruza el scoping: una coincidencia de otra comunidad no aparece", async () => {
    const j = await pedir("?q=1010")

    expect(j.total).toBe(0)
    expect(j.data).toEqual([])
  })

  it("`q` en blanco se comporta como sin búsqueda", async () => {
    const j = await pedir("?q=%20%20")

    expect(j.total).toBe(4)
  })
})
