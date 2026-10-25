/**
 * @vitest-environment node
 *
 * F6 — búsqueda por texto opt-in en el factory de colecciones.
 *
 * Contrato: `busqueda?: { campos: string[] }` es ADITIVO. Sin la opción
 * configurada —o sin `?q=`— el `where` del GET tiene que ser exactamente el de
 * hoy (`{ comunidadId }`), porque decenas de rutas usan el factory y ninguna
 * puede cambiar de comportamiento.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  createCrudHandlers,
  type CrudDelegate,
} from "@/lib/api/crud-factory"

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

const COMUNIDAD = "f6-factory-comunidad"
const USUARIO_ID = "f6-factory-usuario"
const USUARIO_EMAIL = "f6-factory@test.cl"

const SchemaEntidad = z.object({
  id: z.string().min(1),
  numero: z.string().optional(),
  etiqueta: z.string().optional(),
})

interface DelegadoFake {
  modelo: CrudDelegate
  findMany: ReturnType<typeof vi.fn>
  count: ReturnType<typeof vi.fn>
}

/** Delegado en memoria: registra los args con los que el factory consulta. */
function delegadoFake(): DelegadoFake {
  const findMany = vi.fn(async () => [])
  const count = vi.fn(async () => 0)
  const modelo = {
    findMany,
    count,
    findUnique: vi.fn(async () => null),
    upsert: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  } as unknown as CrudDelegate
  return { modelo, findMany, count }
}

async function get(handler: (r: Request) => Promise<Response>, query = "") {
  return handler(new NextRequest(`http://localhost/api/factory-test${query}`))
}

describe("crud-factory — búsqueda por texto opt-in (F6)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad F6 Factory", slug: COMUNIDAD },
    })
    await prisma.usuario.upsert({
      where: { email: USUARIO_EMAIL },
      update: {},
      create: { id: USUARIO_ID, email: USUARIO_EMAIL, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: USUARIO_ID } })
    await prisma.membresia.create({
      data: { usuarioId: USUARIO_ID, comunidadId: COMUNIDAD, rol: "administrador" },
    })
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({
      sub: USUARIO_ID,
      email: USUARIO_EMAIL,
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      await prisma.membresia.deleteMany({ where: { usuarioId: USUARIO_ID } })
      await prisma.usuario.delete({ where: { id: USUARIO_ID } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: COMUNIDAD } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  it("sin `busqueda` configurada, `?q=` no toca el where: queda exactamente { comunidadId }", async () => {
    const fake = delegadoFake()
    const handlers = createCrudHandlers({ model: fake.modelo, schema: SchemaEntidad })

    const res = await get(handlers.GET, "?q=101")

    expect(res.status).toBe(200)
    expect(fake.findMany).toHaveBeenCalledTimes(1)
    expect(fake.findMany.mock.calls[0]![0]).toMatchObject({
      where: { comunidadId: COMUNIDAD },
    })
    // Regresión explícita: ni OR ni claves extra.
    expect(fake.findMany.mock.calls[0]![0]!.where).toEqual({ comunidadId: COMUNIDAD })
    expect(fake.count.mock.calls[0]![0]!.where).toEqual({ comunidadId: COMUNIDAD })
  })

  it("con `busqueda` pero sin `q`, el where sigue siendo exactamente { comunidadId }", async () => {
    const fake = delegadoFake()
    const handlers = createCrudHandlers({
      model: fake.modelo,
      schema: SchemaEntidad,
      busqueda: { campos: ["numero", "etiqueta"] },
    })

    await get(handlers.GET)

    expect(fake.findMany.mock.calls[0]![0]!.where).toEqual({ comunidadId: COMUNIDAD })
  })

  it("con `busqueda` y `q`, suma un OR `contains` sobre los campos configurados", async () => {
    const fake = delegadoFake()
    const handlers = createCrudHandlers({
      model: fake.modelo,
      schema: SchemaEntidad,
      busqueda: { campos: ["numero", "etiqueta", "rolSii"] },
    })

    await get(handlers.GET, "?q=101")

    expect(fake.findMany.mock.calls[0]![0]!.where).toEqual({
      comunidadId: COMUNIDAD,
      OR: [
        { numero: { contains: "101" } },
        { etiqueta: { contains: "101" } },
        { rolSii: { contains: "101" } },
      ],
    })
    // El count usa el mismo where: `total` refleja el filtro, no la colección entera.
    expect(fake.count.mock.calls[0]![0]!.where).toEqual({
      comunidadId: COMUNIDAD,
      OR: [
        { numero: { contains: "101" } },
        { etiqueta: { contains: "101" } },
        { rolSii: { contains: "101" } },
      ],
    })
  })

  it("recorta el término (`q` con espacios) y no busca con el término vacío", async () => {
    const fake = delegadoFake()
    const handlers = createCrudHandlers({
      model: fake.modelo,
      schema: SchemaEntidad,
      busqueda: { campos: ["numero"] },
    })

    await get(handlers.GET, "?q=%20%20101%20%20")
    expect(fake.findMany.mock.calls[0]![0]!.where).toEqual({
      comunidadId: COMUNIDAD,
      OR: [{ numero: { contains: "101" } }],
    })

    await get(handlers.GET, "?q=%20%20")
    expect(fake.findMany.mock.calls[1]![0]!.where).toEqual({ comunidadId: COMUNIDAD })
  })

  it("`busqueda` con lista de campos vacía no inventa un OR (where de hoy)", async () => {
    const fake = delegadoFake()
    const handlers = createCrudHandlers({
      model: fake.modelo,
      schema: SchemaEntidad,
      busqueda: { campos: [] },
    })

    await get(handlers.GET, "?q=101")

    expect(fake.findMany.mock.calls[0]![0]!.where).toEqual({ comunidadId: COMUNIDAD })
  })

  it("la paginación sigue funcionando con búsqueda: pageSize/skip intactos", async () => {
    const fake = delegadoFake()
    const handlers = createCrudHandlers({
      model: fake.modelo,
      schema: SchemaEntidad,
      busqueda: { campos: ["numero"] },
    })

    await get(handlers.GET, "?q=101&page=2&pageSize=5")

    expect(fake.findMany.mock.calls[0]![0]).toMatchObject({
      skip: 5,
      take: 5,
      where: { comunidadId: COMUNIDAD, OR: [{ numero: { contains: "101" } }] },
    })
  })
})
