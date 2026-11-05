// Motor documental pdfmake (PL liquidaciones + CT certificados). Restricción de
// salida D1: el PDF y la firma viven SOLO en memoria del documento generado;
// jamás se persisten base64/Blob en el store. Carga dinámica client-side.
import type { ConfiguracionGlobal, LiquidacionPL } from "./schemas"

/* eslint-disable @typescript-eslint/no-explicit-any */

let pdfMakePromise: Promise<any> | null = null

async function cargarPdfMake(): Promise<any> {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const mod: any = await import("pdfmake/build/pdfmake")
      const pdfMake = mod.default ?? mod
      const vfsMod: any = await import("pdfmake/build/vfs_fonts")
      const vfs = vfsMod.default ?? vfsMod["module.exports"] ?? vfsMod
      if (typeof pdfMake.addVirtualFileSystem === "function") {
        pdfMake.addVirtualFileSystem(vfs)
      } else {
        pdfMake.vfs = { ...(pdfMake.vfs ?? {}), ...vfs }
      }
      return pdfMake
    })()
  }
  return pdfMakePromise
}

export async function descargarPdf(
  docDefinition: Record<string, unknown>,
  fileName: string
): Promise<void> {
  const pdfMake = await cargarPdfMake()
  pdfMake.createPdf(docDefinition).download(fileName)
}

// Convierte una URL de imagen a dataURL en memoria para embeberla en el PDF.
// Devuelve null si no es cargable (CORS/ausente): el documento sale con línea
// de firma en blanco.
export async function urlADataUrl(url: string): Promise<string | null> {
  if (!url || (/^data:/i.test(url) === false && !/^https?:/i.test(url)))
    return null
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas")
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext("2d")
          if (!ctx) return resolve(null)
          ctx.drawImage(img, 0, 0)
          resolve(canvas.toDataURL("image/png"))
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = url
    } catch {
      resolve(null)
    }
  })
}

const CLP = (n: number): string => `$${Math.round(n).toLocaleString("es-CL")}`

function encabezadoInstitucional(config: ConfiguracionGlobal) {
  return [
    { text: config.nombreComunidad, style: "titulo" },
    `${config.direccionOficial} · RUT ${config.rutComunidad}`,
    `Administrador responsable: ${config.administradorResponsable} (${config.rutAdministrador})`,
  ]
}

export interface FirmaPdfInput {
  config: ConfiguracionGlobal
  firmaDataUrl?: string | null
}

function bloqueFirma({ config, firmaDataUrl }: FirmaPdfInput) {
  const linea: any[] = []
  if (firmaDataUrl) {
    linea.push({ image: firmaDataUrl, width: 140, alignment: "center" })
  } else {
    linea.push({ text: " ", marginBottom: 40 })
  }
  linea.push({ text: "_______________________________", alignment: "center" })
  linea.push({
    text: `${config.administradorResponsable}`,
    alignment: "center",
    bold: true,
  })
  linea.push({
    text: "Administrador — Firma digitalizada",
    alignment: "center",
    fontSize: 9,
  })
  return linea
}

