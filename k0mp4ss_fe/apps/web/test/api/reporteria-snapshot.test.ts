/**
 * @vitest-environment node
 *
 * Reportería (RE) — snapshot inmutable + distribución. SERIE-FASE2 §V3.
 *
 * Las tres acciones que `app/admin/reporteria/page.tsx` ejecutaba contra el
 * store legacy ahora tienen ruta propia, contra BD real (base descartable de la
 * suite):
 *
 * - `POST /api/reportes-re/generar`        (emitir: congela fecha, autor y número)
 * - `POST /api/reportes-re/[id]/distribuir` (visor + email en outbox `pendiente`)
 * - `POST /api/reportes-re/[id]/lectura`    (leídos en la app, sin tasa de apertura)
 * - `POST /api/reportes-re/vistas`          (auditoría del Centro de Mando)
 *
 * Guardias: 401 sin sesión, 403 para comité/residente al emitir o distribuir,
 * 404 cross-comunidad, idempotencia de la emisión y de la lectura, y la prueba
 * central de la ventana: el snapshot NO cambia aunque cambien los datos de
 * origen.
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

const comunidad = "re-snap-comunidad"
const otraComunidad = "re-snap-otra-comunidad"
const emailAdmin = "re-snap-admin@test.cl"
const emailComite = "re-snap-comite@test.cl"
const emailResidente = "re-snap-residente@test.cl"
const emailAdminOtra = "re-snap-admin-otra@test.cl"

const emailToId = (email: string): string => email.split("@")[0] ?? email

const hoy = (): string => new Date().toISOString().slice(0, 10)
const periodo = "2026-05"
const nuevoId = (prefijo: string): string =>
  `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const clp = (n: number): string => `$${Math.round(n).toLocaleString("es-CL")}`

const cargaModulos = async () => ({
  generar: await import("@/app/api/reportes-re/generar/route"),
  distribuir: await import("@/app/api/reportes-re/[id]/distribuir/route"),
  lectura: await import("@/app/api/reportes-re/[id]/lectura/route"),
  vistas: await import("@/app/api/reportes-re/vistas/route"),
  item: await import("@/app/api/reportes-re/[id]/route"),
})

/** Invoca el POST de una ruta de acción (con o sin `ctx.params`). */
const postJson = async (
  modulo: unknown,
  url: string,
  body?: unknown,
  params?: Record<string, string>
): Promise<Response> => {
  const { POST } = modulo as {
    POST: (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>
  }
  return POST(
    new NextRequest(`http://localhost${url}`, {
      method: "POST",
      ...(body !== undefined
        ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
        : { body: JSON.stringify({}), headers: { "content-type": "application/json" } }),
    }),
    params ? { params: Promise.resolve(params) } : undefined
  )
}

const emitir = async (body: unknown): Promise<Response> =>
  postJson((await cargaModulos()).generar, "/api/reportes-re/generar", body)

const distribuir = async (id: string, body: unknown = {}): Promise<Response> =>
  postJson(
    (await cargaModulos()).distribuir,
    `/api/reportes-re/${id}/distribuir`,
    body,
    { id }
  )

const registrarLectura = async (id: string): Promise<Response> =>
  postJson((await cargaModulos()).lectura, `/api/reportes-re/${id}/lectura`, {}, { id })

const registrarVista = async (vista: unknown): Promise<Response> =>
  postJson((await cargaModulos()).vistas, "/api/reportes-re/vistas", { vista })

const leerReporte = async (id: string): Promise<Response> => {
  const { item } = await cargaModulos()
  return item.GET(new NextRequest(`http://localhost/api/reportes-re/${id}`), {
    params: Promise.resolve({ id }),
  })
}

async function crearEgreso(monto: number, recurrente = false, fecha = `${periodo}-10`) {
  await prisma.egresoFI.create({
    data: {
      id: nuevoId("re-egr"),
      comunidadId: comunidad,
      folio: `EG-${Math.floor(Math.random() * 90_000) + 10_000}`,
      fecha,
      categoria: "Mantención",
      descripcion: "Gasto de prueba RE",
      monto,
      fondoId: "fondo-comun",
      esRecurrente: recurrente,
    },
  })
}

async function crearPersona(
  overrides: Partial<{ comunidadId: string; roles: string[]; estadoCuenta: string }> = {}
): Promise<string> {
  const id = nuevoId("re-p")
  await prisma.persona.create({
    data: {
      id,
      comunidadId: overrides.comunidadId ?? comunidad,
      rut: `${Math.floor(Math.random() * 20_000_000) + 5_000_000}-1`,
      nombreCompleto: "Rosa Soto",
      nombres: "Rosa",
      apellidos: "Soto",
      email: `${id}@test.cl`,
      telefonoMovil: "+56911111111",
      estadoCuenta: overrides.estadoCuenta ?? "activa",
      condicionesEspecialesIds: [],
      roles: (overrides.roles ?? ["personal"]) as never,
    },
  })
  return id
}

async function sembrarUsuarios(): Promise<void> {
  const roles: Array<[string, string, string]> = [
    [emailAdmin, "administrador", comunidad],
    [emailComite, "comite", comunidad],
    [emailResidente, "residente", comunidad],
    [emailAdminOtra, "administrador", otraComunidad],
  ]
  const ids = roles.map(([email]) => emailToId(email))
  await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
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

const reporteEnBd = (id: string) => prisma.reporteRE.findUnique({ where: { id } })

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET
  await prisma.comunidad.upsert({
    where: { id: comunidad },
    update: {},
    create: { id: comunidad, nombre: "Comunidad RE Snapshot", slug: "re-snap-comunidad" },
  })
  await prisma.comunidad.upsert({
    where: { id: otraComunidad },
    update: {},
    create: { id: otraComunidad, nombre: "Comunidad RE Snapshot Otra", slug: "re-snap-otra" },
  })
  await sembrarUsuarios()
  // Los módulos de ruta importan el stack de Auth.js: se cargan acá (timeout
  // largo) para que el primer test no pague ese costo.
  await cargaModulos()
}, 60_000)

