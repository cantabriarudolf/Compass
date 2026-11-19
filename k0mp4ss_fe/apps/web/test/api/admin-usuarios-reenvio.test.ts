/**
 * @vitest-environment node
 *
 * F42 · T2 — reenvío de la invitación de acceso y revelación única del enlace (L4).
 *
 * Qué fija este archivo:
 *
 *   1. El reenvío emite una invitación NUEVA, revela su enlace completo una sola
 *      vez y deja la anterior inservible en el mismo acto: el token que devolvió el
 *      alta queda vencido y deja de definir contraseña, mientras el que devuelve
 *      el reenvío sí la define. El criterio es del owner: dos enlaces vivos para
 *      la misma cuenta son dos puertas.
 *   2. Sólo un administrador de la comunidad reenvía. El comité recibe 403 con el
 *      mismo texto que el resto de la ruta, sin enlace y sin emitir ni vencer nada.
 *   3. Sobre una cuenta que ya definió su contraseña no se reenvía: 409 con texto
 *      literal, sin enlace y sin invitación nueva. El enlace existe para DEFINIR
 *      la contraseña; si ya la tiene, no hay nada que reenviar.
 *   4. La cuenta de otra comunidad responde el mismo 404 que el PATCH: no se
 *      cuenta qué existe fuera del tenant de la sesión.
 *   5. Un rechazo (403, 404 o 409) no devuelve ningún enlace: no hay invitación
 *      que entregar y la respuesta es sólo su texto de error.
 *
 * EL ENLACE SE REVELA UNA VEZ (L4). La excepción angosta y declarada a S4 es la
 * que evita que el flujo muera en la pantalla: quien crea o reenvía recibe el
 * enlace completo en ESA respuesta, al administrador autenticado de la comunidad,
 * y nunca más — no se guarda en claro ni lo devuelve una lectura posterior. Por
 * eso acá no hay costura: el token se lee del `enlace` de la respuesta, que es
 * exactamente lo que la administración entrega, y el canje lo consume por la
 * misma ruta pública de siempre. Que el listado no lo traiga lo fija, del lado
 * del GET, `test/api/admin-usuarios-invitacion.test.ts`.
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

  /** Token en claro del enlace que revela una escritura (`/invitacion?token=…`). */
  function tokenDe(enlace: string | undefined): string {
    if (!enlace) return ""
    return new URL(enlace).searchParams.get("token") ?? ""
  }

  interface CuerpoEscritura {
    ok?: boolean
    enlace?: string
    invitacion?: {
      id: string
      estado: string
      expiraEn: string
      usadoEn: string | null
      creadoEn: string
    }
    invalidadas?: number
    error?: string
  }

  /** Una escritura ya leída: cuerpo, enlace revelado (si lo hay) y su token. */
  interface RespuestaEscritura {
    res: Response
    cuerpo: CuerpoEscritura
    enlace: string
    token: string
  }

  async function leerEscritura(res: Response): Promise<RespuestaEscritura> {
    const cuerpo = (await res.json()) as CuerpoEscritura
    const enlace = typeof cuerpo.enlace === "string" ? cuerpo.enlace : ""
    return { res, cuerpo, enlace, token: tokenDe(enlace) }
  }

  /** POST /api/admin/usuarios — el alta; revela el enlace de la primera invitación. */
  async function alta(
    body: unknown,
    opts: { comunidadId?: string } = {}
  ): Promise<RespuestaEscritura> {
    const { POST } = await import("@/app/api/admin/usuarios/route")
    const cid = opts.comunidadId ?? comunidadA
    return leerEscritura(
      await POST(
        requestJson(
          `http://localhost/api/admin/usuarios?comunidadId=${encodeURIComponent(cid)}`,
          body
        )
      )
    )
  }

  /** POST /api/admin/usuarios/invitacion — el reenvío que este archivo prueba. */
  async function reenviar(
    body: unknown,
    opts: { comunidadId?: string } = {}
  ): Promise<RespuestaEscritura> {
    const { POST } = await import("@/app/api/admin/usuarios/invitacion/route")
    if (typeof POST !== "function") {
      throw new Error("POST /api/admin/usuarios/invitacion no existe en la ruta")
    }
    const cid = opts.comunidadId ?? comunidadA
    return leerEscritura(
      await POST(
        requestJson(
          `http://localhost/api/admin/usuarios/invitacion?comunidadId=${encodeURIComponent(cid)}`,
          body
        )
      )
    )
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

  it("201: emite una invitación nueva, revela su enlace una sola vez y la anterior deja de definir contraseña", async () => {
    await conSesion(emailAdmin)
    const altaA = await alta({ personaId: personaAId, rol: "residente" })
    expect(altaA.res.status).toBe(201)
    expect(altaA.token).not.toBe("")
    const { hashearTokenInvitacion } = await import("@/lib/invitacion-acceso")
    const vieja = await prisma.invitacionAcceso.findFirst({
      where: { tokenHash: hashearTokenInvitacion(altaA.token) },
    })
    if (!vieja) throw new Error("fixture: la invitación del alta no quedó en la base")

    const reenvio = await reenviar({ usuarioId: (await cuentaDe(emailPersonaA)).id })
    expect(reenvio.res.status).toBe(201)

    // L4: la respuesta del reenvío revela el enlace nuevo — es lo que la
    // administración entrega — y es distinto del que reveló el alta.
    expect(new URL(reenvio.enlace).pathname).toBe("/invitacion")
    expect(reenvio.token).not.toBe("")
    expect(reenvio.token).not.toBe(altaA.token)
    expect(reenvio.enlace).not.toBe(altaA.enlace)

    // Nada más del secreto sale por la respuesta: ni el hash ni la contraseña.
    expect(JSON.stringify(reenvio.cuerpo)).not.toMatch(/[a-f0-9]{64}/)
    expect(JSON.stringify(reenvio.cuerpo).toLowerCase()).not.toContain("passwordhash")

    const cuerpo = reenvio.cuerpo
    const invitacionNueva = cuerpo.invitacion!
    expect(Object.keys(invitacionNueva).sort()).toEqual([
      "creadoEn",
      "envio",
      "estado",
      "expiraEn",
      "id",
      "usadoEn",
    ])
    expect(invitacionNueva.estado).toBe("pendiente")
    expect(invitacionNueva.id).not.toBe(vieja.id)
    expect(cuerpo.invalidadas).toBe(1)

    // El token revelado es el de la fila nueva: el enlace entregado abre esa fila.
    const nueva = await prisma.invitacionAcceso.findUnique({
      where: { id: invitacionNueva.id },
    })
    expect(nueva!.tokenHash).toBe(hashearTokenInvitacion(reenvio.token))

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

  it("403: el comité no reenvía, no se emite ni se vence nada, y no hay enlace", async () => {
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
    expect(reenvio.cuerpo).toEqual({ error: PERMISO_DENEGADO })
    // Un rechazo no revela ningún enlace: no hubo invitación que entregar.
    expect(reenvio.enlace).toBe("")
    expect(reenvio.cuerpo).not.toHaveProperty("enlace")

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
      expect(reenvio.cuerpo).toEqual({ error: YA_DEFINIO_CONTRASENA })
      // Sin invitación nueva no hay enlace que revelar.
      expect(reenvio.cuerpo).not.toHaveProperty("enlace")
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
      expect(reenvio.cuerpo).toEqual({ error: CUENTA_INACTIVA })
      expect(reenvio.cuerpo).not.toHaveProperty("enlace")
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
      expect(reenvio.cuerpo).toEqual({
        error: "Usuario no pertenece a la comunidad",
      })
      expect(reenvio.cuerpo).not.toHaveProperty("enlace")
      expect(reenvio.token).toBe("")
      expect(
        await prisma.invitacionAcceso.count({ where: { usuarioId: ajena.id } })
      ).toBe(0)
    } finally {
      await prisma.usuario.deleteMany({ where: { id: ajena.id } })
    }
  }, 60_000)
})
