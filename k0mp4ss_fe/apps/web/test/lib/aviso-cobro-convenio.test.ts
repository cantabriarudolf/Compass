/**
 * La declaración del convenio de pago en el aviso de cobro (F29 · S3).
 *
 * Mientras el convenio rige, el papel no puede cobrarle al copropietario como si
 * no existiera: el contenido del aviso declara el acuerdo del Comité que lo
 * autorizó, la cuota que va (M de N) y su monto con su vencimiento.
 * `ConvenioPago` NO tiene folio propio —la referencia legal es el folio del
 * acuerdo que lo autorizó (`acuerdoId` → `Acuerdo.folio`)— y no se inventa un
 * correlativo nuevo: la constancia cita el acuerdo y la cuota.
 *
 * Es un documento CONGELADO: los datos del convenio se toman al emitir y quedan
 * dentro del contenido. Lo que fija este contrato, todo observable por el
 * contenido que `contenidoAviso` devuelve:
 *
 *   1. con convenio `vigente` el contenido declara el folio del acuerdo, la
 *      cuota que va —la PRIMERA IMPAGA, con su número y el total de cuotas (M de
 *      N)—, su monto y su vencimiento, y la línea redactada que imprime el papel;
 *   2. la cuota 0 (el pago al suscribir) y una cuota `pagada` nunca son "la que
 *      va"; una cuota `vencida` sí es impaga;
 *   3. sin convenio el contenido no menciona convenio: el campo no existe, ni
 *      como `null` ni como hueco vacío (un bloque ausente y uno vacío no se
 *      distinguen después, y un aviso sin convenio queda como siempre fue);
 *   4. un convenio que no está `vigente` al emitir (anulado, saldado,
 *      incumplido) no se declara: la ruta trae lo que la base tiene al emitir y
 *      la regla pura garantiza lo mismo;
 *   5. la huella del contenido cambia cuando la declaración entra: el papel
 *      firmado queda distinto y verificable.
 *
 * El congelado a través de la base (anular el convenio después no reescribe el
 * papel ya emitido) lo fija `test/api/avisos-cobro-convenio.test.ts` sobre la
 * emisión real.
 */
import { describe, it, expect } from "vitest"
import {
  contenidoAviso,
  hashContenido,
  type CobroDelAviso,
  type ConvenioLeidoAlEmitir,
} from "@/lib/aviso-cobro"
import type { ResumenMensual } from "@/lib/resumen-mensual"

const PERIODO = "2026-09"
const EMISION = "2026-09-05"

const UNIDAD = {
  id: "u-101",
  numero: "101",
  etiqueta: "Departamento",
  prorrateo: 0.6,
}

const FONDOS = [{ id: "f-gc", nombre: "Gasto común", tipo: "gasto_comun" }]

const REGLAMENTO = {
  id: "reg-1",
  version: 3,
  vigenteDesde: "2026-01",
  fuenteInstrumento: "Reglamento Los Almendros",
  formaContribucion: "coeficiente",
  parametros: {
    porcentajeReserva: 10,
    diasPagoGc: 10,
    tasaMoraMensualPct: 1,
    topeMoraPct: 50,
    cuotasCorte: 3,
    diasPreavisoCorte: 5,
    ipcActivo: false,
    reservaIncluidaEnPresupuesto: false,
  },
}

const RESUMEN: ResumenMensual = {
  periodo: PERIODO,
  desde: "2026-09-01",
  hasta: "2026-09-30",
  ingresos: { total: 100_000, deCobros: 100_000, manuales: 0, cantidad: 1, detalle: [] },
  egresos: { total: 40_000, cantidad: 1, detalle: [] },
  saldoCaja: {
    inicial: 0,
    ingresosAcumulados: 100_000,
    egresosAcumulados: 40_000,
    alCierre: 60_000,
  },
}

/** El cargo del período que el aviso cobra, sin convenio de por medio. */
const CARGO: CobroDelAviso = {
  id: "cob-sep",
  periodo: PERIODO,
  concepto: "gasto_comun",
  descripcion: `Gasto Común ${PERIODO}`,
  montoBase: 45_000,
  lineas: [{ concepto: "gasto_comun", monto: 45_000, fondoId: "f-gc" }],
  fondoId: "f-gc",
  fechaCargo: `${PERIODO}-01`,
  fechaVencimiento: `${PERIODO}-10`,
  moras: [],
  pagos: [],
}

/**
 * El convenio tal como la ruta lo lee de la base AL EMITIR: su estado real, el
 * folio del acuerdo que lo autorizó y sus cuotas con su estado de la base (la
 * cuota 0 nace pagada al suscribir; `venceEn` llega como fila de la base).
 */
function convenio(
  opciones: {
    estado?: string
    acuerdoFolio?: string | null
    numeroCuotas?: number
    cuotas?: Array<{ numero: number; monto: number; venceEn: string | Date; estado: string }>
  } = {}
): ConvenioLeidoAlEmitir {
  return {
    estado: opciones.estado ?? "vigente",
    acuerdoFolio: opciones.acuerdoFolio === undefined ? "AD-2026-9001" : opciones.acuerdoFolio,
    numeroCuotas: opciones.numeroCuotas ?? 3,
    cuotas:
      opciones.cuotas ?? [
        // La cuota 0 es el pago al suscribir: nace pagada y nunca es "la que va".
        { numero: 0, monto: 250_000, venceEn: "2026-08-20", estado: "pagada" },
        { numero: 1, monto: 250_000, venceEn: "2026-09-20", estado: "pendiente" },
        { numero: 2, monto: 250_000, venceEn: "2026-10-20", estado: "pendiente" },
        { numero: 3, monto: 250_000, venceEn: "2026-11-20", estado: "pendiente" },
      ],
  }
}

