/**
 * @vitest-environment node
 *
 * F28 — corte de servicios por morosidad (Ley 21.442 art. 20 N°9).
 *
 * El corte no es una decisión que el sistema pueda inventar: la ley exige TRES O
 * MÁS cuotas impagas, ACUERDO DEL COMITÉ aprobado, AVISO AL DEUDOR con CINCO DÍAS
 * CORRIDOS de anticipación, y lo PROHÍBE en unidades donde resida una persona
 * electrodependiente y mientras otro servicio esté suspendido. Lo que se fija acá,
 * todo observable por la API y por la base:
 *
 *   1. sin sesión no se toca nada (401) y un rol sin `fi:cobranza` no preavisa,
 *      ejecuta, revoca ni lee cortes (403, cero filas);
 *   2. sin un acuerdo APROBADO del Comité —abierto, de asamblea o inexistente— el
 *      preaviso responde 400 con su motivo y no deja ninguna fila;
 *   3. la electrodependencia bloquea SIEMPRE (400 con el motivo, cero filas) y la
 *      unidad se resuelve en la comunidad (la ajena es 404);
 *   4. la morosidad se DERIVA de los cobros de la unidad —el cuerpo de la petición
 *      no la declara— y con menos de tres cuotas VENCIDAS el preaviso es 400 y no
 *      escribe, mande lo que mande el cliente en el cuerpo;
 *   5. el preaviso válido es 201 y su `fechaHabilitada` es el quinto día corrido
 *      contado desde el día del preaviso (ese día no cuenta);
 *   6. el corte no se ejecuta antes del quinto día (400, la fila queda en preaviso)
 *      y sí se ejecuta cumplido el plazo (200, estado `ejecutado`, auditado);
 *   7. no se preavisa un segundo servicio mientras uno esté suspendido (409) ni se
 *      repite el mismo servicio (409);
 *   8. revocar deja el corte en `revocado` (200, auditado) y no se revoca dos veces
 *      (409);
 *   9. la lectura devuelve los cortes de la comunidad de la sesión con su estado y
 *      sus fechas;
 *  10. el preaviso EMITE el requerimiento escrito (S8): un `Documento` legal con su
 *      archivo real —cuyos bytes servidos son un PDF de verdad— y la constancia de
 *      entrega al propietario vigente, en `pendiente` porque ningún envío se cursó;
 *      sin propietario vigente el preaviso se cursa igual y la respuesta dice por
 *      qué la constancia no existe.
 */
import { createHash } from "node:crypto"
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { cortePermitido } from "@/lib/cortes-servicio"
import { definicionDelRequerimiento } from "@/lib/requerimiento-corte"

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

const COM_A = "cse-com-a"
const COM_B = "cse-com-b"

/** Unidad morosa normal: el corte de electricidad se preavisa y se ejecuta acá. */
const U_MORA = "cse-u-mora"
/** Unidad con una persona electrodependiente: el corte está prohibido. */
const U_ELECTRO = "cse-u-electro"
/** Unidad de la OTRA comunidad: la lectura del scope no puede verla. */
const U_OTRA = "cse-u-otra"
/** Unidad sin electrodependiente al preavisar: el dato se registra DESPUÉS. */
const U_TARDIO = "cse-u-tardio"
/** Unidad con UNA sola cuota vencida: no llega al mínimo legal. */
const U_UNO = "cse-u-uno"
/** Unidad con DOS cuotas vencidas: tampoco llega al mínimo legal. */
const U_DOS = "cse-u-dos"
/** Unidad sin ningún cobro emitido: cero cuotas vencidas. */
const U_SIN_DEUDA = "cse-u-sin-deuda"
/** Tres cuotas EMITIDAS con una pagada: sólo dos están vencidas. */
const U_TRES_CON_PAGO = "cse-u-tres-pagado"
/** Cuatro cuotas vencidas: la deuda derivada manda sobre lo que declare el cliente. */
const U_CUATRO = "cse-u-cuatro"
/** Unidad con propietario VIGENTE: el preaviso emite requerimiento y constancia. */
const U_CON_PROPIETARIO = "cse-u-con-propietario"
/** Unidad sin ningún propietario vigente: la constancia no se puede crear. */
const U_SIN_PROPIETARIO = "cse-u-sin-propietario"

/** Propietario vigente de U_CON_PROPIETARIO (rol `propietario`, fechaFin null). */
const PROPIETARIO_VIGENTE = "cse-persona-propietario"
const VINCULO_PROPIETARIO = "cse-vinculo-propietario"

/** Fondo de gasto común al que los cobros de la fixture imputan (`CobroFI.fondoId`). */
const FONDO_GC = "cse-fondo-gc"

/** Acuerdo del Comité que autoriza el corte de la unidad U_MORA. */
const ACUERDO_OK = "cse-ac-ok"
const ACUERDO_OK_ELECTRO = "cse-ac-ok-electro"
const ACUERDO_OK_CUATRO = "cse-ac-ok-cuatro"
const ACUERDO_ABIERTO = "cse-ac-abierto"
const ACUERDO_ASAMBLEA = "cse-ac-asamblea"
const ACUERDO_OTRA_COMUNIDAD = "cse-ac-b"
const ACUERDO_OK_TARDIO = "cse-ac-ok-tardio"
const ACUERDO_OK_PROPIETARIO = "cse-ac-ok-propietario"
const ACUERDO_OK_SIN_PROPIETARIO = "cse-ac-ok-sin-propietario"

const EMAIL_ADMIN = "cse-admin@test.cl"
const EMAIL_COMITE = "cse-comite@test.cl"
const EMAIL_RESIDENTE = "cse-residente@test.cl"

/** Corte de la OTRA comunidad, escrito directo en la base. */
const CORTE_COM_B = "cse-corte-b"

/** Milisegundos de un día: el plazo del preaviso son días corridos. */
const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Inicio del día UTC: lo que la regla llama «el quinto día». */
function inicioDelDiaUTC(fecha: Date): number {
  return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate())
}

/**
 * Período AAAA-MM de hace `meses` meses (UTC), contado desde hoy: la fixture no
 * fija fechas absolutas, así el vencimiento de los cobros no depende del día en
 * que corre la suite.
 */
function periodoHaceMeses(meses: number): string {
  const hoy = new Date()
  const fecha = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - meses, 1)
  )
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * Cobro FI REAL de la fixture: el vencimiento cae el día 10 del período, así que
 * todo período pasado cuenta como vencido (`estadoDeCobro`) mientras quede saldo.
 */
