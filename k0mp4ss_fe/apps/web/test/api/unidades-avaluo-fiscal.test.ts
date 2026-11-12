/**
 * @vitest-environment node
 *
 * POST /api/unidades — el avalúo fiscal LLEGA a la base (F32).
 *
 * El avalúo es el hecho catastral con el que se reparte el gasto de un sector: si
 * la ruta lo descarta en silencio, la unidad nunca entra a su reparto y no hay
 * error que lo delate — el hueco se ve meses después, cuando el gasto del sector
 * se carga a las demás unidades. Este archivo fija las dos caras del contrato,
 * leyendo siempre la fila con Prisma y nunca la respuesta HTTP:
 *
 *   1. Si el cuerpo declara `avaluoFiscal`, el número se persiste tal cual.
 *   2. Si lo omite, queda `NULL` —«no declarado»— y NO un 0, que repartiría de
 *      mentira el gasto del sector sobre una unidad sin avalúo.
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

const COMUNIDAD = "uniavaluo-comunidad"
const EMAIL_ADMIN = "uniavaluo-admin@test.cl"
const USER_ADMIN = "uniavaluo-user-admin"
const MICRO_SECTOR = "uniavaluo-micro"
const TIPO_UNIDAD = "uniavaluo-tipo"
const ESTADO = "uniavaluo-estado"

const CON_AVALUO = "uniavaluo-con"
const SIN_AVALUO = "uniavaluo-sin"

/** Cuerpo válido de alta: espejo de lo que manda el formulario de unidades. */
function cuerpoUnidad(
  id: string,
  numero: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    microSectorId: MICRO_SECTOR,
    numero,
    etiqueta: "Depto",
    tipoUnidadId: TIPO_UNIDAD,
    metraje: 62,
    prorrateo: 12,
    rolSii: `rol-${numero}`,
    estadoId: ESTADO,
    servicios: {},
    ...overrides,
  }
}

async function POST(body: unknown): Promise<Response> {
  const { POST: handler } = await import("@/app/api/unidades/route")
  return handler(
    new NextRequest("http://localhost/api/unidades", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
  )
}

async function conSesion(fn: () => Promise<void>): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { email: EMAIL_ADMIN } })
  if (!usuario) throw new Error(`usuario no encontrado: ${EMAIL_ADMIN}`)
  const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
  state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
  try {
    await fn()
  } finally {
    state.cookie = ""
  }
}

describe("POST /api/unidades — el avalúo fiscal no se descarta (F32)", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    await prisma.comunidad.upsert({
      where: { id: COMUNIDAD },
      update: {},
      create: { id: COMUNIDAD, nombre: "Comunidad avalúo", slug: "uniav-unidad-avaluo" },
    })
    await prisma.usuario.upsert({
      where: { email: EMAIL_ADMIN },
      update: {},
      create: { id: USER_ADMIN, email: EMAIL_ADMIN, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: USER_ADMIN } })
    await prisma.membresia.create({
      data: { usuarioId: USER_ADMIN, comunidadId: COMUNIDAD, rol: "administrador" },
    })

    // Maestros mínimos que exige el alta: las tres FKs se validan en la comunidad.
    await prisma.microSector.deleteMany({ where: { id: MICRO_SECTOR } })
    await prisma.microSector.create({
      data: {
        id: MICRO_SECTOR,
        comunidadId: COMUNIDAD,
        macroSectorId: "uniavaluo-macro",
        nombre: "Torre avalúo",
        etiqueta: "TA",
      },
    })
    await prisma.tipoUnidad.deleteMany({ where: { id: TIPO_UNIDAD } })
    await prisma.tipoUnidad.create({
      data: {
        id: TIPO_UNIDAD,
        comunidadId: COMUNIDAD,
        nombre: "Depto avalúo",
        categoria: "departamento",
        metraje: 62,
        montoBaseGc: 48_000,
        activo: true,
        historialTarifas: [],
      },
    })
    await prisma.estadoOcupacion.deleteMany({ where: { id: ESTADO } })
    await prisma.estadoOcupacion.create({
      data: { id: ESTADO, comunidadId: COMUNIDAD, nombre: "Habitada", color: "bg-emerald-500 text-white" },
    })
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.unidad.deleteMany({ where: { comunidadId: COMUNIDAD } })
      await prisma.microSector.deleteMany({ where: { id: MICRO_SECTOR } })
      await prisma.tipoUnidad.deleteMany({ where: { id: TIPO_UNIDAD } })
      await prisma.estadoOcupacion.deleteMany({ where: { id: ESTADO } })
      await prisma.membresia.deleteMany({ where: { usuarioId: USER_ADMIN } })
      await prisma.usuario.delete({ where: { id: USER_ADMIN } }).catch(() => {})
      await prisma.comunidad.delete({ where: { id: COMUNIDAD } }).catch(() => {})
    } catch {
      // limpieza best-effort
    }
  })

  it("con `avaluoFiscal` en el cuerpo, el número se persiste en la unidad", async () => {
    await conSesion(async () => {
      const res = await POST(cuerpoUnidad(CON_AVALUO, "401", { avaluoFiscal: 4_500_000 }))
      expect(res.status).toBe(201)
    })

    const enBd = await prisma.unidad.findUnique({ where: { id: CON_AVALUO } })
    expect(enBd).not.toBeNull()
    // El avalúo es el hecho que el reparto del sector va a leer: o está en la
    // fila, o la unidad queda fuera del reparto sin que nadie se entere.
    expect(enBd?.avaluoFiscal).toBe(4_500_000)
    // Y el resto del alta no cambió: los demás campos siguen entrando.
    expect(enBd?.metraje).toBe(62)
    expect(enBd?.comunidadId).toBe(COMUNIDAD)
  })

  it("sin `avaluoFiscal` en el cuerpo, la unidad queda con NULL y no con 0", async () => {
    await conSesion(async () => {
      const res = await POST(cuerpoUnidad(SIN_AVALUO, "402"))
      expect(res.status).toBe(201)
    })

    const enBd = await prisma.unidad.findUnique({ where: { id: SIN_AVALUO } })
    expect(enBd).not.toBeNull()
    // NULL = «no declarado»: la unidad no entra al reparto de su sector. Un 0
    // sería un avalúo declarado y la haría entrar con cuota cero.
    expect(enBd?.avaluoFiscal).toBeNull()
    expect(enBd?.avaluoFiscal).not.toBe(0)
  })
})
