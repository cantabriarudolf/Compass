/**
 * @vitest-environment node
 *
 * Notificaciones — filtro server-side por destinatario (V3b de SERIE-DEUDA-6).
 *
 * Decisión owner 2026-10-21: los cinco roles ven `notificaciones`, pero solo
 * administrador y comité ven todas las de la comunidad. Conserjería, residente y
 * mantención ven SOLO las dirigidas a su persona o a su rol: abrir `ver` sin este
 * filtro filtraría datos personales de otros vecinos.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { filtroNotificaciones } from "@/lib/api/notificaciones-scope"
import type { ComunidadScope } from "@/lib/api/with-comunidad-scope"

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

const comunidad = "notif-filtro-comunidad"
const OTRACOMUNIDAD = "notif-filtro-comunidad-b"

const usuarios = {
  admin: { id: "nf-admin", email: "nf-admin@test.cl", rol: "administrador", personaId: null },
  comite: { id: "nf-comite", email: "nf-comite@test.cl", rol: "comite", personaId: null },
  conserjeria: { id: "nf-conserjeria", email: "nf-conserjeria@test.cl", rol: "conserjeria", personaId: "nf-p-conserje" },
  residenteA: { id: "nf-res-a", email: "nf-res-a@test.cl", rol: "residente", personaId: "nf-p-res-a" },
  residenteB: { id: "nf-res-b", email: "nf-res-b@test.cl", rol: "residente", personaId: "nf-p-res-b" },
  mantencion: { id: "nf-mantencion", email: "nf-mantencion@test.cl", rol: "mantencion", personaId: "nf-p-mantencion" },
} as const

function notificacion(
  id: string,
  destinatarioRol: string,
  destinatarioPersonaId: string | null,
  comunidadId: string = comunidad
): Record<string, unknown> {
  return {
    id,
    comunidadId,
    destinatarioRol,
    destinatarioPersonaId,
    asunto: `Asunto ${id}`,
    cuerpo: `Cuerpo ${id}`,
    canal: "email_simulado",
    moduloOrigen: "PE",
    fecha: "2026-10-21",
    leida: false,
  }
}

const cargaModulos = async () => ({
  coleccion: await import("@/app/api/notificaciones/route"),
  item: await import("@/app/api/notificaciones/[id]/route"),
})

describe("filtroNotificaciones — construcción pura del where (sin IO)", () => {
  const scope = (rol: string): ComunidadScope => ({
    comunidadId: "c-1",
    usuarioId: "u-1",
    rol,
  })

  it("administrador y comité ven toda la comunidad (sin filtro por destinatario)", () => {
    expect(filtroNotificaciones(scope("administrador"), null)).toEqual({ comunidadId: "c-1" })
    expect(filtroNotificaciones(scope("comite"), null)).toEqual({ comunidadId: "c-1" })
    // alias RP: directiva == comité
    expect(filtroNotificaciones(scope("directiva"), null)).toEqual({ comunidadId: "c-1" })
  })

  it("residente: su persona o su rol (residente/propietario) sin destinatario puntual", () => {
    expect(filtroNotificaciones(scope("residente"), "p-1")).toEqual({
      comunidadId: "c-1",
      OR: [
        { destinatarioPersonaId: "p-1" },
        {
          AND: [
            { destinatarioRol: { in: ["residente", "propietario"] } },
            { OR: [{ destinatarioPersonaId: null }, { destinatarioPersonaId: "" }] },
          ],
        },
      ],
    })
  })

  it("conserjería y mantención: su persona o el rol genérico 'personal'", () => {
    for (const rol of ["conserjeria", "mantencion"]) {
      expect(filtroNotificaciones(scope(rol), "p-9")).toEqual({
        comunidadId: "c-1",
        OR: [
          { destinatarioPersonaId: "p-9" },
          {
            AND: [
              { destinatarioRol: { in: ["personal"] } },
              { OR: [{ destinatarioPersonaId: null }, { destinatarioPersonaId: "" }] },
            ],
          },
        ],
      })
    }
  })

  it("sin personaId vinculada al usuario: solo queda el criterio por rol", () => {
    expect(filtroNotificaciones(scope("residente"), null)).toEqual({
      comunidadId: "c-1",
      OR: [
        {
          AND: [
            { destinatarioRol: { in: ["residente", "propietario"] } },
            { OR: [{ destinatarioPersonaId: null }, { destinatarioPersonaId: "" }] },
          ],
        },
      ],
    })
  })

  it("rol sin regla declarada: no ve ninguna notificación (menor privilegio)", () => {
    expect(filtroNotificaciones(scope("rol-inexistente"), "p-1")).toEqual({
      comunidadId: "c-1",
      id: { in: [] },
    })
  })
})

describe("/api/notificaciones — filtro por destinatario con BD real (V3b)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const [id, nombre, slug] of [
      [comunidad, "Comunidad Notif Filtro", "notif-filtro-comunidad"],
      [OTRACOMUNIDAD, "Comunidad Notif Filtro B", "notif-filtro-comunidad-b"],
    ] as const) {
      await prisma.comunidad.upsert({ where: { id }, update: {}, create: { id, nombre, slug } })
    }

    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: Object.values(usuarios).map((u) => u.id) } },
    })
    for (const u of Object.values(usuarios)) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { personaId: u.personaId },
        create: { id: u.id, email: u.email, activo: true, personaId: u.personaId },
      })
      await prisma.membresia.create({
        data: { usuarioId: u.id, comunidadId: comunidad, rol: u.rol },
      })
    }

    await prisma.notificacion.deleteMany({
      where: { comunidadId: { in: [comunidad, OTRACOMUNIDAD] } },
    })

    const semilla = [
      // Para el residente A (persona nf-p-res-a)
      notificacion("nf-propia-a", "residente", "nf-p-res-a"),
      // Para el residente B (ajena a A)
      notificacion("nf-ajena-b", "residente", "nf-p-res-b"),
      // Difusión al rol residente, sin destinatario puntual
      notificacion("nf-rol-residente", "residente", null),
      // Difusión al rol propietario (mismo rol RP que residente)
      notificacion("nf-rol-propietario", "propietario", null),
      // Aviso a la administración (no la ve un residente)
      notificacion("nf-admin", "administracion", null),
      // Para la conserjería puntual
      notificacion("nf-conserje", "personal", "nf-p-conserje"),
      // Otra comunidad: nunca debe aparecer
      notificacion("nf-otra-comunidad", "residente", "nf-p-res-a", OTRACOMUNIDAD),
    ]
    for (const n of semilla) {
      await prisma.notificacion.create({ data: n as never })
    }
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.notificacion.deleteMany({
        where: { comunidadId: { in: [comunidad, OTRACOMUNIDAD] } },
      })
      const ids = Object.values(usuarios).map((u) => u.id)
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
      for (const id of ids) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: OTRACOMUNIDAD } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
    } catch {
      // limpieza best-effort
    }
  })

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

  async function idsVisibles(query = "?pageSize=100"): Promise<string[]> {
    const { coleccion } = await cargaModulos()
    const res = await coleccion.GET(new NextRequest(`http://localhost/api/notificaciones${query}`))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { id: string }[]; total: number }
    // el total debe coincidir con lo devuelto: el filtro va en el where, no en el cliente
    expect(json.total).toBe(json.data.length)
    return json.data.map((n) => n.id).sort()
  }

  it("401 sin sesión", async () => {
    const { coleccion } = await cargaModulos()
    state.cookie = ""
    const res = await coleccion.GET(new NextRequest("http://localhost/api/notificaciones"))
    expect(res.status).toBe(401)
  })

  it("residente NO ve las notificaciones de otro residente", async () => {
    await conSesion(usuarios.residenteA.email, async () => {
      const ids = await idsVisibles()
      expect(ids).not.toContain("nf-ajena-b")
      expect(ids).not.toContain("nf-admin")
      expect(ids).not.toContain("nf-conserje")
      expect(ids).not.toContain("nf-otra-comunidad")
    })
  })

  it("residente ve la suya y las de su rol (residente/propietario sin destinatario)", async () => {
    await conSesion(usuarios.residenteA.email, async () => {
      expect(await idsVisibles()).toEqual([
        "nf-propia-a",
        "nf-rol-propietario",
        "nf-rol-residente",
      ])
    })
  })

  it("el otro residente ve la suya y no la del primero", async () => {
    await conSesion(usuarios.residenteB.email, async () => {
      const ids = await idsVisibles()
      expect(ids).toContain("nf-ajena-b")
      expect(ids).not.toContain("nf-propia-a")
    })
  })

  it("conserjería ve solo la dirigida a su persona y las del rol 'personal'", async () => {
    await conSesion(usuarios.conserjeria.email, async () => {
      const ids = await idsVisibles()
      expect(ids).toContain("nf-conserje")
      expect(ids).not.toContain("nf-propia-a")
      expect(ids).not.toContain("nf-ajena-b")
    })
  })

  it("administrador ve todas las de su comunidad (y ninguna de otra)", async () => {
    await conSesion(usuarios.admin.email, async () => {
      const ids = await idsVisibles()
      expect(ids).toEqual([
        "nf-admin",
        "nf-ajena-b",
        "nf-conserje",
        "nf-propia-a",
        "nf-rol-propietario",
        "nf-rol-residente",
      ])
    })
  })

  it("comité ve todas las de su comunidad (órgano de gobierno)", async () => {
    await conSesion(usuarios.comite.email, async () => {
      const ids = await idsVisibles()
      expect(ids).toContain("nf-ajena-b")
      expect(ids).toContain("nf-conserje")
      expect(ids).not.toContain("nf-otra-comunidad")
    })
  })

  it("GET por id: 404 si la notificación no es del destinatario; 200 si es suya", async () => {
    const { item } = await cargaModulos()
    await conSesion(usuarios.residenteA.email, async () => {
      const propia = await item.GET(
        new NextRequest("http://localhost/api/notificaciones/nf-propia-a"),
        { params: Promise.resolve({ id: "nf-propia-a" }) }
      )
      expect(propia.status).toBe(200)
      const ajena = await item.GET(
        new NextRequest("http://localhost/api/notificaciones/nf-ajena-b"),
        { params: Promise.resolve({ id: "nf-ajena-b" }) }
      )
      expect(ajena.status).toBe(404)
      const deAdmin = await item.GET(
        new NextRequest("http://localhost/api/notificaciones/nf-admin"),
        { params: Promise.resolve({ id: "nf-admin" }) }
      )
      expect(deAdmin.status).toBe(404)
    })
    await conSesion(usuarios.admin.email, async () => {
      const res = await item.GET(
        new NextRequest("http://localhost/api/notificaciones/nf-ajena-b"),
        { params: Promise.resolve({ id: "nf-ajena-b" }) }
      )
      expect(res.status).toBe(200)
    })
  })

  it("rol fuera de la matriz RBAC → 403 en la bandeja (guardia de defensa en profundidad)", async () => {
    const { coleccion } = await cargaModulos()
    const email = "nf-auditor@test.cl"
    const id = "nf-auditor"
    await prisma.usuario.upsert({
      where: { email },
      update: {},
      create: { id, email, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: id } })
    await prisma.membresia.create({
      data: { usuarioId: id, comunidadId: comunidad, rol: "auditor" },
    })
    try {
      await conSesion(email, async () => {
        const res = await coleccion.GET(new NextRequest("http://localhost/api/notificaciones"))
        expect(res.status).toBe(403)
      })
    } finally {
      await prisma.membresia.deleteMany({ where: { usuarioId: id } })
      await prisma.usuario.delete({ where: { id } }).catch(() => {})
    }
  })

  it("mantención ve la bandeja (ver) pero no puede escribir (crear/editar/eliminar)", async () => {
    const { coleccion, item } = await cargaModulos()
    await conSesion(usuarios.mantencion.email, async () => {
      const get = await coleccion.GET(new NextRequest("http://localhost/api/notificaciones"))
      expect(get.status).toBe(200)
      const post = await coleccion.POST(
        new NextRequest("http://localhost/api/notificaciones", {
          method: "POST",
          body: JSON.stringify({
            id: "nf-mant-post",
            destinatarioRol: "personal",
            asunto: "Intento de publicación de mantención",
            cuerpo: "No debería persistir: mantención solo puede leer.",
            canal: "email_simulado",
            moduloOrigen: "MT",
            fecha: "2026-10-21",
            leida: false,
          }),
          headers: { "content-type": "application/json" },
        })
      )
      expect(post.status).toBe(403)
      expect(await prisma.notificacion.findUnique({ where: { id: "nf-mant-post" } })).toBeNull()
      const del = await item.DELETE(
        new NextRequest("http://localhost/api/notificaciones/nf-conserje", { method: "DELETE" }),
        { params: Promise.resolve({ id: "nf-conserje" }) }
      )
      expect(del.status).toBe(403)
    })
  })

  it("fallo de BD en la lectura → 500 sin exponer detalles internos", async () => {
    const { coleccion, item } = await cargaModulos()
    const espiaLista = vi
      .spyOn(prisma.notificacion, "findMany")
      .mockRejectedValueOnce(new Error("SQLITE_IOERR: disco lleno"))
    const espiaUno = vi
      .spyOn(prisma.notificacion, "findFirst")
      .mockRejectedValueOnce(new Error("SQLITE_IOERR: disco lleno"))
    try {
      await conSesion(usuarios.admin.email, async () => {
        const get = await coleccion.GET(new NextRequest("http://localhost/api/notificaciones"))
        expect(get.status).toBe(500)
        expect(((await get.json()) as { error: string }).error).toBe(
          "Error interno del servidor."
        )
        const uno = await item.GET(
          new NextRequest("http://localhost/api/notificaciones/nf-propia-a"),
          { params: Promise.resolve({ id: "nf-propia-a" }) }
        )
        expect(uno.status).toBe(500)
      })
    } finally {
      espiaLista.mockRestore()
      espiaUno.mockRestore()
    }
  })
})
