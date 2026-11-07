"use client"

/**
 * consola-avisos-cobro — la cara visible del aviso de cobro (F27).
 *
 * El residente ve el aviso con el que se le cobra: período, folio, unidad,
 * total a pagar, estado del plazo y el PDF firmado descargable. El aviso es un
 * documento CONGELADO (Ley 21.442 arts. 31 y 32): esta pantalla no calcula
 * ninguna cifra, solo imprime lo que la fila guardada dice.
 *
 * La descarga es el enlace a `GET /api/avisos-cobro/[id]/pdf`, que arma el papel
 * desde la fila guardada (firma de CF + huella del contenido) y responde
 * `application/pdf` con `Content-Disposition: attachment; filename="aviso-cobro-<folio>.pdf"`.
 * Por eso acá no hay un segundo builder: un documento no puede tener dos
 * caminos que puedan contradecirse, y el `id` de la fila es el único dato que
 * entra en la URL.
 *
 * El alcance es del SERVIDOR: el residente recibe solo los avisos de las
 * unidades donde tiene vínculo vigente (`alcanceAvisosCobro`) y la gestión los
 * de la comunidad. La pantalla no filtra filas por su cuenta —repetir la regla
 * acá sería una segunda copia que puede divergir de la que protege los datos—;
 * solo decide qué texto usa para el vacío, porque «tu unidad» no es cierto para
 * quien ve toda la comunidad.
 */
import * as React from "react"
import { hoyISO } from "@/lib/date-utils"
import {
  useAvisosCobro,
  type AvisoCobroListado,
} from "@/lib/api/use-avisos-cobro"
import { esGestionDeAvisos } from "./alcance"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { IconDownload, IconFileText } from "@tabler/icons-react"

const NO_DISPONIBLE = "No disponible"

/** Variantes del `Badge` que usa la tabla de estados. */
type VarianteBadge = React.ComponentProps<typeof Badge>["variant"]

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
function totalAPagar(aviso: AvisoCobroListado): unknown {
  const montos = objetoDe(aviso.contenido.montos)
  // Desde la versión 2 el aviso consolida la deuda de períodos anteriores; el
  // papel muestra ese total, así que la lista muestra el mismo número y no otro.
  // Una fila versión 1 solo tiene el total del período y cae al respaldo.
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

/** El PDF del aviso, servido por la ruta que arma el papel desde la fila guardada. */
function urlPdf(aviso: AvisoCobroListado): string {
  return `/api/avisos-cobro/${encodeURIComponent(aviso.id)}/pdf`
}

/**
 * Estado del aviso, LEÍDO de la fila — nada se recalcula desde los cargos:
 *
 * - `Pagado`: el contenido congelado declara pagado algo y una deuda total 0
 *   (`montos.pagado > 0` y `totalAdeudado` sin saldo). Un pago no se deshace,
 *   así que el aviso que nació saldado no vuelve a deber; manda sobre el plazo.
 * - `Vencido` / `Pendiente`: el `vencimiento` PERSISTIDO contra hoy. La ruta
 *   guarda emisión + `diasPagoGc` de la versión que rige el período (S6).
 * - `Sin plazo declarado`: `vencimiento` es `null` porque la versión del
 *   reglamento no era computable. Se declara en vez de inventar una fecha.
 */
function estadoDe(
  aviso: AvisoCobroListado,
  hoy: string
): { etiqueta: string; variant: VarianteBadge } {
  const montos = objetoDe(aviso.contenido.montos)
  const pagado = cifra(montos.pagado)
  if (pagado !== null && pagado > 0 && cifra(totalAPagar(aviso)) === 0) {
    return { etiqueta: "Pagado", variant: "secondary" }
  }
  if (aviso.vencimiento === null) {
    return { etiqueta: "Sin plazo declarado", variant: "outline" }
  }
  if (aviso.vencimiento < hoy) {
    return { etiqueta: "Vencido", variant: "destructive" }
  }
  return { etiqueta: "Pendiente", variant: "default" }
}

export function ConsolaAvisosCobro({ roles }: { roles: string[] }) {
  const { avisos, documento, isLoading, error } = useAvisosCobro()
  const hoy = hoyISO()
  const esGestion = esGestionDeAvisos(roles)

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
          {esGestion
            ? "Los avisos de cobro de la comunidad, tal como se emitieron. Cada uno conserva su contenido congelado y su PDF firmado con la huella de ese contenido."
            : "El documento con el que se te cobra el gasto común: período, folio, total a pagar y el plazo de pago que corre desde su emisión. Solo ves los avisos de tus unidades."}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          No se pudieron cargar los avisos: {error.message}
        </div>
      )}
      {documento === null && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          La comunidad no tiene configuración registrada: sin ella no se puede
          armar el papel (identidad, administrador responsable y firma), así que
          el PDF no está disponible.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {esGestion ? "Avisos emitidos" : "Mis avisos"}
          </CardTitle>
          <CardDescription>
            {esGestion
              ? "El aviso se emite una vez y no se reescribe: lo que ves es lo que se emitió, con su folio y su plazo."
              : "Tocá «Descargar PDF» para bajar tu aviso. El aviso se emite una vez y no se reescribe: lo que ves es lo que se emitió."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {avisos.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {esGestion
                ? "La comunidad todavía no tiene avisos de cobro emitidos. Cuando la administración emita el aviso de un período, aparece acá con su PDF firmado."
                : "Todavía no hay avisos para tu unidad. Cuando la administración emita el aviso de un período, vas a poder verlo y descargar el PDF acá."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead>Folio</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Total a pagar</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Emisión</TableHead>
                  <TableHead className="text-right">Documento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {avisos.map((aviso) => {
                  const estado = estadoDe(aviso, hoy)
                  return (
                    <TableRow key={aviso.id}>
                      <TableCell className="font-medium">
                        {aviso.periodo}
                      </TableCell>
                      <TableCell className="font-mono">{aviso.folio}</TableCell>
                      <TableCell>{unidadDe(aviso)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {monto(totalAPagar(aviso))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={estado.variant}>{estado.etiqueta}</Badge>
                        {aviso.vencimiento && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            vence {aviso.vencimiento}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{aviso.fechaEmision}</TableCell>
                      <TableCell className="text-right">
                        {documento === null ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled
                            title="La comunidad no tiene configuración registrada: sin ella el papel no se puede armar."
                          >
                            <IconDownload className="size-4" />
                            Descargar PDF
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={urlPdf(aviso)}
                              download=""
                              aria-label={`Descargar el PDF del aviso ${aviso.folio} (período ${aviso.periodo})`}
                            >
                              <IconDownload className="size-4" />
                              Descargar PDF
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        El código de verificación de cada aviso viaja impreso en el documento, y
        el PDF lleva la huella de su contenido congelado. Si una cifra que la ley
        exige no pudo computarse, el aviso la declara por su nombre en vez de
        imprimir un cero.
      </p>
    </div>
  )
}
