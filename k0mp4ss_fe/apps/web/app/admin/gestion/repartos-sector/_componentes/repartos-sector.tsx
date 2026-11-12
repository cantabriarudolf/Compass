"use client"

/**
 * Consola del reparto de gasto por sector (F32 · U4 del plan
 * «saldar-v2-pantallas-y-barrido», S1 y S2).
 *
 * `GET` y `POST /api/repartos-sector` existen desde F32 y nadie podía emitir un
 * reparto sin curl. Esta pantalla les pone la cara y no decide nada que sea del
 * servidor:
 *
 *   · el LISTADO viene de `GET /api/repartos-sector`: cada reparto con su sector,
 *     su período, su concepto, el `montoTotal` y el `avaluoTotal` PERSISTIDOS, y sus
 *     cuotas con el número de unidad, el `avaluoUsado` CONGELADO al emitir y el
 *     monto. La pantalla los pinta; no prorratea, no revaloriza ni recalcula nada:
 *     una revalorización posterior no reescribe lo emitido (`_vista.ts`);
 *   · las CUOTAS son la evidencia del prorrateo, así que se despliegan por reparto
 *     con el avalúo que se usó en cada una. La suma de las cuotas no se muestra
 *     —el monto total que queda es el snapshot del servidor—: recalcularla acá
 *     sería una segunda versión de la regla del dinero;
 *   · las UNIDADES QUE QUEDARON FUERA del reparto son el punto de la pantalla: una
 *     unidad sin cuota es una unidad sin `avalúoFiscal` declarado, es decir un avalúo
 *     que NADIE cargó, y alguien tiene que notarlo. La lista viaja con el reparto
 *     (`unidadesExcluidas` en `app/api/repartos-sector/_vista.ts`) como SNAPSHOT
 *     congelado al emitir, y la pantalla la pinta con el número de cada unidad. Acá
 *     NO se deduce «unidades del sector menos unidades con cuota»: eso reimplementaría
 *     la regla de `lib/reparto-sector.ts` en el navegador y, peor, señalaría como
 *     excluida a una unidad dada de alta después de la emisión, que no existía
 *     cuando el reparto se emitió. Si la lista llega vacía se dice que todas las
 *     unidades del sector tenían avalúo, en vez de una caja vacía;
 *   · el ALTA manda sólo `{ microSectorId, periodo, concepto, montoTotal }`. El
 *     avalúo de cada unidad NO viaja: se LEE de `Unidad.avaluoFiscal` en el
 *     servidor —si el cliente pudiera declararlo, bastaría con subir el avalúo de
 *     una unidad para moverle la carga a otra—, igual que el `id`, el `estado`, el
 *     `avaluoTotal` y las cuotas;
 *   · ANTES de emitir la pantalla dice que el reparto es EN PROPORCIÓN AL AVALÚO y
 *     que la unidad sin avalúo no paga. El usuario tiene que saber que el dinero no
 *     se divide en partes iguales antes de aceptar, no después;
 *   · los ERRORES se pintan con el texto de la API tal cual (`error`) y con los
 *     motivos por campo que la ruta devuelve en `detalles`. El 400 del sector sin
 *     ninguna unidad con avalúo declarado es el que la administración va a
 *     encontrar, y no se reescribe acá;
 *   · el ÉXITO sólo se declara después del 2xx del servidor, con los valores que
 *     devolvió la respuesta. Sin éxito no se limpia el formulario, no se relee y no
 *     se afirma nada: la pantalla no puede declarar un acto no registrado.
 *
 * Frontera deliberada: la única guardia del cliente es de FORMA —un sector elegido,
 * un período AAAA-MM y un monto que JSON pueda llevar—, no una copia de las reglas
 * del reparto. Que el sector tenga unidades con avalúo, que el monto llegue a un
 * centavo y que la suma de las cuotas cierre las decide `lib/reparto-sector.ts` en
 * el servidor, y su 400 se muestra tal cual: bloquearlo acá sería una segunda verdad
 * que el día que cambie la regla rechazaría en silencio lo que el servidor acepta.
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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
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
  IconChartPie,
  IconCircleCheck,
  IconInfoCircle,
  IconLoader2,
  IconPlus,
} from "@tabler/icons-react"
import { AvisoTruncamiento } from "@/components/pe/aviso-truncamiento"

const RUTA = {
  repartos: "/api/repartos-sector",
  // La colección de micro sectores del padrón. Pide `mp` con `ver`: si el rol no
  // la alcanza, su 403 se lee tal cual y no se ofrece un sector inventado.
  sectores: "/api/micro-sectores",
} as const

/**
 * Lo que la pantalla declara ANTES de emitir: el reparto no es en partes iguales y
 * la unidad sin avalúo se queda afuera. Es el contrato de la regla pura
 * (`lib/reparto-sector.ts`), no una estimación de la pantalla.
 */
