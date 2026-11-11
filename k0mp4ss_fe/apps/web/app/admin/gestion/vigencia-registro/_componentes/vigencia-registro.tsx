"use client"

/**
 * Consola de la vigencia del Registro de Copropietarios (serie «Vigencia del
 * Registro», T6 · S2 y S8).
 *
 * Las rutas existían y nadie podía usarlas sin curl. Esta pantalla muestra, por
 * unidad, el estado que deriva el SERVIDOR (`lib/vigencia-registro.ts`) y ofrece
 * sólo los actos que ese estado admite:
 *
 *   · Requerir — el acto anual del mes 12 que arranca los 60 días corridos
 *     (S2). Con un ciclo abierto la fila no lo ofrece: el servidor responde 409
 *     y ofrecer un botón condenado sería mentir sobre el estado. Una unidad sin
 *     declaración no tiene nada que revalidar, así que requerirla es el único
 *     acto posible.
 *   · Revalidar — confirmar que sigue igual es cumplir (S3), y vale para
 *     cualquier unidad, también para una que ya está al día.
 *   · Emitir avisos — el barrido de S8: un acto explícito de la administración
 *     (no hay cron, D5 de T5) e idempotente. La pantalla muestra los números que
 *     informó el servidor, no unos calculados acá.
 *
 * Lo que decide la API no se reimplementa: el estado NO se calcula en el
 * navegador, se lee el que devolvió el servidor, y después de cada acto la
 * pantalla vuelve a leer porque el veredicto es del servidor. Los errores se
 * pintan con el texto de la API tal cual (`error`), sin traducirlos ni taparlos.
 *
 * S1: la pantalla no promete ninguna multa. `habilitado_para_multa` es el nombre
 * del estado —el plazo de respuesta venció—; el monto sale del maestro de
 * infracciones que la comunidad haya declarado y la aplicación la decide el
 * Comité (S4). Si no lo declaró, no se multa.
 */
import * as React from "react"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
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
  IconBell,
  IconCircleCheck,
  IconGavel,
  IconLoader2,
  IconSend,
} from "@tabler/icons-react"
import type { EstadoCasoRegistro } from "@/lib/vigencia-registro"
import { DIAS_PARA_RESPONDER } from "@/lib/vigencia-registro"

const RUTA = {
  listado: "/api/vigencia-registro",
  requerimiento: "/api/vigencia-registro/requerimiento",
  revalidacion: "/api/vigencia-registro/revalidacion",
  avisos: "/api/vigencia-registro/avisos",
} as const

/**
 * Mínimo del fundamento y del detalle: es el mismo `min(10)` de los esquemas de
 * los dos POST (`RequerimientoVigenciaSchema` y `RevalidacionVigenciaSchema`).
 * La pantalla no deja mandar un cuerpo que el servidor va a rechazar; el
 * servidor igual vuelve a validar.
 */
const MINIMO_TEXTO = 10

/** Lo que devuelve `GET /api/vigencia-registro`, fila por fila. */
interface FilaVigencia {
  unidadId: string
  numero: string
  etiqueta: string | null
  estado: EstadoCasoRegistro
  cambiaEl?: string
  diasParaCambiar?: number
  descripcion: string
  ultimaActualizacion: string | null
  requerimientoEn: string | null
}

type ResumenPorEstado = Partial<Record<EstadoCasoRegistro, number>>

/** Los cinco estados, en el orden del calendario, para el resumen. */
const ESTADOS: ReadonlyArray<EstadoCasoRegistro> = [
  "al_dia",
  "por_vencer",
  "requerido",
  "habilitado_para_multa",
  "sin_declaracion",
]

const ETIQUETA_ESTADO: Record<EstadoCasoRegistro, string> = {
  al_dia: "Al día",
  por_vencer: "Por vencer",
  requerido: "Requerido",
  habilitado_para_multa: "Habilitado para multa",
  sin_declaracion: "Sin declaración",
}

const COLOR_ESTADO: Record<EstadoCasoRegistro, string> = {
  al_dia:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  por_vencer:
    "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  requerido: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  habilitado_para_multa:
    "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  sin_declaracion:
    "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
}

/** El plazo, en palabras del calendario. `undefined` cuando el estado no cambia solo. */
function textoDelPlazo(dias: number | undefined): string | null {
  if (typeof dias !== "number" || Number.isNaN(dias)) return null
  if (dias > 0) return `Faltan ${dias} día(s).`
  if (dias === 0) return "Es hoy."
  return `Venció hace ${Math.abs(dias)} día(s).`
}

