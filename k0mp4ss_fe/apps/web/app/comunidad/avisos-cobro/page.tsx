"use client"

/**
 * /comunidad/avisos-cobro — la cara visible del aviso de cobro (F27).
 *
 * El residente ve el aviso con el que se le cobra: período, folio, total
 * adeudado, estado del plazo y el PDF firmado descargable. El aviso es un
 * documento CONGELADO (Ley 21.442 arts. 31 y 32): esta pantalla no calcula
 * ninguna cifra, solo imprime lo que la fila guardada dice.
 *
 * La descarga se apoya en el builder existente (`documentoAvisoCobroPDF`) y en
 * `descargarPdf`, con el mismo flujo que `app/comunidad/certificados`:
 *
 *   fila guardada → builder con el contenido congelado → descarga en memoria
 *
 * La huella (`hash`) llega ya calculada por la API con `hashContenido`: el
 * builder la exige como parámetro y `lib/aviso-cobro` es de servidor (crypto +
 * Prisma), así que acá no se recalcula nada. Si la firma configurada se puede
 * resolver a data URL se embebe; si no, el bloque sale en blanco y el papel
 * sigue nombrando al administrador responsable.
 */
import * as React from "react"
import { hoyISO } from "@/lib/date-utils"
import {
  useAvisosCobro,
  type AvisoCobroListado,
} from "@/lib/api/use-avisos-cobro"
import { documentoAvisoCobroPDF, descargarPdf, urlADataUrl } from "@/lib/pdf-utils"
import type { ConfiguracionGlobal } from "@/lib/schemas"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { IconDownload, IconFileText } from "@tabler/icons-react"

const NO_DISPONIBLE = "No disponible"

/** Cifra congelada del contenido, o `null` si la fila no la trae (nunca un 0). */
function cifra(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null
}

function monto(valor: unknown): string {
  const n = cifra(valor)
  return n === null ? NO_DISPONIBLE : `$${n.toLocaleString("es-CL")}`
}

