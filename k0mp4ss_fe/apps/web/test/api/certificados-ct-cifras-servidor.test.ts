/**
 * @vitest-environment node
 *
 * T20 (S10; R3-001 WARNING de review-699632859da68791) — las cifras del
 * certificado de estado de cuenta las calcula el SERVIDOR.
 *
 * El defecto: «Cobros registrados», «Total cargado» y «Saldo pendiente» se
 * derivaban en el cliente del pad de `cobrosFI`, pedido con `pageSize=100`.
 * Con más de cien cobros el navegador no ve el resto y el papel imprimía un
 * total MÁS BAJO que el real, sin declarar el recorte. El servidor ahora
 * calcula las tres cifras sobre el conjunto completo (Prisma) y las entrega
 * en el `detalle` del registro emitido, que es exactamente lo que imprime el
 * papel (el preview del cliente y el PDF servido leen ese `detalle`).
 *
 * Semilla: 120 cobros en la unidad — 100 de $1.000 y 20 de $2.000, sin
 * pagos ni moras. El total completo es $140.000; el de una primera página de
 * cien filas es $100.000. Si el papel lleva $100.000, el recorte ganó.
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

const COM = "ctcif-com"
const U_DEUDA = "ctcif-u1" // 120 cobros impagos: el caso que el pad recortaba
const U_PAGADA = "ctcif-u2" // 3 cobros con mora y pago completo: la regla
const ADMIN = "ctcif-admin@test.cl"

const COBROS_EN_PAGINA = 100
const COBROS_FUERA = 20
const BASE_EN_PAGINA = 1_000
const BASE_FUERA = 2_000

/** Totales que el servidor debe entregar para U_DEUDA, sobre el conjunto completo. */
const TOTAL_COBROS = COBROS_EN_PAGINA + COBROS_FUERA
const TOTAL_CARGADO = COBROS_EN_PAGINA * BASE_EN_PAGINA + COBROS_FUERA * BASE_FUERA

const moduloColeccion = () => import("@/app/api/certificados-ct/route")

async function conSesion<T>(email: string, fn: () => Promise<T>): Promise<T> {
  state.cookie = await cookieDeUsuario(email)
  try {
    return await fn()
  } finally {
    state.cookie = ""
  }
}

function emitir(body: Record<string, unknown>) {
  return invocarApi(moduloColeccion(), "POST", "certificados-ct", { body })
}

function certificado(
  id: string,
  tipo: string,
  detalle: { clave: string; valor: string }[],
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  // Sin folio ni código: los reserva el servidor (el índice único de folios
  // es por comunidad y escribirlos a mano produce un 409 ajeno a este arnés).
  return {
    id,
    tipo,
    unidadId: U_DEUDA,
    solicitanteNombre: "QA T20",
    resumen: `Certificado ${tipo} del arnés T20.`,
    detalle,
    fechaEmision: "2026-11-15",
    ...overrides,
  }
}

/** Las filas del `detalle` como las manda el CLIENTE VIEJO: pad recortado a 100. */
const DETALLE_CLIENTE_RECORTADO = [
  { clave: "Unidad", valor: "Depto 101" },
  { clave: "Propietario", valor: "—" },
  { clave: "Cobros registrados", valor: String(COBROS_EN_PAGINA) },
  { clave: "Total cargado", valor: `$${(COBROS_EN_PAGINA * BASE_EN_PAGINA).toLocaleString("es-CL")}` },
  { clave: "Saldo pendiente", valor: `$${(COBROS_EN_PAGINA * BASE_EN_PAGINA).toLocaleString("es-CL")}` },
]

/** Las filas que el CLIENTE NUEVO manda: sólo identidad, ninguna cifra. */
const DETALLE_CLIENTE_NUEVO = [
  { clave: "Unidad", valor: "Depto 101" },
  { clave: "Propietario", valor: "—" },
]

/** Las tres filas que el servidor debe entregar para U_DEUDA, completas. */
const CIFRAS_COMPLETAS = [
  { clave: "Cobros registrados", valor: String(TOTAL_COBROS) },
  { clave: "Total cargado", valor: `$${TOTAL_CARGADO.toLocaleString("es-CL")}` },
  { clave: "Saldo pendiente", valor: `$${TOTAL_CARGADO.toLocaleString("es-CL")}` },
]

