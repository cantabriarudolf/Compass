/**
 * @vitest-environment node
 *
 * S7 de `odd/tasks/un-camino-de-entrega.md` — «la pantalla no afirma un envío
 * que no ocurrió».
 *
 * La pantalla de directiva (`app/comunidad/directiva/page.tsx`) anuncia, para
 * toda acta publicada, «notificación formal enviada a propietarios
 * (email_simulado)», y ningún código de GD escribía una `Notificacion`: el
 * acto afirmaba una comunicación que nunca existió. Este corte completa el
 * acto —cuando el acta queda publicada se escriben los avisos in-app de los
 * propietarios por el puente único (`lib/entrega/notificar.ts`)— y deja el
 * texto de la pantalla describiendo exactamente lo que el código escribe.
 *
 * S8: NO se agrega correo real. Todo aviso sale con canal de bandeja
 * (`CANAL_NOTIFICACION_EMAIL_SIMULADO`) y su entrega `visor`/`entregado`; el
 * puente no abre ninguna conexión para el visor. Cero filas de canal `email`.
 *
 * Lo que se fija acá:
 *  · el conjunto de destinatarios es el de siempre en este repo —dueño de
 *    registro de la unidad (`VinculoUnidad` rol `propietario`, `fechaFin`
 *    null) con cuenta activa— sin inventar una audiencia nueva;
 *  · `destinatarioRol` sale de los roles REALES de la persona
 *    (`rolDeBandeja`, el mapeo de la bandeja, no una constante);
 *  · publicar deja UNA notificación y UNA entrega de visor por propietario;
 *  · republicar (upsert idempotente del acta publicada, o editar una acta ya
 *    publicada) no duplica ni el aviso ni su constancia: el id del aviso es
 *    determinista (`not-gd-<acta>-<persona>`);
 *  · el texto de la pantalla no vuelve a afirmar un envío que el código no
 *    escribe, y sigue citando el canal que sí se persiste.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { CANAL_NOTIFICACION_EMAIL_SIMULADO } from "@/lib/schemas"
import { hoyISO } from "@/lib/date-utils"
import {
  asegurarAvisosActaPublicada,
  asuntoAvisoActa,
  cuerpoAvisoActa,
} from "@/app/api/actas-gd/_publicacion"

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

const RAIZ = path.resolve(__dirname, "../..")

/** La pantalla que afirma el envío (S7). */
const PANTALLA_DIRECTIVA = "app/comunidad/directiva/page.tsx"

/** Frase con la que el acto queda descrito sin afirmar un envío externo. */
const FRASE_DE_LA_PANTALLA =
  "notificación en la bandeja de cada propietario con cuenta activa (email_simulado)"

/** La afirmación que este corte retira: un envío formal que nadie ejecutaba. */
const FRASE_RETIRADA = "notificación formal enviada a propietarios"

/**
 * La escritura que el puente prohíbe fuera de él (S1). `upsert` incluido: la
 * regla nombra las dos formas, y un upsert heredaría el canal igual.
 */
const RE_ESCRITURA_INLINE = /\.notificacion\s*\.\s*(create|upsert)\s*\(/

function actaValida(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "gda-acta-1",
    fecha: "2026-09-10",
    hora: "19:00",
    lugar: "Sede comunitaria",
    tablaTemas: ["Gasto común"],
    presentes: ["gda-m1"],
    ausentes: [],
    invitados: [],
    minuta: "Se acuerda el gasto común de septiembre.",
    adjuntos: [],
    estado: "borrador",
    aprobaciones: [],
    ...overrides,
  }
}

/**
 * Cliente instrumentado: cuenta CADA operación de Prisma que pasa por él.
 *
 * `asegurarAvisosActaPublicada` recibe el cliente de la transacción del
 * llamador, así que este doble se le puede pasar igual que un `tx` real (misma
 * conexión, mismos delegados) y mide los viajes de ida y vuelta sin mirar la
 * implementación. Es la forma de fijar que republicar un acta con una audiencia
 * grande NO cuesta una consulta por propietario (R3-001).
 */
