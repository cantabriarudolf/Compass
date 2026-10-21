/**
 * @vitest-environment node
 *
 * Borrado lógico GD/AD — decisión owner 2026-10-21: el comité y el admin
 * pueden "eliminar" actas GD y controles de propiedad, pero NUNCA se borra
 * una fila: el registro queda en estado `desestimada` y se lleva una copia
 * íntegra a la tabla de archivo (ActaGDArchivada / ControlPropiedadArchivada)
 * con motivo opcional, actor de la sesión y registro de auditoría.
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

const comunidad = "bl-gd-ad-comunidad"
const emailAdmin = "bl-admin@test.cl"
const emailComite = "bl-comite@test.cl"
const emailConserjeria = "bl-conserjeria@test.cl"
const emailResidente = "bl-residente@test.cl"

const emailToId = (email: string): string => email.split("@")[0] ?? email

const cargaModulos = async () => ({
  actaItem: await import("@/app/api/actas-gd/[id]/route"),
  actasColeccion: await import("@/app/api/actas-gd/route"),
  controlItem: await import("@/app/api/controles-propiedad/[id]/route"),
  controlesColeccion: await import("@/app/api/controles-propiedad/route"),
})

const actaBase = {
  id: "bl-acta-1",
  comunidadId: comunidad,
  fecha: "2026-10-15",
  hora: "19:00",
  lugar: "Sala de reuniones",
  tablaTemas: ["Presupuesto 2027"],
  presentes: [],
  ausentes: [],
  invitados: ["Administrador"],
  minuta: "Minuta de la reunión de directiva.",
  adjuntos: [],
  estado: "borrador",
  aprobaciones: [],
  fechaPublicacion: null,
  avisoCVReferencia: null,
  periodoId: null,
}

const controlBase = {
  id: "bl-ctrl-1",
  comunidadId: comunidad,
  unidadId: "bl-u1",
  residenteVeMorosidad: false,
  residenteVeActas: false,
  alertasResidentesActivas: true,
}

/** Usuarios con sesiones reales para los dos describes (comité/admin pueden; conserjería/residente no). */
async function sembrarUsuarios(): Promise<void> {
  const roles: Array<[string, string]> = [
    [emailAdmin, "administrador"],
    [emailComite, "comite"],
    [emailConserjeria, "conserjeria"],
    [emailResidente, "residente"],
  ]
  await prisma.membresia.deleteMany({
    where: { usuarioId: { in: roles.map(([email]) => emailToId(email)) } },
  })
  for (const [email, rol] of roles) {
    await prisma.usuario.upsert({
      where: { email },
      update: {},
      create: { id: emailToId(email), email, activo: true },
    })
    await prisma.membresia.create({
      data: { usuarioId: emailToId(email), comunidadId: comunidad, rol },
    })
  }
}

async function limpiarUsuarios(): Promise<void> {
  const ids = [emailAdmin, emailComite, emailConserjeria, emailResidente].map(emailToId)
  await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
  for (const id of ids) {
    await prisma.usuario.delete({ where: { id } }).catch(() => {})
  }
}