/**
 * ¿El estado admite requerir? El requerimiento anual es el acto del mes 12, y una
 * unidad sin declaración no tiene nada que revalidar: requerirla es el único acto
 * posible. Con un ciclo abierto, en cambio, el servidor responde 409 y la fila no
 * ofrece un botón que ya se sabe condenado.
 */
function admiteRequerimiento(fila: FilaVigencia): boolean {
  if (fila.requerimientoEn) return false
  return fila.estado === "requerido" || fila.estado === "sin_declaracion"
}

interface RespuestaLeida {
  ok: boolean
  cuerpo: Record<string, unknown> | null
  /** El mensaje de error de la API, tal cual; vacío cuando la respuesta fue buena. */
  mensaje: string
}

/**
 * Lee una respuesta como JSON y separa lo que el servidor dijo de lo que la
 * pantalla puede inventar. El error de la API se devuelve textual: es la regla, y
 * reescribirlo en el cliente crearía una segunda versión capaz de divergir.
 */
async function leerJson(url: string, init?: RequestInit): Promise<RespuestaLeida> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, init)
  } catch {
    return {
      ok: false,
      cuerpo: null,
      mensaje:
        "No se pudo contactar al servidor. Revisá la conexión e intentá de nuevo.",
    }
  }

  let cuerpo: unknown = null
  try {
    cuerpo = await respuesta.json()
  } catch {
    cuerpo = null
  }
  const objeto =
    typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo)
      ? (cuerpo as Record<string, unknown>)
      : null

  if (!respuesta.ok) {
    const errorServidor =
      objeto && typeof objeto.error === "string" ? objeto.error : null
    return {
      ok: false,
      cuerpo: objeto,
      mensaje:
        errorServidor ??
        `El servidor respondió ${respuesta.status} sin un mensaje de error.`,
    }
  }

  return { ok: true, cuerpo: objeto, mensaje: "" }
}

/** Manda un cuerpo JSON (o ninguno) a una ruta de acción. */
function enviarJson(
  url: string,
  cuerpo: Record<string, unknown> | null
): Promise<RespuestaLeida> {
  if (cuerpo === null) {
    return leerJson(url, { method: "POST" })
  }
  return leerJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  })
}

type TipoDeAccion = "requerimiento" | "revalidacion"

interface AccionAbierta {
  tipo: TipoDeAccion
  fila: FilaVigencia
}

export interface ConsolaVigenciaRegistroProps {
  /**
   * `ad` con `crear` en la sesión. Es el único permiso que puede faltar: leer,
   * revalidar y emitir avisos piden `ad:editar`, que es el portón de la pantalla.
   */
  puedeRequerir: boolean
}

