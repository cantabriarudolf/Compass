/**
 * @vitest-environment node
 *
 * F29 · T1b — la marca `anuladoEn` se LEE: un cobro anulado ya no es deuda.
 *
 * `POST /api/convenios/anular` marca `CobroFI.anuladoEn` en los cargos de las
 * cuotas impagas y deja esas cuotas en `anulada`. Esta pieza cierra el bucle:
 * un `CobroFI` con `anuladoEn != null` NO es deuda —no suma al saldo, no cuenta
 * para la morosidad, no pone a la unidad en `unidades-con-deuda` y no bloquea
 * un certificado Al Día— y una cuota `anulada` no suma al pendiente de la
 * vista del convenio. Todo observable por la API y por la base:
 *
 *   1. antes de anular la unidad figura en `/api/convenios/unidades-con-deuda`
 *      con la deuda de las cuotas impagas; después de anular, si su ÚNICA deuda
 *      eran los cargos del convenio, sale del listado;
 *   2. una unidad con deuda PROPIA además del convenio sigue en el listado con
 *      su saldo rebajado EXACTAMENTE por el monto de las cuotas anuladas;
 *   3. un cargo SIN `anuladoEn` sigue contando igual que siempre —pin de no
 *      sobre-exclusión: la anulación no encoge la deuda de nadie más;
 *   4. la vista del convenio no hace pasar las cuotas `anulada` por pendiente:
 *      el pendiente baja a cero y las PAGADAS siguen contando como pagadas;
 *   5. con los cargos anulados fuera del saldo, el certificado Al Día de esa
 *      unidad deja de bloquearse (409 → 201).
 *
 * El arnés es el de `convenios-anulacion.test.ts` (alta y anulación por la
 * API); los vencimientos se atrasan en la base —mismo criterio de fixture que
 * `convenios.test.ts`— para que los cargos sean deuda VENCIDA cuando hoy ya
 * pasó, y la morosidad los derive con `estadoDeCobro`.
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

const COM = "anuld-com-a"

/** Una unidad por caso: el alta no permite dos convenios vigentes por unidad. */
const U_A = "anuld-u-a"
const U_B = "anuld-u-b"
const U_C = "anuld-u-c"
const U_D = "anuld-u-d"

const P1 = "anuld-p-1"
const FONDO_GC = "anuld-fondo-gc"
const ACUERDO = "anuld-ac-a"
const EMAIL_ADMIN = "anuld-admin@test.cl"

const centavos = (monto: number): number => Math.round(monto * 100)

function datosPersona(
  id: string,
  comunidadId: string,
  rut: string,
  nombre: string,
  email: string,
  roles: string[] = ["propietario"]
) {
  return {
    id,
    comunidadId,
    rut,
    nombreCompleto: nombre,
    nombres: nombre.split(" ")[0]!,
    apellidos: nombre.split(" ").slice(1).join(" "),
    email,
    telefonoMovil: "+56900000000",
    estadoCuenta: "activa",
    condicionesEspecialesIds: [],
    roles,
  }
}

function datosUnidad(id: string, comunidadId: string, numero: string) {
  return {
    id,
    comunidadId,
    microSectorId: `anuld-ms-${numero}`,
    numero,
    etiqueta: "Depto",
    tipoUnidadId: "anuld-tu-1",
    metraje: 50,
    prorrateo: 10,
    rolSii: `anuld-${numero}`,
    estadoId: "habitada",
    servicios: {},
  }
}

/** Cuerpo mínimo del certificado Al Día sobre una unidad (T20: el papel viaja completo). */
function certificadoAlDia(unidadId: string, id: string, folio: string): Record<string, unknown> {
  return {
    id,
    folio,
    codigoVerificacion: id.toUpperCase(),
    tipo: "al_dia",
    solicitanteNombre: "Deudor Anulado",
    resumen: "Certificado de deuda Al Día",
    detalle: [{ clave: "Unidad", valor: unidadId }],
    fechaEmision: "2026-01-15",
    unidadId,
  }
}

