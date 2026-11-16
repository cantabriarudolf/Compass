// @vitest-environment node
/**
 * T21 (riesgo 6 del verificador independiente) — el proveedor que decide
 * `mode: "insensitive"` NO puede degradar en silencio.
 *
 * Modo de falla observado en `fd5683c`: el proveedor se leía del cliente Prisma
 * GENERADO (`node_modules/.prisma/client/schema.prisma`, caminando hacia arriba
 * desde `process.cwd()`). Si el artefacto no estaba a mano, la detección
 * devolvía `null`, el filtro salía sin `mode` y en PostgreSQL una búsqueda en
 * minúsculas devolvía CERO filas sin ningún aviso. La mutación «forzar `null`
 * en el wiring» dejaba la suite entera en verde: el punto decisivo no tenía
 * test.
 *
 * Este archivo muerde exactamente ahí: fuerza el proveedor a PostgreSQL
 * mockeando `proveedorDeUrl` — el MISMO helper que la ruta usa para derivar el
 * proveedor de `process.env.DATABASE_URL` — y espía `prisma.persona.findMany`
 * para mirar el `where.OR` REAL que llega a Prisma, no el helper suelto. Si el
 * wiring pierde el proveedor, cada rama del OR sale sin `mode` y este test
 * muere.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { cookieDeUsuario, invocarApi } from "../helpers/api-sesion"

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

// El proveedor se FUERZA a PostgreSQL sin depender del entorno: la suite corre
// en SQLite, y el punto que se pinea es el wiring, no la base de acá.
vi.mock("@/lib/database-url", async (orig) => {
  const real = await orig<typeof import("@/lib/database-url")>()
  return { ...real, proveedorDeUrl: () => "postgresql" }
})

const COMUNIDAD = "t21prov-com"
const EMAIL_ADMIN = "t21prov-admin@test.cl"

const moduloBuscador = () => import("@/app/api/periodos-directiva/buscar-personas/route")

describe("T21 — el proveedor del filtro no degrada en silencio", () => {
  afterEach(() => {
    state.cookie = ""
  })

  it("con proveedor PostgreSQL, una búsqueda de una palabra llega a Prisma con `mode: insensitive` en CADA campo del OR", async () => {
    const usuario = await prisma.usuario.upsert({
      where: { email: EMAIL_ADMIN },
      update: { personaId: null },
      create: { email: EMAIL_ADMIN, personaId: null, activo: true },
    })
    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad T21 prov", slug: "t21prov" },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, comunidadId: COMUNIDAD, rol: "administrador" },
    })

    // Las consultas NO golpean la base: con `mode` el conector SQLite la
    // rechazaría. Lo que se pinea es el where que LLEGA a Prisma.
    const buscarMany = vi.spyOn(prisma.persona, "findMany").mockResolvedValue([])
    const contar = vi.spyOn(prisma.persona, "count").mockResolvedValue(0)
    try {
      state.cookie = await cookieDeUsuario(EMAIL_ADMIN)
      const res = await invocarApi(
        moduloBuscador(),
        "GET",
        "periodos-directiva/buscar-personas?q=Buscada"
      )
      expect(res.status).toBe(200)
      expect(buscarMany).toHaveBeenCalledTimes(1)

      const argumentos = buscarMany.mock.calls[0]?.[0] as
        | { where?: { OR?: Array<Record<string, { contains?: string; mode?: string }>> } }
        | undefined
      expect(Array.isArray(argumentos?.where?.OR)).toBe(true)
      const ramas = argumentos?.where?.OR ?? []
      expect(ramas).toHaveLength(3)

      const campos = new Set<string>()
      for (const rama of ramas) {
        const entradas = Object.entries(rama)
        expect(entradas).toHaveLength(1)
        const [campo, condicion] = entradas[0] as [string, { contains?: string; mode?: string }]
        campos.add(campo)
        // CADA campo declara el modo: una sola rama que lo pierda ya es la
        // búsqueda muda de Postgres (cero filas, sin aviso).
        expect(condicion).toEqual({ contains: "Buscada", mode: "insensitive" })
      }
      expect(campos).toEqual(new Set(["nombreCompleto", "rut", "email"]))
    } finally {
      buscarMany.mockRestore()
      contar.mockRestore()
      await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
      await prisma.usuario.delete({ where: { id: usuario.id } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: COMUNIDAD } }).catch(() => {})
    }
  })
})
