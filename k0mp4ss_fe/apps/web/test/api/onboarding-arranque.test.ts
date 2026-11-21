/**
 * @vitest-environment node
 *
 * F47 · S5 — el arranque de una comunidad se MIDE contra la base, no se guarda.
 *
 * `GET /api/onboarding` responde los doce pasos del manual de carga inicial en el
 * orden de S2. Este archivo lo ejercita contra la base descartable real (nada de
 * mocks), con dos escenarios que crean sus PROPIAS comunidades para no depender
 * del orden de otras suites:
 *
 *   · comunidad vacía → los doce pasos `pendiente`;
 *   · comunidad con datos mínimos → los pasos que tienen fila `hecho`, el resto
 *     `pendiente`.
 *
 * El catálogo del país (AFP/previsiones) es GLOBAL —la clave primaria del maestro
 * es sólo `id`—, así que su existencia no se puede acotar por comunidad. Para que
 * la comunidad vacía signifique de verdad "sin catálogo" sin importar qué suite
 * corrió antes, el escenario guarda las filas nacionales, las retira mientras mide
 * y las repone tal cual: la base queda como estaba y el test no depende del orden.
 * El caso con datos mínimos vuelve a sembrar filas propias (ids `oa-*`).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { configuracionDefault } from "@/data/admin/configuracion"

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

const COM_VACIA = "oa-comunidad-vacia"
const COM_MINIMA = "oa-comunidad-minima"

const CUENTAS = {
  admin: { id: "oa-usuario-admin", email: "oa-admin@test.cl" },
  vacia: { id: "oa-usuario-vacia", email: "oa-vacia@test.cl" },
  firmante: { id: "oa-usuario-firmante", email: "oa-firmante@test.cl" },
  residente: { id: "oa-usuario-residente", email: "oa-residente@test.cl" },
} as const

/** Los doce pasos, en el orden del manual 41 (S2). El test pina el orden. */
const IDS_PASOS = [
  "maestros-nacionales",
  "tipos-unidad",
  "estados-ocupacion",
  "estructura",
  "personas",
  "vinculos",
  "configuracion",
  "fondos",
  "acuerdo",
  "presupuesto",
  "emision",
  "usuarios",
] as const

const ANIO = new Date().getFullYear()

interface Paso {
  id: string
  titulo: string
  estado: "hecho" | "pendiente"
  detalle: string
  href: string
}

interface RespuestaArranque {
  pasos: Paso[]
  faltantes: number
}

/** Detalle que devuelve cada paso en la comunidad VACÍA, con su id. */
const DETALLE_VACIO: Record<string, string> = {
  "maestros-nacionales": "0 AFP y 0 previsiones de salud",
  "tipos-unidad": "0 tipos de unidad",
  "estados-ocupacion": "0 estados de ocupación",
  estructura: "0 unidades",
  personas: "0 personas en el padrón",
  vinculos: "0 vínculos vigentes",
  configuracion: "Sin fila de configuración",
  fondos: "0 fondos de gasto común activos",
  acuerdo: "0 acuerdos aprobados",
  presupuesto: `0 presupuestos vigentes de ${ANIO}`,
  emision: "0 emisiones de gasto común",
  usuarios: "0 usuarios además de tu cuenta",
}