function contenido(convenioAlEmitir?: ConvenioLeidoAlEmitir | null) {
  return contenidoAviso({
    periodo: PERIODO,
    fechaEmision: EMISION,
    unidad: UNIDAD,
    reglamento: REGLAMENTO,
    fondos: FONDOS,
    cobros: [CARGO],
    cobrosAnteriores: [],
    resumen: RESUMEN,
    ...(convenioAlEmitir === undefined ? {} : { convenio: convenioAlEmitir }),
  })
}

describe("contenidoAviso — la declaración del convenio vigente (F29 · S3)", () => {
  it("con convenio vigente el papel declara el acuerdo que lo autoriza, la cuota que va (M de N), su monto y su vencimiento", () => {
    const aviso = contenido(convenio())
    expect(aviso.convenio).toBeDefined()
    expect(aviso.convenio!.acuerdoFolio).toBe("AD-2026-9001")
    // La cuota que va es la 1 de 3: la primera impaga (la 0 nació pagada).
    expect(aviso.convenio!.cuota).toEqual({
      numero: 1,
      de: 3,
      monto: 250_000,
      vencimiento: "2026-09-20",
    })
    // La línea redactada que imprime el papel lleva exactamente esos datos.
    expect(aviso.convenio!.texto).toBe(
      "La unidad tiene un convenio de pago de deuda vigente, autorizado por el acuerdo del Comité folio AD-2026-9001. La cuota que va al emitir este aviso es la 1 de 3, por $250.000, con vencimiento el 2026-09-20."
    )
  })

  it("la cuota que va es la primera impaga: una cuota pagada (o la 0) se salta", () => {
    const aviso = contenido(
      convenio({
        cuotas: [
          { numero: 0, monto: 250_000, venceEn: "2026-08-20", estado: "pagada" },
          { numero: 1, monto: 250_000, venceEn: "2026-09-20", estado: "pagada" },
          { numero: 2, monto: 250_000, venceEn: "2026-10-20", estado: "pendiente" },
          { numero: 3, monto: 250_000, venceEn: "2026-11-20", estado: "pendiente" },
        ],
      })
    )
    expect(aviso.convenio!.cuota).toEqual({
      numero: 2,
      de: 3,
      monto: 250_000,
      vencimiento: "2026-10-20",
    })
  })

  it("una cuota vencida también es impaga: es la que va", () => {
    const aviso = contenido(
      convenio({
        cuotas: [
          { numero: 0, monto: 250_000, venceEn: "2026-08-20", estado: "pagada" },
          { numero: 1, monto: 250_000, venceEn: "2026-09-20", estado: "pagada" },
          { numero: 2, monto: 250_000, venceEn: "2026-10-20", estado: "vencida" },
          { numero: 3, monto: 250_000, venceEn: "2026-11-20", estado: "pendiente" },
        ],
      })
    )
    expect(aviso.convenio!.cuota!.numero).toBe(2)
    expect(aviso.convenio!.cuota!.vencimiento).toBe("2026-10-20")
  })

  it("el vencimiento declarado sale de la fila de la base, con Date o con texto ISO", () => {
    const aviso = contenido(
      convenio({
        cuotas: [
          { numero: 1, monto: 250_000, venceEn: new Date("2026-09-20T12:00:00.000Z"), estado: "pendiente" },
        ],
      })
    )
    expect(aviso.convenio!.cuota!.vencimiento).toBe("2026-09-20")
  })

  it("sin convenio el contenido no menciona convenio: ni la palabra ni un hueco vacío", () => {
    const aviso = contenido()
    expect("convenio" in aviso).toBe(false)
    expect(aviso.convenio).toBeUndefined()
    // Ni la palabra en ningún campo del documento congelado.
    expect(JSON.stringify(aviso).toLowerCase()).not.toContain("convenio")
  })

  it("un convenio que no está vigente al emitir no se declara", () => {
    for (const estado of ["anulado", "saldado", "incumplido"]) {
      const aviso = contenido(convenio({ estado }))
      expect("convenio" in aviso).toBe(false)
    }
  })

  it("un convenio vigente sin cuota impaga declara el convenio y declara la ausencia de cuota", () => {
    const aviso = contenido(
      convenio({
        numeroCuotas: 1,
        cuotas: [{ numero: 1, monto: 250_000, venceEn: "2026-09-20", estado: "pagada" }],
      })
    )
    expect(aviso.convenio!.acuerdoFolio).toBe("AD-2026-9001")
    expect(aviso.convenio!.cuota).toBeNull()
    expect(aviso.convenio!.texto).toBe(
      "La unidad tiene un convenio de pago de deuda vigente, autorizado por el acuerdo del Comité folio AD-2026-9001. Al emitir este aviso el convenio no declara ninguna cuota impaga."
    )
  })

  it("un convenio sin folio legible declara la ausencia en vez de inventar un correlativo", () => {
    const aviso = contenido(convenio({ acuerdoFolio: null }))
    expect(aviso.convenio!.acuerdoFolio).toBeNull()
    expect(aviso.convenio!.texto).toBe(
      "La unidad tiene un convenio de pago de deuda vigente, y el folio del acuerdo del Comité que lo autoriza no se pudo leer. La cuota que va al emitir este aviso es la 1 de 3, por $250.000, con vencimiento el 2026-09-20."
    )
  })

  it("la huella del contenido cambia cuando la declaración entra", () => {
    const conConvenio = hashContenido(contenido(convenio()))
    const sinConvenio = hashContenido(contenido())
    expect(conConvenio).toMatch(/^[0-9A-F]{16}$/)
    expect(conConvenio).not.toBe(sinConvenio)
  })
})
