/**
 * @vitest-environment node
 *
 * F30 — conciliación bancaria por importación de cartola (decisión D1: sin
 * integración bancaria, se importa el archivo que el banco ya exporta).
 *
 * Lo que se fija acá es la REGLA PURA, sin base y sin reloj: el lector del CSV
 * —que devuelve los errores por fila en vez de meter basura adentro— y las reglas
 * de enlace que deciden si un movimiento de la cartola corresponde a un registro
 * del sistema o queda en la cola para que una persona lo resuelva.
 *
 * Todo se mide desde las dos funciones públicas: no se inspecciona ninguna
 * estructura interna.
 */
import { describe, expect, it } from "vitest"

import {
  MOTIVOS_DE_ENLACE,
  contadoresDeCartola,
  enlazarMovimiento,
  parsearCartola,
  type CandidatoConciliacion,
} from "./conciliacion"

/** Un candidato con todos sus campos: cada test cambia sólo lo que le importa. */
function candidato(
  campos: Partial<CandidatoConciliacion> & Pick<CandidatoConciliacion, "id">
): CandidatoConciliacion {
  return {
    tipo: "egreso",
    monto: 100_000,
    fecha: "2026-03-10",
    referencia: null,
    contraparte: null,
    ...campos,
  }
}

/** Un movimiento de la cartola en la forma que consume la regla de enlace. */
function movimiento(
  campos: Partial<{
    tipo: "cargo" | "abono"
    monto: number
    fecha: string
    referencia: string | null
    contraparte: string | null
  }> = {}
) {
  return {
    tipo: "cargo" as const,
    monto: 100_000,
    fecha: "2026-03-10",
    referencia: null,
    contraparte: null,
    ...campos,
  }
}

describe("parsearCartola — el CSV del banco entra por una sola puerta", () => {
  it("lee un CSV separado por comas con fechas AAAA-MM-DD", () => {
    const texto = [
      "fecha,descripcion,monto,referencia,contraparte",
      "2026-03-05,Transferencia proveedor,-150000,OP-77,Inmobiliaria Los Aromos",
    ].join("\n")

    const { filas, errores } = parsearCartola(texto)

    expect(errores).toEqual([])
    expect(filas).toEqual([
      {
        fecha: "2026-03-05",
        descripcion: "Transferencia proveedor",
        referencia: "OP-77",
        contraparte: "Inmobiliaria Los Aromos",
        monto: 150_000,
        tipo: "cargo",
      },
    ])
  })

  it("lee un CSV separado por punto y coma con fechas DD/MM/AAAA y monto es-CL", () => {
    const texto = [
      "Fecha;Descripción;Monto;Referencia",
      "05/03/2026;Pago gasto común unidad 101;1.234,56;OP-88",
    ].join("\n")

    const { filas, errores } = parsearCartola(texto)

    expect(errores).toEqual([])
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      fecha: "2026-03-05",
      descripcion: "Pago gasto común unidad 101",
      referencia: "OP-88",
      monto: 1234.56,
      tipo: "abono",
    })
  })

  it("acepta coma decimal y punto decimal sin separador de miles", () => {
    const texto = [
      "fecha,descripcion,monto",
      "2026-03-01,Coma decimal,\"1234,5\"",
      "2026-03-02,Punto decimal,1234.5",
      "2026-03-03,Miles con punto,1.234",
      "2026-03-04,Miles con coma,\"1,234\"",
      "2026-03-05,Monto en dólares,$ 2.500",
    ].join("\n")

    const { filas, errores } = parsearCartola(texto)

    expect(errores).toEqual([])
    expect(filas.map((f) => f.monto)).toEqual([1234.5, 1234.5, 1234, 1234, 2500])
  })

  it("el tipo sale del signo cuando la cartola no trae columna de tipo", () => {
    const texto = [
      "fecha,descripcion,monto",
      "2026-03-01,Depósito de copropietario,90000",
      "2026-03-02,Giro a proveedor,-45000",
    ].join("\n")

    const { filas, errores } = parsearCartola(texto)

    expect(errores).toEqual([])
    expect(filas.map((f) => [f.tipo, f.monto])).toEqual([
      ["abono", 90_000],
      ["cargo", 45_000],
    ])
  })

  it("la columna de tipo manda sobre el signo del monto", () => {
    const texto = [
      "fecha,descripcion,monto,tipo",
      "2026-03-01,Cargo explícito,-90000,cargo",
      "2026-03-02,Abono explícito,-45000,abono",
    ].join("\n")

    const { filas, errores } = parsearCartola(texto)

    expect(errores).toEqual([])
    expect(filas.map((f) => [f.tipo, f.monto])).toEqual([
      ["cargo", 90_000],
      ["abono", 45_000],
    ])
  })

  it("devuelve el error de cada fila inválida y conserva las filas legibles", () => {
    const texto = [
      "fecha,descripcion,monto",
      "2026-03-01,Fila buena,10000",
      "31/02/2026,Fecha que no existe,20000",
      "2026-03-03,Monto ilegible,abc",
      "2026-03-04,Fila desalineada,30000,sobra",
      "",
      "2026-03-06,,Sin descripción",
    ].join("\n")

    const { filas, errores } = parsearCartola(texto)

    expect(filas.map((f) => f.descripcion)).toEqual(["Fila buena"])
    expect(errores).toHaveLength(4)
    expect(errores[0]).toContain("fila 3")
    expect(errores[0]).toContain("31/02/2026")
    expect(errores[1]).toContain("fila 4")
    expect(errores[1]).toContain("abc")
    expect(errores[2]).toContain("fila 5")
    expect(errores[3]).toContain("fila 7")
    expect(errores[3]).toContain("descripción")
  })

  it("rechaza el encabezado sin las columnas obligatorias", () => {
    const texto = ["fecha,referencia", "2026-03-01,OP-1"].join("\n")

    const { filas, errores } = parsearCartola(texto)

    expect(filas).toEqual([])
    expect(errores).toHaveLength(1)
    expect(errores[0]).toContain("monto")
    expect(errores[0]).toContain("descripcion")
  })

  it("no se rompe con el BOM ni con líneas en blanco", () => {
    const texto = "\uFEFFfecha;descripcion;monto\n\n2026-03-01;Aporte extraordinario;8000\n\n"

    const { filas, errores } = parsearCartola(texto)

    expect(errores).toEqual([])
    expect(filas).toHaveLength(1)
    expect(filas[0]?.monto).toBe(8000)
  })

  it("rechaza una fila de monto cero: no hay movimiento que conciliar", () => {
    const texto = ["fecha,descripcion,monto", "2026-03-01,Comisión,0"].join("\n")

    const { filas, errores } = parsearCartola(texto)

    expect(filas).toEqual([])
    expect(errores).toHaveLength(1)
    expect(errores[0]).toContain("cero")
  })
})

