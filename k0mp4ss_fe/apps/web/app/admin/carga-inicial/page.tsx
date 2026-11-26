"use client"

/**
 * /admin/carga-inicial — pantalla única del importador CSV de carga inicial
 * (ODD carga-inicial-csv U3 · F48 T3).
 *
 * Siete bloques idénticos (estructura, personas, vínculos, egresos, ingresos,
 * saldos de apertura y pagos históricos), uno por ruta del importador. El flujo
 * por bloque es siempre el mismo:
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
import { useFondosFI } from "@/lib/api/use-fondos-fi"
import {
  IconAlertTriangle,
  IconBuildingSkyscraper,
  IconCircleCheck,
  IconCoins,
  IconDownload,
  IconInfoCircle,
  IconLoader2,
  IconCoin,
  IconReceipt,
  IconSettings,
  IconUpload,
  IconUserHeart,
  IconLink,
  IconWallet,
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
  {
    slug: "egresos",
    titulo: "Egresos",
    descripcion: (
      <>
        Gastos históricos de la comunidad (fecha, monto, descripción,
        categoría y fondo). Los fondos{" "}
        <strong className="font-semibold text-foreground">
          no se cargan acá
        </strong>
        : este bloque no los crea. Los de esta comunidad están en la tarjeta de
        arriba, y el CSV los reconoce por nombre exacto o id.
      </>
    ),
    icono: IconReceipt,
  },
  {
    slug: "ingresos",
    titulo: "Ingresos",
    descripcion: (
      <>
        Ingresos históricos a los fondos (fecha, monto, descripción, categoría
        y fondo). Los fondos{" "}
        <strong className="font-semibold text-foreground">
          no se cargan acá
        </strong>
        : este bloque no los crea. Los de esta comunidad están en la tarjeta de
        arriba, y el CSV los reconoce por nombre exacto o id.
      </>
    ),
    icono: IconCoins,
  },
  {
    slug: "pagos-historicos",
    titulo: "Pagos históricos",
    descripcion:
      "El detalle de lo que cada unidad ya pagó (rol SII, fecha, monto y medio). Se registra en los pagos del cobro de gasto común de ese período: el cobro tiene que existir antes de importar, porque este bloque no crea cobros ni asientos. Reimportar el mismo archivo no duplica.",
    icono: IconCoin,
  },
  {
    slug: "saldos",
    titulo: "Saldos de apertura",
    descripcion:
      "La deuda que cada unidad ya tenía a la fecha de corte (rol SII, fecha y monto). Se imputa al fondo de gasto común activo y se rechaza si la comunidad ya emitió gasto común para ese período o uno anterior: contaría dos veces el mismo mes.",
    icono: IconWallet,
  },
] as const

type Bloque = (typeof BLOQUES)[number]

/**
 * Aviso de fondos: responde «¿dónde cargo mis fondos?» antes de la primera
 * planilla. Egresos e ingresos imputan cada fila a un fondo que ya existe, por
 * nombre exacto o id; el importador no los crea. Mientras SWR carga no se pinta
 * nada: un esqueleto acá sería un salto de altura sin información.
 */
function AvisoFondos() {
  const { items, isLoading } = useFondosFI()

  if (isLoading) return null

  return (
    <Card
      data-testid="aviso-fondos"
      className="border-primary/20 bg-primary/5 shadow-none"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IconWallet className="size-5 text-primary" />
          Antes de cargar: los fondos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {items.length === 0 ? (
          <p>
            Todavía no hay fondos. Egresos e ingresos imputan cada fila a un
            fondo que ya existe y este importador{" "}
            <strong className="font-semibold text-foreground">
              no los crea
            </strong>
            : creá al menos uno en Finanzas antes de subir esas planillas.
          </p>
        ) : (
          <>
            <p>
              Este importador{" "}
              <strong className="font-semibold text-foreground">
                no crea fondos
              </strong>
              : los egresos y los ingresos se imputan a un fondo que ya existe,
              por{" "}
              <strong className="font-semibold text-foreground">
                nombre exacto o id
              </strong>
              . Si el nombre del CSV no coincide, la fila falla con el motivo.
            </p>
            <div className="space-y-1.5">
              <p>
                Hoy la comunidad tiene{" "}
                <strong className="font-semibold text-foreground">
                  {items.length}
                </strong>
                :
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {items.map((fondo) => (
                  <li key={fondo.id}>
                    {fondo.nombre}
                    {fondo.activo === false ? " (inactivo)" : ""}
                  </li>
                ))}
              </ul>
            </div>
            <p>Se crean y se renombran en Finanzas.</p>
          </>
        )}
        <Button asChild variant="outline" size="sm">
          <a href="/finanzas/gastos-comunes">Ir a Finanzas</a>
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * Aviso de los datos de la comunidad: el nombre del encabezado, el RUT, la
 * dirección y los datos del administrador son un único registro que se edita
 * en Configuración; ninguna planilla los trae. Va después de los fondos y
 * antes de los bloques para que se lea antes de elegir el primer archivo.
 */
function AvisoDatosComunidad() {
  return (
    <Card
      data-testid="aviso-datos-comunidad"
      className="border-muted-foreground/10 shadow-none"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IconSettings className="size-5 text-primary" />
          Antes de cargar: los datos de la comunidad
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Estos datos{" "}
          <strong className="font-semibold text-foreground">
            no se cargan por archivo
          </strong>
          : son un solo registro y se editan en Configuración.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Nombre de la comunidad</li>
          <li>RUT de la comunidad</li>
          <li>Dirección oficial</li>
          <li>RUT del administrador</li>
          <li>Teléfono del administrador</li>
        </ul>
        <p>El nombre que ves en el encabezado sale de acá.</p>
        <Button asChild variant="outline" size="sm">
          <a href="/admin/configuracion">Ir a Configuración</a>
        </Button>
      </CardContent>
    </Card>
  )
}

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
  let cuerpo: { error?: string; detalle?: string } | null = null
  try {
    cuerpo = (await response.json()) as { error?: string; detalle?: string } | null
  } catch {
    cuerpo = null
  }
  if (!response.ok) {
    // `detalle` es el texto extra del servidor (por ejemplo, qué encabezado
    // falta en el archivo): se suma al mensaje para no obligar a adivinarlo.
    const detalle =
      typeof cuerpo?.error === "string" && cuerpo.error !== ""
        ? `: ${cuerpo.error}${
            typeof cuerpo.detalle === "string" && cuerpo.detalle !== ""
              ? ` (${cuerpo.detalle})`
              : ""
          }`
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
        <p className="text-xs text-muted-foreground" data-testid="orden-carga">
          <strong className="font-semibold text-foreground">
            Este no es un orden sugerido: es el orden que el sistema necesita.
          </strong>{" "}
          Estructura → Personas → Vínculos → Egresos e Ingresos → Saldos de
          apertura. Si subís un bloque antes que el suyo, todas sus filas fallan
          con el motivo y no se escribe nada. Y la secuencia financiera tiene un
          paso que no es de esta pantalla:{" "}
          <strong className="font-semibold text-foreground">
            emití el gasto común del período antes de subir los pagos históricos
          </strong>
          , porque ese bloque no crea cobros.
        </p>
      </header>
      <AvisoFondos />
      <AvisoDatosComunidad />
      <div className="space-y-6">
        {BLOQUES.map((bloque) => (
          <BloqueImportador key={bloque.slug} bloque={bloque} />
        ))}
      </div>
    </div>
  )
}
