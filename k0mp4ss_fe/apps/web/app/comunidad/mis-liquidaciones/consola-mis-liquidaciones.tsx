"use client"

/**
 * consola-mis-liquidaciones — el trabajador lee SU liquidación de sueldo (T10).
 *
 * La fila trae el snapshot que el servidor calculó al generar el documento
 * (`calcularLiquidacion` + `pl-utils`): esta pantalla NO recalcula ninguna
 * cifra, solo imprime lo que la fila guardada dice. Por eso el líquido que se
 * muestra es `liquidoAPagar` y no una suma hecha acá, y el total de descuentos
 * es el mismo que imprime el papel (`totalDescuentos` + `descuentoAnticipos`:
 * los anticipos viven en su propio campo del snapshot).
 *
 * Los rótulos y el formato son los de la pantalla de la administración
 * (`/finanzas/remuneraciones`: folio, período, imponible, descuentos, líquido y
 * estado `Borrador`/`Confirmada`) para que un trabajador y la administración no
 * lean dos vocabularios distintos del mismo documento.
 *
 * El alcance es del SERVIDOR: el trabajador recibe solo la fila de su persona y
 * la gestión las de la comunidad. La pantalla no filtra filas por su cuenta
 * —repetir la regla acá sería una segunda copia que puede divergir de la que
 * protege los sueldos—; solo decide qué texto usa para el vacío, porque «tu
 * persona» no es cierto para quien ve la comunidad completa.
 *
 * Cada fila enlaza su PDF: `/api/liquidaciones/[id]/pdf` sirve el documento que
 * el servidor arma con el builder existente sobre la fila guardada, con el
 * mismo alcance por fila que la lectura. El enlace no trae el alcance en la URL
 * —el servidor lo resuelve desde la sesión—, así que no hay filtro que el
 * cliente pueda ampliar: la liquidación ajena responde el 404 de la ruta.
 */
import * as React from "react"
import type { LiquidacionPL } from "@/lib/schemas"
import { useLiquidaciones } from "@/lib/api/use-liquidaciones"
import { esGestionDeLiquidaciones } from "./alcance"
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
import {
  IconChevronDown,
  IconChevronRight,
  IconDownload,
  IconFileText,
} from "@tabler/icons-react"

const NO_DISPONIBLE = "No disponible"

/** Variantes del `Badge` que usa la tabla de estados. */
type VarianteBadge = React.ComponentProps<typeof Badge>["variant"]

/**
 * El PDF de la liquidación, servido por la ruta que arma el papel desde la fila
 * guardada y aplica el alcance de la sesión.
 */
function urlPdf(liq: LiquidacionPL): string {
  return `/api/liquidaciones/${encodeURIComponent(liq.id)}/pdf`
}

/** Los dos estados del snapshot PL, con las palabras de la pantalla de gestión. */
const ESTADOS: Record<string, { etiqueta: string; variant: VarianteBadge }> = {
  borrador: { etiqueta: "Borrador", variant: "outline" },
  confirmada: { etiqueta: "Confirmada", variant: "default" },
}

/** Estado LEÍDO de la fila; uno desconocido se muestra crudo, nunca inventado. */
function estadoDe(liq: LiquidacionPL): {
  etiqueta: string
  variant: VarianteBadge
} {
  return ESTADOS[liq.estado] ?? { etiqueta: liq.estado, variant: "outline" }
}

function cifra(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null
}

function monto(valor: unknown): string {
  const n = cifra(valor)
  return n === null ? NO_DISPONIBLE : `$${Math.round(n).toLocaleString("es-CL")}`
}

/** Los bonos del snapshot; una fila sin bonos (o con un Json raro) no rompe la tabla. */
function bonosDe(liq: LiquidacionPL): { glosa: string; monto: number; imponible: boolean }[] {
  const bruto: unknown = liq.bonos
  return Array.isArray(bruto)
    ? (bruto as { glosa: string; monto: number; imponible: boolean }[])
    : []
}

/** Descuentos totales del documento: legales + anticipos (dos campos del snapshot). */
function descuentosTotales(liq: LiquidacionPL): number {
  return (cifra(liq.totalDescuentos) ?? 0) + (cifra(liq.descuentoAnticipos) ?? 0)
}

interface Linea {
  etiqueta: string
  monto: number
}

