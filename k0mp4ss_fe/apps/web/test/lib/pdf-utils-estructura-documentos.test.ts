/**
 * pdf-utils — los tres documentos del motor tienen que ser un documento pdfmake
 * de verdad, no un objeto que se le parece.
 *
 * El defecto que este archivo congela: el bloque de firma es un **array** de
 * cuatro nodos, y tres builders lo metían en `content` con
 * `{ ...bloqueFirma(...), marginTop: 30 }`. Ese spread no aplana nada: produce
 * `{"0":…,"1":…,"2":…,"3":…,"marginTop":30}`, un objeto **con claves numéricas**,
 * y pdfmake lo rechaza con `Unrecognized document structure`. El resultado era
 * que NINGÚN PDF de la aplicación se podía generar (certificado, liquidación y
 * aviso de cobro), hubiera o no firma configurada.
 *
 * Por eso se prohíben dos cosas a la vez, nodo por nodo:
 *   1. cualquier objeto cuyas claves sean TODAS cadenas numéricas — el shape que
 *      pdfmake no reconoce (el spread de un array, venga de donde venga);
 *   2. que pdfmake no pueda construir el binario: acá se arma el documento con
 *      el motor real (`getBuffer`) y se exige un PDF no vacío.
 *
 * El chequeo es estático (definición + motor real, sin navegador): no necesita
 * Playwright para darse cuenta de que el documento estaba roto.
 */
import { createRequire } from "node:module"
import { describe, it, expect } from "vitest"
import {
  documentoAvisoCobroPDF,
  documentoCertificadoPDF,
  documentoLiquidacionPDF,
} from "@/lib/pdf-utils"
import type { ConfiguracionGlobal, LiquidacionPL } from "@/lib/schemas"

const require = createRequire(import.meta.url)

/** pdfmake real (mismo binario que usa el cliente) para validar el documento. */
function pdfMakeReal(): any {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pdfMake: any = require("pdfmake/build/pdfmake")
  const vfsMod: any = require("pdfmake/build/vfs_fonts")
  const vfs = vfsMod.default ?? vfsMod["module.exports"] ?? vfsMod
  if (typeof pdfMake.addVirtualFileSystem === "function") {
    pdfMake.addVirtualFileSystem(vfs)
  } else {
    pdfMake.vfs = { ...(pdfMake.vfs ?? {}), ...vfs }
  }
  return pdfMake
}

/** Descarga que haría una pantalla; sólo interesa que el binario se arme. */
async function bytesDelDocumento(doc: Record<string, unknown>): Promise<number> {
  const buffer = await pdfMakeReal().createPdf(doc).getBuffer()
  return buffer.length
}

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

const LIQUIDACION: LiquidacionPL = {
  id: "liq-1",
  folio: "LQ-0001",
  trabajadorPersonaId: "per-1",
  periodo: "2026-09",
  fechaGeneracion: "2026-09-30",
  diasTrabajados: 30,
  sueldoBaseContrato: 900000,
  diasMesComercial: 30,
  jornadaSemanal: 44,
  sueldoBaseProporcional: 900000,
  horasExtrasHoras: 0,
  valorHoraOrdinaria: 5113,
  montoHorasExtras: 0,
  bonos: [],
  gratificacionLegal: 0,
  totalImponible: 900000,
  asignacionMovilizacion: 0,
  asignacionColacion: 0,
  cargas: 0,
  montoAsignacionFamiliar: 0,
  totalHaberes: 900000,
  nombreAfp: "AFP Modelo",
  tasaAFP: 10.44,
  montoAFP: 93960,
  nombreSalud: "Fonasa",
  saludTipo: "fonasa",
  montoSalud: 63000,
  tasaSIS: 1.88,
  montoSIS: 16920,
  montoSeguroCesantia: 5400,
  montoAPV: 0,
  totalDescuentos: 179280,
  descuentoAnticipos: 0,
  adelantosIds: [],
  alcanceLiquido: 720720,
  liquidoAPagar: 720720,
  estado: "confirmada",
}

const AVISO = {
  folio: "AC-0001",
  codigoVerificacion: "A1B2C3",
  periodo: "2026-09",
  fechaEmision: "2026-09-05",
  vencimiento: "2026-09-15",
  contenido: {
    version: 1 as const,
    periodo: "2026-09",
    fechaEmision: "2026-09-05",
    unidad: { id: "u-101", numero: "101", etiqueta: "Departamento" },
    participacion: {
      prorrateo: 0.0125,
      formaContribucion: "prorrateo",
      porcentajeReserva: 10,
      reservaIncluidaEnPresupuesto: false,
    },
    montos: {
      gastoComun: 45000,
      recargoFondoReserva: 4500,
      multas: 0,
      intereses: 1200,
      otros: [],
      exigible: 50700,
      pagado: 0,
      totalAdeudado: 50700,
    },
    resumenComunidad: {
      periodo: "2026-09",
      desde: "2026-09-01",
      hasta: "2026-09-30",
      ingresos: { total: 12500000 },
      egresos: { total: 9800000 },
      saldoCaja: { alCierre: 7700000 },
    },
    noComputables: [],
  },
}

