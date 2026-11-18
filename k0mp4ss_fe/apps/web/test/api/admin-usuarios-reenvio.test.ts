/**
 * @vitest-environment node
 *
 * F42 · T2 — reenvío de la invitación de acceso (`POST /api/admin/usuarios/invitacion`).
 *
 * Qué fija este archivo:
 *
 *   1. El reenvío emite una invitación NUEVA y deja la anterior inservible en el
 *      mismo acto: la vieja queda vencida en el instante del reenvío y su token
 *      deja de definir contraseña, mientras la nueva sí la define. El criterio es
 *      del owner: dos enlaces vivos para la misma cuenta son dos puertas.
 *   2. Sólo un administrador de la comunidad reenvía. El comité recibe 403 con el
 *      mismo texto que el resto de la ruta, y no se emite ni se vence nada.
 *   3. Sobre una cuenta que ya definió su contraseña no se reenvía: 409 con texto
 *      literal, sin invitación nueva. El enlace existe para DEFINIR la contraseña;
 *      si ya la tiene, no hay nada que reenviar.
 *   4. La cuenta de otra comunidad responde el mismo 404 que el PATCH: no se
 *      cuenta qué existe fuera del tenant de la sesión.
 *   5. La respuesta no trae token, ni hash, ni contraseña (S4).
 *
 * COSTURA DEL TOKEN. La respuesta HTTP nunca puede traer el token —el
 * administrador invita, no conoce la contraseña—, así que este test envuelve
 * `crearInvitacionDeAcceso` para quedarse con el token en claro que la ruta
 * emite. El envoltorio llama a la función REAL: no simula la emisión ni toca la
 * base por atrás; sólo observa el secreto que va a transportar F43. Sin esa
 * costura no habría forma de probar que el enlace nuevo sirve y el viejo no.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

/** Token en claro de la última invitación emitida por la ruta en este proceso. */
const captura = vi.hoisted(() => ({ token: "" }))

vi.mock("@/lib/invitacion-acceso", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/invitacion-acceso")>()
  return {
    ...real,
    crearInvitacionDeAcceso: async (
      datos: Parameters<typeof real.crearInvitacionDeAcceso>[0]
    ) => {
      const resultado = await real.crearInvitacionDeAcceso(datos)
      captura.token = resultado.token
      return resultado
    },
  }
})

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
const SFX = Date.now().toString(36)
const comunidadA = `reenvio-comunidad-a-${SFX}`
const comunidadB = `reenvio-comunidad-b-${SFX}`
const emailAdmin = `reenvio-admin-${SFX}@test.cl`
const emailComite = `reenvio-comite-${SFX}@test.cl`
const emailPersonaA = `reenvio-persona-a-${SFX}@test.cl`
const emailPersonaB = `reenvio-persona-b-${SFX}@test.cl`
const emailPersonaC = `reenvio-persona-c-${SFX}@test.cl`
const PASSWORD = "ClaveSegura123"

/** Rechazo único del canje: idéntico para token inventado, vencido y usado. */
const INVITACION_INVALIDA = "La invitación no es válida o ya venció."
/** Mismo rechazo que el resto de la ruta de usuarios para quien no administra. */
const PERMISO_DENEGADO = "Permiso denegado. Requiere rol administrador."
/** El reenvío no aplica a una cuenta que ya tiene contraseña. */
const YA_DEFINIO_CONTRASENA =
  "La cuenta ya definió su contraseña: la invitación no se puede reenviar."
/** Una cuenta inactiva no entra: emitir el enlace sería prometer un acceso que el login niega. */
const CUENTA_INACTIVA =
  "La cuenta está inactiva: activala antes de reenviar la invitación."