const AVISO_PROPORCIONAL =
  "El gasto se reparte entre las unidades del sector EN PROPORCIÓN A SU AVALÚO FISCAL: no se divide en partes iguales. La unidad que no tiene avalúo fiscal declarado NO paga y queda fuera del reparto; si ninguna unidad del sector lo tiene, el servidor rechaza la emisión."

/**
 * Lo que se dice cuando el reparto no dejó ninguna unidad fuera: en vez de una caja
 * vacía sin explicación, la constancia de que todas las unidades del sector tenían
 * avalúo declarado cuando se emitió.
 */
const TEXTO_SIN_UNIDADES_EXCLUIDAS =
  "Todas las unidades del sector tenían avalúo fiscal declarado al emitir: ninguna quedó fuera del reparto."

/** Una unidad tal como la devuelve la vista del servidor. */
interface CuotaLeida {
  id: string
  unidadId: string
  unidadNumero: string | null
  avaluoUsado: number
  monto: number
}

/**
 * Una unidad que quedó FUERA del reparto porque no tenía avalúo fiscal declarado.
 * Es el snapshot que congeló el servidor al emitir, con el número de ese momento.
 */
interface UnidadExcluidaLeida {
  unidadId: string
  unidadNumero: string
}

/** Un reparto con sus cuotas, tal como lo devuelve la vista del servidor. */
interface RepartoLeido {
  id: string
  microSectorId: string
  microSectorNombre: string | null
  periodo: string
  concepto: string
  montoTotal: number
  avaluoTotal: number
  estado: string
  creadoPor: string
  createdAt: string
  cuotas: CuotaLeida[]
  unidadesExcluidas: UnidadExcluidaLeida[]
}

/** Un micro sector del padrón, lo mínimo para elegir a dónde se carga el gasto. */
interface SectorLeido {
  id: string
  nombre: string
}

/** El error del alta: el texto de la API y los motivos por campo que lo acompañan. */
interface ErrorDelAlta {
  mensaje: string
  motivos: string[]
}

/** Pesos en formato chileno, igual que el resto de las pantallas de finanzas. */
function pesos(monto: number): string {
  return `$${monto.toLocaleString("es-CL")}`
}

/**
 * Un avalúo fiscal no es dinero: se muestra como la cifra catastral que es, con los
 * separadores de miles de Chile y sin signo de peso.
 */
function cifra(valor: number): string {
  return valor.toLocaleString("es-CL")
}

/** Cuántas unidades entraron, en palabras («1 unidad» / «2 unidades»). */
function unidades(cantidad: number): string {
  return cantidad === 1 ? "1 unidad" : `${cantidad} unidades`
}

/**
 * El estado del reparto en palabras. La ruta sólo escribe `emitido` (no hay PUT ni
 * DELETE: un reparto emitido es la evidencia de lo que se le cargó a cada unidad),
 * pero un estado que la base traiga y este mapa no conozca se muestra con su código
 * en vez de traducirse a algo que el servidor no dijo.
 */
function etiquetaEstado(estado: string): string {
  return estado === "emitido" ? "Emitido" : estado
}

/** El formato del período que valida la ruta: el mes de facturación, `AAAA-MM`. */
const FORMATO_PERIODO = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/

interface RespuestaLeida {
  ok: boolean
  cuerpo: Record<string, unknown> | null
  /** El mensaje de error de la API, tal cual; vacío cuando la respuesta fue buena. */
  mensaje: string
}