// Liquidación de sueldo estándar chileno con firma embebida.
export async function documentoLiquidacionPDF(
  liq: LiquidacionPL,
  nombreTrabajador: string,
  rutTrabajador: string,
  config: ConfiguracionGlobal
): Promise<Record<string, unknown>> {
  const firmaDataUrl = config.firmaDigitalizadaUrl
    ? await urlADataUrl(config.firmaDigitalizadaUrl)
    : null
  const fila = (a: string, b: string): any[] => [
    { text: a },
    { text: b, alignment: "right" },
  ]
  const seccion = (t: string): any => ({
    text: t,
    bold: true,
    marginTop: 10,
    marginBottom: 4,
    fontSize: 11,
  })

  const doc = {
    header: encabezadoInstitucional(config),
    footer: (currentPage: number) => ({
      columns: [
        { text: `Liquidación ${liq.folio} · ${liq.periodo}`, fontSize: 8 },
        { text: `Página ${currentPage}`, fontSize: 8, alignment: "right" },
      ],
    }),
    content: [
      { text: "LIQUIDACIÓN DE SUELDO", style: "titulo", alignment: "center" },
      `Trabajador: ${nombreTrabajador} · RUT ${rutTrabajador}`,
      `Periodo: ${liq.periodo} · Folio: ${liq.folio} · Días trabajados: ${liq.diasTrabajados}/${liq.diasMesComercial}`,
      seccion("HABERES"),
      {
        table: {
          widths: ["*", "auto"],
          body: [
            fila(
              `Sueldo base (${liq.diasTrabajados} días × ${CLP(liq.sueldoBaseContrato)})`,
              CLP(liq.sueldoBaseProporcional)
            ),
            ...(liq.horasExtrasHoras > 0
              ? [
                  fila(
                    `Horas extras (${liq.horasExtrasHoras} h × ${CLP(liq.valorHoraOrdinaria)} × 1.5)`,
                    CLP(liq.montoHorasExtras)
                  ),
                ]
              : []),
            ...liq.bonos.map((b) =>
              fila(`${b.glosa}${b.imponible ? " (imp.)" : ""}`, CLP(b.monto))
            ),
            ...(liq.gratificacionLegal > 0
              ? [fila("Gratificación legal", CLP(liq.gratificacionLegal))]
              : []),
            ...(liq.asignacionMovilizacion > 0
              ? [
                  fila(
                    "Asignación de movilización",
                    CLP(liq.asignacionMovilizacion)
                  ),
                ]
              : []),
            ...(liq.asignacionColacion > 0
              ? [fila("Asignación de colación", CLP(liq.asignacionColacion))]
              : []),
            ...(liq.montoAsignacionFamiliar > 0
              ? [
                  fila(
                    `Asignación familiar (${liq.cargas} carga(s))`,
                    CLP(liq.montoAsignacionFamiliar)
                  ),
                ]
              : []),
            [
              { text: "Total Haberes", bold: true },
              { text: CLP(liq.totalHaberes), bold: true, alignment: "right" },
            ],
            [
              { text: "Total Imponible", bold: true },
              { text: CLP(liq.totalImponible), bold: true, alignment: "right" },
            ],
          ],
        },
      },
      seccion("DESCUENTOS LEGALES Y VOLUNTARIOS"),
      {
        table: {
          widths: ["*", "auto"],
          body: [
            ...(liq.montoAFP > 0
              ? [fila(`${liq.nombreAfp} (${liq.tasaAFP}%)`, CLP(liq.montoAFP))]
              : []),
            ...(liq.montoSalud > 0
              ? [
                  fila(
                    `${liq.nombreSalud}${liq.saludTipo === "isapre" && liq.saludValorUF ? ` (${liq.saludValorUF} UF)` : liq.saludPorcentaje ? ` (${liq.saludPorcentaje}%)` : " (7%)"}`,
                    CLP(liq.montoSalud)
                  ),
                ]
              : []),
            ...(liq.montoSIS > 0
              ? [fila(`SIS (${liq.tasaSIS}%)`, CLP(liq.montoSIS))]
              : []),
            ...(liq.montoSeguroCesantia > 0
              ? [fila("Seguro de cesantía", CLP(liq.montoSeguroCesantia))]
              : []),
            ...(liq.montoAPV > 0
              ? [fila("APV / Ahorro voluntario", CLP(liq.montoAPV))]
              : []),
            ...(liq.descuentoAnticipos > 0
              ? [fila("Descuento de anticipos", CLP(liq.descuentoAnticipos))]
              : []),
            [
              { text: "Total Descuentos", bold: true },
              {
                text: CLP(liq.totalDescuentos + liq.descuentoAnticipos),
                bold: true,
                alignment: "right",
              },
            ],
          ],
        },
      },
      seccion("TOTALES DE CONTROL"),
      {
        table: {
          widths: ["*", "auto"],
          body: [
            fila("Alcance líquido", CLP(liq.alcanceLiquido)),
            [
              {
                text: "TOTAL LÍQUIDO A PAGAR",
                bold: true,
                fillColor: "#eeeeee",
              },
              {
                text: CLP(liq.liquidoAPagar),
                bold: true,
                alignment: "right",
                fillColor: "#eeeeee",
              },
            ],
          ],
        },
      },
      { ...bloqueFirma({ config, firmaDataUrl }), marginTop: 30 },
    ],
    styles: { titulo: { fontSize: 14, bold: true } },
    defaultStyle: { font: "Roboto", fontSize: 10 },
  }
  return doc
}