/**
 * Todos los nodos del documento con AL MENOS UNA clave que es una cadena
 * numérica (`"0"`, `"1"`, …).
 *
 * Un nodo pdfmake se identifica por nombres (`text`, `stack`, `marginTop`),
 * nunca por índices: que aparezcan claves numéricas significa que un array se
 * metió dentro de un objeto. Dos formas del mismo error, y las dos se prohíben:
 *   - claves TODAS numéricas = `{ ...array }` puro (el shape que pdfmake
 *     rechaza con `Unrecognized document structure`);
 *   - claves numéricas mezcladas con propiedades = `{ ...array, marginTop: 30 }`,
 *     que es exactamente cómo lo hacían los tres builders y por eso también se
 *     rechaza, aunque la comprobación ingenua de "todas numéricas" no lo vea.
 * Devuelve la ruta exacta donde quedó, para que el fallo se lea sin depurar.
 */
function nodosConClavesNumericas(
  nodo: unknown,
  ruta = "$"
): { ruta: string; claves: string[]; json: string }[] {
  const hallazgos: { ruta: string; claves: string[]; json: string }[] = []
  if (Array.isArray(nodo)) {
    nodo.forEach((hijo, indice) => {
      hallazgos.push(...nodosConClavesNumericas(hijo, `${ruta}[${indice}]`))
    })
    return hallazgos
  }
  if (!nodo || typeof nodo !== "object") return hallazgos
  const claves = Object.keys(nodo as Record<string, unknown>)
  const numericas = claves.filter((clave) => /^\d+$/.test(clave))
  if (numericas.length > 0) {
    hallazgos.push({
      ruta,
      claves,
      json: JSON.stringify(nodo).slice(0, 300),
    })
  }
  for (const clave of claves) {
    hallazgos.push(
      ...nodosConClavesNumericas(
        (nodo as Record<string, unknown>)[clave],
        `${ruta}.${clave}`
      )
    )
  }
  return hallazgos
}

/** Un PDF que abre el lector pesa bastante más que un esqueleto vacío. */
const BYTES_MINIMOS = 1000

describe("pdf-utils — ningún documento contiene un nodo con claves numéricas", () => {
  it("el certificado arma su bloque de firma como array pdfmake y produce un PDF real", async () => {
    const doc = await documentoCertificadoPDF({
      tipo: "Residencia",
      titulo: "Certificado de residencia",
      folio: "CT-0001",
      codigoVerificacion: "A1B2C3",
      fechaEmision: "2026-11-05",
      parrafos: ["La unidad 101 corresponde a la comunidad Los Almendros."],
      detalle: [["Unidad", "101"]],
      solicitanteNombre: "Ana Pérez",
      config: CONFIG,
    })

    expect(
      nodosConClavesNumericas(doc),
      "un objeto con claves numéricas es el spread de un array (bloque de firma) y pdfmake lo rechaza"
    ).toEqual([])
    expect(await bytesDelDocumento(doc)).toBeGreaterThan(BYTES_MINIMOS)
  })

  it("la liquidación arma su bloque de firma como array pdfmake y produce un PDF real", async () => {
    const doc = await documentoLiquidacionPDF(
      LIQUIDACION,
      "Ana Pérez",
      "11.111.111-1",
      CONFIG
    )

    expect(
      nodosConClavesNumericas(doc),
      "un objeto con claves numéricas es el spread de un array (bloque de firma) y pdfmake lo rechaza"
    ).toEqual([])
    expect(await bytesDelDocumento(doc)).toBeGreaterThan(BYTES_MINIMOS)
  })

  it("el aviso de cobro arma su bloque de firma como array pdfmake y produce un PDF real", async () => {
    const doc = documentoAvisoCobroPDF({
      aviso: AVISO,
      config: CONFIG,
      firmaDataUrl: null,
      hash: "A1B2C3D4E5F60718",
    })

    expect(
      nodosConClavesNumericas(doc),
      "un objeto con claves numéricas es el spread de un array (bloque de firma) y pdfmake lo rechaza"
    ).toEqual([])
    expect(await bytesDelDocumento(doc)).toBeGreaterThan(BYTES_MINIMOS)
  })
})
