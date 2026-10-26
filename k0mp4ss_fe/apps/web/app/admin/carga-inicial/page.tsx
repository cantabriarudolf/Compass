"use client"

/**
 * /admin/carga-inicial — pantalla única del importador CSV de carga inicial
 * (ODD carga-inicial-csv U3).
 *
 * Tres bloques idénticos (estructura, personas, vínculos), uno por ruta del
 * importador. El flujo por bloque es siempre el mismo:
 *   1. «Descargar plantilla» — enlace directo a la ruta de plantilla (nada
 *      de fetch en JS: el navegador descarga con content-disposition).
 *   2. Elegir el archivo y «Ver vista previa» — POST con `?dryRun=1` y el
 *      archivo como `FormData` (campo «archivo»); muestra el reporte fila
 *      por fila con su resumen.
 *   3. «Importar» — deshabilitado hasta que la vista previa tenga filas
 *      válidas; exige confirmación explícita que dice cuántas filas se van
 *      a crear y cuántas actualizar antes de escribir.
 *
 * Regla de S3: nada se escribe sin antes haberse mostrado en la vista
 * previa; las filas con error no se tocan. El servidor valida roles y
 * comunidadId; acá sólo se autobloquea la UI para no ofrecer algo que va a
 * fallar.
 */
import React from "react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  IconAlertTriangle,
  IconBuildingSkyscraper,
  IconCircleCheck,
  IconDownload,
  IconInfoCircle,
  IconLoader2,
  IconUpload,
  IconUserHeart,
  IconLink,
} from "@tabler/icons-react"

type ResumenImportador = {
  total: number
  validas: number
  conError: number
  crear: number
  actualizar: number
  sinCambios: number
}

type ReporteFilaImportador = {
  linea: number
  accion: string
  errores: string[]
}

type ReporteImportador = {
  filas: ReporteFilaImportador[]
  resumen: ResumenImportador
}

const BLOQUES = [
  {
    slug: "estructura",
    titulo: "Estructura",
    descripcion:
      "Macro y micro sectores, y unidades (Rol SII, metraje, prorrateo, tipo y estado de ocupación).",
    icono: IconBuildingSkyscraper,
  },
  {
    slug: "personas",
    titulo: "Personas",
    descripcion:
      "Residentes, personal y demás personas de la comunidad (por RUT). Importarlas antes que los vínculos.",
    icono: IconUserHeart,
  },
  {
    slug: "vinculos",
    titulo: "Vínculos",
    descripcion:
      "Quién vive o trabaja en cada unidad (residente, propietario, conserje, etc.). Requiere que las unidades y las personas ya estén cargadas.",
    icono: IconLink,
  },
] as const

type Bloque = (typeof BLOQUES)[number]

/** Nombre visible de la acción de la fila en el reporte. */
const ETIQUETA_ACCION: Record<string, string> = {
  crear: "Crear",
  actualizar: "Actualizar",
  "sin-cambios": "Sin cambios",
}

class ErrorEstado extends Error {}

/**
 * Lee el cuerpo de una respuesta HTTP como JSON y convierte los códigos
 * esperados en mensajes legibles para el administrador.
 */
async function leerRespuesta(response: Response): Promise<ReporteImportador> {
  let cuerpo: { error?: string } | null = null
  try {
    cuerpo = (await response.json()) as { error?: string } | null
  } catch {
    cuerpo = null
  }
  if (!response.ok) {
    const detalle =
      typeof cuerpo?.error === "string" && cuerpo.error !== ""
        ? `: ${cuerpo.error}`
        : "."
    if (response.status === 401) {
      throw new ErrorEstado(
        `Tu sesión expiró. Vuelve a iniciar sesión e inténtalo de nuevo (HTTP 401${detalle})`
      )
    }
    if (response.status === 403) {
      throw new ErrorEstado(
        `No tienes permiso para usar el importador en esta comunidad (HTTP 403${detalle})`
      )
    }
    throw new ErrorEstado(
      `El servidor rechazó la solicitud (HTTP ${response.status}${detalle})`
    )
  }
  if (!esReporte(cuerpo)) {
    throw new ErrorEstado(
      "La respuesta del servidor no tiene el formato del reporte esperado."
    )
  }
  return cuerpo
}

/**
 * Type guard del reporte fila por fila prometido por /api/importar:
 * `{ filas: [{ linea, accion, errores[] }], resumen: { total, validas,
 * conError, crear, actualizar, sinCambios } }`. La forma está duplicada acá
 * en el cliente a propósito: `lib/**` está fuera del alcance de U3.
 */