type FilaDetalle = { clave: string; valor: string }

async function detalleEnBd(id: string): Promise<FilaDetalle[]> {
  const fila = await prisma.certificadoCT.findUnique({ where: { id } })
  expect(fila, `el certificado ${id} debe existir en BD`).not.toBeNull()
  return (fila?.detalle ?? []) as FilaDetalle[]
}

describe("T20 — las cifras del estado de cuenta las calcula el servidor", () => {
  beforeAll(async () => {
    await prisma.comunidad.upsert({
      where: { id: COM },
      update: {},
      create: { id: COM, nombre: "Comunidad Cifras T20", slug: "ctcif" },
    })
    await prisma.certificadoCT.deleteMany({ where: { comunidadId: COM } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: COM } })
    await prisma.unidad.deleteMany({ where: { comunidadId: COM } })

    for (const [id, numero] of [
      [U_DEUDA, "101"],
      [U_PAGADA, "102"],
    ] as const) {
      await prisma.unidad.create({
        data: {
          id,
          comunidadId: COM,
          microSectorId: `ctcif-ms-${id}`,
          numero,
          etiqueta: "Depto",
          tipoUnidadId: `ctcif-tu-${id}`,
          metraje: 55,
          prorrateo: 0.1,
          rolSii: `7100-${numero}`,
          estadoId: `ctcif-est-${id}`,
          servicios: {},
        },
      })
    }

    // 120 cobros impagos en U_DEUDA: el total completo (140.000) NO es el de
    // la primera página de cien filas (100.000).
    for (let i = 1; i <= TOTAL_COBROS; i++) {
      const enPagina = i <= COBROS_EN_PAGINA
      await prisma.cobroFI.create({
        data: {
          id: `ctcif-c-${String(i).padStart(3, "0")}`,
          comunidadId: COM,
          unidadId: U_DEUDA,
          periodo: "2026-01",
          concepto: "gasto_comun",
          origenModulo: "manual",
          fondoId: "ctcif-fondo-gc",
          descripcion: "GC del arnés T20",
          montoBase: enPagina ? BASE_EN_PAGINA : BASE_FUERA,
          fechaCargo: "2026-01-01",
          fechaVencimiento: "2026-01-31",
          moras: [],
          pagos: [],
          diferencias: [],
        },
      })
    }

    // U_PAGADA: la regla de «cargado» y «pagado» con mora y pago completo.
    // Cargado = montoBase + mora = 1.500 por cobro; pagado = 1.500 ⇒ saldo 0.
    for (let i = 1; i <= 3; i++) {
      await prisma.cobroFI.create({
        data: {
          id: `ctcif-p-${i}`,
          comunidadId: COM,
          unidadId: U_PAGADA,
          periodo: "2026-02",
          concepto: "gasto_comun",
          origenModulo: "manual",
          fondoId: "ctcif-fondo-gc",
          descripcion: "GC pagado del arnés T20",
          montoBase: 1_000,
          fechaCargo: "2026-02-01",
          fechaVencimiento: "2026-02-28",
          moras: [
            {
              id: `ctcif-p-mora-${i}`,
              monto: 500,
              diasAtraso: 5,
              tasaMensualPct: 1,
              fecha: "2026-03-05",
            },
          ],
          pagos: [
            {
              id: `ctcif-p-pago-${i}`,
              monto: 1_500,
              fecha: "2026-03-01",
              medio: "transferencia",
            },
          ],
          diferencias: [],
        },
      })
    }

    const usuario = await prisma.usuario.upsert({
      where: { email: ADMIN },
      update: { personaId: null },
      create: { email: ADMIN, personaId: null, activo: true },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, comunidadId: COM, rol: "administrador" },
    })
  }, 60_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.certificadoCT.deleteMany({ where: { comunidadId: COM } })
      await prisma.cobroFI.deleteMany({ where: { comunidadId: COM } })
      await prisma.unidad.deleteMany({ where: { comunidadId: COM } })
      const usuario = await prisma.usuario.findUnique({ where: { email: ADMIN } })
      if (usuario) {
        await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } })
        await prisma.usuario.delete({ where: { id: usuario.id } }).catch(() => {})
      }
      await prisma.comunidad.deleteMany({ where: { id: COM } })
    } catch {
      /* best-effort */
    }
  })

  it("estado_cuenta con las filas recortadas del cliente viejo → el servidor las corrige con el total completo", async () => {
    // El cliente viejo derivaba las cifras del pad paginado y las mandaba en el
    // payload: con 120 cobros imprimía $100.000 (primera página) en el papel.
    // El servidor es quien calcula: las filas que llegan con esas claves se
    // reemplazan por las del conjunto completo.
    await conSesion(ADMIN, async () => {
      const res = await emitir(
        certificado("ctcif-estado-recortado", "estado_cuenta", DETALLE_CLIENTE_RECORTADO)
      )
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      const respuesta = (await cuerpoJson<{ detalle: FilaDetalle[] }>(res)).detalle
      expect(respuesta).toEqual([...DETALLE_CLIENTE_NUEVO, ...CIFRAS_COMPLETAS])
      expect(await detalleEnBd("ctcif-estado-recortado")).toEqual([
        ...DETALLE_CLIENTE_NUEVO,
        ...CIFRAS_COMPLETAS,
      ])
    })
  })

  it("estado_cuenta sin filas de cifras (cliente nuevo) → el servidor las agrega completas", async () => {
    // Contrato nuevo: el cliente manda identidad (unidad y propietario) y el
    // servidor entrega las tres cifras calculadas sobre TODOS los cobros.
    await conSesion(ADMIN, async () => {
      const res = await emitir(
        certificado("ctcif-estado-nuevo", "estado_cuenta", DETALLE_CLIENTE_NUEVO)
      )
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      const respuesta = (await cuerpoJson<{ detalle: FilaDetalle[] }>(res)).detalle
      expect(respuesta).toEqual([...DETALLE_CLIENTE_NUEVO, ...CIFRAS_COMPLETAS])
      expect(await detalleEnBd("ctcif-estado-nuevo")).toEqual([
        ...DETALLE_CLIENTE_NUEVO,
        ...CIFRAS_COMPLETAS,
      ])
    })
  })

  it("al_dia de una unidad pagada: la mora suma al cargado y el pago completo deja saldo $0", async () => {
    // La regla de «cargado» y «pagado» que aplica el servidor es la misma del
    // cliente (`lib/finanzas-utils.ts`): cargado = montoBase + Σ moras; saldo =
    // max(0, cargado − Σ pagos). Tres cobros de 1.000 + mora 500, pagados con
    // 1.500 ⇒ 3 cobros, $4.500 cargados, $0 pendientes, y el gate deja emitir.
    await conSesion(ADMIN, async () => {
      const res = await emitir(
        certificado("ctcif-aldia-pagada", "al_dia", DETALLE_CLIENTE_NUEVO, {
          unidadId: U_PAGADA,
        })
      )
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      const esperado = [
        ...DETALLE_CLIENTE_NUEVO,
        { clave: "Cobros registrados", valor: "3" },
        { clave: "Total cargado", valor: "$4.500" },
        { clave: "Saldo pendiente", valor: "$0" },
      ]
      expect((await cuerpoJson<{ detalle: FilaDetalle[] }>(res)).detalle).toEqual(esperado)
      expect(await detalleEnBd("ctcif-aldia-pagada")).toEqual(esperado)
    })
  })

  it("el gate Al Día no cambió: al_dia con deuda fuera de página → 409 con el monto completo y sin fila", async () => {
    // PRESERVE: el gate ya calculaba sobre el conjunto completo; se fija que el
    // monto del rechazo es el de los 120 cobros ($140.000), el mismo que el
    // papel mostraría en «Saldo pendiente» si la unidad calificara.
    await conSesion(ADMIN, async () => {
      const res = await emitir(
        certificado("ctcif-aldia-deuda", "al_dia", DETALLE_CLIENTE_NUEVO)
      )
      expect(res.status).toBe(409)
      expect(await cuerpoJson<{ error: string }>(res)).toEqual({
        error: `No se puede emitir: la unidad mantiene $${TOTAL_CARGADO.toLocaleString("es-CL")} pendiente(s). El certificado Al Día exige saldo <= 0.`,
      })
      expect(await prisma.certificadoCT.findUnique({ where: { id: "ctcif-aldia-deuda" } })).toBeNull()
    })
  })
})