export function ConsolaVigenciaRegistro({
  puedeRequerir,
}: ConsolaVigenciaRegistroProps) {
  const [filas, setFilas] = React.useState<FilaVigencia[]>([])
  const [resumen, setResumen] = React.useState<ResumenPorEstado>({})
  const [cargando, setCargando] = React.useState(true)
  const [errorCarga, setErrorCarga] = React.useState<string | null>(null)

  const [accion, setAccion] = React.useState<AccionAbierta | null>(null)
  const [texto, setTexto] = React.useState("")
  const [enviando, setEnviando] = React.useState(false)
  const [errorAccion, setErrorAccion] = React.useState<string | null>(null)

  const [emitiendo, setEmitiendo] = React.useState(false)
  const [errorAvisos, setErrorAvisos] = React.useState<string | null>(null)
  const [resultadoAvisos, setResultadoAvisos] = React.useState<{
    emitidos: number
    omitidos: number
  } | null>(null)

  const cargar = React.useCallback(async (): Promise<void> => {
    setCargando(true)
    const respuesta = await leerJson(RUTA.listado)
    const lista = respuesta.cuerpo?.data

    if (!respuesta.ok) {
      setErrorCarga(respuesta.mensaje)
      setFilas([])
      setResumen({})
      setCargando(false)
      return
    }
    if (!Array.isArray(lista)) {
      setErrorCarga(
        "La respuesta del servidor no trae la lista de unidades: no se puede mostrar la vigencia."
      )
      setFilas([])
      setResumen({})
      setCargando(false)
      return
    }

    const resumenRecibido = respuesta.cuerpo?.resumen
    setErrorCarga(null)
    setFilas(lista as FilaVigencia[])
    setResumen(
      typeof resumenRecibido === "object" &&
        resumenRecibido !== null &&
        !Array.isArray(resumenRecibido)
        ? (resumenRecibido as ResumenPorEstado)
        : {}
    )
    setCargando(false)
  }, [])

  React.useEffect(() => {
    void cargar()
  }, [cargar])

  function abrir(tipo: TipoDeAccion, fila: FilaVigencia) {
    setAccion({ tipo, fila })
    setTexto("")
    setErrorAccion(null)
  }

  function cerrar() {
    if (enviando) return
    setAccion(null)
    setTexto("")
    setErrorAccion(null)
  }

  const textoRecortado = texto.trim()
  const textoCompleto = textoRecortado.length >= MINIMO_TEXTO

  async function confirmar(): Promise<void> {
    if (!accion || !textoCompleto || enviando) return
    const url =
      accion.tipo === "requerimiento" ? RUTA.requerimiento : RUTA.revalidacion
    const cuerpo =
      accion.tipo === "requerimiento"
        ? { unidadId: accion.fila.unidadId, fundamento: textoRecortado }
        : { unidadId: accion.fila.unidadId, detalle: textoRecortado }

    setEnviando(true)
    setErrorAccion(null)
    const respuesta = await enviarJson(url, cuerpo)
    setEnviando(false)

    // Sin éxito no se cierra ni se relee: la pantalla no puede declarar un acto
    // que el servidor no registró.
    if (!respuesta.ok) {
      setErrorAccion(respuesta.mensaje)
      return
    }

    setAccion(null)
    setTexto("")
    await cargar()
  }

  async function emitirAvisos(): Promise<void> {
    setEmitiendo(true)
    setErrorAvisos(null)
    setResultadoAvisos(null)
    const respuesta = await enviarJson(RUTA.avisos, null)
    setEmitiendo(false)

    if (!respuesta.ok) {
      setErrorAvisos(respuesta.mensaje)
      return
    }

    const emitidos = respuesta.cuerpo?.emitidos
    const omitidos = respuesta.cuerpo?.omitidos
    if (typeof emitidos !== "number" || typeof omitidos !== "number") {
      setErrorAvisos(
        "El servidor no informó cuántos avisos emitió: no se puede confirmar la corrida."
      )
      return
    }

    setResultadoAvisos({ emitidos, omitidos })
    await cargar()
  }

  const tituloAccion = accion?.tipo === "requerimiento"
    ? "Registrar requerimiento"
    : "Registrar revalidación"

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <IconGavel className="size-7 text-primary" /> Vigencia del Registro de
              Copropietarios
            </h1>
            <p className="text-muted-foreground">
              El estado de cada unidad lo deriva el servidor con el calendario del
              reglamento: el requerimiento anual abre {DIAS_PARA_RESPONDER} días
              corridos y, si no hay actualización ni revalidación, el caso queda
              habilitado para multa.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void emitirAvisos()}
            disabled={emitiendo}
            title="Emite los avisos que correspondan hoy (S8). Es un acto explícito e idempotente: volver a correrlo no duplica avisos."
          >
            {emitiendo ? (
              <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <IconBell className="size-4" aria-hidden="true" />
            )}
            Emitir avisos
          </Button>
        </div>

        {errorAvisos && (
          <p
            role="alert"
            className="flex items-center gap-2 text-sm text-destructive"
          >
            <IconAlertTriangle className="size-4" aria-hidden="true" />
            {errorAvisos}
          </p>
        )}
        {resultadoAvisos && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <IconCircleCheck className="size-4" aria-hidden="true" />
            {`Avisos emitidos: ${resultadoAvisos.emitidos} · omitidos por idempotencia: ${resultadoAvisos.omitidos}`}
          </p>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Resumen por estado</CardTitle>
          <CardDescription className="text-xs">
            Los conteos los calcula el servidor sobre las unidades de esta
            comunidad. Una unidad sin declaración es un incidente de datos, no una
            unidad al día.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ul className="flex flex-wrap gap-2">
            {ESTADOS.map((estado) => (
              <li key={estado}>
                <Badge
                  variant="secondary"
                  className={`text-[11px] ${COLOR_ESTADO[estado]}`}
                >
                  {`${ETIQUETA_ESTADO[estado]}: ${resumen[estado] ?? 0}`}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            «Habilitado para multa» marca que el plazo de respuesta venció: no
            aplica ninguna multa por sí solo. El monto sale del maestro de
            infracciones que la comunidad haya declarado y lo aplica el Comité.
          </p>
        </CardContent>
      </Card>

      {errorCarga && (
        <Card className="border-destructive/50">
          <CardContent className="py-3">
            <p role="alert" className="text-sm text-destructive">
              {errorCarga}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Unidades</CardTitle>
          <CardDescription className="text-xs">
            Una fila por unidad: el estado derivado, cuándo cambia solo y el acto
            que corresponde. Las acciones de la fila siguen al estado; el servidor
            vuelve a decidir en cada una.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cargando && filas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Leyendo la vigencia del registro…
            </p>
          ) : filas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              La comunidad no tiene unidades registradas: no hay vigencia que
              seguir por unidad.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Unidad</TableHead>
                  <TableHead className="w-[180px]">Estado</TableHead>
                  <TableHead className="w-[160px]">Cambia el</TableHead>
                  <TableHead>Qué significa</TableHead>
                  <TableHead className="w-[200px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((fila) => {
                  const plazo = textoDelPlazo(fila.diasParaCambiar)
                  return (
                    <TableRow key={fila.unidadId}>
                      <TableCell>
                        <p className="font-medium">{fila.numero}</p>
                        {fila.etiqueta && (
                          <p className="text-xs text-muted-foreground">
                            {fila.etiqueta}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`text-[11px] ${COLOR_ESTADO[fila.estado]}`}
                        >
                          {ETIQUETA_ESTADO[fila.estado]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {fila.cambiaEl ? (
                          <>
                            <p>{fila.cambiaEl}</p>
                            {plazo && (
                              <p className="text-muted-foreground">{plazo}</p>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{fila.descripcion}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {admiteRequerimiento(fila) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!puedeRequerir}
                              title={
                                puedeRequerir
                                  ? `Requiere la actualización: este acto arranca los ${DIAS_PARA_RESPONDER} días corridos del copropietario.`
                                  : "Tu rol no puede requerir la actualización del Registro (clave ad con acción crear)."
                              }
                              onClick={() => abrir("requerimiento", fila)}
                            >
                              <IconSend className="size-3.5" aria-hidden="true" />
                              Requerir
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            title="Confirma que los datos siguen igual: es la segunda forma de cumplir, sin editar nada."
                            onClick={() => abrir("revalidacion", fila)}
                          >
                            Revalidar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={accion !== null} onOpenChange={(abierto) => { if (!abierto) cerrar() }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {accion?.tipo === "requerimiento"
                ? "Requerir la actualización del Registro"
                : "Revalidar el Registro sin cambios"}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              {accion?.tipo === "requerimiento"
                ? `Unidad ${accion?.fila.numero}: este acto arranca los ${DIAS_PARA_RESPONDER} días corridos que tiene el copropietario. El vencimiento lo congela el servidor al registrar el requerimiento.`
                : `Unidad ${accion?.fila.numero}: confirmá qué se verificó que sigue igual. La revalidación deja la unidad al día y no borra la evidencia del requerimiento anterior.`}
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-2"
            onSubmit={(evento) => {
              evento.preventDefault()
              void confirmar()
            }}
          >
            <Label htmlFor="texto-accion">
              {accion?.tipo === "requerimiento" ? "Fundamento" : "Qué se confirmó"}
            </Label>
            <Input
              id="texto-accion"
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              placeholder={
                accion?.tipo === "requerimiento"
                  ? "Qué se requiere actualizar y por qué"
                  : "Qué se verificó que sigue igual"
              }
              maxLength={500}
              disabled={enviando}
            />
            <p className="text-xs text-muted-foreground">
              Mínimo {MINIMO_TEXTO} caracteres. Queda registrado con la fecha y el
              usuario de la sesión.
            </p>

            {errorAccion && (
              <p role="alert" className="text-sm text-destructive">
                {errorAccion}
              </p>
            )}

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={cerrar}
                disabled={enviando}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando || !textoCompleto}>
                {enviando && (
                  <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                )}
                {tituloAccion}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