describe("DELETE /api/actas-gd/[id] — borrado lógico con archivo (GD)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad Borrado Logico", slug: "bl-gd-ad-comunidad" },
    })
    const roles: Array<[string, string]> = [
      [emailAdmin, "administrador"],
      [emailComite, "comite"],
      [emailConserjeria, "conserjeria"],
      [emailResidente, "residente"],
    ]
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: roles.map(([email]) => emailToId(email)) } },
    })
    for (const [email, rol] of roles) {
      await prisma.usuario.upsert({
        where: { email },
        update: {},
        create: { id: emailToId(email), email, activo: true },
      })
      await prisma.membresia.create({
        data: { usuarioId: emailToId(email), comunidadId: comunidad, rol },
      })
    }
    await prisma.actaGDArchivada.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: comunidad, tipoAccion: { in: ["GD_ACTA_DESESTIMADA", "AD_CONTROL_DESESTIMADO"] } },
    })
    await prisma.actaGD.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.actaGD.create({ data: actaBase as never })
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.actaGDArchivada.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.actaGD.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: comunidad, tipoAccion: { in: ["GD_ACTA_DESESTIMADA", "AD_CONTROL_DESESTIMADO"] } },
      })
      const ids = [emailAdmin, emailComite, emailConserjeria, emailResidente].map(emailToId)
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

  async function deleteActa(id: string, motivo?: string): Promise<Response> {
    const { actaItem } = await cargaModulos()
    return actaItem.DELETE(
      new NextRequest(`http://localhost/api/actas-gd/${id}`, {
        method: "DELETE",
        ...(motivo !== undefined
          ? {
              body: JSON.stringify({ motivo }),
              headers: { "content-type": "application/json" },
            }
          : {}),
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  it("401 sin sesión", async () => {
    state.cookie = ""
    const res = await deleteActa("bl-acta-1")
    expect(res.status).toBe(401)
  })

  it("403 para roles sin `eliminar` sobre gd (conserjería y residente)", async () => {
    for (const email of [emailConserjeria, emailResidente]) {
      await conSesion(email, async () => {
        const res = await deleteActa("bl-acta-1")
        expect(res.status).toBe(403)
      })
    }
    // la fila no fue tocada
    const enBd = await prisma.actaGD.findUnique({ where: { id: "bl-acta-1" } })
    expect(enBd?.estado).toBe("borrador")
    expect(await prisma.actaGDArchivada.count({ where: { comunidadId: comunidad } })).toBe(0)
  })

  it("DELETE → 200; la fila sigue en ActaGD como desestimada y hay copia con actor y motivo", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await deleteActa("bl-acta-1", "Reunión duplicada en el libro")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })

      // nunca se borra: la fila queda con estado desestimada
      const enBd = await prisma.actaGD.findUnique({ where: { id: "bl-acta-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.estado).toBe("desestimada")
      expect(enBd?.minuta).toBe("Minuta de la reunión de directiva.")

      // copia íntegra en el archivo, con actor de la sesión y motivo
      const copia = await prisma.actaGDArchivada.findUnique({ where: { id: "bl-acta-1" } })
      expect(copia).not.toBeNull()
      expect(copia?.estado).toBe("borrador") // el estado que tenía al archivar
      expect(copia?.actorUsuarioId).toBe(emailToId(emailAdmin))
      expect(copia?.motivo).toBe("Reunión duplicada en el libro")
      expect(copia?.comunidadId).toBe(comunidad)

      // auditoría GD
      const ev = await prisma.eventoAuditoria.findFirst({
        where: { comunidadId: comunidad, tipoAccion: "GD_ACTA_DESESTIMADA", referenciaId: "bl-acta-1" },
      })
      expect(ev).not.toBeNull()
      expect(ev?.usuario).toBe(emailToId(emailAdmin))
    })
  })

  it("el listado ya no devuelve la acta desestimada", async () => {
    await conSesion(emailAdmin, async () => {
      const { actasColeccion } = await cargaModulos()
      const res = await actasColeccion.GET(new NextRequest("http://localhost/api/actas-gd"))
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: Array<{ id: string }> }
      expect(j.data.map((a) => a.id)).not.toContain("bl-acta-1")
    })
  })

  it("segundo DELETE → 404 (ya desestimada)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await deleteActa("bl-acta-1")
      expect(res.status).toBe(404)
    })
  })

  it("inexistente → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await deleteActa("bl-acta-inexistente")).status).toBe(404)
    })
  })

  it("aprobar un acta desestimada → 409 (no se reactiva por la puerta de firmas)", async () => {
    // La anti-suplantación corre antes que el guard de estado: la sesión necesita
    // persona propia para llegar al 409 del acta desestimada (no al 403).
    await prisma.usuario.update({
      where: { id: emailToId(emailComite) },
      data: { personaId: "bl-p-comite" },
    })
    await conSesion(emailComite, async () => {
      const { POST: APROBAR } = await import("@/app/api/actas-gd/[id]/aprobar/route")
      const res = await APROBAR(
        new NextRequest("http://localhost/api/actas-gd/bl-acta-1/aprobar", {
          method: "POST",
          body: JSON.stringify({ personaId: "bl-p-comite" }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ id: "bl-acta-1" }) }
      )
      expect(res.status).toBe(409)
      const enBd = await prisma.actaGD.findUnique({ where: { id: "bl-acta-1" } })
      expect(enBd?.estado).toBe("desestimada")
    })
  })

  it("PUT no puede forzar el estado desestimada (solo lo escribe el DELETE)", async () => {
    // semilla de un acta vigente para la prueba
    await prisma.actaGD.create({
      data: { ...actaBase, id: "bl-acta-2" } as never,
    })
    await conSesion(emailAdmin, async () => {
      const { actaItem } = await cargaModulos()
      const res = await actaItem.PUT(
        new NextRequest("http://localhost/api/actas-gd/bl-acta-2", {
          method: "PUT",
          body: JSON.stringify({ estado: "desestimada" }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ id: "bl-acta-2" }) }
      )
      expect(res.status).toBe(400)
      const enBd = await prisma.actaGD.findUnique({ where: { id: "bl-acta-2" } })
      expect(enBd?.estado).toBe("borrador")
    })
  })
})

