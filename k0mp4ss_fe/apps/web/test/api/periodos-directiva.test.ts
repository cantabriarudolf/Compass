/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { esMiembroDirectivaVigente } from "@/lib/store/helpers"

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

  // `referenciaInscripcion` es respaldo externo OPCIONAL: la ley no exige inscribir
  // la directiva, así que su ausencia no puede bloquear el registro del período.
  it("POST sin referenciaInscripcion → 201 y el respaldo queda vacío", async () => {
    await conSesion(emailAdmin, async () => {
      const sinRespaldo = periodoValido({ id: "gd-per-sin-respaldo", estado: "cerrado" })
      delete sinRespaldo.referenciaInscripcion
      expect("referenciaInscripcion" in sinRespaldo).toBe(false)

      const res = await POST(sinRespaldo)
      expect(res.status).toBe(201)

      const enBd = await prisma.periodoDirectiva.findUnique({
        where: { id: "gd-per-sin-respaldo" },
      })
      expect(enBd).not.toBeNull()
      expect(enBd?.referenciaInscripcion).toBe("")
    })
  })

  it("POST con referenciaInscripcion → 201 y el respaldo se guarda", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        periodoValido({
          id: "gd-per-con-respaldo",
          estado: "cerrado",
          referenciaInscripcion: "Acta de asamblea N° 7/2026",
        })
      )
      expect(res.status).toBe(201)

      const enBd = await prisma.periodoDirectiva.findUnique({
        where: { id: "gd-per-con-respaldo" },
      })
      expect(enBd?.referenciaInscripcion).toBe("Acta de asamblea N° 7/2026")
    })
  })

  it("PUT parcial sin el campo no borra el respaldo que la fila ya tenía", async () => {
    // Existe por el `.default("")` del schema: el `.partial()` del PUT no debe
    // inyectar ese default y pisar un respaldo real ya guardado.
    await prisma.periodoDirectiva.create({
      data: {
        id: "gd-per-respaldo-previo",
        comunidadId: comunidadA,
        fechaInicio: "2023-01-01",
        duracionMeses: 24,
        fechaInscripcion: "2023-01-10",
        referenciaInscripcion: "Escritura pública N° 88, CBR Santiago",
        estado: "cerrado",
        miembros: [],
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await PUT("gd-per-respaldo-previo", { duracionMeses: 12 })
      expect(res.status).toBe(200)

      const enBd = await prisma.periodoDirectiva.findUnique({
        where: { id: "gd-per-respaldo-previo" },
      })
      expect(enBd?.duracionMeses).toBe(12)
      expect(enBd?.referenciaInscripcion).toBe("Escritura pública N° 88, CBR Santiago")
    })
  })

  it("PUT con cadena vacía explícita → el respaldo queda vacío (borrado intencional)", async () => {
    await prisma.periodoDirectiva.create({
      data: {
        id: "gd-per-respaldo-borrado",
        comunidadId: comunidadA,
        fechaInicio: "2023-06-01",
        duracionMeses: 12,
        fechaInscripcion: "2023-06-05",
        referenciaInscripcion: "Acta asamblea N° 2/2023",
        estado: "cerrado",
        miembros: [],
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await PUT("gd-per-respaldo-borrado", { referenciaInscripcion: "" })
      expect(res.status).toBe(200)

      const enBd = await prisma.periodoDirectiva.findUnique({
        where: { id: "gd-per-respaldo-borrado" },
      })
      expect(enBd?.referenciaInscripcion).toBe("")
    })
  })

  // `fechaInscripcion` acompaña al respaldo externo y es OPCIONAL por la misma
  // razón: si la ley no exige inscribir la directiva, una comunidad puede
  // registrar su período sin haberlo inscripto nunca. "" = no aplica.
  it("POST sin fechaInscripcion → 201 y la fecha queda vacía", async () => {
    await conSesion(emailAdmin, async () => {
      const sinFecha = periodoValido({ id: "gd-per-sin-fecha", estado: "cerrado" })
      delete sinFecha.fechaInscripcion
      expect("fechaInscripcion" in sinFecha).toBe(false)

      const res = await POST(sinFecha)
      expect(res.status).toBe(201)

      const enBd = await prisma.periodoDirectiva.findUnique({
        where: { id: "gd-per-sin-fecha" },
      })
      expect(enBd).not.toBeNull()
      expect(enBd?.fechaInscripcion).toBe("")
      expect(enBd?.fechaInicio).toBe("2026-01-15")
    })
  })

  it("POST con fechaInscripcion → 201 y la fecha se guarda", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        periodoValido({
          id: "gd-per-con-fecha",
          estado: "cerrado",
          fechaInscripcion: "2026-02-10",
        })
      )
      expect(res.status).toBe(201)

      const enBd = await prisma.periodoDirectiva.findUnique({
        where: { id: "gd-per-con-fecha" },
      })
      expect(enBd?.fechaInscripcion).toBe("2026-02-10")
    })
  })

  it("PUT parcial sin el campo no borra la fecha de inscripción que la fila ya tenía", async () => {
    // Existe por el `.default("")` del schema: el `.partial()` del PUT no debe
    // inyectar ese default y pisar una fecha real ya guardada.
    await prisma.periodoDirectiva.create({
      data: {
        id: "gd-per-fecha-previo",
        comunidadId: comunidadA,
        fechaInicio: "2023-01-01",
        duracionMeses: 24,
        fechaInscripcion: "2023-01-10",
        referenciaInscripcion: "Escritura pública N° 88, CBR Santiago",
        estado: "cerrado",
        miembros: [],
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await PUT("gd-per-fecha-previo", { duracionMeses: 12 })
      expect(res.status).toBe(200)

      const enBd = await prisma.periodoDirectiva.findUnique({
        where: { id: "gd-per-fecha-previo" },
      })
      expect(enBd?.duracionMeses).toBe(12)
      expect(enBd?.fechaInscripcion).toBe("2023-01-10")
    })
  })

  it("PUT con cadena vacía explícita → la fecha de inscripción queda vacía (borrado intencional)", async () => {
    await prisma.periodoDirectiva.create({
      data: {
        id: "gd-per-fecha-borrada",
        comunidadId: comunidadA,
        fechaInicio: "2023-06-01",
        duracionMeses: 12,
        fechaInscripcion: "2023-06-05",
        referenciaInscripcion: "Acta asamblea N° 2/2023",
        estado: "cerrado",
        miembros: [],
      },
    })
    await conSesion(emailAdmin, async () => {
      const res = await PUT("gd-per-fecha-borrada", { fechaInscripcion: "" })
      expect(res.status).toBe(200)

      const enBd = await prisma.periodoDirectiva.findUnique({
        where: { id: "gd-per-fecha-borrada" },
      })
      expect(enBd?.fechaInscripcion).toBe("")
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

  // Fase 3 (decisión del owner, opción A): la rotación deja de destruir el
  // registro. Se distinguen dos cosas distintas:
  // - la PROYECCIÓN (`Persona.datosGobernanza`, "quién está en la directiva
  //   ahora") sí se depura al salir, o `esMiembroVigente` seguiría contando al
  //   saliente en el quórum;
  // - el REGISTRO (`PeriodoDirectiva.miembros`, "qué pasó") deja de perderse:
  //   antes de depurar la ficha, la rotación escribe en el snapshot del período
  //   que cierra el cargo, la fecha y el motivo del término del saliente.
  describe("Fase 3 — la rotación conserva el registro del saliente", () => {
    const idsNomina = ["gd3-1", "gd3-2", "gd3-3", "gd3-4", "gd3-5"]
    const emailTesorero = "gd3-tesorero@test.cl"
    const emailPresidente = "gd3-presidente@test.cl"
    const idsPeriodos = ["gd3-per-1", "gd3-per-2", "gd3-per-viejo"]

    const cargaCerrar = async () =>
      await import("@/app/api/periodos-directiva/[id]/cerrar/route")
    const cargaAprobar = async () =>
      await import("@/app/api/actas-gd/[id]/aprobar/route")

    async function CERRAR(id: string, body: unknown = {}): Promise<Response> {
      const { POST: cerrar } = await cargaCerrar()
      return cerrar(
        new NextRequest(`http://localhost/api/periodos-directiva/${id}/cerrar`, {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ id }) }
      )
    }

    async function APROBAR(id: string, personaId: string): Promise<Response> {
      const { POST: aprobar } = await cargaAprobar()
      return aprobar(
        new NextRequest(`http://localhost/api/actas-gd/${id}/aprobar`, {
          method: "POST",
          body: JSON.stringify({ personaId }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ id }) }
      )
    }

    /** Nómina tal como la manda el cliente: la capacidad es la elegibilidad (art. 17 inc. 4). */
    function nomina(
      miembros: { personaId: string; cargo: string; capacidad?: string }[],
      fechaAsuncion: string
    ): Record<string, unknown>[] {
      return miembros.map((m) => ({
        personaId: m.personaId,
        nombre: `Nómina ${m.personaId}`,
        cargo: m.cargo,
        fechaAsuncion,
        ...(m.capacidad ? { capacidad: m.capacidad } : {}),
      }))
    }

    const fichaDe = async (personaId: string) =>
      (
        (await prisma.persona.findUnique({ where: { id: personaId } })) as unknown as {
          datosGobernanza: Record<string, unknown> | null
        } | null
      )?.datosGobernanza

    const archivoDe = async (periodoId: string) => {
      const periodo = await prisma.periodoDirectiva.findUnique({ where: { id: periodoId } })
      return {
        estado: periodo?.estado,
        fechaFin: periodo?.fechaFin,
        miembros: leerMiembrosDe(periodo?.miembros),
      }
    }

    // Lectura cruda del Json archivado (sin validar): es lo que ve el cliente.
    function leerMiembrosDe(crudo: unknown): Record<string, unknown>[] {
      return Array.isArray(crudo) ? (crudo as Record<string, unknown>[]) : []
    }

    beforeAll(async () => {
      await prisma.periodoDirectiva.deleteMany({ where: { id: { in: idsPeriodos } } })
      await prisma.actaGD.deleteMany({ where: { id: "gd3-acta-1" } })
      const nombres = ["Uno", "Dos", "Tres", "Cuatro", "Cinco"]
      for (const [i, id] of idsNomina.entries()) {
        await prisma.persona.upsert({
          where: { id },
          update: {},
          create: {
            id,
            comunidadId: comunidadA,
            rut: `9500000${i}-0`,
            nombreCompleto: `Nómina ${id}`,
            nombres: "Nómina",
            apellidos: nombres[i]!,
            email: `${id}@test.cl`,
            telefonoMovil: "+56900000000",
            estadoCuenta: "activa",
            condicionesEspecialesIds: [],
            roles: ["propietario"],
          },
        })
      }
      // Usuarios con identidad MP: la firma de actas exige "firmar como uno mismo".
      for (const u of [
        { id: "gd3-usuario-tesorero", email: emailTesorero, personaId: "gd3-2" },
        { id: "gd3-usuario-presidente", email: emailPresidente, personaId: "gd3-4" },
      ]) {
        await prisma.usuario.upsert({ where: { email: u.email }, update: { personaId: u.personaId }, create: u })
        await prisma.membresia.deleteMany({ where: { usuarioId: u.id } })
        await prisma.membresia.create({ data: { usuarioId: u.id, comunidadId: comunidadA, rol: "propietario" } })
      }
    }, 30_000)

    afterAll(async () => {
      const idsUsuarios = ["gd3-usuario-tesorero", "gd3-usuario-presidente"]
      await prisma.actaGD.deleteMany({ where: { id: "gd3-acta-1" } })
      await prisma.periodoDirectiva.deleteMany({ where: { id: { in: idsPeriodos } } })
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: idsUsuarios } } })
      await prisma.usuario.deleteMany({ where: { id: { in: idsUsuarios } } })
    })

    it("el alta del período propaga la capacidad de la nómina a la ficha", async () => {
      await conSesion(emailAdmin, async () => {
        const res = await POST(
          periodoValido({
            id: "gd3-per-1",
            fechaInicio: "2026-01-15",
            miembros: nomina(
              [
                { personaId: "gd3-1", cargo: "presidente", capacidad: "propietario" },
                { personaId: "gd3-2", cargo: "tesorero", capacidad: "conyuge_conviviente" },
                { personaId: "gd3-3", cargo: "secretario", capacidad: "apoderado" },
              ],
              "2026-01-15"
            ),
          })
        )
        expect(res.status).toBe(201)
        const ficha = await fichaDe("gd3-2")
        expect(ficha?.periodoId).toBe("gd3-per-1")
        expect(ficha?.cargoDirectiva).toBe("tesorero")
        expect(ficha?.capacidad).toBe("conyuge_conviviente")
      })
    })

    it("al rotar, el período cerrado conserva cargo, asunción, término y motivo del saliente", async () => {
      // Antes: el tesorero saliente está en la proyección (ficha) del período que va a cerrarse.
      const antes = await fichaDe("gd3-2")
      expect(antes).not.toBeNull()
      expect(antes?.cargoDirectiva).toBe("tesorero")

      await conSesion(emailAdmin, async () => {
        const res = await POST(
          periodoValido({
            id: "gd3-per-2",
            fechaInicio: "2026-06-01",
            miembros: nomina(
              [
                { personaId: "gd3-3", cargo: "secretario", capacidad: "apoderado" },
                { personaId: "gd3-4", cargo: "presidente", capacidad: "representante_persona_juridica" },
                { personaId: "gd3-5", cargo: "director", capacidad: "propietario" },
              ],
              "2026-06-01"
            ),
          })
        )
        expect(res.status).toBe(201)
      })

      // Registro: el período que cierra guarda el hecho con fecha y motivo.
      const cerrado = await archivoDe("gd3-per-1")
      expect(cerrado.estado).toBe("cerrado")
      expect(cerrado.fechaFin).toBe("2026-06-01")
      const tesoreroSaliente = cerrado.miembros.find((m) => m.personaId === "gd3-2")
      expect(tesoreroSaliente).toBeDefined()
      expect(tesoreroSaliente).toMatchObject({
        nombre: "Nómina gd3-2",
        cargo: "tesorero",
        fechaAsuncion: "2026-01-15",
        capacidad: "conyuge_conviviente",
        fechaTermino: "2026-06-01",
        motivoTermino: "fin_periodo",
      })

      // Quien continúa no se registra como salida (misma persona, mismo mandato).
      const secretarioContinuo = cerrado.miembros.find((m) => m.personaId === "gd3-3")
      expect(secretarioContinuo).toBeDefined()
      expect(secretarioContinuo?.cargo).toBe("secretario")
      expect(secretarioContinuo?.fechaTermino).toBeUndefined()
      expect(secretarioContinuo?.motivoTermino).toBeUndefined()

      // Entrega de documentos del presidente saliente (art. 17): el registro es la prueba.
      const presidenteSaliente = cerrado.miembros.find((m) => m.personaId === "gd3-1")
      expect(presidenteSaliente).toMatchObject({
        cargo: "presidente",
        fechaTermino: "2026-06-01",
        fechaEntregaDocumentos: "2026-06-01",
        entregaDocumentosA: "Nómina gd3-4",
      })

      // Proyección: la ficha del saliente se depura (ya no está en el cargo).
      expect(await fichaDe("gd3-2")).toBeNull()
      expect(await fichaDe("gd3-1")).toBeNull()
      // …y la del que continúa apunta al período nuevo, sin término.
      expect(await fichaDe("gd3-3")).toMatchObject({
        cargoDirectiva: "secretario",
        periodoId: "gd3-per-2",
        capacidad: "apoderado",
      })
    })

    it("un período con snapshot viejo (sin los campos nuevos) se lee igual", async () => {
      // Fila previa a esta fase: la nómina archivada tiene solo el shape viejo.
      await prisma.periodoDirectiva.create({
        data: {
          id: "gd3-per-viejo",
          comunidadId: comunidadA,
          fechaInicio: "2020-01-01",
          duracionMeses: 24,
          fechaFin: "2022-01-01",
          fechaInscripcion: "2020-02-01",
          referenciaInscripcion: "Acta asamblea 2020",
          estado: "cerrado",
          miembros: [
            { personaId: "gd3-1", nombre: "Nómina gd3-1", cargo: "presidente", fechaAsuncion: "2020-01-01" },
            { personaId: "gd3-2", nombre: "Nómina gd3-2", cargo: "tesorero", fechaAsuncion: "2020-01-01" },
          ],
        },
      })

      await conSesion(emailAdmin, async () => {
        const res = await GET_ONE("gd3-per-viejo")
        expect(res.status).toBe(200)
        const cuerpo = (await res.json()) as { miembros: Record<string, unknown>[] }
        expect(cuerpo.miembros).toHaveLength(2)
        expect(cuerpo.miembros[1]).toEqual({
          personaId: "gd3-2",
          nombre: "Nómina gd3-2",
          cargo: "tesorero",
          fechaAsuncion: "2020-01-01",
        })
      })

      // La lectura tolerante del libro no rompe con el shape viejo ni con basura.
      const { leerMiembrosPeriodo } = await import("@/lib/schemas")
      const enBd = await prisma.periodoDirectiva.findUnique({ where: { id: "gd3-per-viejo" } })
      const leidos = leerMiembrosPeriodo(enBd?.miembros)
      expect(leidos).toHaveLength(2)
      expect(leidos[0]).toMatchObject({ personaId: "gd3-1", cargo: "presidente", fechaAsuncion: "2020-01-01" })
      // Campos nuevos ausentes = undefined, nunca una excepción.
      expect(leidos[0]?.capacidad).toBeUndefined()
      expect(leidos[0]?.fechaTermino).toBeUndefined()
      expect(leidos[0]?.motivoTermino).toBeUndefined()
      expect(leidos[0]?.fechaEntregaDocumentos).toBeUndefined()
      expect(leidos[0]?.entregaDocumentosA).toBeUndefined()
      // Elemento corrupto: se descarta, el resto del libro se sigue leyendo.
      const mixto = leerMiembrosPeriodo([
        ...leerMiembrosDe(enBd?.miembros),
        { personaId: "gd3-raro" },
        null,
        "texto",
      ])
      expect(mixto).toHaveLength(2)
      expect(leerMiembrosPeriodo(null)).toEqual([])
      expect(leerMiembrosPeriodo(undefined)).toEqual([])
    })

    it("el snapshot nunca se vacía y lo ya registrado sobrevive al rearchivar", async () => {
      const { miembrosArchivados } = await import("@/app/api/periodos-directiva/route")
      // Snapshot previo con información de cierre ya escrita en el libro.
      const previo = [
        {
          personaId: "gd3-1",
          nombre: "Nómina gd3-1",
          cargo: "presidente",
          fechaAsuncion: "2020-01-01",
          fechaTermino: "2020-06-01",
          motivoTermino: "renuncia",
          fechaEntregaDocumentos: "2020-06-02",
          entregaDocumentosA: "Vecino Receptor",
        },
      ]
      const cierre = { fechaCierre: "2026-06-01", cierraMandatos: true, motivoTermino: "fin_periodo" as const }
      // Sin fichas legibles en MP: el archivo previo se conserva íntegro (no se borra).
      expect(miembrosArchivados([], { id: "gd3-per-1", miembros: previo }, cierre)).toEqual(previo)
      // Con ficha que ya no declara el término ni la entrega: no se pierde nada.
      const fusionado = miembrosArchivados(
        [
          {
            id: "gd3-1",
            nombreCompleto: "Nómina gd3-1",
            datosGobernanza: {
              periodoId: "gd3-per-1",
              cargoDirectiva: "presidente",
              fechaAsuncion: "2020-01-01",
            },
          },
        ],
        { id: "gd3-per-1", miembros: previo },
        cierre
      )
      expect(fusionado[0]).toMatchObject({
        cargo: "presidente",
        fechaTermino: "2020-06-01",
        motivoTermino: "renuncia",
        fechaEntregaDocumentos: "2020-06-02",
        entregaDocumentosA: "Vecino Receptor",
      })
    })

    it("la directiva corriente y la firma de actas ignoran a los salientes", async () => {
      const personasEnBd = await prisma.persona.findMany({
        where: { id: { in: idsNomina } },
        select: { id: true, estadoCuenta: true, datosGobernanza: true },
      })
      const porId = new Map(personasEnBd.map((p) => [p.id, p]))
      const esVigente = (id: string): boolean =>
        esMiembroDirectivaVigente(
          {
            estadoCuenta: porId.get(id)?.estadoCuenta,
            datosGobernanza: porId.get(id)?.datosGobernanza,
          } as unknown as Parameters<typeof esMiembroDirectivaVigente>[0],
          "gd3-per-2"
        )
      expect(esVigente("gd3-1")).toBe(false)
      expect(esVigente("gd3-2")).toBe(false)
      expect(esVigente("gd3-3")).toBe(true)
      expect(esVigente("gd3-4")).toBe(true)
      expect(esVigente("gd3-5")).toBe(true)

      // Firma de actas: el saliente ya no puede firmar; el vigente sí.
      await prisma.actaGD.create({
        data: {
          id: "gd3-acta-1",
          comunidadId: comunidadA,
          fecha: "2026-06-10",
          hora: "19:00",
          lugar: "Sede",
          tablaTemas: [],
          presentes: [],
          ausentes: [],
          invitados: [],
          minuta: "Acta del período nuevo.",
          adjuntos: [],
          estado: "borrador",
          aprobaciones: [],
          periodoId: "gd3-per-2",
        },
      })
      await conSesion(emailTesorero, async () => {
        const res = await APROBAR("gd3-acta-1", "gd3-2")
        expect(res.status).toBe(403)
        expect(((await res.json()) as { error: string }).error).toMatch(/miembro vigente/i)
        const acta = await prisma.actaGD.findUnique({ where: { id: "gd3-acta-1" } })
        expect(acta?.aprobaciones as unknown as string[]).toEqual([])
      })
      await conSesion(emailPresidente, async () => {
        expect((await APROBAR("gd3-acta-1", "gd3-4")).status).toBe(200)
      })
    })

    it("el cierre manual sigue archivando la nómina desde MP, sin inventar términos", async () => {
      await conSesion(emailAdmin, async () => {
        const res = await CERRAR("gd3-per-2", { fechaFin: "2026-09-01" })
        expect(res.status).toBe(200)
      })
      const cerrado = await archivoDe("gd3-per-2")
      expect(cerrado.estado).toBe("cerrado")
      expect(cerrado.fechaFin).toBe("2026-09-01")
      expect(cerrado.miembros.map((m) => m.personaId).sort()).toEqual(["gd3-3", "gd3-4", "gd3-5"])
      const director = cerrado.miembros.find((m) => m.personaId === "gd3-5")
      expect(director).toMatchObject({ cargo: "director", fechaAsuncion: "2026-06-01", capacidad: "propietario" })
      // El cierre no es una salida personal: el término queda solo si la ficha lo declara.
      expect(director?.fechaTermino).toBeUndefined()
      expect(director?.motivoTermino).toBeUndefined()
      expect(director?.fechaEntregaDocumentos).toBeUndefined()
    })
  })
})
