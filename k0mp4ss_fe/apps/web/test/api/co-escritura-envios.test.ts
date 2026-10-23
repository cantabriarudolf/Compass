/**
 * @vitest-environment node
 *
 * S6 · S8 — el alta y la edición de envíos escriben `EnvioDestinatarioCO` y el
 * snapshot `destinatarios` en una `$transaction`, dejando `EnvioCO.lecturas`
 * derivada de la tabla (change co-lectura-residente, tarea 1.6 · D3 del design).
 *
 * La tabla es la única fuente de pertenencia: si el administrador agrega o quita
 * destinatarios, las filas se reconcilian sin perder el `leidoEn` de quienes ya
 * habían leído. `lecturas` (JSON) nunca se acepta como estado: se recalcula.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
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

const COM = "co-escritura-com"
const P_A = "co-escritura-p-a"
const P_B = "co-escritura-p-b"
const P_C = "co-escritura-p-c"
const ENV = "co-escritura-env"

const usuarios = {
  admin: "co-escritura-admin@test.cl",
  residente: "co-escritura-res@test.cl",
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

function envio(cambios: Record<string, unknown> = {}) {
  return {
    id: ENV,
    asunto: "Citación asamblea ordinaria",
    cuerpo: "Se cita a asamblea ordinaria el 05-11-2026 a las 19:00.",
    fechaEnvio: "2026-11-01",
    destinatarios: [
      { personaId: P_A, unidadId: "co-escritura-u-1" },
      { personaId: P_B, unidadId: "co-escritura-u-2" },
    ],
    lecturas: [],
    ...cambios,
  }
}

async function filas() {
  return prisma.envioDestinatarioCO.findMany({
    where: { envioId: ENV },
    select: { personaId: true, unidadId: true, leidoEn: true },
    orderBy: { personaId: "asc" },
  })
}

async function lecturasDerivadas(): Promise<string[]> {
  const registro = await prisma.envioCO.findUnique({ where: { id: ENV } })
  return (registro?.lecturas as unknown as string[]) ?? []
}

async function limpiar(): Promise<void> {
  await prisma.envioCO.deleteMany({ where: { id: ENV } })
}

beforeAll(async () => {
  await prisma.comunidad.upsert({
    where: { id: COM },
    update: {},
    create: { id: COM, nombre: "Comunidad Escritura CO", slug: "co-escritura" },
  })
  const semilla = [
    { email: usuarios.admin, rol: "administrador" },
    { email: usuarios.residente, rol: "residente" },
  ]
  for (const u of semilla) {
    const usuario = await prisma.usuario.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, comunidadId: COM, rol: u.rol },
    })
  }
}, 30_000)

afterAll(async () => {
  try {
    state.cookie = ""
    await limpiar()
    await prisma.membresia.deleteMany({
      where: { usuario: { email: { in: Object.values(usuarios) } } },
    })
    await prisma.usuario.deleteMany({ where: { email: { in: Object.values(usuarios) } } })
    await prisma.comunidad.delete({ where: { id: COM } })
  } catch {
    // intencional: limpieza best-effort (la base es descartable)
  }
})

describe("POST /api/co/envios — alta transaccional (S8)", () => {
  it("crea una fila por destinatario, guarda el snapshot y deja `lecturas` vacía", async () => {
    await limpiar()
    await conSesion(usuarios.admin, async () => {
      const res = await invocarApi(moduloColeccion(), "POST", "co/envios", { body: envio() })
      expect(res.status).toBe(201)
    })
    const registradas = await filas()
    expect(registradas).toHaveLength(2)
    expect(registradas.map((f) => f.personaId)).toEqual([P_A, P_B])
    expect(registradas.every((f) => f.leidoEn === null)).toBe(true)
    const guardado = await prisma.envioCO.findUnique({ where: { id: ENV } })
    expect(guardado?.destinatarios).toEqual([
      { personaId: P_A, unidadId: "co-escritura-u-1" },
      { personaId: P_B, unidadId: "co-escritura-u-2" },
    ])
    expect(await lecturasDerivadas()).toEqual([])
  })

  // El alta con `lecturas` declaradas por el cliente se RECHAZA con 400: la
  // lectura solo la registra el destinatario (decisión del owner, PR #11).
  // Cubierto en `test/api/co-endurecimiento.test.ts`.

  it("el upsert de un envío existente reconcilia la tabla sin perder lecturas", async () => {
    await limpiar()
    await conSesion(usuarios.admin, async () => {
      expect((await invocarApi(moduloColeccion(), "POST", "co/envios", { body: envio() })).status).toBe(201)
      // P_B lee; después el administrador cambia la nómina (sale P_B, entra P_C).
      await prisma.envioDestinatarioCO.update({
        where: { envioId_personaId: { envioId: ENV, personaId: P_B } },
        data: { leidoEn: new Date("2026-11-02T09:00:00.000Z") },
      })
      const res = await invocarApi(moduloColeccion(), "POST", "co/envios", {
        body: envio({
          destinatarios: [
            { personaId: P_A, unidadId: "co-escritura-u-1" },
            { personaId: P_C, unidadId: "co-escritura-u-3" },
          ],
          lecturas: [],
        }),
      })
      expect(res.status).toBe(200)
    })
    const registradas = await filas()
    expect(registradas.map((f) => f.personaId)).toEqual([P_A, P_C])
    // `lecturas` (JSON) se recalcula desde la tabla: P_B ya no es destinatario.
    expect(await lecturasDerivadas()).toEqual([])
    const snapshot = await prisma.envioCO.findUnique({ where: { id: ENV } })
    expect(snapshot?.destinatarios).toEqual([
      { personaId: P_A, unidadId: "co-escritura-u-1" },
      { personaId: P_C, unidadId: "co-escritura-u-3" },
    ])
  })

  it("el residente no emite difusiones: POST → 403", async () => {
    await limpiar()
    await conSesion(usuarios.residente, async () => {
      const res = await invocarApi(moduloColeccion(), "POST", "co/envios", { body: envio() })
      expect(res.status).toBe(403)
      expect(await cuerpoJson(res)).toEqual({ error: "Permiso denegado." })
    })
    expect(await filas()).toEqual([])
  })
})

describe("PUT /api/co/envios/[id] — edición transaccional (S8)", () => {
  it("actualiza el snapshot, reconcilia las filas y conserva `leidoEn` de quien ya leyó", async () => {
    await limpiar()
    await conSesion(usuarios.admin, async () => {
      expect((await invocarApi(moduloColeccion(), "POST", "co/envios", { body: envio() })).status).toBe(201)
      await prisma.envioDestinatarioCO.update({
        where: { envioId_personaId: { envioId: ENV, personaId: P_A } },
        data: { leidoEn: new Date("2026-11-02T07:30:00.000Z") },
      })
      await prisma.envioCO.update({
        where: { id: ENV },
        data: { lecturas: [P_A] },
      })

      const res = await invocarApi(moduloDetalle(), "PUT", "co/envios/[id]", {
        params: { id: ENV },
        body: {
          asunto: "Citación asamblea ordinaria (corregida)",
          destinatarios: [
            { personaId: P_A, unidadId: "co-escritura-u-1" },
            { personaId: P_B, unidadId: "co-escritura-u-2" },
            { personaId: P_C, unidadId: "co-escritura-u-3" },
          ],
        },
      })
      expect(res.status).toBe(200)
    })
    const registradas = await filas()
    expect(registradas.map((f) => f.personaId)).toEqual([P_A, P_B, P_C])
    const porPersona = new Map(registradas.map((f) => [f.personaId, f.leidoEn]))
    expect(porPersona.get(P_A)?.toISOString()).toBe("2026-11-02T07:30:00.000Z")
    expect(porPersona.get(P_B)).toBeNull()
    expect(await lecturasDerivadas()).toEqual([P_A])
    const actualizado = await prisma.envioCO.findUnique({ where: { id: ENV } })
    expect(actualizado?.asunto).toBe("Citación asamblea ordinaria (corregida)")
  })

  it("PUT sobre un envío inexistente → 404", async () => {
    await conSesion(usuarios.admin, async () => {
      const res = await invocarApi(moduloDetalle(), "PUT", "co/envios/[id]", {
        params: { id: "co-escritura-no-existe" },
        body: { asunto: "Cambio sin registro" },
      })
      expect(res.status).toBe(404)
    })
  })
})
