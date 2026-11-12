"use client"

/**
 * Consola del presupuesto por partidas (F31 · U3 del plan
 * «saldar-v2-pantallas-y-barrido», S1 y S2).
 *
 * `GET` y `POST /api/presupuestos` existían y nadie podía aprobar un presupuesto
 * anual sin curl. Esta pantalla les pone la cara y no decide nada que sea del
 * servidor:
 *
 *   · el LISTADO viene de `GET /api/presupuestos`: cada versión con su período,
 *     su cuerpo, su número de versión, su estado, su `total` PERSISTIDO y sus
 *     partidas ordenadas. La pantalla los pinta; no suma ni recalcula nada. El
 *     total que muestra es el snapshot aprobado, no una segunda cuenta capaz de
 *     separarse de las filas (`app/api/presupuestos/_vista.ts`);
 *   · el CUERPO que aprueba el presupuesto (comité o asamblea) NO se elige acá:
 *     lo define el reglamento de cada comunidad y el servidor lo COPIA del
 *     acuerdo (Ley 21.442 arts. 15 y 17). La pantalla lo muestra como dato del
 *     acuerdo elegido, y no ofrece ningún control para cambiarlo;
 *   · el ALTA manda sólo el período, el acuerdo y las partidas
 *     (`{ periodo, acuerdoId, partidas: [{ nombre, categoria, monto }] }`). El
 *     `id`, la versión, el estado, el cuerpo, el `orden` de cada partida y el
 *     total los escribe el servidor en una transacción;
 *   · la SUMA de las partidas se muestra mientras se escribe, en centavos
 *     enteros como la regla pura, y se declara como VISTA PREVIA: el total que
 *     queda es el que devuelve el servidor. Si los dos números no coinciden, el
 *     éxito muestra el del servidor y dice cuál era el de la pantalla;
 *   · el REEMPLAZO se avisa ANTES de registrar: un presupuesto nuevo del mismo
 *     período no bloquea —reemplaza al vigente con la versión siguiente—, así
 *     que la pantalla nombra la versión y el total que van a quedar
 *     `reemplazado`;
 *   · el ACUERDO se elige entre los `aprobado` de cuerpo `comite` o `asamblea`,
 *     que es exactamente lo que la ruta exige de la fila real; uno rechazado,
 *     abierto o de un cuerpo que la ley no faculta no se ofrece porque el
 *     servidor responde 400 y un botón condenado miente sobre el estado;
 *   · los ERRORES se pintan con el texto de la API tal cual (`error`) y con los
 *     motivos por campo que la ruta devuelve en `detalles` —el 400 del acuerdo
 *     no aprobado, el de las partidas vacías y el del monto negativo son los que
 *     el administrador va a encontrar, y ninguno se reescribe acá—;
 *   · el ÉXITO sólo se declara después del 2xx del servidor, con los valores que
 *     devolvió la respuesta. Sin éxito no se limpia el formulario, no se relee y
 *     no se afirma nada: la pantalla no puede declarar un acto no registrado.
 *
 * Frontera deliberada: la única guardia del cliente es de FORMA —un período con
 * el formato AAAA, un acuerdo elegido y montos que JSON pueda llevar—, no una
 * copia de las reglas del dinero. Que haya al menos una partida y que ningún
 * monto sea negativo lo decide `lib/presupuesto.ts` en el servidor, y su 400 se
 * muestra tal cual: bloquearlo acá sería una segunda verdad que el día que
 * cambie la regla rechazaría en silencio lo que el servidor acepta.
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
  IconCircleCheck,
  IconClipboardList,
  IconLoader2,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"
import type { CategoriaEgresoFI } from "@/lib/schemas"
import { esCuerpoDelPresupuesto } from "@/lib/presupuesto"
import { AvisoTruncamiento } from "@/components/pe/aviso-truncamiento"

const RUTA = {
  presupuestos: "/api/presupuestos",
  // El tope de la lectura del libro de acuerdos (`LIMITE_ACUERDOS` de la ruta).
  // Si el libro tiene más, `AvisoTruncamiento` lo dice en pantalla.
  acuerdos: "/api/acuerdos",
} as const

/** Una partida tal como la devuelve la vista del servidor. */
interface PartidaLeida {
  id: string
  nombre: string
  categoria: string
  monto: number
  orden: number
}

