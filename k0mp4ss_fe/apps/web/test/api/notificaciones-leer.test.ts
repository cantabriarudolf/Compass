/**
 * @vitest-environment node
 *
 * Notificaciones — el destinatario marca leída la SUYA (H7).
 *
 * Decisión owner 2026-10-21: la gracia es alertar al admin de que se leyó.
 * El que marca es el destinatario (POST /api/notificaciones/[id]/leer,
 * recurso `notificaciones:propias`); el admin ve el estado y la fecha, pero
 * no puede firmar la lectura por otro (PUT ignora `leida` si no es el
 * destinatario). Ajena → 404, igual que inexistente, para no filtrar
 * existencia.
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

const comunidad = "notif-leer-comunidad"

const usuarios = {
  admin: { id: "nl-admin", email: "nl-admin@test.cl", rol: "administrador", personaId: null },
  comite: { id: "nl-comite", email: "nl-comite@test.cl", rol: "comite", personaId: "nl-p-comite" },
  residenteA: { id: "nl-res-a", email: "nl-res-a@test.cl", rol: "residente", personaId: "nl-p-res-a" },
  residenteB: { id: "nl-res-b", email: "nl-res-b@test.cl", rol: "residente", personaId: "nl-p-res-b" },
  conserjeria: { id: "nl-conserje", email: "nl-conserje@test.cl", rol: "conserjeria", personaId: "nl-p-conserje" },
  mantencion: { id: "nl-mantencion", email: "nl-mantencion@test.cl", rol: "mantencion", personaId: "nl-p-mantencion" },
} as const

function notificacion(
  id: string,
  destinatarioRol: string,
  destinatarioPersonaId: string | null
): Record<string, unknown> {
  return {
    id,
    comunidadId: comunidad,
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
  item: await import("@/app/api/notificaciones/[id]/route"),
  leer: await import("@/app/api/notificaciones/[id]/leer/route"),
})

describe("POST /api/notificaciones/[id]/leer — el destinatario marca (H7)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad Notif Leer", slug: "notif-leer-comunidad" },
    })

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

    await prisma.notificacion.deleteMany({ where: { comunidadId: comunidad } })
    const semilla = [
      notificacion("nl-propia-a", "residente", "nl-p-res-a"), // del residente A
      notificacion("nl-ajena-b", "residente", "nl-p-res-b"), // ajena a A
      notificacion("nl-rol-residente", "residente", null), // difusión al rol residente
      notificacion("nl-rol-personal", "personal", null), // difusión al personal
      notificacion("nl-admin", "administracion", null), // de la administración
    ]
    for (const n of semilla) {
      await prisma.notificacion.create({ data: n as never })
    }
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.notificacion.deleteMany({ where: { comunidadId: comunidad } })
      const ids = Object.values(usuarios).map((u) => u.id)
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
      for (const id of ids) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
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

  function postLeer(id: string): Promise<Response> {
    return cargaModulos().then(({ leer }) =>
      leer.POST(new NextRequest(`http://localhost/api/notificaciones/${id}/leer`, { method: "POST" }), {
        params: Promise.resolve({ id }),
      })
    )
  }

  it("401 sin sesión", async () => {
    state.cookie = ""
    const res = await postLeer("nl-propia-a")
    expect(res.status).toBe(401)
  })

  it("el destinatario marca la suya: 200, { ok: true } y leida en BD", async () => {
    await conSesion(usuarios.residenteA.email, async () => {
      const res = await postLeer("nl-propia-a")
      expect(res.status).toBe(200)
      expect((await res.json()) as { ok: boolean }).toEqual({ ok: true })
      const enBd = await prisma.notificacion.findUnique({ where: { id: "nl-propia-a" } })
      expect(enBd?.leida).toBe(true)
    })
  })

  it("idempotente: marcar dos veces no falla", async () => {
    await conSesion(usuarios.residenteA.email, async () => {
      const res = await postLeer("nl-propia-a")
      expect(res.status).toBe(200)
      const enBd = await prisma.notificacion.findUnique({ where: { id: "nl-propia-a" } })
      expect(enBd?.leida).toBe(true)
    })
  })

  it("difusión a mi rol sin destinatario puntual: el destinatario del rol la marca", async () => {
    await conSesion(usuarios.residenteA.email, async () => {
      const res = await postLeer("nl-rol-residente")
      expect(res.status).toBe(200)
      const enBd = await prisma.notificacion.findUnique({ where: { id: "nl-rol-residente" } })
      expect(enBd?.leida).toBe(true)
    })
    // el conserje NO es destinatario de una difusión a residente → 404
    await conSesion(usuarios.conserjeria.email, async () => {
      const res = await postLeer("nl-rol-residente")
      expect(res.status).toBe(404)
    })
  })

  it("ajena → 404 (igual que inexistente): no filtra existencia", async () => {
    await conSesion(usuarios.residenteA.email, async () => {
      const ajena = await postLeer("nl-ajena-b")
      expect(ajena.status).toBe(404)
      const inexistente = await postLeer("nl-inexistente")
      expect(inexistente.status).toBe(404)
      // quedó sin marcar
      const enBd = await prisma.notificacion.findUnique({ where: { id: "nl-ajena-b" } })
      expect(enBd?.leida).toBe(false)
    })
  })

  it("rol sin permiso declarado → 403", async () => {
    const email = "nl-auditor@test.cl"
    await prisma.usuario.upsert({
      where: { email },
      update: {},
      create: { id: "nl-auditor", email, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: "nl-auditor" } })
    await prisma.membresia.create({
      data: { usuarioId: "nl-auditor", comunidadId: comunidad, rol: "auditor" },
    })
    try {
      await conSesion(email, async () => {
        const res = await postLeer("nl-propia-a")
        expect(res.status).toBe(403)
      })
    } finally {
      await prisma.membresia.deleteMany({ where: { usuarioId: "nl-auditor" } })
      await prisma.usuario.delete({ where: { id: "nl-auditor" } }).catch(() => {})
    }
  })

  it("el admin NO firma lecturas ajenas: PUT ignora `leida` de una notificación ajena", async () => {
    const { item } = await cargaModulos()
    // reset: tests previos la marcaron leída; aca debe partir sin leer para
    // verificar que el PUT del admin NO la marca
    await prisma.notificacion.update({ where: { id: "nl-propia-a" }, data: { leida: false } })
    await conSesion(usuarios.admin.email, async () => {
      const res = await item.PUT(
        new NextRequest("http://localhost/api/notificaciones/nl-propia-a", {
          method: "PUT",
          body: JSON.stringify({ leida: true, asunto: "Asunto editado por admin" }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ id: "nl-propia-a" }) }
      )
      expect(res.status).toBe(200)
      const enBd = await prisma.notificacion.findUnique({ where: { id: "nl-propia-a" } })
      // el campo `leida` fue removido del merge: el estado de lectura solo lo escribe el destinatario
      expect(enBd?.leida).toBe(false)
      // el resto de la actualización parcial sí se aplicó
      expect(enBd?.asunto).toBe("Asunto editado por admin")
    })
    // el destinatario sigue pudiendo marcarla después
    await conSesion(usuarios.residenteA.email, async () => {
      const res = await postLeer("nl-propia-a")
      expect(res.status).toBe(200)
      const enBd = await prisma.notificacion.findUnique({ where: { id: "nl-propia-a" } })
      expect(enBd?.leida).toBe(true)
    })
  })

  it("PUT del admin sobre campos estándar sigue funcionando (behavior previo intacto)", async () => {
    const { item } = await cargaModulos()
    await conSesion(usuarios.admin.email, async () => {
      const res = await item.PUT(
        new NextRequest("http://localhost/api/notificaciones/nl-admin", {
          method: "PUT",
          body: JSON.stringify({ asunto: "Asunto administracion v2" }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ id: "nl-admin" }) }
      )
      expect(res.status).toBe(200)
      const enBd = await prisma.notificacion.findUnique({ where: { id: "nl-admin" } })
      expect(enBd?.asunto).toBe("Asunto administracion v2")
    })
  })
})
