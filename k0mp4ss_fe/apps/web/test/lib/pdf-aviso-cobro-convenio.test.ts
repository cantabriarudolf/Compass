/**
 * La declaración del convenio en el PAPEL del aviso de cobro (F29 · S3, T3b).
 *
 * El contenido congelado ya declara el convenio vigente al emitir
 * (`contenido.convenio`: el folio del acuerdo del Comité que lo autoriza, la
 * cuota que va M de N y la línea `texto` redactada) — lo fija
 * `test/lib/aviso-cobro-convenio.test.ts`. Esta unidad cierra el hueco: la
 * línea estaba congelada y el papel no la imprimía, así que para el residente
 * el convenio seguía sin existir.
 *
 * Dos reglas duras:
 *
 *   1. el papel imprime `contenido.convenio.texto` TAL CUAL — la línea ya
 *      salió redactada al emitir; re-redactarla o recomponer el acuerdo y la
 *      cuota desde los datos sueltos produciría una segunda versión que
 *      podría contradecir lo que el sistema firmó al emitir;
 *   2. sin declaración de convenio el papel queda byte a byte como hoy: el
 *      pin de abajo congela la definición completa del aviso (capturada del
 *      builder antes de la declaración) y no puede romperse jamás.
 *
 * El método es el de los tests pdf existentes (`test/lib/pdf-aviso-cobro.test.ts`):
 * la definición pdfmake se lee con los helpers `textos`/`filas`, no el binario;
 * el motor real compila en `test/lib/pdf-utils-estructura-documentos.test.ts`.
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

/** Continuidad con el test del contenido: el convenio tal como quedó congelado. */
const CONVENIO_CONGELADO = {
  acuerdoFolio: "AD-2026-9001",
  cuota: { numero: 1, de: 3, monto: 250_000, vencimiento: "2026-09-20" },
  texto:
    "La unidad tiene un convenio de pago de deuda vigente, autorizado por el acuerdo del Comité folio AD-2026-9001. La cuota que va al emitir este aviso es la 1 de 3, por $250.000, con vencimiento el 2026-09-20.",
}

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