// Certificado CT genérico: cuerpo por líneas clave/valor + código verificación.
export async function documentoCertificadoPDF(input: {
  tipo: string
  titulo: string
  folio: string
  codigoVerificacion: string
  fechaEmision: string
  parrafos: string[]
  detalle: [string, string][]
  solicitanteNombre: string
  config: ConfiguracionGlobal
}): Promise<Record<string, unknown>> {
  const { config } = input
  const firmaDataUrl = config.firmaDigitalizadaUrl
    ? await urlADataUrl(config.firmaDigitalizadaUrl)
    : null
  const doc = {
    header: encabezadoInstitucional(config),
    content: [
      {
        text: input.titulo.toUpperCase(),
        style: "titulo",
        alignment: "center",
      },
      `Folio ${input.folio} · Código de verificación: ${input.codigoVerificacion}`,
      `Emitido el ${input.fechaEmision} por la administración de ${config.nombreComunidad}.`,
      { text: "", margin: [0, 8] as [number, number] },
      ...input.parrafos.map((p) => ({
        text: p,
        alignment: "justify",
        marginBottom: 8,
      })),
      ...(input.detalle.length > 0
        ? [
            {
              table: {
                widths: ["*", "auto"],
                body: input.detalle.map(([k, v]) => [
                  k,
                  { text: v, alignment: "right" },
                ]),
              },
            },
          ]
        : []),
      {
        text: `Se extiende el presente ${input.tipo} a solicitud de ${input.solicitanteNombre}, para los fines que estime convenientes.`,
        marginTop: 12,
      },
      { ...bloqueFirma({ config, firmaDataUrl }), marginTop: 30 },
    ],
    styles: { titulo: { fontSize: 14, bold: true } },
    defaultStyle: { font: "Roboto", fontSize: 10 },
  }
  return doc
}

// ── Aviso de cobro mensual (serie aviso-de-cobro, T5 / S2) ────────────────────
//
// El aviso firmado es el papel con el que se cobra (Ley 21.442 arts. 31 y 32).
// Este documento se arma SOLO desde la fila congelada `avisos_cobro`: cada cifra
// sale de `contenido`, ninguna se recalcula desde los cargos, el reglamento ni el
// resumen del mes. Un PDF que recalcula es un PDF que puede contradecir el aviso
// que se firmó, y el papel dejaría de ser prueba de nada.
//
// La regla del dato que falta es la misma del contenido: si la fila no trae una
// cifra, el documento imprime `NO_DISPONIBLE`, nunca un cero (un cero se lee
// como "no se cobra" y ahí significa "no se sabe").

/** Marca única de una cifra que la fila congelada no trae. Nunca un cero. */
export const NO_DISPONIBLE = "No disponible"

/** La fila congelada del aviso: columnas + `contenido` (JSON de la base). */
export interface FilaAvisoCobroPdf {
  folio: string
  codigoVerificacion: string
  periodo: string
  fechaEmision: string
  vencimiento: string | null
  /** `ContenidoAviso` congelado; se lee de forma defensiva, es JSON de base. */
  contenido: unknown
}