function esReporte(valor: unknown): valor is ReporteImportador {
  if (typeof valor !== "object" || valor === null) return false
  const candidato = valor as Record<string, unknown>
  // SAFETY: `as` sólo desempaqueta para inspección; cada campo se valida
  // abajo por tipo y el predicado devuelve false si algo no calza.
  const filas = candidato.filas
  const resumen = candidato.resumen
  if (!Array.isArray(filas) || typeof resumen !== "object" || resumen === null) {
    return false
  }
  for (const fila of filas) {
    const f = fila as Record<string, unknown>
    if (
      typeof f.linea !== "number" ||
      typeof f.accion !== "string" ||
      !Array.isArray(f.errores)
    ) {
      return false
    }
  }
  const r = resumen as Record<string, unknown>
  const claves = ["total", "validas", "conError", "crear", "actualizar", "sinCambios"] as const
  return claves.every((k) => typeof r[k] === "number" && Number.isFinite(r[k]))
}

/** Un bloque del importador: plantilla + vista previa + import. */
function BloqueImportador({ bloque }: { bloque: Bloque }) {
  const Icono = bloque.icono

  const [archivo, setArchivo] = React.useState<File | null>(null)
  const [cargando, setCargando] = React.useState<"vista" | "importar" | null>(
    null
  )
  const [error, setError] = React.useState<string | null>(null)
  const [reporte, setReporte] = React.useState<ReporteImportador | null>(null)
  const [confirmando, setConfirmando] = React.useState(false)
  const [importado, setImportado] = React.useState(false)

  const vistaPreviaValida =
    reporte !== null && reporte.resumen.conError === 0 && reporte.resumen.validas > 0

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const seleccionado = e.target.files?.[0] ?? null
    // Un archivo nuevo invalida la vista previa y la confirmación pendiente:
    // nunca se puede importar un reporte de otro archivo.
    setArchivo(seleccionado)
    setReporte(null)
    setError(null)
    setConfirmando(false)
    setImportado(false)
  }

  async function enviar(escritura: boolean) {
    if (!archivo) return
    setCargando(escritura ? "importar" : "vista")
    setError(null)
    setConfirmando(false)
    try {
      const formData = new FormData()
      formData.append("archivo", archivo, archivo.name)
      const response = await fetch(
        `/api/importar/${bloque.slug}${escritura ? "" : "?dryRun=1"}`,
        { method: "POST", body: formData }
      )
      const reporteRecibido = await leerRespuesta(response)
      setReporte(reporteRecibido)
      if (escritura) setImportado(true)
    } catch (e) {
      setReporte(null)
      setImportado(false)
      setError(
        e instanceof ErrorEstado
          ? e.message
          : "Error de conexión con el servidor. Revisa tu conexión e inténtalo de nuevo."
      )
    } finally {
      // El botón nunca queda colgado: pase lo que pasa, se libera el estado.
      setCargando(null)
    }
  }

  return (
    <section
      aria-label={bloque.titulo}
      className="scroll-mt-24"
      data-bloque={bloque.slug}
    >
      <Card className="border-muted-foreground/10 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icono className="size-5 text-primary" />
            {bloque.titulo}
          </CardTitle>
          <CardDescription>{bloque.descripcion}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avisos permanentes del bloque (S1 / decisión CSV-not-XLSX). */}
          <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-300">
            <p className="flex items-start gap-2">
              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Si tu planilla es .xlsx, primero guárdala como CSV
              (Excel → Archivo → Guardar como → CSV).
            </p>
            <p className="flex items-start gap-2">
              <IconInfoCircle className="mt-0.5 size-3.5 shrink-0" />
              Las filas de ejemplo de la plantilla vienen marcadas con «EJEMPLO-
              » y el importador las rechaza a propósito: reemplázalas por tus
              datos o bórralas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" size="sm">
              <a
                href={`/api/importar/${bloque.slug}/plantilla`}
                download
                data-plantilla={bloque.slug}
              >
                <IconDownload className="size-4" />
                Descargar plantilla
              </a>
            </Button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor={`archivo-${bloque.slug}`}
                className="text-sm font-medium"
              >
                Archivo CSV de {bloque.titulo.toLowerCase()}
              </label>
              <Input
                id={`archivo-${bloque.slug}`}
                type="file"
                accept=".csv,text/csv"
                onChange={elegirArchivo}
                disabled={cargando !== null}
              />
              {archivo && (
                <p className="text-xs text-muted-foreground">
                  Archivo seleccionado: {archivo.name}
                </p>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void enviar(false)}
              disabled={!archivo || cargando !== null}
            >
              {cargando === "vista" ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconUpload className="size-4" />
              )}
              Ver vista previa
            </Button>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {reporte && (
            <div className="space-y-3 rounded-lg border border-muted-foreground/10 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {importado && (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  >
                    <IconCircleCheck className="mr-1 size-3" />
                    Importado
                  </Badge>
                )}
                <Badge variant="secondary">Total: {reporte.resumen.total}</Badge>
                <Badge variant="secondary">
                  Válidas: {reporte.resumen.validas}
                </Badge>
                {reporte.resumen.conError > 0 ? (
                  <Badge
                    variant="outline"
                    className="border-destructive/40 bg-destructive/10 text-destructive"
                  >
                    Con error: {reporte.resumen.conError}
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    Con error: {reporte.resumen.conError}
                  </Badge>
                )}
                <Badge variant="secondary">Crear: {reporte.resumen.crear}</Badge>
                <Badge variant="secondary">
                  Actualizar: {reporte.resumen.actualizar}
                </Badge>
                <Badge variant="secondary">
                  Sin cambios: {reporte.resumen.sinCambios}
                </Badge>
              </div>

              {reporte.resumen.conError === 0 ? (
                <p className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                  <IconCircleCheck className="size-3.5" />
                  Ninguna fila tiene errores: todas las {reporte.resumen.validas}{" "}
                  filas son válidas.
                </p>
              ) : (
                <p className="text-xs text-destructive">
                  {reporte.resumen.conError} fila(s) con error: nada de esas
                  filas se importa; revisa el detalle y corrige el archivo.
                </p>
              )}

              <div className="max-h-80 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Línea</TableHead>
                      <TableHead className="w-28">Acción</TableHead>
                      <TableHead>Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reporte.filas.map((fila) => (
                      <TableRow key={fila.linea}>
                        <TableCell className="tabular-nums">
                          {fila.linea}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">
                            {ETIQUETA_ACCION[fila.accion] ?? fila.accion}
                          </span>
                        </TableCell>
                        <TableCell>
                          {fila.errores.length > 0 ? (
                            <ul className="space-y-1 text-xs text-destructive">
                              {fila.errores.map((mensaje) => (
                                <li
                                  key={mensaje}
                                  className="flex items-start gap-1.5"
                                >
                                  <IconAlertTriangle className="mt-0.5 size-3 shrink-0" />
                                  <span>{mensaje}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {confirmando && reporte && (
            <div
              role="alertdialog"
              className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm"
            >
              <p className="font-medium">¿Confirmar la importación?</p>
              <p className="text-muted-foreground text-xs">
                {`Esto escribirá en la comunidad: se crearán ${reporte.resumen.crear} filas y se actualizarán ${reporte.resumen.actualizar}. Las filas con error no se tocan y la operación se puede repetir sin duplicar datos.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void enviar(true)}
                  disabled={cargando !== null}
                >
                  {cargando === "importar" ? (
                    <IconLoader2 className="size-4 animate-spin" />
                  ) : (
                    <IconUpload className="size-4" />
                  )}
                  Confirmar importación
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={cargando !== null}
                  onClick={() => setConfirmando(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirmando(true)}
              disabled={
                !vistaPreviaValida ||
                cargando !== null ||
                confirmando ||
                importado
              }
            >
              {cargando === "importar" ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconUpload className="size-4" />
              )}
              Importar
            </Button>
            {!vistaPreviaValida && (
              <p className="text-xs text-muted-foreground">
                Corre una vista previa sin errores para habilitar la
                importación.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

export default function CargaInicialPage() {
  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Carga inicial</h1>
        <p className="text-sm text-muted-foreground">
          Importa los datos de tu comunidad desde planillas CSV: primero baja la
          plantilla del bloque, complétala en Excel y subirla acá. Cada carga
          muestra la vista previa fila por fila antes de escribir y se puede
          repetir sin crear duplicados.
        </p>
        <p className="text-xs text-muted-foreground">
          Orden recomendado: Estructura → Personas → Vínculos (los vínculos
          requieren unidades y personas ya cargadas). Cada bloque usa su propio
          archivo.
        </p>
      </header>
      <div className="space-y-6">
        {BLOQUES.map((bloque) => (
          <BloqueImportador key={bloque.slug} bloque={bloque} />
        ))}
      </div>
    </div>
  )
}
