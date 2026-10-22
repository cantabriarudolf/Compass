/**
 * @vitest-environment node
 *
 * Inventario de insumos IR — decisión owner 2026-10-21 ("se están pasando
 * insumos básicos, no es controlar el stock de uranio"): entregar una solicitud
 * descuenta stock en la MISMA transacción, sin segunda aprobación, y el comodín
 * se resuelve en un click (entregar sustituto o rechazar).
 *
 * Cubre las dos rutas custom contra BD real (base descartable de la suite):
 * - `POST /api/ir/solicitudes-insumo/[id]/entregar`
 * - `POST /api/ir/solicitudes-insumo/[id]/resolver-comodin`
 *
 * Guardias: 401 sin sesión, 403 con rol sin `editar` sobre ir:mantenimiento,
 * 404 con solicitud de otra comunidad, idempotencia de la entrega y atomicidad
 * del descuento de stock.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
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

const comunidad = "ir-insumos-comunidad"
const otraComunidad = "ir-insumos-otra-comunidad"
const emailAdmin = "ir-admin@test.cl"
const emailResidente = "ir-residente@test.cl"
const emailConserjeria = "ir-conserjeria@test.cl"
const emailComite = "ir-comite@test.cl"
const emailMantencion = "ir-mantencion@test.cl"
const emailAdminOtra = "ir-admin-otra@test.cl"

const emailToId = (email: string): string => email.split("@")[0] ?? email

/** Hoy ISO: la ruta sella `entregaFecha` con `hoyISO()` del servidor. */
const hoy = (): string => new Date().toISOString().slice(0, 10)

const cargaModulos = async () => ({
  coleccion: await import("@/app/api/ir/solicitudes-insumo/route"),
  entregar: await import("@/app/api/ir/solicitudes-insumo/[id]/entregar/route"),
  resolverComodin: await import(
    "@/app/api/ir/solicitudes-insumo/[id]/resolver-comodin/route"
  ),
})

/** Recurso/insumo base del catálogo, scoped por comunidad. */
async function crearInsumo(
  overrides: Partial<{
    id: string
    comunidadId: string
    nombre: string
    stock: number
    esCritico: boolean
    umbralCritico: number | null
  }> = {}
): Promise<string> {
  const id = overrides.id ?? `ir-insumo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  await prisma.recursoIR.create({
    data: {
      id,
      comunidadId: overrides.comunidadId ?? comunidad,
      codigo: `IR-A-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      nombre: overrides.nombre ?? "Guantes de nitrilo",
      categoria: "insumo",
      estadoActivo: "disponible",
      stock: overrides.stock ?? 10,
      esCritico: overrides.esCritico ?? false,
      umbralCritico: overrides.umbralCritico ?? null,
    },
  })
  return id
}

/** Solicitud de insumo pendiente (con o sin comodín). */
async function crearSolicitud(
  overrides: Partial<{
    id: string
    comunidadId: string
    folio: string
    recursoInsumoId: string | null
    comodin: { descripcionArticulo: string; justificacion: string } | null
    estadoComodin: string
    cantidad: number
    estado: string
  }> = {}
): Promise<string> {
  const id = overrides.id ?? `ir-sol-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  await prisma.solicitudInsumoIR.create({
    data: {
      id,
      comunidadId: overrides.comunidadId ?? comunidad,
      folio: overrides.folio ?? `IR-SOL-${Math.floor(Math.random() * 9000) + 1000}`,
      solicitantePersonaId: "ir-p-solicitante",
      ...(overrides.recursoInsumoId ? { recursoInsumoId: overrides.recursoInsumoId } : {}),
      ...(overrides.comodin ? { comodin: overrides.comodin as never } : {}),
      estadoComodin: overrides.estadoComodin ?? "no_comodin",
      cantidad: overrides.cantidad ?? 3,
      areaDestino: "Conserjería",
      estado: overrides.estado ?? "pendiente",
      fechaSolicitud: hoy(),
    },
  })
  return id
}

async function sembrarUsuarios(): Promise<void> {
  // [email, rol, comunidad]: la membresía fija la comunidad del scope server-side.
  const roles: Array<[string, string, string]> = [
    [emailAdmin, "administrador", comunidad],
    [emailResidente, "residente", comunidad],
    [emailConserjeria, "conserjeria", comunidad],
    [emailComite, "comite", comunidad],
    [emailMantencion, "mantencion", comunidad],
    [emailAdminOtra, "administrador", otraComunidad],
  ]
  await prisma.membresia.deleteMany({
    where: { usuarioId: { in: roles.map(([email]) => emailToId(email)) } },
  })
  for (const [email, rol, comunidadId] of roles) {
    await prisma.usuario.upsert({
      where: { email },
      update: {},
      create: { id: emailToId(email), email, activo: true },
    })
    await prisma.membresia.create({
      data: { usuarioId: emailToId(email), comunidadId, rol },
    })
  }
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

async function postEntregar(id: string): Promise<Response> {
  const { entregar } = await cargaModulos()
  return entregar.POST(
    new NextRequest(`http://localhost/api/ir/solicitudes-insumo/${id}/entregar`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id }) }
  )
}

