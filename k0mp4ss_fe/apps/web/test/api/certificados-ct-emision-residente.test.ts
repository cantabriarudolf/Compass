/**
 * @vitest-environment node
 *
 * F34 — el residente emite SU certificado, y sólo el que la ley le deja.
 *
 * La matriz declaraba tres claves finas (`ct:propio`, `ct:residencia`, `ct:al_dia`)
 * y **ninguna tenía puerta**: el `POST /api/certificados-ct` gateaba con el `ct`
 * genérico, así que el residente podía emitir CUALQUIER tipología. Este arnés fija
 * el reparto por tipología con la ley en la mano (Ley 21.442):
 *
 *  · `residencia` — la ley no regula un «certificado de residencia» (el proyecto de
 *    ley 17737-14, en trámite desde el 25-07-2025, existe justamente para facultar
 *    al ADMINISTRADOR a emitirlo). No hay acto administrativo que usurpar: el
 *    residente emite el suyo, con vínculo vigente y por sus propios datos.
 *  · `al_dia` y `estado_cuenta` — reservados: el art. 20 N° 4 pone en las funciones
 *    del administrador «emitir certificados en lo relativo al estado de deudas de
 *    las unidades» y el art. 15 manda acreditar la calidad de copropietario hábil
 *    «mediante certificado expedido por el administrador o por quien haga sus
 *    veces». El residente consulta (art. 21), no certifica.
 *  · `liquidacion_sueldo` — documento laboral (PL): no es del residente.
 *
 * Orden de compuertas (L14, se respeta): primero `rechazoDeEmisionAjena` (404),
 * después la tipología (403) y recién al final el gate de saldo (409). Si el gate
 * de saldo corriera antes, el rechazo imprimiría el saldo del vecino.
 *
 * Veredicto por relación, no por endpoint: propia → se emite (o 403 si la ley no
 * lo permite), de otra unidad de la misma comunidad → 404 sin confirmar
 * existencia, de otra comunidad → 404.
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

const COM_A = "ctres-com-a"
const COM_B = "ctres-com-b"

const U_PROPIA = "ctres-u-a1" // unidad del residente de la sesión
const U_VECINA = "ctres-u-a2" // otra unidad de la MISMA comunidad, con deuda
const U_B = "ctres-u-b1" // otra comunidad

const P_PROPIA = "ctres-p-a1" // persona del usuario residente (Usuario.personaId)
const P_VECINA = "ctres-p-a2"

const EMAIL = {
  residente: "ctres-residente@test.cl",
  vecino: "ctres-vecino@test.cl",
  admin: "ctres-admin@test.cl",
  comite: "ctres-comite@test.cl",
}

/** Saldo del vecino: el dato que no puede viajar en ningún mensaje al residente. */
const DEUDA_VECINA = 88_000
const COBRO_VECINA = "ctres-cobro-vecina"

const moduloColeccion = () => import("@/app/api/certificados-ct/route")

