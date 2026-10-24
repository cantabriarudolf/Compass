/**
 * @vitest-environment node
 *
 * S2 · S3 — `GET /api/co/envios` y `GET /api/co/envios/[id]` (change
 * co-lectura-residente, decisión D2 del design).
 *
 * Contrato verificado contra BD real:
 * | rol           | filas              | destinatarios[] | lecturas[] | totales |
 * | administrador | toda la comunidad  | sí              | sí         | sí      |
 * | comite        | toda la comunidad  | no              | no         | sí      |
 * | residente     | solo donde figura  | no              | no         | no      |
 *
 * El residente recibe `lecturaPropia` (su único dato de lectura) y un envío
 * ajeno responde 404 indistinguible de «no existe» (S3).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  cookieDeUsuario,
  cuerpoJson,
  invocarApi,
} from "../helpers/api-sesion"

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

const COM = "co-proy-com"
const COM_AJENA = "co-proy-com-ajena"

const P_A = "co-proy-p-a"
const P_B = "co-proy-p-b"
const P_C = "co-proy-p-c"

const ENV_A = "co-proy-env-a" // tres destinatarios; P_B ya leyó
const ENV_B = "co-proy-env-b" // solo P_C: ajeno para el residente A
const ENV_AJENO = "co-proy-env-ajeno" // otra comunidad, con P_A como destinatario

const LECTURA_P_B = new Date("2026-10-20T10:30:00.000Z")

const usuarios = {
  admin: "co-proy-admin@test.cl",
  comite: "co-proy-comite@test.cl",
  residenteA: "co-proy-res-a@test.cl",
  residenteB: "co-proy-res-b@test.cl",
  sinPersona: "co-proy-res-sin-persona@test.cl",
}

const envios = [ENV_A, ENV_B, ENV_AJENO]

type FilaProyectada = {
  id: string
  asunto: string
  destinatarios?: unknown[]
  lecturas?: string[]
  totalDestinatarios?: number
  totalLecturas?: number
  lecturaPropia?: { leidoEn: string | null }
}

async function conSesion<T>(email: string, fn: () => Promise<T>): Promise<T> {
  state.cookie = await cookieDeUsuario(email)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

const moduloColeccion = () => import("@/app/api/co/envios/route")
const moduloDetalle = () => import("@/app/api/co/envios/[id]/route")

beforeAll(async () => {
  const comunidades: Array<[string, string, string]> = [
    [COM, "Comunidad Proyección CO", "co-proyeccion"],
    [COM_AJENA, "Comunidad Ajena CO", "co-proyeccion-ajena"],
  ]
  for (const [id, nombre, slug] of comunidades) {
    await prisma.comunidad.upsert({
      where: { id },
      update: {},
      create: { id, nombre, slug },
    })
  }

  const semilla = [
    { email: usuarios.admin, rol: "administrador", personaId: null },
    { email: usuarios.comite, rol: "comite", personaId: null },
    { email: usuarios.residenteA, rol: "residente", personaId: P_A },
    { email: usuarios.residenteB, rol: "residente", personaId: P_B },
    { email: usuarios.sinPersona, rol: "residente", personaId: null },
  ]
  for (const u of semilla) {
    const usuario = await prisma.usuario.upsert({
      where: { email: u.email },
      update: { personaId: u.personaId },
      create: { email: u.email, personaId: u.personaId, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, comunidadId: COM, rol: u.rol },
    })
  }

  await prisma.envioCO.deleteMany({ where: { id: { in: envios } } })
  await prisma.envioCO.createMany({
    data: [
      {
        id: ENV_A,
        comunidadId: COM,
        asunto: "Citación asamblea ordinaria",
        cuerpo: "Se cita a asamblea ordinaria el 05-11-2026 a las 19:00.",
        fechaEnvio: "2026-10-20",
        destinatarios: [
          { personaId: P_A, unidadId: "co-proy-u-1" },
          { personaId: P_B, unidadId: "co-proy-u-2" },
          { personaId: P_C },
        ],
        lecturas: [P_B],
      },
      {
        id: ENV_B,
        comunidadId: COM,
        asunto: "Corte de agua programado",
        cuerpo: "Corte de agua el sábado de 09:00 a 13:00 por mantención.",
        fechaEnvio: "2026-10-21",
        destinatarios: [{ personaId: P_C }],
        lecturas: [],
      },
      {
        id: ENV_AJENO,
        comunidadId: COM_AJENA,
        asunto: "Comunicación de otra comunidad",
        cuerpo: "No debe ser visible desde la comunidad del solicitante.",
        fechaEnvio: "2026-10-19",
        destinatarios: [{ personaId: P_A }],
        lecturas: [],
      },
    ],
  })
  await prisma.envioDestinatarioCO.createMany({
    data: [
      { id: "co-proy-d-a1", envioId: ENV_A, personaId: P_A, unidadId: "co-proy-u-1" },
      {
        id: "co-proy-d-a2",
        envioId: ENV_A,
        personaId: P_B,
        unidadId: "co-proy-u-2",
        leidoEn: LECTURA_P_B,
      },
      { id: "co-proy-d-a3", envioId: ENV_A, personaId: P_C },
      { id: "co-proy-d-b1", envioId: ENV_B, personaId: P_C },
      { id: "co-proy-d-ajeno", envioId: ENV_AJENO, personaId: P_A },
    ],
  })
})

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.envioCO.deleteMany({ where: { id: { in: envios } } })
    await prisma.membresia.deleteMany({
      where: { usuario: { email: { in: Object.values(usuarios) } } },
    })
    await prisma.usuario.deleteMany({ where: { email: { in: Object.values(usuarios) } } })
    await prisma.comunidad.deleteMany({ where: { id: { in: [COM, COM_AJENA] } } })
  } catch {
    // intencional: limpieza best-effort (la base es descartable)
  }
})

describe("GET /api/co/envios — proyección por rol (S2)", () => {

  it("administrador: todas las filas de la comunidad, nómina, lecturas y totales", async () => {
    await conSesion(usuarios.admin, async () => {
      const res = await invocarApi(moduloColeccion(), "GET", "co/envios?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<{ data: FilaProyectada[]; total: number }>(res)
      expect(j.total).toBe(2)
      const a = j.data.find((e) => e.id === ENV_A)
      expect(a).toBeDefined()
      expect(a?.destinatarios).toHaveLength(3)
      // `lecturas` se DERIVA de la tabla, no del JSON persistido (D3/S8).
      expect(a?.lecturas).toEqual([P_B])
      expect(a?.totalDestinatarios).toBe(3)
      expect(a?.totalLecturas).toBe(1)
      expect(a).not.toHaveProperty("lecturaPropia")
    })
  })

  it("comité: todas las filas pero solo agregados, sin arreglos nominativos", async () => {
    await conSesion(usuarios.comite, async () => {
      const res = await invocarApi(moduloColeccion(), "GET", "co/envios?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<{ data: FilaProyectada[]; total: number }>(res)
      expect(j.total).toBe(2)
      for (const envio of j.data) {
        expect(envio).not.toHaveProperty("destinatarios")
        expect(envio).not.toHaveProperty("lecturas")
        expect(typeof envio.totalDestinatarios).toBe("number")
        expect(typeof envio.totalLecturas).toBe("number")
      }
      const a = j.data.find((e) => e.id === ENV_A)
      expect(a?.totalDestinatarios).toBe(3)
      expect(a?.totalLecturas).toBe(1)
    })
  })

  it("residente: solo sus envíos, sin nómina, sin lecturas ajenas y sin totales", async () => {
    await conSesion(usuarios.residenteA, async () => {
      const res = await invocarApi(moduloColeccion(), "GET", "co/envios?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<{ data: FilaProyectada[]; total: number }>(res)
      expect(j.data.map((e) => e.id)).toEqual([ENV_A])
      expect(j.total).toBe(1)
      const envio = j.data[0]
      expect(envio).not.toHaveProperty("destinatarios")
      expect(envio).not.toHaveProperty("lecturas")
      expect(envio).not.toHaveProperty("totalDestinatarios")
      expect(envio).not.toHaveProperty("totalLecturas")
      // El único dato de lectura que le pertenece: el suyo (todavía sin leer).
      expect(envio?.lecturaPropia).toEqual({ leidoEn: null })
    })
  })

  it("residente sin persona vinculada al MP: ninguna fila (no ve envíos de otros)", async () => {
    await conSesion(usuarios.sinPersona, async () => {
      const res = await invocarApi(moduloColeccion(), "GET", "co/envios?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<{ data: FilaProyectada[]; total: number }>(res)
      expect(j.data).toEqual([])
      expect(j.total).toBe(0)
    })
  })

  it("el administrador sigue viendo `lecturas` derivada aunque el JSON quedó viejo", async () => {
    await prisma.envioCO.update({
      where: { id: ENV_B },
      data: { lecturas: ["co-proy-p-z"] },
    })
    try {
      await conSesion(usuarios.admin, async () => {
        const res = await invocarApi(moduloDetalle(), "GET", "co/envios/[id]", {
          params: { id: ENV_B },
        })
        expect(res.status).toBe(200)
        const envio = await cuerpoJson<FilaProyectada>(res)
        // La tabla es la fuente de verdad: nadie leyó ENV_B, aunque el JSON diga otra cosa.
        expect(envio.lecturas).toEqual([])
        expect(envio.totalLecturas).toBe(0)
      })
    } finally {
      await prisma.envioCO.update({ where: { id: ENV_B }, data: { lecturas: [] } })
    }
  })
})

describe("GET /api/co/envios/[id] — detalle por rol y 404 indistinguible (S2 · S3)", () => {
  const detalle = (id: string) =>
    invocarApi(moduloDetalle(), "GET", "co/envios/[id]", { params: { id } })

  it("residente: su envío con `lecturaPropia` y sin nómina", async () => {
    await conSesion(usuarios.residenteA, async () => {
      const res = await detalle(ENV_A)
      expect(res.status).toBe(200)
      const envio = await cuerpoJson<FilaProyectada>(res)
      expect(envio.id).toBe(ENV_A)
      expect(envio).not.toHaveProperty("destinatarios")
      expect(envio).not.toHaveProperty("lecturas")
      expect(envio.lecturaPropia).toEqual({ leidoEn: null })
    })
  })

  it("residente: la lectura propia aparece con fecha ISO cuando ya leyó", async () => {
    // P_B es destinatario de ENV_A y su fila ya tiene leidoEn (semilla del beforeAll).
    await conSesion(usuarios.residenteB, async () => {
      const res = await detalle(ENV_A)
      expect(res.status).toBe(200)
      const envio = await cuerpoJson<FilaProyectada>(res)
      expect(envio.lecturaPropia).toEqual({ leidoEn: LECTURA_P_B.toISOString() })
      // Y no puede deducir nada de los otros dos destinatarios.
      expect(envio).not.toHaveProperty("totalLecturas")
    })
  })

  it("comité: detalle con agregados y sin arreglos nominativos", async () => {
    await conSesion(usuarios.comite, async () => {
      const res = await detalle(ENV_A)
      expect(res.status).toBe(200)
      const envio = await cuerpoJson<FilaProyectada>(res)
      expect(envio).not.toHaveProperty("destinatarios")
      expect(envio).not.toHaveProperty("lecturas")
      expect(envio.totalDestinatarios).toBe(3)
      expect(envio.totalLecturas).toBe(1)
    })
  })

  it("residente: envío ajeno y envío inexistente responden el mismo 404", async () => {
    await conSesion(usuarios.residenteA, async () => {
      const ajeno = await detalle(ENV_B)
      const inexistente = await detalle("co-proy-no-existe")
      expect(ajeno.status).toBe(404)
      expect(inexistente.status).toBe(404)
      const cuerpoAjeno = await cuerpoJson(ajeno)
      const cuerpoInexistente = await cuerpoJson(inexistente)
      expect(cuerpoAjeno).toEqual({ error: "Registro no encontrado." })
      expect(cuerpoAjeno).toEqual(cuerpoInexistente)
    })
  })

  it("residente: envío de otra comunidad donde figura como destinatario → 404", async () => {
    await conSesion(usuarios.residenteA, async () => {
      const res = await detalle(ENV_AJENO)
      expect(res.status).toBe(404)
    })
  })
})
