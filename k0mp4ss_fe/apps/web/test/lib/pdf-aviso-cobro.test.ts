/**
 * T5 aviso-de-cobro (S2) — el PDF del aviso, armado SOLO desde la fila congelada.
 *
 * El aviso firmado es el papel con el que se cobra (Ley 21.442 arts. 31 y 32).
 * La regla de este documento es una sola: **no recalcula nada**. Cada cifra que
 * imprime sale del `contenido` congelado; si una cifra no está, se imprime un
 * "No disponible" explícito y NUNCA un cero, porque un cero se lee como "no se
 * cobra" y aquí significa "no se sabe". Un PDF que recalcula es un PDF que puede
 * contradecir el aviso que se firmó.
 *
 * El documento se prueba sobre la definición pdfmake (no sobre el binario): el
 * contrato es qué textos y qué filas lleva.
 */
import { describe, it, expect } from "vitest"
import { documentoAvisoCobroPDF, NO_DISPONIBLE } from "@/lib/pdf-utils"
import type { ConfiguracionGlobal } from "@/lib/schemas"

const CONFIG: ConfiguracionGlobal = {
  nombreComunidad: "Comunidad Los Almendros",
  rutComunidad: "76.123.456-7",
  direccionOficial: "Av. Los Almendros 123, Ñuñoa",
  administradorResponsable: "Ricardo Pérez",
  rutAdministrador: "12.345.678-9",
  telefonoAdmin: "+56 9 1234 5678",
  firmaDigitalizadaUrl: null,
  modoCalculoGC: "variable",
  diaCortePago: 10,
  limiteMesesAvisoCorte: 3,
  smtpHost: "smtp.test.cl",
  smtpPort: 587,
  smtpUser: "avisos@test.cl",
  smtpSecurity: "tls",
  smtpFrom: "avisos@test.cl",
  smtpFromName: "Comunidad Los Almendros",
  notificarEmisionGC: true,
  notificarRegistroVisitas: true,
  notificarEncomiendas: true,
  notificarReservas: true,
  notificarAvisosSistema: true,
  notificarSugerenciasReclamos: true,
  diasMesComercial: 30,
  diasVacacionesMes: 1.25,
  jornadaSemanalEstandar: 44,
}

const FIRMA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="
/** El hash entra ya calculado por el servidor con `hashContenido`. */
const HASH = "A1B2C3D4E5F60718"

/** Contenido congelado completo: el caso feliz del art. 31. */
const CONTENIDO = {
  version: 1 as const,
  periodo: "2026-09",
  fechaEmision: "2026-09-05",
  unidad: { id: "u-101", numero: "101", etiqueta: "Departamento" },
  reglamento: {
    id: "reg-1",
    version: 3,
    vigenteDesde: "2026-01-01",
    fuenteInstrumento: "Reglamento Los Almendros",
    formaContribucion: "prorrateo",
    parametros: { porcentajeReserva: 10, reservaIncluidaEnPresupuesto: false },
  },
  participacion: {
    prorrateo: 0.0125,
    formaContribucion: "prorrateo",
    porcentajeReserva: 10,
    reservaIncluidaEnPresupuesto: false,
  },
  cargos: [
    {
      id: "cob-1",
      concepto: "gasto_comun",
      descripcion: "Gasto común septiembre",
      montoBase: 49500,
      fechaCargo: "2026-09-01",
      fechaVencimiento: "2026-09-15",
    },
  ],
  detalle: [
    {
      cobroId: "cob-1",
      concepto: "gasto_comun",
      monto: 45000,
      fondoId: "fondo-gc",
      fondoNombre: "Gasto común",
      origen: "linea" as const,
    },
  ],
  montos: {
    gastoComun: 45000,
    recargoFondoReserva: 4500,
    multas: 0,
    intereses: 1200,
    otros: [{ concepto: "cuota_extraordinaria", monto: 30000 }],
    exigible: 80700,
    pagado: 20000,
    totalAdeudado: 60700,
  },
  resumenComunidad: {
    periodo: "2026-09",
    desde: "2026-09-01",
    hasta: "2026-09-30",
    ingresos: {
      total: 12500000,
      deCobros: 12000000,
      manuales: 500000,
      cantidad: 3,
      detalle: [],
    },
    egresos: { total: 9800000, cantidad: 4, detalle: [] },
    saldoCaja: {
      inicial: 5000000,
      ingresosAcumulados: 12500000,
      egresosAcumulados: 9800000,
      alCierre: 7700000,
    },
  },
  noComputables: [],
}