async function postResolverComodin(id: string, body: unknown): Promise<Response> {
  const { resolverComodin } = await cargaModulos()
  return resolverComodin.POST(
    new NextRequest(
      `http://localhost/api/ir/solicitudes-insumo/${id}/resolver-comodin`,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }
    ),
    { params: Promise.resolve({ id }) }
  )
}

async function postCrearSolicitud(body: unknown): Promise<Response> {
  const { coleccion } = await cargaModulos()
  return coleccion.POST(
    new NextRequest("http://localhost/api/ir/solicitudes-insumo", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
  )
}

const stockDe = async (id: string): Promise<number | undefined> =>
  (await prisma.recursoIR.findUnique({ where: { id } }))?.stock

const solicitudDe = async (id: string) =>
  prisma.solicitudInsumoIR.findUnique({ where: { id } })

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET
  await prisma.comunidad.upsert({
    where: { id: comunidad },
    update: {},
    create: { id: comunidad, nombre: "Comunidad Insumos IR", slug: "ir-insumos-comunidad" },
  })
  await prisma.comunidad.upsert({
    where: { id: otraComunidad },
    update: {},
    create: { id: otraComunidad, nombre: "Comunidad Insumos Otra", slug: "ir-insumos-otra" },
  })
  await sembrarUsuarios()
  // Los módulos de ruta importan el stack de Auth.js: se cargan acá (con el
  // timeout largo del `beforeAll`) para que el primer test no pague ese costo.
  await cargaModulos()
}, 60_000)

beforeEach(async () => {
  state.cookie = ""
  await prisma.eventoAuditoria.deleteMany({
    where: {
      comunidadId: comunidad,
      categoria: "IR",
      tipoAccion: { in: ["IR_SOLICITUD_ENTREGADA", "IR_COMODIN_RESUELTO", "IR_STOCK_LOW"] },
    },
  })
  await prisma.solicitudInsumoIR.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.recursoIR.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
})

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.solicitudInsumoIR.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.recursoIR.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    const ids = [
      emailAdmin,
      emailResidente,
      emailConserjeria,
      emailComite,
      emailMantencion,
      emailAdminOtra,
    ].map(emailToId)
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
    for (const id of ids) {
      await prisma.usuario.delete({ where: { id } }).catch(() => {})
    }
    await prisma.comunidad.delete({ where: { id: otraComunidad } }).catch(() => {})
    await prisma.comunidad.delete({ where: { id: comunidad } }).catch(() => {})
  } catch {
    // limpieza best-effort
  }
})