async function conSesion<T>(email: string, fn: () => Promise<T>): Promise<T> {
  state.cookie = await cookieDeUsuario(email)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

function certificado(
  id: string,
  tipo: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  // Sin folio ni código: los reserva el servidor en una transacción por
  // comunidad. Escribirlos a mano acá chocaría con el índice único
  // `(comunidadId, folio)` y el 409 taparía el veredicto que se quiere observar.
  return {
    id,
    tipo,
    solicitanteNombre: "Ana Propia",
    resumen: `Certificado ${tipo} del arnés F34.`,
    detalle: [{ clave: "Unidad", valor: "101" }],
    fechaEmision: "2026-11-07",
    ...overrides,
  }
}

function emitir(body: Record<string, unknown>) {
  return invocarApi(moduloColeccion(), "POST", "certificados-ct", { body })
}

async function existe(id: string) {
  return prisma.certificadoCT.findUnique({ where: { id } })
}

describe("F34 — emisión del propio certificado por tipología", () => {
  beforeAll(async () => {
    for (const [id, nombre, slug] of [
      [COM_A, "Comunidad F34 A", "ctres-a"],
      [COM_B, "Comunidad F34 B", "ctres-b"],
    ] as const) {
      await prisma.comunidad.upsert({ where: { id }, update: {}, create: { id, nombre, slug } })
    }

    await prisma.certificadoCT.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
    await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
    await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
    await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })

    for (const [id, comunidadId, numero, prorrateo] of [
      [U_PROPIA, COM_A, "101", 0.3],
      [U_VECINA, COM_A, "102", 0.2],
      [U_B, COM_B, "201", 0.4],
    ] as const) {
      await prisma.unidad.create({
        data: {
          id,
          comunidadId,
          microSectorId: `ctres-ms-${comunidadId}`,
          numero,
          etiqueta: `Depto ${numero}`,
          tipoUnidadId: `ctres-tu-${comunidadId}`,
          metraje: 55,
          prorrateo,
          rolSii: `7100-${numero}`,
          estadoId: `ctres-est-${comunidadId}`,
          servicios: {},
        },
      })
    }

    for (const [id, comunidadId, unidadId, nombre] of [
      [P_PROPIA, COM_A, U_PROPIA, "Ana Propia"],
      [P_VECINA, COM_A, U_VECINA, "Beto Vecino"],
    ] as const) {
      const [nombres, apellidos] = nombre.split(" ") as [string, string]
      await prisma.persona.create({
        data: {
          id,
          comunidadId,
          rut: `71000${id.slice(-1)}1-1`,
          nombreCompleto: nombre,
          nombres,
          apellidos,
          email: `${id}@ctres.test.cl`,
          telefonoMovil: "+56911111111",
          estadoCuenta: "activa",
          condicionesEspecialesIds: [],
          roles: ["propietario"],
        },
      })
      await prisma.vinculoUnidad.create({
        data: {
          id: `ctres-v-${id}`,
          comunidadId,
          personaId: id,
          unidadId,
          rol: "propietario",
          fechaInicio: "2026-01-01",
          fechaFin: null,
          permiteVerFinanzas: true,
        },
      })
    }

    // La unidad propia NO tiene cobros: su saldo es 0, así que un 403 en `al_dia`
    // prueba la compuerta de tipología y no la de saldo.
    await prisma.cobroFI.create({
      data: {
        id: COBRO_VECINA,
        comunidadId: COM_A,
        unidadId: U_VECINA,
        periodo: "2026-10",
        concepto: "gasto_comun",
        origenModulo: "manual",
        fondoId: "ctres-fondo-gc",
        descripcion: "GC pendiente de la unidad vecina",
        montoBase: DEUDA_VECINA,
        fechaCargo: "2026-10-01",
        fechaVencimiento: "2026-10-31",
        moras: [],
        pagos: [],
        diferencias: [],
      },
    })

    for (const u of [
      { email: EMAIL.residente, comunidadId: COM_A, rol: "residente", personaId: P_PROPIA },
      { email: EMAIL.vecino, comunidadId: COM_A, rol: "residente", personaId: P_VECINA },
      { email: EMAIL.admin, comunidadId: COM_A, rol: "administrador", personaId: null },
      { email: EMAIL.comite, comunidadId: COM_A, rol: "comite", personaId: null },
    ]) {
      const usuario = await prisma.usuario.upsert({
        where: { email: u.email },
        update: { personaId: u.personaId },
        create: { email: u.email, personaId: u.personaId, activo: true },
      })
      await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
      await prisma.membresia.create({
        data: { usuarioId: usuario.id, comunidadId: u.comunidadId, rol: u.rol },
      })
    }
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.certificadoCT.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      for (const email of Object.values(EMAIL)) {
        const usuario = await prisma.usuario.findUnique({ where: { email } })
        if (!usuario) continue
        await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
        await prisma.usuario.delete({ where: { id: usuario.id } }).catch(() => {})
      }
      await prisma.comunidad.deleteMany({ where: { id: { in: [COM_A, COM_B] } } })
    } catch {
      /* best-effort */
    }
  })

  // ── La tipología que sí puede emitir ──────────────────────────────────────

  it("residencia para su propia unidad y persona → 201, y el documento queda a nombre de la persona de la sesión", async () => {
    await conSesion(EMAIL.residente, async () => {
      const res = await emitir(
        certificado("ctres-res-propia", "residencia", {
          unidadId: U_PROPIA,
          personaId: P_PROPIA,
          solicitanteNombre: "Nombre que manda el cliente",
        })
      )
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      const enBd = await existe("ctres-res-propia")
      expect(enBd?.unidadId).toBe(U_PROPIA)
      // La pertenencia resuelta es la de la BD (el cliente no la inventa).
      expect(enBd?.personaId).toBe(P_PROPIA)
      expect(enBd?.comunidadId).toBe(COM_A)
    })
  })

  it("residencia sin anclar unidad ni persona → 400 y no crea nada", async () => {
    // El certificado de residencia es sobre un vínculo: sin unidad ni persona no
    // hay vínculo que acreditar, así que el residente no puede emitir un documento
    // suelto (la administración conserva su camino, ver el control de gestión).
    await conSesion(EMAIL.residente, async () => {
      const res = await emitir(certificado("ctres-res-suelto", "residencia"))
      expect(res.status).toBe(400)
      expect(await existe("ctres-res-suelto")).toBeNull()
    })
  })

  // ── Las tipologías que NO puede emitir ────────────────────────────────────

  it("al_dia de su propia unidad → 403 y no crea nada (aunque el saldo sea 0)", async () => {
    // La compuerta es la tipología, no el saldo: la unidad propia no tiene cobros,
    // así que un 201 acá significaría que el residente se certificó a sí mismo el
    // «estado de deudas» que el art. 20 N° 4 reserva al administrador.
    await conSesion(EMAIL.residente, async () => {
      const res = await emitir(
        certificado("ctres-al-dia-propia", "al_dia", { unidadId: U_PROPIA })
      )
      expect(res.status).toBe(403)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({ error: "Permiso denegado." })
      expect(await existe("ctres-al-dia-propia")).toBeNull()
    })
  })

  it("estado_cuenta de su propia unidad → 403 y no crea nada", async () => {
    await conSesion(EMAIL.residente, async () => {
      const res = await emitir(
        certificado("ctres-estado-propia", "estado_cuenta", { unidadId: U_PROPIA })
      )
      expect(res.status).toBe(403)
      expect(await existe("ctres-estado-propia")).toBeNull()
    })
  })

  it("liquidacion_sueldo de su propia persona → 403 y no crea nada", async () => {
    // El certificado de remuneraciones es el papel del empleador (PL), no un
    // documento que el residente se extienda a sí mismo.
    await conSesion(EMAIL.residente, async () => {
      const res = await emitir(
        certificado("ctres-liq-propia", "liquidacion_sueldo", { personaId: P_PROPIA })
      )
      expect(res.status).toBe(403)
      expect(await existe("ctres-liq-propia")).toBeNull()
    })
  })

  // ── La relación: ajena, y de otra comunidad ───────────────────────────────

  it("residencia para la unidad vecina → 404 sin confirmar existencia y sin el saldo del vecino", async () => {
    await conSesion(EMAIL.residente, async () => {
      const res = await emitir(
        certificado("ctres-res-vecina", "residencia", {
          unidadId: U_VECINA,
          personaId: P_PROPIA,
        })
      )
      expect(res.status).toBe(404)
      const json = await cuerpoJson<Record<string, unknown>>(res)
      expect(json).toEqual({ error: "Registro no encontrado." })
      // Ni el monto pendiente del vecino ni su id viajan en el rechazo.
      expect(JSON.stringify(json)).not.toContain(String(DEUDA_VECINA))
      expect(JSON.stringify(json)).not.toContain(U_VECINA)
      expect(await existe("ctres-res-vecina")).toBeNull()
      // La fila ajena sigue intacta: el arnés no toca datos de terceros.
      expect(await prisma.cobroFI.findUnique({ where: { id: COBRO_VECINA } })).not.toBeNull()
    })
  })

  it("residencia con la persona vecina → 404 y no crea el documento a nombre de otro", async () => {
    await conSesion(EMAIL.residente, async () => {
      const res = await emitir(
        certificado("ctres-res-persona-ajena", "residencia", {
          unidadId: U_PROPIA,
          personaId: P_VECINA,
        })
      )
      expect(res.status).toBe(404)
      expect(await existe("ctres-res-persona-ajena")).toBeNull()
    })
  })

  it("residencia contra una unidad de otra comunidad → 404", async () => {
    await conSesion(EMAIL.residente, async () => {
      const res = await emitir(
        certificado("ctres-res-otra-comunidad", "residencia", {
          unidadId: U_B,
          personaId: P_PROPIA,
        })
      )
      expect(res.status).toBe(404)
      expect(await existe("ctres-res-otra-comunidad")).toBeNull()
    })
  })

  // ── Lo que NO cambia ──────────────────────────────────────────────────────

  it("la administración emite las cuatro tipologías igual que antes", async () => {
    await conSesion(EMAIL.admin, async () => {
      const casos: Array<[string, string, Record<string, unknown>]> = [
        ["ctres-admin-res", "residencia", { unidadId: U_PROPIA, personaId: P_PROPIA }],
        ["ctres-admin-estado", "estado_cuenta", { unidadId: U_PROPIA }],
        ["ctres-admin-aldia", "al_dia", { unidadId: U_PROPIA }],
        ["ctres-admin-liq", "liquidacion_sueldo", { personaId: P_PROPIA }],
      ]
      for (const [id, tipo, overrides] of casos) {
        const res = await emitir(certificado(id, tipo, overrides))
        expect(res.status, `${tipo}: ${JSON.stringify(await res.clone().json())}`).toBe(201)
        expect(await existe(id)).not.toBeNull()
      }
      // Y sigue sin exigir anclaje: el control de la administración es el de siempre.
      const suelto = await emitir(certificado("ctres-admin-suelto", "residencia"))
      expect(suelto.status).toBe(201)
    })
  })

  it("el comité sigue sin poder emitir (403 por la clave de emisión)", async () => {
    await conSesion(EMAIL.comite, async () => {
      const res = await emitir(
        certificado("ctres-comite-res", "residencia", {
          unidadId: U_PROPIA,
          personaId: P_PROPIA,
        })
      )
      expect(res.status).toBe(403)
      expect(await existe("ctres-comite-res")).toBeNull()
    })
  })

  it("el gate de saldo de la administración no cambió: al_dia con deuda → 409 y sin fila", async () => {
    await conSesion(EMAIL.admin, async () => {
      const res = await emitir(
        certificado("ctres-admin-deuda", "al_dia", { unidadId: U_VECINA })
      )
      expect(res.status).toBe(409)
      expect(String((await cuerpoJson<{ error: string }>(res)).error)).toMatch(/saldo/i)
      expect(await existe("ctres-admin-deuda")).toBeNull()
    })
  })

  it("la lectura del residente no cambió: ve su certificado y no el del vecino", async () => {
    await conSesion(EMAIL.admin, async () => {
      // Un certificado de la unidad vecina, emitido por quien sí puede.
      const res = await emitir(
        certificado("ctres-admin-para-vecina", "estado_cuenta", { unidadId: U_VECINA })
      )
      expect(res.status).toBe(201)
    })
    await conSesion(EMAIL.residente, async () => {
      const lista = await invocarApi(moduloColeccion(), "GET", "certificados-ct?pageSize=100")
      expect(lista.status).toBe(200)
      const json = await cuerpoJson<{ data: Array<{ id: string }> }>(lista)
      const ids = json.data.map((c) => c.id)
      expect(ids).toContain("ctres-res-propia")
      expect(ids).not.toContain("ctres-admin-para-vecina")
    })
  })
})