/** La fila tal como vive en `avisos_cobro` (columnas + contenido congelado). */
const AVISO = {
  folio: "AC-0007",
  codigoVerificacion: "VC-1A2B3C4D",
  periodo: "2026-09",
  fechaEmision: "2026-09-05",
  vencimiento: "2026-09-15",
  contenido: CONTENIDO,
}

const avisoCon = (contenido: unknown) => ({ ...AVISO, contenido })

/** Todo el texto del documento, en el orden en que aparece. */
function textos(doc: unknown): string[] {
  if (typeof doc === "string") return [doc]
  if (Array.isArray(doc)) return doc.flatMap(textos)
  if (!doc || typeof doc !== "object") return []
  const obj = doc as Record<string, unknown>
  const propios = typeof obj.text === "string" ? [obj.text] : []
  // Solo se desciende por estructuras: `alignment`, `fillColor`, `style` y
  // `image` son atributos, no texto del documento.
  return [
    ...propios,
    ...Object.values(obj).flatMap((valor) =>
      valor && typeof valor === "object" ? textos(valor) : []
    ),
  ]
}

/** Filas de dos celdas (etiqueta, valor) de todas las tablas del documento. */
function filas(doc: unknown): Array<[string, string]> {
  const pares: Array<[string, string]> = []
  const visitar = (nodo: unknown): void => {
    if (Array.isArray(nodo)) {
      nodo.forEach(visitar)
      return
    }
    if (!nodo || typeof nodo !== "object") return
    const obj = nodo as Record<string, unknown>
    const tabla = obj.table as { body?: unknown } | undefined
    if (tabla && Array.isArray(tabla.body)) {
      for (const fila of tabla.body) {
        if (Array.isArray(fila) && fila.length === 2) {
          pares.push([textos(fila[0]).join(" "), textos(fila[1]).join(" ")])
        }
      }
    }
    for (const [clave, valor] of Object.entries(obj)) {
      if (clave !== "table") visitar(valor)
    }
  }
  visitar(doc)
  return pares
}

/** Imágenes embebidas (la firma digitalizada). */
function imagenes(doc: unknown): string[] {
  if (Array.isArray(doc)) return doc.flatMap(imagenes)
  if (!doc || typeof doc !== "object") return []
  const obj = doc as Record<string, unknown>
  const propia = typeof obj.image === "string" ? [obj.image] : []
  return [
    ...propia,
    ...Object.entries(obj)
      .filter(([clave]) => clave !== "image")
      .flatMap(([, valor]) => imagenes(valor)),
  ]
}

const docDe = (contenido: unknown, firmaDataUrl: string | null = FIRMA) =>
  documentoAvisoCobroPDF({
    aviso: avisoCon(contenido),
    config: CONFIG,
    firmaDataUrl,
    hash: HASH,
  })

describe("documentoAvisoCobroPDF — identidad del aviso", () => {
  it("imprime la comunidad, el folio, el código de verificación, la unidad y el período", () => {
    const todo = textos(docDe(CONTENIDO)).join("\n")
    expect(todo).toContain("Comunidad Los Almendros")
    expect(todo).toContain("AC-0007")
    expect(todo).toContain("VC-1A2B3C4D")
    expect(todo).toContain("Unidad 101 (Departamento)")
    expect(todo).toContain("Período 2026-09")
    expect(todo).toContain("Fecha de emisión: 2026-09-05")
    expect(todo).toContain("Vencimiento: 2026-09-15")
  })

  it("sin vencimiento declarado no inventa una fecha", () => {
    const doc = documentoAvisoCobroPDF({
      aviso: { ...AVISO, vencimiento: null },
      config: CONFIG,
      firmaDataUrl: FIRMA,
      hash: HASH,
    })
    expect(textos(doc).join("\n")).toContain("Vencimiento: No declarado")
  })

  it("imprime la proporción y los términos del reglamento congelados", () => {
    const pares = filas(docDe(CONTENIDO))
    expect(pares).toContainEqual(["Proporción al gasto común", "1,25%"])
    expect(pares).toContainEqual(["Forma de contribución", "prorrateo"])
    expect(pares).toContainEqual(["Aporte al fondo de reserva", "10%"])
    expect(pares).toContainEqual(["Reserva incluida en el presupuesto", "No"])
  })
})

