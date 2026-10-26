/**
 * @vitest-environment node
 *
 * F20 (fase 1) — catálogos nacionales: ofrecer, ocultar y agregar sin editar
 * ni borrar. Prisma real contra la base descartable, cookie de sesión igual
 * que el resto de test/api. Limpieza acotada a lo que este archivo crea.
 *
 * Reglas verificadas:
 * - GET de la colección excluye las filas ocultas de esa comunidad y descuenta
 *   su `total`; mostrarlas de nuevo las devuelve.
 * - Ocultar dos veces es idempotente (una sola marca).
 * - PUT/DELETE de una fila nacional responden 403 y NO modifican ni borran.
 * - Una entrada propia creada por el administrador sí se edita y se borra.
 * - Conserjería 403 en la acción de ocultar (mp:editar) y sin sesión 401.
 */
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest"
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

const COMUNIDAD = "f20-comunidad"
const EMAIL_ADMIN = "f20-admin@test.cl"
const EMAIL_CONSERJERIA = "f20-conserjeria@test.cl"

// Fila de catálogo nacional (id de la semilla: data/admin/maestros.ts) y una
// entrada propia del administrador, con ids que no colisionan con otras suites.
const NACIONAL_ID = "banco-estado"
const PROPIO_ID = "f20-banco-propio"

interface RespuestaColeccion {
  data: { id: string }[]
  total?: number
}

