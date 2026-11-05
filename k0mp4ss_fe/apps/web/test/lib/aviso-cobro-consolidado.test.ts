/**
 * Consolidación de la deuda de períodos anteriores en el aviso (S4, L8).
 *
 * El aviso es el título ejecutivo (Ley 21.442 arts. 31 y 32): un papel que dice
 * "debe $47.000" cuando el vecino arrastra tres meses no declara lo que el
 * artículo 31 pide ("intereses y multas adeudados a la fecha"). Este contrato
 * fija qué entra, cómo se agrupa y qué NO cambia:
 *
 *   1. entra todo cargo de la unidad con saldo pendiente positivo cuyo período
 *      no es el del aviso, tenga o no aviso emitido ese período;
 *   2. se agrupa por período, del más viejo al más nuevo, cada cargo con su
 *      monto base, sus intereses, lo pagado y su saldo (nunca recalculado a mano:
 *      sale de `saldoPendiente`);
 *   3. el período del aviso NUNCA aparece en la deuda anterior;
 *   4. `montos.totalAdeudado` sigue significando "este período" y se agrega
 *      `totalAdeudadoConsolidado` (período + deuda anterior) en la versión 2;
 *   5. sin deuda anterior el bloque EXISTE vacío y lo dice, no falta: el papel
 *      tiene que poder afirmar "sin deuda de períodos anteriores".
 */
import { describe, it, expect } from "vitest"
import { contenidoAviso, type CobroDelAviso } from "@/lib/aviso-cobro"
import type { ResumenMensual } from "@/lib/resumen-mensual"

const PERIODO = "2026-09"
const EMISION = "2026-09-05"

const UNIDAD = {
  id: "u-101",
  numero: "101",
  etiqueta: "Departamento",
  prorrateo: 0.6,
}

const FONDOS = [
  { id: "f-gc", nombre: "Gasto común", tipo: "gasto_comun" },
  { id: "f-res", nombre: "Fondo de reserva", tipo: "reserva" },
]

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

type BaseCobro = Partial<CobroDelAviso> & { id: string; periodo: string }

/** Un cargo FI con la forma mínima que el aviso lee (nada se recalcula). */
function cobro(base: BaseCobro): CobroDelAviso {
  return {
    concepto: "gasto_comun",
    descripcion: `Gasto Común ${base.periodo}`,
    montoBase: 45_000,
    lineas: [{ concepto: "gasto_comun", monto: base.montoBase ?? 45_000, fondoId: "f-gc" }],
    fondoId: "f-gc",
    fechaCargo: `${base.periodo}-01`,
    fechaVencimiento: `${base.periodo}-10`,
    moras: [],
    pagos: [],
    ...base,
  }
}

const mora = (id: string, monto: number, fecha: string) => ({
  id,
  monto,
  diasAtraso: 10,
  tasaMensualPct: 1,
  fecha,
})

const pago = (id: string, monto: number, fecha: string) => ({
  id,
  monto,
  fecha,
  medio: "transferencia",
})

/** El cargo del período que el aviso cobra (con una mora antes de la emisión). */
const CARGO_DEL_PERIODO = cobro({
  id: "cob-sep",
  periodo: PERIODO,
  moras: [mora("m-sep", 500, "2026-09-03")],
})

/** Julio: impago, con mora devengada. */
const JULIO = cobro({ id: "cob-jul", periodo: "2026-07", moras: [mora("m-jul", 1_000, "2026-08-05")] })
/** Agosto: pago parcial. */
const AGOSTO = cobro({ id: "cob-ago", periodo: "2026-08", pagos: [pago("p-ago", 20_000, "2026-08-20")] })
/** Junio: pagado completo — no es deuda y no entra. */
const JUNIO = cobro({ id: "cob-jun", periodo: "2026-06", pagos: [pago("p-jun", 45_000, "2026-06-20")] })

function contenido(cobrosAnteriores: readonly CobroDelAviso[]) {
  return contenidoAviso({
    periodo: PERIODO,
    fechaEmision: EMISION,
    unidad: UNIDAD,
    reglamento: REGLAMENTO,
    fondos: FONDOS,
    cobros: [CARGO_DEL_PERIODO],
    cobrosAnteriores,
    resumen: RESUMEN,
  })
}