describe("documentoAvisoCobroPDF — desglose por concepto y totales de la comunidad", () => {
  it("el desglose sale de `montos`: cada concepto con su monto, no un total pelado", () => {
    const pares = filas(docDe(CONTENIDO))
    expect(pares).toContainEqual(["Gasto común del período", "$45.000"])
    expect(pares).toContainEqual(["Recargo al fondo de reserva", "$4.500"])
    expect(pares).toContainEqual(["Multas aplicadas", "$0"])
    expect(pares).toContainEqual(["Intereses (moras) devengados", "$1.200"])
    expect(pares).toContainEqual([
      "Otros conceptos — cuota_extraordinaria",
      "$30.000",
    ])
    expect(pares).toContainEqual(["Total exigible del período", "$80.700"])
    expect(pares).toContainEqual(["Pagado a la fecha de emisión", "$20.000"])
    expect(pares).toContainEqual(["TOTAL ADEUDADO", "$60.700"])
  })

  it("imprime los tres totales del art. 31 con su corte", () => {
    const doc = docDe(CONTENIDO)
    const pares = filas(doc)
    expect(pares).toContainEqual(["Ingresos del mes", "$12.500.000"])
    expect(pares).toContainEqual(["Egresos del mes", "$9.800.000"])
    expect(pares).toContainEqual(["Saldo de caja al cierre", "$7.700.000"])
    // El corte del saldo es un dato: sin él, el número no significa nada.
    expect(textos(doc).join("\n")).toContain("2026-09-30")
  })
})

describe("documentoAvisoCobroPDF — firma y hash (S2)", () => {
  it("el hash del contenido congelado se imprime", () => {
    expect(textos(docDe(CONTENIDO)).join("\n")).toContain(
      `Hash del contenido congelado: ${HASH}`
    )
  })

  it("la firma digitalizada resuelta se embebe en el bloque de firma", () => {
    const doc = docDe(CONTENIDO)
    expect(imagenes(doc)).toContain(FIRMA)
    expect(textos(doc).join("\n")).toContain("Ricardo Pérez")
  })

  it("sin firma resuelta el bloque queda en blanco pero sigue nombrando al administrador", () => {
    const doc = docDe(CONTENIDO, null)
    expect(imagenes(doc)).toEqual([])
    expect(textos(doc).join("\n")).toContain("Ricardo Pérez")
  })

  it("declara que los montos vienen del documento congelado y no de un recálculo", () => {
    expect(textos(docDe(CONTENIDO)).join("\n")).toContain("no se recalculan al imprimir")
  })
})