function objetoDe(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

/** Total adeudado congelado, no recalculado desde los cargos. */
function totalAdeudado(aviso: AvisoCobroListado): unknown {
  const montos = objetoDe(aviso.contenido.montos)
  // Desde la versión 2 el aviso consolida la deuda de períodos anteriores; el papel
  // muestra ese total, así que la lista muestra el mismo número y no otro. Una fila
  // versión 1 solo tiene el total del período y cae al respaldo.
  return montos.totalAdeudadoConsolidado ?? montos.totalAdeudado
}

/** Unidad del aviso, tal como quedó congelada en el contenido. */
function unidadDe(aviso: AvisoCobroListado): string {
  const unidad = objetoDe(aviso.contenido.unidad)
  const etiqueta = typeof unidad.etiqueta === "string" ? unidad.etiqueta : ""
  const numero = typeof unidad.numero === "string" ? unidad.numero : ""
  const texto = `${etiqueta} ${numero}`.trim()
  return texto.length > 0 ? texto : "—"
}

/**
 * Estado del plazo, derivado de la fila: `vencimiento` es la fecha que arranca
 * el reloj (emisión + `diasPagoGc`); sin versión vigente queda en `null` y se
 * declara en vez de inventar una fecha.
 */
function estadoDe(aviso: AvisoCobroListado, hoy: string) {
  if (aviso.vencimiento === null) {
    return { etiqueta: "Sin plazo declarado", variant: "outline" as const }
  }
  if (aviso.vencimiento < hoy) {
    return { etiqueta: "Vencido", variant: "destructive" as const }
  }
  return { etiqueta: "Vigente", variant: "default" as const }
}

export default function AvisosCobroPage() {
  const { avisos, documento, isLoading, error } = useAvisosCobro()
  const [pdfBusy, setPdfBusy] = React.useState<string | null>(null)
  const [errorPdf, setErrorPdf] = React.useState<string | null>(null)
  const [okMsg, setOkMsg] = React.useState<string | null>(null)
  const hoy = hoyISO()

  const descargar = async (aviso: AvisoCobroListado): Promise<void> => {
    setPdfBusy(aviso.id)
    setErrorPdf(null)
    setOkMsg(null)
    try {
      // La firma se resuelve a data URL en memoria (D1: nada se persiste).
      const firmaDataUrl = documento?.firmaDigitalizadaUrl
        ? await urlADataUrl(documento.firmaDigitalizadaUrl)
        : null
      const doc = documentoAvisoCobroPDF({
        aviso: {
          folio: aviso.folio,
          codigoVerificacion: aviso.codigoVerificacion,
          periodo: aviso.periodo,
          fechaEmision: aviso.fechaEmision,
          vencimiento: aviso.vencimiento,
          contenido: aviso.contenido,
        },
        // El builder solo lee los campos que el papel imprime; la API sirve
        // exactamente esa proyección de CF (y nunca el SMTP).
        config: documento as unknown as ConfiguracionGlobal,
        firmaDataUrl,
        // Huella del contenido congelado, calculada por el servidor.
        hash: aviso.hash,
      })
      await descargarPdf(doc, `aviso-cobro-${aviso.folio}.pdf`)
      setOkMsg(`PDF ${aviso.folio} generado con la huella de su contenido congelado.`)
    } catch (e) {
      // Se dice lo que pasó de verdad: no se confirma un PDF que no se descargó.
      setErrorPdf(
        `No se pudo generar el PDF: ${e instanceof Error ? e.message : String(e)}`
      )
    } finally {
      setPdfBusy(null)
    }
  }

  if (isLoading) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <IconFileText className="size-7 text-primary" /> Avisos de Cobro
        </h1>
        <p className="text-muted-foreground">
          El documento con el que se te cobra el gasto común: período, folio,
          total adeudado y el plazo de pago que corre desde su emisión. El PDF
          lleva la firma de la administración y la huella de su contenido
          congelado, para que puedas verificarlo.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          No se pudieron cargar tus avisos: {error.message}
        </div>
      )}
      {errorPdf && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {errorPdf}
        </div>
      )}
      {okMsg && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300">
          {okMsg}
        </div>
      )}
      {documento === null && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          La comunidad no tiene configuración registrada: sin ella no se puede
          armar el papel (identidad, administrador responsable y firma).
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mis avisos</CardTitle>
          <CardDescription>
            Solo los avisos de tus unidades. El aviso se emite una vez y no se
            reescribe: lo que ves es lo que se emitió.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {avisos.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Todavía no tenés avisos de cobro emitidos.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Período</th>
                  <th className="px-4 py-2">Folio</th>
                  <th className="px-4 py-2">Unidad</th>
                  <th className="px-4 py-2 text-right">Total adeudado</th>
                  <th className="px-4 py-2">Estado</th>
                  <th className="px-4 py-2 text-right">Documento</th>
                </tr>
              </thead>
              <tbody>
                {avisos.map((aviso) => {
                  const estado = estadoDe(aviso, hoy)
                  return (
                    <tr key={aviso.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{aviso.periodo}</td>
                      <td className="px-4 py-2 font-mono">{aviso.folio}</td>
                      <td className="px-4 py-2">{unidadDe(aviso)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {monto(totalAdeudado(aviso))}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={estado.variant}>{estado.etiqueta}</Badge>
                        {aviso.vencimiento && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            vence {aviso.vencimiento}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pdfBusy === aviso.id || documento === null}
                          onClick={() => void descargar(aviso)}
                        >
                          <IconDownload className="mr-1 size-4" />
                          {pdfBusy === aviso.id ? "Generando…" : "Descargar PDF"}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        El código de verificación de cada aviso viaja impreso en el documento.
        Si una cifra que la ley exige no pudo computarse, el aviso la declara por
        su nombre en vez de imprimir un cero.
      </p>
    </div>
  )
}
