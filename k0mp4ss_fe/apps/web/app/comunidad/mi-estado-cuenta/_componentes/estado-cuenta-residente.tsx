"use client"

/**
 * estado-cuenta-residente — la deuda propia del residente en una pantalla.
 *
 * Decisión del owner (2026-11-08): el residente ve su deuda SIEMPRE y SOLO la
 * suya. La pantalla imprime lo que `GET /api/cobros-fi/mi-estado-cuenta`
 * devolvió para SU sesión: la ruta resuelve los vínculos vigentes en la base y
 * no acepta ids del cliente, así que acá no hay select de unidad ni filtro
 * local — repetir la regla en el cliente sería una segunda copia capaz de
 * divergir de la que protege los datos.
 *
 * Varios vínculos: se muestran TODAS las unidades de la persona, una fila por
 * UNIDAD Y PERÍODO (no una fila por período a secas). Razón: la deuda es de la
 * unidad —el aviso se emite y se cobra por unidad, y el vecino de al lado es
 * otra persona—, así que sumar dos unidades en una misma fila diría un total
 * que no le corresponde a ninguna. La columna «Unidad» es la que permite leer
 * de dónde sale cada saldo, y aparece siempre para que la pantalla no cambie de
 * forma según cuántos vínculos tenga el usuario.
 *
 * Un período puede tener más de un cargo (gasto común, multa, cuota
 * extraordinaria): sus conceptos se listan y los montos se suman en la fila del
 * período. El ESTADO del período se agrega desde el estado que el servidor
 * calculó por cargo (`estadoDeCobro`), no se reimplementa la regla de la mora.
 *
 * El saldo total lo calcula el servidor (`saldoTotal`): la pantalla no suma la
 * página que recibió, porque una suma local sería un número que el servidor
 * nunca afirmó.
 */
import * as React from "react"
import {
  useMiEstadoCuentaFI,
  type CobroEstadoCuenta,
} from "@/lib/api/use-cobros-fi"
import { Badge } from "@workspace/ui/components/badge"
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
import { IconReceipt } from "@tabler/icons-react"

const NO_DISPONIBLE = "No disponible"

/** Variantes del `Badge` que usa la tabla de estados. */
type VarianteBadge = React.ComponentProps<typeof Badge>["variant"]

/** Los conceptos del cobro FI con las palabras del resto de la app. */
const CONCEPTO_LABEL: Record<string, string> = {
  gasto_comun: "Gasto Común",
  cuota_extraordinaria: "Cuota Extraordinaria",
  multa_in: "Multa",
  consumo: "Consumo",
  reserva_ra: "Reserva de Amenities",
  penalizacion_ra: "Penalización de Reserva",
  garantia_ra: "Garantía de Reserva",
}

/** Los cuatro estados de `estadoDeCobro`, con el rótulo de la pantalla. */
const ESTADOS: Record<string, { etiqueta: string; variant: VarianteBadge }> = {
  pagado: { etiqueta: "Pagado", variant: "secondary" },
  pendiente: { etiqueta: "Pendiente", variant: "default" },
  parcial: { etiqueta: "Parcial", variant: "outline" },
  vencido: { etiqueta: "Vencido", variant: "destructive" },
}

function monto(valor: number): string {
  return Number.isFinite(valor) ? `$${Math.round(valor).toLocaleString("es-CL")}` : NO_DISPONIBLE
}

/** Etiqueta legible de la unidad PROPIA; sin datos se declara, no se inventa. */
function etiquetaUnidad(cobro: CobroEstadoCuenta): string {
  const texto = `${cobro.unidadEtiqueta ?? ""} ${cobro.unidadNumero ?? ""}`.trim()
  return texto.length > 0 ? texto : "—"
}

/** Una fila de la tabla: la deuda de UNA unidad en UN período. */
interface PeriodoDeuda {
  clave: string
  periodo: string
  unidad: string
  conceptos: string[]
  cargo: number
  pagado: number
  moras: number
  saldo: number
  estado: string
  avisoId: string | null
}

/**
 * Estado del período, agregado desde el estado por cargo que calculó el
 * servidor: un período con todo pagado está pagado; si algún cargo venció, el
 * período venció; si hubo abonos parciales, es parcial.
 */
function estadoDelPeriodo(filas: readonly CobroEstadoCuenta[], saldo: number): string {
  if (saldo <= 0) return "pagado"
  if (filas.some((f) => f.estado === "vencido")) return "vencido"
  if (filas.some((f) => f.estado === "parcial")) return "parcial"
  return "pendiente"
}