describe("documentoAvisoCobroPDF — el dato que falta se declara, nunca un cero", () => {
  it("un monto ausente del contenido se imprime como «No disponible»", () => {
    const { multas: _multas, ...montosSinMultas } = CONTENIDO.montos
    const pares = filas(docDe({ ...CONTENIDO, montos: montosSinMultas }))
    expect(pares).toContainEqual(["Multas aplicadas", NO_DISPONIBLE])
    expect(pares).not.toContainEqual(["Multas aplicadas", "$0"])
  })

  it("sin el saldo de caja al cierre declara el faltante y no lo deduce de los otros dos", () => {
    const { saldoCaja: _saldo, ...resumenSinSaldo } = CONTENIDO.resumenComunidad
    const pares = filas(docDe({ ...CONTENIDO, resumenComunidad: resumenSinSaldo }))
    expect(pares).toContainEqual(["Saldo de caja al cierre", NO_DISPONIBLE])
    // Los otros dos totales siguen imprimiéndose: lo que falta es solo el saldo.
    expect(pares).toContainEqual(["Ingresos del mes", "$12.500.000"])
    expect(pares).toContainEqual(["Egresos del mes", "$9.800.000"])
  })

  it("sin `totalAdeudado` no lo recalcula con exigible − pagado: lo declara", () => {
    const { totalAdeudado: _total, ...montosSinTotal } = CONTENIDO.montos
    const pares = filas(docDe({ ...CONTENIDO, montos: montosSinTotal }))
    expect(pares).toContainEqual(["TOTAL ADEUDADO", NO_DISPONIBLE])
    expect(pares).not.toContainEqual(["TOTAL ADEUDADO", "$60.700"])
  })

  it("sin `montos` completo el documento no inventa ninguna cifra", () => {
    const doc = docDe({ ...CONTENIDO, montos: undefined })
    const todo = textos(doc).join("\n")
    expect(todo).toContain("Gasto común del período")
    expect(filas(doc)).toContainEqual(["Gasto común del período", NO_DISPONIBLE])
  })

  it("los datos que el contenido declara no computables se imprimen con su motivo", () => {
    const detalle =
      "La unidad 101 no declara coeficiente de participación en el maestro de unidades: la proporción al gasto común y al fondo de reserva no es computable."
    const doc = docDe({
      ...CONTENIDO,
      participacion: {
        prorrateo: null,
        formaContribucion: null,
        porcentajeReserva: null,
        reservaIncluidaEnPresupuesto: null,
      },
      noComputables: [
        { campo: "participacion.prorrateo", motivo: "prorrateo_no_declarado", detalle },
      ],
    })
    const todo = textos(doc).join("\n")
    expect(todo).toContain(detalle)
    expect(filas(doc)).toContainEqual(["Proporción al gasto común", NO_DISPONIBLE])
  })
})

// ── Consolidación de la deuda de períodos anteriores (S4, version 2) ─────────
//
// El aviso es el título ejecutivo: si el vecino arrastra meses, el papel tiene
// que declarar la deuda completa (Ley 21.442 arts. 31 y 32) y no sólo el mes.
// La versión 2 del contenido agrega el bloque; el papel lo imprime cuando el
// payload lo trae y sigue imprimiendo igual un aviso ya emitido en versión 1.

/** La deuda anterior congelada: tres cargos en dos períodos, del más viejo. */
const DEUDA_ANTERIOR = {
  periodos: [
    {
      periodo: "2026-07",
      cargos: [
        {
          cobroId: "cob-jul",
          concepto: "gasto_comun",
          descripcion: "Gasto Común 2026-07",
          montoBase: 45000,
          intereses: 1000,
          pagado: 0,
          saldo: 46000,
        },
      ],
    },
    {
      periodo: "2026-08",
      cargos: [
        {
          cobroId: "cob-ago",
          concepto: "gasto_comun",
          descripcion: "Gasto Común 2026-08",
          montoBase: 45000,
          intereses: 0,
          pagado: 20000,
          saldo: 25000,
        },
      ],
    },
  ],
  total: 71000,
}

/** El mismo aviso, congelado en la versión 2 (período + deuda anterior). */
const CONTENIDO_V2 = {
  ...CONTENIDO,
  version: 2,
  deudaAnterior: DEUDA_ANTERIOR,
  montos: {
    ...CONTENIDO.montos,
    totalDeudaAnterior: 71000,
    totalAdeudadoConsolidado: 131700,
  },
}

/** Renglones de todas las tablas, con el ancho que tenga cada una. */
function renglones(doc: unknown): string[][] {
  const out: string[][] = []
  const visitar = (nodo: unknown): void => {
    if (Array.isArray(nodo)) {
      nodo.forEach(visitar)
      return
    }
    if (!nodo || typeof nodo !== "object") return
    const obj = nodo as Record<string, unknown>
    const tabla = obj.table as { body?: unknown } | undefined
    if (tabla && Array.isArray(tabla.body)) {
      for (const fila of tabla.body) {
        if (Array.isArray(fila)) out.push(fila.map((celda) => textos(celda).join(" ")))
      }
    }
    for (const [clave, valor] of Object.entries(obj)) {
      if (clave !== "table") visitar(valor)
    }
  }
  visitar(doc)
  return out
}