describe("F42 T2 — reenvío de la invitación de acceso", () => {
  let adminId = ""
  let comiteId = ""
  let personaAId = ""
  let personaBId = ""
  let personaCId = ""

  async function crearPersona(id: string, comunidadId: string, email: string) {
    await prisma.persona.upsert({
      where: { id },
      update: {},
      create: {
        id,
        comunidadId,
        rut: `22.222.222-${id.slice(-1)}`,
        nombreCompleto: `Persona ${id}`,
        nombres: "Persona",
        apellidos: id,
        email,
        telefonoMovil: "+56922222222",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: [],
      },
    })
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    process.env.NEXT_PUBLIC_APP_ENV = "development"

    for (const c of [
      { id: comunidadA, nombre: "Comunidad Reenvío A", slug: `reenvio-a-${SFX}` },
      { id: comunidadB, nombre: "Comunidad Reenvío B", slug: `reenvio-b-${SFX}` },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    for (const u of [
      { id: `usuario-reenvio-admin-${SFX}`, email: emailAdmin },
      { id: `usuario-reenvio-comite-${SFX}`, email: emailComite },
    ]) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: { activo: true },
        create: { ...u, activo: true },
      })
    }
    const admin = await prisma.usuario.findUnique({ where: { email: emailAdmin } })
    const comite = await prisma.usuario.findUnique({ where: { email: emailComite } })
    if (!admin || !comite) throw new Error("fixture: usuarios de sesión no creados")
    adminId = admin.id
    comiteId = comite.id

    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: [adminId, comiteId] } },
    })
    await prisma.membresia.create({
      data: { usuarioId: adminId, comunidadId: comunidadA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: comiteId, comunidadId: comunidadA, rol: "comite" },
    })

    personaAId = `persona-reenvio-a-${SFX}`
    personaBId = `persona-reenvio-b-${SFX}`
    personaCId = `persona-reenvio-c-${SFX}`
    await crearPersona(personaAId, comunidadA, emailPersonaA)
    await crearPersona(personaBId, comunidadA, emailPersonaB)
    await crearPersona(personaCId, comunidadB, emailPersonaC)
  }, 60_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    try {
      await prisma.usuario.deleteMany({
        where: { email: { contains: `-${SFX}@test.cl` } },
      })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: [adminId, comiteId] } },
      })
      await prisma.usuario.deleteMany({
        where: { email: { in: [emailAdmin, emailComite] } },
      })
      await prisma.persona.deleteMany({
        where: { id: { in: [personaAId, personaBId, personaCId] } },
      })
      await prisma.comunidad.deleteMany({
        where: { id: { in: [comunidadA, comunidadB] } },
      })
    } catch {
      // intencional: limpieza best-effort
    }
  })

  beforeEach(() => {
    captura.token = ""
  })

  async function conSesion(email: string): Promise<void> {
    const usuario = await prisma.usuario.findUnique({ where: { email } })
    if (!usuario) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
  }

  function requestJson(url: string, body: unknown): NextRequest {
    return new NextRequest(url, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "http",
        ...(state.cookie ? { cookie: state.cookie } : {}),
      },
    })
  }

  /** POST /api/admin/usuarios — el alta; deja la cuenta con su primera invitación. */
  async function alta(
    body: unknown,
    opts: { comunidadId?: string } = {}
  ): Promise<{ res: Response; token: string }> {
    const { POST } = await import("@/app/api/admin/usuarios/route")
    const cid = opts.comunidadId ?? comunidadA
    captura.token = ""
    const res = await POST(
      requestJson(
        `http://localhost/api/admin/usuarios?comunidadId=${encodeURIComponent(cid)}`,
        body
      )
    )
    return { res, token: captura.token }
  }

  /** POST /api/admin/usuarios/invitacion — el reenvío que este archivo prueba. */
  async function reenviar(
    body: unknown,
    opts: { comunidadId?: string } = {}
  ): Promise<{ res: Response; token: string }> {
    const { POST } = await import("@/app/api/admin/usuarios/invitacion/route")
    if (typeof POST !== "function") {
      throw new Error("POST /api/admin/usuarios/invitacion no existe en la ruta")
    }
    const cid = opts.comunidadId ?? comunidadA
    captura.token = ""
    const res = await POST(
      requestJson(
        `http://localhost/api/admin/usuarios/invitacion?comunidadId=${encodeURIComponent(cid)}`,
        body
      )
    )
    return { res, token: captura.token }
  }

  /** POST /api/auth/invitacion — el canje público: define la contraseña. */
  async function canjear(token: string, password: string = PASSWORD): Promise<Response> {
    const { POST } = await import("@/app/api/auth/invitacion/route")
    state.cookie = ""
    return POST(
      requestJson("http://localhost/api/auth/invitacion", { token, password })
    )
  }

  async function cuentaDe(email: string) {
    const usuario = await prisma.usuario.findUnique({ where: { email } })
    if (!usuario) throw new Error(`fixture: cuenta no creada para ${email}`)
    return usuario
  }

  it("201: emite una invitación nueva y la anterior deja de definir contraseña", async () => {
    await conSesion(emailAdmin)
    const altaA = await alta({ personaId: personaAId, rol: "residente" })
    expect(altaA.res.status).toBe(201)
    expect(altaA.token).not.toBe("")
    const vieja = await prisma.invitacionAcceso.findFirst({
      where: { tokenHash: (await import("@/lib/invitacion-acceso")).hashearTokenInvitacion(altaA.token) },
    })
    if (!vieja) throw new Error("fixture: la invitación del alta no quedó en la base")

    const reenvio = await reenviar({ usuarioId: (await cuentaDe(emailPersonaA)).id })
    const texto = await reenvio.res.text()
    expect(reenvio.res.status).toBe(201)

    // S4: la respuesta no trae el secreto ni lo que permitiría reconstruirlo.
    expect(texto.toLowerCase()).not.toContain("token")
    expect(texto).not.toMatch(/[a-f0-9]{64}/)
    const cuerpo = JSON.parse(texto) as {
      ok: boolean
      invitacion: Record<string, unknown>
      invalidadas: number
    }
    expect(Object.keys(cuerpo.invitacion).sort()).toEqual([
      "creadoEn",
      "estado",
      "expiraEn",
      "id",
      "usadoEn",
    ])
    expect(cuerpo.invitacion.estado).toBe("pendiente")
    expect(cuerpo.invitacion.id).not.toBe(vieja.id)
    expect(cuerpo.invalidadas).toBe(1)
    expect(reenvio.token).not.toBe("")
    expect(reenvio.token).not.toBe(altaA.token)

    // La anterior quedó vencida en el instante del reenvío: no sirve en absoluto.
    const viejaDespues = await prisma.invitacionAcceso.findUnique({
      where: { id: vieja.id },
    })
    expect(viejaDespues?.usadoEn).toBeNull()
    expect(viejaDespues!.expiraEn.getTime()).toBeLessThanOrEqual(Date.now())
    const { estadoInvitacion } = await import("@/lib/invitacion-acceso")
    expect(estadoInvitacion(viejaDespues!)).toBe("vencida")

    const canjeViejo = await canjear(altaA.token)
    expect(canjeViejo.status).toBe(400)
    expect(await canjeViejo.json()).toEqual({ error: INVITACION_INVALIDA })
    expect((await cuentaDe(emailPersonaA)).passwordHash).toBeNull()

    // La nueva sí: el reenvío reactiva el camino de entrada de esa cuenta.
    const canjeNuevo = await canjear(reenvio.token)
    expect(canjeNuevo.status).toBe(200)
    const cuenta = await cuentaDe(emailPersonaA)
    expect(cuenta.passwordHash).not.toBeNull()
    expect(cuenta.activo).toBe(true)

    // S5: el reenvío deja su rastro con el actor de la sesión.
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { referenciaId: cuenta.id, tipoAccion: "invitacion_reenviada" },
    })
    expect(evento).not.toBeNull()
    expect(evento!.usuario).toBe(adminId)
    expect(evento!.comunidadId).toBe(comunidadA)
  }, 60_000)

  it("403: el comité no reenvía, y no se emite ni se vence ninguna invitación", async () => {
    await conSesion(emailAdmin)
    const altaB = await alta({ personaId: personaBId, rol: "residente" })
    expect(altaB.res.status).toBe(201)
    const usuario = await cuentaDe(emailPersonaB)
    const antes = await prisma.invitacionAcceso.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { createdAt: "asc" },
    })
    expect(antes).toHaveLength(1)

    await conSesion(emailComite)
    const reenvio = await reenviar({ usuarioId: usuario.id })
    expect(reenvio.res.status).toBe(403)
    expect(await reenvio.res.json()).toEqual({ error: PERMISO_DENEGADO })
    expect(reenvio.token).toBe("")

    const despues = await prisma.invitacionAcceso.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { createdAt: "asc" },
    })
    expect(despues).toHaveLength(1)
    expect(despues[0]!.id).toBe(antes[0]!.id)
    expect(despues[0]!.expiraEn.getTime()).toBe(antes[0]!.expiraEn.getTime())
    expect((await cuentaDe(emailPersonaB)).passwordHash).toBeNull()
  }, 60_000)

  it("409: sobre una cuenta que ya definió su contraseña no se emite otra invitación", async () => {
    await conSesion(emailAdmin)
    const personaReenvio = `persona-reenvio-d-${SFX}`
    const emailPersonaReenvio = `reenvio-persona-d-${SFX}@test.cl`
    await crearPersona(personaReenvio, comunidadA, emailPersonaReenvio)
    try {
      const altaCuenta = await alta({ personaId: personaReenvio, rol: "residente" })
      expect(altaCuenta.res.status).toBe(201)
      const canje = await canjear(altaCuenta.token)
      expect(canje.status).toBe(200)
      const usuario = await cuentaDe(emailPersonaReenvio)
      const ahora = new Date()
      const antes = await prisma.invitacionAcceso.count({
        where: { usuarioId: usuario.id },
      })

      // El canje es público y no lleva cookie: la sesión se vuelve a montar.
      await conSesion(emailAdmin)
      const reenvio = await reenviar({ usuarioId: usuario.id })
      expect(reenvio.res.status).toBe(409)
      expect(await reenvio.res.json()).toEqual({ error: YA_DEFINIO_CONTRASENA })
      expect(reenvio.token).toBe("")

      // Nada nuevo ni vencido por atrás: el acto no ocurrió.
      expect(
        await prisma.invitacionAcceso.count({ where: { usuarioId: usuario.id } })
      ).toBe(antes)
      const vigentes = await prisma.invitacionAcceso.count({
        where: { usuarioId: usuario.id, usadoEn: null, expiraEn: { gt: ahora } },
      })
      expect(vigentes).toBe(0)
    } finally {
      await prisma.usuario.deleteMany({ where: { email: emailPersonaReenvio } })
      await prisma.persona.deleteMany({ where: { id: personaReenvio } })
    }
  }, 60_000)

  it("409: una cuenta inactiva no recibe una invitación que el login va a rechazar", async () => {
    await conSesion(emailAdmin)
    const personaInactiva = `persona-reenvio-e-${SFX}`
    const emailInactiva = `reenvio-persona-e-${SFX}@test.cl`
    await crearPersona(personaInactiva, comunidadA, emailInactiva)
    try {
      const altaCuenta = await alta({ personaId: personaInactiva, rol: "residente" })
      expect(altaCuenta.res.status).toBe(201)
      const usuario = await cuentaDe(emailInactiva)
      await prisma.usuario.update({ where: { id: usuario.id }, data: { activo: false } })

      const reenvio = await reenviar({ usuarioId: usuario.id })
      expect(reenvio.res.status).toBe(409)
      expect(await reenvio.res.json()).toEqual({ error: CUENTA_INACTIVA })
      expect(reenvio.token).toBe("")
      expect(
        await prisma.invitacionAcceso.count({ where: { usuarioId: usuario.id } })
      ).toBe(1)
    } finally {
      await prisma.usuario.deleteMany({ where: { email: emailInactiva } })
      await prisma.persona.deleteMany({ where: { id: personaInactiva } })
    }
  }, 60_000)

  it("404: la cuenta de otra comunidad no se toca y no se distingue de una inexistente", async () => {
    const ajena = await prisma.usuario.create({
      data: {
        email: `reenvio-ajena-${SFX}@test.cl`,
        personaId: personaCId,
        activo: true,
      },
    })
    await prisma.membresia.create({
      data: { usuarioId: ajena.id, comunidadId: comunidadB, rol: "residente" },
    })
    try {
      await conSesion(emailAdmin)
      const reenvio = await reenviar({ usuarioId: ajena.id })
      expect(reenvio.res.status).toBe(404)
      expect(await reenvio.res.json()).toEqual({
        error: "Usuario no pertenece a la comunidad",
      })
      expect(reenvio.token).toBe("")
      expect(
        await prisma.invitacionAcceso.count({ where: { usuarioId: ajena.id } })
      ).toBe(0)
    } finally {
      await prisma.usuario.deleteMany({ where: { id: ajena.id } })
    }
  }, 60_000)
})
