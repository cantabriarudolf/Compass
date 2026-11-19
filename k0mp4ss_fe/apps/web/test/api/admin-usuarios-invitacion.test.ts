/**
 * @vitest-environment node
 *
 * F42 · T1 — invitación de acceso (S4) y alta de cuentas (S1/S3).
 *
 * EL ENLACE SE REVELA UNA VEZ (L4). S4 prohíbe que el administrador conozca la
 * contraseña, pero el correo es F43 y sin enlace el alta dejaba el flujo muerto:
 * la respuesta del alta revela el enlace completo una sola vez, al administrador
 * autenticado que creó la cuenta, y ninguna lectura posterior lo devuelve. Este
 * archivo lo fija por los dos lados: el `enlace` del 201 canjea de verdad y su
 * token coincide con el hash persistido, mientras el GET del listado no trae ni
 * ese token ni la palabra que lo nombra. El caso de un-solo-uso se maneja con el
 * enlace del alta, que es el que la administración entrega; `emitirToken` queda
 * sólo para los casos que necesitan una fila de invitación que puedan envejecer
 * (vencida) o un token ajeno (inventado).
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
const comunidadA = `inv-comunidad-a-${SFX}`
const comunidadB = `inv-comunidad-b-${SFX}`
const emailAdmin = `inv-admin-${SFX}@test.cl`
const emailComite = `inv-comite-${SFX}@test.cl`
const emailPersonaA = `inv-persona-a-${SFX}@test.cl`
const emailPersonaB = `inv-persona-b-${SFX}@test.cl`
const emailPersonaC = `inv-persona-c-${SFX}@test.cl`
const emailPersonaD = `inv-persona-d-${SFX}@test.cl`
const emailPersonaE = `inv-persona-e-${SFX}@test.cl`
const emailPersonaF = `inv-persona-f-${SFX}@test.cl`
const emailPersonaG = `inv-persona-g-${SFX}@test.cl`
const emailPersonaH = `inv-persona-h-${SFX}@test.cl`
const emailPersonaI = `inv-persona-i-${SFX}@test.cl`
const PASSWORD = "ClaveSegura123"
const PASSWORD_OTRA = "OtraClave123"

/** Mensaje único de rechazo del canje: idéntico para inválido, vencido y usado. */
const INVITACION_INVALIDA = "La invitación no es válida o ya venció."
/** Mensaje de la política de contraseñas que ya existe en el repo. */
const PASSWORD_INVALIDA =
  "La contraseña no cumple con los requisitos de seguridad."