describe("documentoAvisoCobroPDF — deuda de períodos anteriores (S4, versión 2)", () => {
  it("imprime el desglose por período con intereses, pagos y saldo", () => {
    const doc = docDe(CONTENIDO_V2)
    const todo = textos(doc).join("\n")
    expect(todo).toContain("DEUDA DE PERÍODOS ANTERIORES")
    expect(renglones(doc)).toContainEqual([
      "2026-07",
      "gasto_comun — Gasto Común 2026-07",
      "$45.000",
      "$1.000",
      "$0",
      "$46.000",
    ])
    expect(renglones(doc)).toContainEqual([
      "2026-08",
      "gasto_comun — Gasto Común 2026-08",
      "$45.000",
      "$0",
      "$20.000",
      "$25.000",
    ])
  })

  it("los períodos se imprimen del más viejo al más nuevo, como vienen congelados", () => {
    const anchos = renglones(docDe(CONTENIDO_V2))
    const julio = anchos.findIndex((fila) => fila[0] === "2026-07")
    const agosto = anchos.findIndex((fila) => fila[0] === "2026-08")
    expect(julio).toBeGreaterThanOrEqual(0)
    expect(agosto).toBeGreaterThan(julio)
  })

  it("imprime el total de la deuda anterior y el total adeudado consolidado", () => {
    const pares = filas(docDe(CONTENIDO_V2))
    expect(pares).toContainEqual(["Total deuda de períodos anteriores", "$71.000"])
    expect(pares).toContainEqual(["TOTAL ADEUDADO CONSOLIDADO (período + deuda anterior)", "$131.700"])
    // El total del período sigue siendo el del período: no se reemplaza.
    expect(pares).toContainEqual(["TOTAL ADEUDADO", "$60.700"])
  })

  it("sin deuda anterior el papel lo dice en vez de callarlo", () => {
    const sinDeuda = {
      ...CONTENIDO_V2,
      deudaAnterior: { periodos: [], total: 0 },
      montos: { ...CONTENIDO_V2.montos, totalDeudaAnterior: 0, totalAdeudadoConsolidado: 60700 },
    }
    const doc = docDe(sinDeuda)
    expect(textos(doc).join("\n")).toContain(
      "Sin deuda de períodos anteriores al período 2026-09"
    )
    // Sin cargos anteriores no hay renglones de deuda: el bloque queda vacío.
    expect(renglones(doc).some((fila) => fila.length === 6)).toBe(false)
    expect(filas(doc)).toContainEqual([
      "TOTAL ADEUDADO CONSOLIDADO (período + deuda anterior)",
      "$60.700",
    ])
  })

  it("un aviso ya emitido en versión 1 se imprime exactamente como antes, sin la sección", () => {
    const doc = docDe(CONTENIDO)
    const todo = textos(doc).join("\n")
    expect(todo).not.toContain("DEUDA DE PERÍODOS ANTERIORES")
    expect(todo).not.toContain("Sin deuda de períodos anteriores")
    expect(renglones(doc).some((fila) => fila.length === 6)).toBe(false)
    const pares = filas(doc)
    // Sus cifras siguen siendo las mismas de siempre.
    expect(pares).toContainEqual(["TOTAL ADEUDADO", "$60.700"])
    expect(pares).not.toContainEqual([
      "TOTAL ADEUDADO CONSOLIDADO (período + deuda anterior)",
      "$60.700",
    ])
  })

  it("una cifra de la deuda anterior que no está se declara, nunca se imprime como cero", () => {
    const incompleto = {
      ...CONTENIDO_V2,
      deudaAnterior: {
        periodos: [
          {
            periodo: "2026-07",
            cargos: [{ cobroId: "cob-jul", concepto: "gasto_comun", descripcion: "Gasto Común 2026-07", montoBase: 45000 }],
          },
        ],
        total: 46000,
      },
      montos: { ...CONTENIDO_V2.montos, totalAdeudadoConsolidado: undefined },
    }
    const doc = docDe(incompleto)
    const filaJulio = renglones(doc).find((fila) => fila[0] === "2026-07")!
    expect(filaJulio.slice(3)).toEqual([NO_DISPONIBLE, NO_DISPONIBLE, NO_DISPONIBLE])
    expect(filaJulio).not.toContain("$0")
    expect(filas(doc)).toContainEqual([
      "TOTAL ADEUDADO CONSOLIDADO (período + deuda anterior)",
      NO_DISPONIBLE,
    ])
  })
})
