/**
 * @vitest-environment node
 *
 * F6 — `GET /api/pe/unidades`: la proyección de solo lectura que necesita el conserje.
 *
 * El padrón completo vive en `/api/unidades`, detrás del recurso `mp`. Conserjería no lo tiene
 * (`mp:propios` es ABAC del propio vínculo), así que esa ruta le devuelve 403 — y es el rol que
 * registra las visitas. Esta proyección existe para eso: cuatro campos, scope de la sesión y el
 * permiso `pe:bitacora`, que conserjería ya tiene.
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

const COMUNIDAD = "f6-pe-comunidad"
const COMUNIDAD_AJENA = "f6-pe-comunidad-ajena"

/** Una cuenta por rol: el scope sale de su membresía en la comunidad. */
const CUENTAS = {
  conserjeria: { id: "f6-pe-user-conserjeria", email: "f6-pe-conserjeria@test.cl", rol: "conserjeria" },
  residente: { id: "f6-pe-user-residente", email: "f6-pe-residente@test.cl", rol: "residente" },
  administrador: { id: "f6-pe-user-admin", email: "f6-pe-admin@test.cl", rol: "administrador" },
} as const

function unidad(id: string, comunidadId: string, numero: string, etiqueta: string, rolSii: string) {
  return {
    id,
    comunidadId,
    microSectorId: "f6-pe-micro",
    numero,
    etiqueta,
    tipoUnidadId: "f6-pe-tipo",
    metraje: 50,
    prorrateo: 0.01,
    rolSii,
    estadoId: "vacante",
    servicios: {},
  }
}

const UNIDADES = [
  unidad("f6-pe-u-101", COMUNIDAD, "101", "Depto", "123-A11"),
  unidad("f6-pe-u-e101", COMUNIDAD, "101", "Depto", "123-E11"),
  unidad("f6-pe-u-e001", COMUNIDAD, "E-001", "Estacionamiento", ""),
  unidad("f6-pe-u-lc01", COMUNIDAD, "L-01", "Local", "999-01"),
  unidad("f6-pe-u-ajena", COMUNIDAD_AJENA, "101", "Depto", "123-Z99"),
]

interface RespuestaUnidades {
  data: { id: string; numero: string; etiqueta: string; rolSii: string }[]
  pageSize?: number
  total?: number
}

describe("GET /api/pe/unidades — padrón de la operación (F6)", () => {
  let GET: (req: Request) => Promise<Response>
  const cookies: Record<keyof typeof CUENTAS, string> = {
    conserjeria: "",
    residente: "",
    administrador: "",
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const c of [
      { id: COMUNIDAD, nombre: "Comunidad F6 PE", slug: COMUNIDAD },
      { id: COMUNIDAD_AJENA, nombre: "Comunidad F6 PE Ajena", slug: COMUNIDAD_AJENA },
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

  async function pedir(
    rol: keyof typeof CUENTAS | "sin-sesion",
    query = ""
  ): Promise<Response> {
    state.cookie = rol === "sin-sesion" ? "" : cookies[rol]
    return GET(new NextRequest(`http://localhost/api/pe/unidades${query}`))
  }

  it("conserjería obtiene el padrón destino de su comunidad", async () => {
    const res = await pedir("conserjeria")
    expect(res.status).toBe(200)
    const j = (await res.json()) as RespuestaUnidades

    // Los dos «Depto 101» de torres distintas, el local, y nunca la plaza ni la comunidad ajena.
    expect(j.data.map((u) => u.id)).toEqual(["f6-pe-u-101", "f6-pe-u-e101", "f6-pe-u-lc01"])
    expect(j.data.some((u) => u.etiqueta === "Estacionamiento")).toBe(false)
    expect(j.data.some((u) => u.id === "f6-pe-u-ajena")).toBe(false)
  })

  it("proyecta solo los cuatro campos de la operación", async () => {
    const res = await pedir("conserjeria")
    const j = (await res.json()) as RespuestaUnidades

    expect(Object.keys(j.data[0]!).sort()).toEqual(["etiqueta", "id", "numero", "rolSii"])
  })

  it("`q` filtra por número, etiqueta y rol SII", async () => {
    const porRol = (await (await pedir("conserjeria", "?q=123-E11")).json()) as RespuestaUnidades
    expect(porRol.data.map((u) => u.id)).toEqual(["f6-pe-u-e101"])

    const porEtiqueta = (await (await pedir("conserjeria", "?q=Local")).json()) as RespuestaUnidades
    expect(porEtiqueta.data.map((u) => u.id)).toEqual(["f6-pe-u-lc01"])
  })

  it("el administrador también entra (wildcard)", async () => {
    expect((await pedir("administrador")).status).toBe(200)
  })

  it("un rol sin la bitácora no ve el padrón", async () => {
    expect((await pedir("residente")).status).toBe(403)
  })

  it("sin sesión responde 401 antes de consultar la base", async () => {
    expect((await pedir("sin-sesion")).status).toBe(401)
  })

  it("el envelope trae el total real del scope y pageSize=100 devuelve hasta 100 filas", async () => {
    // 105 unidades extra de la propia comunidad: sin un `total` de servidor el selector
    // truncaría en silencio y el panel no podría avisar (AvisoTruncamiento).
    const extras = Array.from({ length: 105 }, (_, i) =>
      unidad(`f6-pe-u-extra-${String(i).padStart(3, "0")}`, COMUNIDAD, `X${i}`, "Depto", "")
    )
    await prisma.unidad.createMany({ data: extras })
    try {
      const res = await pedir("conserjeria", "?pageSize=100")
      expect(res.status).toBe(200)
      const j = (await res.json()) as RespuestaUnidades

      // 3 del padrón sembrado + 105 extras, y nunca las de la comunidad ajena.
      expect(j.total).toBe(108)
      expect(j.pageSize).toBe(100)
      expect(j.data).toHaveLength(100)
      expect(j.data.some((u) => u.id === "f6-pe-u-ajena")).toBe(false)
    } finally {
      await prisma.unidad.deleteMany({ where: { id: { startsWith: "f6-pe-u-extra-" } } })
    }
  })
})
