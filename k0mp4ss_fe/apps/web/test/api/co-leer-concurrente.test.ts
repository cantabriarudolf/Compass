/**
 * @vitest-environment node
 *
 * S6 · S8 — la lectura de un envío se registra en `EnvioDestinatarioCO`, es
 * idempotente y no se pierde cuando dos destinatarios leen a la vez (change
 * co-lectura-residente, tarea 1.4 · decisión D3 del design).
 *
 * Antes de este change `POST /api/co/envios/[id]/leer` hacía read-modify-write
 * del array JSON `lecturas`: dos lecturas concurrentes leían el mismo array y la
 * segunda sobreescribía a la primera (una lectura se perdía). Con la tabla, cada
 * lectura es un update condicional sobre SU fila.
 *
 * La concurrencia se ejercita con dos sesiones distintas en vuelo (el mock de
 * `next/headers` resuelve la cookie por invocación vía AsyncLocalStorage), no
 * con dos llamadas secuenciales.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  conSesionConcurrente,
  cookieActiva,
  cookieDeUsuario,
  cuerpoJson,
  invocarApi,
} from "../helpers/api-sesion"

const state = vi.hoisted(() => ({ cookie: "" }))
vi.mock("next/headers", async () => {
  const { cookieActiva: activa } = await import("../helpers/api-sesion")
  return {
    headers: () =>
      Promise.resolve(
        new Headers({
          ...(activa(state) ? { cookie: activa(state) } : {}),
          "x-forwarded-proto": "http",
        })
      ),
  }
})

const COM = "co-leer-com"
const P_A = "co-leer-p-a"
const P_B = "co-leer-p-b"
const P_C = "co-leer-p-c" // NO es destinatario del envío
const ENV = "co-leer-env"

const usuarios = {
  admin: "co-leer-admin@test.cl",
  residenteA: "co-leer-res-a@test.cl",
  residenteB: "co-leer-res-b@test.cl",
  residenteC: "co-leer-res-c@test.cl",
}

const moduloLeer = () => import("@/app/api/co/envios/[id]/leer/route")
const moduloDetalle = () => import("@/app/api/co/envios/[id]/route")

const leer = (id = ENV) =>
  invocarApi(moduloLeer(), "POST", "co/envios/[id]/leer", { params: { id } })

async function conSesion<T>(email: string, fn: () => Promise<T>): Promise<T> {
  state.cookie = await cookieDeUsuario(email)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

async function fila(personaId: string) {
  return prisma.envioDestinatarioCO.findUnique({
    where: { envioId_personaId: { envioId: ENV, personaId } },
    select: { leidoEn: true },
  })
}

async function lecturasDerivadas(): Promise<string[]> {
  const envio = await prisma.envioCO.findUnique({ where: { id: ENV } })
  return (envio?.lecturas as unknown as string[]) ?? []
}

/** Deja el envío como recién emitido: ninguna fila leída. */
async function reiniciarEnvios(): Promise<void> {
  await prisma.envioDestinatarioCO.updateMany({
    where: { envioId: ENV },
    data: { leidoEn: null },
  })
  await prisma.envioCO.update({ where: { id: ENV }, data: { lecturas: [] } })
}

beforeAll(async () => {
  await prisma.comunidad.upsert({
    where: { id: COM },
    update: {},
    create: { id: COM, nombre: "Comunidad Lectura CO", slug: "co-lectura" },
  })
  const semilla = [
    { email: usuarios.admin, rol: "administrador", personaId: null },
    { email: usuarios.residenteA, rol: "residente", personaId: P_A },
    { email: usuarios.residenteB, rol: "residente", personaId: P_B },
    { email: usuarios.residenteC, rol: "residente", personaId: P_C },
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
      asunto: "Corte de agua programado",
      cuerpo: "Corte de agua el sábado de 09:00 a 13:00 por mantención de la red.",
      fechaEnvio: "2026-10-24",
      destinatarios: [
        { personaId: P_A, unidadId: "co-leer-u-1" },
        { personaId: P_B, unidadId: "co-leer-u-2" },
      ],
      lecturas: [],
    },
  })
  await prisma.envioDestinatarioCO.createMany({
    data: [
      { id: "co-leer-d-a", envioId: ENV, personaId: P_A, unidadId: "co-leer-u-1" },
      { id: "co-leer-d-b", envioId: ENV, personaId: P_B, unidadId: "co-leer-u-2" },
    ],
  })
}, 30_000)