describe("POST /api/ir/solicitudes-insumo/[id]/entregar", () => {
  it("401 sin sesión", async () => {
    const recursoId = await crearInsumo()
    const solicitudId = await crearSolicitud({ recursoInsumoId: recursoId })
    state.cookie = ""
    const res = await postEntregar(solicitudId)
    expect(res.status).toBe(401)
    // nada se movió
    expect(await stockDe(recursoId)).toBe(10)
    expect((await solicitudDe(solicitudId))?.estado).toBe("pendiente")
  })

  it("403 para roles sin `editar` sobre ir:mantenimiento (residente y comité)", async () => {
    const recursoId = await crearInsumo()
    const solicitudId = await crearSolicitud({ recursoInsumoId: recursoId })
    for (const email of [emailResidente, emailComite]) {
      await conSesion(email, async () => {
        const res = await postEntregar(solicitudId)
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: "Permiso denegado." })
      })
    }
    expect(await stockDe(recursoId)).toBe(10)
    expect((await solicitudDe(solicitudId))?.estado).toBe("pendiente")
  })

  it("conserjería y mantención sí entregan (decisión owner 2026-10-21)", async () => {
    for (const email of [emailConserjeria, emailMantencion]) {
      const recursoId = await crearInsumo({ stock: 10 })
      const solicitudId = await crearSolicitud({ recursoInsumoId: recursoId, cantidad: 2 })
      await conSesion(email, async () => {
        const res = await postEntregar(solicitudId)
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, stockNuevo: 8 })
      })
      expect((await solicitudDe(solicitudId))?.estado).toBe("entregada")
      expect(await stockDe(recursoId)).toBe(8)
    }
  })

  it("entregar → 200, marca Entregada y descuenta el stock en la misma transacción", async () => {
    const recursoId = await crearInsumo({ stock: 10 })
    const solicitudId = await crearSolicitud({ recursoInsumoId: recursoId, cantidad: 3 })

    await conSesion(emailAdmin, async () => {
      const res = await postEntregar(solicitudId)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, stockNuevo: 7 })

      const solicitud = await solicitudDe(solicitudId)
      expect(solicitud?.estado).toBe("entregada")
      expect(solicitud?.entregaFecha).toBe(hoy())
      expect(await stockDe(recursoId)).toBe(7)

      const eventos = await prisma.eventoAuditoria.findMany({
        where: {
          comunidadId: comunidad,
          tipoAccion: "IR_SOLICITUD_ENTREGADA",
          referenciaId: solicitudId,
        },
      })
      expect(eventos).toHaveLength(1)
      expect(eventos[0]?.usuario).toBe(emailToId(emailAdmin))
      expect(eventos[0]?.categoria).toBe("IR")
    })
  })

  it("es idempotente: entregar dos veces no descuenta dos veces", async () => {
    const recursoId = await crearInsumo({ stock: 10 })
    const solicitudId = await crearSolicitud({ recursoInsumoId: recursoId, cantidad: 4 })

    await conSesion(emailAdmin, async () => {
      expect((await postEntregar(solicitudId)).status).toBe(200)
      const segunda = await postEntregar(solicitudId)
      expect(segunda.status).toBe(200)
      expect(await segunda.json()).toEqual({ ok: true, yaEntregada: true })
    })

    expect(await stockDe(recursoId)).toBe(6)
    // un solo evento: la segunda entrega no repite auditoría
    expect(
      await prisma.eventoAuditoria.count({
        where: {
          comunidadId: comunidad,
          tipoAccion: "IR_SOLICITUD_ENTREGADA",
          referenciaId: solicitudId,
        },
      })
    ).toBe(1)
  })

  it("stock insuficiente → 400 con el mensaje legacy y la transacción revierte el estado", async () => {
    const recursoId = await crearInsumo({ stock: 2 })
    const solicitudId = await crearSolicitud({ recursoInsumoId: recursoId, cantidad: 5 })

    await conSesion(emailAdmin, async () => {
      const res = await postEntregar(solicitudId)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: "Stock insuficiente: quedan 2 unidad(es) y se solicitaron 5.",
      })
    })

    // atomicidad: NO quedó entregada sin descontar ni descontó sin entregar
    expect((await solicitudDe(solicitudId))?.estado).toBe("pendiente")
    expect(await stockDe(recursoId)).toBe(2)
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: comunidad, tipoAccion: "IR_SOLICITUD_ENTREGADA" },
      })
    ).toBe(0)
  })

  it("solicitud rechazada → 400 (solo una Pendiente puede entregarse)", async () => {
    const recursoId = await crearInsumo()
    const solicitudId = await crearSolicitud({
      recursoInsumoId: recursoId,
      estado: "rechazada",
    })
    await conSesion(emailAdmin, async () => {
      const res = await postEntregar(solicitudId)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: "Solo una solicitud Pendiente puede entregarse.",
      })
    })
    expect(await stockDe(recursoId)).toBe(10)
  })

  it("solicitud inexistente → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await postEntregar("ir-sol-inexistente")
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({
        error: "No se puede entregar: la solicitud no existe.",
      })
    })
  })

  it("solicitud de otra comunidad → 404 sin tocar su stock", async () => {
    const recursoAjeno = await crearInsumo({
      comunidadId: otraComunidad,
      stock: 10,
      nombre: "Insumo otra comunidad",
    })
    const solicitudAjena = await crearSolicitud({
      comunidadId: otraComunidad,
      recursoInsumoId: recursoAjeno,
      cantidad: 2,
    })

    await conSesion(emailAdmin, async () => {
      const res = await postEntregar(solicitudAjena)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({
        error: "No se puede entregar: la solicitud no existe.",
      })
    })

    expect((await solicitudDe(solicitudAjena))?.estado).toBe("pendiente")
    expect(await stockDe(recursoAjeno)).toBe(10)
  })

  it("comodín sin artículo asociado → 400 (resuélvelo primero)", async () => {
    const solicitudId = await crearSolicitud({
      comodin: { descripcionArticulo: "Mascarilla FFP2", justificacion: "No hay stock en el catálogo vigente de insumos." },
      estadoComodin: "pendiente",
    })
    await conSesion(emailAdmin, async () => {
      const res = await postEntregar(solicitudId)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error:
          "No se puede entregar: el comodín aún no tiene artículo asociado (resuélvelo primero).",
      })
    })
  })
})