function cobroDeLaUnidad(opciones: {
  id: string
  unidadId: string
  periodo: string
  montoBase: number
  pagos?: Array<{ id: string; monto: number; fecha: string; medio: string }>
}) {
  const { id, unidadId, periodo, montoBase } = opciones
  return {
    id,
    comunidadId: COM_A,
    unidadId,
    periodo,
    concepto: "gasto_comun",
    origenModulo: "FI",
    fondoId: FONDO_GC,
    descripcion: `Gasto Común ${periodo}`,
    montoBase,
    lineas: [{ concepto: "gasto_comun", monto: montoBase, fondoId: FONDO_GC }],
    fechaCargo: `${periodo}-01`,
    fechaVencimiento: `${periodo}-10`,
    moras: [],
    pagos: opciones.pagos ?? [],
    diferencias: [],
  }
}

/**
 * Constancia de entrega del requerimiento, tal como viaja en el alta del preaviso.
 *
 * `id: null` significa que NO existe la fila: la unidad no tiene propietario
 * vigente y el sistema no inventa un destinatario. `estado` es el estado
 * PERSISTIDO de `envios_documento` y por eso también es `null` cuando no hay fila.
 */
interface ConstanciaDeLaVista {
  id: string | null
  estado: string | null
  personaId: string | null
  motivo: string | null
}

/** La vista del corte más la constancia del preaviso (sólo la devuelve el alta). */
interface VistaPreaviso extends VistaCorte {
  documentoId: string | null
  constancia: ConstanciaDeLaVista
}

/** Forma de la vista que devuelven las cuatro rutas. */
interface VistaCorte {
  id: string
  unidadId: string
  unidadNumero: string | null
  servicio: string
  acuerdoId: string
  acuerdoFolio: string | null
  cuotasImpagas: number
  montoAdeudado: number
  fechaPreaviso: string
  fechaHabilitada: string
  estado: string
  ejecutadoPor: string | null
  ejecutadoEn: string | null
  revocadoPor: string | null
  revocadoEn: string | null
  motivo: string | null
  creadoPor: string
}

function datosUnidad(
  id: string,
  comunidadId: string,
  numero: string,
  electrodependiente = false
) {
  return {
    id,
    comunidadId,
    microSectorId: `cse-ms-${numero}`,
    numero,
    etiqueta: "Depto",
    tipoUnidadId: "cse-tu-1",
    metraje: 50,
    prorrateo: 10,
    rolSii: `cse-${numero}`,
    estadoId: "habitada",
    servicios: {},
    electrodependiente,
  }
}