/** Un presupuesto con sus partidas, tal como lo devuelve la vista del servidor. */
interface PresupuestoLeido {
  id: string
  periodo: string
  cuerpo: string
  acuerdoId: string
  version: number
  estado: string
  total: number
  creadoPor: string
  createdAt: string
  partidas: PartidaLeida[]
  acuerdoFolio: string | null
}

/** Un acuerdo del libro, lo mínimo para elegir el que aprueba el presupuesto. */
interface AcuerdoLeido {
  id: string
  folio: string
  cuerpo: string
  materia: string
  estado: string
}

/**
 * El nombre del cuerpo para la pantalla. La fila guarda el código y la ley
 * nombra comité o asamblea: se traduce sólo el rótulo, nunca el dato.
 */
const ETIQUETA_CUERPO: Record<string, string> = {
  comite: "Comité",
  asamblea: "Asamblea",
}

/** El estado del presupuesto en palabras; el servidor sólo escribe estos dos. */
const ETIQUETA_ESTADO: Record<string, string> = {
  vigente: "Vigente",
  reemplazado: "Reemplazado",
}

const COLOR_ESTADO: Record<string, string> = {
  vigente: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  reemplazado: "bg-muted text-muted-foreground",
}

/**
 * El catálogo de categorías de la partida, con los mismos códigos que el esquema
 * del servidor (`CATEGORIAS_EGRESO_FI`) y el catálogo de egresos FI: el desglose
 * del presupuesto y la contabilidad mensual tienen que hablar de los mismos
 * conceptos. El `Record` sobre el tipo del esquema hace que un código nuevo o
 * uno borrado no compile.
 */
const ETIQUETA_CATEGORIA: Record<CategoriaEgresoFI, string> = {
  sueldos: "Sueldos",
  mantencion: "Mantención",
  servicios: "Servicios",
  administracion: "Administración",
  uso_de_fondo: "Uso de fondo",
  otro: "Otro",
}

/** Las categorías en el orden del esquema, para el select de cada partida. */
const CATEGORIAS_PARTIDA = Object.keys(
  ETIQUETA_CATEGORIA
) as CategoriaEgresoFI[]

/** Pesos en formato chileno, igual que el resto de las pantallas de finanzas. */
function pesos(monto: number): string {
  return `$${monto.toLocaleString("es-CL")}`
}

/** El formato del período que valida la ruta: el año, `AAAA`. */
const FORMATO_PERIODO = /^(19|20)\d{2}$/

/**
 * Filtro del acuerdo que aprueba: el mismo que exige la ruta sobre la fila real.
 * `esCuerpoDelPresupuesto` es la regla del servidor —no una copia— y el estado
 * `aprobado` es lo que habilita el alta.
 */