describe("F29 · T1b — un cobro con anuladoEn ya no es deuda", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    await prisma.comunidad.upsert({
      where: { id: COM },
      update: {},
      create: { id: COM, nombre: "Comunidad Anulacion Deuda", slug: "anuld-com-a" },
    })
    await prisma.fondoFI.upsert({
      where: { id: FONDO_GC },
      update: {},
      create: { id: FONDO_GC, comunidadId: COM, nombre: "Fondo de Gasto Común", tipo: "gasto_comun", activo: true },
    })
    await prisma.persona.upsert({
      where: { id: P1 },
      update: {},
      create: datosPersona(P1, COM, "19222222-2", "Deudor Deuda Multiplicada", "anuld-p1@test.cl"),
    })
    for (const u of [datosUnidad(U_A, COM, "101"), datosUnidad(U_B, COM, "102"), datosUnidad(U_C, COM, "103"), datosUnidad(U_D, COM, "104")]) {
      await prisma.unidad.upsert({ where: { id: u.id }, update: {}, create: u })
    }
    for (const id of ["anuld-v-p1-u-a", "anuld-v-p1-u-b", "anuld-v-p1-u-c", "anuld-v-p1-u-d"].map((id, i) => ({
      id,
      unidadId: [U_A, U_B, U_C, U_D][i]!,
    }))) {
      await prisma.vinculoUnidad.upsert({
        where: { id: id.id },
        update: {},
        create: {
          id: id.id,
          comunidadId: COM,
          personaId: P1,
          unidadId: id.unidadId,
          rol: "propietario",
          fechaInicio: "2024-01-01",
          fechaFin: null,
          permiteVerFinanzas: true,
        },
      })
    }
    await prisma.acuerdo.upsert({
      where: { id: ACUERDO },
      update: {},
      create: {
        id: ACUERDO,
        comunidadId: COM,
        cuerpo: "comite",
        materia: "Convenio de pago (Ley 21.442 art. 6) para la anulación y la deuda",
        folio: "AD-2026-9500",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "anuld-usuario-admin",
      },
    })

    await prisma.usuario.upsert({
      where: { email: EMAIL_ADMIN },
      update: {},
      create: { id: "anuld-usuario-admin", email: EMAIL_ADMIN, activo: true, personaId: null },
    })
    await prisma.membresia.deleteMany({ where: { usuarioId: "anuld-usuario-admin" } })
    await prisma.membresia.create({
      data: { usuarioId: "anuld-usuario-admin", comunidadId: COM, rol: "administrador" },
    })
    // La base de la suite es compartida: se parte sin filas propias viejas.
    await prisma.certificadoCT.deleteMany({ where: { comunidadId: COM } })
    await prisma.cobroFI.deleteMany({ where: { comunidadId: COM } })
    await prisma.cuotaConvenio.deleteMany({ where: { comunidadId: COM } })
    await prisma.convenioPago.deleteMany({ where: { comunidadId: COM } })
    await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: COM } })
  }, 30_000)

  afterAll(async () => {
    try {
      state.cookie = ""
      await prisma.certificadoCT.deleteMany({ where: { comunidadId: COM } })
      await prisma.cobroFI.deleteMany({ where: { comunidadId: COM } })
      await prisma.cuotaConvenio.deleteMany({ where: { comunidadId: COM } })
      await prisma.convenioPago.deleteMany({ where: { comunidadId: COM } })
      await prisma.eventoAuditoria.deleteMany({ where: { comunidadId: COM } })
      await prisma.acuerdo.deleteMany({ where: { comunidadId: COM } })
      await prisma.vinculoUnidad.deleteMany({ where: { comunidadId: COM } })
      await prisma.unidad.deleteMany({ where: { comunidadId: COM } })
      await prisma.persona.deleteMany({ where: { comunidadId: COM } })
      await prisma.fondoFI.deleteMany({ where: { comunidadId: COM } })
      await prisma.membresia.deleteMany({ where: { usuarioId: "anuld-usuario-admin" } })
      await prisma.usuario.deleteMany({ where: { email: { in: [EMAIL_ADMIN] } } })
      await prisma.comunidad.delete({ where: { id: COM } }).catch(() => {})
    } catch {
      // intencional: limpieza best-effort, la base de la suite es descartable
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

  async function POST_ANULAR(body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/convenios/anular/route")
    return POST(
      new NextRequest("http://localhost/api/convenios/anular", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function POST_CONVENIO(body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/convenios/route")
    return POST(
      new NextRequest("http://localhost/api/convenios", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  /** GET /api/convenios/unidades-con-deuda — el listado que alimenta el alta. */
  async function GET_UNIDADES_CON_DEUDA(query = ""): Promise<Response> {
    const { GET } = await import("@/app/api/convenios/unidades-con-deuda/route")
    return GET(new NextRequest(`http://localhost/api/convenios/unidades-con-deuda${query}`))
  }

  /** POST /api/certificados-ct — el gate de Al Día (409 con saldo > 0). */
  async function POST_CERTIFICADO(body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/certificados-ct/route")
    return POST(
      new NextRequest("http://localhost/api/certificados-ct", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  /** Alta del convenio por la API: 300.000 en 2 cuotas de 100.000 exactas. */
  async function crearConvenio(unidadId: string): Promise<string> {
    let id: string | null = null
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_CONVENIO({
        unidadId,
        personaId: P1,
        acuerdoId: ACUERDO,
        montoTotal: 300_000,
        numeroCuotas: 2,
        primeraCuota: 100_000,
      })
      expect(res.status).toBe(201)
      id = ((await res.json()) as { id: string }).id
    })
    if (!id) throw new Error(`no se pudo crear el convenio de prueba de ${unidadId}`)
    return id
  }

  /**
   * Fixture de morosidad: las cuotas 1..N del convenio recién creado vencen a
   * futuro (la alta las ancla al día de la suscripción) y un cobroFuture no
   * vencido no es deuda vencida. Se atrasan en la base —mismo criterio del
   * arnés de `convenios.test.ts`— y SIEMPRE en pareja con sus cargos: el
   * `periodo` del cargo es el mes en que vence la cuota, la clave con que la
   * anulación encuentra sus cargos.
   */
  const MESES_ATRASADOS = ["2024-01-05", "2024-02-05"] as const
  async function atrasarConvenio(convenioId: string): Promise<void> {
    const cuotas = await prisma.cuotaConvenio.findMany({
      where: { convenioId, numero: { gt: 0 } },
      orderBy: { numero: "asc" },
    })
    const cargos = await prisma.cobroFI.findMany({
      where: { comunidadId: COM, origenRef: convenioId },
      orderBy: { periodo: "asc" },
    })
    expect(cargos.length).toBe(cuotas.length)
    for (let i = 0; i < cuotas.length; i++) {
      const vencimiento = MESES_ATRASADOS[i]!
      await prisma.cuotaConvenio.update({
        where: { id: cuotas[i]!.id },
        data: { venceEn: new Date(`${vencimiento}T12:00:00.000Z`) },
      })
      await prisma.cobroFI.update({
        where: { id: cargos[i]!.id },
        data: { periodo: vencimiento.slice(0, 7), fechaVencimiento: vencimiento },
      })
    }
  }

  /** Un cargo FI propio (no viene de ningún convenio): sin `origenRef` ni marca. */
  async function crearCargoPropio(unidadId: string, id: string, montoBase: number, periodo: string): Promise<void> {
    const vencimiento = `${periodo}-10`
    await prisma.cobroFI.create({
      data: {
        id,
        comunidadId: COM,
        unidadId,
        periodo,
        concepto: "gasto_comun",
        origenModulo: "manual",
        fondoId: FONDO_GC,
        descripcion: `Cargo FI propio de prueba de ${unidadId}`,
        montoBase,
        fechaCargo: vencimiento,
        fechaVencimiento: vencimiento,
        moras: [],
        pagos: [],
        diferencias: [],
      },
    })
  }

  interface FilaDeuda {
    unidadId: string
    numero: string
    periodosVencidos: number
    deudaVencida: number
  }
  async function leerDeuda(): Promise<{ data: FilaDeuda[]; total: number }> {
    // El cuerpo se captura en un contenedor: la asignación dentro de la sesión
    // es asíncrona y a un `let` suelto el typechecker no le ve la escritura.
    const capturado: { listado: { data: FilaDeuda[]; total: number } | null } = { listado: null }
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await GET_UNIDADES_CON_DEUDA()
      expect(res.status).toBe(200)
      capturado.listado = (await res.json()) as { data: FilaDeuda[]; total: number }
    })
    if (!capturado.listado) throw new Error("el listado de unidades con deuda no respondió")
    return capturado.listado
  }

  it("la unidad cuya única deuda eran los cargos del convenio sale de unidades-con-deuda al anular", async () => {
    const id = await crearConvenio(U_A)
    await atrasarConvenio(id)

    // ANTES: los dos cargos impagos del convenio (100.000 + 100.000) son la
    // deuda vencida de la unidad, en dos períodos.
    const antesDeuda = (await leerDeuda()).data.find((fila) => fila.unidadId === U_A)
    expect(antesDeuda).toBeDefined()
    expect(antesDeuda!.periodosVencidos).toBe(2)
    expect(centavos(antesDeuda!.deudaVencida)).toBe(centavos(200_000))

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_ANULAR({ convenioId: id, motivo: "incumplimiento del plan" })
      expect(res.status).toBe(200)
    })

    // DESPUÉS: la unidad ya no está en el listado —anulado no es deuda—.
    const despues = (await leerDeuda()).data
    expect(despues.map((fila) => fila.unidadId)).not.toContain(U_A)
  })

  it("el saldo de una unidad con deuda propia baja EXACTAMENTE por las cuotas anuladas; un cargo sin anuladoEn sigue contando", async () => {
    // La unidad mixta: 40.000 propios + el convenio de 200.000 impago.
    await crearCargoPropio(U_C, "anuld-cob-c-1", 40_000, "2024-03")
    const idC = await crearConvenio(U_C)
    await atrasarConvenio(idC)

    // La unidad testigo (pin): su único cargo no viene de ningún convenio.
    await crearCargoPropio(U_B, "anuld-cob-b-1", 40_000, "2024-03")

    const antes = (await leerDeuda()).data
    const antesC = antes.find((fila) => fila.unidadId === U_C)
    const antesB = antes.find((fila) => fila.unidadId === U_B)
    expect(antesC).toBeDefined()
    expect(centavos(antesC!.deudaVencida)).toBe(centavos(240_000))
    expect(antesB).toBeDefined()
    expect(centavos(antesB!.deudaVencida)).toBe(centavos(40_000))

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_ANULAR({ convenioId: idC, motivo: "incumplimiento del convenio de la 103" })
      expect(res.status).toBe(200)
    })

    // El saldo rebaja EXACTAMENTE lo de las cuotas anuladas: los cargos del
    // convenio suman 200.000 y la deuda pasa de 240.000 a 40.000. El cargo
    // propio de la unidad (sin `anuladoEn`) sigue contando igual que hoy.
    const despues = (await leerDeuda()).data
    const despuesC = despues.find((fila) => fila.unidadId === U_C)
    const despuesB = despues.find((fila) => fila.unidadId === U_B)
    expect(despuesC).toBeDefined()
    expect(despuesC!.periodosVencidos).toBe(1)
    expect(centavos(despuesC!.deudaVencida)).toBe(centavos(40_000))
    expect(despuesB).toBeDefined()
    expect(centavos(despuesB!.deudaVencida)).toBe(centavos(40_000))

    // En el libro: los cargos del convenio quedaron con la marca; el cargo
    // propio de la unidad mixta y el de la testiga NO (pin de no sobre-exclusión).
    const marcados = await prisma.cobroFI.findMany({
      where: { comunidadId: COM, origenRef: idC, anuladoEn: { not: null } },
      select: { montoBase: true },
    })
    expect(marcados).toHaveLength(2)
    expect(centavos(marcados.reduce((acc, c) => acc + c.montoBase, 0))).toBe(centavos(200_000))
    const propiosSinMarca = await prisma.cobroFI.findMany({
      where: { comunidadId: COM, id: { in: ["anuld-cob-c-1", "anuld-cob-b-1"] } },
      select: { anuladoEn: true },
    })
    expect(propiosSinMarca.map((c) => c.anuladoEn)).toEqual([null, null])
  })

  it("la vista deja de hacer pasar las cuotas anuladas por pendiente y el certificado Al Día deja de bloquearse", async () => {
    const id = await crearConvenio(U_D)
    await atrasarConvenio(id)

    // ANTES: con 200.000 de saldo pendiente, el Al Día de la unidad no se emite.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_CERTIFICADO(certificadoAlDia(U_D, "anuld-ct-cert-antes", "ANULD-CT-ANTES"))
      expect([400, 409]).toContain(res.status)
      expect(String(((await res.json()) as { error: string }).error)).toMatch(/saldo/i)
    })

    // El cuerpo se captura en un contenedor: la asignación dentro de la sesión
    // es asíncrona y a un `let` suelto el typechecker no le ve la escritura
    // (mismo criterio del arnés de `convenios-anulacion.test.ts`).
    const capturado: { cuerpo: Record<string, unknown> | null } = { cuerpo: null }
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_ANULAR({ convenioId: id, motivo: "el deudor vendió la unidad" })
      expect(res.status).toBe(200)
      capturado.cuerpo = (await res.json()) as Record<string, unknown>
    })
    const cuerpo = capturado.cuerpo
    if (!cuerpo) throw new Error("la ruta de anulación no respondió")

    // La vista (rearada desde la base dentro de la transacción) ya no tiene
    // pendiente: las cuotas impagas quedaron `anulada` y NO suman como deuda
    // del convenio; la pagada del suscribir sigue contando como pagada.
    expect(cuerpo.estado).toBe("anulado")
    const cuotas = cuerpo.cuotas as { numero: number; estado: string; pagadaEn: string | null }[]
    expect(cuotas.map((c) => `${c.numero}:${c.estado}`)).toEqual([
      "0:pagada",
      "1:anulada",
      "2:anulada",
    ])
    expect(cuotas.find((c) => c.numero === 0)?.pagadaEn).not.toBeNull()
    const totales = cuerpo.totales as { pagado: number; pendiente: number }
    expect(centavos(totales.pagado)).toBe(centavos(100_000))
    expect(centavos(totales.pendiente)).toBe(centavos(0))

    // DESPUÉS: sin saldo, el certificado Al Día de la unidad se emite.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_CERTIFICADO(certificadoAlDia(U_D, "anuld-ct-cert-despues", "ANULD-CT-DESPUES"))
      expect(res.status).toBe(201)
      const enBd = await prisma.certificadoCT.findUnique({ where: { id: "anuld-ct-cert-despues" } })
      expect(enBd?.unidadId).toBe(U_D)
    })
  })
})
