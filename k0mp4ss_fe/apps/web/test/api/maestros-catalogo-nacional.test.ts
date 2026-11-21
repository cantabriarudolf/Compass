/** @vitest-environment node */
/**
 * F46 · el catálogo nacional se asegura desde la UI, no desde la terminal.
 *
 * Lo que hay que demostrar (y que mi primera medición tenía mal): los catálogos
 * nacionales **no son por comunidad**. La clave primaria del maestro es sólo `id`,
 * y el listado compone el `where` con `OR [{comunidadId: la mía}, {id: {in: ids de
 * la semilla}}]` (`lib/maestros-nacionales.ts` + `app/api/maestros/[tipo]/route.ts`).
 * Una comunidad que **nunca** los sembró los ve igual, siempre que las filas existan
 * en la base.
 *
 * Lo que faltaba no era «una siembra por comunidad»: era que las filas existan y que
 * alguien pueda crearlas sin saber que hay un script. Este test pinea las dos cosas:
 *
 * 1. Con el catálogo vacío, el administrador lo asegura con UN POST y las filas quedan.
 * 2. **Otra comunidad**, que no hizo nada, las ve por el listado (global por id).
 * 3. Repetir el POST es idempotente: no duplica ni cambia.
 * 4. Conserjería no puede (403) y sin sesión es 401.
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { UNIDADES_MEDIDA } from "@/data/admin/maestros"

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
const COMUNIDAD_A = "f46-comunidad-a"
const COMUNIDAD_B = "f46-comunidad-b"
const EMAIL_ADMIN_A = "f46-admin-a@test.cl"
const EMAIL_ADMIN_B = "f46-admin-b@test.cl"
const EMAIL_CONSERJERIA = "f46-conserjeria@test.cl"

const TOTAL_SEMILLA = UNIDADES_MEDIDA.length

describe("/api/maestros/catalogo-nacional — asegurar el catálogo del país (F46)", () => {
  let cookieAdminA = ""
  let cookieAdminB = ""
  let cookieConserjeria = ""

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")

    for (const comunidad of [
      { id: COMUNIDAD_A, nombre: "F46 A" },
      { id: COMUNIDAD_B, nombre: "F46 B" },
    ]) {
      await prisma.comunidad.upsert({
        where: { id: comunidad.id },
        update: {},
        create: { id: comunidad.id, nombre: comunidad.nombre, slug: comunidad.id },
      })
    }

    for (const cuenta of [
      { id: "f46-usuario-admin-a", email: EMAIL_ADMIN_A, comunidad: COMUNIDAD_A, rol: "administrador" },
      { id: "f46-usuario-admin-b", email: EMAIL_ADMIN_B, comunidad: COMUNIDAD_B, rol: "administrador" },
      { id: "f46-usuario-conserjeria", email: EMAIL_CONSERJERIA, comunidad: COMUNIDAD_A, rol: "conserjeria" },
    ]) {
      await prisma.usuario.upsert({
        where: { email: cuenta.email },
        update: {},
        create: { id: cuenta.id, email: cuenta.email, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: cuenta.id } })
      await prisma.membresia.create({
        data: { usuarioId: cuenta.id, comunidadId: cuenta.comunidad, rol: cuenta.rol },
      })
      const cookie = await cookieSesionAuthjs({ sub: cuenta.id, email: cuenta.email })
      if (cuenta.rol === "conserjeria") cookieConserjeria = cookie
      else if (cuenta.comunidad === COMUNIDAD_A) cookieAdminA = cookie
      else cookieAdminB = cookie
    }

    // Punto de partida: el catálogo NO existe. Es el estado de una base recién
    // migrada, que es justamente el caso que el script cubría a mano.
    await prisma.unidadMedida.deleteMany({})
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      // El catálogo queda asegurado (es el estado natural); sólo se limpia lo propio.
      await prisma.membresia.deleteMany({
        where: {
          usuarioId: {
            in: ["f46-usuario-admin-a", "f46-usuario-admin-b", "f46-usuario-conserjeria"],
          },
        },
      })
      await prisma.usuario.deleteMany({
        where: {
          id: { in: ["f46-usuario-admin-a", "f46-usuario-admin-b", "f46-usuario-conserjeria"] },
        },
      })
      for (const id of [COMUNIDAD_A, COMUNIDAD_B]) {
        await prisma.comunidad.delete({ where: { id } }).catch(() => {})
      }
    } catch {
      // limpieza best-effort
    }
  })

  /** GET del listado con la cookie dada. */
  async function listar(cookie: string): Promise<{ total: number; ids: string[] }> {
    state.cookie = cookie
    const { GET } = await import("@/app/api/maestros/[tipo]/route")
    const req = new Request("http://localhost/api/maestros/unidades-medida?pageSize=100")
    const respuesta = await GET(req, {
      params: Promise.resolve({ tipo: "unidades-medida" }),
    })
    expect(respuesta.status).toBe(200)
    const cuerpo = (await respuesta.json()) as { data: { id: string }[]; total?: number }
    return { total: cuerpo.total ?? cuerpo.data.length, ids: cuerpo.data.map((f) => f.id) }
  }

  it("el catálogo arranca vacío (el estado de una base recién migrada)", async () => {
    const { total } = await listar(cookieAdminB)
    expect(total).toBe(0)
  })

  it("un POST del administrador lo asegura para TODA la base", async () => {
    state.cookie = cookieAdminA
    const { POST } = await import("@/app/api/maestros/catalogo-nacional/route")
    const respuesta = await POST()
    expect(respuesta.status).toBe(200)
    const cuerpo = (await respuesta.json()) as {
      ok: boolean
      aseguradas: number
      porTipo: Record<string, number>
    }
    expect(cuerpo.ok).toBe(true)
    // `aseguradas` es la suma de los ocho catálogos; lo que importa acá es que el
    // de unidades de medida quede completo (los otros siete también se aseguran).
    expect(cuerpo.porTipo["unidades-medida"]).toBe(TOTAL_SEMILLA)
    expect(cuerpo.aseguradas).toBeGreaterThanOrEqual(TOTAL_SEMILLA)

    const filas = await prisma.unidadMedida.count()
    expect(filas).toBe(TOTAL_SEMILLA)
  })

  it("la otra comunidad, que no hizo nada, los ve: el catálogo es del país", async () => {
    const { total, ids } = await listar(cookieAdminB)
    expect(total).toBe(TOTAL_SEMILLA)
    expect(ids).toHaveLength(TOTAL_SEMILLA)
    // El listado de B devuelve las filas sembradas por A: mismo id, sin duplicar.
    expect(new Set(ids).size).toBe(TOTAL_SEMILLA)
  })

  it("repetirlo es idempotente: no duplica ni cambia", async () => {
    const antes = await prisma.unidadMedida.count()
    state.cookie = cookieAdminA
    const { POST } = await import("@/app/api/maestros/catalogo-nacional/route")
    const respuesta = await POST()
    expect(respuesta.status).toBe(200)
    expect(await prisma.unidadMedida.count()).toBe(antes)
  })

  it("conserjería no puede asegurarlo", async () => {
    state.cookie = cookieConserjeria
    const { POST } = await import("@/app/api/maestros/catalogo-nacional/route")
    const respuesta = await POST()
    expect(respuesta.status).toBe(403)
  })

  it("sin sesión es 401", async () => {
    state.cookie = ""
    const { POST } = await import("@/app/api/maestros/catalogo-nacional/route")
    const respuesta = await POST()
    expect(respuesta.status).toBe(401)
  })
})