describe("GET /api/onboarding — arranque medido contra la base (F47 · S1/S2/S4/S5)", () => {
  async function GET(): Promise<Response> {
    const ruta = await import("@/app/api/onboarding/route")
    return ruta.GET()
  }

  async function leer(): Promise<RespuestaArranque> {
    const res = await GET()
    expect(res.status).toBe(200)
    return (await res.json()) as RespuestaArranque
  }

  async function conSesion(email: string, fn: () => Promise<void>): Promise<void> {
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    const usuario = await prisma.usuario.findUnique({ where: { email } })
    if (!usuario) throw new Error(`usuario no encontrado: ${email}`)
    state.cookie = await cookieSesionAuthjs({ sub: usuario.id, email: usuario.email })
    try {
      await fn()
    } finally {
      state.cookie = ""
    }
  }

  /**
   * Corre `fn` sin ninguna fila del catálogo del país y repone la foto exacta al
   * terminar. Es lo que hace determinista la comunidad vacía: el catálogo es
   * global, así que "no existe" se mide sobre la tabla, no sobre la comunidad.
   */
  async function sinCatalogoNacional<T>(fn: () => Promise<T>): Promise<T> {
    const [afps, previsiones] = await Promise.all([
      prisma.afp.findMany(),
      prisma.previsionSalud.findMany(),
    ])
    await prisma.afp.deleteMany({})
    await prisma.previsionSalud.deleteMany({})
    try {
      return await fn()
    } finally {
      if (afps.length > 0) await prisma.afp.createMany({ data: afps })
      if (previsiones.length > 0) await prisma.previsionSalud.createMany({ data: previsiones })
    }
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    await prisma.comunidad.deleteMany({ where: { id: { in: [COM_VACIA, COM_MINIMA] } } })
    await prisma.usuario.deleteMany({
      where: { id: { in: Object.values(CUENTAS).map((c) => c.id) } },
    })

    await prisma.comunidad.create({
      data: { id: COM_VACIA, nombre: "Comunidad arranque vacía", slug: COM_VACIA },
    })
    await prisma.comunidad.create({
      data: { id: COM_MINIMA, nombre: "Comunidad arranque mínima", slug: COM_MINIMA },
    })
    for (const cuenta of Object.values(CUENTAS)) {
      await prisma.usuario.create({
        data: { id: cuenta.id, email: cuenta.email, activo: true },
      })
    }
    // La comunidad vacía tiene UNA sola membresía: la de quien consulta. Es lo
    // que hace que el paso «usuarios» también esté pendiente.
    await prisma.membresia.create({
      data: { usuarioId: CUENTAS.vacia.id, comunidadId: COM_VACIA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: CUENTAS.admin.id, comunidadId: COM_MINIMA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: CUENTAS.firmante.id, comunidadId: COM_MINIMA, rol: "administrador" },
    })
    await prisma.membresia.create({
      data: { usuarioId: CUENTAS.residente.id, comunidadId: COM_MINIMA, rol: "residente" },
    })
  }, 30_000)

  afterAll(async () => {
    state.cookie = ""
    try {
      await prisma.afp.deleteMany({ where: { id: { startsWith: "oa-" } } })
      await prisma.previsionSalud.deleteMany({ where: { id: { startsWith: "oa-" } } })
      await prisma.usuario.updateMany({
        where: { id: { startsWith: "oa-" } },
        data: { personaId: null },
      })
      await prisma.membresia.deleteMany({ where: { comunidadId: { in: [COM_VACIA, COM_MINIMA] } } })
      await prisma.comunidad.deleteMany({ where: { id: { in: [COM_VACIA, COM_MINIMA] } } })
      await prisma.usuario.deleteMany({ where: { id: { startsWith: "oa-" } } })
    } catch {
      // limpieza best-effort: la base descartable se recrea en la próxima corrida
    }
  }, 30_000)

  it("comunidad vacía → los doce pasos `pendiente`, en el orden del manual", async () => {
    await conSesion(CUENTAS.vacia.email, async () => {
      await sinCatalogoNacional(async () => {
        const { pasos, faltantes } = await leer()
        expect(pasos.map((p) => p.id)).toEqual([...IDS_PASOS])
        expect(pasos.map((p) => p.estado)).toEqual(IDS_PASOS.map(() => "pendiente"))
        expect(faltantes).toBe(IDS_PASOS.length)
        // El detalle es el número medido, no una etiqueta: es lo que dice qué falta.
        expect(
          Object.fromEntries(pasos.map((p) => [p.id, p.detalle]))
        ).toEqual(DETALLE_VACIO)
        // Un paso sin enlace no lleva a ninguna pantalla donde hacerlo.
        for (const paso of pasos) {
          expect(paso.titulo.trim().length, `título vacío en ${paso.id}`).toBeGreaterThan(0)
          expect(paso.href.startsWith("/"), `href inválido en ${paso.id}`).toBe(true)
        }
      })
    })
  }, 30_000)

  it("el catálogo del país se enlaza a /admin/maestros y no se reimplementa acá", async () => {
    await conSesion(CUENTAS.vacia.email, async () => {
      await sinCatalogoNacional(async () => {
        const { pasos } = await leer()
        const nacional = pasos.find((p) => p.id === "maestros-nacionales")
        expect(nacional?.href).toBe("/admin/maestros")
      })
    })
  }, 30_000)

  it("comunidad con datos mínimos → `hecho` donde hay fila y `pendiente` donde no", async () => {
    // 1..8 más «usuarios»: lo que el escenario siembra. El acuerdo, el presupuesto
    // y la emisión se dejan sin fila a propósito: son los que siguen pendientes.
    await prisma.afp.create({
      data: { id: "oa-afp", comunidadId: COM_MINIMA, nombre: "AFP Arranque", tasaCotizacion: 10 },
    })
    await prisma.previsionSalud.create({
      data: { id: "oa-prevision", comunidadId: COM_MINIMA, nombre: "FONASA Arranque", tipo: "fonasa" },
    })
    await prisma.tipoUnidad.create({
      data: {
        id: "oa-tipo-unidad",
        comunidadId: COM_MINIMA,
        nombre: "Depto Arranque",
        categoria: "departamento",
        metraje: 55,
        montoBaseGc: 45_000,
        activo: true,
        historialTarifas: [],
      } as never,
    })
    await prisma.estadoOcupacion.create({
      data: {
        id: "oa-estado-ocupacion",
        comunidadId: COM_MINIMA,
        nombre: "Habitada Arranque",
        color: "bg-emerald-500 text-white",
      },
    })
    await prisma.macroSector.create({
      data: { id: "oa-macro", comunidadId: COM_MINIMA, nombre: "Torre Arranque", etiqueta: "Torre" },
    })
    await prisma.microSector.create({
      data: {
        id: "oa-micro",
        comunidadId: COM_MINIMA,
        macroSectorId: "oa-macro",
        nombre: "Piso Arranque",
        etiqueta: "Piso",
      },
    })
    await prisma.unidad.create({
      data: {
        id: "oa-unidad",
        comunidadId: COM_MINIMA,
        microSectorId: "oa-micro",
        numero: "101",
        etiqueta: "Depto",
        tipoUnidadId: "oa-tipo-unidad",
        metraje: 55,
        prorrateo: 0.0125,
        rolSii: "OA-101",
        estadoId: "oa-estado-ocupacion",
        servicios: {},
      } as never,
    })
    // La persona que firma los papeles: es el `administrador` con ficha del padrón
    // del que se deriva el firmante de `GET /api/configuracion`.
    await prisma.persona.create({
      data: {
        id: "oa-persona",
        comunidadId: COM_MINIMA,
        rut: "11111111-1",
        nombreCompleto: "Administradora Arranque",
        nombres: "Administradora",
        apellidos: "Arranque",
        email: "oa-persona@test.cl",
        telefonoMovil: "+56900000001",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["propietario", "directiva"],
      } as never,
    })
    await prisma.usuario.update({
      where: { id: CUENTAS.firmante.id },
      data: { personaId: "oa-persona" },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: "oa-vinculo",
        comunidadId: COM_MINIMA,
        personaId: "oa-persona",
        unidadId: "oa-unidad",
        rol: "propietario",
        fechaInicio: "2024-03-01",
        permiteVerFinanzas: true,
      },
    })
    await prisma.configuracionGlobal.create({
      data: {
        ...configuracionDefault,
        id: "oa-config",
        comunidadId: COM_MINIMA,
        nombreComunidad: "Comunidad arranque mínima",
        administradorResponsable: "",
        rutAdministrador: "",
        smtpPassword: "",
        claveEliminacionMaestro: "",
      },
    })
    await prisma.fondoFI.create({
      data: {
        id: "oa-fondo-gc",
        comunidadId: COM_MINIMA,
        nombre: "Fondo Gasto Común Arranque",
        tipo: "gasto_comun",
        activo: true,
        saldoInicial: 0,
      },
    })

    await conSesion(CUENTAS.admin.email, async () => {
      const { pasos, faltantes } = await leer()
      expect(pasos.map((p) => p.id)).toEqual([...IDS_PASOS])
      const hechos = pasos.filter((p) => p.estado === "hecho").map((p) => p.id)
      const pendientes = pasos.filter((p) => p.estado === "pendiente").map((p) => p.id)
      expect(hechos).toEqual([
        "maestros-nacionales",
        "tipos-unidad",
        "estados-ocupacion",
        "estructura",
        "personas",
        "vinculos",
        "configuracion",
        "fondos",
        "usuarios",
      ])
      expect(pendientes).toEqual(["acuerdo", "presupuesto", "emision"])
      expect(faltantes).toBe(pendientes.length)
      expect(
        Object.fromEntries(pasos.map((p) => [p.id, p.detalle]))
      ).toEqual({
        "maestros-nacionales": "1 AFP y 1 previsión de salud",
        "tipos-unidad": "1 tipo de unidad",
        "estados-ocupacion": "1 estado de ocupación",
        estructura: "1 unidad",
        personas: "1 persona en el padrón",
        vinculos: "1 vínculo vigente",
        configuracion: "Configuración creada · firmante designado",
        fondos: "1 fondo de gasto común activo",
        acuerdo: "0 acuerdos aprobados",
        presupuesto: `0 presupuestos vigentes de ${ANIO}`,
        emision: "0 emisiones de gasto común",
        usuarios: "2 usuarios además de tu cuenta",
      })
    })

    // Y la comunidad vacía sigue vacía: los datos de la mínima están acotados por
    // `comunidadId`, salvo el catálogo del país, que ahora sí existe para todas.
    await conSesion(CUENTAS.vacia.email, async () => {
      const { pasos } = await leer()
      expect(pasos.filter((p) => p.estado === "hecho").map((p) => p.id)).toEqual([
        "maestros-nacionales",
      ])
      expect(pasos.find((p) => p.id === "estructura")?.detalle).toBe("0 unidades")
    })
  }, 30_000)

  it("configuración sin firmante derivado → `pendiente`: la fila sola no alcanza (S2.7)", async () => {
    // La mitad del paso que exige S2.7 es el firmante DERIVADO (membresía administrador
    // con ficha en el padrón). Si sólo se midiera la fila de configuración, este caso
    // pasaría sin que la derivación exista: por eso se quita la ficha de la cuenta que
    // firma, se mide, y se repone.
    await conSesion(CUENTAS.admin.email, async () => {
      try {
        await prisma.usuario.update({
          where: { id: CUENTAS.firmante.id },
          data: { personaId: null },
        })

        const sinFirmante = await leer()
        const configuracion = sinFirmante.pasos.find((p) => p.id === "configuracion")
        expect(configuracion?.estado).toBe("pendiente")
        expect(configuracion?.detalle).toBe("Configuración creada · sin firmante derivado")
        expect(sinFirmante.faltantes).toBe(4)

        // Y se vuelve a `hecho` cuando la ficha reaparece: el estado se computa en
        // cada llamada, no quedó escrito en ninguna parte cuando estaba bien.
        await prisma.usuario.update({
          where: { id: CUENTAS.firmante.id },
          data: { personaId: "oa-persona" },
        })
        const conFirmante = await leer()
        expect(conFirmante.pasos.find((p) => p.id === "configuracion")?.estado).toBe("hecho")
        expect(conFirmante.faltantes).toBe(3)
      } finally {
        await prisma.usuario.update({
          where: { id: CUENTAS.firmante.id },
          data: { personaId: "oa-persona" },
        })
      }
    })
  }, 30_000)

  it("401 sin sesión", async () => {
    state.cookie = ""
    expect((await GET()).status).toBe(401)
  })

  it("403 para un rol sin permiso de administración (S4)", async () => {
    await conSesion(CUENTAS.residente.email, async () => {
      expect((await GET()).status).toBe(403)
    })
  })
})