describe("/api/cortes-servicio — corte de servicios por morosidad (F28)", () => {
  const cargaModulos = async () => ({
    coleccion: await import("@/app/api/cortes-servicio/route"),
    ejecutar: await import("@/app/api/cortes-servicio/ejecutar/route"),
    revocar: await import("@/app/api/cortes-servicio/revocar/route"),
    requerimiento: await import("@/app/api/cortes-servicio/requerimiento/route"),
  })

  /** Preaviso que la unidad morosa cursa en el caso 5: la fila que el resto usa. */
  let cortePreavisado: VistaCorte | null = null

  beforeAll(async () => {
    process.env.AUTH_SECRET = AUTH_SECRET

    for (const c of [
      { id: COM_A, nombre: "Comunidad Cortes A", slug: "cse-com-a" },
      { id: COM_B, nombre: "Comunidad Cortes B", slug: "cse-com-b" },
    ]) {
      await prisma.comunidad.upsert({ where: { id: c.id }, update: {}, create: c })
    }

    for (const u of [
      datosUnidad(U_MORA, COM_A, "201"),
      datosUnidad(U_ELECTRO, COM_A, "202", true),
      datosUnidad(U_TARDIO, COM_A, "203"),
      datosUnidad(U_UNO, COM_A, "204"),
      datosUnidad(U_DOS, COM_A, "205"),
      datosUnidad(U_SIN_DEUDA, COM_A, "206"),
      datosUnidad(U_TRES_CON_PAGO, COM_A, "207"),
      datosUnidad(U_CUATRO, COM_A, "208"),
      datosUnidad(U_CON_PROPIETARIO, COM_A, "209"),
      datosUnidad(U_SIN_PROPIETARIO, COM_A, "210"),
      datosUnidad(U_OTRA, COM_B, "901"),
    ]) {
      await prisma.unidad.upsert({ where: { id: u.id }, update: {}, create: u })
    }

    // El destinatario de la constancia es el propietario VIGENTE de la unidad, el
    // mismo criterio del resto del módulo (`propietarioVigenteDeUnidad`): rol
    // `propietario` y `fechaFin` null. U_SIN_PROPIETARIO no tiene ninguno y eso es
    // parte del caso: sin destinatario no se inventa una entrega.
    await prisma.vinculoUnidad.deleteMany({ where: { id: VINCULO_PROPIETARIO } })
    await prisma.persona.deleteMany({ where: { id: PROPIETARIO_VIGENTE } })
    await prisma.persona.create({
      data: {
        id: PROPIETARIO_VIGENTE,
        comunidadId: COM_A,
        rut: "11.111.111-1",
        nombreCompleto: "Propietario Vigente Cortes",
        nombres: "Propietario",
        apellidos: "Vigente Cortes",
        email: "cse-propietario@test.cl",
        telefonoMovil: "+56 9 1111 1111",
        estadoCuenta: "activa",
        condicionesEspecialesIds: [],
        roles: ["residente"],
      },
    })
    await prisma.vinculoUnidad.create({
      data: {
        id: VINCULO_PROPIETARIO,
        comunidadId: COM_A,
        personaId: PROPIETARIO_VIGENTE,
        unidadId: U_CON_PROPIETARIO,
        rol: "propietario",
        fechaInicio: "2025-01-01",
        permiteVerFinanzas: true,
        puedeDeclararRegistro: false,
      },
    })

    // La morosidad que habilita el corte NO se declara en el cuerpo: la DERIVA la
    // ruta de los cobros reales de la unidad (`morosidadPorUnidad`), así que la
    // fixture tiene que sembrar los cobros que la ley cuenta. Se rehacen en cada
    // corrida para que un cobro viejo con otro monto no mueva el resultado.
    await prisma.cobroFI.deleteMany({
      where: { comunidadId: { in: [COM_A, COM_B] } },
    })
    const cobros = [
      // U_MORA: tres períodos vencidos que suman exactamente $1.234.567, la deuda
      // que la fila guarda como snapshot y la que la bitácora escribe.
      cobroDeLaUnidad({ id: "cse-cfi-mora-1", unidadId: U_MORA, periodo: periodoHaceMeses(3), montoBase: 411_522 }),
      cobroDeLaUnidad({ id: "cse-cfi-mora-2", unidadId: U_MORA, periodo: periodoHaceMeses(2), montoBase: 411_522 }),
      cobroDeLaUnidad({ id: "cse-cfi-mora-3", unidadId: U_MORA, periodo: periodoHaceMeses(1), montoBase: 411_523 }),
      // U_ELECTRO: diez períodos vencidos, para que la electrodependencia bloquee
      // CON deuda de sobra y no porque falten cuotas.
      ...Array.from({ length: 10 }, (_, indice) =>
        cobroDeLaUnidad({
          id: `cse-cfi-electro-${indice + 1}`,
          unidadId: U_ELECTRO,
          periodo: periodoHaceMeses(10 - indice),
          montoBase: 50_000,
        })
      ),
      // U_TARDIO: tres vencidas, para que el preaviso del último caso sea 201 y la
      // electrodependencia se registre DESPUÉS.
      cobroDeLaUnidad({ id: "cse-cfi-tardio-1", unidadId: U_TARDIO, periodo: periodoHaceMeses(3), montoBase: 30_000 }),
      cobroDeLaUnidad({ id: "cse-cfi-tardio-2", unidadId: U_TARDIO, periodo: periodoHaceMeses(2), montoBase: 30_000 }),
      cobroDeLaUnidad({ id: "cse-cfi-tardio-3", unidadId: U_TARDIO, periodo: periodoHaceMeses(1), montoBase: 30_000 }),
      // U_UNO: una sola cuota vencida.
      cobroDeLaUnidad({ id: "cse-cfi-uno-1", unidadId: U_UNO, periodo: periodoHaceMeses(1), montoBase: 40_000 }),
      // U_DOS: dos cuotas vencidas.
      cobroDeLaUnidad({ id: "cse-cfi-dos-1", unidadId: U_DOS, periodo: periodoHaceMeses(2), montoBase: 60_000 }),
      cobroDeLaUnidad({ id: "cse-cfi-dos-2", unidadId: U_DOS, periodo: periodoHaceMeses(1), montoBase: 60_000 }),
      // U_TRES_CON_PAGO: tres cuotas emitidas; la última está pagada ENTERA, así
      // que su estado es `pagado` y no cuenta como vencida.
      cobroDeLaUnidad({ id: "cse-cfi-tres-1", unidadId: U_TRES_CON_PAGO, periodo: periodoHaceMeses(3), montoBase: 45_000 }),
      cobroDeLaUnidad({ id: "cse-cfi-tres-2", unidadId: U_TRES_CON_PAGO, periodo: periodoHaceMeses(2), montoBase: 45_000 }),
      cobroDeLaUnidad({
        id: "cse-cfi-tres-3",
        unidadId: U_TRES_CON_PAGO,
        periodo: periodoHaceMeses(1),
        montoBase: 45_000,
        pagos: [
          {
            id: "cse-pago-tres-1",
            monto: 45_000,
            fecha: `${periodoHaceMeses(1)}-20`,
            medio: "transferencia",
          },
        ],
      }),
      // U_CUATRO: cuatro períodos vencidos por $450.000 en total.
      cobroDeLaUnidad({ id: "cse-cfi-cuatro-1", unidadId: U_CUATRO, periodo: periodoHaceMeses(4), montoBase: 100_000 }),
      cobroDeLaUnidad({ id: "cse-cfi-cuatro-2", unidadId: U_CUATRO, periodo: periodoHaceMeses(3), montoBase: 100_000 }),
      cobroDeLaUnidad({ id: "cse-cfi-cuatro-3", unidadId: U_CUATRO, periodo: periodoHaceMeses(2), montoBase: 100_000 }),
      cobroDeLaUnidad({ id: "cse-cfi-cuatro-4", unidadId: U_CUATRO, periodo: periodoHaceMeses(1), montoBase: 150_000 }),
      // U_CON_PROPIETARIO: tres períodos vencidos por $300.000, el papel que emite
      // el preaviso tiene que imprimir ese monto.
      cobroDeLaUnidad({ id: "cse-cfi-propietario-1", unidadId: U_CON_PROPIETARIO, periodo: periodoHaceMeses(3), montoBase: 100_000 }),
      cobroDeLaUnidad({ id: "cse-cfi-propietario-2", unidadId: U_CON_PROPIETARIO, periodo: periodoHaceMeses(2), montoBase: 100_000 }),
      cobroDeLaUnidad({ id: "cse-cfi-propietario-3", unidadId: U_CON_PROPIETARIO, periodo: periodoHaceMeses(1), montoBase: 100_000 }),
      // U_SIN_PROPIETARIO: la misma morosidad, sin dueño vigente a quién avisar.
      cobroDeLaUnidad({ id: "cse-cfi-sin-propietario-1", unidadId: U_SIN_PROPIETARIO, periodo: periodoHaceMeses(3), montoBase: 70_000 }),
      cobroDeLaUnidad({ id: "cse-cfi-sin-propietario-2", unidadId: U_SIN_PROPIETARIO, periodo: periodoHaceMeses(2), montoBase: 70_000 }),
      cobroDeLaUnidad({ id: "cse-cfi-sin-propietario-3", unidadId: U_SIN_PROPIETARIO, periodo: periodoHaceMeses(1), montoBase: 70_000 }),
    ]
    for (const cobro of cobros) {
      await prisma.cobroFI.create({ data: cobro })
    }

    const acuerdos = [
      {
        id: ACUERDO_OK,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Corte de servicios de la unidad 201 (Ley 21.442 art. 20 N°9)",
        folio: "AD-2026-9001",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "cse-usuario-admin",
      },
      {
        id: ACUERDO_OK_ELECTRO,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Corte de servicios de la unidad 202 (Ley 21.442 art. 20 N°9)",
        folio: "AD-2026-9002",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "cse-usuario-admin",
      },
      {
        id: ACUERDO_OK_TARDIO,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Corte de servicios de la unidad 203 (Ley 21.442 art. 20 N°9)",
        folio: "AD-2026-9005",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "cse-usuario-admin",
      },
      {
        id: ACUERDO_OK_CUATRO,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Corte de servicios de la unidad 208 (Ley 21.442 art. 20 N°9)",
        folio: "AD-2026-9006",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "cse-usuario-admin",
      },
      {
        id: ACUERDO_OK_PROPIETARIO,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Corte de servicios de la unidad 209 (Ley 21.442 art. 20 N°9)",
        folio: "AD-2026-9020",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "cse-usuario-admin",
      },
      {
        id: ACUERDO_OK_SIN_PROPIETARIO,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Corte de servicios de la unidad 210 (Ley 21.442 art. 20 N°9)",
        folio: "AD-2026-9021",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "cse-usuario-admin",
      },
      {
        id: ACUERDO_ABIERTO,
        comunidadId: COM_A,
        cuerpo: "comite",
        materia: "Corte de servicios que el comité todavía no votó",
        folio: "AD-2026-9003",
        estado: "abierto",
        quorumRequerido: "un_voto_por_miembro",
        creadoPor: "cse-usuario-admin",
      },
      {
        id: ACUERDO_ASAMBLEA,
        comunidadId: COM_A,
        cuerpo: "asamblea",
        materia: "Corte de servicios aprobado por la asamblea y no por el comité",
        folio: "AD-2026-9004",
        estado: "aprobado",
        quorumRequerido: "mayoria_absoluta_derechos",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "cse-usuario-admin",
      },
      {
        id: ACUERDO_OTRA_COMUNIDAD,
        comunidadId: COM_B,
        cuerpo: "comite",
        materia: "Corte de servicios de la otra comunidad",
        folio: "AD-2026-9100",
        estado: "aprobado",
        quorumRequerido: "un_voto_por_miembro",
        resueltoEn: new Date("2026-02-10T12:00:00.000Z"),
        creadoPor: "cse-usuario-admin",
      },
    ]
    for (const a of acuerdos) {
      await prisma.acuerdo.upsert({
        where: { id: a.id },
        update: { estado: a.estado },
        create: a,
      })
    }

    // El corte de la comunidad B no lo puede leer el scope de la sesión (que es de A).
    await prisma.corteServicio.upsert({
      where: { id: CORTE_COM_B },
      update: {},
      create: {
        id: CORTE_COM_B,
        comunidadId: COM_B,
        unidadId: U_OTRA,
        servicio: "electricidad",
        acuerdoId: ACUERDO_OTRA_COMUNIDAD,
        cuotasImpagas: 4,
        montoAdeudado: 400_000,
        fechaPreaviso: new Date("2026-02-15T12:00:00.000Z"),
        fechaHabilitada: new Date("2026-02-20T00:00:00.000Z"),
        estado: "preaviso",
        creadoPor: "cse-usuario-admin",
      },
    })

    const usuarios = [
      { id: "cse-usuario-admin", email: EMAIL_ADMIN, comunidadId: COM_A, rol: "administrador" },
      { id: "cse-usuario-comite", email: EMAIL_COMITE, comunidadId: COM_A, rol: "comite" },
      { id: "cse-usuario-residente", email: EMAIL_RESIDENTE, comunidadId: COM_A, rol: "residente" },
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
      // El escrito y su constancia primero: `envios_documento` cuelga del documento.
      await prisma.envioDocumento.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.documento.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.corteServicio.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.cobroFI.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.eventoAuditoria.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.votoAcuerdo.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.acuerdo.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.vinculoUnidad.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
      await prisma.persona.deleteMany({
        where: { comunidadId: { in: [COM_A, COM_B] } },
      })
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

  async function POST_PREAVISO(body: unknown): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.POST(
      new NextRequest("http://localhost/api/cortes-servicio", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function POST_EJECUTAR(body: unknown): Promise<Response> {
    const { ejecutar } = await cargaModulos()
    return ejecutar.POST(
      new NextRequest("http://localhost/api/cortes-servicio/ejecutar", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function POST_REVOCAR(body: unknown): Promise<Response> {
    const { revocar } = await cargaModulos()
    return revocar.POST(
      new NextRequest("http://localhost/api/cortes-servicio/revocar", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      })
    )
  }

  async function GET_CORTES(url = "http://localhost/api/cortes-servicio"): Promise<Response> {
    const { coleccion } = await cargaModulos()
    return coleccion.GET(new NextRequest(url, { method: "GET" }))
  }

  /** Descarga del requerimiento: la URL que el `Documento` guarda en `archivoUrl`. */
  async function GET_REQUERIMIENTO(corteId: string): Promise<Response> {
    const { requerimiento } = await cargaModulos()
    return requerimiento.GET(
      new NextRequest(
        `http://localhost/api/cortes-servicio/requerimiento?corteId=${encodeURIComponent(corteId)}`,
        { method: "GET" }
      )
    )
  }

  /**
   * Cuerpo del preaviso: unidad, servicio y acuerdo. La morosidad NO viaja acá
   * —`cuotasImpagas` y `montoAdeudado` ya no existen en el contrato—: la deriva el
   * servidor de los cobros de la unidad.
   */
  const preaviso = (extra: Record<string, unknown> = {}) => ({
    unidadId: U_MORA,
    servicio: "electricidad",
    acuerdoId: ACUERDO_OK,
    ...extra,
  })

  it("401 sin sesión en las cuatro rutas", async () => {
    state.cookie = ""
    expect((await POST_PREAVISO(preaviso())).status).toBe(401)
    expect((await POST_EJECUTAR({ corteId: CORTE_COM_B })).status).toBe(401)
    expect((await POST_REVOCAR({ corteId: CORTE_COM_B, motivo: "pago de la deuda" })).status).toBe(401)
    expect((await GET_CORTES()).status).toBe(401)
  })

  it("un rol sin `fi:cobranza` no preavisa, ejecuta, revoca ni lee → 403 y cero filas", async () => {
    await conSesion(EMAIL_RESIDENTE, async () => {
      expect((await POST_PREAVISO(preaviso())).status).toBe(403)
      expect((await POST_EJECUTAR({ corteId: CORTE_COM_B })).status).toBe(403)
      expect((await POST_REVOCAR({ corteId: CORTE_COM_B, motivo: "pago de la deuda" })).status).toBe(403)
      expect((await GET_CORTES()).status).toBe(403)
    })
    expect(await prisma.corteServicio.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("sin acuerdo aprobado del Comité el preaviso es 400 con su motivo y no deja filas", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const inexistente = await POST_PREAVISO(preaviso({ acuerdoId: "cse-ac-fantasma" }))
      expect(inexistente.status).toBe(400)
      expect(((await inexistente.json()) as { error: string }).error).toBe(
        "No se puede preavisar el corte: el acuerdo del Comité no existe en esta comunidad."
      )

      const abierto = await POST_PREAVISO(preaviso({ acuerdoId: ACUERDO_ABIERTO }))
      expect(abierto.status).toBe(400)
      expect(((await abierto.json()) as { error: string }).error).toBe(
        "No se puede preavisar el corte: el acuerdo no está aprobado."
      )

      // La ley pide acuerdo del COMITÉ: uno de asamblea no autoriza el corte.
      const asamblea = await POST_PREAVISO(preaviso({ acuerdoId: ACUERDO_ASAMBLEA }))
      expect(asamblea.status).toBe(400)
      expect(((await asamblea.json()) as { error: string }).error).toBe(
        "No se puede preavisar el corte: el acuerdo no es del Comité."
      )

      // El acuerdo de otra comunidad no existe para este scope.
      const ajeno = await POST_PREAVISO(preaviso({ acuerdoId: ACUERDO_OTRA_COMUNIDAD }))
      expect(ajeno.status).toBe(400)
      expect(((await ajeno.json()) as { error: string }).error).toBe(
        "No se puede preavisar el corte: el acuerdo del Comité no existe en esta comunidad."
      )
    })
    expect(await prisma.corteServicio.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("la unidad se resuelve en la comunidad: la ajena es 404 y no persiste", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PREAVISO(preaviso({ unidadId: U_OTRA }))
      expect(res.status).toBe(404)
      expect(((await res.json()) as { error: string }).error).toBe("Unidad no encontrada.")
    })
    expect(await prisma.corteServicio.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("la electrodependencia bloquea aunque haya diez cuotas impagas: 400 con el motivo y cero filas", async () => {
    // El motivo que la ruta devuelve es el de la regla pura para la MISMA entrada:
    // si los dos textos se separan, este test lo dice.
    const dictamen = cortePermitido({
      cuotasImpagas: 10,
      electrodependiente: true,
      deudaDeCatastrofe: false,
      otroServicioYaCortado: false,
    })
    expect(dictamen.permitido).toBe(false)
    if (dictamen.permitido) throw new Error("la electrodependencia debía bloquear el corte")

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PREAVISO(
        preaviso({ unidadId: U_ELECTRO, acuerdoId: ACUERDO_OK_ELECTRO })
      )
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(dictamen.motivo)
    })
    expect(
      await prisma.corteServicio.count({ where: { comunidadId: COM_A, unidadId: U_ELECTRO } })
    ).toBe(0)
  })

  it("con menos de tres cuotas impagas el preaviso es 400 y no escribe", async () => {
    // Las cuotas no se declaran: se cuentan de los cobros VENCIDOS de la unidad. La
    // fixture tiene una unidad sin cobros, otra con una vencida y otra con dos.
    await conSesion(EMAIL_ADMIN, async () => {
      for (const unidadId of [U_SIN_DEUDA, U_UNO, U_DOS]) {
        const res = await POST_PREAVISO(preaviso({ unidadId }))
        expect(res.status).toBe(400)
        expect(((await res.json()) as { error: string }).error).toBe(
          "No procede el corte: la ley exige tres o más cuotas impagas, continuas o discontinuas (Ley 21.442 art. 20 N°9)."
        )
      }
    })
    expect(await prisma.corteServicio.count({ where: { comunidadId: COM_A } })).toBe(0)
  })

  it("el preaviso válido es 201 y la fecha habilitada es el quinto día corrido", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PREAVISO(preaviso())
      expect(res.status).toBe(201)
      const vista = (await res.json()) as VistaCorte
      cortePreavisado = vista

      expect(vista.estado).toBe("preaviso")
      expect(vista.servicio).toBe("electricidad")
      expect(vista.unidadId).toBe(U_MORA)
      expect(vista.unidadNumero).toBe("201")
      expect(vista.acuerdoId).toBe(ACUERDO_OK)
      expect(vista.acuerdoFolio).toBe("AD-2026-9001")
      // Tres períodos VENCIDOS de U_MORA por $1.234.567: el número y el monto los
      // deriva el servidor de los cobros, no vienen del cuerpo.
      expect(vista.cuotasImpagas).toBe(3)
      expect(vista.montoAdeudado).toBe(1_234_567)
      expect(vista.creadoPor).toBe("cse-usuario-admin")
      expect(vista.ejecutadoEn).toBeNull()
      expect(vista.revocadoEn).toBeNull()

      // Cinco días CORRIDOS contados en días de calendario: el día del preaviso no
      // cuenta y el quinto sí. La fecha habilitada es el inicio (00:00 UTC) de ese
      // quinto día, no 120 horas después de la hora exacta del aviso.
      const fechaPreaviso = new Date(vista.fechaPreaviso)
      const quintoDia = new Date(inicioDelDiaUTC(fechaPreaviso) + 5 * MS_POR_DIA)
      expect(vista.fechaHabilitada).toBe(quintoDia.toISOString())
      expect(new Date(vista.fechaHabilitada).getTime()).toBeGreaterThan(
        fechaPreaviso.getTime()
      )
    })

    if (!cortePreavisado) throw new Error("no se pudo preavisar el corte de prueba")

    const enBd = await prisma.corteServicio.findUnique({
      where: { id: cortePreavisado.id },
    })
    expect(enBd).not.toBeNull()
    expect(enBd?.comunidadId).toBe(COM_A)
    expect(enBd?.unidadId).toBe(U_MORA)
    expect(enBd?.servicio).toBe("electricidad")
    expect(enBd?.acuerdoId).toBe(ACUERDO_OK)
    expect(enBd?.cuotasImpagas).toBe(3)
    expect(enBd?.montoAdeudado).toBe(1_234_567)
    expect(enBd?.estado).toBe("preaviso")
    expect(enBd?.creadoPor).toBe("cse-usuario-admin")
    expect(enBd?.ejecutadoPor).toBeNull()
    expect(enBd?.revocadoPor).toBeNull()

    // El preaviso queda auditado con el folio del acuerdo que lo autoriza y el monto.
    const evento = await prisma.eventoAuditoria.findFirst({
      where: {
        comunidadId: COM_A,
        tipoAccion: "FI_CORTE_PREAVISO",
        referenciaId: cortePreavisado.id,
      },
    })
    expect(evento).not.toBeNull()
    expect(evento?.categoria).toBe("FI")
    expect(evento?.descripcion).toContain("AD-2026-9001")
    expect(evento?.descripcion).toContain("1.234.567")
    expect(evento?.descripcion).toContain("electricidad")
  })

  it("el mismo servicio no se preavisa dos veces: 409 y una sola fila", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PREAVISO(preaviso())
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "La unidad ya tiene un corte vigente de ese servicio."
      )
    })
    expect(
      await prisma.corteServicio.count({ where: { comunidadId: COM_A, unidadId: U_MORA } })
    ).toBe(1)
  })

  it("el corte no se ejecuta antes del quinto día: 400 y la fila sigue en preaviso", async () => {
    if (!cortePreavisado) throw new Error("falta el preaviso del caso anterior")
    const id = cortePreavisado.id

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_EJECUTAR({ corteId: id })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "No se puede ejecutar el corte: el preaviso debe cumplir cinco días corridos y todavía no se cumplieron (Ley 21.442 art. 20 N°9)."
      )
    })

    const enBd = await prisma.corteServicio.findUnique({ where: { id } })
    expect(enBd?.estado).toBe("preaviso")
    expect(enBd?.ejecutadoPor).toBeNull()
    expect(enBd?.ejecutadoEn).toBeNull()
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: COM_A, tipoAccion: "FI_CORTE_EJECUTADO" },
      })
    ).toBe(0)
  })

  it("cumplido el quinto día el corte se ejecuta: 200, estado ejecutado y auditoría", async () => {
    if (!cortePreavisado) throw new Error("falta el preaviso del caso anterior")
    const id = cortePreavisado.id

    // El paso del tiempo se simula moviendo el preaviso cinco días atrás, no
    // esperando: el corte quedó preavisado con fecha habilitada de HOY, así que el
    // día del trámite es hoy (el día del preaviso ya no cuenta).
    const hoy = new Date()
    const habilitada = new Date(inicioDelDiaUTC(hoy))
    await prisma.corteServicio.update({
      where: { id },
      data: {
        fechaPreaviso: new Date(habilitada.getTime() - 5 * MS_POR_DIA),
        fechaHabilitada: habilitada,
      },
    })

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_EJECUTAR({ corteId: id })
      expect(res.status).toBe(200)
      const vista = (await res.json()) as VistaCorte
      expect(vista.id).toBe(id)
      expect(vista.estado).toBe("ejecutado")
      expect(vista.ejecutadoPor).toBe("cse-usuario-admin")
      expect(vista.ejecutadoEn).not.toBeNull()
      expect(vista.motivo).toBeNull()
    })

    const enBd = await prisma.corteServicio.findUnique({ where: { id } })
    expect(enBd?.estado).toBe("ejecutado")
    expect(enBd?.ejecutadoPor).toBe("cse-usuario-admin")
    expect(enBd?.ejecutadoEn).not.toBeNull()

    const evento = await prisma.eventoAuditoria.findFirst({
      where: {
        comunidadId: COM_A,
        tipoAccion: "FI_CORTE_EJECUTADO",
        referenciaId: id,
      },
    })
    expect(evento).not.toBeNull()
    expect(evento?.categoria).toBe("FI")
    expect(evento?.descripcion).toContain("AD-2026-9001")
  })

  it("un corte ya ejecutado no se re-ejecuta: 409 sin tocar la fila", async () => {
    if (!cortePreavisado) throw new Error("falta el preaviso del caso anterior")
    const id = cortePreavisado.id
    const antes = await prisma.corteServicio.findUnique({ where: { id } })

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_EJECUTAR({ corteId: id })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "El corte ya no está en preaviso: no se puede ejecutar dos veces."
      )
    })

    const despues = await prisma.corteServicio.findUnique({ where: { id } })
    expect(despues?.estado).toBe("ejecutado")
    expect(despues?.ejecutadoEn?.getTime()).toBe(antes?.ejecutadoEn?.getTime())
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: COM_A, tipoAccion: "FI_CORTE_EJECUTADO" },
      })
    ).toBe(1)
  })

  it("un segundo servicio, mientras uno está suspendido: 409 y no deja otra fila", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PREAVISO(
        preaviso({ servicio: "telecomunicaciones" })
      )
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "La unidad ya tiene otro servicio suspendido: no pueden suspenderse dos servicios a la vez (Ley 21.442 art. 20 N°9)."
      )
    })
    expect(
      await prisma.corteServicio.count({ where: { comunidadId: COM_A, unidadId: U_MORA } })
    ).toBe(1)
  })

  it("revocar deja el corte sin efecto: 200, estado revocado y auditoría", async () => {
    if (!cortePreavisado) throw new Error("falta el preaviso del caso anterior")
    const id = cortePreavisado.id

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_REVOCAR({ corteId: id, motivo: "El deudor pagó la deuda" })
      expect(res.status).toBe(200)
      const vista = (await res.json()) as VistaCorte
      expect(vista.id).toBe(id)
      expect(vista.estado).toBe("revocado")
      expect(vista.revocadoPor).toBe("cse-usuario-admin")
      expect(vista.revocadoEn).not.toBeNull()
      expect(vista.motivo).toBe("El deudor pagó la deuda")
      // El hecho de la ejecución no se borra: el corte se ejecutó y después se dejó
      // sin efecto, y las dos cosas son evidencia.
      expect(vista.ejecutadoPor).toBe("cse-usuario-admin")
    })

    const enBd = await prisma.corteServicio.findUnique({ where: { id } })
    expect(enBd?.estado).toBe("revocado")
    expect(enBd?.motivo).toBe("El deudor pagó la deuda")
    expect(enBd?.revocadoEn).not.toBeNull()

    const evento = await prisma.eventoAuditoria.findFirst({
      where: {
        comunidadId: COM_A,
        tipoAccion: "FI_CORTE_REVOCADO",
        referenciaId: id,
      },
    })
    expect(evento).not.toBeNull()
    expect(evento?.descripcion).toContain("El deudor pagó la deuda")
  })

  it("un corte ya revocado no se revoca dos veces: 409 sin tocar la fila", async () => {
    if (!cortePreavisado) throw new Error("falta el preaviso del caso anterior")
    const id = cortePreavisado.id
    const antes = await prisma.corteServicio.findUnique({ where: { id } })

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_REVOCAR({ corteId: id, motivo: "Se revoca por error" })
      expect(res.status).toBe(409)
      expect(((await res.json()) as { error: string }).error).toBe(
        "El corte ya está revocado."
      )
    })

    const despues = await prisma.corteServicio.findUnique({ where: { id } })
    expect(despues?.motivo).toBe(antes?.motivo)
    expect(despues?.revocadoEn?.getTime()).toBe(antes?.revocadoEn?.getTime())
    expect(
      await prisma.eventoAuditoria.count({
        where: { comunidadId: COM_A, tipoAccion: "FI_CORTE_REVOCADO" },
      })
    ).toBe(1)
  })

  it("la lectura devuelve los cortes de la comunidad con su estado y sus fechas", async () => {
    // El comité LEE la cobranza (`fi:cobranza` ver) aunque no la ejecute.
    await conSesion(EMAIL_COMITE, async () => {
      const res = await GET_CORTES(
        "http://localhost/api/cortes-servicio?comunidadId=cse-com-b"
      )
      expect(res.status).toBe(200)
      const j = (await res.json()) as {
        data: Array<{
          id: string
          unidadId: string
          unidadNumero: string | null
          servicio: string
          estado: string
          fechaPreaviso: string
          fechaHabilitada: string
          acuerdoFolio: string | null
        }>
        total: number
      }

      expect(j.total).toBe(
        await prisma.corteServicio.count({ where: { comunidadId: COM_A } })
      )
      expect(j.data).toHaveLength(j.total)
      // El `comunidadId` de la URL no mueve el alcance: es la comunidad de la sesión.
      expect(j.data.every((corte) => corte.unidadId === U_MORA)).toBe(true)
      expect(j.data.map((corte) => corte.id)).not.toContain(CORTE_COM_B)

      const corte = j.data[0]
      if (!corte) throw new Error("la lectura no devolvió el corte de la comunidad")
      expect(corte.estado).toBe("revocado")
      expect(corte.servicio).toBe("electricidad")
      expect(corte.unidadNumero).toBe("201")
      expect(corte.acuerdoFolio).toBe("AD-2026-9001")
      // Las fechas viajan en ISO y son las del trámite.
      expect(Number.isNaN(Date.parse(corte.fechaPreaviso))).toBe(false)
      expect(Number.isNaN(Date.parse(corte.fechaHabilitada))).toBe(false)
    })
  })

  it("la electrodependencia registrada DESPUÉS del preaviso impide ejecutar el corte", async () => {
    // El dato de la unidad es el del momento en que se CORTA, no el del momento en
    // que se preavisó: si la persona electrodependiente se registra entre las dos
    // fechas, la suspensión ya no puede cursarse.
    let corteId = ""
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PREAVISO(
        preaviso({ unidadId: U_TARDIO, acuerdoId: ACUERDO_OK_TARDIO })
      )
      expect(res.status).toBe(201)
      corteId = ((await res.json()) as VistaCorte).id
    })

    const hoy = new Date()
    const habilitada = new Date(inicioDelDiaUTC(hoy))
    await prisma.corteServicio.update({
      where: { id: corteId },
      data: {
        fechaPreaviso: new Date(habilitada.getTime() - 5 * MS_POR_DIA),
        fechaHabilitada: habilitada,
      },
    })

    // El registro de la persona electrodependiente se hace en la unidad. Se restaura
    // al terminar para no dejar la fixture con un dato clínico inventado.
    await prisma.unidad.update({
      where: { id: U_TARDIO },
      data: { electrodependiente: true },
    })
    try {
      await conSesion(EMAIL_ADMIN, async () => {
        const res = await POST_EJECUTAR({ corteId })
        expect(res.status).toBe(400)
        expect(((await res.json()) as { error: string }).error).toBe(
          "No procede el corte: en la unidad reside una persona electrodependiente y la ley lo prohíbe en ese caso (Ley 21.442 art. 20 N°9)."
        )
      })

      const enBd = await prisma.corteServicio.findUnique({ where: { id: corteId } })
      expect(enBd?.estado).toBe("preaviso")
      expect(enBd?.ejecutadoEn).toBeNull()
    } finally {
      await prisma.unidad.update({
        where: { id: U_TARDIO },
        data: { electrodependiente: false },
      })
    }
  })

  it("una sola cuota vencida no habilita el corte aunque el cuerpo declare tres", async () => {
    // El defecto que esto cierra: el cliente declaraba cuotasImpagas. Bastaba con
    // mandar `3` para un deudor de UNA cuota y el preaviso se aceptaba, con el
    // corte ilegal ejecutándose cinco días después. `cuotasImpagas` y
    // `montoAdeudado` ya no existen en el contrato: viajan en el cuerpo y se
    // descartan, y la decisión se toma con la deuda de la base.
    const antes = await prisma.corteServicio.count({ where: { comunidadId: COM_A } })
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PREAVISO({
        ...preaviso({ unidadId: U_UNO }),
        cuotasImpagas: 3,
        montoAdeudado: 999_999,
      })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "No procede el corte: la ley exige tres o más cuotas impagas, continuas o discontinuas (Ley 21.442 art. 20 N°9)."
      )
    })
    expect(await prisma.corteServicio.count({ where: { comunidadId: COM_A } })).toBe(antes)
    expect(
      await prisma.corteServicio.count({ where: { comunidadId: COM_A, unidadId: U_UNO } })
    ).toBe(0)
  })

  it("con tres o más cuotas vencidas persiste la morosidad derivada, no la declarada", async () => {
    // U_CUATRO tiene cuatro períodos vencidos por $450.000 y el cuerpo manda otra
    // cosa (99 cuotas y $1): lo que la fila guarda —y lo que la ejecución vuelve a
    // juzgar— es la deuda de la base, el snapshot de por qué se autorizó el corte.
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PREAVISO({
        ...preaviso({ unidadId: U_CUATRO, acuerdoId: ACUERDO_OK_CUATRO }),
        cuotasImpagas: 99,
        montoAdeudado: 1,
      })
      expect(res.status).toBe(201)
      const vista = (await res.json()) as VistaCorte
      expect(vista.cuotasImpagas).toBe(4)
      expect(vista.montoAdeudado).toBe(450_000)

      const enBd = await prisma.corteServicio.findUnique({ where: { id: vista.id } })
      expect(enBd?.cuotasImpagas).toBe(4)
      expect(enBd?.montoAdeudado).toBe(450_000)
      expect(enBd?.estado).toBe("preaviso")

      const evento = await prisma.eventoAuditoria.findFirst({
        where: {
          comunidadId: COM_A,
          tipoAccion: "FI_CORTE_PREAVISO",
          referenciaId: vista.id,
        },
      })
      expect(evento?.descripcion).toContain("4 cuota(s)")
      expect(evento?.descripcion).toContain("450.000")
      expect(evento?.descripcion).toContain("AD-2026-9006")
    })
  })

  it("tres cuotas emitidas con una pagada no habilitan el corte: quedan dos vencidas", async () => {
    // Tres cuotas EMITIDAS no son tres cuotas VENCIDAS: la pagada por completo está
    // `pagado` y no cuenta. Ojo con el matiz: un pago PARCIAL tampoco la saca del
    // vencido (`estadoDeCobro` mira el saldo pendiente), por eso la fixture paga
    // esta cuota entera.
    const antes = await prisma.corteServicio.count({ where: { comunidadId: COM_A } })
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PREAVISO(preaviso({ unidadId: U_TRES_CON_PAGO }))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        "No procede el corte: la ley exige tres o más cuotas impagas, continuas o discontinuas (Ley 21.442 art. 20 N°9)."
      )
    })
    expect(await prisma.corteServicio.count({ where: { comunidadId: COM_A } })).toBe(antes)
    expect(
      await prisma.corteServicio.count({
        where: { comunidadId: COM_A, unidadId: U_TRES_CON_PAGO },
      })
    ).toBe(0)
  })

  // ── S8: el preaviso emite el requerimiento escrito y su constancia ──────────

  it("el preaviso emite el requerimiento escrito como documento legal y su constancia de entrega", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PREAVISO(
        preaviso({
          unidadId: U_CON_PROPIETARIO,
          acuerdoId: ACUERDO_OK_PROPIETARIO,
        })
      )
      expect(res.status).toBe(201)
      const vista = (await res.json()) as VistaPreaviso

      expect(vista.documentoId).toBeTruthy()
      const corte = await prisma.corteServicio.findUnique({ where: { id: vista.id } })
      expect(corte?.documentoId).toBe(vista.documentoId)

      // El escrito es un `Documento` legal del archivo con sus campos de ARCHIVO
      // REALES: nombre, MIME, tamaño, URL que responde, hash y referencia al trámite.
      const documento = await prisma.documento.findUnique({
        where: { id: String(vista.documentoId) },
      })
      expect(documento).not.toBeNull()
      expect(documento?.comunidadId).toBe(COM_A)
      expect(documento?.naturaleza).toBe("legal")
      expect(documento?.tipoDocumental).toBe("otros")
      expect(documento?.glosa).toContain("209")
      expect(documento?.referenciaAutentica).toContain(vista.id)
      expect(documento?.archivoNombre.endsWith(".pdf")).toBe(true)
      expect(documento?.archivoTipoMime).toBe("application/pdf")
      expect(documento?.archivoTamanoKB).toBeGreaterThan(0)
      expect(documento?.archivoUrl).toContain(vista.id)
      expect(documento?.hash).toMatch(/^[a-f0-9]{64}$/)

      // Los bytes que el documento declara son un PDF de VERDAD: se descarga por la
      // URL que el archivo guarda y se miran la cabecera, el cierre, el tamaño y el
      // hash. Sin esto, `archivoNombre` sería un nombre y no un documento.
      const descarga = await GET_REQUERIMIENTO(vista.id)
      expect(descarga.status).toBe(200)
      expect(descarga.headers.get("content-type")).toBe("application/pdf")
      expect(descarga.headers.get("content-disposition")).toContain(
        String(documento?.archivoNombre)
      )
      const bytes = new Uint8Array(await descarga.arrayBuffer())
      const texto = new TextDecoder("latin1").decode(bytes)
      expect(texto.startsWith("%PDF-")).toBe(true)
      expect(texto.slice(-1024)).toContain("%%EOF")
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(documento?.hash)
      expect(Math.round((bytes.length / 1024) * 10) / 10).toBe(
        documento?.archivoTamanoKB
      )

      // Lo que el papel imprime: la unidad, la deuda, el servicio, la fecha desde la
      // que la suspensión es posible y la base legal. Se mira la definición porque el
      // binario está comprimido; el binario ya se probó arriba.
      const definicion = definicionDelRequerimiento({
        corteId: vista.id,
        comunidadNombre: "Comunidad Cortes A",
        unidadNumero: "209",
        servicio: String(corte?.servicio),
        cuotasImpagas: Number(corte?.cuotasImpagas),
        montoAdeudado: Number(corte?.montoAdeudado),
        fechaPreaviso: new Date(String(corte?.fechaPreaviso)),
        fechaHabilitada: new Date(String(corte?.fechaHabilitada)),
        acuerdoFolio: "AD-2026-9020",
      })
      const impreso = JSON.stringify(definicion)
      expect(impreso).toContain("209")
      expect(impreso).toContain("300.000")
      expect(impreso).toContain("Electricidad")
      expect(impreso).toContain(
        new Date(String(corte?.fechaHabilitada)).toISOString().slice(0, 10)
      )
      expect(impreso).toContain("Ley 21.442 art. 20 N°9")

      // La constancia de entrega: UNA, del propietario VIGENTE de la unidad y en
      // `pendiente`, porque ningún envío real se cursó. `entregado` sin envío sería
      // declarar una entrega que no ocurrió.
      const envios = await prisma.envioDocumento.findMany({
        where: { documentoId: String(vista.documentoId) },
      })
      expect(envios).toHaveLength(1)
      const envio = envios[0]
      if (!envio) throw new Error("el preaviso no registró la constancia de entrega")
      expect(envio.comunidadId).toBe(COM_A)
      expect(envio.personaId).toBe(PROPIETARIO_VIGENTE)
      expect(envio.estado).toBe("pendiente")
      expect(envio.motivo).toBeTruthy()
      expect(envio.notificacionId).toBeNull()
      expect(vista.constancia.id).toBe(envio.id)
      expect(vista.constancia.estado).toBe("pendiente")
      expect(vista.constancia.personaId).toBe(PROPIETARIO_VIGENTE)
      expect(vista.constancia.motivo).toBe(envio.motivo)

      // La bitácora del preaviso registra el documento y la constancia.
      const evento = await prisma.eventoAuditoria.findFirst({
        where: {
          comunidadId: COM_A,
          tipoAccion: "FI_CORTE_PREAVISO",
          referenciaId: vista.id,
        },
      })
      expect(evento?.descripcion).toContain(String(documento?.id))
      expect(evento?.descripcion).toContain(envio.id)
    })
  })

  it("una unidad sin propietario vigente se preavisa igual y la respuesta dice por qué no hay constancia", async () => {
    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PREAVISO(
        preaviso({
          unidadId: U_SIN_PROPIETARIO,
          acuerdoId: ACUERDO_OK_SIN_PROPIETARIO,
        })
      )
      // El preaviso NO depende de encontrar destinatario: la ley exige avisar, y el
      // sistema deja constancia de que hoy no hay a quién.
      expect(res.status).toBe(201)
      const vista = (await res.json()) as VistaPreaviso

      expect(vista.unidadId).toBe(U_SIN_PROPIETARIO)
      expect(vista.estado).toBe("preaviso")
      expect(vista.documentoId).toBeTruthy()
      // Sin destinatario no se inventa uno: la constancia no existe y se dice por qué.
      expect(vista.constancia.id).toBeNull()
      expect(vista.constancia.estado).toBeNull()
      expect(vista.constancia.personaId).toBeNull()
      expect(vista.constancia.motivo).toContain("propietario vigente")
      expect(vista.constancia.motivo).toContain("210")
      expect(
        await prisma.envioDocumento.count({
          where: { documentoId: String(vista.documentoId) },
        })
      ).toBe(0)

      const evento = await prisma.eventoAuditoria.findFirst({
        where: {
          comunidadId: COM_A,
          tipoAccion: "FI_CORTE_PREAVISO",
          referenciaId: vista.id,
        },
      })
      expect(evento?.descripcion).toContain(String(vista.documentoId))
      expect(evento?.descripcion).toContain("propietario vigente")
      expect(evento?.descripcion).toContain("210")
    })
  })

  it("un preaviso rechazado no emite un segundo requerimiento ni una segunda constancia", async () => {
    // El estado del trámite sigue siendo el que manda: el 409 del segundo preaviso
    // no puede dejar un papel huérfano en el archivo ni una entrega de más.
    const documentosAntes = await prisma.documento.count({
      where: { comunidadId: COM_A },
    })
    const enviosAntes = await prisma.envioDocumento.count({
      where: { comunidadId: COM_A },
    })

    await conSesion(EMAIL_ADMIN, async () => {
      const res = await POST_PREAVISO(
        preaviso({
          unidadId: U_CON_PROPIETARIO,
          acuerdoId: ACUERDO_OK_PROPIETARIO,
        })
      )
      expect(res.status).toBe(409)
    })

    expect(await prisma.documento.count({ where: { comunidadId: COM_A } })).toBe(
      documentosAntes
    )
    expect(await prisma.envioDocumento.count({ where: { comunidadId: COM_A } })).toBe(
      enviosAntes
    )
    expect(
      await prisma.corteServicio.count({
        where: { comunidadId: COM_A, unidadId: U_CON_PROPIETARIO },
      })
    ).toBe(1)
  })
})