describe("enlazarMovimiento — primera regla: referencia exacta y monto exacto", () => {
  it("enlaza el movimiento con la referencia y el monto exactos", () => {
    const destino = candidato({ id: "egreso-1", referencia: "OP-77", monto: 150_000 })
    const enlace = enlazarMovimiento(
      movimiento({ monto: 150_000, referencia: "OP-77" }),
      [destino, candidato({ id: "egreso-2", monto: 999_999 })]
    )

    expect(enlace).toEqual({
      enlazado: true,
      candidatoId: "egreso-1",
      motivo: MOTIVOS_DE_ENLACE.referenciaMonto,
    })
  })

  it("la referencia sola no enlaza: el monto tiene que coincidir también", () => {
    const enlace = enlazarMovimiento(
      movimiento({ monto: 150_000, referencia: "OP-77" }),
      [
        candidato({ id: "egreso-caro", referencia: "OP-77", monto: 90_000 }),
        candidato({ id: "egreso-mismo-monto", monto: 150_000 }),
      ]
    )

    expect(enlace).toEqual({
      enlazado: true,
      candidatoId: "egreso-mismo-monto",
      motivo: MOTIVOS_DE_ENLACE.montoUnico,
    })
  })
})

describe("enlazarMovimiento — contraparte, monto y fecha dentro de ±5 días", () => {
  it("enlaza por RUT normalizado, monto y fecha cercana", () => {
    const enlace = enlazarMovimiento(
      movimiento({
        tipo: "abono",
        monto: 50_000,
        fecha: "2026-03-10",
        contraparte: "12.345.678-9",
      }),
      [
        candidato({
          id: "pago-lejos",
          tipo: "pago",
          monto: 50_000,
          fecha: "2026-03-20",
          contraparte: "12345678-9",
        }),
        candidato({
          id: "pago-cerca",
          tipo: "pago",
          monto: 50_000,
          fecha: "2026-03-12",
          contraparte: "12345678-9",
        }),
      ]
    )

    expect(enlace).toEqual({
      enlazado: true,
      candidatoId: "pago-cerca",
      motivo: MOTIVOS_DE_ENLACE.contraparteMontoFecha,
    })
  })

  it("el borde de la tolerancia es el quinto día: el sexto no enlaza", () => {
    const candidatos: CandidatoConciliacion[] = [
      candidato({
        id: "pago-quinto-dia",
        tipo: "pago",
        monto: 70_000,
        fecha: "2026-03-15",
        contraparte: "Los Aromos",
      }),
      candidato({
        id: "pago-mismo-monto",
        tipo: "pago",
        monto: 70_000,
        fecha: "2026-04-30",
        contraparte: "Otro pagador",
      }),
    ]

    const dentro = enlazarMovimiento(
      movimiento({
        tipo: "abono",
        monto: 70_000,
        fecha: "2026-03-10",
        contraparte: "Los Aromos",
      }),
      candidatos
    )
    expect(dentro).toEqual({
      enlazado: true,
      candidatoId: "pago-quinto-dia",
      motivo: MOTIVOS_DE_ENLACE.contraparteMontoFecha,
    })

    const fuera = enlazarMovimiento(
      movimiento({
        tipo: "abono",
        monto: 70_000,
        fecha: "2026-03-21",
        contraparte: "Los Aromos",
      }),
      candidatos
    )
    expect(fuera.enlazado).toBe(false)
  })
})

