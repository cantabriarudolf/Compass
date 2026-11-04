/**
 * @vitest-environment node
 *
 * T3 cobro-gastos-comunes-parametrico (S1/S3) — /api/reglamento.
 *
 * GET devuelve la versión del reglamento vigente para el período pedido (por
 * defecto, el mes en curso). POST crea una versión nueva; las versiones son
 * append-only (sin PUT ni DELETE) y solo aceptan fuentes reales: la migración
 * automática no se puede declarar por API.
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

const comunidad = "rl-com-a"
const emailAdmin = "rl-admin@test.cl"
const emailComite = "rl-comite@test.cl"
const emailResidente = "rl-residente@test.cl"

const PARAMETROS = {
  porcentajeReserva: 10,
  diasPagoGc: 10,
  tasaMoraMensualPct: 1,
  topeMoraPct: 50,
  cuotasCorte: 3,
  diasPreavisoCorte: 5,
  ipcActivo: false,
}

function cuerpoVersion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    vigenteDesde: "2026-01",
    fuenteInstrumento: "reglamento_copropiedad",
    actaRef: "Reglamento de copropiedad, art. 11",
    formaContribucion: "coeficiente",
    parametros: PARAMETROS,
    ...overrides,
  }
}

describe("/api/reglamento — versión vigente del reglamento con BD real", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"
    await prisma.comunidad.upsert({
      where: { id: comunidad },
      update: {},
      create: { id: comunidad, nombre: "Comunidad Reglamento", slug: "rl-com-a" },
    })
    for (const u of [
      { id: "rl-user-admin", email: emailAdmin },
      { id: "rl-user-comite", email: emailComite },
      { id: "rl-user-residente", email: emailResidente },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true },
        create: { ...u, activo: true },
      })
    }
    const membresias = [
      { usuarioId: "rl-user-admin", comunidadId: comunidad, rol: "administrador" },
      { usuarioId: "rl-user-comite", comunidadId: comunidad, rol: "comite" },
      { usuarioId: "rl-user-residente", comunidadId: comunidad, rol: "residente" },
    ]
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: membresias.map((m) => m.usuarioId) } },
    })
    for (const m of membresias) await prisma.membresia.create({ data: m })
    await prisma.versionReglamento.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: comunidad, tipoAccion: "FI_REG_VERSION" },
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    await prisma.versionReglamento.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: comunidad, tipoAccion: "FI_REG_VERSION" },
    })
    await prisma.membresia.deleteMany({
      where: {
        usuarioId: { in: ["rl-user-admin", "rl-user-comite", "rl-user-residente"] },
      },
    })
    await prisma.usuario.deleteMany({ where: { email: { startsWith: "rl-" } } })
    await prisma.comunidad.deleteMany({ where: { id: comunidad } })
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
    metodo: "GET" | "POST",
    opciones: { periodo?: string; body?: unknown } = {}
  ): Promise<Response> {
    const ruta = await import("@/app/api/reglamento/route")
    const query = opciones.periodo ? `?periodo=${opciones.periodo}` : ""
    const req = new NextRequest(`http://localhost/api/reglamento${query}`, {
      method: metodo,
      ...(metodo === "POST"
        ? {
            body:
              typeof opciones.body === "string"
                ? opciones.body
                : JSON.stringify(opciones.body ?? {}),
            headers: { "content-type": "application/json" },
          }
        : {}),
    })
    const handler = (ruta as unknown as Record<string, (req: NextRequest) => Promise<Response>>)[
      metodo
    ]
    if (!handler) throw new Error(`método no soportado: ${metodo}`)
    return handler(req)
  }

  it("guardia de sesión: 401 sin cookie en GET y POST", async () => {
    state.cookie = ""
    expect((await llamar("GET")).status).toBe(401)
    expect((await llamar("POST", { body: cuerpoVersion() })).status).toBe(401)
    expect(await prisma.versionReglamento.count({ where: { comunidadId: comunidad } })).toBe(0)
  })

  it("residente (sin permiso FI): GET y POST → 403", async () => {
    await conSesion(emailResidente, async () => {
      expect((await llamar("GET")).status).toBe(403)
      const post = await llamar("POST", { body: cuerpoVersion() })
      expect(post.status).toBe(403)
    })
    expect(await prisma.versionReglamento.count({ where: { comunidadId: comunidad } })).toBe(0)
  })

  it("comité: GET permitido; POST → 403 (no crea FI)", async () => {
    await conSesion(emailComite, async () => {
      const get = await llamar("GET")
      expect(get.status).toBe(404)
      const post = await llamar("POST", { body: cuerpoVersion() })
      expect(post.status).toBe(403)
    })
    expect(await prisma.versionReglamento.count({ where: { comunidadId: comunidad } })).toBe(0)
  })

  it("GET sin versiones para el período → 404 con el período y sin inventar datos", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("GET", { periodo: "2026-03" })
      expect(res.status).toBe(404)
      expect(((await res.json()) as { error: string }).error).toBe(
        "La comunidad no tiene una versión del reglamento vigente para el período 2026-03."
      )
    })
  })

  it("GET con período mal formado → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("GET", { periodo: "2026/03" })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "El período debe tener formato AAAA-MM."
      )
    })
  })

  it("POST con JSON inválido → 400 «Cuerpo JSON inválido.»", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", { body: "{no-json" })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Cuerpo JSON inválido.")
    })
  })

  it("POST con fuente migracion_automatica → 400: no se declara por API", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", {
        body: cuerpoVersion({ fuenteInstrumento: "migracion_automatica" }),
      })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
    })
    expect(await prisma.versionReglamento.count({ where: { comunidadId: comunidad } })).toBe(0)
  })

  it("POST con parámetros fuera de rango → 400 (días de pago y porcentaje negativo)", async () => {
    await conSesion(emailAdmin, async () => {
      for (const parametros of [
        { ...PARAMETROS, diasPagoGc: 0 },
        { ...PARAMETROS, diasPagoGc: 61 },
        { ...PARAMETROS, porcentajeReserva: -1 },
        { ...PARAMETROS, topeMoraPct: -0.5 },
        { ...PARAMETROS, cuotasCorte: -1 },
      ]) {
        const res = await llamar("POST", { body: cuerpoVersion({ parametros }) })
        expect(res.status).toBe(400)
        expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
      }
    })
    expect(await prisma.versionReglamento.count({ where: { comunidadId: comunidad } })).toBe(0)
  })

  it("POST con período mal formado → 400", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", { body: cuerpoVersion({ vigenteDesde: "2026-13" }) })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
    })
  })

  it("POST válido → 201, versión 1 y evento FI_REG_VERSION en la bitácora", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", { body: cuerpoVersion() })
      expect(res.status).toBe(201)
      const creada = (await res.json()) as {
        id: string
        version: number
        vigenteDesde: string
        fuenteInstrumento: string
        actaRef: string | null
        formaContribucion: string
        parametros: Record<string, unknown>
      }
      expect(creada.version).toBe(1)
      expect(creada.vigenteDesde).toBe("2026-01")
      expect(creada.fuenteInstrumento).toBe("reglamento_copropiedad")
      expect(creada.actaRef).toBe("Reglamento de copropiedad, art. 11")
      expect(creada.formaContribucion).toBe("coeficiente")
      // El recargo se declara por comunidad; una versión que no lo declara vuelve
      // con la lectura normativa (encima del presupuesto, Ley 21.442 art. 39).
      expect(creada.parametros).toEqual({
        ...PARAMETROS,
        reservaIncluidaEnPresupuesto: false,
      })

      const enBD = await prisma.versionReglamento.findUnique({ where: { id: creada.id } })
      expect(enBD?.comunidadId).toBe(comunidad)

      const evento = await prisma.eventoAuditoria.findFirst({
        where: { comunidadId: comunidad, referenciaId: creada.id },
      })
      expect(evento?.tipoAccion).toBe("FI_REG_VERSION")
      expect(evento?.categoria).toBe("FI")
    })
  })

  it("POST siguiente → 201 con versión 2 (append-only, sin pisar la 1)", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("POST", {
        body: cuerpoVersion({
          vigenteDesde: "2026-06",
          fuenteInstrumento: "acta_asamblea",
          actaRef: null,
          formaContribucion: "partes_iguales",
          parametros: { ...PARAMETROS, porcentajeReserva: 5, diasPagoGc: 20 },
        }),
      })
      expect(res.status).toBe(201)
      expect(((await res.json()) as { version: number }).version).toBe(2)
    })
    expect(await prisma.versionReglamento.count({ where: { comunidadId: comunidad } })).toBe(2)
    expect(
      (await prisma.versionReglamento.findFirstOrThrow({
        where: { comunidadId: comunidad, version: 1 },
      })).vigenteDesde
    ).toBe("2026-01")
  })

  it("GET resuelve la versión que rige cada período", async () => {
    await conSesion(emailAdmin, async () => {
      const marzo = await llamar("GET", { periodo: "2026-03" })
      expect(marzo.status).toBe(200)
      expect(((await marzo.json()) as { version: number }).version).toBe(1)

      const agosto = await llamar("GET", { periodo: "2026-08" })
      expect(agosto.status).toBe(200)
      expect(((await agosto.json()) as { version: number }).version).toBe(2)

      const futuro = await llamar("GET", { periodo: "2027-01" })
      expect(futuro.status).toBe(200)
      expect(((await futuro.json()) as { version: number }).version).toBe(2)

      const antes = await llamar("GET", { periodo: "2025-12" })
      expect(antes.status).toBe(404)
    })
  })

  it("GET sin período usa el mes en curso", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await llamar("GET")
      expect(res.status).toBe(200)
      const j = (await res.json()) as { version: number; vigenteDesde: string }
      // Ambas versiones del fixture rigen antes del mes en curso.
      expect(j.version).toBe(2)
    })
  })

  /**
   * El registro FUSIONADO —id y `version` los pone el servidor— se valida con
   * `VersionReglamentoSchema` antes de escribirse: la ruta no confía en el
   * valor que calcula. La única forma de que ese guard falle es una fila con la
   * columna `version` corrupta, y entonces la respuesta no puede ser una fila
   * con versión 0.
   */
  it("POST con la versión corrupta en BD → 400 «Datos inválidos.» y ninguna fila nueva", async () => {
    // La última versión persistida es -1, así que el servidor calcularía la 0.
    const originales = await prisma.versionReglamento.findMany({
      where: { comunidadId: comunidad },
    })
    await prisma.versionReglamento.deleteMany({ where: { comunidadId: comunidad } })
    await prisma.versionReglamento.create({
      data: {
        id: "rl-version-corrupta",
        comunidadId: comunidad,
        version: -1,
        vigenteDesde: "2026-01",
        fuenteInstrumento: "reglamento_copropiedad",
        actaRef: null,
        formaContribucion: "coeficiente",
        parametros: PARAMETROS,
      },
    })
    try {
      await conSesion(emailAdmin, async () => {
        const res = await llamar("POST", { body: cuerpoVersion({ vigenteDesde: "2026-07" }) })
        expect(res.status).toBe(400)
        expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
      })
      // El guard escribe cero filas: ni la que pidió el cliente ni la versión 0.
      const versiones = await prisma.versionReglamento.findMany({
        where: { comunidadId: comunidad },
        select: { version: true },
      })
      expect(versiones.map((v) => v.version)).toEqual([-1])
    } finally {
      await prisma.versionReglamento.deleteMany({ where: { comunidadId: comunidad } })
      for (const v of originales) {
        await prisma.versionReglamento.create({
          data: {
            id: v.id,
            comunidadId: v.comunidadId,
            version: v.version,
            vigenteDesde: v.vigenteDesde,
            fuenteInstrumento: v.fuenteInstrumento,
            actaRef: v.actaRef,
            formaContribucion: v.formaContribucion,
            parametros: v.parametros as never,
          },
        })
      }
    }
  })

  /**
   * Leer el reglamento nunca devuelve una versión con parámetros corruptos: si
   * la fila no se puede deserializar, la ruta responde 500 genérico en vez de
   * un 200 con datos que no cumplen el contrato (el detalle queda en el log).
   * El escenario es una migración a medias, no un input del cliente.
   */
  it("GET con una fila de parámetros ilegibles → 500 genérico, sin filtrar el detalle", async () => {
    await prisma.versionReglamento.create({
      data: {
        id: "rl-version-ilegible",
        comunidadId: comunidad,
        version: 3,
        vigenteDesde: "2026-09",
        fuenteInstrumento: "reglamento_copropiedad",
        actaRef: null,
        formaContribucion: "coeficiente",
        parametros: PARAMETROS,
      },
    })
    try {
      // Escritura cruda: el cliente Prisma jamás serializa un JSON inválido.
      await prisma.$executeRawUnsafe(
        `UPDATE versiones_reglamento SET parametros = '{ilegible' WHERE id = 'rl-version-ilegible'`
      )
      await conSesion(emailAdmin, async () => {
        const res = await llamar("GET", { periodo: "2026-09" })
        expect(res.status).toBe(500)
        const cuerpo = (await res.json()) as Record<string, unknown>
        expect(cuerpo.error).toBe("Error interno del servidor.")
        // El detalle del fallo no viaja al cliente.
        expect(JSON.stringify(cuerpo)).not.toContain("ilegible")
      })
    } finally {
      await prisma.$executeRawUnsafe(
        `DELETE FROM versiones_reglamento WHERE id = 'rl-version-ilegible'`
      )
    }
  })
})
