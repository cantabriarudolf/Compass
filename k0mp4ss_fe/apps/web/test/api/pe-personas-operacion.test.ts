/**
 * @vitest-environment node
 *
 * F6 (segunda mitad) — `GET /api/pe/personas`: la proyección que necesita la conserjería.
 *
 * El padrón de personas vive en `/api/personas`, detrás del recurso `mp`. Conserjería no lo tiene,
 * así que hoy (a) la búsqueda por RUN del QR siempre cae al padrón local del store con el aviso
 * «No se pudo consultar el padrón del servidor», y (b) el selector de «Residente destino» lee el
 * store y trunca a 100. Esta proyección resuelve las dos con tres campos y el permiso de la
 * bitácora.
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

const COMUNIDAD = "f6-pep-comunidad"
const COMUNIDAD_AJENA = "f6-pep-comunidad-ajena"

const CUENTAS = {
  conserjeria: { id: "f6-pep-user-conserjeria", email: "f6-pep-conserjeria@test.cl", rol: "conserjeria" },
  residente: { id: "f6-pep-user-residente", email: "f6-pep-residente@test.cl", rol: "residente" },
  administrador: { id: "f6-pep-user-admin", email: "f6-pep-admin@test.cl", rol: "administrador" },
} as const

/** El RUN se guarda canónico (sin puntos): el panel busca con y sin ellos. */
const PERSONAS = [
  {
    id: "f6-pep-p1",
    comunidadId: COMUNIDAD,
    rut: "15123456-9",
    nombreCompleto: "Juan Pérez González",
    nombres: "Juan",
    apellidos: "Pérez González",
    email: "f6-pep-p1@test.cl",
    telefonoMovil: "+56911111111",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["residente"],  },
  {
    id: "f6-pep-p2",
    comunidadId: COMUNIDAD,
    rut: "11111111-1",
    nombreCompleto: "Daniela Fuenzalida Soto",
    nombres: "Daniela",
    apellidos: "Fuenzalida Soto",
    email: "f6-pep-p2@test.cl",
    telefonoMovil: "+56911111111",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["residente"],  },
  {
    id: "f6-pep-ajena",
    comunidadId: COMUNIDAD_AJENA,
    rut: "19876543-0",
    nombreCompleto: "Persona de Otra Comunidad",
    nombres: "Persona",
    apellidos: "de Otra Comunidad",
    email: "f6-pep-ajena@test.cl",
    telefonoMovil: "+56911111111",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles: ["residente"],  },
]

interface RespuestaPersonas {
  data: { id: string; rut: string; nombreCompleto: string }[]
  pageSize?: number
  total?: number
}

describe("GET /api/pe/personas — padrón de la operación (F6)", () => {
  let GET: (req: Request) => Promise<Response>
  const cookies: Record<keyof typeof CUENTAS, string> = {
    conserjeria: "",
    residente: "",
    administrador: "",
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const c of [
      { id: COMUNIDAD, nombre: "Comunidad F6 PE Personas", slug: COMUNIDAD },
      { id: COMUNIDAD_AJENA, nombre: "Comunidad F6 PE Personas Ajena", slug: COMUNIDAD_AJENA },
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

  it("conserjería obtiene el padrón de su comunidad", async () => {
    const res = await pedir("conserjeria")
    expect(res.status).toBe(200)
    const j = (await res.json()) as RespuestaPersonas

    expect(j.data.map((p) => p.id).sort()).toEqual(["f6-pep-p1", "f6-pep-p2"])
    expect(j.data.some((p) => p.id === "f6-pep-ajena")).toBe(false)
  })

  it("proyecta solo identidad: id, rut y nombre completo", async () => {
    const res = await pedir("conserjeria")
    const j = (await res.json()) as RespuestaPersonas

    expect(Object.keys(j.data[0]!).sort()).toEqual(["id", "nombreCompleto", "rut"])
  })

  it("el RUN llega con puntos o sin ellos y el match es el canónico", async () => {
    const conPuntos = (await (await pedir("conserjeria", "?rut=15.123.456-9")).json()) as RespuestaPersonas
    expect(conPuntos.data.map((p) => p.id)).toEqual(["f6-pep-p1"])

    const sinPuntos = (await (await pedir("conserjeria", "?rut=15123456-9")).json()) as RespuestaPersonas
    expect(sinPuntos.data.map((p) => p.id)).toEqual(["f6-pep-p1"])
  })

  it("un RUN malformado no consulta la base y responde 400", async () => {
    expect((await pedir("conserjeria", "?rut=nada")).status).toBe(400)
  })

  it("`q` filtra por nombre o RUT", async () => {
    const porNombre = (await (await pedir("conserjeria", "?q=Daniela")).json()) as RespuestaPersonas
    expect(porNombre.data.map((p) => p.id)).toEqual(["f6-pep-p2"])

    const porRut = (await (await pedir("conserjeria", "?q=15123456")).json()) as RespuestaPersonas
    expect(porRut.data.map((p) => p.id)).toEqual(["f6-pep-p1"])
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
    // 105 personas extra de la propia comunidad: sin un `total` de servidor el selector
    // truncaría en silencio y el panel no podría avisar (AvisoTruncamiento).
    const extras = Array.from({ length: 105 }, (_, i) => ({
      id: `f6-pep-extra-${String(i).padStart(3, "0")}`,
      comunidadId: COMUNIDAD,
      rut: `15${String(i).padStart(6, "0")}-9`,
      nombreCompleto: `Persona Extra ${i}`,
      nombres: "Persona",
      apellidos: `Extra ${i}`,
      email: `f6-pep-extra-${i}@test.cl`,
      telefonoMovil: "+56911111111",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["residente"],
    }))
    await prisma.persona.createMany({ data: extras })
    try {
      const res = await pedir("conserjeria", "?pageSize=100")
      expect(res.status).toBe(200)
      const j = (await res.json()) as RespuestaPersonas

      // 2 del padrón sembrado + 105 extras, y nunca las de la comunidad ajena.
      expect(j.total).toBe(107)
      expect(j.pageSize).toBe(100)
      expect(j.data).toHaveLength(100)
      expect(j.data.some((p) => p.id === "f6-pep-ajena")).toBe(false)
    } finally {
      await prisma.persona.deleteMany({ where: { id: { startsWith: "f6-pep-extra-" } } })
    }
  })
})