/** Contenido congelado v2, tal como el sistema lo emite hoy, SIN convenio. */
const CONTENIDO_V2 = {
  version: 2 as const,
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
  deudaAnterior: DEUDA_ANTERIOR,
  montos: {
    gastoComun: 45000,
    recargoFondoReserva: 4500,
    multas: 0,
    intereses: 1200,
    otros: [{ concepto: "cuota_extraordinaria", monto: 30000 }],
    exigible: 80700,
    pagado: 20000,
    totalAdeudado: 60700,
    totalDeudaAnterior: 71000,
    totalAdeudadoConsolidado: 131700,
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

const CONTENIDO_CON_CONVENIO = { ...CONTENIDO_V2, convenio: CONVENIO_CONGELADO }

const AVISO = {
  folio: "AC-0007",
  codigoVerificacion: "VC-1A2B3C4D",
  periodo: "2026-09",
  fechaEmision: "2026-09-05",
  vencimiento: "2026-09-15",
  contenido: CONTENIDO_V2,
}

const docDe = (contenido: unknown) =>
  documentoAvisoCobroPDF({
    aviso: { ...AVISO, contenido },
    config: CONFIG,
    firmaDataUrl: FIRMA,
    hash: HASH,
  })

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

/**
 * El papel SIN convenio, texto por texto en el orden en que se imprime:
 * capturado del builder antes de declarar el convenio (T3b). Los anchos de
 * tabla (`"*"`, `"auto"`) viajan como texto en este recorrido, igual que en el
 * builder: son parte de la definición y también se congelan.
 */
const PAPEL_SIN_CONVENIO = [
  "Comunidad Los Almendros",
  "Av. Los Almendros 123, Ñuñoa · RUT 76.123.456-7",
  "Administrador responsable: Ricardo Pérez (12.345.678-9)",
  "AVISO DE COBRO DE GASTOS COMUNES",
  "Folio AC-0007 · Código de verificación: VC-1A2B3C4D",
  "Unidad 101 (Departamento) · Período 2026-09",
  "Fecha de emisión: 2026-09-05 · Vencimiento: 2026-09-15",
  "PARTICIPACIÓN EN EL GASTO COMÚN",
  "*",
  "auto",
  "Proporción al gasto común",
  "1,25%",
  "Forma de contribución",
  "prorrateo",
  "Aporte al fondo de reserva",
  "10%",
  "Reserva incluida en el presupuesto",
  "No",
  "CONCEPTOS DEL PERÍODO",
  "*",
  "auto",
  "Gasto común del período",
  "$45.000",
  "Recargo al fondo de reserva",
  "$4.500",
  "Multas aplicadas",
  "$0",
  "Intereses (moras) devengados",
  "$1.200",
  "Otros conceptos — cuota_extraordinaria",
  "$30.000",
  "Total exigible del período",
  "$80.700",
  "Pagado a la fecha de emisión",
  "$20.000",
  "TOTAL ADEUDADO",
  "$60.700",
  "DEUDA DE PERÍODOS ANTERIORES",
  "auto",
  "*",
  "auto",
  "auto",
  "auto",
  "auto",
  "Período",
  "Concepto",
  "Monto base",
  "Intereses",
  "Pagado",
  "Saldo",
  "2026-07",
  "gasto_comun — Gasto Común 2026-07",
  "$45.000",
  "$1.000",
  "$0",
  "$46.000",
  "2026-08",
  "gasto_comun — Gasto Común 2026-08",
  "$45.000",
  "$0",
  "$20.000",
  "$25.000",
  "*",
  "auto",
  "Total deuda de períodos anteriores",
  "$71.000",
  "TOTAL ADEUDADO CONSOLIDADO (período + deuda anterior)",
  "$131.700",
  "TOTALES DE LA COMUNIDAD (período 2026-09, corte 2026-09-30)",
  "*",
  "auto",
  "Ingresos del mes",
  "$12.500.000",
  "Egresos del mes",
  "$9.800.000",
  "Saldo de caja al cierre",
  "$7.700.000",
  "TRAZABILIDAD DEL DOCUMENTO",
  "Hash del contenido congelado: A1B2C3D4E5F60718",
  "Verificación: SHA-256 del JSON canónico del contenido (claves ordenadas, sin espacios); se imprimen los primeros 16 caracteres hexadecimales en mayúscula. Cualquiera puede recalcularlo y compararlo.",
  "Los montos de este aviso provienen del documento congelado al momento de su emisión: no se recalculan al imprimir.",
  "_______________________________",
  "Ricardo Pérez",
  "Administrador — Firma digitalizada",
]

/** El pie de página del papel sin convenio (el builder lo imprime por página). */
const PIE_SIN_CONVENIO = [
  "Aviso AC-0007 · 2026-09 · Hash A1B2C3D4E5F60718",
  "Página 1",
]

describe("documentoAvisoCobroPDF — la declaración del convenio (F29 · S3)", () => {
  it("con convenio el papel imprime la línea congelada, tal cual salió del contenido", () => {
    const doc = docDe(CONTENIDO_CON_CONVENIO)
    expect(textos(doc).join("\n")).toContain(CONVENIO_CONGELADO.texto)
    expect(textos(doc)).toContain("CONVENIO DE PAGO DE DEUDA")
  })

  it("la declaración va junto a la deuda de la unidad: después de la deuda anterior y antes de los totales de la comunidad", () => {
    const orden = textos(docDe(CONTENIDO_CON_CONVENIO))
    const deud = orden.indexOf("DEUDA DE PERÍODOS ANTERIORES")
    const unidadConvenio = orden.indexOf("CONVENIO DE PAGO DE DEUDA")
    const comunidad = orden.indexOf(
      "TOTALES DE LA COMUNIDAD (período 2026-09, corte 2026-09-30)"
    )
    expect(unidadConvenio).toBeGreaterThan(deud)
    expect(unidadConvenio).toBeLessThan(comunidad)
  })

  it("una cuota `null` congelada imprime su línea tal cual: no se re-redacta lo que el convenio declaró", () => {
    const texto =
      "La unidad tiene un convenio de pago de deuda vigente, autorizado por el acuerdo del Comité folio AD-2026-9001. Al emitir este aviso el convenio no declara ninguna cuota impaga."
    const doc = docDe({
      ...CONTENIDO_CON_CONVENIO,
      convenio: { acuerdoFolio: "AD-2026-9001", cuota: null, texto },
    })
    expect(textos(doc).join("\n")).toContain(texto)
  })

  it("un convenio sin folio legible imprime la ausencia congelada y no inventa un correlativo", () => {
    const texto =
      "La unidad tiene un convenio de pago de deuda vigente, y el folio del acuerdo del Comité que lo autoriza no se pudo leer. La cuota que va al emitir este aviso es la 1 de 3, por $250.000, con vencimiento el 2026-09-20."
    const doc = docDe({
      ...CONTENIDO_CON_CONVENIO,
      convenio: { acuerdoFolio: null, cuota: CONVENIO_CONGELADO.cuota, texto },
    })
    const todo = textos(doc).join("\n")
    expect(todo).toContain(texto)
    expect(todo).not.toContain("AD-2026-9001")
  })

  it("un convenio congelado cuya línea no se puede leer declara el faltante, nunca un hueco", () => {
    const doc = docDe({
      ...CONTENIDO_CON_CONVENIO,
      convenio: { ...CONVENIO_CONGELADO, texto: "" },
    })
    expect(textos(doc).join("\n")).toContain(
      `CONVENIO DE PAGO DE DEUDA\n${NO_DISPONIBLE}`
    )
  })

  it("sin convenio declarado el papel queda byte a byte como hoy: ninguna mención, ningún nodo nuevo", () => {
    const doc = docDe(CONTENIDO_V2)
    expect(textos(doc)).toEqual(PAPEL_SIN_CONVENIO)
    expect(textos((doc as any).footer(1))).toEqual(PIE_SIN_CONVENIO)
    // Por si el pin se actualizara algún día: la palabra no pertenece a un
    // aviso sin convenio, ni en el cuerpo ni en el pie.
    expect(textos(doc).join("\n").toLowerCase()).not.toContain("convenio")
    expect(textos((doc as any).footer(1)).join("\n").toLowerCase()).not.toContain(
      "convenio"
    )
  })

  it("un convenio escrito como `null` no agrega nada: el papel es el de siempre", () => {
    expect(textos(docDe({ ...CONTENIDO_V2, convenio: null }))).toEqual(
      PAPEL_SIN_CONVENIO
    )
  })
})

describe("documentoAvisoCobroPDF — el resto del papel no se mueve cuando la declaración entra", () => {
  it("las cifras del período, la deuda anterior y la comunidad siguen saliendo del contenido", () => {
    const doc = docDe(CONTENIDO_CON_CONVENIO)
    const pares = filas(doc)
    expect(pares).toContainEqual(["TOTAL ADEUDADO", "$60.700"])
    expect(pares).toContainEqual([
      "TOTAL ADEUDADO CONSOLIDADO (período + deuda anterior)",
      "$131.700",
    ])
    expect(pares).toContainEqual(["Ingresos del mes", "$12.500.000"])
    expect(pares).toContainEqual(["Saldo de caja al cierre", "$7.700.000"])
  })
})