beforeEach(async () => {
  state.cookie = ""
  await prisma.reporteRE.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.egresoFI.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
  await prisma.notificacion.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] }, moduloOrigen: "RE" },
  })
  await prisma.eventoAuditoria.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] }, categoria: "RE" },
  })
  await prisma.persona.deleteMany({
    where: { comunidadId: { in: [comunidad, otraComunidad] } },
  })
})

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.reporteRE.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.egresoFI.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.notificacion.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    await prisma.persona.deleteMany({
      where: { comunidadId: { in: [comunidad, otraComunidad] } },
    })
    const ids = [emailAdmin, emailComite, emailResidente, emailAdminOtra].map(emailToId)
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

// --- 1. Emisión con snapshot congelado --------------------------------------

describe("POST /api/reportes-re/generar — emitir congela", () => {
  it("calcula desde la BD y congela fecha, autor y número", async () => {
    await crearEgreso(100_000, true)
    await crearEgreso(50_000)

    await conSesion(emailAdmin, async () => {
      const res = await emitir({
        titulo: "Gastos de mayo",
        bloques: ["gastos_mes"],
        periodo,
        segmento: { perfiles: ["administracion"] },
      })
      expect(res.status).toBe(201)
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(json.numero).toBe(1)
      expect(json.idempotente).toBe(false)

      const enBd = await reporteEnBd(json.id)
      expect(enBd).not.toBeNull()
      expect(enBd?.fechaGeneracion).toBe(hoy())
      expect(enBd?.autorUsuarioId).toBe(emailToId(emailAdmin))
      expect(enBd?.autorNombre).toBe(emailAdmin)
      expect(enBd?.numero).toBe(1)
      expect(enBd?.periodo).toBe(periodo)
      expect(enBd?.estadoDistribucion).toBeNull()

      const lineas = (
        enBd?.payloadSnapshot as Array<{ bloque: string; lineas: Array<{ etiqueta: string; valor: string }> }>
      )[0]?.lineas
      expect(lineas).toEqual([
        { etiqueta: "Mes", valor: periodo },
        { etiqueta: "Egresos registrados", valor: "2" },
        { etiqueta: "Total egresos", valor: clp(150_000) },
        { etiqueta: "Gastos fijos recurrentes", valor: clp(100_000) },
      ])

      const evento = await prisma.eventoAuditoria.findFirst({
        where: { comunidadId: comunidad, tipoAccion: "RE_REPORT_GENERATED" },
      })
      expect(evento?.usuario).toBe(emailToId(emailAdmin))
    })
  })

  it("el histórico NO cambia aunque cambien los datos de origen", async () => {
    await crearEgreso(100_000, true)
    let idEmitido = ""

    await conSesion(emailAdmin, async () => {
      const res = await emitir({
        titulo: "Gastos congelados",
        bloques: ["gastos_mes"],
        periodo,
        segmento: {},
      })
      expect(res.status).toBe(201)
      idEmitido = (await res.json()).id
    })

    const snapshotAlEmitir = (await reporteEnBd(idEmitido))?.payloadSnapshot

    // Los datos de origen cambian después de emitir: nuevo egreso del mismo mes.
    await crearEgreso(999_999)

    await conSesion(emailAdmin, async () => {
      const res = await leerReporte(idEmitido)
      expect(res.status).toBe(200)
      const abierto = await res.json()
      expect(abierto.payloadSnapshot).toEqual(snapshotAlEmitir)
    })

    // Y reemitir el MISMO informe devuelve el snapshot congelado, no uno nuevo.
    await conSesion(emailAdmin, async () => {
      const res = await emitir({
        titulo: "Gastos congelados",
        bloques: ["gastos_mes"],
        periodo,
        segmento: {},
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.idempotente).toBe(true)
      expect(json.id).toBe(idEmitido)
      expect(
        await prisma.reporteRE.count({ where: { comunidadId: comunidad } })
      ).toBe(1)
      const enBd = await reporteEnBd(idEmitido)
      expect(enBd?.payloadSnapshot).toEqual(snapshotAlEmitir)
    })
  })

  it("numera correlativamente por comunidad", async () => {
    await conSesion(emailAdmin, async () => {
      const uno = await emitir({ titulo: "Informe uno", bloques: ["gastos_mes"], periodo })
      const dos = await emitir({ titulo: "Informe dos", bloques: ["gastos_mes"], periodo })
      expect((await uno.json()).numero).toBe(1)
      expect((await dos.json()).numero).toBe(2)
    })
  })

  it("400 si el segmento apunta fuera de la Estructura Física", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await emitir({
        titulo: "Segmento fantasma",
        bloques: ["gastos_mes"],
        periodo,
        segmento: { macroSectorIds: ["macro-fantasma"] },
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain("macroSectorId macro-fantasma")
    })
  })
})