function apruebaPresupuesto(acuerdo: AcuerdoLeido): boolean {
  return acuerdo.estado === "aprobado" && esCuerpoDelPresupuesto(acuerdo.cuerpo)
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
 * La ruta devuelve `detalles` con el `flatten()` del esquema: los mensajes son
 * los de zod y esta pantalla los pinta sin traducirlos. Cuando el 400 no trae
 * `detalles` —el acuerdo no aprobado, por ejemplo— la lista queda vacía y el
 * `error` textual es todo lo que hay.
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

/** Los totales que acompañan a una colección paginada, para el aviso de recorte. */
interface TotalDeColeccion {
  leidos: number
  total: number
}

const SIN_TOTAL: TotalDeColeccion = { leidos: 0, total: 0 }

/** Una fila del alta. El `monto` es texto hasta que se manda: se escribe, no se calcula. */
interface FilaPartida {
  /** Clave estable de React: el índice cambia cuando se quita una fila del medio. */
  clave: number
  nombre: string
  categoria: string
  monto: string
}

/** El error del alta: el texto de la API y los motivos por campo que lo acompañan. */
interface ErrorDelAlta {
  mensaje: string
  motivos: string[]
}

/** Una fila con forma de partida: nombre, categoría y un monto que JSON pueda llevar. */
function filaCompleta(fila: FilaPartida): boolean {
  return (
    fila.nombre.trim() !== "" &&
    fila.categoria !== "" &&
    fila.monto.trim() !== "" &&
    Number.isFinite(Number(fila.monto))
  )
}

export interface ConsolaPresupuestosProps {
  /** `fi:gasto_comun` con `crear`: habilita el formulario de alta. */
  puedeCrear: boolean
}

export function ConsolaPresupuestos({ puedeCrear }: ConsolaPresupuestosProps) {
  const [presupuestos, setPresupuestos] = React.useState<PresupuestoLeido[]>([])
  const [cargando, setCargando] = React.useState(true)
  const [errorCarga, setErrorCarga] = React.useState<string | null>(null)

  const [abiertoId, setAbiertoId] = React.useState<string | null>(null)

  // Libro de acuerdos del alta. Se pide sólo si el rol puede registrar: un rol
  // que sólo audita no necesita el libro, y su lectura pide una clave propia.
  const [acuerdos, setAcuerdos] = React.useState<AcuerdoLeido[]>([])
  const [totalAcuerdos, setTotalAcuerdos] =
    React.useState<TotalDeColeccion>(SIN_TOTAL)
  const [errorAcuerdos, setErrorAcuerdos] = React.useState<string | null>(null)

  const [periodo, setPeriodo] = React.useState("")
  const [acuerdoId, setAcuerdoId] = React.useState("")
  const [filas, setFilas] = React.useState<FilaPartida[]>([
    { clave: 1, nombre: "", categoria: "", monto: "" },
  ])
  const [enviando, setEnviando] = React.useState(false)
  const [errorAlta, setErrorAlta] = React.useState<ErrorDelAlta | null>(null)
  const [exito, setExito] = React.useState<string | null>(null)
  const siguienteClave = React.useRef(2)

  const cargar = React.useCallback(async (): Promise<void> => {
    setCargando(true)
    const respuesta = await leerJson(RUTA.presupuestos)
    const lista = respuesta.cuerpo?.data

    if (!respuesta.ok) {
      setErrorCarga(respuesta.mensaje)
      setPresupuestos([])
      setCargando(false)
      return
    }
    if (!Array.isArray(lista)) {
      setErrorCarga(sinLista("presupuestos"))
      setPresupuestos([])
      setCargando(false)
      return
    }

    setErrorCarga(null)
    setPresupuestos(lista as PresupuestoLeido[])
    setCargando(false)
  }, [])

  const cargarAcuerdos = React.useCallback(async (): Promise<void> => {
    const respuesta = await leerJson(RUTA.acuerdos)
    const lista = respuesta.cuerpo?.data

    // El libro de acuerdos pide una clave propia: si el servidor la niega, ese
    // 403 se lee tal cual y no como «no hay acuerdos aprobados».
    setErrorAcuerdos(respuesta.ok ? null : respuesta.mensaje)
    const datos = Array.isArray(lista) ? (lista as AcuerdoLeido[]) : []
    setAcuerdos(respuesta.ok ? datos : [])
    setTotalAcuerdos({
      leidos: respuesta.ok ? datos.length : 0,
      total:
        respuesta.ok && typeof respuesta.cuerpo?.total === "number"
          ? respuesta.cuerpo.total
          : 0,
    })
  }, [])

  React.useEffect(() => {
    void cargar()
  }, [cargar])

  React.useEffect(() => {
    if (!puedeCrear) return
    void cargarAcuerdos()
  }, [cargarAcuerdos, puedeCrear])

  /** Una fila vacía con clave propia: la clave no se reusa al quitar filas. */
  function filaVacia(): FilaPartida {
    const clave = siguienteClave.current
    siguienteClave.current += 1
    return { clave, nombre: "", categoria: "", monto: "" }
  }

  function agregarFila(): void {
    setFilas((previas) => [...previas, filaVacia()])
  }

  function quitarFila(clave: number): void {
    setFilas((previas) => previas.filter((fila) => fila.clave !== clave))
  }

  function actualizarFila(
    clave: number,
    cambio: Partial<Pick<FilaPartida, "nombre" | "categoria" | "monto">>
  ): void {
    setFilas((previas) =>
      previas.map((fila) => (fila.clave === clave ? { ...fila, ...cambio } : fila))
    )
  }

  /**
   * La suma previa, en CENTAVOS enteros como `lib/presupuesto.ts`: sumar pesos
   * como floats deja centavos fantasma. Es una vista para el que escribe, no el
   * total del presupuesto — ese lo suman y lo congelan el servidor.
   */
  const centavosPrevios = filas.reduce((acumulado, fila) => {
    const monto = Number(fila.monto)
    return Number.isFinite(monto) ? acumulado + Math.round(monto * 100) : acumulado
  }, 0)
  const totalPrevio = centavosPrevios / 100

  const periodoValido = FORMATO_PERIODO.test(periodo)
  const formularioCompleto =
    periodoValido && acuerdoId !== "" && filas.every(filaCompleta)

  const acuerdosQueAprueban = acuerdos.filter(apruebaPresupuesto)
  const acuerdoElegido =
    acuerdos.find((acuerdo) => acuerdo.id === acuerdoId) ?? null

  // El vigente del período escrito: es el que el alta va a dejar reemplazado.
  const vigenteDelPeriodo =
    presupuestos.find(
      (presupuesto) =>
        presupuesto.periodo === periodo && presupuesto.estado === "vigente"
    ) ?? null

  async function crear(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    if (!formularioCompleto || enviando) return

    // El cuerpo es exactamente el de `PresupuestoCreacionSchema`. El cuerpo del
    // presupuesto, la versión, el estado, el total y el `orden` de cada partida
    // los decide el servidor: no viajan desde acá.
    const cuerpo: Record<string, unknown> = {
      periodo,
      acuerdoId,
      partidas: filas.map((fila) => ({
        nombre: fila.nombre.trim(),
        categoria: fila.categoria,
        monto: Number(fila.monto),
      })),
    }

    const periodoEnviado = periodo
    const totalPrevioEnviado = totalPrevio

    setEnviando(true)
    setErrorAlta(null)
    setExito(null)
    const respuesta = await enviarJson(RUTA.presupuestos, cuerpo)
    setEnviando(false)

    // Sin 2xx no se limpia ni se relee: la pantalla no declara un alta que el
    // servidor no registró.
    if (!respuesta.ok) {
      setErrorAlta({
        mensaje: respuesta.mensaje,
        motivos: motivosDeCampo(respuesta.cuerpo?.detalles),
      })
      return
    }

    const totalDelServidor = respuesta.cuerpo?.total
    const versionDelServidor = respuesta.cuerpo?.version

    if (typeof totalDelServidor === "number") {
      const version =
        typeof versionDelServidor === "number" ? versionDelServidor : null
      const registro = `Presupuesto ${periodoEnviado}${
        version === null ? "" : ` versión ${version}`
      } registrado por ${pesos(totalDelServidor)}.`
      // La suma de la pantalla es una vista previa: si no coincide con el total
      // que el servidor congeló, se muestra la diferencia en vez de taparla.
      const diferencia =
        totalDelServidor === totalPrevioEnviado
          ? ""
          : ` El total registrado es el del servidor: la suma previa de la pantalla era ${pesos(
              totalPrevioEnviado
            )} y no se persiste.`
      setExito(registro + diferencia)
    } else {
      setExito("El servidor confirmó el alta del presupuesto.")
    }

    // El formulario vuelve a su estado inicial con una fila en blanco: el alta
    // siguiente se completa desde cero y la lista vacía no queda como estado
    // normal de la pantalla.
    setPeriodo("")
    setAcuerdoId("")
    setFilas([filaVacia()])
    await cargar()
  }

  const total = presupuestos.length

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b pb-5">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <IconClipboardList className="size-7 text-primary" /> Presupuesto por
          partidas
        </h1>
        <p className="text-muted-foreground">
          El presupuesto anual de gastos comunes se aprueba por el cuerpo que
          defina el reglamento de la comunidad —comité o asamblea (Ley 21.442
          arts. 15 y 17)— y el registro COPIA ese cuerpo del acuerdo: no se
          elige acá. Las partidas y el total los congela el servidor; un
          presupuesto nuevo del mismo período reemplaza al vigente.
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
              ? "Presupuestos registrados"
              : `Presupuestos registrados (${total})`}
          </CardTitle>
          <CardDescription className="text-xs">
            Una fila por versión, con el período, el cuerpo que la aprobó según
            el acuerdo, el total congelado al registrar y su desglose de
            partidas. Las versiones anteriores no se borran: quedan
            `reemplazado`.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cargando && presupuestos.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Leyendo los presupuestos de la comunidad…
            </p>
          ) : presupuestos.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              La comunidad todavía no registró ningún presupuesto por partidas.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Período</TableHead>
                  <TableHead>Cuerpo que lo aprobó</TableHead>
                  <TableHead className="w-[100px]">Versión</TableHead>
                  <TableHead className="w-[120px]">Estado</TableHead>
                  <TableHead className="w-[130px] text-right">Total</TableHead>
                  <TableHead className="w-[140px] text-right">Partidas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {presupuestos.map((presupuesto) => {
                  const abierto = abiertoId === presupuesto.id
                  const cuerpo =
                    ETIQUETA_CUERPO[presupuesto.cuerpo] ?? presupuesto.cuerpo
                  return (
                    <React.Fragment key={presupuesto.id}>
                      <TableRow>
                        <TableCell className="font-medium">
                          {presupuesto.periodo}
                        </TableCell>
                        <TableCell>
                          <p>{cuerpo}</p>
                          {presupuesto.acuerdoFolio && (
                            <p className="text-xs text-muted-foreground">
                              {`Aprobado por ${presupuesto.acuerdoFolio}`}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{`Versión ${presupuesto.version}`}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`text-[11px] ${
                              COLOR_ESTADO[presupuesto.estado] ?? ""
                            }`}
                          >
                            {ETIQUETA_ESTADO[presupuesto.estado] ??
                              presupuesto.estado}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pesos(presupuesto.total)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-expanded={abierto}
                            onClick={() =>
                              setAbiertoId(abierto ? null : presupuesto.id)
                            }
                          >
                            {abierto ? "Ocultar partidas" : "Ver partidas"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {abierto && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/20">
                            <div
                              role="region"
                              aria-label={`Partidas del presupuesto ${presupuesto.periodo} versión ${presupuesto.version}`}
                              className="flex flex-col gap-2 py-1"
                            >
                              {presupuesto.partidas.map((partida) => (
                                <div
                                  key={partida.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-xs"
                                >
                                  <span className="font-medium">
                                    {partida.nombre}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {ETIQUETA_CATEGORIA[
                                      partida.categoria as CategoriaEgresoFI
                                    ] ?? partida.categoria}
                                  </span>
                                  <span className="tabular-nums">
                                    {pesos(partida.monto)}
                                  </span>
                                </div>
                              ))}
                              {presupuesto.partidas.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  El servidor no devolvió partidas para este
                                  presupuesto.
                                </p>
                              )}
                              <p className="border-t pt-2 text-xs font-medium tabular-nums">
                                {`Total congelado al registrar: ${pesos(
                                  presupuesto.total
                                )}`}
                              </p>
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
              Nuevo presupuesto por partidas
            </CardTitle>
            <CardDescription className="text-xs">
              El acuerdo aprobado es la autorización y la fuente del cuerpo que
              aprueba el presupuesto. El folio, la versión, el estado y el total
              los escribe el servidor.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {errorAcuerdos && (
              <p
                role="alert"
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <IconAlertTriangle className="size-4" aria-hidden="true" />
                {errorAcuerdos}
              </p>
            )}

            <form className="flex flex-col gap-4" onSubmit={(e) => void crear(e)}>
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="presupuesto-acuerdo">Acuerdo aprobado</Label>
                  <Select
                    value={acuerdoId}
                    onValueChange={(valor) => setAcuerdoId(valor)}
                  >
                    <SelectTrigger
                      id="presupuesto-acuerdo"
                      className="w-full"
                      aria-label="Acuerdo aprobado"
                    >
                      <SelectValue placeholder="Elegí el acuerdo aprobado que autoriza el presupuesto" />
                    </SelectTrigger>
                    <SelectContent>
                      {acuerdosQueAprueban.map((acuerdo) => (
                        <SelectItem key={acuerdo.id} value={acuerdo.id}>
                          {`${acuerdo.folio} · ${acuerdo.materia} · ${
                            ETIQUETA_CUERPO[acuerdo.cuerpo] ?? acuerdo.cuerpo
                          }`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Sólo los acuerdos <strong>aprobados</strong> de comité o
                    asamblea se ofrecen: el resto no habilita el presupuesto y la
                    API responde 400.
                  </p>
                  <AvisoTruncamiento
                    mostrados={totalAcuerdos.leidos}
                    total={totalAcuerdos.total}
                  />
                  {acuerdos.length > 0 && acuerdosQueAprueban.length === 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      El libro no tiene acuerdos aprobados de comité o asamblea:
                      el presupuesto los exige y no se puede registrar sin uno.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor="presupuesto-periodo">Período (AAAA)</Label>
                  <Input
                    id="presupuesto-periodo"
                    inputMode="numeric"
                    maxLength={4}
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value.trim())}
                    placeholder="2026"
                    disabled={enviando}
                  />
                  <p className="text-xs text-muted-foreground">
                    El año que el presupuesto cubre.
                  </p>
                </div>
              </div>

              {acuerdoElegido && (
                <p className="text-xs text-muted-foreground">
                  {`Cuerpo que el servidor copiará del acuerdo: ${
                    ETIQUETA_CUERPO[acuerdoElegido.cuerpo] ??
                    acuerdoElegido.cuerpo
                  }.`}
                </p>
              )}

              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Partidas</h2>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={agregarFila}
                    disabled={enviando}
                  >
                    <IconPlus className="size-4" aria-hidden="true" />
                    Agregar partida
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cada partida es un concepto del gasto común (Reglamento de la
                  Ley 21.442 art. 24). Las categorías son el mismo catálogo de
                  los egresos FI.
                </p>

                {filas.length === 0 && (
                  <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    No hay partidas cargadas: el alta viaja con la lista vacía y
                    el servidor dice qué falta.
                  </p>
                )}

                {filas.map((fila, indice) => {
                  const numero = indice + 1
                  const idNombre = `partida-nombre-${indice}`
                  const idCategoria = `partida-categoria-${indice}`
                  const idMonto = `partida-monto-${indice}`
                  const etiquetaCategoria = `Categoría de la partida ${numero}`
                  return (
                    <div
                      key={fila.clave}
                      className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_180px_150px_auto] sm:items-end"
                    >
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={idNombre}>
                          {`Nombre de la partida ${numero}`}
                        </Label>
                        <Input
                          id={idNombre}
                          value={fila.nombre}
                          onChange={(e) =>
                            actualizarFila(fila.clave, {
                              nombre: e.target.value,
                            })
                          }
                          placeholder="Remuneración de conserjería"
                          maxLength={120}
                          disabled={enviando}
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <Label htmlFor={idCategoria}>
                          {`Categoría de la partida ${numero}`}
                        </Label>
                        <Select
                          value={fila.categoria}
                          onValueChange={(valor) =>
                            actualizarFila(fila.clave, { categoria: valor })
                          }
                        >
                          <SelectTrigger
                            id={idCategoria}
                            className="w-full"
                            aria-label={etiquetaCategoria}
                          >
                            <SelectValue placeholder="Categoría" />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIAS_PARTIDA.map((categoria) => (
                              <SelectItem key={categoria} value={categoria}>
                                {ETIQUETA_CATEGORIA[categoria]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <Label htmlFor={idMonto}>
                          {`Monto de la partida ${numero}`}
                        </Label>
                        <Input
                          id={idMonto}
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={fila.monto}
                          onChange={(e) =>
                            actualizarFila(fila.clave, { monto: e.target.value })
                          }
                          placeholder="Monto en pesos"
                          disabled={enviando}
                        />
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Quitar partida ${numero}`}
                          onClick={() => quitarFila(fila.clave)}
                          disabled={enviando}
                        >
                          <IconTrash className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div
                role="status"
                className="rounded-md border bg-muted/30 px-3 py-2 text-xs leading-relaxed"
              >
                <p className="font-medium tabular-nums">
                  {`Suma de las partidas: ${pesos(totalPrevio)}`}
                </p>
                <p className="text-muted-foreground">
                  El servidor calcula y congela el total al registrar: esta suma
                  es sólo una vista previa.
                </p>
              </div>

              {periodoValido && vigenteDelPeriodo && (
                <p
                  role="status"
                  className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <IconAlertTriangle
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    {`El período ${periodo} ya tiene un presupuesto vigente (versión ${
                      vigenteDelPeriodo.version
                    }, ${pesos(
                      vigenteDelPeriodo.total
                    )}): registrarlo de nuevo lo REEMPLAZA y el servidor le asigna la versión ${
                      vigenteDelPeriodo.version + 1
                    }.`}
                  </span>
                </p>
              )}

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
                <Button
                  type="submit"
                  disabled={enviando || !formularioCompleto}
                >
                  {enviando ? (
                    <IconLoader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <IconPlus className="size-4" aria-hidden="true" />
                  )}
                  Registrar presupuesto
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