/**
 * Lee una respuesta como JSON y separa lo que el servidor dijo de lo que la pantalla
 * puede inventar. El error de la API se devuelve textual: es la regla, y reescribirlo
 * en el cliente crearía una segunda versión capaz de divergir.
 */
async function leerJson(
  url: string,
  init?: RequestInit
): Promise<RespuestaLeida> {
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

/** Manda un cuerpo JSON a una ruta de acción. */
function enviarJson(
  url: string,
  cuerpo: Record<string, unknown>
): Promise<RespuestaLeida> {
  return leerJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  })
}

/**
 * Los motivos por campo de un 400 de contrato, tal como los escribió el servidor.
 *
 * La ruta devuelve `detalles` con el `flatten()` del esquema: los mensajes son los de
 * zod y esta pantalla los pinta sin traducirlos. Cuando el 400 no trae `detalles`
 * —el sector sin avalúo, por ejemplo— la lista queda vacía y el `error` textual es
 * todo lo que hay.
 */
function motivosDeCampo(detalles: unknown): string[] {
  if (typeof detalles !== "object" || detalles === null) return []
  const objeto = detalles as Record<string, unknown>
  const motivos: string[] = []

  function agregar(campo: string, lista: unknown): void {
    if (!Array.isArray(lista)) return
    for (const motivo of lista) {
      if (typeof motivo !== "string") continue
      motivos.push(campo === "" ? motivo : `${campo}: ${motivo}`)
    }
  }

  agregar("", objeto.formErrors)
  const porCampo = objeto.fieldErrors
  if (typeof porCampo === "object" && porCampo !== null) {
    for (const [campo, lista] of Object.entries(
      porCampo as Record<string, unknown>
    )) {
      agregar(campo, lista)
    }
  }
  return motivos
}

/** El mensaje de una colección que no vino como lista. */
function sinLista(que: string): string {
  return `La respuesta del servidor no trae la lista de ${que}: no se puede mostrar el registro.`
}

export interface ConsolaRepartosSectorProps {
  /** `fi:gasto_comun` con `crear`: habilita el formulario de emisión. */
  puedeCrear: boolean
}