/** Agrupa por unidad y período, conservando el orden (período descendente) del servidor. */
function agruparPorPeriodo(cobros: readonly CobroEstadoCuenta[]): PeriodoDeuda[] {
  const grupos = new Map<string, CobroEstadoCuenta[]>()
  for (const cobro of cobros) {
    const clave = `${cobro.unidadId}|${cobro.periodo}`
    const previo = grupos.get(clave)
    if (previo) previo.push(cobro)
    else grupos.set(clave, [cobro])
  }

  return [...grupos.entries()].map(([clave, filas]) => {
    const primero = filas[0] as CobroEstadoCuenta
    const cargo = filas.reduce((acc, f) => acc + f.montoCargo, 0)
    const pagado = filas.reduce((acc, f) => acc + f.pagado, 0)
    const moras = filas.reduce((acc, f) => acc + f.moras, 0)
    const saldo = filas.reduce((acc, f) => acc + f.saldoPendiente, 0)
    const conceptos: string[] = []
    for (const fila of filas) {
      const etiqueta = CONCEPTO_LABEL[fila.concepto] ?? fila.concepto
      if (!conceptos.includes(etiqueta)) conceptos.push(etiqueta)
    }
    return {
      clave,
      periodo: primero.periodo,
      unidad: etiquetaUnidad(primero),
      conceptos,
      cargo,
      pagado,
      moras,
      saldo,
      estado: estadoDelPeriodo(filas, saldo),
      avisoId: filas.find((f) => f.avisoId)?.avisoId ?? null,
    }
  })
}

/**
 * El documento del período, servido por la ruta que arma el papel desde la fila
 * guardada y aplica el mismo alcance por fila que la lectura. El `id` del aviso
 * es el único dato que entra en la URL.
 */
function urlAviso(avisoId: string): string {
  return `/api/avisos-cobro/${encodeURIComponent(avisoId)}/pdf`
}

export function EstadoCuentaResidente() {
  const { cobros, saldoTotal, isLoading, error } = useMiEstadoCuentaFI()
  const periodos = React.useMemo(() => agruparPorPeriodo(cobros), [cobros])
  const periodosConDeuda = periodos.filter((p) => p.saldo > 0).length
  const alDia = saldoTotal <= 0

  if (isLoading) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <IconReceipt className="size-7 text-primary" /> Mi Estado de Cuenta
        </h1>
        <p className="text-muted-foreground">
          Lo que debes en tus unidades, período por período. Ves solo la deuda de
          las unidades donde tienes vínculo vigente: la de otro residente no
          aparece acá.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          No se pudo cargar tu estado de cuenta: {error.message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo total pendiente</CardTitle>
          <CardDescription>
            {alDia
              ? "Tus unidades no tienen saldo pendiente."
              : `${periodosConDeuda} período(s) con deuda en tus unidades.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-4xl font-bold tabular-nums">{monto(saldoTotal)}</p>
          {alDia && cobros.length > 0 && (
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Estás al día: no tienes saldo pendiente en tus unidades. Abajo
              queda el historial de lo que ya pagaste.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deuda por período</CardTitle>
          <CardDescription>
            Cada fila es la deuda de una unidad en un período: el cargo, lo
            pagado, las moras y el saldo. Un período puede reunir más de un
            concepto (gasto común, multa, cuota extraordinaria).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {periodos.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No tienes cobros registrados en tus unidades. Cuando la
              administración emita el gasto común de un período, aparece acá con
              su saldo.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Conceptos</TableHead>
                  <TableHead className="text-right">Cargo</TableHead>
                  <TableHead className="text-right">Pagos</TableHead>
                  <TableHead className="text-right">Moras</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Aviso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodos.map((periodo) => {
                  const estado = ESTADOS[periodo.estado] ?? {
                    etiqueta: periodo.estado,
                    variant: "outline" as VarianteBadge,
                  }
                  return (
                    <TableRow key={periodo.clave}>
                      <TableCell className="font-medium">{periodo.periodo}</TableCell>
                      <TableCell>{periodo.unidad}</TableCell>
                      <TableCell>{periodo.conceptos.join(" + ")}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {monto(periodo.cargo)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {monto(periodo.pagado)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {monto(periodo.moras)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {monto(periodo.saldo)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={estado.variant}>{estado.etiqueta}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {periodo.avisoId ? (
                          <a
                            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                            href={urlAviso(periodo.avisoId)}
                            download=""
                            aria-label={`Descargar el PDF del aviso del período ${periodo.periodo}`}
                          >
                            PDF del aviso
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Sin aviso emitido
                          </span>
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
        El saldo es el monto del cargo más las moras devengadas menos los pagos
        registrados. Esta pantalla es de lectura: los pagos se registran en la
        administración y el aviso, cuando existe, es el documento con el que se
        cobra el período.
      </p>
    </div>
  )
}