/**
 * Haberes del documento, en el orden y con los rótulos que usa el papel
 * (`documentoLiquidacionPDF`); una línea en cero no se imprime, igual que allí.
 */
function haberesDe(liq: LiquidacionPL): Linea[] {
  return [
    {
      etiqueta: `Sueldo base (${liq.diasTrabajados} de ${liq.diasMesComercial} días)`,
      monto: liq.sueldoBaseProporcional,
    },
    ...(liq.horasExtrasHoras > 0
      ? [
          {
            etiqueta: `Horas extras (${liq.horasExtrasHoras} h)`,
            monto: liq.montoHorasExtras,
          },
        ]
      : []),
    ...bonosDe(liq).map((b) => ({
      etiqueta: b.imponible ? `${b.glosa} (imponible)` : b.glosa,
      monto: b.monto,
    })),
    ...(liq.gratificacionLegal > 0
      ? [{ etiqueta: "Gratificación legal", monto: liq.gratificacionLegal }]
      : []),
    ...(liq.asignacionMovilizacion > 0
      ? [{ etiqueta: "Asignación de movilización", monto: liq.asignacionMovilizacion }]
      : []),
    ...(liq.asignacionColacion > 0
      ? [{ etiqueta: "Asignación de colación", monto: liq.asignacionColacion }]
      : []),
    ...(liq.montoAsignacionFamiliar > 0
      ? [
          {
            etiqueta: `Asignación familiar (${liq.cargas} carga(s))`,
            monto: liq.montoAsignacionFamiliar,
          },
        ]
      : []),
  ]
}

/** Descuentos del documento: las mismas líneas que imprime el papel. */
function descuentosDe(liq: LiquidacionPL): Linea[] {
  return [
    ...(liq.montoAFP > 0
      ? [{ etiqueta: `${liq.nombreAfp} (${liq.tasaAFP}%)`, monto: liq.montoAFP }]
      : []),
    ...(liq.montoSalud > 0 ? [{ etiqueta: liq.nombreSalud, monto: liq.montoSalud }] : []),
    ...(liq.montoSIS > 0
      ? [{ etiqueta: `SIS (${liq.tasaSIS}%)`, monto: liq.montoSIS }]
      : []),
    ...(liq.montoSeguroCesantia > 0
      ? [{ etiqueta: "Seguro de cesantía", monto: liq.montoSeguroCesantia }]
      : []),
    ...(liq.montoAPV > 0
      ? [{ etiqueta: "APV / Ahorro voluntario", monto: liq.montoAPV }]
      : []),
    ...(liq.descuentoAnticipos > 0
      ? [{ etiqueta: "Descuento de anticipos", monto: liq.descuentoAnticipos }]
      : []),
  ]
}