describe("DELETE /api/controles-propiedad/[id] — borrado lógico con archivo (AD)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad Borrado Logico", slug: "bl-gd-ad-comunidad" },
    })
    await sembrarUsuarios()
    await prisma.controlPropiedadArchivada.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.controlPropiedad.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.unidad.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.unidad.create({
      data: {
        id: "bl-u1",
        comunidadId: comunidad,
        microSectorId: "bl-ms1",
        numero: "101",
        etiqueta: "Depto",
        tipoUnidadId: "bl-tu",
        metraje: 50,
        prorrateo: 1,
        rolSii: "1-1",
        estadoId: "habitada",
        servicios: {},
      } as never,
    })
    await prisma.controlPropiedad.create({ data: controlBase as never })
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.controlPropiedadArchivada.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.controlPropiedad.deleteMany({ where: { comunidadId: comunidad } })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: comunidad, tipoAccion: { in: ["GD_ACTA_DESESTIMADA", "AD_CONTROL_DESESTIMADO"] } },
      })
      await limpiarUsuarios()
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

  async function deleteControl(id: string, motivo?: string): Promise<Response> {
    const { controlItem } = await cargaModulos()
    return controlItem.DELETE(
      new NextRequest(`http://localhost/api/controles-propiedad/${id}`, {
        method: "DELETE",
        ...(motivo !== undefined
          ? {
              body: JSON.stringify({ motivo }),
              headers: { "content-type": "application/json" },
            }
          : {}),
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  it("401 sin sesión", async () => {
    state.cookie = ""
    const res = await deleteControl("bl-ctrl-1")
    expect(res.status).toBe(401)
  })

  it("403 para rol sin `eliminar` sobre ad (conserjería)", async () => {
    await conSesion(emailConserjeria, async () => {
      const res = await deleteControl("bl-ctrl-1")
      expect(res.status).toBe(403)
    })
    const enBd = await prisma.controlPropiedad.findUnique({ where: { id: "bl-ctrl-1" } })
    expect(enBd?.estado).toBe("vigente")
    expect(await prisma.controlPropiedadArchivada.count({ where: { comunidadId: comunidad } })).toBe(0)
  })

  it("DELETE → 200; la fila sigue en ControlPropiedad como desestimada y hay copia con actor y motivo", async () => {
    await conSesion(emailComite, async () => {
      const res = await deleteControl("bl-ctrl-1", "Control cargado por error de unidad")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })

      const enBd = await prisma.controlPropiedad.findUnique({ where: { id: "bl-ctrl-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.estado).toBe("desestimada")
      expect(enBd?.residenteVeActas).toBe(false)

      const copia = await prisma.controlPropiedadArchivada.findUnique({ where: { id: "bl-ctrl-1" } })
      expect(copia).not.toBeNull()
      expect(copia?.actorUsuarioId).toBe(emailToId(emailComite))
      expect(copia?.motivo).toBe("Control cargado por error de unidad")
      expect(copia?.comunidadId).toBe(comunidad)

      // auditoría AD
      const ev = await prisma.eventoAuditoria.findFirst({
        where: { comunidadId: comunidad, tipoAccion: "AD_CONTROL_DESESTIMADO", referenciaId: "bl-ctrl-1" },
      })
      expect(ev).not.toBeNull()
      expect(ev?.usuario).toBe(emailToId(emailComite))
    })
  })

  it("el listado ya no devuelve el control desestimado", async () => {
    await conSesion(emailAdmin, async () => {
      const { controlesColeccion } = await cargaModulos()
      const res = await controlesColeccion.GET(
        new NextRequest("http://localhost/api/controles-propiedad")
      )
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: Array<{ id: string }>; total: number }
      expect(j.data.map((c) => c.id)).not.toContain("bl-ctrl-1")
      expect(j.total).toBe(0)
    })
  })

  it("un control desestimado no habilita ver actas a los residentes (el ABAC lee solo vigentes)", async () => {
    const { residentesVenActas } = await import("@/lib/api/gd-guard")
    await prisma.controlPropiedad.create({
      data: { ...controlBase, id: "bl-ctrl-actas", residenteVeActas: true } as never,
    })
    expect(await residentesVenActas(comunidad)).toBe(true)

    await conSesion(emailComite, async () => {
      const res = await deleteControl("bl-ctrl-actas")
      expect(res.status).toBe(200)
    })

    // El archivo no da permisos: solo un control vigente habilita el visor.
    expect(await residentesVenActas(comunidad)).toBe(false)
  })

  it("una fila desestimada no habilita el re-registro duplicado de la unidad", async () => {
    await conSesion(emailAdmin, async () => {
      const { controlesColeccion } = await cargaModulos()
      const res = await controlesColeccion.POST(
        new NextRequest("http://localhost/api/controles-propiedad", {
          method: "POST",
          body: JSON.stringify({
            id: "bl-ctrl-nuevo",
            unidadId: "bl-u1",
            residenteVeMorosidad: false,
            residenteVeActas: false,
            alertasResidentesActivas: true,
          }),
          headers: { "content-type": "application/json" },
        })
      )
      // La unidad tiene solo un control desestimado: no debe contar como
      // duplicado y el POST debe crear el control nuevo (201).
      expect(res.status).toBe(201)
    })
  })

  it("segundo DELETE → 404 (ya desestimado)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await deleteControl("bl-ctrl-1")
      expect(res.status).toBe(404)
    })
  })

  it("inexistente → 404", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await deleteControl("bl-ctrl-inexistente")).status).toBe(404)
    })
  })
})
