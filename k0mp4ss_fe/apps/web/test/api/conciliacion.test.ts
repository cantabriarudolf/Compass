/**
 * @vitest-environment node
 *
 * F30 — conciliación bancaria por importación de cartola (decisión D1: sin
 * integración bancaria; se importa el archivo que el banco ya exporta).
 *
 * Lo que se fija acá, todo observable por la API y por la base:
 *
 *   1. sin sesión no se importa nada (401) y un rol sin `fi:cobranza` no importa,
 *      no lee ni resuelve (403, cero filas);
 *   2. una cartola con filas ilegibles responde 400, nombra las filas y no
 *      importa NADA — ni la fila buena que venía en el mismo archivo;
 *   3. un movimiento que coincide por referencia y monto queda `conciliado`
 *      contra el registro de la comunidad, con `origen` `autorresuelto`;
 *   4. dos candidatos con el mismo monto dejan el movimiento en la cola
 *      (`no_conciliado`): la ambigüedad la resuelve una persona, no el azar;
 *   5. un cargo no se enlaza con un ingreso aunque el monto coincida;
 *   6. resolver a mano deja `resuelto_manual` con su autor y su referencia, y el
 *      contador de la cartola sigue cerrando (`filas = conciliadas + noConciliadas`);
 *   7. importar dos veces el mismo archivo no rompe: son dos cartolas
 *      independientes (no hay deduplicación por contenido, ver la spec);
 *   8. los candidatos son de la comunidad de la sesión: un egreso de otra
 *      comunidad no enlaza nada acá.
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

const COM_A = "conc-com-a"
const COM_B = "conc-com-b"

const UNIDAD_A = "conc-unidad-a"
const UNIDAD_B = "conc-unidad-b"

const FONDO_A = "conc-fondo-a"
const FONDO_B = "conc-fondo-b"

/**
 * Candidatos de la comunidad A. Los montos están repartidos a propósito: el
 * escenario de ambigüedad necesita DOS candidatos con el mismo monto, y el resto
 * de los escenarios uno solo (o ninguno) para que las reglas se puedan leer.
 */
const EGRESO_REF = "conc-egreso-ref" // 111.111 — se enlaza por folio
const EGRESO_AMB_A = "conc-egreso-amb-a" // 222.222 — duplicado
const EGRESO_AMB_B = "conc-egreso-amb-b" // 222.222 — duplicado
const INGRESO_A = "conc-ingreso-a" // 333.333 — sólo ingreso
const COBRO_A = "conc-cobro-a"
const PAGO_A = "conc-pago-a" // 444.400 — pago de gasto común
const EGRESO_B = "conc-egreso-b" // 999.999 — de la OTRA comunidad

const CARTOLA_B = "conc-cartola-b"
const MOVIMIENTO_B = "conc-movimiento-b"

const EMAIL_ADMIN = "conc-admin@test.cl"
const EMAIL_COMITE = "conc-comite@test.cl"
const EMAIL_RESIDENTE = "conc-residente@test.cl"

const USUARIO_ADMIN = "conc-usuario-admin"

/** Forma del movimiento en la respuesta de las rutas. */
interface MovimientoVista {
  id: string
  cartolaId: string
  fecha: string
  descripcion: string
  referencia: string | null
  contraparte: string | null
  monto: number
  tipo: string
  estado: string
  origen: string | null
  resueltoPor: string | null
  resueltoEn: string | null
  cargoReferencia: string | null
}

/** Forma de la cartola en `GET /api/conciliacion`. */
interface CartolaVista {
  id: string
  nombreArchivo: string
  importadaPor: string
  filas: number
  conciliadas: number
  noConciliadas: number
  movimientos: MovimientoVista[]
}

interface VistaImportacion {
  importados: number
  conciliados: number
  noConciliados: number
}

interface VistaResolucion {
  movimiento: MovimientoVista
  cartola: {
    id: string
    filas: number
    conciliadas: number
    noConciliadas: number
  }
}

/** Encabezado estándar de las cartolas de prueba. */
function cartola(...filas: string[]): string {
  return ["fecha,descripcion,monto,referencia,contraparte", ...filas].join("\n")
}

