/**
 * @vitest-environment node
 *
 * api-cobertura-fase3 (SERIE-DEUDA-1 P3) — /api/vinculos (69.2% → medido).
 *
 * route.ts (GET paginado + POST sobre `ejecutarUpsertVinculo`: persona
 * inexistente/inactiva/bloqueada, unidad inexistente, duplicado activo,
 * exclusividad de titularidad/arriendo, anti-autosolapamiento y cierre
 * automático del tramo anterior) y [id]/route.ts (GET, PUT con revalidación
 * del merge y DELETE protegido por ControlPropiedad). Prisma real, único mock
 * `next/headers`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
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

const comunidadA = "vu3-com-a"
const comunidadB = "vu3-com-b"
const emailAdmin = "vu3-admin@test.cl"
const emailComite = "vu3-comite@test.cl"
const emailResidente = "vu3-residente@test.cl"

const vinculoAjeno = "vu3-v-ajeno"

function vinculoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "vu3-nuevo",
    personaId: "vu3-p-activa",
    unidadId: "vu3-u-3",
    rol: "propietario",
    fechaInicio: "2026-02-01",
    permiteVerFinanzas: true,
    ...overrides,
  }
}

describe("/api/vinculos — vínculos unidad/persona con BD real (fase 3)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    for (const c of [
      { id: comunidadA, nombre: "Comunidad VU3 A", slug: "vu3-a" },
      { id: comunidadB, nombre: "Comunidad VU3 B", slug: "vu3-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }
    for (const u of [
      { id: "vu3-user-admin", email: emailAdmin },
      { id: "vu3-user-comite", email: emailComite },
      { id: "vu3-user-residente", email: emailResidente },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true },
        create: { ...u, activo: true },
      })
    }
    const membresias = [
      { usuarioId: "vu3-user-admin", comunidadId: comunidadA, rol: "administrador" },
      { usuarioId: "vu3-user-comite", comunidadId: comunidadA, rol: "comite" },
      { usuarioId: "vu3-user-residente", comunidadId: comunidadA, rol: "residente" },
    ]
    await prisma.membresia.deleteMany({ where: { usuarioId: { in: membresias.map((m) => m.usuarioId) } } })
    for (const m of membresias) await prisma.membresia.create({ data: m })

    await limpiarEntidades()

    const personas: Prisma.PersonaUncheckedCreateInput[] = [
      { id: "vu3-p-activa", estadoCuenta: "activa" },
      { id: "vu3-p-inactiva", estadoCuenta: "inactiva" },
      { id: "vu3-p-bloqueada", estadoCuenta: "bloqueada" },
      { id: "vu3-p-dos", estadoCuenta: "activa" },
    ].map((p, i) => ({
      ...p,
      comunidadId: comunidadA,
      rut: `3000000${i}-1`,
      nombreCompleto: `Persona ${p.id}`,
      nombres: "Persona",
      apellidos: p.id,
      email: `${p.id}@test.cl`,
      telefonoMovil: "+56900000000",
      condicionesEspecialesIds: [],
      roles: [],
    }))
    personas.push({
      id: "vu3-p-b",
      comunidadId: comunidadB,
      rut: "39999999-9",
      nombreCompleto: "Persona B",
      nombres: "Persona",
      apellidos: "B",
      email: "vu3-p-b@test.cl",
      telefonoMovil: "+56900000001",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: [],
    })
    for (const p of personas) await prisma.persona.create({ data: p })

    for (const u of [
      { id: "vu3-u-1", numero: "101" },
      { id: "vu3-u-2", numero: "102" },
      { id: "vu3-u-3", numero: "103" },
      { id: "vu3-u-4", numero: "104" },
      { id: "vu3-u-5", numero: "105" },
    ]) {
      await prisma.unidad.create({
        data: {
          id: u.id,
          comunidadId: comunidadA,
          microSectorId: "vu3-ms-1",
          numero: u.numero,
          etiqueta: `Depto ${u.numero}`,
          tipoUnidadId: "vu3-tu-1",
          metraje: 60,
          prorrateo: 1,
          rolSii: `8888-${u.numero}`,
          estadoId: "vu3-est-1",
          servicios: {},
        },
      })
    }

    const vinculos = [
      { id: "vu3-v-prop-vig", personaId: "vu3-p-activa", unidadId: "vu3-u-1", rol: "propietario", fechaInicio: "2025-01-01" },
      { id: "vu3-v-arr-vig", personaId: "vu3-p-activa", unidadId: "vu3-u-1", rol: "arrendatario", fechaInicio: "2025-01-01" },
      { id: "vu3-v-ocu-u2", personaId: "vu3-p-activa", unidadId: "vu3-u-2", rol: "ocupante", fechaInicio: "2026-01-01" },
      { id: "vu3-v-prop-u4", personaId: "vu3-p-activa", unidadId: "vu3-u-4", rol: "propietario", fechaInicio: "2025-01-01" },
      // u-5: dos tramos ya cerrados del mismo rol → el anti-autosolapamiento
      // se dispara sin caer antes en el guard de duplicado activo.
      { id: "vu3-v-u5-a", personaId: "vu3-p-activa", unidadId: "vu3-u-5", rol: "ocupante", fechaInicio: "2025-01-01", fechaFin: "2026-03-31" },
      { id: "vu3-v-u5-b", personaId: "vu3-p-dos", unidadId: "vu3-u-5", rol: "ocupante", fechaInicio: "2025-01-01", fechaFin: "2026-03-31" },
    ]
    for (const v of vinculos) {
      await prisma.vinculoUnidad.create({
        data: { ...v, comunidadId: comunidadA, permiteVerFinanzas: true },
      })
    }
    await prisma.vinculoUnidad.create({
      data: {
        id: vinculoAjeno,
        comunidadId: comunidadB,
        personaId: "vu3-p-b",
        unidadId: "vu3-u-1",
        rol: "propietario",
        fechaInicio: "2025-01-01",
        permiteVerFinanzas: true,
      },
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    await limpiarEntidades()
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: ["vu3-user-admin", "vu3-user-comite", "vu3-user-residente"] } },
    })
    await prisma.usuario.deleteMany({ where: { email: { startsWith: "vu3-" } } })
    await prisma.comunidad.deleteMany({ where: { id: { in: [comunidadB, comunidadA] } } })
  })

  async function limpiarEntidades(): Promise<void> {
    const enComunidades = { in: [comunidadA, comunidadB] }
    await prisma.controlPropiedad.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.unidad.deleteMany({ where: { comunidadId: enComunidades } })
    await prisma.persona.deleteMany({ where: { comunidadId: enComunidades } })
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
    body?: unknown,
    query = ""
  ): Promise<Response> {
    const esItem = id !== undefined
    const ruta = esItem
      ? await import("@/app/api/vinculos/[id]/route")
      : await import("@/app/api/vinculos/route")
    const req = new NextRequest(`http://localhost/api/vinculos${esItem ? `/${id}` : ""}${query}`, {
      method: metodo,
      ...(metodo === "GET" || metodo === "DELETE"
        ? {}
        : {
            body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
            headers: { "content-type": "application/json" },
          }),
    })
    type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
    if (esItem) {
      const handler = (ruta as unknown as Record<string, Handler>)[metodo]
      if (!handler) throw new Error(`método no soportado: ${metodo}`)
      return handler(req, { params: Promise.resolve({ id }) })
    }
    const handler = (ruta as unknown as Record<string, (req: NextRequest) => Promise<Response>>)[metodo]
    if (!handler) throw new Error(`método no soportado: ${metodo}`)
    return handler(req)
  }

  it("guardia de sesión: 401 sin cookie en GET, POST, GET_ONE y DELETE", async () => {
    state.cookie = ""
    expect((await llamar("GET")).status).toBe(401)
    expect((await llamar("POST", undefined, vinculoValido())).status).toBe(401)
    expect((await llamar("GET", "vu3-v-prop-vig")).status).toBe(401)
    expect((await llamar("PUT", "vu3-v-prop-vig", { permiteVerFinanzas: false })).status).toBe(401)
    expect((await llamar("DELETE", "vu3-v-prop-vig")).status).toBe(401)
  })

  it("residente (sin recurso mp): GET, POST y DELETE → 403", async () => {
    await conSesion(emailResidente, async () => {
      expect((await llamar("GET")).status).toBe(403)
      expect((await llamar("GET", "vu3-v-prop-vig")).status).toBe(403)
      expect((await llamar("POST", undefined, vinculoValido())).status).toBe(403)
      expect((await llamar("PUT", "vu3-v-prop-vig", { permiteVerFinanzas: false })).status).toBe(403)
      expect((await llamar("DELETE", "vu3-v-prop-vig")).status).toBe(403)
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-nuevo" } })).toBeNull()
    })
  })

  it("comité: GET → 200 (scoped) y POST de alta nueva → 403 (no puede crear en mp)", async () => {
    await conSesion(emailComite, async () => {
      const get = await llamar("GET")
      expect(get.status).toBe(200)
      const j = (await get.json()) as { data: { comunidadId: string }[]; total: number }
      expect(j.total).toBeGreaterThanOrEqual(4)
      expect(j.data.every((v) => v.comunidadId === comunidadA)).toBe(true)

      const post = await llamar("POST", undefined, vinculoValido())
      expect(post.status).toBe(403)
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-nuevo" } })).toBeNull()
    })
  })

  it("GET paginado respeta pageSize", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("GET", undefined, undefined, "?page=1&pageSize=1")
      expect(res.status).toBe(200)
      const j = (await res.json()) as { data: unknown[]; page: number; pageSize: number; total: number }
      expect(j.data.length).toBe(1)
      expect(j.page).toBe(1)
      expect(j.pageSize).toBe(1)
      expect(j.total).toBeGreaterThan(1)
    })
  })

  it("POST con JSON inválido → 400 «Cuerpo JSON inválido.»", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, "{no-json")
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")
    })
  })

  it("POST con body que no pasa el schema → 400 «Datos inválidos.»", async () => {
    await conSesion(emailAdmin, async () => {
      const sinFlag = await llamar("POST", undefined, {
        id: "vu3-bad",
        personaId: "vu3-p-activa",
        unidadId: "vu3-u-3",
        rol: "propietario",
        fechaInicio: "2026-02-01",
      })
      expect(sinFlag.status).toBe(400)
      expect(((await sinFlag.json()) as { error: string }).error).toBe("Datos inválidos.")

      const rolInvalido = await llamar("POST", undefined, vinculoValido({ id: "vu3-bad", rol: "dueno" }))
      expect(rolInvalido.status).toBe(400)
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-bad" } })).toBeNull()
    })
  })

  it("POST sobre persona inexistente o no operativa → 409 (bloqueo duro D6)", async () => {
    await conSesion(emailAdmin, async () => {
      const inexistente = await llamar("POST", undefined, vinculoValido({ personaId: "vu3-p-nada" }))
      expect(inexistente.status).toBe(409)
      expect(((await inexistente.json()) as { error: string }).error).toBe(
        "La persona no existe en el Maestro de Personas."
      )

      for (const persona of ["vu3-p-inactiva", "vu3-p-bloqueada"]) {
        const res = await llamar("POST", undefined, vinculoValido({ id: `vu3-${persona}`, personaId: persona }))
        expect(res.status, persona).toBe(409)
        const j = (await res.json()) as { error: string }
        expect(j.error).toMatch(/inactiva|bloqueada/)
        expect(await prisma.vinculoUnidad.findUnique({ where: { id: `vu3-${persona}` } })).toBeNull()
      }
    })
  })

  it("POST con unidad inexistente → 400 y nada persistido", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, vinculoValido({ unidadId: "vu3-u-nada" }))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("unidadId no existe en unidades.")
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-nuevo" } })).toBeNull()
    })
  })

  it("POST alta feliz → 201 y queda en la BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, vinculoValido())
      expect(res.status).toBe(201)
      const enBd = await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-nuevo" } })
      expect(enBd?.comunidadId).toBe(comunidadA)
      expect(enBd?.rol).toBe("propietario")
      expect(enBd?.fechaFin).toBeNull()
    })
  })

  it("POST duplicado activo persona+unidad → 409", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, vinculoValido({ id: "vu3-dup", unidadId: "vu3-u-3" }))
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "Esta persona ya posee un vínculo activo con esta unidad."
      )
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-dup" } })).toBeNull()
    })
  })

  it("POST exclusividad de titularidad (propietario y arrendatario) → 409", async () => {
    await conSesion(emailAdmin, async () => {
      const prop = await llamar(
        "POST",
        undefined,
        vinculoValido({
          id: "vu3-excl-prop",
          personaId: "vu3-p-dos",
          unidadId: "vu3-u-1",
          rol: "propietario",
          fechaInicio: "2026-02-01",
          cerrarAnterior: false,
        })
      )
      expect(prop.status).toBe(409)
      expect(((await prop.json()) as { error: string }).error).toBe(
        "Ya existe un tramo de propietario que se solapa con las fechas indicadas en esta unidad."
      )

      const arr = await llamar(
        "POST",
        undefined,
        vinculoValido({
          id: "vu3-excl-arr",
          personaId: "vu3-p-dos",
          unidadId: "vu3-u-1",
          rol: "arrendatario",
          fechaInicio: "2026-02-01",
          cerrarAnterior: false,
        })
      )
      expect(arr.status).toBe(409)
      expect(((await arr.json()) as { error: string }).error).toBe(
        "El contrato de arriendo se solapa con otro contrato vigente en la misma unidad."
      )
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-excl-prop" } })).toBeNull()
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-excl-arr" } })).toBeNull()
    })
  })

  it("POST anti-autosolapamiento (mismo rol y persona en tramos solapados) → 409", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar(
        "POST",
        undefined,
        vinculoValido({
          id: "vu3-autosolape",
          personaId: "vu3-p-activa",
          unidadId: "vu3-u-5",
          rol: "ocupante",
          fechaInicio: "2026-02-01",
        })
      )
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "Esta persona ya registra un tramo del mismo rol que se solapa con las fechas indicadas en esta unidad."
      )
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-autosolape" } })).toBeNull()
    })
  })

  it("POST cierra el tramo anterior de propietario al crear el nuevo", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar(
        "POST",
        undefined,
        vinculoValido({ id: "vu3-u4-nuevo", personaId: "vu3-p-dos", unidadId: "vu3-u-4", fechaInicio: "2026-05-01" })
      )
      expect(res.status).toBe(201)
      const anterior = await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-v-prop-u4" } })
      expect(anterior?.fechaFin).toBe("2026-04-30")
      expect((await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-u4-nuevo" } }))?.fechaFin).toBeNull()
    })
  })

  it("POST con id de otra comunidad → 404 (sin filtrar existencia)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", undefined, vinculoValido({ id: vinculoAjeno }))
      expect(res.status).toBe(404)
      const ajeno = await prisma.vinculoUnidad.findUnique({ where: { id: vinculoAjeno } })
      expect(ajeno?.comunidadId).toBe(comunidadB)
    })
  })

  it("GET_ONE propio → 200; ajeno o inexistente → 404", async () => {
    await conSesion(emailAdmin, async () => {
      const ok = await llamar("GET", "vu3-v-prop-vig")
      expect(ok.status).toBe(200)
      expect(((await ok.json()) as { id: string }).id).toBe("vu3-v-prop-vig")
      expect((await llamar("GET", vinculoAjeno)).status).toBe(404)
      expect((await llamar("GET", "vu3-v-nada")).status).toBe(404)
    })
  })

  it("PUT: 400 con JSON inválido o campo inválido", async () => {
    await conSesion(emailAdmin, async () => {
      const malJson = await llamar("PUT", "vu3-v-prop-vig", "{no-json")
      expect(malJson.status).toBe(400)
      expect(((await malJson.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")

      const campo = await llamar("PUT", "vu3-v-prop-vig", { rol: "dueno" })
      expect(campo.status).toBe(400)
      expect(((await campo.json()) as { error: string }).error).toBe("Datos inválidos.")
    })
  })

  it("PUT: 404 con vínculo ajeno o inexistente", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await llamar("PUT", vinculoAjeno, { permiteVerFinanzas: false })).status).toBe(404)
      expect((await llamar("PUT", "vu3-v-nada", { permiteVerFinanzas: false })).status).toBe(404)
    })
  })

  it("PUT parcial cambia el flag de privacidad → 200 y se refleja en la BD", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("PUT", "vu3-v-ocu-u2", { permiteVerFinanzas: false })
      expect(res.status).toBe(200)
      expect((await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-v-ocu-u2" } }))?.permiteVerFinanzas).toBe(false)
    })
  })

  it("PUT que genera un duplicado activo → 409 sin mutar", async () => {
    await conSesion(emailAdmin, async () => {
      const antes = await prisma.vinculoUnidad.findUniqueOrThrow({ where: { id: "vu3-v-arr-vig" } })
      const res = await llamar("PUT", "vu3-v-arr-vig", {
        personaId: "vu3-p-activa",
        unidadId: "vu3-u-3",
        rol: "arrendatario",
      })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "Esta persona ya posee un vínculo activo con esta unidad."
      )
      const despues = await prisma.vinculoUnidad.findUniqueOrThrow({ where: { id: "vu3-v-arr-vig" } })
      expect(despues.unidadId).toBe(antes.unidadId)
      expect(despues.rol).toBe(antes.rol)
    })
  })

  it("DELETE: 404 con vínculo ajeno o inexistente", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await llamar("DELETE", vinculoAjeno)).status).toBe(404)
      expect((await llamar("DELETE", "vu3-v-nada")).status).toBe(404)
    })
  })

  it("DELETE: 409 si el tramo de propietario vigente tiene ControlPropiedad", async () => {
    await conSesion(emailAdmin, async () => {
      await prisma.controlPropiedad.create({
        data: {
          id: "vu3-cp-1",
          comunidadId: comunidadA,
          unidadId: "vu3-u-1",
          residenteVeMorosidad: true,
          residenteVeActas: true,
          alertasResidentesActivas: true,
        },
      })
      const res = await llamar("DELETE", "vu3-v-prop-vig")
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "No se puede eliminar el vínculo: el tramo de propietario vigente tiene ControlPropiedad asociado."
      )
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-v-prop-vig" } })).not.toBeNull()
    })
  })

  it("DELETE: 200 borra un tramo sin la guarda de ControlPropiedad", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("DELETE", "vu3-v-ocu-u2")
      expect(res.status).toBe(200)
      expect(((await res.json()) as { ok: boolean }).ok).toBe(true)
      expect(await prisma.vinculoUnidad.findUnique({ where: { id: "vu3-v-ocu-u2" } })).toBeNull()
    })
  })
})
