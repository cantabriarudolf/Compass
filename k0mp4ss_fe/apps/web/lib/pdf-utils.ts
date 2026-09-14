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
