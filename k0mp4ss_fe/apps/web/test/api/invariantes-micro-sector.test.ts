/**
 * @vitest-environment node
 *
 * INV-04 — "un micro sector por nombre dentro de su macro sector" (docs/INVARIANTES.md).
 *
 * Decisión del owner: el nombre de un micro sector se compone con su padre
 * ("Edificio 1 / Piso 4" no es lo mismo que "Edificio 2 / Piso 4"), así que se
 * repite ENTRE edificios y nunca dos veces DENTRO del mismo, que es duplicación.
 *
 * Antes la regla vivía sólo en la pantalla
 * (`app/inventario/estructura/page.tsx:212`) con un `confirm()` que decía
 * "repetidos permitidos"; la API aceptaba el duplicado y la base no tenía
 * restricción. Ahora hay guardia de servidor + índice único compuesto.
 *
 * Dos pruebas por regla (pedido del owner):
 *   1. el caso que tiene que pasar  → mismo nombre en OTRO macro sector;
 *   2. el que tiene que FALLAR      → mismo nombre en el MISMO macro sector.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
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

const SUFIJO = Date.now()
const COMUNIDAD_ID = `com-inv04-${SUFIJO}`
const EMAIL_ADMIN = `inv04-admin-${SUFIJO}@test.cl`
const USUARIO_ID = `inv04-user-${SUFIJO}`
const EDIFICIO_1 = `inv04-macro-1-${SUFIJO}`
const EDIFICIO_2 = `inv04-macro-2-${SUFIJO}`

async function sesionCookie(uid: string, email: string): Promise<string> {
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  return cookieSesionAuthjs({ sub: uid, email })
}

function cuerpo(id: string, macroSectorId: string, nombre = "Piso 4"): Record<string, unknown> {
  return { id, macroSectorId, nombre, etiqueta: "Departamentos" }
}

async function post(body: Record<string, unknown>, cookie: string): Promise<Response> {
  state.cookie = cookie
  const { POST } = await import("@/app/api/micro-sectores/route")
  const req = new NextRequest("http://localhost/api/micro-sectores", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  })
  const res = await POST(req)
  state.cookie = ""
  return res
}

describe("INV-04 — un micro sector por nombre dentro de su macro sector", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = "test-secret-12345678"
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    await prisma.comunidad.create({
      data: { id: COMUNIDAD_ID, nombre: "Comunidad INV04", slug: `inv04-${SUFIJO}` },
    })
    await prisma.usuario.create({
      data: { id: USUARIO_ID, email: EMAIL_ADMIN, activo: true },
    })
    await prisma.membresia.create({
      data: { usuarioId: USUARIO_ID, comunidadId: COMUNIDAD_ID, rol: "administrador" },
    })
    await prisma.macroSector.create({
      data: { id: EDIFICIO_1, comunidadId: COMUNIDAD_ID, nombre: `Edificio 1 ${SUFIJO}`, etiqueta: "Torre" },
    })
    await prisma.macroSector.create({
      data: { id: EDIFICIO_2, comunidadId: COMUNIDAD_ID, nombre: `Edificio 2 ${SUFIJO}`, etiqueta: "Torre" },
    })
  }, 30_000)

  afterAll(async () => {
    try {
      await prisma.microSector.deleteMany({ where: { comunidadId: COMUNIDAD_ID } })
      await prisma.macroSector.deleteMany({ where: { comunidadId: COMUNIDAD_ID } })
      await prisma.membresia.deleteMany({ where: { comunidadId: COMUNIDAD_ID } })
      await prisma.usuario.deleteMany({ where: { id: USUARIO_ID } })
      await prisma.comunidad.delete({ where: { id: COMUNIDAD_ID } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  it("acepta el mismo nombre en otro macro sector (el nombre se compone con el edificio)", async () => {
    const cookie = await sesionCookie(USUARIO_ID, EMAIL_ADMIN)

    const r1 = await post(cuerpo(`inv04-a-${SUFIJO}`, EDIFICIO_1), cookie)
    const r2 = await post(cuerpo(`inv04-b-${SUFIJO}`, EDIFICIO_2), cookie)

    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
    const pisos = await prisma.microSector.findMany({
      where: { comunidadId: COMUNIDAD_ID, nombre: "Piso 4" },
      select: { macroSectorId: true },
    })
    expect(pisos).toHaveLength(2)
    expect(new Set(pisos.map((p) => p.macroSectorId))).toEqual(
      new Set([EDIFICIO_1, EDIFICIO_2])
    )
  })

  it("RECHAZA un segundo Piso 4 en el mismo edificio y no escribe nada", async () => {
    const cookie = await sesionCookie(USUARIO_ID, EMAIL_ADMIN)
    const antes = await prisma.microSector.count({ where: { comunidadId: COMUNIDAD_ID } })

    const res = await post(cuerpo(`inv04-dup-${SUFIJO}`, EDIFICIO_1), cookie)

    expect(res.status).toBe(409)
    const j = (await res.json()) as { error: string }
    expect(j.error).toBe(
      "Conflicto: ya existe un micro sector con ese nombre en este macro sector."
    )

    const despues = await prisma.microSector.count({ where: { comunidadId: COMUNIDAD_ID } })
    expect(despues).toBe(antes)
    const inexistente = await prisma.microSector.findUnique({
      where: { id: `inv04-dup-${SUFIJO}` },
    })
    expect(inexistente).toBeNull()
  })
})
