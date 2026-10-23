/**
 * @vitest-environment node
 *
 * S10 — privacidad del buzón ciudadano (change co-lectura-residente, tarea 1.3).
 *
 * Reglas verificadas contra BD real:
 * - residente → solo los mensajes cuyo `reportantePersonaId` es el suyo;
 * - comité → solo los marcados `visibilidadComite`;
 * - administrador → todos;
 * - detalle ajeno para el residente → 404 indistinguible de «no existe»;
 * - al crear, `reportantePersonaId` y `reportanteNombre` salen de la sesión y el
 *   cuerpo del pedido se ignora (no se puede reportar «como» otro vecino).
 *
 * Ambas rutas (colección e `[id]`) usan el recurso `co:buzon`, no la difusión `co`.
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

const COM = "co-buzon-com"
const P_A = "co-buzon-p-a"
const P_B = "co-buzon-p-b"

const MSG_A_VISIBLE = "co-buzon-msg-a" // reportado por A, visible al comité
const MSG_B_PRIVADO = "co-buzon-msg-b" // reportado por B, NO visible al comité
const MSG_B_VISIBLE = "co-buzon-msg-c" // reportado por B, visible al comité

const usuarios = {
  admin: "co-buzon-admin@test.cl",
  comite: "co-buzon-comite@test.cl",
  residenteA: "co-buzon-res-a@test.cl",
}

type Mensaje = { id: string; reportantePersonaId: string | null; reportanteNombre: string }

async function conSesion<T>(email: string, fn: () => Promise<T>): Promise<T> {
  state.cookie = await cookieDeUsuario(email)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

const moduloColeccion = () => import("@/app/api/co/mensajes-buzon/route")
const moduloDetalle = () => import("@/app/api/co/mensajes-buzon/[id]/route")

beforeAll(async () => {
  await prisma.comunidad.upsert({
    where: { id: COM },
    update: {},
    create: { id: COM, nombre: "Comunidad Buzón CO", slug: "co-buzon" },
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

  await prisma.persona.deleteMany({ where: { id: { in: [P_A, P_B] } } })
  for (const [id, nombreCompleto] of [
    [P_A, "Ana Residente"],
    [P_B, "Bruno Vecino"],
  ] as const) {
    await prisma.persona.create({
      data: {
        id,
        comunidadId: COM,
        rut: `11.111.11${id === P_A ? "1" : "2"}-1`,
        nombreCompleto,
        nombres: nombreCompleto.split(" ")[0] as string,
        apellidos: nombreCompleto.split(" ")[1] as string,
        email: `${id}@test.cl`,
        telefonoMovil: "+56911111111",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario"],
      },
    })
  }

  await prisma.mensajeBuzonCO.deleteMany({
    where: { id: { in: [MSG_A_VISIBLE, MSG_B_PRIVADO, MSG_B_VISIBLE] } },
  })
  const base = {
    comunidadId: COM,
    clasificacion: "reclamo",
    fechaIngreso: "2026-10-22",
    estado: "recibido",
    respuestas: [],
  }
  await prisma.mensajeBuzonCO.createMany({
    data: [
      {
        ...base,
        id: MSG_A_VISIBLE,
        folio: "BZ-1001",
        reportantePersonaId: P_A,
        reportanteNombre: "Ana Residente",
        asunto: "Ruido en el pasillo",
        cuerpo: "Música fuerte después de las 23:00 en el pasillo del piso 3.",
        visibilidadComite: true,
      },
      {
        ...base,
        id: MSG_B_PRIVADO,
        folio: "BZ-1002",
        reportantePersonaId: P_B,
        reportanteNombre: "Bruno Vecino",
        asunto: "Filtración en baño",
        cuerpo: "Filtración en el baño de visitas del piso 5.",
        visibilidadComite: false,
      },
      {
        ...base,
        id: MSG_B_VISIBLE,
        folio: "BZ-1003",
        reportantePersonaId: P_B,
        reportanteNombre: "Bruno Vecino",
        asunto: "Luminaria quemada",
        cuerpo: "La luminaria del acceso vehicular está quemada desde el lunes.",
        visibilidadComite: true,
      },
    ],
  })
}, 30_000)

afterAll(async () => {
  try {
    state.cookie = ""
    await prisma.mensajeBuzonCO.deleteMany({ where: { comunidadId: COM } })
    await prisma.persona.deleteMany({ where: { id: { in: [P_A, P_B] } } })
    await prisma.membresia.deleteMany({
      where: { usuario: { email: { in: Object.values(usuarios) } } },
    })
    await prisma.usuario.deleteMany({ where: { email: { in: Object.values(usuarios) } } })
    await prisma.comunidad.delete({ where: { id: COM } })
  } catch {
    // intencional: limpieza best-effort (la base es descartable)
  }
})

describe("GET /api/co/mensajes-buzon — alcance por rol (S10)", () => {
  it("residente: solo sus propios reportes", async () => {
    await conSesion(usuarios.residenteA, async () => {
      const res = await invocarApi(moduloColeccion(), "GET", "co/mensajes-buzon?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<{ data: Mensaje[]; total: number }>(res)
      expect(j.data.map((m) => m.id)).toEqual([MSG_A_VISIBLE])
      expect(j.total).toBe(1)
    })
  })

  it("comité: solo los mensajes marcados `visibilidadComite`", async () => {
    await conSesion(usuarios.comite, async () => {
      const res = await invocarApi(moduloColeccion(), "GET", "co/mensajes-buzon?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<{ data: Mensaje[]; total: number }>(res)
      const ids = j.data.map((m) => m.id).sort()
      expect(ids).toEqual([MSG_A_VISIBLE, MSG_B_VISIBLE].sort())
      expect(ids).not.toContain(MSG_B_PRIVADO)
    })
  })

  it("administrador: todos los mensajes de la comunidad", async () => {
    await conSesion(usuarios.admin, async () => {
      const res = await invocarApi(moduloColeccion(), "GET", "co/mensajes-buzon?pageSize=100")
      expect(res.status).toBe(200)
      const j = await cuerpoJson<{ data: Mensaje[]; total: number }>(res)
      expect(j.total).toBe(3)
    })
  })
})

describe("GET /api/co/mensajes-buzon/[id] — detalle ajeno → 404 (S10)", () => {
  const detalle = (id: string) =>
    invocarApi(moduloDetalle(), "GET", "co/mensajes-buzon/[id]", { params: { id } })

  it("residente: el mensaje propio se lee", async () => {
    await conSesion(usuarios.residenteA, async () => {
      const res = await detalle(MSG_A_VISIBLE)
      expect(res.status).toBe(200)
      expect((await cuerpoJson<Mensaje>(res)).id).toBe(MSG_A_VISIBLE)
    })
  })

  it("residente: mensaje de otro vecino e inexistente dan el mismo 404", async () => {
    await conSesion(usuarios.residenteA, async () => {
      const ajeno = await detalle(MSG_B_PRIVADO)
      const inexistente = await detalle("co-buzon-no-existe")
      expect(ajeno.status).toBe(404)
      expect(inexistente.status).toBe(404)
      const cuerpoAjeno = await cuerpoJson(ajeno)
      const cuerpoInexistente = await cuerpoJson(inexistente)
      expect(cuerpoAjeno).toEqual({ error: "Registro no encontrado." })
      expect(cuerpoAjeno).toEqual(cuerpoInexistente)
    })
  })

  it("comité: un mensaje no visible para el comité también responde 404", async () => {
    await conSesion(usuarios.comite, async () => {
      expect((await detalle(MSG_B_PRIVADO)).status).toBe(404)
      expect((await detalle(MSG_B_VISIBLE)).status).toBe(200)
    })
  })
})

describe("POST /api/co/mensajes-buzon — el reportante sale de la sesión (S10)", () => {
  const cuerpo = {
    id: "co-buzon-msg-nuevo",
    folio: "BZ-2001",
    clasificacion: "sugerencia",
    // Datos que el cliente NO manda o manda falsificados: se ignoran.
    reportantePersonaId: P_B,
    reportanteNombre: "Bruno Vecino (suplantado)",
    asunto: "Banca de la plaza",
    cuerpo: "Reponer la banca rota de la plaza.",
    visibilidadComite: false,
    fechaIngreso: "2026-10-23",
    estado: "recibido",
    respuestas: [],
  }

  it("residente: `reportantePersonaId`/`reportanteNombre` derivados de la sesión", async () => {
    try {
      await conSesion(usuarios.residenteA, async () => {
        const res = await invocarApi(moduloColeccion(), "POST", "co/mensajes-buzon", {
          body: cuerpo,
        })
        expect(res.status).toBe(201)
        const guardado = await prisma.mensajeBuzonCO.findUnique({
          where: { id: cuerpo.id },
        })
        expect(guardado?.reportantePersonaId).toBe(P_A)
        expect(guardado?.reportanteNombre).toBe("Ana Residente")
        expect(guardado?.comunidadId).toBe(COM)
      })
    } finally {
      await prisma.mensajeBuzonCO.deleteMany({ where: { id: cuerpo.id } })
    }
  })

  it("residente: el mensaje creado aparece en su propia lista", async () => {
    try {
      await conSesion(usuarios.residenteA, async () => {
        const creado = await invocarApi(moduloColeccion(), "POST", "co/mensajes-buzon", {
          body: cuerpo,
        })
        expect(creado.status).toBe(201)
        const lista = await invocarApi(moduloColeccion(), "GET", "co/mensajes-buzon?pageSize=100")
        const j = await cuerpoJson<{ data: Mensaje[] }>(lista)
        expect(j.data.map((m) => m.id)).toContain(cuerpo.id)
      })
    } finally {
      await prisma.mensajeBuzonCO.deleteMany({ where: { id: cuerpo.id } })
    }
  })
})