// --- 2. Distribución --------------------------------------------------------

describe("POST /api/reportes-re/[id]/distribuir — visor + outbox", () => {
  async function emitirParaDistribuir(): Promise<string> {
    const personaId = await crearPersona({ roles: ["personal"] })
    expect(personaId).toBeTruthy()
    let id = ""
    await conSesion(emailAdmin, async () => {
      const res = await emitir({
        titulo: "Informe distribuible",
        bloques: ["gastos_mes"],
        periodo,
        segmento: { perfiles: ["personal"] },
      })
      expect(res.status).toBe(201)
      id = (await res.json()).id
    })
    return id
  }

  it("publica en el visor y deja el email PENDIENTE (sin SMTP, no dice enviado)", async () => {
    const id = await emitirParaDistribuir()

    await conSesion(emailAdmin, async () => {
      const res = await distribuir(id)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.ok).toBe(true)
      expect(json.destinatarios).toBe(1)
      expect(json.estadoDistribucion).toBe("pendiente")
      expect(json.email).toBe("pendiente")
      // El mensaje nunca afirma que el correo salió.
      expect(String(json.mensaje)).not.toMatch(/enviad/i)

      const enBd = await reporteEnBd(id)
      expect(enBd?.estadoDistribucion).toBe("pendiente")
      expect(enBd?.fechaDistribucion).toBe(hoy())
      expect(enBd?.distribuidoA).toBe(1)
      const envios = enBd?.envios as Array<{ canal: string; estado: string; fecha: string }>
      expect(envios.find((e) => e.canal === "visor")?.estado).toBe("publicado")
      expect(envios.filter((e) => e.canal === "email").map((e) => e.estado)).toEqual([
        "pendiente",
      ])
      for (const envio of envios) expect(envio.fecha).toBe(hoy())

      // Bandeja interna del destinatario resuelto (visor con permiso).
      const notificacion = await prisma.notificacion.findFirst({
        where: { comunidadId: comunidad, moduloOrigen: "RE" },
      })
      expect(notificacion?.asunto).toBe("Reporte distribuido: Informe distribuible")
    })
  })

  it("sin email solo publica en el visor (estado publicado)", async () => {
    const id = await emitirParaDistribuir()
    await conSesion(emailAdmin, async () => {
      const res = await distribuir(id, { email: false })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.estadoDistribucion).toBe("publicado")
      expect(json.email).toBe("no_solicitado")
      const enBd = await reporteEnBd(id)
      const envios = enBd?.envios as Array<{ canal: string }>
      expect(envios.map((e) => e.canal)).toEqual(["visor"])
    })
  })

  it("409 si el reporte ya fue distribuido", async () => {
    const id = await emitirParaDistribuir()
    await conSesion(emailAdmin, async () => {
      expect((await distribuir(id)).status).toBe(200)
      expect((await distribuir(id)).status).toBe(409)
    })
  })

  it("400 si la segmentación no resuelve destinatarios vigentes", async () => {
    let id = ""
    await conSesion(emailAdmin, async () => {
      const res = await emitir({
        titulo: "Informe sin audiencia",
        bloques: ["gastos_mes"],
        periodo,
        segmento: { perfiles: ["personal"] },
      })
      id = (await res.json()).id
    })
    // No hay ninguna persona con rol personal: no hay a quién distribuir.
    await conSesion(emailAdmin, async () => {
      const res = await distribuir(id)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain("no resolvió destinatarios")
    })
  })
})