describe("contenidoAviso — deuda de períodos anteriores (S4, L8)", () => {
  it("agrupa la deuda por período, del más viejo al más nuevo, con intereses y saldo", () => {
    const aviso = contenido([AGOSTO, JULIO])

    expect(aviso.deudaAnterior.periodos.map((p) => p.periodo)).toEqual([
      "2026-07",
      "2026-08",
    ])
    expect(aviso.deudaAnterior.periodos[0]!.cargos).toEqual([
      {
        cobroId: "cob-jul",
        concepto: "gasto_comun",
        descripcion: "Gasto Común 2026-07",
        montoBase: 45_000,
        intereses: 1_000,
        pagado: 0,
        saldo: 46_000,
      },
    ])
    expect(aviso.deudaAnterior.periodos[1]!.cargos).toEqual([
      {
        cobroId: "cob-ago",
        concepto: "gasto_comun",
        descripcion: "Gasto Común 2026-08",
        montoBase: 45_000,
        intereses: 0,
        pagado: 20_000,
        saldo: 25_000,
      },
    ])
    // El total ES la suma de los saldos que muestra el desglose.
    const sumaSaldos = aviso.deudaAnterior.periodos
      .flatMap((p) => p.cargos)
      .reduce((total, cargo) => total + cargo.saldo, 0)
    expect(aviso.deudaAnterior.total).toBe(sumaSaldos)
    expect(aviso.deudaAnterior.total).toBe(71_000)
    expect(aviso.montos.totalDeudaAnterior).toBe(71_000)
  })

  it("un período pagado no entra en la deuda anterior", () => {
    const aviso = contenido([JUNIO, JULIO])
    expect(aviso.deudaAnterior.periodos.map((p) => p.periodo)).toEqual(["2026-07"])
    expect(
      aviso.deudaAnterior.periodos.flatMap((p) => p.cargos).map((c) => c.cobroId)
    ).not.toContain("cob-jun")
  })

  it("el período del aviso nunca aparece en la deuda anterior", () => {
    const aviso = contenido([CARGO_DEL_PERIODO, JULIO])
    expect(aviso.deudaAnterior.periodos.map((p) => p.periodo)).not.toContain(PERIODO)
    expect(
      aviso.deudaAnterior.periodos.flatMap((p) => p.cargos).map((c) => c.cobroId)
    ).not.toContain("cob-sep")
    // El cargo del período sigue estando donde siempre: en `cargos` y `montos`.
    expect(aviso.cargos.map((c) => c.id)).toEqual(["cob-sep"])
    expect(aviso.montos.totalDeudaAnterior).toBe(46_000)
  })

  it("lo pagado o la mora devengada DESPUÉS de la emisión no cambia la deuda anterior", () => {
    const julioConPagoTardio = cobro({
      id: "cob-jul",
      periodo: "2026-07",
      pagos: [pago("p-tardio", 30_000, "2026-09-20")],
      moras: [mora("m-tardio", 9_000, "2026-09-30")],
    })
    const aviso = contenido([julioConPagoTardio])
    expect(aviso.deudaAnterior.periodos[0]!.cargos[0]).toMatchObject({
      intereses: 0,
      pagado: 0,
      saldo: 45_000,
    })
  })

  it("el consolidado suma el período y la deuda anterior sin cambiar `totalAdeudado`", () => {
    const aviso = contenido([JULIO, AGOSTO])
    // `totalAdeudado` sigue siendo el del período: 45.000 + 500 de mora.
    expect(aviso.montos.totalAdeudado).toBe(45_500)
    expect(aviso.montos.totalDeudaAnterior).toBe(71_000)
    expect(aviso.montos.totalAdeudadoConsolidado).toBe(
      aviso.montos.totalAdeudado + aviso.montos.totalDeudaAnterior
    )
    expect(aviso.montos.totalAdeudadoConsolidado).toBe(116_500)
  })

  it("sin deuda anterior el bloque existe, vacío, y lo dice", () => {
    const aviso = contenido([JUNIO])
    expect(aviso.deudaAnterior).toEqual({ periodos: [], total: 0 })
    expect(aviso.montos.totalDeudaAnterior).toBe(0)
    expect(aviso.montos.totalAdeudadoConsolidado).toBe(aviso.montos.totalAdeudado)
  })

  it("el contenido se congela en la versión 2 y no cambia el significado de lo de siempre", () => {
    const aviso = contenido([JULIO])
    expect(aviso.version).toBe(2)
    // Los campos de la versión 1 siguen diciendo lo mismo.
    expect(aviso.periodo).toBe(PERIODO)
    expect(aviso.montos.gastoComun).toBe(45_000)
    expect(aviso.montos.intereses).toBe(500)
    expect(aviso.montos.exigible).toBe(45_500)
    expect(aviso.montos.pagado).toBe(0)
    expect(aviso.detalle).toHaveLength(1)
    expect(aviso.resumenComunidad).toEqual(RESUMEN)
  })

  it("la huella del contenido consolidado incluye la deuda anterior", async () => {
    const { hashContenido } = await import("@/lib/aviso-cobro")
    const conDeuda = hashContenido(contenido([JULIO]))
    const sinDeuda = hashContenido(contenido([]))
    expect(conDeuda).toMatch(/^[0-9A-F]{16}$/)
    expect(conDeuda).not.toBe(sinDeuda)
  })
})
