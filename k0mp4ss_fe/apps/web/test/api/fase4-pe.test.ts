/**
 * @vitest-environment node
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

const comunidad = "fase4-pe"
const emailAdmin = "f4-pe-admin@test.cl"
const emailConserje = "f4-pe-conserje@test.cl"

const cargaModulos = async () => ({
  visitas: await import("@/app/api/pe/bitacora-visitas/route"),
  visitaItem: await import("@/app/api/pe/bitacora-visitas/[id]/route"),
  encomiendas: await import("@/app/api/pe/encomiendas/route"),
  contratistas: await import("@/app/api/pe/ingresos-contratistas/route"),
  proveedores: await import("@/app/api/pe/proveedores/route"),
  mantenciones: await import("@/app/api/pe/mantenciones/route"),
  visitasTec: await import("@/app/api/pe/visitas-tecnicas/route"),
  cierres: await import("@/app/api/pe/cierres-turno/route"),
  proyecciones: await import("@/app/api/pe/proyecciones/route"),
})

type Handler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> }
) => Promise<Response>

function visitaValida(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "pe-vis-1",
    fecha: "2026-03-01",
    nombre: "Visita Test",
    dni: "11111111-1",
    jornadaId: "j-manana",
    origenAgenda: "sin_aviso",
    estado: "ingresada",
    ...overrides,
  }
}

describe("/api PE — personal y servicios con BD real (Fase 4)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad F4 PE", slug: "fase4-pe" },
    })
    for (const u of [
      { id: "f4-pe-admin", email: emailAdmin, activo: true },
      { id: "f4-pe-conserje", email: emailConserje, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["f4-pe-admin", "f4-pe-conserje"] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-pe-admin", comunidadId: comunidad, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: "f4-pe-conserje", comunidadId: comunidad, rol: "conserjeria" },
    })
    await prisma.bitacoraVisitaPE.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.encomiendaPE.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.ingresoContratistaPE.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.proveedorPE.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.mantencionPreventivaPE.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.visitaTecnicaPE.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.cierreTurnoPE.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.proyeccionPE.deleteMany({ where: { comunidadId: comunidad } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.bitacoraVisitaPE.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.encomiendaPE.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.ingresoContratistaPE.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.proveedorPE.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.mantencionPreventivaPE.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.visitaTecnicaPE.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.cierreTurnoPE.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.proyeccionPE.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["f4-pe-admin", "f4-pe-conserje"] } },
      })
      for (const id of ["f4-pe-admin", "f4-pe-conserje"]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort
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

  async function llamar(
    modulo: Promise<unknown>,
    metodo: "POST" | "GET" | "PUT" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<Response> {
    // SAFETY: los módulos de route exportan handlers (req, ctx?) compatibles con Handler;
    // el cast solo adapta el tipo del import dinámico, nunca cambia valores.
    const m = (await modulo) as unknown as Record<string, Handler>
    // SAFETY: el path es interno del test (colección de 2 segmentos o ítem de 3, con query opcional).
    const limpio = path.split("?")[0] ?? path
    const partes = limpio.split("/")
    const id = partes[partes.length - 1] ?? ""
    const fn = m[metodo]
    if (!fn) throw new Error(`handler no encontrado: ${metodo} ${path}`)
    const esItem = metodo !== "POST" && partes.length > 2
    const req = new NextRequest(`http://localhost/api/${path}`, {
      method: metodo,
      ...(body !== undefined
        ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
        : {}),
    })
    if (esItem) return fn(req, { params: Promise.resolve({ id }) })
    return fn(req)
  }

  it("401 sin sesión (GET y POST bitácora)", async () => {
    const { visitas } = await cargaModulos()
    state.cookie = ""
    const get = await visitas.GET(new NextRequest("http://localhost/api/pe/bitacora-visitas"))
    expect(get.status).toBe(401)
    const post = await visitas.POST(
      new NextRequest("http://localhost/api/pe/bitacora-visitas", {
        method: "POST",
        body: JSON.stringify(visitaValida()),
        headers: { "content-type": "application/json" },
      })
    )
    expect(post.status).toBe(401)
  })

  it("admin crea visita → 201 y queda en la BD", async () => {
    const { visitas } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(visitas), "POST", "pe/bitacora-visitas", visitaValida())
      expect(res.status).toBe(201)
      const enBd = await prisma.bitacoraVisitaPE.findUnique({ where: { id: "pe-vis-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidad)
      expect(enBd?.nombre).toBe("Visita Test")
    })
  })

  it("GET bitácora devuelve página ({data,total,page,pageSize})", async () => {
    const { visitas } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const res = await llamar(Promise.resolve(visitas), "GET", "pe/bitacora-visitas?pageSize=5")
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: unknown[]; total: number; page: number; pageSize: number }
      expect(j.page).toBe(1)
      expect(j.pageSize).toBe(5)
      expect(j.total).toBeGreaterThanOrEqual(1)
      expect(j.data.length).toBeLessThanOrEqual(5)
    })
  })

  it("upsert mismo id → 200 (idempotencia) y PUT parcial + DELETE", async () => {
    const { visitas, visitaItem } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const up = await llamar(Promise.resolve(visitas), "POST", "pe/bitacora-visitas", visitaValida({ nombre: "Visita Reenviada" }))
      expect(up.status).toBe(200)
      expect((await prisma.bitacoraVisitaPE.findUnique({ where: { id: "pe-vis-1" } }))?.nombre).toBe("Visita Reenviada")
      const put = await llamar(Promise.resolve(visitaItem), "PUT", "pe/bitacora-visitas/pe-vis-1", { estado: "cancelada" })
      expect(put.status).toBe(200)
      const uno = await llamar(Promise.resolve(visitaItem), "GET", "pe/bitacora-visitas/pe-vis-1")
      expect(uno.status).toBe(200)
      expect(((await uno.json()) as { estado: string }).estado).toBe("cancelada")
      const del = await llamar(Promise.resolve(visitaItem), "DELETE", "pe/bitacora-visitas/pe-vis-1")
      expect(del.status).toBe(200)
      expect(await prisma.bitacoraVisitaPE.findUnique({ where: { id: "pe-vis-1" } })).toBeNull()
    })
  })

  it("conserjería crea bitácora (recurso pe ver/crear/editar)", async () => {
    const { visitas } = await cargaModulos()
    await conSesion(emailConserje, async () => {
      const res = await llamar(Promise.resolve(visitas), "POST", "pe/bitacora-visitas", visitaValida({ id: "pe-vis-c", nombre: "Visita Conserje" }))
      expect(res.status).toBe(201)
      expect(await prisma.bitacoraVisitaPE.findUnique({ where: { id: "pe-vis-c" } })).not.toBeNull()
    })
  })

  it("proveedor con RUT duplicado en la comunidad → 409", async () => {
    const { proveedores } = await cargaModulos()
    const base = { nombre: "Ascensores Ltda", rubro: "ascensores", activo: true }
    await conSesion(emailAdmin, async () => {
      const primero = await llamar(Promise.resolve(proveedores), "POST", "pe/proveedores", { id: "pe-prov-1", rut: "11111111-1", ...base })
      expect(primero.status).toBe(201)
      const dup = await llamar(Promise.resolve(proveedores), "POST", "pe/proveedores", { id: "pe-prov-2", rut: "11111111-1", ...base })
      expect(dup.status).toBe(409)
      expect(await prisma.proveedorPE.findUnique({ where: { id: "pe-prov-2" } })).toBeNull()
    })
  })

  it("resto de entidades PE persisten en la BD", async () => {
    const { encomiendas, contratistas, mantenciones, visitasTec, cierres, proyecciones } = await cargaModulos()
    await conSesion(emailAdmin, async () => {
      const casos: [Promise<Record<string, Handler>>, string, Record<string, unknown>, () => Promise<unknown>][] = [
        [Promise.resolve(encomiendas), "pe/encomiendas", { id: "pe-enc-1", courierId: "courier-1", fechaRecepcion: "2026-03-01", estado: "recibida" }, () => prisma.encomiendaPE.findUnique({ where: { id: "pe-enc-1" } })],
        [Promise.resolve(contratistas), "pe/ingresos-contratistas", { id: "pe-cont-1", contratistaId: "cont-1", motivo: "Reparación de caldera", fecha: "2026-03-02", jornadaId: "j-manana", agendadoPor: "administracion", estado: "agendado" }, () => prisma.ingresoContratistaPE.findUnique({ where: { id: "pe-cont-1" } })],
        [Promise.resolve(mantenciones), "pe/mantenciones", { id: "pe-mant-1", proveedorId: "pe-prov-1", descripcion: "Mantención mensual ascensores", periodicidadMeses: 1, proximaFecha: "2026-04-01", alertaDiasAntes: 7, activo: true }, () => prisma.mantencionPreventivaPE.findUnique({ where: { id: "pe-mant-1" } })],
        [Promise.resolve(visitasTec), "pe/visitas-tecnicas", { id: "pe-vt-1", proveedorId: "pe-prov-1", tecnicoNombre: "Juan Técnico", fecha: "2026-03-03", trabajoRealizado: "Revisión completa del sistema" }, () => prisma.visitaTecnicaPE.findUnique({ where: { id: "pe-vt-1" } })],
        [Promise.resolve(cierres), "pe/cierres-turno", { id: "pe-cierre-1", fecha: "2026-03-01", hora: "08:00", jornadaReportadaId: "j-manana", trabajadorPersonaId: "trab-1", incidencias: { hubo: false }, checklistInstalaciones: [], checklistEquipamiento: [], historialCambios: [], notificadoAAdmin: false }, () => prisma.cierreTurnoPE.findUnique({ where: { id: "pe-cierre-1" } })],
        [Promise.resolve(proyecciones), "pe/proyecciones", { id: "pe-proy-1", mesAnio: "2026-05", feriados: [], diasFeriados: 2, reemplazosNecesarios: 3, costoEstimado: 450000, detalleCosto: { personalPlanta: 2, costoParche: 150000, costoDiaExtra: 75000 }, enviadoAFI: false }, () => prisma.proyeccionPE.findUnique({ where: { id: "pe-proy-1" } })],
      ]
      for (const [mod, path, body, leer] of casos) {
        const res = await llamar(mod, "POST", path, body)
        expect(res.status).toBe(201)
        const enBd = (await leer()) as { comunidadId?: string } | null
        expect(enBd).not.toBeNull()
        expect(enBd?.comunidadId).toBe(comunidad)
      }
    })
  })
})
