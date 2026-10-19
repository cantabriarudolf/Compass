/**
 * @vitest-environment node
 *
 * am-emisores-2 — `PE_CIERRE_EDITADO` en `PUT /api/pe/cierres-turno/[id]`.
 *
 * El cierre nace por el POST de la colección y se edita por el put-merge de
 * `[id]`, que no auditaba. La ruta ahora emite el evento (categoría PE) después
 * del update, preservando el historial que envía el cliente, y no emite en los
 * caminos rojos (400/403/404).
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

const comunidadA = "pecierre-com-a"
const comunidadB = "pecierre-com-b"
const emailAdmin = "pecierre-admin@test.cl"
const emailMantencion = "pecierre-mantencion@test.cl"

const usuarios = [
  { id: "pecierre-user-admin", email: emailAdmin, rol: "administrador" },
  { id: "pecierre-user-mantencion", email: emailMantencion, rol: "mantencion" },
]

function cierre(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    fecha: "2026-03-08",
    hora: "08:00",
    jornadaReportadaId: "pecierre-jornada-manana",
    trabajadorPersonaId: "pecierre-pers-1",
    novedadesGenerales: "Turno sin novedades",
    incidencias: { hubo: false },
    checklistInstalaciones: [{ item: "Portón principal", ok: true }],
    checklistEquipamiento: [{ item: "Celular de ronda", ok: true }],
    historialCambios: [{ fecha: "2026-03-08", resumen: "Cierre enviado por el trabajador" }],
    notificadoAAdmin: true,
    ...overrides,
  }
}

describe("/api/pe/cierres-turno/[id] — auditoría PE_CIERRE_EDITADO (am-emisores-2)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    for (const c of [
      { id: comunidadA, nombre: "Comunidad PE Cierres A", slug: "pecierre-a" },
      { id: comunidadB, nombre: "Comunidad PE Cierres B", slug: "pecierre-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of usuarios) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: {},
        create: { id: u.id, email: u.email, activo: true },
      })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: usuarios.map((u) => u.id) } },
    })
    for (const u of usuarios) {
      await prisma.membresia.create({
        data: { usuarioId: u.id, comunidadId: comunidadA, rol: u.rol },
      })
    }
    await limpiar()
    for (const id of ["pecierre-cie-1", "pecierre-cie-403", "pecierre-cie-400"]) {
      await prisma.cierreTurnoPE.create({
        data: { ...cierre(id), comunidadId: comunidadA } as never,
      })
    }
    // Cierre ajeno (otra comunidad) para el 404 de scope.
    await prisma.cierreTurnoPE.create({
      data: {
        ...cierre("pecierre-cie-ajeno", { novedadesGenerales: "Cierre de otra comunidad" }),
        comunidadId: comunidadB,
      } as never,
    })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      delete process.env.NEXT_PUBLIC_APP_ENV
      await limpiar()
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: usuarios.map((u) => u.id) } },
      })
      for (const u of usuarios) {
        await prisma.usuario.delete({ where: { id: u.id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function limpiar(): Promise<void> {
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidadA, comunidadB] } },
    })
    await prisma.cierreTurnoPE.deleteMany({
      where: { comunidadId: { in: [comunidadA, comunidadB] } },
    })
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

  async function put(id: string, body?: unknown): Promise<Response> {
    const { PUT } = await import("@/app/api/pe/cierres-turno/[id]/route")
    const req = new NextRequest(`http://localhost/api/pe/cierres-turno/${id}`, {
      method: "PUT",
      ...(body !== undefined
        ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
        : {}),
    })
    return PUT(req, { params: Promise.resolve({ id }) })
  }

  const contarEventos = () =>
    prisma.eventoAuditoria.count({
      where: { comunidadId: comunidadA, tipoAccion: "PE_CIERRE_EDITADO" },
    })

  it("PUT admin edita las novedades → 200, historial preservado y UN evento categoría PE", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await put("pecierre-cie-1", {
        novedadesGenerales: "Se detectó una filtración en el subterráneo",
        historialCambios: [
          { fecha: "2026-03-08", resumen: "Cierre enviado por el trabajador" },
          { fecha: "2026-03-08", resumen: "Administración corrige las novedades del turno" },
        ],
      })
      expect(res.status).toBe(200)

      const enBd = await prisma.cierreTurnoPE.findUnique({ where: { id: "pecierre-cie-1" } })
      expect(enBd?.novedadesGenerales).toBe("Se detectó una filtración en el subterráneo")
      expect((enBd?.historialCambios as unknown[]).length).toBe(2)

      const eventos = await prisma.eventoAuditoria.findMany({
        where: { comunidadId: comunidadA, tipoAccion: "PE_CIERRE_EDITADO" },
      })
      expect(eventos).toHaveLength(1)
      const evento = eventos[0]!
      expect(evento.categoria).toBe("PE")
      expect(evento.tipoAccion).toBe("PE_CIERRE_EDITADO")
      expect(evento.referenciaId).toBe("pecierre-cie-1")
      expect(evento.usuario).toBe("pecierre-user-admin")
      expect(evento.descripcion).toContain("filtración en el subterráneo")
      expect(evento.descripcion).toContain("2 entrada(s) en el historial")
    })
  })

  it("PUT 403 (rol sin permiso PE) no emite evento", async () => {
    await conSesion(emailMantencion, async () => {
      const res = await put("pecierre-cie-403", {
        novedadesGenerales: "Intento de edición no autorizado",
      })
      expect(res.status).toBe(403)
      expect(await contarEventos()).toBe(1)
    })
  })

  it("PUT 404 (cierre de otra comunidad) no emite evento", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await put("pecierre-cie-ajeno", { novedadesGenerales: "Editado desde otra comunidad" })
      expect(res.status).toBe(404)
      expect(await contarEventos()).toBe(1)
    })
  })

  it("PUT 400 (incidencias sin el flag obligatorio) no emite evento", async () => {
    await conSesion(emailAdmin, async () => {
      // El parche reemplaza el objeto incidencias y le falta `hubo` (obligatorio).
      const res = await put("pecierre-cie-400", { incidencias: { descripcion: "sin flag" } })
      expect(res.status).toBe(400)
      expect(await contarEventos()).toBe(1)
    })
  })
})