function clienteQueCuentaConsultas(): {
  cliente: Prisma.TransactionClient
  consultas: () => number
  reiniciar: () => void
} {
  const contador = { consultas: 0 }
  const cliente = prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          contador.consultas += 1
          return query(args)
        },
      },
    },
  })
  return {
    cliente: cliente as unknown as Prisma.TransactionClient,
    consultas: () => contador.consultas,
    reiniciar: () => {
      contador.consultas = 0
    },
  }
}

function ficha(cargo: string): Record<string, unknown> {
  return {
    id: `gda-g-${cargo}`,
    cargoDirectiva: cargo,
    fechaAsuncion: "2026-01-15",
    periodoId: "gda-per-vig",
  }
}

describe("S7 — un acta publicada deja su aviso in-app", () => {
  const comunidad = "gda-comunidad"
  /** Comunidad sin propietarios con cuenta activa: publicar no depende de la audiencia. */
  const comunidadSinPropietarios = "gda-comunidad-sin-owner"
  /** Comunidad con MUCHOS propietarios: mide que republicar no cueste O(N). */
  const comunidadMuchos = "gda-comunidad-muchos"
  const propietariosMuchos = 12
  /** Las comunidades que el fixture escribe: la limpieza las cubre todas. */
  const COMUNIDADES_GD = [comunidad, comunidadSinPropietarios, comunidadMuchos]
  const emailAdmin = "gda-admin@test.cl"
  const emailDirectiva = "gda-m1@test.cl"
  const emailAdminSinPropietarios = "gda-admin-sin-owner@test.cl"

  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/actas-gd/route"),
    item: await import("@/app/api/actas-gd/[id]/route"),
    aprobar: await import("@/app/api/actas-gd/[id]/aprobar/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET
    for (const c of [
      { id: comunidad, nombre: "Comunidad GD Acta Aviso", slug: "gda-comunidad" },
      {
        id: comunidadSinPropietarios,
        nombre: "Comunidad GD Sin Propietarios",
        slug: "gda-comunidad-sin-owner",
      },
      {
        id: comunidadMuchos,
        nombre: "Comunidad GD Muchos Propietarios",
        slug: "gda-comunidad-muchos",
      },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    // Propietarios con cuenta activa: gda-m1 (directiva y dueña) y gda-p2.
    // Fuera del conjunto, por un motivo distinto cada uno: gda-p3 (vínculo
    // cerrado), gda-p4 (cuenta inactiva) y gda-p5 (arrendatario, no dueño).
    const personas: Array<{
      id: string
      nombre: string
      estadoCuenta: string
      roles: string[]
      gobierna: Record<string, unknown> | null
    }> = [
      { id: "gda-m1", nombre: "Mirta Presidenta", estadoCuenta: "activa", roles: ["propietario", "directiva"], gobierna: ficha("presidente") },
      { id: "gda-p2", nombre: "Pedro Propietario", estadoCuenta: "activa", roles: ["propietario"], gobierna: null },
      { id: "gda-p3", nombre: "Pabla Antigua", estadoCuenta: "activa", roles: ["propietario"], gobierna: null },
      { id: "gda-p4", nombre: "Pablo Inactivo", estadoCuenta: "inactiva", roles: ["propietario"], gobierna: null },
      { id: "gda-p5", nombre: "Paula Arrendataria", estadoCuenta: "activa", roles: ["residente"], gobierna: null },
    ]
    let rut = 0
    for (const p of personas) {
      rut += 1
      await prisma.persona.upsert({
        where: { id: p.id },
        update: {},
        create: {
          id: p.id,
          comunidadId: comunidad,
          rut: `${String(rut).padStart(8, "0")}-${rut}`,
          nombreCompleto: p.nombre,
          nombres: p.nombre.split(" ")[0]!,
          apellidos: p.nombre.split(" ").slice(1).join(" "),
          email: `${p.id}@test.cl`,
          telefonoMovil: "+56900000000",
          estadoCuenta: p.estadoCuenta,
          condicionesEspecialesIds: [],
          roles: p.roles,
          datosGobernanza: (p.gobierna ?? undefined) as never,
        } as never,
      })
    }

    await prisma.periodoDirectiva.upsert({
      where: { id: "gda-per-vig" },
      update: {},
      create: {
        id: "gda-per-vig",
        comunidadId: comunidad,
        fechaInicio: "2026-01-15",
        duracionMeses: 24,
        fechaInscripcion: "2026-02-01",
        referenciaInscripcion: "Acta asamblea N° 1/2026",
        estado: "vigente",
        miembros: [],
      },
    })

    const unidades = ["gda-u1", "gda-u2", "gda-u3", "gda-u4"]
    for (const [indice, unidadId] of unidades.entries()) {
      await prisma.unidad.upsert({
        where: { id: unidadId },
        update: {},
        create: {
          id: unidadId,
          comunidadId: comunidad,
          microSectorId: "gda-ms1",
          numero: `${101 + indice}`,
          etiqueta: "Depto",
          tipoUnidadId: "gda-t1",
          metraje: 50,
          prorrateo: 1,
          rolSii: `1-${indice + 1}`,
          estadoId: "habitada",
          servicios: {},
        },
      })
    }

    // Dueño de registro: vínculo `propietario` ABIERTO (fechaFin null).
    // gda-p3 conserva su vínculo con fechaFin: ya no es dueña de registro.
    const vinculos: Array<[string, string, string, string, string | null]> = [
      ["gda-v1", "gda-m1", "gda-u1", "propietario", null],
      ["gda-v2", "gda-p2", "gda-u2", "propietario", null],
      ["gda-v3", "gda-p3", "gda-u3", "propietario", "2025-06-30"],
      ["gda-v4", "gda-p4", "gda-u4", "propietario", null],
      ["gda-v5", "gda-p5", "gda-u1", "arrendatario", null],
    ]
    for (const [id, personaId, unidadId, rol, fechaFin] of vinculos) {
      await prisma.vinculoUnidad.upsert({
        where: { id },
        update: { fechaFin },
        create: {
          id,
          comunidadId: comunidad,
          personaId,
          unidadId,
          rol,
          fechaInicio: "2024-01-01",
          fechaFin,
          permiteVerFinanzas: false,
        } as never,
      })
    }

    // Una comunidad con MUCHOS propietarios activos: es el caso que mide el
    // costo de republicar un acta (R3-001). Vive aparte de `comunidad` para no
    // tocar las aserciones que fijan el conjunto EXACTO de destinatarios.
    for (let i = 1; i <= propietariosMuchos; i++) {
      const n = String(i).padStart(2, "0")
      const personaId = `gda-muchos-p${n}`
      await prisma.persona.upsert({
        where: { id: personaId },
        update: {},
        create: {
          id: personaId,
          comunidadId: comunidadMuchos,
          rut: `${String(70_000_000 + i)}-K`,
          nombreCompleto: `Propietario Masivo ${n}`,
          nombres: "Propietario",
          apellidos: `Masivo ${n}`,
          email: `${personaId}@test.cl`,
          telefonoMovil: "+56900000001",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: ["propietario"],
        },
      })
      await prisma.vinculoUnidad.upsert({
        where: { id: `gda-muchos-v${n}` },
        update: { fechaFin: null },
        create: {
          id: `gda-muchos-v${n}`,
          comunidadId: comunidadMuchos,
          personaId,
          unidadId: `gda-muchos-u${n}`,
          rol: "propietario",
          fechaInicio: "2024-01-01",
          fechaFin: null,
          permiteVerFinanzas: false,
        } as never,
      })
    }

    // La directiva vigente es de un solo miembro: una firma completa el quórum
    // de 100% (el camino real de la pantalla para publicar un acta).
    const usuarios: Array<{ id: string; email: string; personaId: string | null }> = [
      { id: "gda-usuario-admin", email: emailAdmin, personaId: null },
      { id: "gda-usuario-m1", email: emailDirectiva, personaId: "gda-m1" },
      { id: "gda-usuario-admin-sin", email: emailAdminSinPropietarios, personaId: null },
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
    const membresias: Array<[string, string, string]> = [
      ["gda-usuario-admin", comunidad, "administrador"],
      ["gda-usuario-m1", comunidad, "comite"],
      ["gda-usuario-admin-sin", comunidadSinPropietarios, "administrador"],
    ]
    for (const [usuarioId, comunidadId, rol] of membresias) {
      await prisma.membresia.create({ data: { usuarioId, comunidadId, rol } })
    }
  }, 30_000)

  /**
   * La limpieza del fixture, en un solo lugar: la llaman `afterAll` y el test
   * que prueba que no deja avisos ni entregas atrás (R3-003). Recibe el cliente
   * para que el test pueda pasar uno que bloquee el borrado de la comunidad.
   */
  async function limpiarComunidadesGD(cliente: PrismaClient = prisma): Promise<void> {
    state.cookie = ""
    // R3-003: los avisos y sus entregas se borran EXPLÍCITOS, antes de las
    // personas y de la comunidad. Sin esto la limpieza depende del borrado en
    // cascada de `Comunidad`: si un paso anterior falla, el `catch` de
    // `afterAll` se traga el error y deja filas GD atrás —y el primer test
    // cuenta TODAS las de la comunidad, así que la corrida siguiente fallaría
    // por las viejas—. Primero la entrega, que es la que referencia al aviso.
    await cliente.entregaNotificacion.deleteMany({
      where: { comunidadId: { in: COMUNIDADES_GD } },
    })
    await cliente.notificacion.deleteMany({ where: { comunidadId: { in: COMUNIDADES_GD } } })
    await cliente.actaGD.deleteMany({ where: { comunidadId: { in: COMUNIDADES_GD } } })
    await cliente.vinculoUnidad.deleteMany({ where: { comunidadId: { in: COMUNIDADES_GD } } })
    await cliente.unidad.deleteMany({ where: { comunidadId: { in: COMUNIDADES_GD } } })
    await cliente.periodoDirectiva.deleteMany({ where: { comunidadId: { in: COMUNIDADES_GD } } })
    await cliente.persona.deleteMany({ where: { comunidadId: { in: COMUNIDADES_GD } } })
    await cliente.membresia.deleteMany({ where: { comunidadId: { in: COMUNIDADES_GD } } })
    for (const email of [emailAdmin, emailDirectiva, emailAdminSinPropietarios]) {
      await cliente.usuario.delete({ where: { email } }).catch(() => {})
    }
    for (const id of COMUNIDADES_GD) {
      await cliente.comunidad.delete({ where: { id } }).catch(() => {})
    }
  }

  afterAll(async () => {
    try {
      await limpiarComunidadesGD()
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

  async function POST(body: unknown): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.POST(
      new NextRequest("http://localhost/api/actas-gd", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function PUT(id: string, body: unknown): Promise<Response> {
    const { item } = await cargaModulos()
    return item.PUT(
      new NextRequest(`http://localhost/api/actas-gd/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  async function APROBAR(id: string, personaId: string): Promise<Response> {
    const { aprobar } = await cargaModulos()
    return aprobar.POST(
      new NextRequest(`http://localhost/api/actas-gd/${id}/aprobar`, {
        method: "POST",
        body: JSON.stringify({ personaId }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id }) }
    )
  }

  it("publicar por el camino de la pantalla escribe un aviso por propietario activo y su entrega al visor", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await POST(actaValida({ id: "gda-acta-1" }))).status).toBe(201)
    })
    // El botón «Firmar acta» de la pantalla: al completar el quórum el acta se publica.
    await conSesion(emailDirectiva, async () => {
      const res = await APROBAR("gda-acta-1", "gda-m1")
      expect(res.status).toBe(200)
      const cuerpo = (await res.json()) as { publicada?: boolean }
      expect(cuerpo.publicada).toBe(true)
    })

    const acta = await prisma.actaGD.findUnique({ where: { id: "gda-acta-1" } })
    expect(acta?.estado).toBe("publicada")
    expect(acta?.folio).not.toBeNull()
    expect(acta?.fechaPublicacion).not.toBeNull()

    // Un aviso por dueño de registro con cuenta activa: la directiva dueña
    // (gda-m1) y el propietario sin cargo (gda-p2). Quedan fuera la dueña con
    // vínculo cerrado (gda-p3), la cuenta inactiva (gda-p4) y la arrendataria
    // (gda-p5).
    const notificaciones = await prisma.notificacion.findMany({
      where: { comunidadId: comunidad, moduloOrigen: "GD" },
      orderBy: { id: "asc" },
    })
    expect(notificaciones.map((n) => n.destinatarioPersonaId)).toEqual([
      "gda-m1",
      "gda-p2",
    ])
    // El id determinista es la garantía de no duplicar: acta + persona.
    expect(notificaciones.map((n) => n.id)).toEqual([
      `not-gd-gda-acta-1-gda-m1`,
      `not-gd-gda-acta-1-gda-p2`,
    ])

    // `destinatarioRol` sale de los roles REALES (rolDeBandeja), no de una
    // constante: el miembro de directiva entra como directiva y el propietario
    // como residente (la bandeja del residente acepta `residente`).
    expect(notificaciones.map((n) => n.destinatarioRol)).toEqual([
      "directiva",
      "residente",
    ])

    const identificacion = `El acta ${acta!.folio}`
    for (const aviso of notificaciones) {
      expect(aviso.comunidadId).toBe(comunidad)
      expect(aviso.canal).toBe(CANAL_NOTIFICACION_EMAIL_SIMULADO)
      expect(aviso.asunto).toBe(`Acta ${acta!.folio} publicada`)
      expect(aviso.cuerpo).toBe(
        `${identificacion}, de la sesión del ${acta!.fecha}, quedó publicada el ${acta!.fechaPublicacion}. Está disponible para su consulta en el libro de actas de la comunidad.`
      )
      expect(aviso.fecha).toBe(acta!.fechaPublicacion)
      expect(aviso.leida).toBe(false)
      expect(aviso.fechaLectura).toBeNull()
      // La acta es un acto de la comunidad, no de una unidad: el aviso va
      // dirigido a la persona, sin unidad.
      expect(aviso.unidadId).toBeNull()
    }

    // La constancia de la entrega in-app: una fila `visor`/`entregado` por aviso.
    const entregas = await prisma.entregaNotificacion.findMany({
      where: { comunidadId: comunidad },
      orderBy: { id: "asc" },
    })
    expect(entregas).toHaveLength(2)
    for (const entrega of entregas) {
      expect(entrega.canal).toBe("visor")
      expect(entrega.estado).toBe("entregado")
      expect(entrega.motivo).toBeNull()
      expect(entrega.intentos).toBe(1)
      expect(entrega.enviadoEn).toBeNull()
      expect(notificaciones.map((n) => n.id)).toContain(entrega.notificacionId)
    }
    // S8: el acto NO agrega correo real — cero intentos de canal `email`.
    expect(entregas.filter((e) => e.canal === "email")).toEqual([])
  })

  it("republicar o editar un acta ya publicada no duplica el aviso ni su entrega", async () => {
    await conSesion(emailAdmin, async () => {
      expect((await POST(actaValida({ id: "gda-acta-2" }))).status).toBe(201)
    })
    await conSesion(emailDirectiva, async () => {
      expect((await APROBAR("gda-acta-2", "gda-m1")).status).toBe(200)
    })

    const contar = async () => ({
      avisos: await prisma.notificacion.count({
        where: { comunidadId: comunidad, moduloOrigen: "GD", id: { startsWith: "not-gd-gda-acta-2-" } },
      }),
      entregas: await prisma.entregaNotificacion.count({
        where: { comunidadId: comunidad, notificacionId: { startsWith: "not-gd-gda-acta-2-" } },
      }),
      ids: (
        await prisma.notificacion.findMany({
          where: { comunidadId: comunidad, id: { startsWith: "not-gd-gda-acta-2-" } },
          orderBy: { id: "asc" },
          select: { id: true },
        })
      ).map((n) => n.id),
    })

    const despuesDePublicar = await contar()
    expect(despuesDePublicar.avisos).toBe(2)
    expect(despuesDePublicar.entregas).toBe(2)

    // Republicar = el upsert idempotente del acta publicada (el mismo guardado
    // que la pantalla puede repetir) …
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        actaValida({
          id: "gda-acta-2",
          estado: "publicada",
          aprobaciones: ["gda-m1"],
        })
      )
      expect(res.status).toBe(200)
      // … y la edición de un acta ya publicada.
      expect((await PUT("gda-acta-2", { lugar: "Salón multiuso" })).status).toBe(200)
    })

    expect(await contar()).toEqual(despuesDePublicar)
  })

  it("la publicación por el upsert del libro (POST con estado publicada) también deja el aviso", async () => {
    await conSesion(emailAdmin, async () => {
      const res = await POST(
        actaValida({
          id: "gda-acta-3",
          estado: "publicada",
          aprobaciones: ["gda-m1"],
        })
      )
      expect(res.status).toBe(201)
    })

    const acta = await prisma.actaGD.findUnique({ where: { id: "gda-acta-3" } })
    expect(acta?.estado).toBe("publicada")
    // Sin fechaPublicacion declarada, la del aviso es la del día de la publicación.
    expect(acta?.fechaPublicacion).toBeNull()

    const avisos = await prisma.notificacion.findMany({
      where: { comunidadId: comunidad, id: { startsWith: "not-gd-gda-acta-3-" } },
      orderBy: { id: "asc" },
    })
    expect(avisos.map((n) => n.destinatarioPersonaId)).toEqual(["gda-m1", "gda-p2"])
    expect(avisos.map((n) => n.fecha)).toEqual([hoyISO(), hoyISO()])
  })

  it("sin propietarios con cuenta activa el acta se publica igual y no inventa avisos", async () => {
    await conSesion(emailAdminSinPropietarios, async () => {
      const res = await POST(
        actaValida({
          id: "gda-acta-sin-owner",
          estado: "publicada",
          presentes: [],
          aprobaciones: [],
        })
      )
      expect(res.status).toBe(201)
    })

    const acta = await prisma.actaGD.findUnique({ where: { id: "gda-acta-sin-owner" } })
    expect(acta?.estado).toBe("publicada")
    expect(
      await prisma.notificacion.count({
        where: { comunidadId: comunidadSinPropietarios },
      })
    ).toBe(0)
    expect(
      await prisma.entregaNotificacion.count({
        where: { comunidadId: comunidadSinPropietarios },
      })
    ).toBe(0)
  })

  it("un acta sin folio no repite la sesión en el aviso", () => {
    // Sin folio, la fecha de la sesión es la ÚNICA identificación del acta: el
    // cuerpo no puede nombrarla dos veces (R3-002).
    const sinFolio = {
      id: "gda-acta-sin-folio",
      comunidadId: comunidad,
      fecha: "2026-09-10",
      estado: "publicada",
      folio: null,
      fechaPublicacion: "2026-09-12",
    }
    expect(asuntoAvisoActa(sinFolio)).toBe("Acta de la sesión del 2026-09-10 publicada")
    const cuerpo = cuerpoAvisoActa(sinFolio, "2026-09-12")
    expect(cuerpo).toBe(
      "El acta de la sesión del 2026-09-10 quedó publicada el 2026-09-12. Está disponible para su consulta en el libro de actas de la comunidad."
    )
    expect(cuerpo.match(/de la sesión del/g)).toHaveLength(1)
  })

  it("una comunidad con muchos propietarios republica con un número acotado de consultas", async () => {
    const acta = {
      id: "gda-acta-muchos",
      comunidadId: comunidadMuchos,
      fecha: "2026-10-01",
      estado: "publicada",
      folio: "77/2026",
      fechaPublicacion: "2026-10-02",
    }
    const medidor = clienteQueCuentaConsultas()

    expect(await asegurarAvisosActaPublicada(medidor.cliente, acta)).toBe(propietariosMuchos)

    // Republicar es el caso que se repite en CADA PUT/POST de un acta publicada
    // y en cada firma: con todos los avisos ya escritos no puede costar una
    // consulta por propietario. El tope es constante —vínculos + personas + UNA
    // consulta de avisos existentes— y no crece con la audiencia (R3-001).
    medidor.reiniciar()
    expect(await asegurarAvisosActaPublicada(medidor.cliente, acta)).toBe(0)
    expect(medidor.consultas()).toBeLessThanOrEqual(3)

    // Y republicar no escribió nada de más: sigue habiendo UN aviso y UNA
    // entrega de visor por propietario.
    expect(
      await prisma.notificacion.count({
        where: { comunidadId: comunidadMuchos, moduloOrigen: "GD" },
      })
    ).toBe(propietariosMuchos)
    expect(
      await prisma.entregaNotificacion.count({ where: { comunidadId: comunidadMuchos } })
    ).toBe(propietariosMuchos)
  })

  it("la pantalla describe el aviso in-app y ya no afirma un envío formal", () => {
    const fuente = readFileSync(path.join(RAIZ, PANTALLA_DIRECTIVA), "utf8")
    expect(fuente).toContain(FRASE_DE_LA_PANTALLA)
    expect(fuente).not.toContain(FRASE_RETIRADA)
  })

  it("GD pasa por el puente: ninguna escritura inline de Notificacion", () => {
    const archivos = readdirSync(path.join(RAIZ, "app/api/actas-gd"), {
      encoding: "utf8",
      recursive: true,
    })
      .map((entrada) => path.join(RAIZ, "app/api/actas-gd", entrada))
      .filter((ruta) => ruta.endsWith(".ts"))
    // El barrido no puede pasar por vacío.
    expect(archivos.length).toBeGreaterThan(0)

    const infractores = archivos.filter((ruta) =>
      RE_ESCRITURA_INLINE.test(readFileSync(ruta, "utf8"))
    )
    expect(
      infractores.map((ruta) => path.relative(RAIZ, ruta)),
      "escriben Notificacion sin pasar por lib/entrega/notificar.ts"
    ).toEqual([])

    for (const relativa of [
      "app/api/actas-gd/route.ts",
      "app/api/actas-gd/[id]/route.ts",
      "app/api/actas-gd/[id]/aprobar/route.ts",
    ]) {
      const fuente = readFileSync(path.join(RAIZ, relativa), "utf8")
      expect(fuente, `${relativa} no asegura el aviso del acta publicada`).toContain(
        "asegurarAvisosActaPublicada("
      )
    }
  })

  it("la limpieza del fixture borra los avisos y sus entregas sin depender de la cascada", async () => {
    // Lo que dejaría una corrida anterior si la limpieza se cortara antes de la
    // comunidad (el `catch` de `afterAll` se traga el error): un aviso GD y su
    // entrega, sembrados a mano para no depender de las rutas.
    await prisma.notificacion.create({
      data: {
        id: "not-gd-residuo-limpieza",
        comunidadId: comunidad,
        destinatarioRol: "residente",
        destinatarioPersonaId: "gda-p2",
        asunto: "Residuo de una corrida anterior",
        cuerpo: "Fila que la limpieza tiene que dejar en cero.",
        canal: CANAL_NOTIFICACION_EMAIL_SIMULADO,
        moduloOrigen: "GD",
        fecha: "2026-09-12",
      },
    })
    await prisma.entregaNotificacion.create({
      data: {
        id: "ent-gd-residuo-limpieza",
        comunidadId: comunidad,
        notificacionId: "not-gd-residuo-limpieza",
        canal: "visor",
        estado: "entregado",
        intentos: 1,
      },
    })

    // La cascada de `Comunidad` NO puede ser la red de la limpieza: se limpia
    // con un cliente cuyo borrado de comunidad FALLA (lo que en la vida real
    // hace una FK) y las dos tablas tienen que quedar en cero igual.
    const sinCascada = prisma.$extends({
      query: {
        comunidad: {
          async delete() {
            throw new Error("borrado de la comunidad bloqueado")
          },
        },
      },
    }) as unknown as PrismaClient
    await limpiarComunidadesGD(sinCascada)

    expect(
      await prisma.notificacion.count({ where: { comunidadId: { in: COMUNIDADES_GD } } })
    ).toBe(0)
    expect(
      await prisma.entregaNotificacion.count({
        where: { comunidadId: { in: COMUNIDADES_GD } },
      })
    ).toBe(0)
    // Y la prueba de que las filas NO se fueron por la cascada: las comunidades
    // siguen ahí (su borrado falló), así que lo que las borró fueron los
    // `deleteMany` explícitos del fixture.
    expect(await prisma.comunidad.count({ where: { id: { in: COMUNIDADES_GD } } })).toBe(
      COMUNIDADES_GD.length
    )

    // La limpieza normal (la de `afterAll`) no deja nada para la corrida siguiente.
    await limpiarComunidadesGD()
    expect(await prisma.comunidad.count({ where: { id: { in: COMUNIDADES_GD } } })).toBe(0)
    expect(
      await prisma.notificacion.count({ where: { comunidadId: { in: COMUNIDADES_GD } } })
    ).toBe(0)
    expect(
      await prisma.entregaNotificacion.count({
        where: { comunidadId: { in: COMUNIDADES_GD } },
      })
    ).toBe(0)
  })
})
