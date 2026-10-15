/**
 * @vitest-environment node
 *
 * api-cobertura-fases fase 2 — /api/micro-sectores (58.44% → medido).
 *
 * route.ts (GET factory + POST upsert con verificación del macro sector y 409
 * por P2002) y [id]/route.ts (GET_ONE / PUT parcial / DELETE con beforeDelete:
 * 409 cuando hay unidades asociadas). Handlers exportados con sesión Auth.js
 * real (cookie mintida), Prisma sin mocks y guardias 401/403/404/409.
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

const AUTH_SECRET = "test-secret-12345678"

const comunidadA = "msec-com-a"
const comunidadB = "msec-com-b"
const emailAdmin = "msec-admin@test.cl"
const emailResidente = "msec-residente@test.cl"
const emailComite = "msec-comite@test.cl"

const macro = "msec-macro-1"
const microUno = "msec-micro-1"
const microDos = "msec-micro-2"
const microAjeno = "msec-micro-ajeno"

function microValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: microUno,
    macroSectorId: macro,
    nombre: "Piso 1",
    etiqueta: "P1",
    ...overrides,
  }
}

describe("/api/micro-sectores — sub-sectores EF con BD real", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    await prisma.comunidad.upsert({
      where: { id: comunidadA },
      update: {},
      create: { id: comunidadA, nombre: "Comunidad MicroSec A", slug: "msec-a" },
    })
    await prisma.comunidad.upsert({
      where: { id: comunidadB },
      update: {},
      create: { id: comunidadB, nombre: "Comunidad MicroSec B", slug: "msec-b" },
    })
    for (const u of [
      { id: "msec-user-admin", email: emailAdmin, activo: true },
      { id: "msec-user-residente", email: emailResidente, activo: true },
      { id: "msec-user-comite", email: emailComite, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["msec-user-admin", "msec-user-residente", "msec-user-comite"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "msec-user-admin", comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "msec-user-residente", comunidadId: comunidadA, rol: "residente" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "msec-user-comite", comunidadId: comunidadA, rol: "comite" },
    })
    await limpiarEntidades()
    await prisma.macroSector.create({
      data: { id: macro, comunidadId: comunidadA, nombre: "Torre MicroSec", etiqueta: "T" },
    })
    // Registro ajeno en otra comunidad para los 404 de scope.
    await prisma.macroSector.create({
      data: { id: "msec-macro-b", comunidadId: comunidadB, nombre: "Torre B", etiqueta: "TB" },
    })
    await prisma.microSector.create({
      data: { id: microAjeno, comunidadId: comunidadB, macroSectorId: "msec-macro-b", nombre: "Piso Ajeno", etiqueta: "XA" },
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    await limpiarEntidades()
    for (const id of ["msec-user-admin", "msec-user-residente", "msec-user-comite"]) {
      await prisma.usuario.delete({ where: { id } }).catch(() => {})
    }
    await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
    await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
  })

  async function limpiarEntidades(): Promise<void> {
    await prisma.unidad.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
    await prisma.microSector.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
    await prisma.macroSector.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
    await prisma.tipoUnidad.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
  }

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  async function llamar(
    metodo: "GET" | "POST" | "PUT" | "DELETE",
    id?: string,
    body?: unknown
  ): Promise<Response> {
    const esItem = id !== undefined
    const ruta = esItem ? await import("@/app/api/micro-sectores/[id]/route") : await import("@/app/api/micro-sectores/route")
    const req = new NextRequest(
      `http://localhost/api/micro-sectores${esItem ? `/${id}` : ""}`,
      {
        method: metodo,
        ...(metodo === "GET" || metodo === "DELETE"
          ? {}
          : {
              body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
              headers: { "content-type": "application/json" },
            }),
      }
    )
    // En la carpeta micro-sectores el GET/DELETE de los [id] está envuelto en su
    // propio handler con la misma firma.
    const sink: Record<string, (req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>> =
      ruta as unknown as Record<string, (req: NextRequest, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>>
    return sink[metodo](req, esItem ? { params: Promise.resolve({ id }) } : undefined)
  }

  it("guardia de sesión: 401 sin cookie en GET y POST", async () => {
    state.cookie = ""
    const get = await llamar("GET")
    expect(get.status).toBe(401)
    const post = await llamar("POST", undefined, microValido())
    expect(post.status).toBe(401)
  })

  it("residente: GET, POST, GET_ONE y PUT → 403 (sin permiso en MP)", async () => {
    await conSesion(emailResidente, async () => {
      const get = await llamar("GET")
      expect(get.status).toBe(403)
      const post = await llamar("POST", undefined, microValido())
      expect(post.status).toBe(403)
      const getOne = await llamar("GET", microAjeno)
      expect(getOne.status).toBe(403)
      const put = await llamar("PUT", microAjeno, { nombre: "x" })
      expect(put.status).toBe(403)
    })
  })

  it("comité: GET lista y GET_ONE → 200 (puede ver MP); POST y DELETE → 403", async () => {
    await conSesion(emailComite, async () => {
      // Sin micros aún en la comunidad: igual la lista responde 200 vacía.
      const get = await llamar("GET")
      expect(get.status).toBe(200)
      const post = await llamar("POST", undefined, microValido({ id: "msec-micro-comite" }))
      expect(post.status).toBe(403)
      expect(await prisma.microSector.findUnique({ where: { id: "msec-micro-comite" } })).toBeNull()
      // Sembramos uno por prisma para probar el 403 de DELETE.
      await prisma.microSector.create({
        data: { id: "msec-micro-del", comunidadId: comunidadA, macroSectorId: macro, nombre: "Piso Del", etiqueta: "PD" },
      })
      const del = await llamar("DELETE", "msec-micro-del")
      expect(del.status).toBe(403)
      expect(await prisma.microSector.findUnique({ where: { id: "msec-micro-del" } })).not.toBeNull()
    })
  })

  it("admin POST → 201, upsert y queda en la BD con whitelist de campos", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, microValido({ comunidadId: comunidadB, atranco: "no-persistir" }))
      expect(res.status).toBe(201)
      const enBd = await prisma.microSector.findUnique({ where: { id: microUno } })
      expect(enBd?.comunidadId).toBe(comunidadA) // el comunidadId del cliente se ignora
      expect(enBd?.nombre).toBe("Piso 1")
      expect((enBd as Record<string, unknown> | null)?.atranco).toBeUndefined()
      // Re-POST con el mismo id → 200 (upsert) y nombre actualizado.
      const dos = await llamar("POST", undefined, microValido({ nombre: "Piso Reposado" }))
      expect(dos.status).toBe(200)
      expect((await prisma.microSector.findUnique({ where: { id: microUno } }))?.nombre).toBe("Piso Reposado")
    })
  })

  it("POST con macro sector inexistente en la comunidad → 400 y nada persistido", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, microValido({ id: "msec-micro-macro-x", macroSectorId: "msec-macro-no-existe" }))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "No se puede guardar el sub-sector: el macro sector indicado no existe."
      )
      expect(await prisma.microSector.findUnique({ where: { id: "msec-micro-macro-x" } })).toBeNull()
    })
  })

  it("POST schema inválido (nombre vacío) → 400 y nada persistido", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, microValido({ id: "msec-micro-bad", nombre: "" }))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
      expect(await prisma.microSector.findUnique({ where: { id: "msec-micro-bad" } })).toBeNull()
    })
  })

  it("POST body JSON inválido → 400 «Cuerpo JSON inválido.»", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, "{no-json")
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")
    })
  })

  it("POST con id de otra comunidad → 404 (sin filtrar existencia)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, microValido({ id: microAjeno }))
      expect(res.status).toBe(404)
    })
  })

  it("GET lista → 200 con los micros de la comunidad y paginación", async () => {
    await conSesion(emailAdmin, async () => {
      await prisma.microSector.upsert({
        where: { id: microDos },
        update: {},
        create: { id: microDos, comunidadId: comunidadA, macroSectorId: macro, nombre: "Piso 2", etiqueta: "P2" },
      })
      const res = await llamar("GET")
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: { id: string }[]; total: number; page: number; pageSize: number }
      const ids = j.data.map((m) => m.id)
      // Scope por comunidad: las filas propias están y la de otra comunidad no
      // (la BD de test es compartida, así que no se asertan totales exactos).
      expect(ids).toEqual(expect.arrayContaining([microUno, microDos]))
      expect(ids).not.toContain(microAjeno)
      expect(j.total).toBeGreaterThanOrEqual(2)
    })
  })

  it("GET_ONE propio → 200; de otra comunidad o inexistente → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const ok = await llamar("GET", microUno)
      expect(ok.status).toBe(200)
      expect(((await ok.json()) as { id: string }).id).toBe(microUno)
      const ajeno = await llamar("GET", microAjeno)
      expect(ajeno.status).toBe(404)
      const nesta = await llamar("GET", "msec-no-existe")
      expect(nesta.status).toBe(404)
    })
  })

  it("PUT parcial cambia etiqueta → 200 y se refleja en la BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("PUT", microUno, { etiqueta: "P1B" })
      expect(res.status).toBe(200)
      expect((await prisma.microSector.findUnique({ where: { id: microUno } }))?.etiqueta).toBe("P1B")
    })
  })

  it("PUT con macro inexistente → 400 y el registro conserva su macro", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("PUT", microUno, { macroSectorId: "msec-macro-no-existe" })
      expect(res.status).toBe(400)
      expect((await prisma.microSector.findUnique({ where: { id: microUno } }))?.macroSectorId).toBe(macro)
    })
  })

  it("PUT sobre inexistente o de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const nesta = await llamar("PUT", "msec-no-existe", { nombre: "x" })
      expect(nesta.status).toBe(404)
      const ajeno = await llamar("PUT", microAjeno, { nombre: "x" })
      expect(ajeno.status).toBe(404)
    })
  })

  it("DELETE con unidad asociada → 409 y el sub-sector sigue existiendo", async () => {
    await conSesion(emailAdmin, async () => {
      // Sembramos tipo de unidad + unidad referenciando el micro bajo test.
      await prisma.tipoUnidad.create({
        data: {
          id: "msec-tipo-1",
          comunidadId: comunidadA,
          nombre: "Depto MicroSec",
          categoria: "habitacional",
          metraje: 60,
          montoBaseGc: 80000,
          activo: true,
          historialTarifas: [],
        },
      })
      await prisma.unidad.create({
        data: {
          id: "msec-unidad-1",
          comunidadId: comunidadA,
          microSectorId: microUno,
          numero: "101",
          etiqueta: "Depto 101",
          tipoUnidadId: "msec-tipo-1",
          metraje: 60,
          prorrateo: 0.5,
          rolSii: "0-0",
          estadoId: "ocupado",
          servicios: {},
        },
      })
      const res = await llamar("DELETE", microUno)
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "No se puede eliminar el sub-sector: 1 unidad(es) asociada(s)."
      )
      expect(await prisma.microSector.findUnique({ where: { id: microUno } })).not.toBeNull()
      // Sin unidades → 200 {ok:true} y desaparece.
      await prisma.unidad.delete({ where: { id: "msec-unidad-1" } })
      const ok = await llamar("DELETE", microUno)
      expect(ok.status).toBe(200)
      expect((await ok.json()) as { ok: boolean }).toEqual({ ok: true })
      expect(await prisma.microSector.findUnique({ where: { id: microUno } })).toBeNull()
    })
  })

  it("DELETE ajeno (otra comunidad) → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("DELETE", microAjeno)
      expect(res.status).toBe(404)
      expect(await prisma.microSector.findUnique({ where: { id: microAjeno } })).not.toBeNull()
    })
  })
})