describe("/api/maestros/[tipo] — catálogos nacionales (F20 fase 1)", () => {
  let cookieAdmin = ""
  let cookieConserjeria = ""

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad F20", slug: COMUNIDAD },
    })
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")

    for (const cuenta of [
      { id: "f20-usuario-admin", email: EMAIL_ADMIN, rol: "administrador" },
      { id: "f20-usuario-conserjeria", email: EMAIL_CONSERJERIA, rol: "conserjeria" },
    ]) {
      await prisma.usuario.upsert({
        where: { email: cuenta.email },
        update: {},
        create: { id: cuenta.id, email: cuenta.email, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: cuenta.id } })
      await prisma.membresia.create({
        data: { usuarioId: cuenta.id, comunidadId: COMUNIDAD, rol: cuenta.rol },
      })
      const cookie = await cookieSesionAuthjs({
        sub: cuenta.id,
        email: cuenta.email,
      })
      if (cuenta.rol === "administrador") cookieAdmin = cookie
      else cookieConserjeria = cookie
    }

    // Limpieza defensiva por si otra suite dejó estos ids en otra comunidad,
    // y siembra acotada: la fila nacional (id de la semilla) y la propia.
    await prisma.maestroOculto.deleteMany({ where: { comunidadId: COMUNIDAD } })
    await prisma.banco.deleteMany({
      where: { id: { in: [NACIONAL_ID, PROPIO_ID] } },
    })
    await prisma.banco.create({
      data: { id: NACIONAL_ID, comunidadId: COMUNIDAD, nombre: "Banco Estado" },
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      await prisma.maestroOculto.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.banco.deleteMany({
        where: { id: { in: [NACIONAL_ID, PROPIO_ID] } },
      })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["f20-usuario-admin", "f20-usuario-conserjeria"] } },
      })
      await prisma.usuario.deleteMany({
        where: { id: { in: ["f20-usuario-admin", "f20-usuario-conserjeria"] } },
      })
      await prisma.comunidad.delete({ where: { id: COMUNIDAD } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  function coleccion() {
    return import("@/app/api/maestros/[tipo]/route")
  }
  function detalle() {
    return import("@/app/api/maestros/[tipo]/[id]/route")
  }
  function ocultar() {
    return import("@/app/api/maestros/[tipo]/ocultar/route")
  }

  async function GET(tipo: string): Promise<Response> {
    const ruta = await coleccion()
    return ruta.GET(new NextRequest(`http://localhost/api/maestros/${tipo}`), {
      params: Promise.resolve({ tipo }),
    })
  }

  async function PUT(tipo: string, body: unknown): Promise<Response> {
    const ruta = await ocultar()
    return ruta.PUT(
      new NextRequest(`http://localhost/api/maestros/${tipo}/ocultar`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ tipo }) }
    )
  }

  async function POST(tipo: string, body: unknown): Promise<Response> {
    const ruta = await coleccion()
    return ruta.POST(
      new NextRequest(`http://localhost/api/maestros/${tipo}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ tipo }) }
    )
  }

  async function PUT_ITEM(tipo: string, id: string, body: unknown): Promise<Response> {
    const ruta = await detalle()
    return ruta.PUT(
      new NextRequest(`http://localhost/api/maestros/${tipo}/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ tipo, id }) }
    )
  }

  async function DELETE_ITEM(tipo: string, id: string): Promise<Response> {
    const ruta = await detalle()
    return ruta.DELETE(
      new NextRequest(`http://localhost/api/maestros/${tipo}/${id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ tipo, id }) }
    )
  }

  it("sin sesión → 401 (GET, ocultar y PUT de fila nacional)", async () => {
    state.cookie = ""
    expect((await GET("bancos")).status).toBe(401)
    expect((await PUT("bancos", { maestroId: NACIONAL_ID, oculto: true })).status).toBe(401)
    expect((await PUT_ITEM("bancos", NACIONAL_ID, { nombre: "X" })).status).toBe(401)
  })

  it("conserjería no puede ocultar (mp:editar es del administrador)", async () => {
    state.cookie = cookieConserjeria
    const res = await PUT("bancos", { maestroId: NACIONAL_ID, oculto: true })
    expect(res.status).toBe(403)
    expect(await prisma.maestroOculto.count({ where: { comunidadId: COMUNIDAD } })).toBe(0)
  })

  it("GET lista la nacional y la propia; ocultar la saca del listado y del total", async () => {
    state.cookie = cookieAdmin
    const propia = await POST("bancos", { id: PROPIO_ID, nombre: "Banco Propio F20" })
    expect(propia.status).toBe(201)

    const antes = (await (await GET("bancos")).json()) as RespuestaColeccion
    expect(antes.data.map((b) => b.id)).toContain(NACIONAL_ID)
    expect(antes.data.map((b) => b.id)).toContain(PROPIO_ID)
    expect(antes.total).toBe(2)

    const res = await PUT("bancos", { maestroId: NACIONAL_ID, oculto: true })
    expect(res.status).toBe(200)
    const j = (await res.json()) as { ok: boolean; oculto: boolean }
    expect(j).toEqual({ ok: true, oculto: true })

    const despues = (await (await GET("bancos")).json()) as RespuestaColeccion
    expect(despues.data.map((b) => b.id)).toEqual([PROPIO_ID])
    expect(despues.total).toBe(1)

    // La fila nacional sigue intacta en la BD: solo hay una marca de ocultamiento.
    expect(await prisma.banco.findUnique({ where: { id: NACIONAL_ID } })).not.toBeNull()
    expect(await prisma.maestroOculto.count({ where: { comunidadId: COMUNIDAD } })).toBe(1)
  })

  it("ocultar dos veces es idempotente (una sola marca)", async () => {
    state.cookie = cookieAdmin
    const res = await PUT("bancos", { maestroId: NACIONAL_ID, oculto: true })
    expect(res.status).toBe(200)
    expect(
      await prisma.maestroOculto.count({
        where: { comunidadId: COMUNIDAD, tipo: "bancos", maestroId: NACIONAL_ID },
      })
    ).toBe(1)
  })

  it("ocultar con oculto:false devuelve la fila al listado", async () => {
    state.cookie = cookieAdmin
    const res = await PUT("bancos", { maestroId: NACIONAL_ID, oculto: false })
    expect(res.status).toBe(200)
    const j = (await res.json()) as { ok: boolean; oculto: boolean }
    expect(j).toEqual({ ok: true, oculto: false })
    expect(
      await prisma.maestroOculto.count({ where: { comunidadId: COMUNIDAD } })
    ).toBe(0)

    const lista = (await (await GET("bancos")).json()) as RespuestaColeccion
    // orderBy createdAt desc: la propia se creó después de la nacional.
    expect(lista.data.map((b) => b.id)).toEqual([PROPIO_ID, NACIONAL_ID])
    expect(lista.total).toBe(2)
  })

  it("ocultar un tipo no nacional → 400", async () => {
    state.cookie = cookieAdmin
    const res = await PUT("jornadas", { maestroId: "x", oculto: true })
    expect(res.status).toBe(400)
  })

  it("PUT de fila nacional → 403 y NO la modifica", async () => {
    state.cookie = cookieAdmin
    const res = await PUT_ITEM("bancos", NACIONAL_ID, { nombre: "Banco Renombrado" })
    expect(res.status).toBe(403)
    const j = (await res.json()) as { error: string }
    expect(j.error).toMatch(/catálogo nacional/)
    const fila = await prisma.banco.findUnique({ where: { id: NACIONAL_ID } })
    expect(fila?.nombre).toBe("Banco Estado")
  })

  it("DELETE de fila nacional → 403 y NO la borra", async () => {
    state.cookie = cookieAdmin
    const res = await DELETE_ITEM("bancos", NACIONAL_ID)
    expect(res.status).toBe(403)
    const j = (await res.json()) as { error: string }
    expect(j.error).toMatch(/catálogo nacional/)
    expect(await prisma.banco.findUnique({ where: { id: NACIONAL_ID } })).not.toBeNull()
  })

  it("POST con id de fila nacional → 403 (upsert sería una edición encubierta)", async () => {
    state.cookie = cookieAdmin
    const res = await POST("bancos", { id: NACIONAL_ID, nombre: "Banco Renombrado" })
    expect(res.status).toBe(403)
    const fila = await prisma.banco.findUnique({ where: { id: NACIONAL_ID } })
    expect(fila?.nombre).toBe("Banco Estado")
  })

  it("una entrada propia del administrador sí se edita y se borra", async () => {
    state.cookie = cookieAdmin
    const editada = await PUT_ITEM("bancos", PROPIO_ID, { nombre: "Banco Propio Editado" })
    expect(editada.status).toBe(200)
    expect(
      (await prisma.banco.findUnique({ where: { id: PROPIO_ID } }))?.nombre
    ).toBe("Banco Propio Editado")

    const borrada = await DELETE_ITEM("bancos", PROPIO_ID)
    expect(borrada.status).toBe(200)
    expect(await prisma.banco.findUnique({ where: { id: PROPIO_ID } })).toBeNull()
  })
})