// --- 3. Lectura (métrica "leídos") ------------------------------------------

describe("POST /api/reportes-re/[id]/lectura — leídos en la app", () => {
  async function emitirInforme(): Promise<string> {
    let id = ""
    await conSesion(emailAdmin, async () => {
      const res = await emitir({ titulo: "Informe leíble", bloques: ["gastos_mes"], periodo })
      id = (await res.json()).id
    })
    return id
  }

  it("setea la fecha de la primera lectura y no la duplica", async () => {
    const id = await emitirInforme()
    await conSesion(emailComite, async () => {
      const res = await registrarLectura(id)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.yaLeido).toBe(false)
      expect(json.fecha).toBe(hoy())

      const segunda = await registrarLectura(id)
      const jsonSegunda = await segunda.json()
      expect(jsonSegunda.yaLeido).toBe(true)
      expect(jsonSegunda.fecha).toBe(hoy())

      const lecturas = (await reporteEnBd(id))?.lecturas as Array<{
        usuarioId: string
        rol: string
        fecha: string
      }>
      expect(lecturas).toHaveLength(1)
      expect(lecturas[0]?.usuarioId).toBe(emailToId(emailComite))
      expect(lecturas[0]?.rol).toBe("comite")
      expect(lecturas[0]?.fecha).toBe(hoy())
    })
  })

  it("la lectura de otro usuario se suma a la métrica", async () => {
    const id = await emitirInforme()
    await conSesion(emailComite, async () => {
      await registrarLectura(id)
    })
    await conSesion(emailAdmin, async () => {
      const res = await registrarLectura(id)
      expect((await res.json()).yaLeido).toBe(false)
      const lecturas = (await reporteEnBd(id))?.lecturas as unknown[]
      expect(lecturas).toHaveLength(2)
    })
  })
})