afterAll(async () => {
  try {
    state.cookie = ""
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

describe("POST /api/co/envios/[id]/leer — registro en la tabla (S6)", () => {
  it("la primera lectura marca `leidoEn` en la fila del destinatario y deriva `lecturas`", async () => {
    await reiniciarEnvios()
    await conSesion(usuarios.residenteA, async () => {
      const res = await leer()
      expect(res.status).toBe(200)
      const cuerpo = await cuerpoJson<{ ok: boolean; lecturas: number }>(res)
      expect(cuerpo.ok).toBe(true)
      expect(cuerpo.lecturas).toBe(1)
    })
    const destino = await fila(P_A)
    expect(destino?.leidoEn).not.toBeNull()
    expect(await lecturasDerivadas()).toEqual([P_A])
  })

  it("la segunda lectura es idempotente: no duplica la fila ni cambia `leidoEn`", async () => {
    await reiniciarEnvios()
    await conSesion(usuarios.residenteA, async () => {
      const primera = await leer()
      expect(primera.status).toBe(200)
      const leidoEnPrimera = (await fila(P_A))?.leidoEn?.toISOString()
      expect(leidoEnPrimera).toBeDefined()

      const segunda = await leer()
      expect(segunda.status).toBe(200)
      expect(await cuerpoJson<{ lecturas: number }>(segunda)).toEqual({
        ok: true,
        lecturas: 1,
      })

      const leidoEnSegunda = (await fila(P_A))?.leidoEn?.toISOString()
      expect(leidoEnSegunda).toBe(leidoEnPrimera)
      expect(await lecturasDerivadas()).toEqual([P_A])
      expect(
        await prisma.envioDestinatarioCO.count({ where: { envioId: ENV } })
      ).toBe(2)
    })
  })

  it("quien no es destinatario en la tabla recibe 404 (mismo cuerpo que un id inexistente)", async () => {
    await reiniciarEnvios()
    await conSesion(usuarios.residenteC, async () => {
      const ajeno = await leer()
      const inexistente = await leer("co-leer-no-existe")
      expect(ajeno.status).toBe(404)
      expect(inexistente.status).toBe(404)
      const cuerpoAjeno = await cuerpoJson(ajeno)
      expect(cuerpoAjeno).toEqual({ error: "Registro no encontrado." })
      expect(cuerpoAjeno).toEqual(await cuerpoJson(inexistente))
    })
    expect(await lecturasDerivadas()).toEqual([])
  })

  it("dos lecturas simultáneas de destinatarios distintos: ninguna se pierde", async () => {
    await reiniciarEnvios()
    const [porA, porB] = await Promise.all([
      conSesionConcurrente(usuarios.residenteA, () => leer()),
      conSesionConcurrente(usuarios.residenteB, () => leer()),
    ])
    expect(porA.status).toBe(200)
    expect(porB.status).toBe(200)

    // Lo que no puede pasar: que el segundo update borre la lectura del primero.
    expect((await fila(P_A))?.leidoEn).not.toBeNull()
    expect((await fila(P_B))?.leidoEn).not.toBeNull()

    // La tabla es la fuente de verdad (D3). La respuesta que ve la Administración se
    // deriva de ella, no del JSON persistido: `_lib/proyeccion-envio.ts` declara que
    // `EnvioCO.lecturas` «se ignora por completo (está derivada y puede quedar vieja)».
    // Con escritura concurrente ese JSON puede quedarse corto (PostgreSQL lo expone),
    // así que se afirma el contrato observable y no la caché.
    const detalle = await conSesion(usuarios.admin, () =>
      invocarApi(moduloDetalle(), "GET", "co/envios/[id]", { params: { id: ENV } })
    )
    expect(detalle.status).toBe(200)
    const cuerpo = await cuerpoJson<{ lecturas?: string[]; totalLecturas?: number }>(detalle)
    expect(cuerpo.totalLecturas).toBe(2)
    expect([...(cuerpo.lecturas ?? [])].sort()).toEqual([P_A, P_B].sort())
  })
})