export function ConsolaRepartosSector({
  puedeCrear,
}: ConsolaRepartosSectorProps) {
  const [repartos, setRepartos] = React.useState<RepartoLeido[]>([])
  const [cargando, setCargando] = React.useState(true)
  const [errorCarga, setErrorCarga] = React.useState<string | null>(null)

  const [abiertoId, setAbiertoId] = React.useState<string | null>(null)

  // Sectores del padrón para el alta. Se piden sólo si el rol puede emitir: un rol
  // que sólo fiscaliza no necesita el catálogo, y su lectura pide otra clave.
  const [sectores, setSectores] = React.useState<SectorLeido[]>([])
  const [totalSectores, setTotalSectores] = React.useState(0)
  const [errorSectores, setErrorSectores] = React.useState<string | null>(null)

  const [microSectorId, setMicroSectorId] = React.useState("")
  const [periodo, setPeriodo] = React.useState("")
  const [concepto, setConcepto] = React.useState("")
  const [monto, setMonto] = React.useState("")
  const [enviando, setEnviando] = React.useState(false)
  const [errorAlta, setErrorAlta] = React.useState<ErrorDelAlta | null>(null)
  const [exito, setExito] = React.useState<string | null>(null)

  const cargar = React.useCallback(async (): Promise<void> => {
    setCargando(true)
    const respuesta = await leerJson(RUTA.repartos)
    const lista = respuesta.cuerpo?.data

    if (!respuesta.ok) {
      setErrorCarga(respuesta.mensaje)
      setRepartos([])
      setCargando(false)
      return
    }
    if (!Array.isArray(lista)) {
      setErrorCarga(sinLista("repartos por sector"))
      setRepartos([])
      setCargando(false)
      return
    }

    setErrorCarga(null)
    setRepartos(lista as RepartoLeido[])
    setCargando(false)
  }, [])

  const cargarSectores = React.useCallback(async (): Promise<void> => {
    const respuesta = await leerJson(RUTA.sectores)
    const lista = respuesta.cuerpo?.data

    // La colección de sectores pide una clave propia: si el servidor la niega, ese
    // 403 se lee tal cual y no como «la comunidad no tiene sectores».
    setErrorSectores(respuesta.ok ? null : respuesta.mensaje)
    const datos = Array.isArray(lista) ? (lista as SectorLeido[]) : []
    setSectores(respuesta.ok ? datos : [])
    setTotalSectores(
      respuesta.ok && typeof respuesta.cuerpo?.total === "number"
        ? respuesta.cuerpo.total
        : 0
    )
  }, [])

  React.useEffect(() => {
    void cargar()
  }, [cargar])

  React.useEffect(() => {
    if (!puedeCrear) return
    void cargarSectores()
  }, [cargarSectores, puedeCrear])

  // Guardia de FORMA, no de negocio: se escribe un período AAAA-MM y un monto que
  // JSON pueda llevar. Que el monto llegue a un centavo y que el sector tenga
  // avalúos lo decide el servidor.
  const periodoValido = FORMATO_PERIODO.test(periodo)
  const montoValido = monto.trim() !== "" && Number.isFinite(Number(monto))
  const formularioCompleto =
    microSectorId !== "" &&
    periodoValido &&
    concepto.trim() !== "" &&
    montoValido

  const sectorElegido =
    sectores.find((sector) => sector.id === microSectorId) ?? null

  async function emitir(
    evento: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    evento.preventDefault()
    if (!formularioCompleto || enviando) return

    // El cuerpo es exactamente el de `RepartoSectorCreacionSchema`. El avalúo de
    // cada unidad, el avalúo total, las cuotas y el estado los decide el servidor:
    // no viajan desde acá.
    const cuerpo: Record<string, unknown> = {
      microSectorId,
      periodo,
      concepto: concepto.trim(),
      montoTotal: Number(monto),
    }

    const periodoEnviado = periodo
    const nombreElegido = sectorElegido?.nombre ?? null

    setEnviando(true)
    setErrorAlta(null)
    setExito(null)
    const respuesta = await enviarJson(RUTA.repartos, cuerpo)
    setEnviando(false)

    // Sin 2xx no se limpia ni se relee: la pantalla no declara un reparto que el
    // servidor no registró.
    if (!respuesta.ok) {
      setErrorAlta({
        mensaje: respuesta.mensaje,
        motivos: motivosDeCampo(respuesta.cuerpo?.detalles),
      })
      return
    }

    const montoDelServidor = respuesta.cuerpo?.montoTotal
    const cuotasDelServidor = respuesta.cuerpo?.cuotas
    const nombreDelServidor = respuesta.cuerpo?.microSectorNombre

    if (
      typeof montoDelServidor === "number" &&
      Array.isArray(cuotasDelServidor)
    ) {
      const sector =
        typeof nombreDelServidor === "string"
          ? nombreDelServidor
          : (nombreElegido ?? "el sector")
      setExito(
        `Reparto de ${sector} para ${periodoEnviado} emitido por ${pesos(
          montoDelServidor
        )} entre ${unidades(
          cuotasDelServidor.length
        )} con avalúo fiscal declarado.`
      )
    } else {
      setExito("El servidor confirmó la emisión del reparto.")
    }

    // El formulario vuelve a su estado inicial: la emisión siguiente se completa
    // desde cero y no se puede reenviar la anterior sin escribirlo de nuevo.
    setMicroSectorId("")
    setPeriodo("")
    setConcepto("")
    setMonto("")
    await cargar()
  }

  const total = repartos.length

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b pb-5">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <IconChartPie className="size-7 text-primary" /> Reparto de gasto por
          sector
        </h1>
        <p className="text-muted-foreground">
          El gasto de un bien o servicio que sirve a un solo sector se carga a ese
          sector, en proporción al avalúo fiscal de sus unidades: no se reparte
          entre toda la comunidad ni en partes iguales. El monto total y el avalúo
          total se congelan al emitir, y un reparto emitido no se edita.
        </p>
      </div>

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
          <CardTitle className="text-sm">
            {total === 0
              ? "Repartos emitidos"
              : `Repartos emitidos (${total})`}
          </CardTitle>
          <CardDescription className="text-xs">
            Una fila por reparto emitido, con el sector al que se cargó el gasto,
            el período, el concepto y el monto total congelado al emitir. Las
            cuotas de cada reparto guardan el avalúo que se usó.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cargando && repartos.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Leyendo los repartos por sector de la comunidad…
            </p>
          ) : repartos.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              La comunidad todavía no emitió ningún reparto por sector.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sector</TableHead>
                  <TableHead className="w-[100px]">Período</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="w-[130px] text-right">
                    Monto total
                  </TableHead>
                  <TableHead className="w-[130px]">
                    Unidades que entraron
                  </TableHead>
                  <TableHead className="w-[140px] text-right">Cuotas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repartos.map((reparto) => {
                  const abierto = abiertoId === reparto.id
                  const sector = reparto.microSectorNombre ?? "Sector no informado"
                  // La lista sale del snapshot del servidor, tal cual. Si la
                  // respuesta no la trae (no debería: la columna tiene default y la
                  // vista siempre la expone), no se afirma nada: `null` no es una
                  // lista vacía.
                  const excluidas = Array.isArray(reparto.unidadesExcluidas)
                    ? reparto.unidadesExcluidas
                    : null
                  return (
                    <React.Fragment key={reparto.id}>
                      <TableRow>
                        <TableCell className="font-medium">{sector}</TableCell>
                        <TableCell className="text-xs">
                          {reparto.periodo}
                        </TableCell>
                        <TableCell>{reparto.concepto}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pesos(reparto.montoTotal)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {unidades(reparto.cuotas.length)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-expanded={abierto}
                            onClick={() =>
                              setAbiertoId(abierto ? null : reparto.id)
                            }
                          >
                            {abierto ? "Ocultar cuotas" : "Ver cuotas"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {abierto && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/20">
                            <div
                              role="region"
                              aria-label={`Cuotas del reparto de ${sector} ${reparto.periodo}`}
                              className="flex flex-col gap-2 py-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-medium">
                                  Cuota por unidad
                                </p>
                                <Badge
                                  variant="secondary"
                                  className="bg-sky-100 text-[11px] text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                                >
                                  {etiquetaEstado(reparto.estado)}
                                </Badge>
                              </div>

                              {reparto.cuotas.map((cuota) => (
                                <div
                                  key={cuota.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-xs"
                                >
                                  <span className="font-medium">
                                    {`Unidad ${
                                      cuota.unidadNumero ?? "sin número"
                                    }`}
                                  </span>
                                  <span className="text-muted-foreground tabular-nums">
                                    {`Avalúo usado ${cifra(
                                      cuota.avaluoUsado
                                    )}`}
                                  </span>
                                  <span className="tabular-nums">
                                    {pesos(cuota.monto)}
                                  </span>
                                </div>
                              ))}

                              {reparto.cuotas.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  El servidor no devolvió cuotas para este
                                  reparto.
                                </p>
                              )}

                              <p className="border-t pt-2 text-xs font-medium tabular-nums">
                                {`Entraron ${unidades(
                                  reparto.cuotas.length
                                )} al reparto (avalúo total congelado al emitir: ${cifra(
                                  reparto.avaluoTotal
                                )}).`}
                              </p>

                              {/* El punto de la pantalla: qué unidades no pagaron y
                                  por qué. La lista es la foto congelada al emitir
                                  —no se deduce acá del padrón de hoy—. */}
                              {excluidas !== null && excluidas.length === 0 && (
                                <p className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
                                  <IconInfoCircle
                                    className="mt-0.5 size-4 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span>{TEXTO_SIN_UNIDADES_EXCLUIDAS}</span>
                                </p>
                              )}

                              {excluidas !== null && excluidas.length > 0 && (
                                <div className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                                  <p className="flex items-start gap-2 font-medium">
                                    <IconAlertTriangle
                                      className="mt-0.5 size-4 shrink-0"
                                      aria-hidden="true"
                                    />
                                    <span>
                                      Quedaron fuera del reparto porque no tienen
                                      avalúo fiscal declarado:
                                    </span>
                                  </p>
                                  <ul className="list-inside list-disc pl-6 font-medium tabular-nums">
                                    {excluidas.map((unidadExcluida) => (
                                      <li key={unidadExcluida.unidadId}>
                                        {`Unidad ${unidadExcluida.unidadNumero}`}
                                      </li>
                                    ))}
                                  </ul>
                                  <p className="pl-6">
                                    No pagan su parte y no se las compensa. Cargá
                                    el avalúo fiscal en la ficha de cada unidad y
                                    emití un reparto nuevo: este reparto no se
                                    recalcula.
                                  </p>
                                </div>
                              )}
                            </div>
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

      {puedeCrear && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Emitir un reparto por sector
            </CardTitle>
            <CardDescription className="text-xs">
              El gasto se carga al sector elegido y el servidor lo reparte entre
              sus unidades con el avalúo fiscal que tiene declarado cada una. El
              avalúo no se escribe acá: lo lee el servidor de la unidad.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {errorSectores && (
              <p
                role="alert"
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <IconAlertTriangle className="size-4" aria-hidden="true" />
                {errorSectores}
              </p>
            )}

            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => void emitir(e)}
            >
              <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="reparto-sector">Sector</Label>
                  <Select
                    value={microSectorId}
                    onValueChange={(valor) => setMicroSectorId(valor)}
                  >
                    <SelectTrigger
                      id="reparto-sector"
                      className="w-full"
                      aria-label="Sector"
                    >
                      <SelectValue placeholder="Elegí el sector al que se carga el gasto" />
                    </SelectTrigger>
                    <SelectContent>
                      {sectores.map((sectorLeido) => (
                        <SelectItem
                          key={sectorLeido.id}
                          value={sectorLeido.id}
                        >
                          {sectorLeido.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <AvisoTruncamiento
                    mostrados={sectores.length}
                    total={totalSectores}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor="reparto-periodo">Período (AAAA-MM)</Label>
                  <Input
                    id="reparto-periodo"
                    inputMode="numeric"
                    maxLength={7}
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value.trim())}
                    placeholder="2026-03"
                    disabled={enviando}
                  />
                  <p className="text-xs text-muted-foreground">
                    El mes que el gasto cubre, el mismo del gasto común.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="reparto-concepto">Concepto</Label>
                  <Input
                    id="reparto-concepto"
                    value={concepto}
                    onChange={(e) => setConcepto(e.target.value)}
                    placeholder="Mantención del ascensor del sector"
                    maxLength={200}
                    disabled={enviando}
                  />
                  <p className="text-xs text-muted-foreground">
                    Qué gasto se reparte. Es lo único que distingue dos repartos
                    del mismo período: un reparto emitido no se corrige, se emite
                    otro con su propio concepto.
                  </p>
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor="reparto-monto-total">
                    Monto total a repartir
                  </Label>
                  <Input
                    id="reparto-monto-total"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder="Monto en pesos"
                    disabled={enviando}
                  />
                  <p className="text-xs text-muted-foreground">
                    El total del gasto del sector. Las cuotas las calcula el
                    servidor en centavos enteros.
                  </p>
                </div>
              </div>

              <div
                role="note"
                className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs leading-relaxed"
              >
                <IconInfoCircle
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>{AVISO_PROPORCIONAL}</span>
              </div>

              {errorAlta && (
                <div className="flex flex-col gap-1">
                  <p
                    role="alert"
                    className="flex items-center gap-2 text-sm text-destructive"
                  >
                    <IconAlertTriangle className="size-4" aria-hidden="true" />
                    {errorAlta.mensaje}
                  </p>
                  {errorAlta.motivos.length > 0 && (
                    <ul className="list-inside list-disc text-xs text-destructive">
                      {errorAlta.motivos.map((motivo) => (
                        <li key={motivo}>{motivo}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {exito && (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <IconCircleCheck className="size-4" aria-hidden="true" />
                  {exito}
                </p>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={enviando || !formularioCompleto}>
                  {enviando ? (
                    <IconLoader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <IconPlus className="size-4" aria-hidden="true" />
                  )}
                  Emitir reparto
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