describe("F42 T1 — alta con invitación y definición de contraseña", () => {
  let adminId = ""
  let comiteId = ""
  let personaAId = ""
  let personaBId = ""
  let personaCId = ""
  let personaDId = ""
  let personaEId = ""
  let personaFId = ""
  let personaGId = ""
  let personaHId = ""
  let personaIId = ""

  async function crearPersona(id: string, comunidadId: string, email: string) {
    await prisma.persona.upsert({
      where: { id },
      update: {},
      create: {
        id,
        comunidadId,
        rut: `11.111.111-${id.slice(-1)}`,
        nombreCompleto: `Persona ${id}`,
        nombres: "Persona",
        apellidos: id,
        email,
        telefonoMovil: "+56911111111",
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
      { id: comunidadA, nombre: "Comunidad Invitación A", slug: `inv-a-${SFX}` },
      { id: comunidadB, nombre: "Comunidad Invitación B", slug: `inv-b-${SFX}` },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    for (const u of [
      { id: `usuario-inv-admin-${SFX}`, email: emailAdmin },
      { id: `usuario-inv-comite-${SFX}`, email: emailComite },
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

    personaAId = `persona-inv-a-${SFX}`
    personaBId = `persona-inv-b-${SFX}`
    personaCId = `persona-inv-c-${SFX}`
    personaDId = `persona-inv-d-${SFX}`
    personaEId = `persona-inv-e-${SFX}`
    personaFId = `persona-inv-f-${SFX}`
    personaGId = `persona-inv-g-${SFX}`
    personaHId = `persona-inv-h-${SFX}`
    personaIId = `persona-inv-i-${SFX}`
    await crearPersona(personaAId, comunidadA, emailPersonaA)
    await crearPersona(personaBId, comunidadB, emailPersonaB)
    await crearPersona(personaCId, comunidadA, emailPersonaC)
    await crearPersona(personaDId, comunidadA, emailPersonaD)
    await crearPersona(personaEId, comunidadA, emailPersonaE)
    await crearPersona(personaFId, comunidadA, emailPersonaF)
    await crearPersona(personaGId, comunidadA, emailPersonaG)
    await crearPersona(personaHId, comunidadA, emailPersonaH)
    await crearPersona(personaIId, comunidadA, emailPersonaI)
  }, 60_000)

  afterAll(async () => {
    state.cookie = ""
    delete process.env.NEXT_PUBLIC_APP_ENV
    try {
      // Las cuentas creadas por el alta llevan el sufijo en el correo; la FK en
      // cascada se lleva membresías, invitaciones y eventos de auditoría.
      await prisma.usuario.deleteMany({ where: { email: { contains: `-${SFX}@test.cl` } } })
      await prisma.membresia.deleteMany({
        where: { usuarioId: { in: [adminId, comiteId] } },
      })
      await prisma.usuario.deleteMany({
        where: { email: { in: [emailAdmin, emailComite] } },
      })
      await prisma.persona.deleteMany({
        where: {
          id: {
            in: [
              personaAId,
              personaBId,
              personaCId,
              personaDId,
              personaEId,
              personaFId,
              personaGId,
              personaHId,
              personaIId,
            ],
          },
        },
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

  /** POST /api/admin/usuarios (el alta). Por defecto, la comunidad de la sesión. */
  async function alta(
    body: unknown,
    opts: { comunidadId?: string } = {}
  ): Promise<Response> {
    const { POST } = await import("@/app/api/admin/usuarios/route")
    if (typeof POST !== "function") {
      throw new Error("POST /api/admin/usuarios no existe en la ruta")
    }
    const cid = opts.comunidadId ?? comunidadA
    return POST(
      requestJson(
        `http://localhost/api/admin/usuarios?comunidadId=${encodeURIComponent(cid)}`,
        body
      )
    )
  }

  /** POST /api/auth/invitacion (el canje: define la contraseña). Sin sesión. */
  async function canjear(body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/auth/invitacion/route")
    if (typeof POST !== "function") {
      throw new Error("POST /api/auth/invitacion no existe en la ruta")
    }
    state.cookie = ""
    return POST(requestJson("http://localhost/api/auth/invitacion", body))
  }

  /** GET /api/admin/usuarios?comunidadId=… (el listado que alimenta la pantalla). */
  async function listar(comunidadId: string = comunidadA): Promise<Response> {
    const { GET } = await import("@/app/api/admin/usuarios/route")
    return GET(
      new NextRequest(
        `http://localhost/api/admin/usuarios?comunidadId=${encodeURIComponent(comunidadId)}`,
        {
          headers: {
            "x-forwarded-proto": "http",
            ...(state.cookie ? { cookie: state.cookie } : {}),
          },
        }
      )
    )
  }

  /** Token en claro del enlace que revela una escritura (`/invitacion?token=…`). */
  function tokenDe(enlace: string): string {
    return new URL(enlace).searchParams.get("token") ?? ""
  }

  async function emitirToken(usuarioId: string): Promise<{ token: string; invitacionId: string }> {
    const mod = await import("@/lib/invitacion-acceso")
    if (typeof mod.crearInvitacionDeAcceso !== "function") {
      throw new Error("crearInvitacionDeAcceso no existe en lib/invitacion-acceso")
    }
    const { token, invitacion } = await mod.crearInvitacionDeAcceso({
      usuarioId,
      comunidadId: comunidadA,
      creadoPor: adminId,
    })
    return { token, invitacionId: invitacion.id }
  }

  describe("POST /api/admin/usuarios — el alta emite la invitación (S1/S3/S4)", () => {
    it("201: cuenta + membresía + invitación pendiente, y revela el enlace una sola vez sin hash", async () => {
      await conSesion(emailAdmin)
      const res = await alta({ personaId: personaAId, rol: "Residente" })
      const texto = await res.text()
      expect(res.status).toBe(201)

      const cuerpo = JSON.parse(texto) as {
        ok: boolean
        usuario: { id: string; email: string; personaId: string | null; activo: boolean }
        membresia: { comunidadId: string; rol: string }
        invitacion: Record<string, unknown>
        enlace: string
      }

      // L4: el enlace completo se revela acá y sólo acá, al administrador que
      // creó la cuenta. Consume el contrato de la página pública
      // (`/invitacion?token=…`), el mismo del script del primer arranque.
      const enlace = new URL(cuerpo.enlace)
      expect(enlace.origin).toBe("http://localhost")
      expect(enlace.pathname).toBe("/invitacion")
      const token = tokenDe(cuerpo.enlace)
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)

      // Nada más del secreto sale por la API: ni el hash ni `passwordHash`.
      expect(texto).not.toMatch(/[a-f0-9]{64}/)
      expect(texto.toLowerCase()).not.toContain("passwordhash")
      expect(Object.keys(cuerpo.invitacion).sort()).toEqual([
        "creadoEn",
        "envio",
        "estado",
        "expiraEn",
        "id",
        "usadoEn",
      ])
      expect(cuerpo.invitacion.estado).toBe("pendiente")
      expect(cuerpo.invitacion.usadoEn).toBeNull()
      expect(new Date(String(cuerpo.invitacion.expiraEn)).getTime()).toBeGreaterThan(
        Date.now()
      )
      expect(cuerpo.usuario.personaId).toBe(personaAId)
      expect(cuerpo.usuario.email).toBe(emailPersonaA)
      expect(cuerpo.membresia.rol).toBe("residente")

      const usuario = await prisma.usuario.findUnique({ where: { email: emailPersonaA } })
      expect(usuario).not.toBeNull()
      expect(usuario!.passwordHash).toBeNull()
      expect(usuario!.activo).toBe(true)
      expect(usuario!.personaId).toBe(personaAId)

      const membresia = await prisma.membresia.findFirst({
        where: { usuarioId: usuario!.id, comunidadId: comunidadA },
      })
      expect(membresia?.rol).toBe("residente")

      const invitacion = await prisma.invitacionAcceso.findFirst({
        where: { usuarioId: usuario!.id },
      })
      expect(invitacion).not.toBeNull()
      expect(invitacion!.usadoEn).toBeNull()
      expect(invitacion!.creadoPor).toBe(adminId)
      expect(invitacion!.comunidadId).toBe(comunidadA)
      expect(invitacion!.tokenHash).toMatch(/^[a-f0-9]{64}$/)
      expect(invitacion!.expiraEn.getTime()).toBeGreaterThan(Date.now())
      // El token revelado es el de ESTA invitación: el enlace entregado abre la fila.
      expect(invitacion!.tokenHash).toBe(
        (await import("@/lib/invitacion-acceso")).hashearTokenInvitacion(token)
      )

      // S5: el alta deja su rastro con el actor de la sesión.
      const evento = await prisma.eventoAuditoria.findFirst({
        where: { referenciaId: usuario!.id, tipoAccion: "cuenta_creada" },
      })
      expect(evento).not.toBeNull()
      expect(evento!.usuario).toBe(adminId)
      expect(evento!.comunidadId).toBe(comunidadA)
    })

    it("403 cuando quien crea no es administrador, y no deja cuenta ni invitación", async () => {
      await conSesion(emailComite)
      const res = await alta({ personaId: personaCId, rol: "residente" })
      expect(res.status).toBe(403)
      const cuerpo = (await res.json()) as Record<string, unknown>
      expect(cuerpo).toEqual({ error: "Permiso denegado. Requiere rol administrador." })
      // Un rechazo no revela ningún enlace: no hubo invitación que entregar.
      expect(cuerpo).not.toHaveProperty("enlace")

      expect(await prisma.usuario.findUnique({ where: { email: emailPersonaC } })).toBeNull()
      const invitaciones = await prisma.invitacionAcceso.count({
        where: { comunidadId: comunidadA, creadoPor: comiteId },
      })
      expect(invitaciones).toBe(0)
    })

    it("404 cuando la persona no es de la comunidad de la sesión (y no distingue inexistente de ajena)", async () => {
      await conSesion(emailAdmin)

      const ajena = await alta({ personaId: personaBId, rol: "residente" })
      expect(ajena.status).toBe(404)
      const errorAjena = (await ajena.json()) as { error: string }
      expect(errorAjena.error).toBe("Persona no encontrada en la comunidad.")

      const inexistente = await alta({ personaId: `persona-fantasma-${SFX}`, rol: "residente" })
      expect(inexistente.status).toBe(404)
      expect((await inexistente.json()) as { error: string }).toEqual(errorAjena)

      expect(await prisma.usuario.findUnique({ where: { email: emailPersonaB } })).toBeNull()
    })

    it("400 con rol desconocido y no crea la cuenta", async () => {
      await conSesion(emailAdmin)
      const res = await alta({ personaId: personaCId, rol: "soberano" })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "Rol desconocido." })
      expect(await prisma.usuario.findUnique({ where: { email: emailPersonaC } })).toBeNull()
    })

    it("400 sin personaId: no hay cuenta anónima (S1)", async () => {
      await conSesion(emailAdmin)
      const res = await alta({ rol: "residente" })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "personaId requerido" })
    })

    it("401 sin sesión, 400 sin comunidadId, 403 sin membresía, 404 comunidad y 400 con correo inválido", async () => {
      state.cookie = ""
      const sinSesion = await alta({ personaId: personaDId, rol: "residente" })
      expect(sinSesion.status).toBe(401)
      expect(await sinSesion.json()).toEqual({ error: "No autenticado." })

      await conSesion(emailAdmin)
      const sinComunidad = await alta(
        { personaId: personaDId, rol: "residente" },
        { comunidadId: "" }
      )
      expect(sinComunidad.status).toBe(400)
      expect(await sinComunidad.json()).toEqual({ error: "comunidadId requerido" })

      // Sesión válida en su comunidad, pero sin membresía en la que pide: no es un
      // 404 (la comunidad existe) ni un 201: es la falta de pertenencia.
      await conSesion(emailComite)
      const sinPertenencia = await alta(
        { personaId: personaDId, rol: "residente" },
        { comunidadId: comunidadB }
      )
      expect(sinPertenencia.status).toBe(403)
      expect(await sinPertenencia.json()).toEqual({
        error: "Sin pertenencia a la comunidad",
      })

      await conSesion(emailAdmin)
      const comunidadFantasma = await alta(
        { personaId: personaDId, rol: "residente" },
        { comunidadId: `comunidad-fantasma-${SFX}` }
      )
      expect(comunidadFantasma.status).toBe(404)
      expect(await comunidadFantasma.json()).toEqual({ error: "Comunidad no encontrada" })

      const correoMalo = await alta({
        personaId: personaDId,
        rol: "residente",
        email: "no-es-correo",
      })
      expect(correoMalo.status).toBe(400)
      expect(await correoMalo.json()).toEqual({ error: "Correo inválido." })

      const { POST } = await import("@/app/api/admin/usuarios/route")
      const malFormado = await POST(
        new NextRequest(
          `http://localhost/api/admin/usuarios?comunidadId=${comunidadA}`,
          {
            method: "POST",
            body: "{",
            headers: {
              "content-type": "application/json",
              "x-forwarded-proto": "http",
              cookie: state.cookie,
            },
          }
        )
      )
      expect(malFormado.status).toBe(400)
      expect(await malFormado.json()).toEqual({ error: "Cuerpo inválido" })
    })

    it("el listado de cuentas muestra el estado de la invitación y no devuelve el enlace revelado en el alta", async () => {
      await conSesion(emailAdmin)
      const creada = await alta({ personaId: personaIId, rol: "conserjeria" })
      expect(creada.status).toBe(201)
      const altaCuerpo = (await creada.json()) as { enlace: string }
      const token = tokenDe(altaCuerpo.enlace)
      expect(token).not.toBe("")

      const res = await listar()
      const texto = await res.text()
      expect(res.status).toBe(200)
      // El pin de L4: la revelación es de la escritura, nunca de la lectura.
      expect(texto).not.toContain(token)
      expect(texto.toLowerCase()).not.toContain("token")
      expect(texto).not.toMatch(/[a-f0-9]{64}/)

      const cuerpo = JSON.parse(texto) as {
        membresias: Array<{
          usuario: { email: string }
          invitacion: Record<string, unknown> | null
        }>
      }
      const fila = cuerpo.membresias.find((m) => m.usuario.email === emailPersonaI)
      expect(fila).toBeDefined()
      expect(Object.keys(fila!.invitacion!).sort()).toEqual([
        "creadoEn",
        "envio",
        "estado",
        "expiraEn",
        "id",
        "usadoEn",
      ])
      expect(fila!.invitacion!.estado).toBe("pendiente")
      expect(fila!.invitacion!.usadoEn).toBeNull()
    })

    it("409 cuando la persona ya tiene cuenta, y 409 cuando el correo ya está tomado", async () => {
      await conSesion(emailAdmin)
      const primera = await alta({ personaId: personaCId, rol: "residente" })
      expect(primera.status).toBe(201)

      const mismaPersona = await alta({ personaId: personaCId, rol: "comite" })
      expect(mismaPersona.status).toBe(409)
      const cuerpoMismaPersona = (await mismaPersona.json()) as Record<string, unknown>
      expect(cuerpoMismaPersona).toEqual({ error: "La persona ya tiene una cuenta." })
      // Un conflicto no revela ningún enlace: el alta no ocurrió.
      expect(cuerpoMismaPersona).not.toHaveProperty("enlace")

      const mismoCorreo = await alta({
        personaId: personaDId,
        rol: "residente",
        email: emailPersonaC,
      })
      expect(mismoCorreo.status).toBe(409)
      const cuerpoMismoCorreo = (await mismoCorreo.json()) as Record<string, unknown>
      expect(cuerpoMismoCorreo).toEqual({ error: "Ya existe una cuenta con ese correo." })
      expect(cuerpoMismoCorreo).not.toHaveProperty("enlace")

      const cuentas = await prisma.usuario.count({ where: { personaId: { in: [personaCId, personaDId] } } })
      expect(cuentas).toBe(1)
      const usuarioC = await prisma.usuario.findFirst({ where: { personaId: personaCId } })
      expect(usuarioC).not.toBeNull()
      expect(await prisma.membresia.count({ where: { usuarioId: usuarioC!.id } })).toBe(1)
    })
  })

  describe("POST /api/auth/invitacion — el enlace define la contraseña (S4)", () => {
    it("abre la definición una sola vez; después la contraseña sirve para entrar y el token no sirve dos veces", async () => {
      await conSesion(emailAdmin)
      const creada = await alta({ personaId: personaEId, rol: "residente" })
      expect(creada.status).toBe(201)
      const altaCuerpo = (await creada.json()) as { enlace: string }
      const usuario = await prisma.usuario.findUnique({ where: { email: emailPersonaE } })
      expect(usuario).not.toBeNull()

      const { verificarCredenciales, CredencialesInvalidas } = await import("@/lib/auth")
      const clave = `inv-login-${SFX}`
      // Antes del canje no hay contraseña: la cuenta existe pero no entra.
      await expect(
        verificarCredenciales(emailPersonaE, PASSWORD, [clave])
      ).rejects.toBeInstanceOf(CredencialesInvalidas)

      // El enlace que la administración recibió en el alta es el que abre la
      // página pública: no hay un segundo camino para obtenerlo.
      const token = tokenDe(altaCuerpo.enlace)
      expect(token).not.toBe("")
      const primera = await canjear({ token, password: PASSWORD })
      expect(primera.status).toBe(200)
      expect(await primera.json()).toEqual({ ok: true })

      const conPassword = await prisma.usuario.findUnique({ where: { email: emailPersonaE } })
      expect(conPassword!.passwordHash).not.toBeNull()
      // Una contraseña nueva invalida las sesiones emitidas antes (mismo corte que PATCH).
      expect(conPassword!.tokenVersion).toBe(usuario!.tokenVersion + 1)

      // Login con la contraseña definida: entra.
      const verificado = await verificarCredenciales(emailPersonaE, PASSWORD, [clave])
      expect(verificado.id).toBe(usuario!.id)
      // Y con otra contraseña: no entra.
      await expect(
        verificarCredenciales(emailPersonaE, PASSWORD_OTRA, [clave])
      ).rejects.toBeInstanceOf(CredencialesInvalidas)

      // Segundo intento con el mismo token: falla y no vuelve a escribir.
      const segunda = await canjear({ token, password: PASSWORD_OTRA })
      expect(segunda.status).toBe(400)
      expect(await segunda.json()).toEqual({ error: INVITACION_INVALIDA })

      const conPasswordDespues = await prisma.usuario.findUnique({
        where: { email: emailPersonaE },
      })
      expect(conPasswordDespues!.passwordHash).toBe(conPassword!.passwordHash)

      // S5: el uso de la invitación deja su rastro con el actor (la persona).
      const evento = await prisma.eventoAuditoria.findFirst({
        where: { referenciaId: usuario!.id, tipoAccion: "invitacion_usada" },
      })
      expect(evento).not.toBeNull()
      expect(evento!.usuario).toBe(usuario!.id)
    })

    it("un token vencido falla y no define la contraseña", async () => {
      await conSesion(emailAdmin)
      const creada = await alta({ personaId: personaFId, rol: "residente" })
      expect(creada.status).toBe(201)
      const usuario = await prisma.usuario.findFirst({ where: { personaId: personaFId } })
      const { token, invitacionId } = await emitirToken(usuario!.id)

      await prisma.invitacionAcceso.update({
        where: { id: invitacionId },
        data: { expiraEn: new Date(Date.now() - 1_000) },
      })

      const res = await canjear({ token, password: PASSWORD })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: INVITACION_INVALIDA })

      const sinPassword = await prisma.usuario.findUnique({ where: { id: usuario!.id } })
      expect(sinPassword!.passwordHash).toBeNull()
    })

    it("un token inventado falla con la misma respuesta que uno vencido: no distingue si existe", async () => {
      await conSesion(emailAdmin)
      const creada = await alta({ personaId: personaGId, rol: "residente" })
      expect(creada.status).toBe(201)
      const usuario = await prisma.usuario.findFirst({ where: { personaId: personaGId } })
      const { token, invitacionId } = await emitirToken(usuario!.id)
      await prisma.invitacionAcceso.update({
        where: { id: invitacionId },
        data: { expiraEn: new Date(Date.now() - 1_000) },
      })

      const vencido = await canjear({ token, password: PASSWORD })
      const vencidoCuerpo = await vencido.json()

      const inventado = await canjear({
        token: `inventado-${SFX}-${"x".repeat(43)}`,
        password: PASSWORD,
      })
      expect(inventado.status).toBe(vencido.status)
      expect(await inventado.json()).toEqual(vencidoCuerpo)
      expect(vencidoCuerpo).toEqual({ error: INVITACION_INVALIDA })
    })

    it("400 con contraseña fuera de la política, y la invitación sigue pendiente", async () => {
      await conSesion(emailAdmin)
      const creada = await alta({ personaId: personaHId, rol: "residente" })
      expect(creada.status).toBe(201)
      const usuario = await prisma.usuario.findFirst({ where: { personaId: personaHId } })
      const { token, invitacionId } = await emitirToken(usuario!.id)

      const debil = await canjear({ token, password: "corta" })
      expect(debil.status).toBe(400)
      expect(await debil.json()).toEqual({ error: PASSWORD_INVALIDA })

      const pendiente = await prisma.invitacionAcceso.findUnique({
        where: { id: invitacionId },
      })
      expect(pendiente!.usadoEn).toBeNull()

      // El mismo enlace sigue sirviendo con una contraseña que sí cumple.
      const buena = await canjear({ token, password: PASSWORD })
      expect(buena.status).toBe(200)
    })

    it("400 con cuerpo inválido o sin token y sin contraseña", async () => {
      const invalido = await canjear({ token: { no: "string" }, password: 123 })
      expect(invalido.status).toBe(400)
      expect(await invalido.json()).toEqual({ error: "token y contraseña requeridos" })

      const sinCuerpo = await canjear({})
      expect(sinCuerpo.status).toBe(400)
      expect(await sinCuerpo.json()).toEqual({ error: "token y contraseña requeridos" })

      const { POST } = await import("@/app/api/auth/invitacion/route")
      const malFormado = await POST(
        new NextRequest("http://localhost/api/auth/invitacion", {
          method: "POST",
          body: "{",
          headers: { "content-type": "application/json", "x-forwarded-proto": "http" },
        })
      )
      expect(malFormado.status).toBe(400)
      expect(await malFormado.json()).toEqual({ error: "Cuerpo inválido" })
    })
  })
})