describe("POST /api/ir/solicitudes-insumo/[id]/resolver-comodin", () => {
  const justificacion = "El artículo pedido no existe en el catálogo de insumos vigente."

  async function crearComodin(): Promise<string> {
    return crearSolicitud({
      comodin: { descripcionArticulo: "Mascarilla FFP2", justificacion },
      estadoComodin: "pendiente",
    })
  }

  it("401 sin sesión", async () => {
    const solicitudId = await crearComodin()
    state.cookie = ""
    const res = await postResolverComodin(solicitudId, { accion: "rechazar", justificacion })
    expect(res.status).toBe(401)
    expect((await solicitudDe(solicitudId))?.estadoComodin).toBe("pendiente")
  })

  it("403 para roles sin `editar` sobre ir:mantenimiento (residente)", async () => {
    const solicitudId = await crearComodin()
    await conSesion(emailResidente, async () => {
      const res = await postResolverComodin(solicitudId, {
        accion: "rechazar",
        justificacion,
      })
      expect(res.status).toBe(403)
    })
    expect((await solicitudDe(solicitudId))?.estadoComodin).toBe("pendiente")
  })

  it("sustituir → 200: entrega la solicitud y descuenta el stock del sustituto", async () => {
    const solicitudId = await crearComodin()
    const sustitutoId = await crearInsumo({ nombre: "Mascarilla quirúrgica", stock: 8 })

    await conSesion(emailAdmin, async () => {
      const res = await postResolverComodin(solicitudId, {
        accion: "sustituir",
        recursoSustitutoId: sustitutoId,
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, stockNuevo: 5 })
    })

    const solicitud = await solicitudDe(solicitudId)
    expect(solicitud?.estadoComodin).toBe("sustituida")
    // un click cierra el ciclo: queda entregada, no pendiente
    expect(solicitud?.estado).toBe("entregada")
    expect(solicitud?.entregaFecha).toBe(hoy())
    expect(solicitud?.recursoSustitutoId).toBe(sustitutoId)
    expect(solicitud?.recursoInsumoId).toBe(sustitutoId)
    expect(await stockDe(sustitutoId)).toBe(5)

    expect(
      await prisma.eventoAuditoria.count({
        where: {
          comunidadId: comunidad,
          tipoAccion: "IR_COMODIN_RESUELTO",
          referenciaId: solicitudId,
        },
      })
    ).toBe(1)
  })

  it("sustituir sin stock suficiente → 400 y la solicitud sigue pendiente", async () => {
    const solicitudId = await crearComodin()
    const sustitutoId = await crearInsumo({ nombre: "Mascarilla quirúrgica", stock: 1 })
    await conSesion(emailAdmin, async () => {
      const res = await postResolverComodin(solicitudId, {
        accion: "sustituir",
        recursoSustitutoId: sustitutoId,
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: "Stock insuficiente: quedan 1 unidad(es) y se solicitaron 3.",
      })
    })
    expect((await solicitudDe(solicitudId))?.estadoComodin).toBe("pendiente")
    expect(await stockDe(sustitutoId)).toBe(1)
  })

  it("sustituir con un recurso de otra comunidad → 400 (no es del catálogo)", async () => {
    const solicitudId = await crearComodin()
    const ajenoId = await crearInsumo({
      comunidadId: otraComunidad,
      nombre: "Insumo otra comunidad",
    })
    await conSesion(emailAdmin, async () => {
      const res = await postResolverComodin(solicitudId, {
        accion: "sustituir",
        recursoSustitutoId: ajenoId,
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: "La sustitución exige un artículo similar existente en el catálogo.",
      })
    })
    expect(await stockDe(ajenoId)).toBe(10)
    expect((await solicitudDe(solicitudId))?.estadoComodin).toBe("pendiente")
  })

  it("sustituir sin indicar sustituto → 400", async () => {
    const solicitudId = await crearComodin()
    await conSesion(emailAdmin, async () => {
      const res = await postResolverComodin(solicitudId, { accion: "sustituir" })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: "La sustitución exige un artículo similar existente en el catálogo.",
      })
    })
  })

  it("rechazar → 200: cierra la solicitud sin descontar stock", async () => {
    const solicitudId = await crearComodin()
    const insumoId = await crearInsumo({ stock: 10 })

    await conSesion(emailAdmin, async () => {
      const res = await postResolverComodin(solicitudId, {
        accion: "rechazar",
        justificacion: "Se pidió un EPP que no corresponde al área solicitada.",
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    })

    const solicitud = await solicitudDe(solicitudId)
    expect(solicitud?.estado).toBe("rechazada")
    expect(solicitud?.estadoComodin).toBe("rechazada")
    expect(solicitud?.rechazoJustificacion).toBe(
      "Se pidió un EPP que no corresponde al área solicitada."
    )
    // no se descontó nada de ningún insumo del catálogo
    expect(await stockDe(insumoId)).toBe(10)
  })

  it("rechazar sin justificación → 400 (mensaje legacy)", async () => {
    const solicitudId = await crearComodin()
    await conSesion(emailAdmin, async () => {
      const res = await postResolverComodin(solicitudId, { accion: "rechazar" })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: "El rechazo exige justificación obligatoria.",
      })
    })
    expect((await solicitudDe(solicitudId))?.estadoComodin).toBe("pendiente")
  })

  it("aprobar_crear → 200: da de alta el artículo en el catálogo con stock 0", async () => {
    const solicitudId = await crearComodin()
    await conSesion(emailAdmin, async () => {
      const res = await postResolverComodin(solicitudId, { accion: "aprobar_crear" })
      expect(res.status).toBe(200)
      const cuerpo = (await res.json()) as { ok: boolean; recursoCreadoId?: string }
      expect(cuerpo.ok).toBe(true)
      expect(cuerpo.recursoCreadoId).toBeTruthy()

      const creado = await prisma.recursoIR.findUnique({
        where: { id: cuerpo.recursoCreadoId },
      })
      expect(creado?.nombre).toBe("Mascarilla FFP2")
      expect(creado?.categoria).toBe("insumo")
      expect(creado?.stock).toBe(0)
      expect(creado?.codigo).toMatch(/^IR-A-\d{4}$/)

      const solicitud = await solicitudDe(solicitudId)
      expect(solicitud?.estadoComodin).toBe("aprobada_creada")
      expect(solicitud?.recursoInsumoId).toBe(creado?.id)
    })
  })

  it("comodín ya resuelto → 400 (idempotencia por estado)", async () => {
    const solicitudId = await crearComodin()
    const sustitutoId = await crearInsumo({ nombre: "Mascarilla quirúrgica", stock: 8 })

    await conSesion(emailAdmin, async () => {
      expect(
        (
          await postResolverComodin(solicitudId, {
            accion: "sustituir",
            recursoSustitutoId: sustitutoId,
          })
        ).status
      ).toBe(200)

      const segunda = await postResolverComodin(solicitudId, {
        accion: "sustituir",
        recursoSustitutoId: sustitutoId,
      })
      expect(segunda.status).toBe(400)
      expect(await segunda.json()).toEqual({
        error: "Solo una solicitud comodín pendiente puede resolverse.",
      })
    })

    // el stock se descontó UNA sola vez
    expect(await stockDe(sustitutoId)).toBe(5)
  })

  it("comodín de otra comunidad → 404", async () => {
    const solicitudAjena = await crearSolicitud({
      comunidadId: otraComunidad,
      comodin: { descripcionArticulo: "Mascarilla FFP2", justificacion },
      estadoComodin: "pendiente",
    })
    await conSesion(emailAdmin, async () => {
      const res = await postResolverComodin(solicitudAjena, {
        accion: "rechazar",
        justificacion,
      })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({
        error: "No se puede resolver: la solicitud no existe.",
      })
    })
    expect((await solicitudDe(solicitudAjena))?.estadoComodin).toBe("pendiente")
  })

  it("acción desconocida → 400 (datos inválidos)", async () => {
    const solicitudId = await crearComodin()
    await conSesion(emailAdmin, async () => {
      const res = await postResolverComodin(solicitudId, { accion: "aprobar" })
      expect(res.status).toBe(400)
      const cuerpo = (await res.json()) as { error: string }
      expect(cuerpo.error).toBe("Datos inválidos.")
    })
  })
})