/** Una columna del detalle: sus líneas y el total que las cierra. */
function ColumnaDetalle({
  titulo,
  lineas,
  total,
}: {
  titulo: string
  lineas: Linea[]
  total: Linea
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {titulo}
      </p>
      <dl className="text-sm">
        {lineas.map((linea, i) => (
          <div
            key={`${linea.etiqueta}-${i}`}
            className="flex justify-between gap-4 border-b border-dashed py-1"
          >
            <dt>{linea.etiqueta}</dt>
            <dd className="tabular-nums">{monto(linea.monto)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 py-1 font-semibold">
          <dt>{total.etiqueta}</dt>
          <dd className="tabular-nums">{monto(total.monto)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function ConsolaMisLiquidaciones({ roles }: { roles: string[] }) {
  const { liquidaciones, total, isLoading, error } = useLiquidaciones()
  const esGestion = esGestionDeLiquidaciones(roles)
  // Una sola fila abierta: el detalle es para mirar un período, no para
  // apilar documentos distintos en la misma pantalla.
  const [abierta, setAbierta] = React.useState<string | null>(null)

  if (isLoading) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <IconFileText className="size-7 text-primary" /> Liquidaciones de Sueldo
        </h1>
        <p className="text-muted-foreground">
          {esGestion
            ? "Las liquidaciones de la comunidad, tal como se generaron. Cada una conserva el cálculo que el servidor hizo en su momento."
            : "La liquidación que la administración generó para tu persona: período, haberes, descuentos y líquido a pagar. Solo ves las tuyas."}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          No se pudieron cargar las liquidaciones: {error.message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {esGestion ? "Liquidaciones de la comunidad" : "Mis liquidaciones"}
          </CardTitle>
          <CardDescription>
            El detalle de cada período es el que quedó guardado al generar el
            documento: esta pantalla es de lectura y no edita nada.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {liquidaciones.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {esGestion
                ? "La comunidad todavía no tiene liquidaciones registradas. Cuando la administración genere la de un período, aparece acá con su detalle."
                : "Todavía no hay liquidaciones para tu persona. Cuando la administración genere la de un período, aparece acá con su detalle."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead>Folio</TableHead>
                  <TableHead>Días</TableHead>
                  <TableHead className="text-right">Haberes</TableHead>
                  <TableHead className="text-right">Descuentos</TableHead>
                  <TableHead className="text-right">Líquido a pagar</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                  <TableHead className="text-right">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liquidaciones.map((liq) => {
                  const estado = estadoDe(liq)
                  const estaAbierta = abierta === liq.id
                  const idDetalle = `detalle-liquidacion-${liq.id}`
                  return (
                    <React.Fragment key={liq.id}>
                      <TableRow>
                        <TableCell className="font-medium">{liq.periodo}</TableCell>
                        <TableCell className="font-mono">{liq.folio}</TableCell>
                        <TableCell>
                          {liq.diasTrabajados} de {liq.diasMesComercial}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {monto(liq.totalHaberes)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {monto(descuentosTotales(liq))}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {monto(liq.liquidoAPagar)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={estado.variant}>{estado.etiqueta}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-expanded={estaAbierta}
                            aria-controls={idDetalle}
                            onClick={() =>
                              setAbierta(estaAbierta ? null : liq.id)
                            }
                          >
                            {estaAbierta ? (
                              <IconChevronDown className="size-4" />
                            ) : (
                              <IconChevronRight className="size-4" />
                            )}
                            {estaAbierta ? "Ocultar detalle" : "Ver detalle"}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={urlPdf(liq)}
                              download=""
                              aria-label={`Descargar el PDF de la liquidación ${liq.folio} (período ${liq.periodo})`}
                            >
                              <IconDownload className="size-4" />
                              Descargar PDF
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                      {estaAbierta && (
                        <TableRow id={idDetalle}>
                          <TableCell colSpan={9} className="bg-muted/30">
                            <div className="grid gap-6 py-2 md:grid-cols-2">
                              <ColumnaDetalle
                                titulo="Haberes"
                                lineas={haberesDe(liq)}
                                total={{ etiqueta: "Total haberes", monto: liq.totalHaberes }}
                              />
                              <ColumnaDetalle
                                titulo="Descuentos"
                                lineas={descuentosDe(liq)}
                                total={{
                                  etiqueta: "Total descuentos",
                                  monto: descuentosTotales(liq),
                                }}
                              />
                            </div>
                            <dl className="mt-2 grid gap-1 border-t pt-3 text-sm md:grid-cols-3">
                              <div className="flex justify-between gap-4 md:block">
                                <dt className="text-muted-foreground">Total imponible</dt>
                                <dd className="tabular-nums">{monto(liq.totalImponible)}</dd>
                              </div>
                              <div className="flex justify-between gap-4 md:block">
                                <dt className="text-muted-foreground">Alcance líquido</dt>
                                <dd className="tabular-nums">{monto(liq.alcanceLiquido)}</dd>
                              </div>
                              <div className="flex justify-between gap-4 font-semibold md:block">
                                <dt>Líquido a pagar</dt>
                                <dd className="tabular-nums">{monto(liq.liquidoAPagar)}</dd>
                              </div>
                            </dl>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > liquidaciones.length && (
        <p className="text-xs text-muted-foreground">
          Se muestran {liquidaciones.length} de {total} liquidaciones: la lista
          llega hasta las {liquidaciones.length} más recientes.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {esGestion
          ? "Esta pantalla es de lectura: muestra las liquidaciones tal como quedaron registradas al generarse. El PDF de cada fila es el documento que se emitió, descargable acá mismo."
          : "Esta pantalla es de lectura: muestra la liquidación tal como quedó registrada al generarse. El PDF de cada fila es el documento que la administración emitió para tu persona."}
      </p>
    </div>
  )
}
