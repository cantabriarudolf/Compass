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

function periodoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "gd-per-1",
    fechaInicio: "2026-01-15",
    duracionMeses: 24,
    fechaInscripcion: "2026-02-01",
    referenciaInscripcion: "Acta asamblea N° 4/2026, CBR Santiago",
    estado: "vigente",
    // Fase 2: la nómina vigente es impar de 3 a 5 con personas reales
    // (art. 17 Ley 21.442; el servidor valida existencia y cuenta activa).
    miembros: [
      {
        personaId: "persona-1",
        nombre: "Miembro Uno",
        cargo: "presidente",
        fechaAsuncion: "2026-01-15",
      },
      {
        personaId: "persona-2",
        nombre: "Miembro Dos",
        cargo: "tesorero",
        fechaAsuncion: "2026-01-15",
      },
      {
        personaId: "persona-3",
        nombre: "Miembro Tres",
        cargo: "secretario",
        fechaAsuncion: "2026-01-15",
      },
    ],
    ...overrides,
  }
}

describe("/api/periodos-directiva — GD períodos con BD real (Fase 0)", () => {
  const comunidadA = "gd-comunidad-a"
  const comunidadB = "gd-comunidad-b"
  const emailAdmin = "gd-admin@test.cl"
  const emailResidente = "gd-residente@test.cl"

  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/periodos-directiva/route"),
    item: await import("@/app/api/periodos-directiva/[id]/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const c of [
      { id: comunidadA, nombre: "Comunidad A GD", slug: "gd-comunidad-a" },
      { id: comunidadB, nombre: "Comunidad B GD", slug: "gd-comunidad-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [
      { id: "gd-usuario-admin", email: emailAdmin, activo: true },
      { id: "gd-usuario-residente", email: emailResidente, activo: true },
    ]) {
      await prisma.usuario.upsert({ where: { email: u.email }, update: {}, create: u })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["gd-usuario-admin", "gd-usuario-residente"] } },
    })
        await prisma.membresia.create({ data: { usuarioId: "gd-usuario-admin", comunidadId: comunidadA, rol: "administrador" } })
        await prisma.membresia.create({ data: { usuarioId: "gd-usuario-residente", comunidadId: comunidadA, rol: "residente" } })
        // Fase 2: la nómina del fixture exige personas activas reales en MP.
        const nombres = ["Uno", "Dos", "Tres"]
        for (const [i, pid] of ["persona-1", "persona-2", "persona-3"].entries()) {
          await prisma.persona.upsert({
            where: { id: pid },
            update: {},
            create: {
              id: pid,
              comunidadId: comunidadA,
              rut: `6000000${i}-0`,
              nombreCompleto: `Miembro ${nombres[i]}`,
              nombres: "Miembro",
              apellidos: nombres[i]!,
              email: `${pid}@test.cl`,
              telefonoMovil: "+56900000000",
              estadoCuenta: "activa",
              condicionesEspecialesIds: [],
              roles: ["propietario"],
            },
          })
        }
      }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      await prisma.periodoDirectiva.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      await prisma.actaGD.deleteMany({ where: { comunidadId: { in: [comunidadA, comunidadB] } } })
      await prisma.persona.deleteMany({ where: { comunidadId: comunidadA } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: ["gd-usuario-admin", "gd-usuario-residente"] } },
      })
      for (const id of ["gd-usuario-admin", "gd-usuario-residente"]) {
        await prisma.usuario.delete({ where: { id } }).catch(() => {})
      }
      await prisma.comunidad.delete({ where: { id: comunidadA } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: comunidadB } }).catch(() => {})
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

  async function POST(body: unknown): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.POST(
      new NextRequest("http://localhost/api/periodos-directiva", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET(query = ""): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(`http://localhost/api/periodos-directiva${query}`))
  }

  async function GET_ONE(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.GET(new NextRequest(`http://localhost/api/periodos-directiva/${id}`), {
      params: Promise.resolve({ id }),
    })
  }

  async function PUT(id: string, body: unknown): Promise<Response> {
    const { item } = await cargaModulos()
    return item.PUT(
      new NextRequest(`http://localhost/api/periodos-directiva/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  async function DELETE(id: string): Promise<Response> {
    const { item } = await cargaModulos()
    return item.DELETE(new NextRequest(`http://localhost/api/periodos-directiva/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    })
  }

  it("401 sin sesión", async () => {
    state.cookie = ""
    const res = await GET()
    expect(res.status).toBe(401)
    const post = await POST(periodoValido())
    expect(post.status).toBe(401)
  })

  it("admin crea período vigente → 201 y queda en la BD (miembros como Json)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(periodoValido())
      expect(res.status).toBe(201)
      const enBd = await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-1" } })
      expect(enBd).not.toBeNull()
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.estado).toBe("vigente")
      const miembros = enBd?.miembros as unknown[]
      expect(Array.isArray(miembros)).toBe(true)
      // Fase 2: nómina completa de 3 (impar art. 17 Ley 21.442).
      expect(miembros.length).toBe(3)
    })
  })

  it("body inválido según PeriodoDirectivaSchema (duracionMeses > 36) → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(periodoValido({ id: "gd-per-invalido", duracionMeses: 48 }))
      expect(res.status).toBe(400)
      const j = (await res.json()) as { detalles?: unknown }
      expect(j.detalles).toBeTruthy()
      expect(await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-invalido" } })).toBeNull()
    })
  })

  it("GET lista: solo períodos de su comunidad (aislamiento A/B)", async () => {
    await prisma.periodoDirectiva.create({
      data: {
        id: "gd-per-b-1",
        comunidadId: comunidadB,
        fechaInicio: "2026-03-01",
        duracionMeses: 12,
        fechaInscripcion: "2026-03-05",
        referenciaInscripcion: "Acta asamblea B",
        estado: "vigente",
        miembros: [],
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await GET()
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: { id: string; comunidadId: string }[]; total: number }
      expect(j.data.every((p) => p.comunidadId === comunidadA)).toBe(true)
      expect(j.data.some((p) => p.id === "gd-per-b-1")).toBe(false)
      expect(j.data.some((p) => p.id === "gd-per-1")).toBe(true)
    })
  })

  it("GET_ONE propio → 200; de otra comunidad → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const ok = await GET_ONE("gd-per-1")
      expect(ok.status).toBe(200)
      const ajeno = await GET_ONE("gd-per-b-1")
      expect(ajeno.status).toBe(404)
    })
  })

  it("PUT parcial actualiza referencia y persiste en BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await PUT("gd-per-1", {
        referenciaInscripcion: "Escritura pública N° 88, CBR Santiago",
      })
      expect(res.status).toBe(200)
      const enBd = await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-1" } })
      expect(enBd?.referenciaInscripcion).toBe("Escritura pública N° 88, CBR Santiago")
      expect(enBd?.estado).toBe("vigente")
      expect(enBd?.comunidadId).toBe(comunidadA)
    })
  })

  it("residente: ver sí (200), crear no (403) — puede(rol, accion, 'gd')", async () => {
    await conSesion(emailResidente, async () => {
      const get = await GET()
      expect(get.status).toBe(200)
      const post = await POST(periodoValido({ id: "gd-per-residente" }))
      expect(post.status).toBe(403)
      expect(await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-residente" } })).toBeNull()
      // Tampoco puede eliminar (accion "eliminar" no está en su matriz)
      const del = await DELETE("gd-per-1")
      expect(del.status).toBe(403)
    })
  })

  it("POST upsert sobre id de otra comunidad → 404 (no revela existencia)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(periodoValido({ id: "gd-per-b-1", estado: "cerrado" }))
      expect(res.status).toBe(404)
    })
  })

  it("DELETE período vigente → 409 y sigue en la BD (el libro nunca se borra)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await DELETE("gd-per-1")
      expect(res.status).toBe(409)
      const j = (await res.json()) as { error: string }
      expect(j.error).toMatch(/vigente/i)
      expect(await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-1" } })).not.toBeNull()
    })
  })

  it("DELETE período cerrado → 200 y desaparece de la BD", async () => {
    await prisma.periodoDirectiva.create({
      data: {
        id: "gd-per-cerrado",
        comunidadId: comunidadA,
        fechaInicio: "2024-01-01",
        duracionMeses: 12,
        fechaInscripcion: "2024-01-10",
        referenciaInscripcion: "Acta asamblea 2024",
        estado: "cerrado",
        miembros: [],
      },
    })
        await conSesion(emailAdmin, async () => {
          const res = await DELETE("gd-per-cerrado")
          expect(res.status).toBe(200)
          expect(await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-cerrado" } })).toBeNull()
        })
      })

      describe("Fase 2 — rotación del vigente, nómina, congelamiento y cierre", () => {
      const idsPersonas = ["gd-nom-1", "gd-nom-2", "gd-nom-3"]

      const cargaCerrar = async () => (await import("@/app/api/periodos-directiva/[id]/cerrar/route"))

      async function CERRAR(id: string, body: unknown = {}): Promise<Response> {
        const cerrar = await cargaCerrar()
        return cerrar.POST(
          new NextRequest(`http://localhost/api/periodos-directiva/${id}/cerrar`, {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
          }),
          { params: Promise.resolve({ id }) }
        )
      }

      function nomina(ids: string[]): Record<string, unknown>[] {
        const cargos = ["presidente", "tesorero", "secretario"]
        return ids.map((personaId, i) => ({
          personaId,
          nombre: `Nómina ${personaId}`,
          cargo: cargos[i % cargos.length],
          fechaAsuncion: "2026-05-01",
        }))
      }

      it("prepara 3 personas activas para la nómina", async () => {
        // Limpieza de corridas previas (un cerrado no se reabre por upsert).
        await prisma.actaGD.deleteMany({ where: { id: { in: ["gd-per-acta-ref"] } } })
        await prisma.periodoDirectiva.deleteMany({ where: { id: { in: ["gd-per-2", "gd-per-par", "gd-per-fantasma"] } } })
        for (const [i, id] of idsPersonas.entries()) {
          await prisma.persona.upsert({
            where: { id },
            update: {},
            create: {
              id,
              comunidadId: comunidadA,
              rut: `9000000${i}-0`,
              nombreCompleto: `Nómina ${id}`,
              nombres: "Nómina",
              apellidos: id,
              email: `${id}@test.cl`,
              telefonoMovil: "+56900000000",
              estadoCuenta: "activa",
              condicionesEspecialesIds: [],
              roles: ["propietario"],
            },
          })
        }
        expect(await prisma.persona.count({ where: { id: { in: idsPersonas } } })).toBe(3)
      })

      it("nómina par o con persona inexistente → 400", async () => {
        await conSesion(emailAdmin, async () => {
          const par = await POST(periodoValido({ id: "gd-per-par", miembros: nomina(["gd-nom-1", "gd-nom-2"]) }))
          expect(par.status).toBe(400)
          const fantasma = await POST(
            periodoValido({ id: "gd-per-fantasma", miembros: nomina(["gd-nom-1", "gd-nom-2", "gd-no-existe"]) })
          )
          expect(fantasma.status).toBe(400)
        })
      })

      it("activar segundo vigente rota: previo cerrado con nómina archivada", async () => {
        await conSesion(emailAdmin, async () => {
          const res = await POST(
            periodoValido({ id: "gd-per-2", fechaInicio: "2026-05-01", miembros: nomina(idsPersonas) })
          )
          expect(res.status).toBe(201)
          // Solo un vigente por comunidad.
          const vigentes = await prisma.periodoDirectiva.findMany({
            where: { comunidadId: comunidadA, estado: "vigente" },
          })
          expect(vigentes.map((p) => p.id)).toEqual(["gd-per-2"])
          // El previo quedó cerrado con su nómina archivada.
          const previo = await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-1" } })
          expect(previo?.estado).toBe("cerrado")
          expect(previo?.fechaFin).toBe("2026-05-01")
          expect(Array.isArray(previo?.miembros)).toBe(true)
          // Las fichas de la nómina entrante apuntan al nuevo período.
          const m1 = await prisma.persona.findUnique({ where: { id: "gd-nom-1" } })
          expect((m1?.datosGobernanza as unknown as { periodoId?: string } | null)?.periodoId).toBe("gd-per-2")
        })
      })

      it("PUT con miembros sobre cerrado → 409 (nómina congelada); reabrir → 409", async () => {
        await conSesion(emailAdmin, async () => {
          expect((await PUT("gd-per-1", { miembros: [] })).status).toBe(409)
          expect((await PUT("gd-per-1", { estado: "vigente" })).status).toBe(409)
          const enBd = await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-1" } })
          expect(enBd?.estado).toBe("cerrado")
        })
      })

      it("cerrar el vigente archiva la nómina desde MP y congela", async () => {
        await conSesion(emailAdmin, async () => {
          const res = await CERRAR("gd-per-2", { fechaFin: "2026-09-01" })
          expect(res.status).toBe(200)
          const enBd = await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-2" } })
          expect(enBd?.estado).toBe("cerrado")
          expect(enBd?.fechaFin).toBe("2026-09-01")
          const miembros = enBd?.miembros as unknown as { personaId: string }[]
          expect(miembros.map((m) => m.personaId).sort()).toEqual([...idsPersonas].sort())
          // Cerrar dos veces → 409.
          expect((await CERRAR("gd-per-2")).status).toBe(409)
        })
      })

      it("DELETE de cerrado con actas asociadas → 409", async () => {
        await prisma.actaGD.create({
          data: {
            id: "gd-per-acta-ref",
            comunidadId: comunidadA,
            fecha: "2026-06-01",
            hora: "19:00",
            lugar: "Sede",
            tablaTemas: [],
            presentes: [],
            ausentes: [],
            invitados: [],
            minuta: "Acta que referencia al período.",
            adjuntos: [],
            estado: "borrador",
            aprobaciones: [],
            periodoId: "gd-per-2",
          },
        })
        await conSesion(emailAdmin, async () => {
          const res = await DELETE("gd-per-2")
          expect(res.status).toBe(409)
          expect(await prisma.periodoDirectiva.findUnique({ where: { id: "gd-per-2" } })).not.toBeNull()
        })
        await prisma.actaGD.delete({ where: { id: "gd-per-acta-ref" } }).catch(() => {})
      })
    })

  describe("Auditoría GD_PERIODO_REGISTRADO (am-emisores-1)", () => {
    const limpiarEventos = async (): Promise<void> => {
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: comunidadA, tipoAccion: "GD_PERIODO_REGISTRADO" },
      })
    }

    it("POST admin exitoso emite UN evento categoría GD con la referencia del período", async () => {
      await conSesion(emailAdmin, async () => {
        await limpiarEventos()
        const res = await POST(periodoValido({ id: "gd-per-audit", estado: "cerrado" }))
        expect(res.status).toBe(201)

        const eventos = await prisma.eventoAuditoria.findMany({
          where: { comunidadId: comunidadA, tipoAccion: "GD_PERIODO_REGISTRADO" },
        })
        expect(eventos).toHaveLength(1)
        const evento = eventos[0]!
        expect(evento.categoria).toBe("GD")
        expect(evento.tipoAccion).toBe("GD_PERIODO_REGISTRADO")
        expect(evento.referenciaId).toBe("gd-per-audit")
        expect(evento.usuario).toBe("gd-usuario-admin")
        expect(evento.descripcion).toContain("cerrado")
        expect(evento.descripcion).toContain("2026-01-15")
      })
    })

    it("POST 403 (residente no crea) no emite evento", async () => {
      await conSesion(emailResidente, async () => {
        await limpiarEventos()
        const res = await POST(periodoValido({ id: "gd-per-audit-403" }))
        expect(res.status).toBe(403)
        expect(
          await prisma.eventoAuditoria.count({
            where: { comunidadId: comunidadA, tipoAccion: "GD_PERIODO_REGISTRADO" },
          })
        ).toBe(0)
      })
    })

    it("POST 400 (schema inválido) y 404 (id de otra comunidad) no emiten evento", async () => {
      await conSesion(emailAdmin, async () => {
        await limpiarEventos()
        const invalido = await POST(periodoValido({ id: "gd-per-audit-mal", duracionMeses: 48 }))
        expect(invalido.status).toBe(400)
        const ajeno = await POST(periodoValido({ id: "gd-per-b-1", estado: "cerrado" }))
        expect(ajeno.status).toBe(404)
        expect(
          await prisma.eventoAuditoria.count({
            where: { comunidadId: comunidadA, tipoAccion: "GD_PERIODO_REGISTRADO" },
          })
        ).toBe(0)
      })
    })
  })
})