/**
 * Bug preexistente (bloqueaba el flujo completo): la página crea solicitudes
 * con `folio: ""` y `SolicitudInsumoIRSchema.folio` exige `min(1)`, así que el
 * POST del factory respondía 400 "Datos inválidos." y no se podía crear NINGUNA
 * solicitud (entregar no tenía input). El POST propio de la colección genera el
 * correlativo `SI-####` server-side con el patrón legacy del store.
 */
describe("POST /api/ir/solicitudes-insumo — folio SI-#### server-side", () => {
  const idUnico = (): string =>
    `ir-sol-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

  /** Body equivalente al que envía `app/inventario/recursos/page.tsx`. */
  const solicitudBase = (overrides: Record<string, unknown> = {}) => ({
    id: idUnico(),
    solicitantePersonaId: "ir-p-solicitante",
    estadoComodin: "no_comodin",
    cantidad: 2,
    areaDestino: "Conserjería",
    estado: "pendiente",
    fechaSolicitud: hoy(),
    ...overrides,
  })

  it("sin folio → 201 con SI-0001; con `folio: \"\"` → SI-0002; con espacios → SI-0003", async () => {
    const recursoId = await crearInsumo()
    await conSesion(emailAdmin, async () => {
      const primera = await postCrearSolicitud(
        solicitudBase({ id: "ir-sol-folio-1", recursoInsumoId: recursoId })
      )
      expect(primera.status).toBe(201)
      expect(((await primera.json()) as { folio: string }).folio).toBe("SI-0001")

      const segunda = await postCrearSolicitud(
        solicitudBase({ id: "ir-sol-folio-2", folio: "", recursoInsumoId: recursoId })
      )
      expect(segunda.status).toBe(201)
      expect(((await segunda.json()) as { folio: string }).folio).toBe("SI-0002")

      const tercera = await postCrearSolicitud(
        solicitudBase({ id: "ir-sol-folio-3", folio: "   ", recursoInsumoId: recursoId })
      )
      expect(tercera.status).toBe(201)
      expect(((await tercera.json()) as { folio: string }).folio).toBe("SI-0003")
    })
    // el folio quedó persistido (la página ya puede crear y entregar después)
    expect((await solicitudDe("ir-sol-folio-1"))?.folio).toBe("SI-0001")
    expect((await solicitudDe("ir-sol-folio-3"))?.folio).toBe("SI-0003")
  })

  it("la solicitud creada sin folio se puede entregar (flujo completo de la página)", async () => {
    const recursoId = await crearInsumo({ stock: 5 })
    await conSesion(emailAdmin, async () => {
      const creada = await postCrearSolicitud(
        solicitudBase({ id: "ir-sol-flujo-1", recursoInsumoId: recursoId, cantidad: 3 })
      )
      expect(creada.status).toBe(201)
      const entrega = await postEntregar("ir-sol-flujo-1")
      expect(entrega.status).toBe(200)
      expect(await entrega.json()).toEqual({ ok: true, stockNuevo: 2 })
    })
    expect((await solicitudDe("ir-sol-flujo-1"))?.estado).toBe("entregada")
    expect(await stockDe(recursoId)).toBe(2)
  })

  it("respeta el folio del body y continúa el correlativo desde ahí", async () => {
    const recursoId = await crearInsumo()
    await conSesion(emailAdmin, async () => {
      const explicita = await postCrearSolicitud(
        solicitudBase({ id: "ir-sol-folio-exp", folio: "SI-0042", recursoInsumoId: recursoId })
      )
      expect(explicita.status).toBe(201)
      expect(((await explicita.json()) as { folio: string }).folio).toBe("SI-0042")

      const generada = await postCrearSolicitud(
        solicitudBase({ id: "ir-sol-folio-sig", folio: "", recursoInsumoId: recursoId })
      )
      expect(((await generada.json()) as { folio: string }).folio).toBe("SI-0043")
    })
  })

  it("dos comunidades no comparten correlativo", async () => {
    const recursoA = await crearInsumo()
    const recursoB = await crearInsumo({ comunidadId: otraComunidad })

    await conSesion(emailAdmin, async () => {
      const res = await postCrearSolicitud(
        solicitudBase({ id: "ir-sol-folio-c1", recursoInsumoId: recursoA })
      )
      expect(res.status).toBe(201)
      expect(((await res.json()) as { folio: string }).folio).toBe("SI-0001")
    })

    await conSesion(emailAdminOtra, async () => {
      const res = await postCrearSolicitud(
        solicitudBase({ id: "ir-sol-folio-c2", recursoInsumoId: recursoB })
      )
      expect(res.status).toBe(201)
      // la otra comunidad arranca su propio correlativo en 1
      expect(((await res.json()) as { folio: string }).folio).toBe("SI-0001")
    })
  })

  it("authz de la colección: 401 sin sesión, 403 comité/residente, 201 conserjería/mantención", async () => {
    const recursoId = await crearInsumo()

    state.cookie = ""
    expect((await postCrearSolicitud(solicitudBase({ recursoInsumoId: recursoId }))).status).toBe(401)

    for (const email of [emailComite, emailResidente]) {
      await conSesion(email, async () => {
        const res = await postCrearSolicitud(
          solicitudBase({ id: idUnico(), recursoInsumoId: recursoId })
        )
        expect(res.status).toBe(403)
      })
    }

    for (const email of [emailConserjeria, emailMantencion]) {
      await conSesion(email, async () => {
        const res = await postCrearSolicitud(
          solicitudBase({ id: idUnico(), recursoInsumoId: recursoId })
        )
        expect(res.status).toBe(201)
      })
    }
  })
})
