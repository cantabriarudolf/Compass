/**
 * @vitest-environment node
 *
 * F6 (rótulos) — `?ids=` en las proyecciones de la operación: resolver la etiqueta de filas del
 * día cuya unidad o persona quedó fuera de la primera página del padrón (`pageSize=100`).
 *
 * Sin `?ids=` el panel solo tiene los 100 primeros y la fila del día muestra el id crudo
 * (`u-A-101`, `p-12`), que el conserje no puede leer. Con `?ids=` la proyección devuelve SOLO
 * esas filas del scope, con el mismo `select` y el mismo permiso `pe:bitacora`; `ids` gana sobre
 * `q`/`rut`; más de 50 ids es 400; sin ids o con lista vacía el comportamiento no cambia.
 *
 * Los códigos HTTP se afirman por rol, no por lectura de la matriz.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
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

const COMUNIDAD = "f6-rot-comunidad"
const COMUNIDAD_AJENA = "f6-rot-comunidad-ajena"

const CUENTAS = {
  conserjeria: { id: "f6-rot-user-conserjeria", email: "f6-rot-conserjeria@test.cl", rol: "conserjeria" },
  residente: { id: "f6-rot-user-residente", email: "f6-rot-residente@test.cl", rol: "residente" },
  administrador: { id: "f6-rot-user-admin", email: "f6-rot-admin@test.cl", rol: "administrador" },
} as const

function unidad(id: string, comunidadId: string, numero: string, etiqueta: string, rolSii: string) {
  return {
    id,
    comunidadId,
    microSectorId: "f6-rot-micro",
    numero,
    etiqueta,
    tipoUnidadId: "f6-rot-tipo",
    metraje: 50,
    prorrateo: 0.01,
    rolSii,
    estadoId: "vacante",
    servicios: {},
  }
}

const UNIDADES = [
  unidad("f6-rot-u-101", COMUNIDAD, "101", "Depto", "123-A11"),
  unidad("f6-rot-u-502", COMUNIDAD, "502", "Depto", "123-B02"),
  unidad("f6-rot-u-e001", COMUNIDAD, "E-001", "Estacionamiento", ""),
  unidad("f6-rot-u-ajena", COMUNIDAD_AJENA, "101", "Depto", "123-Z99"),
]

const PERSONAS = [
  {
    id: "f6-rot-p1",
    comunidadId: COMUNIDAD,
    rut: "15123456-9",
    nombreCompleto: "Juan Pérez González",
    nombres: "Juan",
    apellidos: "Pérez González",
    email: "f6-rot-p1@test.cl",
    telefonoMovil: "+56911111111",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["residente"],
  },
  {
    id: "f6-rot-p2",
    comunidadId: COMUNIDAD,
    rut: "11111111-1",
    nombreCompleto: "Daniela Fuenzalida Soto",
    nombres: "Daniela",
    apellidos: "Fuenzalida Soto",
    email: "f6-rot-p2@test.cl",
    telefonoMovil: "+56911111111",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["residente"],
  },
  {
    id: "f6-rot-p-ajena",
    comunidadId: COMUNIDAD_AJENA,
    rut: "19876543-0",
    nombreCompleto: "Persona de Otra Comunidad",
    nombres: "Persona",
    apellidos: "de Otra Comunidad",
    email: "f6-rot-p-ajena@test.cl",
    telefonoMovil: "+56911111111",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["residente"],
  },
]

interface Respuesta {
  data: Record<string, unknown>[]
  pageSize?: number
  total?: number
}

describe("GET /api/pe/unidades?ids= — rótulos fuera de la primera página", () => {
  let GET: (req: Request) => Promise<Response>
  const cookies: Record<keyof typeof CUENTAS, string> = {
    conserjeria: "",
    residente: "",
    administrador: "",
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const c of [
      { id: COMUNIDAD, nombre: "Comunidad F6 Rótulos", slug: COMUNIDAD },
      { id: COMUNIDAD_AJENA, nombre: "Comunidad F6 Rótulos Ajena", slug: COMUNIDAD_AJENA },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    for (const [clave, cuenta] of Object.entries(CUENTAS)) {
      await prisma.usuario.upsert({
        where: { email: cuenta.email },
        update: {},
        create: { id: cuenta.id, email: cuenta.email, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: cuenta.id } })
      await prisma.membresia.create({
        data: { usuarioId: cuenta.id, comunidadId: COMUNIDAD, rol: cuenta.rol },
      })
      cookies[clave as keyof typeof CUENTAS] = await cookieSesionAuthjs({
        sub: cuenta.id,
        email: cuenta.email,
      })
    }

    await prisma.unidad.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_AJENA] } },
    })
    await prisma.unidad.createMany({ data: UNIDADES })

    const ruta = await import("@/app/api/pe/unidades/route")
    GET = ruta.GET
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      await prisma.unidad.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_AJENA] } },
      })
      const ids = Object.values(CUENTAS).map((c) => c.id)
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } })
      await prisma.comunidad.deleteMany({ where: { id: { in: [COMUNIDAD, COMUNIDAD_AJENA] } } })
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function pedir(rol: keyof typeof CUENTAS | "sin-sesion", query = ""): Promise<Response> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    return GET(new NextRequest(`http://localhost/api/pe/unidades${query}`))
  }

  it("devuelve solo las filas pedidas del scope, con el select de la proyección", async () => {
    const res = await pedir("conserjeria", "?ids=f6-rot-u-101,f6-rot-u-502,f6-rot-u-ajena")
    expect(res.status).toBe(200)
    const j = (await res.json()) as Respuesta

    // La de la comunidad ajena se queda fuera: el scope manda aunque el id venga en la lista.
    expect(j.data.map((u) => u.id).sort()).toEqual(["f6-rot-u-101", "f6-rot-u-502"])
    expect(Object.keys(j.data[0]!).sort()).toEqual(["etiqueta", "id", "numero", "rolSii"])
  })

  it("la lista cerrada no se trunca por pageSize: pide 2 ids con pageSize=1 y trae 2", async () => {
    const res = await pedir("conserjeria", "?ids=f6-rot-u-101,f6-rot-u-502&pageSize=1")
    expect(res.status).toBe(200)
    const j = (await res.json()) as Respuesta
    expect(j.data.map((u) => u.id).sort()).toEqual(["f6-rot-u-101", "f6-rot-u-502"])
  })

  it("la plaza de estacionamiento pedida por id tampoco vuelve (no es destino)", async () => {
    const res = await pedir("conserjeria", "?ids=f6-rot-u-101,f6-rot-u-e001")
    const j = (await res.json()) as Respuesta
    expect(j.data.map((u) => u.id)).toEqual(["f6-rot-u-101"])
  })

  it("`ids` gana sobre `q` cuando vienen los dos", async () => {
    const res = await pedir("conserjeria", "?ids=f6-rot-u-502&q=101")
    const j = (await res.json()) as Respuesta
    expect(j.data.map((u) => u.id)).toEqual(["f6-rot-u-502"])
  })

  it("sin ids o con lista vacía el comportamiento actual no cambia", async () => {
    const sinIds = (await (await pedir("conserjeria")).json()) as Respuesta
    expect(sinIds.data).toHaveLength(2) // 101 + 502; la plaza y la ajena fuera

    const listaVacia = (await (await pedir("conserjeria", "?ids=,")).json()) as Respuesta
    expect(listaVacia.data).toHaveLength(2)
  })

  it("`q=` sigue funcionando igual", async () => {
    const res = await pedir("conserjeria", "?q=123-B02")
    const j = (await res.json()) as Respuesta
    expect(j.data.map((u) => u.id)).toEqual(["f6-rot-u-502"])
  })

  it("más de 50 ids responde 400 antes de consultar la base", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `f6-rot-u-extra-${i}`).join(",")
    expect((await pedir("conserjeria", `?ids=${ids}`)).status).toBe(400)
  })

  it("el administrador también entra (wildcard) y un rol sin la bitácora no ve el padrón", async () => {
    const admin = await pedir("administrador", "?ids=f6-rot-u-101")
    expect(admin.status).toBe(200)

    const residente = await pedir("residente", "?ids=f6-rot-u-101")
    expect(residente.status).toBe(403)
  })

  it("sin sesión responde 401 antes de consultar la base", async () => {
    expect((await pedir("sin-sesion", "?ids=f6-rot-u-101")).status).toBe(401)
  })
})

describe("GET /api/pe/personas?ids= — rótulos fuera de la primera página", () => {
  let GET: (req: Request) => Promise<Response>
  const cookies: Record<keyof typeof CUENTAS, string> = {
    conserjeria: "",
    residente: "",
    administrador: "",
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const c of [
      { id: COMUNIDAD, nombre: "Comunidad F6 Rótulos", slug: COMUNIDAD },
      { id: COMUNIDAD_AJENA, nombre: "Comunidad F6 Rótulos Ajena", slug: COMUNIDAD_AJENA },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    for (const [clave, cuenta] of Object.entries(CUENTAS)) {
      await prisma.usuario.upsert({
        where: { email: cuenta.email },
        update: {},
        create: { id: cuenta.id, email: cuenta.email, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: cuenta.id } })
      await prisma.membresia.create({
        data: { usuarioId: cuenta.id, comunidadId: COMUNIDAD, rol: cuenta.rol },
      })
      cookies[clave as keyof typeof CUENTAS] = await cookieSesionAuthjs({
        sub: cuenta.id,
        email: cuenta.email,
      })
    }

    await prisma.persona.deleteMany({
      where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_AJENA] } },
    })
    await prisma.persona.createMany({ data: PERSONAS })

    const ruta = await import("@/app/api/pe/personas/route")
    GET = ruta.GET
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      await prisma.persona.deleteMany({
        where: { comunidadId: { in: [COMUNIDAD, COMUNIDAD_AJENA] } },
      })
      const ids = Object.values(CUENTAS).map((c) => c.id)
      await prisma.membresia.deleteMany({ where: { usuarioId: { in: ids } } })
      await prisma.usuario.deleteMany({ where: { id: { in: ids } } })
      await prisma.comunidad.deleteMany({ where: { id: { in: [COMUNIDAD, COMUNIDAD_AJENA] } } })
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function pedir(rol: keyof typeof CUENTAS | "sin-sesion", query = ""): Promise<Response> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    return GET(new NextRequest(`http://localhost/api/pe/personas${query}`))
  }

  it("devuelve solo las filas pedidas del scope, con el select de la proyección", async () => {
    const res = await pedir("conserjeria", "?ids=f6-rot-p1,f6-rot-p2,f6-rot-p-ajena")
    expect(res.status).toBe(200)
    const j = (await res.json()) as Respuesta

    expect(j.data.map((p) => p.id).sort()).toEqual(["f6-rot-p1", "f6-rot-p2"])
    expect(Object.keys(j.data[0]!).sort()).toEqual(["id", "nombreCompleto", "rut"])
  })

  it("la lista cerrada no se trunca por pageSize: pide 2 ids con pageSize=1 y trae 2", async () => {
    const res = await pedir("conserjeria", "?ids=f6-rot-p1,f6-rot-p2&pageSize=1")
    expect(res.status).toBe(200)
    const j = (await res.json()) as Respuesta
    expect(j.data.map((p) => p.id).sort()).toEqual(["f6-rot-p1", "f6-rot-p2"])
  })

  it("`ids` gana sobre `rut` y sobre `q` cuando vienen", async () => {
    // Un rut válido que NO es el pedido: si `rut` ganara, la lista cambiaría.
    const conRut = (await (await pedir("conserjeria", "?ids=f6-rot-p2&rut=15.123.456-9")).json()) as Respuesta
    expect(conRut.data.map((p) => p.id)).toEqual(["f6-rot-p2"])

    const conQ = (await (await pedir("conserjeria", "?ids=f6-rot-p2&q=Juan")).json()) as Respuesta
    expect(conQ.data.map((p) => p.id)).toEqual(["f6-rot-p2"])
  })

  it("sin ids el comportamiento actual no cambia", async () => {
    const j = (await (await pedir("conserjeria")).json()) as Respuesta
    expect(j.data.map((p) => p.id).sort()).toEqual(["f6-rot-p1", "f6-rot-p2"])
  })

  it("`rut=` sigue funcionando igual (con o sin puntos)", async () => {
    const conPuntos = (await (await pedir("conserjeria", "?rut=15.123.456-9")).json()) as Respuesta
    expect(conPuntos.data.map((p) => p.id)).toEqual(["f6-rot-p1"])
  })

  it("más de 50 ids responde 400 antes de consultar la base", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `f6-rot-p-extra-${i}`).join(",")
    expect((await pedir("conserjeria", `?ids=${ids}`)).status).toBe(400)
  })

  it("el administrador también entra (wildcard) y un rol sin la bitácora no ve el padrón", async () => {
    const admin = await pedir("administrador", "?ids=f6-rot-p1")
    expect(admin.status).toBe(200)

    const residente = await pedir("residente", "?ids=f6-rot-p1")
    expect(residente.status).toBe(403)
  })

  it("sin sesión responde 401 antes de consultar la base", async () => {
    expect((await pedir("sin-sesion", "?ids=f6-rot-p1")).status).toBe(401)
  })
})