describe("enlazarMovimiento — la ambigüedad se resuelve en la cola, nunca por azar", () => {
  it("con dos candidatos del mismo monto no enlaza y deja el motivo ambiguo", () => {
    const enlace = enlazarMovimiento(movimiento({ monto: 222_222 }), [
      candidato({ id: "egreso-a", monto: 222_222 }),
      candidato({ id: "egreso-b", monto: 222_222 }),
    ])

    expect(enlace.enlazado).toBe(false)
    if (enlace.enlazado) throw new Error("el enlace ambiguo no puede enlazar")
    expect(enlace.motivo).toBe(MOTIVOS_DE_ENLACE.ambiguoMonto)
  })

  it("con una sola referencia repetida en dos candidatos tampoco elige uno", () => {
    const enlace = enlazarMovimiento(
      movimiento({ monto: 310_000, referencia: "OP-99" }),
      [
        candidato({ id: "egreso-a", monto: 310_000, referencia: "OP-99" }),
        candidato({ id: "egreso-b", monto: 310_000, referencia: "OP-99" }),
      ]
    )

    expect(enlace.enlazado).toBe(false)
    if (enlace.enlazado) throw new Error("el enlace ambiguo no puede enlazar")
    expect(enlace.motivo).toBe(MOTIVOS_DE_ENLACE.ambiguoReferencia)
  })
})

describe("enlazarMovimiento — un cargo no paga un ingreso ni un abono gasta", () => {
  it("un cargo no enlaza con un ingreso aunque el monto coincida", () => {
    const enlace = enlazarMovimiento(movimiento({ monto: 45_000 }), [
      candidato({ id: "ingreso-1", tipo: "ingreso", monto: 45_000 }),
    ])

    expect(enlace).toEqual({
      enlazado: false,
      motivo: MOTIVOS_DE_ENLACE.sinCandidatos,
    })
  })

  it("un abono no enlaza con un egreso aunque el monto coincida", () => {
    const enlace = enlazarMovimiento(
      movimiento({ tipo: "abono", monto: 45_000 }),
      [candidato({ id: "egreso-1", monto: 45_000 })]
    )

    expect(enlace).toEqual({
      enlazado: false,
      motivo: MOTIVOS_DE_ENLACE.sinCandidatos,
    })
  })

  it("un abono sí enlaza con el pago de un cobro", () => {
    const enlace = enlazarMovimiento(
      movimiento({ tipo: "abono", monto: 60_000, referencia: "AV-2026-03" }),
      [
        candidato({
          id: "cobro-1#pago-1",
          tipo: "pago",
          monto: 60_000,
          referencia: "AV-2026-03",
        }),
      ]
    )

    expect(enlace).toEqual({
      enlazado: true,
      candidatoId: "cobro-1#pago-1",
      motivo: MOTIVOS_DE_ENLACE.referenciaMonto,
    })
  })
})

describe("enlazarMovimiento — el monto se compara en centavos", () => {
  it("dos montos que difieren por debajo del centavo son el mismo monto", () => {
    const enlace = enlazarMovimiento(movimiento({ monto: 150_000.004 }), [
      candidato({ id: "egreso-1", monto: 150_000 }),
    ])

    expect(enlace).toEqual({
      enlazado: true,
      candidatoId: "egreso-1",
      motivo: MOTIVOS_DE_ENLACE.montoUnico,
    })
  })

  it("un centavo de diferencia ya no es el mismo monto", () => {
    const enlace = enlazarMovimiento(movimiento({ monto: 100_000.4 }), [
      candidato({ id: "egreso-1", monto: 100_000.49 }),
    ])

    expect(enlace).toEqual({
      enlazado: false,
      motivo: MOTIVOS_DE_ENLACE.sinCoincidencia,
    })
  })
})

describe("contadoresDeCartola — la cartola siempre cierra", () => {
  it("cuenta las conciliadas y las resueltas a mano como conciliadas", () => {
    expect(
      contadoresDeCartola(["conciliado", "resuelto_manual", "no_conciliado"])
    ).toEqual({ filas: 3, conciliadas: 2, noConciliadas: 1 })
  })

  it("una cartola sin movimientos no miente con contadores", () => {
    expect(contadoresDeCartola([])).toEqual({
      filas: 0,
      conciliadas: 0,
      noConciliadas: 0,
    })
  })
})