// --- 4. Vista del Centro de Mando -------------------------------------------

describe("POST /api/reportes-re/vistas", () => {
  it("audita la vista para administrador y comité, y la bloquea al residente", async () => {
    await conSesion(emailComite, async () => {
      const res = await registrarVista("demografico")
      expect(res.status).toBe(200)
      expect(await prisma.eventoAuditoria.count({
        where: { comunidadId: comunidad, tipoAccion: "RE_DASHBOARD_VIEW" },
      })).toBe(1)
    })
    await conSesion(emailResidente, async () => {
      const res = await registrarVista("demografico")
      expect(res.status).toBe(403)
    })
    await conSesion(emailAdmin, async () => {
      expect((await registrarVista("financiero")).status).toBe(200)
    })
    await conSesion(emailAdmin, async () => {
      const res = await registrarVista("inventada")
      expect(res.status).toBe(400)
    })
  })
})

// --- 5. Guardias de sesión, authz y alcance ---------------------------------

describe("guardias RE", () => {
  it("401 sin sesión en las cuatro rutas", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await emitir({ titulo: "Guarda 401", bloques: ["gastos_mes"], periodo })
      const id = (await res.json()).id
      state.cookie = ""
      expect(
        (
          await postJson((await cargaModulos()).generar, "/api/reportes-re/generar", {
            titulo: "Guarda 401",
            bloques: ["gastos_mes"],
          })
        ).status
      ).toBe(401)
      expect(
        (
          await postJson(
            (await cargaModulos()).distribuir,
            `/api/reportes-re/${id}/distribuir`,
            {},
            { id }
          )
        ).status
      ).toBe(401)
      expect(
        (
          await postJson(
            (await cargaModulos()).lectura,
            `/api/reportes-re/${id}/lectura`,
            {},
            { id }
          )
        ).status
      ).toBe(401)
      expect(
        (
          await postJson((await cargaModulos()).vistas, "/api/reportes-re/vistas", {
            vista: "demografico",
          })
        ).status
      ).toBe(401)
    })
  })

  it("403 para comité y residente al emitir; comité solo puede ver", async () => {
    for (const email of [emailComite, emailResidente]) {
      await conSesion(email, async () => {
        const res = await emitir({
          titulo: "No autorizado",
          bloques: ["gastos_mes"],
          periodo,
        })
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: "Permiso denegado." })
      })
    }
    expect(await prisma.reporteRE.count({ where: { comunidadId: comunidad } })).toBe(0)
  })

  it("403 para comité y residente al distribuir", async () => {
    let id = ""
    await conSesion(emailAdmin, async () => {
      const res = await emitir({ titulo: "Solo admin distribuye", bloques: ["gastos_mes"], periodo })
      id = (await res.json()).id
    })
    for (const email of [emailComite, emailResidente]) {
      await conSesion(email, async () => {
        const res = await distribuir(id)
        expect(res.status).toBe(403)
      })
    }
    expect((await reporteEnBd(id))?.estadoDistribucion).toBeNull()
  })

  it("404 cross-comunidad en distribuir y en lectura", async () => {
    let id = ""
    await conSesion(emailAdmin, async () => {
      const res = await emitir({ titulo: "Informe de otra comunidad", bloques: ["gastos_mes"], periodo })
      id = (await res.json()).id
    })
    await conSesion(emailAdminOtra, async () => {
      expect((await distribuir(id)).status).toBe(404)
      expect((await registrarLectura(id)).status).toBe(404)
      expect((await leerReporte(id)).status).toBe(404)
    })
    expect((await reporteEnBd(id))?.distribuidoA).toBe(0)
  })
})