describe("/api/conciliacion — importación de cartola bancaria (F30)", () => {
  const cargaModulos = async () => ({
    importar: await import("@/app/api/conciliacion/importar/route"),
    lectura: await import("@/app/api/conciliacion/route"),
    resolver: await import("@/app/api/conciliacion/resolver/route"),
  })

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const c of [
      { id: COM_A, nombre: "Comunidad Conciliación A", slug: "conc-com-a" },
      { id: COM_B, nombre: "Comunidad Conciliación B", slug: "conc-com-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    for (const u of [
      {
        id: UNIDAD_A,
        comunidadId: COM_A,
        microSectorId: "conc-ms-a",
        numero: "101",
        etiqueta: "Depto",
        tipoUnidadId: "conc-tu-1",
        metraje: 50,
        prorrateo: 10,
        rolSii: "conc-rol-a",
        estadoId: "habitada",
        servicios: {},
      },
      {
        id: UNIDAD_B,
        comunidadId: COM_B,
        microSectorId: "conc-ms-b",
        numero: "901",
        etiqueta: "Depto",
        tipoUnidadId: "conc-tu-1",
        metraje: 50,
        prorrateo: 10,
        rolSii: "conc-rol-b",
        estadoId: "habitada",
        servicios: {},
      },
    ]) {
      await prisma.unidad.upsert({ where: { id: u.id }, update: {}, create: u })
    }

    // ── candidatos de la comunidad A ────────────────────────────────────────
    await prisma.egresoFI.create({
      data: {
        id: EGRESO_REF,
        comunidadId: COM_A,
        fondoId: FONDO_A,
        folio: "EGR-2026-0001",
        fecha: "2026-03-04",
        categoria: "servicios",
        descripcion: "Mantención de ascensores",
        monto: 111_111,
        esRecurrente: false,
        proveedor: "Ascensores Andinos",
      },
    })
    for (const [id, folio] of [
      [EGRESO_AMB_A, "EGR-2026-0002"],
      [EGRESO_AMB_B, "EGR-2026-0003"],
    ] as const) {
      await prisma.egresoFI.create({
        data: {
          id,
          comunidadId: COM_A,
          fondoId: FONDO_A,
          folio,
          fecha: "2026-03-06",
          categoria: "otro",
          descripcion: "Gasto por el mismo monto que otro",
          monto: 222_222,
          esRecurrente: false,
        },
      })
    }
    await prisma.ingresoFI.create({
      data: {
        id: INGRESO_A,
        comunidadId: COM_A,
        fondoId: FONDO_A,
        fecha: "2026-03-07",
        monto: 333_333,
        concepto: "Aporte extraordinario de fondo de reserva",
      },
    })
    await prisma.cobroFI.create({
      data: {
        id: COBRO_A,
        comunidadId: COM_A,
        unidadId: UNIDAD_A,
        periodo: "2026-03",
        concepto: "Gasto común marzo 2026",
        origenModulo: "emision_gc",
        origenRef: "AVC-2026-03-101",
        fondoId: FONDO_A,
        descripcion: "Gasto común marzo 2026 unidad 101",
        montoBase: 444_400,
        fechaCargo: "2026-03-01",
        fechaVencimiento: "2026-03-10",
        moras: [],
        pagos: [
          {
            id: PAGO_A,
            monto: 444_400,
            fecha: "2026-03-08",
            medio: "transferencia",
          },
        ],
        diferencias: [],
      },
    })

    // ── candidato de la comunidad B: nunca debe enlazar en A ────────────────
    await prisma.egresoFI.create({
      data: {
        id: EGRESO_B,
        comunidadId: COM_B,
        fondoId: FONDO_B,
        folio: "EGR-B-0001",
        fecha: "2026-03-05",
        categoria: "servicios",
        descripcion: "Gasto de la otra comunidad",
        monto: 999_999,
        esRecurrente: false,
      },
    })
    await prisma.cartolaImportada.create({
      data: {
        id: CARTOLA_B,
        comunidadId: COM_B,
        nombreArchivo: "cartola-b.csv",
        importadaPor: "conc-usuario-ajeno",
        filas: 1,
        conciliadas: 0,
        noConciliadas: 1,
        movimientos: {
          create: [
            {
              id: MOVIMIENTO_B,
              comunidadId: COM_B,
              fecha: new Date("2026-03-05T00:00:00.000Z"),
              descripcion: "Movimiento de la otra comunidad",
              monto: 999_999,
              tipo: "cargo",
              estado: "no_conciliado",
            },
          ],
        },
      },
    })

    const usuarios = [
      { id: USUARIO_ADMIN, email: EMAIL_ADMIN, comunidadId: COM_A, rol: "administrador" },
      { id: "conc-usuario-comite", email: EMAIL_COMITE, comunidadId: COM_A, rol: "comite" },
      {
        id: "conc-usuario-residente",
        email: EMAIL_RESIDENTE,
        comunidadId: COM_A,
        rol: "residente",
      },
    ]
    for (const u of usuarios) {
      await prisma.usuario.upsert({
        where: { email: u.email },
        update: {},
        create: { id: u.id, email: u.email, activo: true, personaId: null },
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
      await prisma.movimientoCartola.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.cartolaImportada.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.cobroFI.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.ingresoFI.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.egresoFI.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.unidad.deleteMany({ where: { comunidadId: { in: [COM_A, COM_B] } } })
      await prisma.membresia.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.usuario.deleteMany({
        where: { email: { in: [EMAIL_ADMIN, EMAIL_COMITE, EMAIL_RESIDENTE] } },
      })
      for (const id of [COM_A, COM_B]) {
        await prisma.comunidad.delete({ where: { id } }).catch(() => {})
      }
    } catch {
      // intencional: limpieza best-effort, la base de la suite es descartable
    }
  })

  async function conSesion<T>(email: string, fn: () => Promise<T>): Promise<T> {
    const user = await prisma.usuario.findUnique({ where: { email } })
    if (!user) throw new Error(`usuario no encontrado: ${email}`)
    const { cookieSesionAuthjs } = await import("../helpers/sesion-authjs")
    state.cookie = await cookieSesionAuthjs({ sub: user.id, email: user.email })
    try {
      return await fn()
    } finally {
      state.cookie = ""
    }
  }

  async function POST_IMPORTAR(body: unknown): Promise<Response> {
    const { importar } = await cargaModulos()
    return importar.POST(
      new NextRequest("http://localhost/api/conciliacion/importar", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET_CARTOLAS(): Promise<Response> {
    const { lectura } = await cargaModulos()
    return lectura.GET(new NextRequest("http://localhost/api/conciliacion", { method: "GET" }))
  }

  async function POST_RESOLVER(body: unknown): Promise<Response> {
    const { resolver } = await cargaModulos()
    return resolver.POST(
      new NextRequest("http://localhost/api/conciliacion/resolver", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  /** Importa una cartola con la sesión de la administración y devuelve la vista. */
  async function importarComoAdmin(
    nombreArchivo: string,
    contenido: string
  ): Promise<VistaImportacion> {
    return conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_IMPORTAR({ nombreArchivo, contenido })
      expect(res.status).toBe(201)
      return (await res.json()) as VistaImportacion
    })
  }

  async function cartolasDe(comunidadId: string, nombreArchivo: string) {
    return prisma.cartolaImportada.findMany({
      where: { comunidadId, nombreArchivo },
      orderBy: { createdAt: "asc" },
    })
  }

  it("401 sin sesión en las tres rutas", async () => {
    state.cookie = ""
    expect((await POST_IMPORTAR({ nombreArchivo: "x.csv", contenido: cartola() })).status).toBe(401)
    expect((await GET_CARTOLAS()).status).toBe(401)
    expect(
      (await POST_RESOLVER({ movimientoId: "conc-fantasma", cargoReferencia: "EGR-1" })).status
    ).toBe(401)
    expect(await prisma.cartolaImportada.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("un rol sin `fi:cobranza` no importa, no lee ni resuelve → 403 y cero cartolas", async () => {
    await conSesion(EMAIL_RESIDENTE, async () => {
      expect(
        (await POST_IMPORTAR({ nombreArchivo: "residente.csv", contenido: cartola("2026-03-01,Aporte,1000") }))
          .status
      ).toBe(403)
      expect((await GET_CARTOLAS()).status).toBe(403)
      expect(
        (await POST_RESOLVER({ movimientoId: MOVIMIENTO_B, cargoReferencia: "EGR-1" })).status
      ).toBe(403)
    })

    // El comité AUDITA la cobranza: lee, pero no importa ni resuelve.
    await conSesion(EMAIL_COMITE, async () => {
      expect(
        (await POST_IMPORTAR({ nombreArchivo: "comite.csv", contenido: cartola("2026-03-01,Aporte,1000") }))
          .status
      ).toBe(403)
      expect((await GET_CARTOLAS()).status).toBe(200)
      expect(
        (await POST_RESOLVER({ movimientoId: MOVIMIENTO_B, cargoReferencia: "EGR-1" })).status
      ).toBe(403)
    })

    expect(await prisma.cartolaImportada.count({ where: { comunidadId: COM_A } })).toBe(0)
    expect(await prisma.movimientoCartola.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("una cartola con filas ilegibles es 400 y no importa ni la fila buena", async () => {
    const filasAntes = await prisma.movimientoCartola.count({ where: { comunidadId: COM_A } })

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_IMPORTAR({
        nombreArchivo: "cartola-rota.csv",
        contenido: cartola(
          "2026-03-05,Transferencia buena,-111111,EGR-2026-0001,Ascensores Andinos",
          "31/02/2026,Fecha que no existe,-5000,,"
        ),
      })
      expect(res.status).toBe(400)
      const cuerpo = (await res.json()) as { error: string; errores: string[] }
      expect(cuerpo.error).toBe(
        "La cartola tiene filas inválidas: no se importó ningún movimiento."
      )
      expect(cuerpo.errores).toHaveLength(1)
      expect(cuerpo.errores[0]).toContain("fila 3")
    })

    expect(await cartolasDe(COM_A, "cartola-rota.csv")).toHaveLength(0)
    expect(await prisma.movimientoCartola.count({ where: { comunidadId: COM_A } })).toBe(filasAntes)

    // Un encabezado sin las columnas obligatorias tampoco entra.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_IMPORTAR({
        nombreArchivo: "cartola-sin-columnas.csv",
        contenido: "fecha,referencia\n2026-03-05,OP-1",
      })
      expect(res.status).toBe(400)
    })
    expect(await cartolasDe(COM_A, "cartola-sin-columnas.csv")).toHaveLength(0)

    // El contrato del cuerpo lo valida zod: sin contenido no hay nada que leer.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_IMPORTAR({ nombreArchivo: "cartola-vacia.csv" })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Datos inválidos.")
    })
  })

  it("un movimiento con referencia y monto exactos queda conciliado con el egreso", async () => {
    const vista = await importarComoAdmin(
      "cartola-referencia.csv",
      cartola("2026-03-05,Pago proveedor ascensores,-111111,EGR-2026-0001,Ascensores Andinos")
    )

    expect(vista).toEqual({ importados: 1, conciliados: 1, noConciliados: 0 })

    const cartolas = await cartolasDe(COM_A, "cartola-referencia.csv")
    expect(cartolas).toHaveLength(1)
    const cartolaCreada = cartolas[0]!
    expect(cartolaCreada).toMatchObject({
      comunidadId: COM_A,
      importadaPor: USUARIO_ADMIN,
      filas: 1,
      conciliadas: 1,
      noConciliadas: 0,
    })

    const movimiento = await prisma.movimientoCartola.findFirst({
      where: { cartolaId: cartolaCreada.id },
    })
    expect(movimiento).toMatchObject({
      estado: "conciliado",
      origen: "autorresuelto",
      cargoReferencia: EGRESO_REF,
      tipo: "cargo",
      monto: 111_111,
      referencia: "EGR-2026-0001",
    })
    expect(movimiento?.fecha.toISOString().slice(0, 10)).toBe("2026-03-05")

    const evento = await prisma.eventoAuditoria.findFirst({
      where: {
        comunidadId: COM_A,
        tipoAccion: "FI_CARTOLA_IMPORTADA",
        referenciaId: cartolaCreada.id,
      },
    })
    expect(evento).not.toBeNull()
    expect(evento?.categoria).toBe("FI")
    expect(evento?.descripcion).toContain("cartola-referencia.csv")
  })

  it("un abono se enlaza con el pago del gasto común por la referencia del aviso", async () => {
    const vista = await importarComoAdmin(
      "cartola-gc.csv",
      cartola("2026-03-08,Transferencia unidad 101,444400,AVC-2026-03-101,")
    )

    expect(vista).toEqual({ importados: 1, conciliados: 1, noConciliados: 0 })

    const [cartolaCreada] = await cartolasDe(COM_A, "cartola-gc.csv")
    const movimiento = await prisma.movimientoCartola.findFirst({
      where: { cartolaId: cartolaCreada!.id },
    })
    expect(movimiento?.tipo).toBe("abono")
    expect(movimiento?.estado).toBe("conciliado")
    expect(movimiento?.cargoReferencia).toBe(`${COBRO_A}#${PAGO_A}`)
  })

  it("dos candidatos con el mismo monto dejan el movimiento en la cola", async () => {
    const vista = await importarComoAdmin(
      "cartola-ambigua.csv",
      cartola("2026-03-06,Giro sin referencia,-222222,,")
    )

    expect(vista).toEqual({ importados: 1, conciliados: 0, noConciliados: 1 })

    const [cartolaCreada] = await cartolasDe(COM_A, "cartola-ambigua.csv")
    const movimiento = await prisma.movimientoCartola.findFirst({
      where: { cartolaId: cartolaCreada!.id },
    })
    expect(movimiento).toMatchObject({
      estado: "no_conciliado",
      origen: null,
      cargoReferencia: null,
    })
    expect(cartolaCreada).toMatchObject({ filas: 1, conciliadas: 0, noConciliadas: 1 })
  })

  it("un cargo no se enlaza con un ingreso aunque el monto coincida", async () => {
    const vista = await importarComoAdmin(
      "cartola-cargo-vs-abono.csv",
      cartola("2026-03-07,Giro contra un ingreso registrado,-333333,,")
    )

    expect(vista).toEqual({ importados: 1, conciliados: 0, noConciliados: 1 })

    const [cartolaCreada] = await cartolasDe(COM_A, "cartola-cargo-vs-abono.csv")
    const movimiento = await prisma.movimientoCartola.findFirst({
      where: { cartolaId: cartolaCreada!.id },
    })
    expect(movimiento?.tipo).toBe("cargo")
    expect(movimiento?.estado).toBe("no_conciliado")
    expect(movimiento?.cargoReferencia).toBeNull()
  })

  it("los candidatos son de la comunidad: un egreso de otra comunidad no enlaza acá", async () => {
    const vista = await importarComoAdmin(
      "cartola-scope.csv",
      cartola("2026-03-05,Giro con monto de otra comunidad,-999999,EGR-B-0001,")
    )

    expect(vista).toEqual({ importados: 1, conciliados: 0, noConciliados: 1 })
  })

  it("resolver a mano deja `resuelto_manual` y la cartola sigue cerrando", async () => {
    const vista = await importarComoAdmin(
      "cartola-resolver.csv",
      cartola(
        "2026-03-09,Transferencia sin identificar,555555,,",
        "2026-03-10,Giro sin identificar,-666666,,"
      )
    )
    expect(vista).toEqual({ importados: 2, conciliados: 0, noConciliados: 2 })

    const [cartolaCreada] = await cartolasDe(COM_A, "cartola-resolver.csv")
    const movimientos = await prisma.movimientoCartola.findMany({
      where: { cartolaId: cartolaCreada!.id },
      orderBy: { monto: "asc" },
    })
    expect(movimientos.map((m) => m.estado)).toEqual(["no_conciliado", "no_conciliado"])
    const aResolver = movimientos.find((m) => m.monto === 666_666)!

    const resuelto = await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_RESOLVER({
        movimientoId: aResolver.id,
        cargoReferencia: "EGR-MANUAL-2026-10",
      })
      expect(res.status).toBe(200)
      return (await res.json()) as VistaResolucion
    })

    const enBd = await prisma.movimientoCartola.findUnique({ where: { id: aResolver.id } })
    expect(enBd).toMatchObject({
      estado: "resuelto_manual",
      origen: "manual",
      resueltoPor: USUARIO_ADMIN,
      cargoReferencia: "EGR-MANUAL-2026-10",
    })
    expect(enBd?.resueltoEn).not.toBeNull()

    // El contador de la cartola sigue la misma definición: resolverse a mano es
    // estar conciliado, y `filas` sigue siendo la suma de los dos contadores.
    const cartolaEnBd = await prisma.cartolaImportada.findUnique({
      where: { id: cartolaCreada!.id },
    })
    expect(cartolaEnBd).toMatchObject({ filas: 2, conciliadas: 1, noConciliadas: 1 })
    expect(resuelto.cartola).toMatchObject({ filas: 2, conciliadas: 1, noConciliadas: 1 })

    const evento = await prisma.eventoAuditoria.findFirst({
      where: {
        comunidadId: COM_A,
        tipoAccion: "FI_MOVIMIENTO_CONCILIADO",
        referenciaId: aResolver.id,
      },
    })
    expect(evento).not.toBeNull()
    expect(evento?.descripcion).toContain("EGR-MANUAL-2026-10")

    // Un movimiento ya resuelto no se resuelve dos veces.
    await conSesion(EMAIL_ADMIN, async () => {
      const otraVez = await POST_RESOLVER({
        movimientoId: aResolver.id,
        cargoReferencia: "EGR-MANUAL-2026-11",
      })
      expect(otraVez.status).toBe(409)
      expect(((await otraVez.json()) as { error: string }).error).toBe(
        "El movimiento ya fue resuelto manualmente."
      )
    })
    const sinCambios = await prisma.movimientoCartola.findUnique({ where: { id: aResolver.id } })
    expect(sinCambios?.cargoReferencia).toBe("EGR-MANUAL-2026-10")
  })

  it("un movimiento ya conciliado no se resuelve a mano → 409", async () => {
    const [cartolaCreada] = await cartolasDe(COM_A, "cartola-referencia.csv")
    const conciliado = await prisma.movimientoCartola.findFirst({
      where: { cartolaId: cartolaCreada!.id },
    })

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_RESOLVER({
        movimientoId: conciliado!.id,
        cargoReferencia: "EGR-2026-0001",
      })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "El movimiento ya está conciliado."
      )
    })
  })

  it("el movimiento de otra comunidad es 404 en el resolver", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_RESOLVER({
        movimientoId: MOVIMIENTO_B,
        cargoReferencia: "EGR-B-0001",
      })
      expect(res.status).toBe(404)
      expect(((await res.json()) as { error: string }).error).toBe(
        "Movimiento de cartola no encontrado."
      )
    })
    const ajeno = await prisma.movimientoCartola.findUnique({ where: { id: MOVIMIENTO_B } })
    expect(ajeno?.estado).toBe("no_conciliado")
  })

  it("importar dos veces el mismo archivo crea dos cartolas independientes", async () => {
    const contenido = cartola("2026-03-11,Cargo repetido,-777777,,")
    const primera = await importarComoAdmin("cartola-duplicada.csv", contenido)
    const segunda = await importarComoAdmin("cartola-duplicada.csv", contenido)

    expect(primera).toEqual({ importados: 1, conciliados: 0, noConciliados: 1 })
    expect(segunda).toEqual(primera)

    const cartolas = await cartolasDe(COM_A, "cartola-duplicada.csv")
    expect(cartolas).toHaveLength(2)
    for (const cartolaCreada of cartolas) {
      expect(cartolaCreada).toMatchObject({ filas: 1, conciliadas: 0, noConciliadas: 1 })
      expect(
        await prisma.movimientoCartola.count({ where: { cartolaId: cartolaCreada.id } })
      ).toBe(1)
    }
  })

  it("la lectura devuelve las cartolas de la sesión con sus movimientos y su estado", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await GET_CARTOLAS()
      expect(res.status).toBe(200)
      const cuerpo = (await res.json()) as {
        data: CartolaVista[]
        total: number
        mostrados: number
      }

      const nombres = cuerpo.data.map((c) => c.nombreArchivo)
      expect(nombres).toContain("cartola-resolver.csv")
      expect(nombres).toContain("cartola-duplicada.csv")
      expect(nombres).not.toContain("cartola-b.csv")
      expect(cuerpo.total).toBe(cuerpo.data.length)
      expect(cuerpo.mostrados).toBe(cuerpo.data.length)

      const resolver = cuerpo.data.find((c) => c.nombreArchivo === "cartola-resolver.csv")!
      expect(resolver.filas).toBe(2)
      expect(resolver.conciliadas).toBe(1)
      expect(resolver.noConciliadas).toBe(1)
      expect(resolver.movimientos).toHaveLength(2)
      expect(resolver.movimientos.map((m) => m.estado).sort()).toEqual([
        "no_conciliado",
        "resuelto_manual",
      ])

      const manual = resolver.movimientos.find((m) => m.estado === "resuelto_manual")!
      expect(manual).toMatchObject({
        origen: "manual",
        resueltoPor: USUARIO_ADMIN,
        cargoReferencia: "EGR-MANUAL-2026-10",
        fecha: "2026-03-10",
      })
      expect(manual.resueltoEn).not.toBeNull()

      const enlazado = cuerpo.data
        .find((c) => c.nombreArchivo === "cartola-referencia.csv")!
        .movimientos.find((m) => m.estado === "conciliado")!
      expect(enlazado).toMatchObject({
        tipo: "cargo",
        monto: 111_111,
        origen: "autorresuelto",
        cargoReferencia: EGRESO_REF,
        referencia: "EGR-2026-0001",
      })
    })
  })
})
