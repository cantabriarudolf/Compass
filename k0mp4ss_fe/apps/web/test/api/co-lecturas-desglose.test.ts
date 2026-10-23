/**
 * @vitest-environment node
 *
 * S4 — desglose nominativo de lecturas (change co-lectura-residente, tarea 1.5 ·
 * decisión D5 del design).
 *
 * Reglas verificadas contra BD real:
 * - solo el rol administrador consulta el desglose (residente y comité → 403);
 * - la respuesta son las parejas `personaId` / `leidoEn` de la tabla;
 * - cada consulta emite `CO_LECTURA_CONSULTADA` con el envío y el rol que consultó
 *   (rendición de cuentas del art. 21: hay que poder acreditar quién miró la
 *   lectura de los vecinos);
 * - ninguna ruta de CO exporta el desglose.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { readdirSync, statSync } from "node:fs"
import path from "node:path"
import { prisma } from "@/lib/prisma"
import { cookieDeUsuario, cuerpoJson, invocarApi } from "../helpers/api-sesion"

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

const COM = "co-desglose-com"
const P_A = "co-desglose-p-a"
const P_B = "co-desglose-p-b"
const P_C = "co-desglose-p-c"
const ENV = "co-desglose-env"

const LECTURA_B = new Date("2026-10-25T08:15:00.000Z")

const usuarios = {
  admin: "co-desglose-admin@test.cl",
  comite: "co-desglose-comite@test.cl",
  residenteA: "co-desglose-res-a@test.cl",
}

type Lectura = { personaId: string; leidoEn: string | null }

async function conSesion<T>(email: string, fn: () => Promise<T>): Promise<T> {
  state.cookie = await cookieDeUsuario(email)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

const moduloDesglose = () => import("@/app/api/co/envios/[id]/lecturas/route")

const desglose = (id = ENV) =>
  invocarApi(moduloDesglose(), "GET", "co/envios/[id]/lecturas", { params: { id } })

beforeAll(async () => {
  await prisma.comunidad.upsert({
    where: { id: COM },
    update: {},
    create: { id: COM, nombre: "Comunidad Desglose CO", slug: "co-desglose" },
  })
  const semilla = [
    { email: usuarios.admin, rol: "administrador", personaId: null },
    { email: usuarios.comite, rol: "comite", personaId: null },
    { email: usuarios.residenteA, rol: "residente", personaId: P_A },
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

  await prisma.envioCO.deleteMany({ where: { id: ENV } })
  await prisma.envioCO.create({
    data: {
      id: ENV,
      comunidadId: COM,
      asunto: "Citación asamblea extraordinaria",
      cuerpo: "Se cita a asamblea extraordinaria para aprobar el presupuesto 2027.",
      fechaEnvio: "2026-10-25",
      destinatarios: [
        { personaId: P_A, unidadId: "co-desglose-u-1" },
        { personaId: P_B, unidadId: "co-desglose-u-2" },
        { personaId: P_C, unidadId: "co-desglose-u-3" },
      ],
      lecturas: [P_B],
    },
  })
  await prisma.envioDestinatarioCO.createMany({
    data: [
      { id: "co-desglose-d-a", envioId: ENV, personaId: P_A, unidadId: "co-desglose-u-1" },
      {
        id: "co-desglose-d-b",
        envioId: ENV,
        personaId: P_B,
        unidadId: "co-desglose-u-2",
        leidoEn: LECTURA_B,
      },
      { id: "co-desglose-d-c", envioId: ENV, personaId: P_C, unidadId: "co-desglose-u-3" },
    ],
  })
  await prisma.eventoAuditoria.deleteMany({
    where: { comunidadId: COM, tipoAccion: "CO_LECTURA_CONSULTADA" },
  })
}, 30_000)

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: COM, tipoAccion: "CO_LECTURA_CONSULTADA" },
    })
    await prisma.envioCO.deleteMany({ where: { id: ENV } })
    await prisma.membresia.deleteMany({
      where: { usuario: { email: { in: Object.values(usuarios) } } },
    })
    await prisma.usuario.deleteMany({ where: { email: { in: Object.values(usuarios) } } })
    await prisma.comunidad.delete({ where: { id: COM } })
  } catch {
    // intencional: limpieza best-effort (la base es descartable)
  }
})

describe("GET /api/co/envios/[id]/lecturas — reservado y auditado (S4)", () => {
  it("residente y comité reciben 403 (el desglose es del administrador)", async () => {
    for (const email of [usuarios.residenteA, usuarios.comite]) {
      await conSesion(email, async () => {
        const res = await desglose()
        expect(res.status).toBe(403)
        expect(await cuerpoJson(res)).toEqual({ error: "Permiso denegado." })
      })
    }
  })

  it("administrador: parejas `personaId` / `leidoEn` de la tabla", async () => {
    await conSesion(usuarios.admin, async () => {
      const res = await desglose()
      expect(res.status).toBe(200)
      const lecturas = await cuerpoJson<Lectura[]>(res)
      expect(lecturas).toHaveLength(3)
      const porPersona = new Map(lecturas.map((l) => [l.personaId, l.leidoEn]))
      expect(porPersona.get(P_A)).toBeNull()
      expect(porPersona.get(P_B)).toBe(LECTURA_B.toISOString())
      expect(porPersona.get(P_C)).toBeNull()
      // Solo los tres campos del desglose: nada de RUT, IP ni user-agent (D6).
      for (const lectura of lecturas) {
        expect(Object.keys(lectura).sort()).toEqual(["leidoEn", "personaId"])
      }
    })
  })

  it("la consulta queda auditada con el envío y el rol que consultó", async () => {
    await prisma.eventoAuditoria.deleteMany({
      where: { comunidadId: COM, tipoAccion: "CO_LECTURA_CONSULTADA" },
    })
    const admin = await prisma.usuario.findUnique({ where: { email: usuarios.admin } })
    await conSesion(usuarios.admin, async () => {
      expect((await desglose()).status).toBe(200)
    })
    const eventos = await prisma.eventoAuditoria.findMany({
      where: { comunidadId: COM, tipoAccion: "CO_LECTURA_CONSULTADA" },
    })
    expect(eventos).toHaveLength(1)
    const evento = eventos[0]
    expect(evento?.categoria).toBe("CO")
    expect(evento?.referenciaId).toBe(ENV)
    expect(evento?.usuario).toBe(admin?.id)
    expect(evento?.descripcion.toLowerCase()).toContain("administrador")
  })

  it("un envío inexistente responde 404 al administrador", async () => {
    await conSesion(usuarios.admin, async () => {
      const res = await desglose("co-desglose-no-existe")
      expect(res.status).toBe(404)
      expect(await cuerpoJson(res)).toEqual({ error: "Registro no encontrado." })
    })
  })

  it("sin sesión responde 401 y no toca la BD", async () => {
    state.cookie = ""
    const res = await desglose()
    expect(res.status).toBe(401)
  })
})

describe("S4 — no existe endpoint de exportación del desglose", () => {
  /** Todas las rutas de CO declaradas en el App Router. */
  function rutasDeCo(dir: string, acumulado: string[] = []): string[] {
    for (const entrada of readdirSync(dir)) {
      const completo = path.join(dir, entrada)
      if (statSync(completo).isDirectory()) {
        rutasDeCo(completo, acumulado)
      } else if (entrada === "route.ts") {
        acumulado.push(path.relative(path.resolve(__dirname, "../.."), completo))
      }
    }
    return acumulado
  }

  it("ninguna ruta de CO exporta lecturas", () => {
    const rutas = rutasDeCo(path.resolve(__dirname, "../../app/api/co"))
    expect(rutas.length).toBeGreaterThan(5)
    const exportadoras = rutas.filter((ruta) => /export|descargar|xlsx|csv/i.test(ruta))
    expect(exportadoras).toEqual([])
  })
})
