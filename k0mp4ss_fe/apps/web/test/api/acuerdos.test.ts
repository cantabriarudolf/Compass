/**
 * @vitest-environment node
 *
 * U3 — registro de acuerdos de gobernanza con votos inmutables (F28/F29/F31).
 *
 * Lo que se fija acá, todo observable por la API y por la base:
 *
 *   1. sin sesión no se toca el registro (401) y un residente no crea acuerdos
 *      (403, cero filas);
 *   2. el alta de un acuerdo es del comité/administración, con folio del libro
 *      asignado por el servidor (`AD-<año>-<correlativo>`) y auditoría;
 *   3. el votante sale de la SESIÓN: quien no es miembro vigente del comité (o
 *      propietario vinculado en la asamblea) recibe 403 y no deja voto;
 *   4. un voto no se repite (409) y no se puede votar un acuerdo ya resuelto;
 *   5. el comité aprueba con mayoría de sus miembros y la asamblea vota
 *      PONDERADO por prorrateo: una unidad de 60 de 100 derechos decide sola, y
 *      una abstención no suma a favor;
 *   6. el acuerdo se resuelve cuando el resultado se alcanza: `estado` y
 *      `resueltoEn` quedan escritos en la misma transacción que el voto.
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

const COM_A = "acu-com-a"
const COM_B = "acu-com-b"
const PERIODO = "acu-per-vig"
const U60 = "acu-u60"
const U40 = "acu-u40"

const EMAIL_ADMIN = "acu-admin@test.cl"
const EMAIL_M1 = "acu-m1@test.cl"
const EMAIL_M2 = "acu-m2@test.cl"
const EMAIL_M3 = "acu-m3@test.cl"
const EMAIL_OUT = "acu-out@test.cl"
const EMAIL_OWN60 = "acu-own60@test.cl"
const EMAIL_OWN40 = "acu-own40@test.cl"
const EMAIL_OWN60B = "acu-own60b@test.cl"

const MATERIA_CORTE =
  "Corte de servicios de la unidad por tres cuotas impagas (Ley 21.442 art. 20 N°9)"

function ficha(cargo: string): Record<string, unknown> {
  return {
    id: `acu-g-${cargo}`,
    cargoDirectiva: cargo,
    fechaAsuncion: "2026-01-15",
    periodoId: PERIODO,
  }
}

function datosPersona(
  id: string,
  rut: string,
  nombre: string,
  email: string,
  gobernanza: Record<string, unknown> | null,
  roles: string[]
) {
  return {
    id,
    comunidadId: COM_A,
    rut,
    nombreCompleto: nombre,
    nombres: nombre.split(" ")[0]!,
    apellidos: nombre.split(" ").slice(1).join(" "),
    email,
    telefonoMovil: "+56900000000",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles,
    datosGobernanza: (gobernanza ?? undefined) as never,
  }
}

describe("/api/acuerdos — registro de acuerdos con votos inmutables (U3)", () => {
  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/acuerdos/route"),
    voto: await import("@/app/api/acuerdos/[id]/voto/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const c of [
      { id: COM_A, nombre: "Comunidad Acuerdos A", slug: "acu-com-a" },
      { id: COM_B, nombre: "Comunidad Acuerdos B", slug: "acu-com-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    const personas = [
      datosPersona("acu-m1", "21111111-1", "Miembro Uno", "acu-m1@test.cl", ficha("presidente"), ["propietario", "directiva"]),
      datosPersona("acu-m2", "22222222-2", "Miembro Dos", "acu-m2@test.cl", ficha("tesorero"), ["propietario", "directiva"]),
      datosPersona("acu-m3", "23333333-3", "Miembro Tres", "acu-m3@test.cl", ficha("secretario"), ["propietario", "directiva"]),
      datosPersona("acu-out", "24444444-4", "Vecino Fuera", "acu-out@test.cl", null, ["propietario"]),
      datosPersona("acu-own-60", "25555555-5", "Propietario Sesenta", "acu-own60@test.cl", null, ["propietario"]),
      datosPersona("acu-own-40", "26666666-6", "Propietario Cuarenta", "acu-own40@test.cl", null, ["propietario"]),
      // Copropietario de la MISMA unidad 60: su voto no puede duplicar el prorrateo.
      datosPersona("acu-own-60b", "27777777-7", "Copropietario Sesenta", "acu-own60b@test.cl", null, ["propietario"]),
    ]
    for (const p of personas) {
      await prisma.persona.upsert({ where: { id: p.id }, update: {}, create: p })
    }

    await prisma.periodoDirectiva.upsert({
      where: { id: PERIODO },
      update: {},
      create: {
        id: PERIODO,
        comunidadId: COM_A,
        fechaInicio: "2026-01-15",
        duracionMeses: 24,
        fechaInscripcion: "2026-02-01",
        referenciaInscripcion: "Acta de asamblea N° 1/2026",
        estado: "vigente",
        miembros: [],
      },
    })

    // Dos unidades de prorrateo distinto: 60 y 40 de 100 derechos.
    for (const u of [
      { id: U60, numero: "101", etiqueta: "Depto", prorrateo: 60 },
      { id: U40, numero: "102", etiqueta: "Depto", prorrateo: 40 },
    ]) {
      await prisma.unidad.upsert({
        where: { id: u.id },
        update: { prorrateo: u.prorrateo },
        create: {
          id: u.id,
          comunidadId: COM_A,
          microSectorId: "acu-ms1",
          numero: u.numero,
          etiqueta: u.etiqueta,
          tipoUnidadId: "acu-t1",
          metraje: 50,
          prorrateo: u.prorrateo,
          rolSii: `acu-${u.numero}`,
          estadoId: "habitada",
          servicios: {},
        },
      })
    }

    for (const v of [
      { id: "acu-v-60", personaId: "acu-own-60", unidadId: U60 },
      { id: "acu-v-60b", personaId: "acu-own-60b", unidadId: U60 },
      { id: "acu-v-40", personaId: "acu-own-40", unidadId: U40 },
    ]) {
      await prisma.vinculoUnidad.upsert({
        where: { id: v.id },
        update: { fechaFin: null },
        create: {
          id: v.id,
          comunidadId: COM_A,
          personaId: v.personaId,
          unidadId: v.unidadId,
          rol: "propietario",
          fechaInicio: "2024-01-01",
          fechaFin: null,
          permiteVerFinanzas: false,
        } as never,
      })
    }

    const usuarios = [
      { id: "acu-usuario-admin", email: EMAIL_ADMIN, personaId: null, comunidadId: COM_A, rol: "administrador" },
      { id: "acu-usuario-m1", email: EMAIL_M1, personaId: "acu-m1", comunidadId: COM_A, rol: "comite" },
      { id: "acu-usuario-m2", email: EMAIL_M2, personaId: "acu-m2", comunidadId: COM_A, rol: "comite" },
      { id: "acu-usuario-m3", email: EMAIL_M3, personaId: "acu-m3", comunidadId: COM_A, rol: "comite" },
      { id: "acu-usuario-out", email: EMAIL_OUT, personaId: "acu-out", comunidadId: COM_A, rol: "comite" },
      { id: "acu-usuario-own60", email: EMAIL_OWN60, personaId: "acu-own-60", comunidadId: COM_A, rol: "residente" },
      { id: "acu-usuario-own60b", email: EMAIL_OWN60B, personaId: "acu-own-60b", comunidadId: COM_A, rol: "residente" },
      { id: "acu-usuario-own40", email: EMAIL_OWN40, personaId: "acu-own-40", comunidadId: COM_A, rol: "residente" },
    ]
    for (const u of usuarios) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: {},
        create: { id: u.id, email: u.email, activo: true, personaId: u.personaId },
      })
    }
    await prisma.membresia.deleteMany({
      where: { usuarioId: { in: usuarios.map((u) => u.id) } },
    })
    for (const u of usuarios) {
      await prisma.membresia.create({
        data: { usuarioId: u.id, comunidadId: u.comunidadId, rol: u.rol },
      })
    }
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.votoAcuerdo.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.acuerdo.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.unidad.deleteMany({ where: { comunidadId: COM_A } })
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: COM_A } })
      await prisma.periodoDirectiva.deleteMany({ where: { comunidadId: COM_A } })
      await prisma.persona.deleteMany({ where: { comunidadId: COM_A } })
      await prisma.membresia.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.usuario.deleteMany({
        where: {
          email: {
            in: [
              EMAIL_ADMIN,
              EMAIL_M1,
              EMAIL_M2,
              EMAIL_M3,
              EMAIL_OUT,
              EMAIL_OWN60,
              EMAIL_OWN60B,
              EMAIL_OWN40,
            ],
          },
        },
      })
      for (const id of [COM_A, COM_B]) {
        await prisma.comunidad.delete({ where: { id } }).catch(() => {})
      }
    } catch {
      // intencional: limpieza best-effort
    }
  })

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  async function POST_ACUERDO(body: unknown): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.POST(
      new NextRequest("http://localhost/api/acuerdos", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function POST_VOTO(id: string, body: unknown): Promise<Response> {
    const { voto } = await cargaModulos()
    return voto.POST(
      new NextRequest(`http://localhost/api/acuerdos/${id}/voto`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  /** Alta de un acuerdo por la API con la sesión de la administración. */
  async function crearAcuerdo(
    body: Record<string, unknown>
  ): Promise<{ id: string; folio: string; estado: string }> {
    let creado: { id: string; folio: string; estado: string } | null = null
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_ACUERDO(body)
      expect(res.status).toBe(201)
      creado = (await res.json()) as { id: string; folio: string; estado: string }
    })
    if (!creado) throw new Error("no se pudo crear el acuerdo de prueba")
    return creado
  }

  const acuerdoComite = () => ({
    cuerpo: "comite",
    materia: MATERIA_CORTE,
    quorumRequerido: "un_voto_por_miembro",
  })

  const acuerdoAsamblea = (quorum: string, materia: string) => ({
    cuerpo: "asamblea",
    materia,
    quorumRequerido: quorum,
  })

  it("401 sin sesión en las dos rutas", async () => {
    state.cookie = ""
    expect((await POST_ACUERDO(acuerdoComite())).status).toBe(401)
    expect((await POST_VOTO("acu-inexistente", { decision: "a_favor" })).status).toBe(401)
  })

  it("un residente no crea acuerdos → 403 y cero filas", async () => {
    await conSesion(EMAIL_OWN60, async () => {
      const res = await POST_ACUERDO({
        ...acuerdoComite(),
        materia: "Intento de un residente de registrar un acuerdo",
      })
      expect(res.status).toBe(403)
    })
    expect(
      await prisma.acuerdo.count({
        where: { comunidadId: COM_A, materia: "Intento de un residente de registrar un acuerdo" },
      })
    ).toBe(0)
  })

  it("el administrador crea un acuerdo de comité → 201 con folio del libro y auditoría", async () => {
    const primero = await crearAcuerdo(acuerdoComite())
    expect(primero.folio).toMatch(/^AD-\d{4}-\d{4,}$/)
    expect(primero.estado).toBe("abierto")

    const enBd = await prisma.acuerdo.findUnique({ where: { id: primero.id } })
    expect(enBd).not.toBeNull()
    expect(enBd?.comunidadId).toBe(COM_A)
    expect(enBd?.cuerpo).toBe("comite")
    expect(enBd?.quorumRequerido).toBe("un_voto_por_miembro")
    expect(enBd?.creadoPor).toBe("acu-usuario-admin")
    expect(enBd?.resueltoEn).toBeNull()
    // El cliente no decide el folio ni el estado inicial.

    const evento = await prisma.eventoAuditoria.findFirst({
      where: {
        comunidadId: COM_A,
        tipoAccion: "AD_ACUERDO_CREADO",
        referenciaId: primero.id,
      },
    })
    expect(evento).not.toBeNull()
    expect(evento?.descripcion).toContain(primero.folio)

    // El correlativo avanza: dos acuerdos del mismo año no comparten folio.
    const segundo = await crearAcuerdo({
      ...acuerdoComite(),
      materia: "Convenio de pago de la unidad 102 (Ley 21.442 art. 6)",
    })
    expect(segundo.folio).not.toBe(primero.folio)
    expect(Number(segundo.folio.split("-")[2])).toBe(
      Number(primero.folio.split("-")[2]) + 1
    )
  })

  it("un acta inexistente en la comunidad → 400 y no persiste", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_ACUERDO({
        ...acuerdoComite(),
        materia: "Acuerdo con un acta que no existe",
        actaId: "acu-acta-fantasma",
      })
      expect(res.status).toBe(400)
    })
    expect(
      await prisma.acuerdo.count({
        where: { comunidadId: COM_A, materia: "Acuerdo con un acta que no existe" },
      })
    ).toBe(0)
  })

  it("una regla de quórum incoherente con el cuerpo → 400 y no persiste", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      // El comité vota por miembro: no puede declarar una mayoría de derechos.
      const comiteConDerechos = await POST_ACUERDO({
        cuerpo: "comite",
        materia: "Acuerdo de comité con regla de asamblea",
        quorumRequerido: "mayoria_absoluta_derechos",
      })
      expect(comiteConDerechos.status).toBe(400)

      // La asamblea pondera por prorrateo: no puede votar un voto por miembro.
      const asambleaPorMiembro = await POST_ACUERDO({
        cuerpo: "asamblea",
        materia: "Acuerdo de asamblea con regla de comité",
        quorumRequerido: "un_voto_por_miembro",
      })
      expect(asambleaPorMiembro.status).toBe(400)
    })
    expect(
      await prisma.acuerdo.count({
        where: {
          comunidadId: COM_A,
          materia: {
            in: [
              "Acuerdo de comité con regla de asamblea",
              "Acuerdo de asamblea con regla de comité",
            ],
          },
        },
      })
    ).toBe(0)
  })

  it("votar sin ser miembro del comité → 403 y cero votos", async () => {
    const acuerdo = await crearAcuerdo(acuerdoComite())
    // Propietario de una unidad: no integra la directiva vigente.
    await conSesion(EMAIL_OWN60, async () => {
      expect((await POST_VOTO(acuerdo.id, { decision: "a_favor" })).status).toBe(403)
    })
    // Sesión sin ficha en el Maestro de Personas: no hay quién vote.
    await conSesion(EMAIL_ADMIN, async () => {
      expect((await POST_VOTO(acuerdo.id, { decision: "a_favor" })).status).toBe(403)
    })
    expect(
      await prisma.votoAcuerdo.count({ where: { acuerdoId: acuerdo.id } })
    ).toBe(0)
  })

  it("la asamblea exige vínculo de propietario vigente → 403", async () => {
    const acuerdo = await crearAcuerdo(
      acuerdoAsamblea("mayoria_absoluta_derechos", "Presupuesto anual por partidas")
    )
    // Miembro del comité sin vínculo de propietario: no vota en la asamblea.
    await conSesion(EMAIL_M1, async () => {
      expect((await POST_VOTO(acuerdo.id, { decision: "a_favor" })).status).toBe(403)
    })
    expect(
      await prisma.votoAcuerdo.count({ where: { acuerdoId: acuerdo.id } })
    ).toBe(0)
  })

  it("un miembro vota una vez: el doble voto es 409 y deja un solo registro", async () => {
    const acuerdo = await crearAcuerdo(acuerdoComite())
    await conSesion(EMAIL_M1, async () => {
      const res = await POST_VOTO(acuerdo.id, { decision: "a_favor" })
      expect(res.status).toBe(200)
      const j = (await res.json()) as {
        ok: boolean
        resultado: { resultado: string; aFavor: number }
      }
      expect(j.ok).toBe(true)
      // Un voto de tres miembros todavía no resuelve el acuerdo.
      expect(j.resultado.resultado).toBe("pendiente")
      expect(j.resultado.aFavor).toBe(1)

      expect((await POST_VOTO(acuerdo.id, { decision: "a_favor" })).status).toBe(409)
    })
    const votos = await prisma.votoAcuerdo.findMany({
      where: { acuerdoId: acuerdo.id },
    })
    expect(votos).toHaveLength(1)
    expect(votos[0]?.personaId).toBe("acu-m1")
    expect(votos[0]?.peso).toBe(1)
    expect(votos[0]?.registradoPor).toBe("acu-usuario-m1")
    // El voto es evidencia y queda auditado.
    expect(
      await prisma.eventoAuditoria.count({
        where: {
          comunidadId: COM_A,
          tipoAccion: "AD_ACUERDO_VOTO",
          referenciaId: acuerdo.id,
        },
      })
    ).toBe(1)
  })

  it("dos votos a favor de tres miembros ya son mayoría: el acuerdo queda aprobado con resueltoEn", async () => {
    const acuerdo = await crearAcuerdo(acuerdoComite())

    // Primer voto: 1 de 3 miembros. El resultado todavía puede cambiar.
    await conSesion(EMAIL_M1, async () => {
      const res = await POST_VOTO(acuerdo.id, { decision: "a_favor" })
      expect(res.status).toBe(200)
      const j = (await res.json()) as {
        resultado: { resultado: string; aFavor: number }
      }
      expect(j.resultado.aFavor).toBe(1)
      expect(j.resultado.resultado).toBe("pendiente")
      const enBd = await prisma.acuerdo.findUnique({ where: { id: acuerdo.id } })
      expect(enBd?.estado).toBe("abierto")
      expect(enBd?.resueltoEn).toBeNull()
    })

    // Segundo voto: 2 de 3 ya es mayoría estricta del comité y nadie la puede
    // quitar, así que el acuerdo se resuelve en la misma transacción del voto.
    await conSesion(EMAIL_M2, async () => {
      const res = await POST_VOTO(acuerdo.id, { decision: "a_favor" })
      expect(res.status).toBe(200)
      const j = (await res.json()) as {
        resultado: { resultado: string; aFavor: number }
      }
      expect(j.resultado.aFavor).toBe(2)
      expect(j.resultado.resultado).toBe("aprobado")
      const enBd = await prisma.acuerdo.findUnique({ where: { id: acuerdo.id } })
      expect(enBd?.estado).toBe("aprobado")
      expect(enBd?.resueltoEn).not.toBeNull()
    })

    // El acuerdo resuelto no admite más votos: el tercer miembro recibe 409.
    await conSesion(EMAIL_M3, async () => {
      expect((await POST_VOTO(acuerdo.id, { decision: "a_favor" })).status).toBe(409)
    })

    const votos = await prisma.votoAcuerdo.findMany({
      where: { acuerdoId: acuerdo.id },
    })
    expect(votos.map((v) => v.personaId).sort()).toEqual(["acu-m1", "acu-m2"])
  })

  it("asamblea: el peso por prorrateo manda y una unidad de 60 decide sola", async () => {
    const acuerdo = await crearAcuerdo(
      acuerdoAsamblea("mayoria_absoluta_derechos", "Presupuesto 2027 por partidas")
    )
    await conSesion(EMAIL_OWN60, async () => {
      const res = await POST_VOTO(acuerdo.id, { decision: "a_favor" })
      expect(res.status).toBe(200)
      const j = (await res.json()) as {
        resultado: { resultado: string; aFavor: number }
      }
      expect(j.resultado.resultado).toBe("aprobado")
      expect(j.resultado.aFavor).toBe(60)
    })
    const votos = await prisma.votoAcuerdo.findMany({
      where: { acuerdoId: acuerdo.id },
    })
    expect(votos).toHaveLength(1)
    expect(votos[0]?.peso).toBe(60)
    expect(votos[0]?.unidadId).toBe(U60)
    const enBd = await prisma.acuerdo.findUnique({ where: { id: acuerdo.id } })
    expect(enBd?.estado).toBe("aprobado")
    expect(enBd?.resueltoEn).not.toBeNull()

    // Un acuerdo resuelto no admite más votos, ni siquiera del otro propietario.
    await conSesion(EMAIL_OWN40, async () => {
      expect((await POST_VOTO(acuerdo.id, { decision: "a_favor" })).status).toBe(409)
    })
    expect(
      await prisma.votoAcuerdo.count({ where: { acuerdoId: acuerdo.id } })
    ).toBe(1)
  })

  it("abstención en la asamblea: pesa pero no suma a favor", async () => {
    const acuerdo = await crearAcuerdo(
      acuerdoAsamblea("mayoria_absoluta_derechos", "Gasto extraordinario de fachada")
    )
    await conSesion(EMAIL_OWN40, async () => {
      const res = await POST_VOTO(acuerdo.id, { decision: "abstencion" })
      expect(res.status).toBe(200)
      const j = (await res.json()) as {
        resultado: { resultado: string; aFavor: number; abstenciones: number }
      }
      expect(j.resultado.aFavor).toBe(0)
      expect(j.resultado.abstenciones).toBe(40)
      // Con 60 derechos todavía sin votar, el acuerdo sigue abierto.
      expect(j.resultado.resultado).toBe("pendiente")
    })
    const voto = await prisma.votoAcuerdo.findFirst({
      where: { acuerdoId: acuerdo.id },
    })
    expect(voto?.decision).toBe("abstencion")
    expect(voto?.peso).toBe(40)
    const enBd = await prisma.acuerdo.findUnique({ where: { id: acuerdo.id } })
    expect(enBd?.estado).toBe("abierto")
    expect(enBd?.resueltoEn).toBeNull()
  })

  it("el prorrateo de una unidad no se cuenta dos veces", async () => {
    // Mayoría reforzada: el voto de 60 derechos deja el acuerdo ABIERTO (falta
    // llegar al 66%), así que el segundo copropietario sí llega a intentarlo.
    const acuerdo = await crearAcuerdo(
      acuerdoAsamblea(
        "mayoria_reforzada_derechos",
        "Reforma del reglamento interno en asamblea extraordinaria"
      )
    )
    await conSesion(EMAIL_OWN60, async () => {
      const res = await POST_VOTO(acuerdo.id, { decision: "a_favor" })
      expect(res.status).toBe(200)
      const j = (await res.json()) as { resultado: { resultado: string } }
      expect(j.resultado.resultado).toBe("pendiente")
    })
    await conSesion(EMAIL_OWN60B, async () => {
      expect((await POST_VOTO(acuerdo.id, { decision: "a_favor" })).status).toBe(409)
    })
    expect(
      await prisma.votoAcuerdo.count({ where: { acuerdoId: acuerdo.id } })
    ).toBe(1)
  })

  it("404 para el acuerdo de otra comunidad y para uno inexistente", async () => {
    await prisma.acuerdo.create({
      data: {
        id: "acu-ac-b",
        comunidadId: COM_B,
        cuerpo: "comite",
        materia: "Acuerdo de la comunidad B",
        folio: "AD-2026-9001",
        quorumRequerido: "un_voto_por_miembro",
        creadoPor: "acu-usuario-admin",
      },
    })
    await conSesion(EMAIL_M1, async () => {
      expect((await POST_VOTO("acu-ac-b", { decision: "a_favor" })).status).toBe(404)
      expect((await POST_VOTO("acu-no-existe", { decision: "a_favor" })).status).toBe(404)
    })
    expect(await prisma.votoAcuerdo.count({ where: { acuerdoId: "acu-ac-b" } })).toBe(0)
  })
})