export interface AvisoPdfInput {
  aviso: FilaAvisoCobroPdf
  config: ConfiguracionGlobal
  /** Firma ya resuelta a data URL (`urlADataUrl`); `null` = bloque en blanco. */
  firmaDataUrl?: string | null
  /**
   * Huella del contenido congelado, ya calculada con `hashContenido`.
   *
   * Entra calculada porque este módulo es de CLIENTE (lo importan las pantallas)
   * y `lib/aviso-cobro` es de SERVIDOR (crypto + Prisma): importar la función de
   * valor arrastraría Prisma al bundle del navegador. La ruta que imprime el
   * aviso la pasa con `hashContenido(aviso.contenido)`.
   */
  hash: string
}

function objetoDe(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

/** La cifra congelada, o `null` si la fila no la trae (jamás un 0 de relleno). */
function cifraDe(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null
}

function textoDe(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null
}

/** `null` se imprime como el faltante declarado; el resto como monto chileno. */
function dinero(valor: number | null): string {
  return valor === null ? NO_DISPONIBLE : CLP(valor)
}

/** Proporción declarada como fracción (`0.0125`) impresa como porcentaje. */
function porcentajeFraccion(valor: number | null): string {
  return valor === null
    ? NO_DISPONIBLE
    : `${(valor * 100).toLocaleString("es-CL", { maximumFractionDigits: 4 })}%`
}

/** Porcentaje que el reglamento ya declara en puntos (`10` = 10%). */
function porcentajePuntos(valor: number | null): string {
  return valor === null
    ? NO_DISPONIBLE
    : `${valor.toLocaleString("es-CL", { maximumFractionDigits: 4 })}%`
}

function siNo(valor: unknown): string {
  return typeof valor === "boolean" ? (valor ? "Sí" : "No") : NO_DISPONIBLE
}

/**
 * Aviso de cobro mensual firmado, con el hash del contenido congelado impreso.
 *
 * Síncrona a propósito: la firma llega ya resuelta (no hay nada que esperar) y
 * todo lo demás sale de la fila. Devuelve la definición pdfmake; descargarla es
 * trabajo de `descargarPdf`.
 */
export function documentoAvisoCobroPDF(
  input: AvisoPdfInput
): Record<string, unknown> {
  const { aviso, config, firmaDataUrl = null, hash } = input
  const contenido = objetoDe(aviso.contenido)
  const montos = objetoDe(contenido.montos)
  const resumen = objetoDe(contenido.resumenComunidad)
  const participacion = objetoDe(contenido.participacion)
  const unidad = objetoDe(contenido.unidad)
  const noComputables = Array.isArray(contenido.noComputables)
    ? contenido.noComputables
    : []

  const fila = (etiqueta: string, valor: string): any[] => [
    { text: etiqueta },
    { text: valor, alignment: "right" },
  ]
  const filaMonto = (etiqueta: string, valor: unknown): any[] =>
    fila(etiqueta, dinero(cifraDe(valor)))
  const filaTotal = (etiqueta: string, valor: unknown): any[] => [
    { text: etiqueta, bold: true, fillColor: "#eeeeee" },
    {
      text: dinero(cifraDe(valor)),
      bold: true,
      alignment: "right",
      fillColor: "#eeeeee",
    },
  ]
  const seccion = (titulo: string): any => ({
    text: titulo,
    bold: true,
    marginTop: 10,
    marginBottom: 4,
    fontSize: 11,
  })
  const tabla = (filas: any[][]): any => ({
    table: { widths: ["*", "auto"], body: filas },
  })

  const numeroUnidad = textoDe(unidad.numero) ?? NO_DISPONIBLE
  const etiquetaUnidad = textoDe(unidad.etiqueta) ?? NO_DISPONIBLE
  const hasta = textoDe(resumen.hasta) ?? NO_DISPONIBLE

  // `otros` es una lista: ausente es un faltante declarado, vacía es "no hay
  // otros conceptos". No son lo mismo y el documento no los confunde.
  const otros = Array.isArray(montos.otros) ? montos.otros : null
  const filasOtros =
    otros === null
      ? [fila("Otros conceptos", NO_DISPONIBLE)]
      : otros.map((otro) => {
          const concepto = textoDe(objetoDe(otro).concepto) ?? NO_DISPONIBLE
          return filaMonto(`Otros conceptos — ${concepto}`, objetoDe(otro).monto)
        })

  const doc = {
    header: encabezadoInstitucional(config),
    footer: (currentPage: number) => ({
      columns: [
        {
          text: `Aviso ${aviso.folio} · ${aviso.periodo} · Hash ${hash}`,
          fontSize: 7,
        },
        { text: `Página ${currentPage}`, fontSize: 7, alignment: "right" },
      ],
    }),
    content: [
      {
        text: "AVISO DE COBRO DE GASTOS COMUNES",
        style: "titulo",
        alignment: "center",
      },
      `Folio ${aviso.folio} · Código de verificación: ${aviso.codigoVerificacion}`,
      `Unidad ${numeroUnidad} (${etiquetaUnidad}) · Período ${aviso.periodo}`,
      `Fecha de emisión: ${aviso.fechaEmision} · Vencimiento: ${aviso.vencimiento ?? "No declarado"}`,
      seccion("PARTICIPACIÓN EN EL GASTO COMÚN"),
      tabla([
        fila(
          "Proporción al gasto común",
          porcentajeFraccion(cifraDe(participacion.prorrateo))
        ),
        fila(
          "Forma de contribución",
          textoDe(participacion.formaContribucion) ?? NO_DISPONIBLE
        ),
        fila(
          "Aporte al fondo de reserva",
          porcentajePuntos(cifraDe(participacion.porcentajeReserva))
        ),
        fila(
          "Reserva incluida en el presupuesto",
          siNo(participacion.reservaIncluidaEnPresupuesto)
        ),
      ]),
      seccion("CONCEPTOS DEL PERÍODO"),
      tabla([
        filaMonto("Gasto común del período", montos.gastoComun),
        filaMonto("Recargo al fondo de reserva", montos.recargoFondoReserva),
        filaMonto("Multas aplicadas", montos.multas),
        filaMonto("Intereses (moras) devengados", montos.intereses),
        ...filasOtros,
        filaMonto("Total exigible del período", montos.exigible),
        filaMonto("Pagado a la fecha de emisión", montos.pagado),
        filaTotal("TOTAL ADEUDADO", montos.totalAdeudado),
      ]),
      seccion(
        `TOTALES DE LA COMUNIDAD (período ${aviso.periodo}, corte ${hasta})`
      ),
      tabla([
        filaMonto("Ingresos del mes", objetoDe(resumen.ingresos).total),
        filaMonto("Egresos del mes", objetoDe(resumen.egresos).total),
        filaMonto(
          "Saldo de caja al cierre",
          objetoDe(resumen.saldoCaja).alCierre
        ),
      ]),
      ...(noComputables.length > 0
        ? [
            seccion("DATOS QUE NO SE PUDIERON COMPUTAR"),
            ...noComputables.map((dato) => ({
              text:
                textoDe(objetoDe(dato).detalle) ??
                `Dato no computable: ${textoDe(objetoDe(dato).campo) ?? NO_DISPONIBLE}`,
              marginBottom: 4,
            })),
          ]
        : []),
      seccion("TRAZABILIDAD DEL DOCUMENTO"),
      `Hash del contenido congelado: ${hash}`,
      {
        text: "Verificación: SHA-256 del JSON canónico del contenido (claves ordenadas, sin espacios); se imprimen los primeros 16 caracteres hexadecimales en mayúscula. Cualquiera puede recalcularlo y compararlo.",
        fontSize: 8,
      },
      {
        text: "Los montos de este aviso provienen del documento congelado al momento de su emisión: no se recalculan al imprimir.",
        marginTop: 6,
        fontSize: 9,
      },
      { ...bloqueFirma({ config, firmaDataUrl }), marginTop: 30 },
    ],
    styles: { titulo: { fontSize: 14, bold: true } },
    defaultStyle: { font: "Roboto", fontSize: 10 },
  }
  return doc
}
