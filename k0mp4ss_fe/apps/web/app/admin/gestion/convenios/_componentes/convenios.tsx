"use client"

/**
 * Consola de los convenios de pago (F29 · U1 del plan
 * «saldar-v2-pantallas-y-barrido», S1 y S2).
 *
 * `POST /api/convenios` y `POST /api/convenios/pago` existían y nadie podía
 * usarlos sin curl. Esta pantalla pone el registro en la cara y no decide nada
 * que sea del servidor:
 *
 *   · el LISTADO viene de `GET /api/convenios`, que acota a la comunidad de la
 *     sesión y devuelve cada convenio con sus cuotas y los totales PAGADO y
 *     PENDIENTE ya calculados sobre las cuotas (`app/api/convenios/_vista.ts`).
 *     La pantalla los pinta; no los suma: una segunda cuenta en el navegador
 *     sería una verdad paralela capaz de separarse de las filas;
 *   · el ALTA manda sólo los términos (unidad, deudor, acuerdo que lo autoriza,
 *     monto total, cuotas del saldo, primera cuota y observaciones). El folio, la
 *     fecha de suscripción, el estado `vigente`, las cuotas con sus vencimientos
 *     y los cargos FI los escribe el servidor en una transacción. La aritmética
 *     se muestra ANTES de suscribir para que el administrador vea qué va a firmar
 *     —no para persistirla— y por eso el texto dice quién calcula los montos;
 *   · el DEUDOR se DERIVA de la unidad, no se elige de una lista de personas. El
 *     convenio regulariza la deuda del PROPIETARIO VIGENTE de la unidad (Ley
 *     21.442 art. 6) y la API rechaza con 400 a quien no lo sea, así que el
 *     formulario ofrece sólo eso: elegida la unidad, pide sus propietarios
 *     vigentes a `GET /api/convenios/deudores?unidadId=` (uno solo se
 *     preselecciona; varios se ofrecen; ninguno se declara y manda a corregir el
 *     registro, sin dejar firmar). Antes había dos selects con las 100 primeras
 *     unidades y las 100 primeras personas de la comunidad: una lista ciega que
 *     permitía firmar la deuda de una unidad a nombre de quien vive en otra;
 *   · la UNIDAD se busca entre las que tienen deuda vencida
 *     (`GET /api/convenios/unidades-con-deuda?q=`), que es la única deuda que un
 *     convenio puede regularizar. El filtro `q` va al servidor: la pantalla no
 *     trae el padrón entero para filtrarlo en el navegador, y el recorte de la
 *     respuesta se declara con `AvisoTruncamiento`;
 *   · el PAGO de una cuota manda `{convenioId, numero}` y nada más: el monto, la
 *     fecha, el medio y el cierre del convenio como `saldado` los deriva el
 *     servidor de la cuota persistida (Ley 21.442 art. 6: la primera cuota se
 *     paga al suscribir);
 *   · el ACUERDO del Comité que autoriza el convenio se elige entre los
 *     `aprobado` de `cuerpo === "comite"`, que es exactamente lo que la ruta
 *     exige de la fila real; uno rechazado o de la asamblea no se ofrece porque
 *     el servidor responde 400 y un botón condenado miente sobre el estado;
 *   · los ERRORES se pintan con el texto de la API tal cual (`error`), sin
 *     traducirlos ni taparlos: el 400 de la comunidad sin fondo de gasto común
 *     donde imputar las cuotas y el 409 de la unidad que ya tiene un convenio
 *     vigente son los dos que el administrador va a encontrar, y ninguno se
 *     reescribe acá;
 *   · el ÉXITO sólo se declara después del 2xx del servidor, con los valores que
 *     devolvió la respuesta. Sin éxito no se cierra el formulario, no se limpia y
 *     no se relee: la pantalla no puede afirmar un acto que no se registró.
 *
 * Frontera deliberada: `numeroCuotas` es el número de cuotas mensuales del SALDO
 * y NO cuenta la primera cuota —que se paga al suscribir y no se genera como
 * deuda—; el label lo dice porque un «3» mal leído cambia cuánto se cobra.
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
  IconLoader2,
  IconPlus,
  IconReceipt,
} from "@tabler/icons-react"
import { AvisoTruncamiento } from "@/components/pe/aviso-truncamiento"
import { cn } from "@workspace/ui/lib/utils"

const RUTA = {
  convenios: "/api/convenios",
  pago: "/api/convenios/pago",
  // Las unidades que un convenio puede regularizar: las que tienen cobros
  // vencidos, con `q` para encontrar una en una comunidad grande.
  unidadesConDeuda: "/api/convenios/unidades-con-deuda",
  // El deudor DERIVADO de la unidad: sus propietarios vigentes.
  deudores: "/api/convenios/deudores",
  acuerdos: "/api/acuerdos",
} as const

/** Una cuota tal como la devuelve la vista del servidor. */
interface CuotaLeida {
  numero: number
  monto: number
  venceEn: string
  estado: string
  pagadaEn: string | null
  registradaPor: string | null
}

/** Un convenio tal como lo devuelve `GET /api/convenios` (vista + nombres). */
interface ConvenioLeido {
  id: string
  unidadId: string
  personaId: string
  acuerdoId: string
  montoTotal: number
  numeroCuotas: number
  fechaSuscripcion: string
  primeraCuota: number
  estado: string
  observaciones: string | null
  cuotas: CuotaLeida[]
  totales: { pagado: number; pendiente: number }
  unidadNumero: string | null
  deudorNombre: string | null
  acuerdoFolio: string | null
}

/**
 * Una unidad CON DEUDA VENCIDA, lo mínimo para ofrecerla en el buscador. La
 * deuda y los períodos los deriva el servidor con la regla del módulo FI.
 */
interface UnidadConDeuda {
  unidadId: string
  numero: string
  etiqueta: string | null
  periodosVencidos: number
  deudaVencida: number
}

/**
 * Un propietario VIGENTE de la unidad elegida: el único deudor posible del
 * convenio. `personaId` es lo que viaja en el alta como `personaId`.
 */
interface DeudorLeido {
  personaId: string
  nombreCompleto: string
  rut: string
}

/** Un acuerdo del libro, lo mínimo para elegir el que autoriza el convenio. */
interface AcuerdoLeido {
  id: string
  folio: string
  cuerpo: string
  materia: string
  estado: string
}

/** Filtro del acuerdo que autoriza: el mismo que exige la ruta sobre la fila real. */
function autorizaConvenio(acuerdo: AcuerdoLeido): boolean {
  return acuerdo.estado === "aprobado" && acuerdo.cuerpo === "comite"
}

/** El estado del convenio en palabras; el servidor sólo escribe estos dos. */
const ETIQUETA_CONVENIO: Record<string, string> = {
  vigente: "Vigente",
  saldado: "Saldado",
}

/** El estado de la cuota: nace `pendiente` y el pago la deja `pagada`. */
const ETIQUETA_CUOTA: Record<string, string> = {
  pagada: "Pagada",
  pendiente: "Pendiente",
}

const COLOR_CONVENIO: Record<string, string> = {
  vigente: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  saldado:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
}

const COLOR_CUOTA: Record<string, string> = {
  pagada:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  pendiente:
    "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
}

/** Pesos en formato chileno, igual que el resto de las pantallas de finanzas. */
function pesos(monto: number): string {
  return `$${monto.toLocaleString("es-CL")}`
}

/**
 * La fecha del vencimiento, tal como la persiste el servidor (`AAAA-MM-DD` del
 * ISO). No se reinterpreta con la zona del navegador: un vencimiento no cambia
 * de día según dónde se abra la pantalla.
 */
function fechaDe(iso: string): string {
  return iso.slice(0, 10)
}

/** El nombre de la cuota: la 0 es el pago al suscribir, no una cuota del saldo. */
function nombreDeCuota(numero: number): string {
  return numero === 0 ? "Primera cuota" : `Cuota ${numero}`
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

interface CuotaAPagar {
  convenio: ConvenioLeido
  cuota: CuotaLeida
}

export interface ConsolaConveniosProps {
  /** `fi:cobranza` con `crear`: habilita el formulario de alta. */
  puedeCrear: boolean
  /** `fi:cobranza` con `editar`: habilita registrar el pago de una cuota. */
  puedeRegistrarPago: boolean
}

export function ConsolaConvenios({
  puedeCrear,
  puedeRegistrarPago,
}: ConsolaConveniosProps) {
  const [convenios, setConvenios] = React.useState<ConvenioLeido[]>([])
  const [cargando, setCargando] = React.useState(true)
  const [errorCarga, setErrorCarga] = React.useState<string | null>(null)

  const [abiertoId, setAbiertoId] = React.useState<string | null>(null)

  const [cuotaAPagar, setCuotaAPagar] = React.useState<CuotaAPagar | null>(null)
  const [pagando, setPagando] = React.useState(false)
  const [errorPago, setErrorPago] = React.useState<string | null>(null)
  const [avisoPago, setAvisoPago] = React.useState<string | null>(null)

  // Catálogo del alta. Se pide sólo si el rol puede suscribir: un rol que sólo
  // audita no necesita el libro de acuerdos ni las unidades con deuda.
  const [acuerdos, setAcuerdos] = React.useState<AcuerdoLeido[]>([])
  const [totalAcuerdos, setTotalAcuerdos] =
    React.useState<TotalDeColeccion>(SIN_TOTAL)
  const [errorAcuerdos, setErrorAcuerdos] = React.useState<string | null>(null)

  // Buscador de unidades DEUDORAS: el `q` va al servidor, que filtra por número
  // y etiqueta y devuelve sólo las que tienen cobros vencidos.
  const [busquedaUnidad, setBusquedaUnidad] = React.useState("")
  const [unidadesConDeuda, setUnidadesConDeuda] = React.useState<
    UnidadConDeuda[]
  >([])
  const [cargandoUnidades, setCargandoUnidades] = React.useState(false)
  const [errorUnidades, setErrorUnidades] = React.useState<string | null>(null)
  const [totalUnidades, setTotalUnidades] =
    React.useState<TotalDeColeccion>(SIN_TOTAL)

  // Deudor derivado de la unidad elegida: nunca una lista de personas.
  const [deudores, setDeudores] = React.useState<DeudorLeido[]>([])
  const [cargandoDeudores, setCargandoDeudores] = React.useState(false)
  const [errorDeudores, setErrorDeudores] = React.useState<string | null>(null)
  const pedidoDeudores = React.useRef<string | null>(null)

  const [unidadId, setUnidadId] = React.useState("")
  const [personaId, setPersonaId] = React.useState("")
  const [acuerdoId, setAcuerdoId] = React.useState("")
  const [montoTotal, setMontoTotal] = React.useState("")
  const [numeroCuotas, setNumeroCuotas] = React.useState("")
  const [primeraCuota, setPrimeraCuota] = React.useState("")
  const [observaciones, setObservaciones] = React.useState("")
  const [enviandoAlta, setEnviandoAlta] = React.useState(false)
  const [errorAlta, setErrorAlta] = React.useState<string | null>(null)
  const [exitoAlta, setExitoAlta] = React.useState<string | null>(null)

  const cargar = React.useCallback(async (): Promise<void> => {
    setCargando(true)
    const respuesta = await leerJson(RUTA.convenios)
    const lista = respuesta.cuerpo?.data

    if (!respuesta.ok) {
      setErrorCarga(respuesta.mensaje)
      setConvenios([])
      setCargando(false)
      return
    }
    if (!Array.isArray(lista)) {
      setErrorCarga(sinLista("convenios"))
      setConvenios([])
      setCargando(false)
      return
    }

    setErrorCarga(null)
    setConvenios(lista as ConvenioLeido[])
    setCargando(false)
  }, [])

  const cargarAcuerdos = React.useCallback(async (): Promise<void> => {
    const acuerdosLeidos = await leerJson(RUTA.acuerdos)

    if (!acuerdosLeidos.ok) {
      setErrorAcuerdos(acuerdosLeidos.mensaje)
      setAcuerdos([])
      setTotalAcuerdos(SIN_TOTAL)
      return
    }

    const datosAcuerdos = acuerdosLeidos.cuerpo?.data
    if (!Array.isArray(datosAcuerdos)) {
      setErrorAcuerdos(sinLista("acuerdos"))
      setAcuerdos([])
      setTotalAcuerdos(SIN_TOTAL)
      return
    }

    setErrorAcuerdos(null)
    setAcuerdos(datosAcuerdos as AcuerdoLeido[])
    setTotalAcuerdos({
      leidos: datosAcuerdos.length,
      total:
        typeof acuerdosLeidos.cuerpo?.total === "number"
          ? acuerdosLeidos.cuerpo.total
          : datosAcuerdos.length,
    })
  }, [])

  React.useEffect(() => {
    void cargar()
  }, [cargar])

  React.useEffect(() => {
    if (!puedeCrear) return
    void cargarAcuerdos()
  }, [cargarAcuerdos, puedeCrear])

  /**
   * El buscador de unidades deudoras pide al SERVIDOR con su `q`: la pantalla no
   * trae el padrón entero para filtrarlo en el navegador. El retardo evita una
   * consulta por tecla y `vigente` descarta la respuesta que ya no corresponde a
   * lo que está escrito, para que una lista vieja no pise la nueva.
   */
  React.useEffect(() => {
    if (!puedeCrear) return
    let vigente = true
    const termino = busquedaUnidad.trim()

    const temporizador = setTimeout(() => {
      void (async () => {
        setCargandoUnidades(true)
        const respuesta = await leerJson(
          termino === ""
            ? RUTA.unidadesConDeuda
            : `${RUTA.unidadesConDeuda}?q=${encodeURIComponent(termino)}`
        )
        if (!vigente) return
        setCargandoUnidades(false)

        if (!respuesta.ok) {
          setErrorUnidades(respuesta.mensaje)
          setUnidadesConDeuda([])
          setTotalUnidades(SIN_TOTAL)
          return
        }
        const lista = respuesta.cuerpo?.data
        if (!Array.isArray(lista)) {
          setErrorUnidades(sinLista("unidades con deuda"))
          setUnidadesConDeuda([])
          setTotalUnidades(SIN_TOTAL)
          return
        }

        setErrorUnidades(null)
        setUnidadesConDeuda(lista as UnidadConDeuda[])
        setTotalUnidades({
          leidos: lista.length,
          total:
            typeof respuesta.cuerpo?.total === "number"
              ? respuesta.cuerpo.total
              : lista.length,
        })
      })()
    }, 250)

    return () => {
      vigente = false
      clearTimeout(temporizador)
    }
  }, [busquedaUnidad, puedeCrear])

  /**
   * Elegir la unidad DERIVA su deudor: se piden sus propietarios vigentes y, si
   * hay uno solo, se preselecciona. Cambiar de unidad limpia el deudor anterior
   * para que nadie firme en silencio la deuda de otra unidad, y una respuesta que
   * llega tarde no se aplica sobre la unidad elegida después.
   */
  async function elegirUnidad(unidadLeida: UnidadConDeuda): Promise<void> {
    if (enviandoAlta) return
    const pedido = unidadLeida.unidadId
    pedidoDeudores.current = pedido
    setUnidadId(pedido)
    setPersonaId("")
    setDeudores([])
    setErrorDeudores(null)
    setCargandoDeudores(true)

    const respuesta = await leerJson(
      `${RUTA.deudores}?unidadId=${encodeURIComponent(pedido)}`
    )
    // Otra unidad se eligió mientras esta respuesta viajaba: manda la última.
    if (pedidoDeudores.current !== pedido) return
    setCargandoDeudores(false)

    if (!respuesta.ok) {
      setErrorDeudores(respuesta.mensaje)
      return
    }
    const lista = respuesta.cuerpo?.data
    if (!Array.isArray(lista)) {
      setErrorDeudores(sinLista("propietarios vigentes de la unidad"))
      return
    }

    const leidos = lista as DeudorLeido[]
    setDeudores(leidos)
    // Un solo propietario vigente: elegirlo no agrega nada, se preselecciona.
    if (leidos.length === 1) setPersonaId(leidos[0]!.personaId)
  }

  function abrirCuota(convenio: ConvenioLeido, cuota: CuotaLeida) {
    setCuotaAPagar({ convenio, cuota })
    setErrorPago(null)
  }

  function cerrarPago() {
    if (pagando) return
    setCuotaAPagar(null)
    setErrorPago(null)
  }

  async function confirmarPago(): Promise<void> {
    if (!cuotaAPagar || pagando) return
    // El cuerpo es exactamente el de `PagoCuotaConvenioSchema`: el monto, la
    // fecha y el medio los deriva el servidor de la cuota persistida.
    const cuerpo = {
      convenioId: cuotaAPagar.convenio.id,
      numero: cuotaAPagar.cuota.numero,
    }

    setPagando(true)
    setErrorPago(null)
    setAvisoPago(null)
    const respuesta = await enviarJson(RUTA.pago, cuerpo)
    setPagando(false)

    // Sin 2xx el diálogo sigue abierto y no hay aviso: el pago no se registró.
    if (!respuesta.ok) {
      setErrorPago(respuesta.mensaje)
      return
    }

    setAvisoPago(`Pago registrado de la cuota ${cuotaAPagar.cuota.numero}.`)
    setCuotaAPagar(null)
    await cargar()
  }

  const monto = Number(montoTotal)
  const cuotas = Number(numeroCuotas)
  const primera = Number(primeraCuota)

  /**
   * Los campos completos y con forma de número. Es un guardia de FORMA —no se
   * manda un cuerpo que el esquema va a rechazar por vacío—, no una regla de
   * negocio: los bordes del convenio (cuotas ≥ 1, primera cuota ≤ total, saldo
   * repartible) los decide el servidor y su 400 se muestra tal cual.
   */
  const numerosCompletos =
    montoTotal !== "" &&
    Number.isFinite(monto) &&
    monto > 0 &&
    numeroCuotas !== "" &&
    Number.isInteger(cuotas) &&
    cuotas >= 1 &&
    primeraCuota !== "" &&
    Number.isFinite(primera) &&
    primera > 0

  const formularioCompleto =
    unidadId !== "" &&
    personaId !== "" &&
    acuerdoId !== "" &&
    numerosCompletos

  // La aritmética que el servidor aplica, en CENTAVOS enteros como
  // `lib/convenios.ts`: la última cuota absorbe el residuo del redondeo. Acá sólo
  // se muestra; nada de esto se persiste ni se envía.
  const saldoCentavos =
    Math.round(monto * 100) - Math.round(primera * 100)
  const cuotaBaseCentavos =
    numerosCompletos && saldoCentavos > 0
      ? Math.floor(saldoCentavos / cuotas)
      : 0
  const residuoCentavos =
    saldoCentavos > 0 && cuotas > 0
      ? saldoCentavos - cuotaBaseCentavos * cuotas
      : 0

  async function crear(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    if (!formularioCompleto || enviandoAlta) return

    // El cuerpo es exactamente el de `ConvenioPagoCreacionSchema`. El folio, la
    // fecha de suscripción, el estado y las cuotas los pone el servidor.
    const cuerpo: Record<string, unknown> = {
      unidadId,
      personaId,
      acuerdoId,
      montoTotal: monto,
      numeroCuotas: cuotas,
      primeraCuota: primera,
    }
    const texto = observaciones.trim()
    if (texto !== "") cuerpo.observaciones = texto

    setEnviandoAlta(true)
    setErrorAlta(null)
    setExitoAlta(null)
    const respuesta = await enviarJson(RUTA.convenios, cuerpo)
    setEnviandoAlta(false)

    // Sin 2xx no se limpia ni se relee: la pantalla no declara un alta que el
    // servidor no registró.
    if (!respuesta.ok) {
      setErrorAlta(respuesta.mensaje)
      return
    }

    const id = respuesta.cuerpo?.id
    const cuotasDelSaldo = respuesta.cuerpo?.numeroCuotas
    setExitoAlta(
      typeof id === "string" && typeof cuotasDelSaldo === "number"
        ? `Convenio ${id} suscrito con ${cuotasDelSaldo} cuota(s) del saldo: la primera cuota quedó registrada como pagada al suscribir.`
        : "El servidor confirmó el alta del convenio."
    )

    setUnidadId("")
    setPersonaId("")
    // El deudor se deriva de la unidad: sin unidad no hay deudor que ofrecer.
    setDeudores([])
    setErrorDeudores(null)
    pedidoDeudores.current = null
    // La búsqueda vuelve al principio para que la lista muestre la deuda vigente.
    setBusquedaUnidad("")
    setAcuerdoId("")
    setMontoTotal("")
    setNumeroCuotas("")
    setPrimeraCuota("")
    setObservaciones("")
    await cargar()
  }

  const acuerdosQueAutorizan = acuerdos.filter(autorizaConvenio)

  const total = convenios.length

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b pb-5">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <IconReceipt className="size-7 text-primary" /> Convenios de pago
        </h1>
        <p className="text-muted-foreground">
          El convenio regulariza la deuda de gastos comunes en cuotas mensuales
          (Ley 21.442 art. 6): la primera cuota se paga al suscribir, las demás
          mes a mes, y el acuerdo del Comité es la autorización. Las cuotas y los
          vencimientos los calcula el servidor; acá sólo se muestran.
        </p>
      </div>

      {avisoPago && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <IconCircleCheck className="size-4" aria-hidden="true" />
          {avisoPago}
        </p>
      )}

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
            {total === 0 ? "Convenios suscritos" : `Convenios suscritos (${total})`}
          </CardTitle>
          <CardDescription className="text-xs">
            Una fila por convenio con lo que informó el servidor: el deudor, el
            total, las cuotas del saldo y los totales pagado y pendiente
            calculados sobre las cuotas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cargando && convenios.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Leyendo los convenios de la comunidad…
            </p>
          ) : convenios.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              La comunidad no tiene convenios de pago suscritos.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Unidad</TableHead>
                  <TableHead>Deudor</TableHead>
                  <TableHead className="w-[110px] text-right">
                    Monto total
                  </TableHead>
                  <TableHead className="w-[110px]">Cuotas del saldo</TableHead>
                  <TableHead className="w-[110px]">Estado</TableHead>
                  <TableHead className="w-[110px] text-right">Pagado</TableHead>
                  <TableHead className="w-[110px] text-right">
                    Pendiente
                  </TableHead>
                  <TableHead className="w-[140px] text-right">Cuotas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {convenios.map((convenio) => {
                  const abierto = abiertoId === convenio.id
                  const unidad = convenio.unidadNumero ?? "—"
                  return (
                    <React.Fragment key={convenio.id}>
                      <TableRow>
                        <TableCell className="font-medium">{unidad}</TableCell>
                        <TableCell>
                          <p>{convenio.deudorNombre ?? "—"}</p>
                          {convenio.acuerdoFolio && (
                            <p className="text-xs text-muted-foreground">
                              Autorizado por {convenio.acuerdoFolio}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pesos(convenio.montoTotal)}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {`${convenio.numeroCuotas} mensuales`}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`text-[11px] ${
                              COLOR_CONVENIO[convenio.estado] ?? ""
                            }`}
                          >
                            {ETIQUETA_CONVENIO[convenio.estado] ??
                              convenio.estado}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pesos(convenio.totales.pagado)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pesos(convenio.totales.pendiente)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-expanded={abierto}
                            aria-label={`${
                              abierto ? "Ocultar" : "Ver"
                            } cuotas · unidad ${unidad}`}
                            onClick={() =>
                              setAbiertoId(abierto ? null : convenio.id)
                            }
                          >
                            {abierto ? "Ocultar cuotas" : "Ver cuotas"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {abierto && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/20">
                            <div
                              role="region"
                              aria-label={`Cuotas del convenio de la unidad ${unidad}`}
                              className="flex flex-col gap-2 py-1"
                            >
                              {convenio.cuotas.map((cuota) => (
                                <div
                                  key={cuota.numero}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-xs"
                                >
                                  <span className="font-medium">
                                    {nombreDeCuota(cuota.numero)}
                                  </span>
                                  <span className="tabular-nums">
                                    {pesos(cuota.monto)}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {`Vence el ${fechaDe(cuota.venceEn)}`}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className={`text-[11px] ${
                                      COLOR_CUOTA[cuota.estado] ?? ""
                                    }`}
                                  >
                                    {ETIQUETA_CUOTA[cuota.estado] ?? cuota.estado}
                                  </Badge>
                                  {cuota.estado !== "pagada" &&
                                    puedeRegistrarPago && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          abrirCuota(convenio, cuota)
                                        }
                                      >
                                        {`Registrar pago de la cuota ${cuota.numero}`}
                                      </Button>
                                    )}
                                </div>
                              ))}
                              {convenio.cuotas.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  El servidor no devolvió cuotas para este
                                  convenio.
                                </p>
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
            <CardTitle className="text-sm">Nuevo convenio de pago</CardTitle>
            <CardDescription className="text-xs">
              El acuerdo del Comité es obligatorio (Ley 21.442 art. 6) y la
              primera cuota se paga al suscribir. El folio, la fecha y las cuotas
              con sus vencimientos los escribe el servidor.
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="convenio-unidad-buscar">Unidad deudora</Label>
                  <Input
                    id="convenio-unidad-buscar"
                    value={busquedaUnidad}
                    onChange={(e) => setBusquedaUnidad(e.target.value)}
                    placeholder="Buscá por número o etiqueta (101, Depto…)"
                    disabled={enviandoAlta}
                  />
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    {cargandoUnidades && unidadesConDeuda.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-muted-foreground">
                        Buscando las unidades con deuda…
                      </p>
                    ) : errorUnidades ? (
                      <p
                        role="alert"
                        className="px-2 py-2 text-xs text-destructive"
                      >
                        {errorUnidades}
                      </p>
                    ) : unidadesConDeuda.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-muted-foreground">
                        {busquedaUnidad.trim() === ""
                          ? "La comunidad no tiene unidades con cobros vencidos: no hay deuda que convenir."
                          : "Ninguna unidad con deuda coincide con la búsqueda."}
                      </p>
                    ) : (
                      <ul aria-label="Unidades con deuda" className="divide-y">
                        {unidadesConDeuda.map((unidadLeida) => {
                          const elegida = unidadLeida.unidadId === unidadId
                          return (
                            <li key={unidadLeida.unidadId}>
                              <button
                                type="button"
                                aria-pressed={elegida}
                                onClick={() => void elegirUnidad(unidadLeida)}
                                className={cn(
                                  "flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60",
                                  elegida && "bg-muted"
                                )}
                              >
                                <span className="font-medium">
                                  {unidadLeida.etiqueta
                                    ? `${unidadLeida.numero} · ${unidadLeida.etiqueta}`
                                    : unidadLeida.numero}
                                </span>
                                <span className="text-muted-foreground tabular-nums">
                                  {`${unidadLeida.periodosVencidos} período(s) vencidos · ${pesos(
                                    unidadLeida.deudaVencida
                                  )}`}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                  <AvisoTruncamiento
                    mostrados={totalUnidades.leidos}
                    total={totalUnidades.total}
                  />
                  <p className="text-xs text-muted-foreground">
                    Sólo se ofrecen las unidades con cobros vencidos: la deuda la
                    deriva el servidor de los cargos del módulo FI.
                  </p>
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor="convenio-deudor">Deudor</Label>
                  {unidadId === "" ? (
                    <p className="text-xs text-muted-foreground">
                      Elegí primero la unidad: el deudor del convenio es su
                      propietario vigente.
                    </p>
                  ) : cargandoDeudores ? (
                    <p className="text-xs text-muted-foreground">
                      Leyendo los propietarios vigentes de la unidad…
                    </p>
                  ) : errorDeudores ? (
                    <p role="alert" className="text-sm text-destructive">
                      {errorDeudores}
                    </p>
                  ) : deudores.length === 0 ? (
                    <p role="alert" className="text-sm text-destructive">
                      La unidad no tiene propietario vigente en el registro: la
                      administración tiene que corregir el vínculo de la unidad
                      antes de suscribir el convenio.
                    </p>
                  ) : (
                    <>
                      <Select value={personaId} onValueChange={setPersonaId}>
                        <SelectTrigger id="convenio-deudor" className="w-full">
                          <SelectValue placeholder="Elegí al copropietario deudor" />
                        </SelectTrigger>
                        <SelectContent>
                          {deudores.map((deudor) => (
                            <SelectItem
                              key={deudor.personaId}
                              value={deudor.personaId}
                            >
                              {`${deudor.nombreCompleto} · ${deudor.rut}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {deudores.length === 1
                          ? "Es el único propietario vigente de la unidad y queda preseleccionado."
                          : `La unidad tiene ${deudores.length} propietarios vigentes: elegí el que firma el convenio.`}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="convenio-acuerdo">Acuerdo del Comité</Label>
                <Select
                  value={acuerdoId}
                  onValueChange={(valor) => setAcuerdoId(valor)}
                >
                  <SelectTrigger id="convenio-acuerdo" className="w-full">
                    <SelectValue placeholder="Elegí el acuerdo aprobado que autoriza el convenio" />
                  </SelectTrigger>
                  <SelectContent>
                    {acuerdosQueAutorizan.map((acuerdo) => (
                      <SelectItem key={acuerdo.id} value={acuerdo.id}>
                        {`${acuerdo.folio} · ${acuerdo.materia}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Sólo los acuerdos <strong>aprobados</strong> del Comité
                  autorizan el convenio: los de la asamblea y los no aprobados no
                  se ofrecen porque la API responde 400.
                </p>
                <AvisoTruncamiento
                  mostrados={totalAcuerdos.leidos}
                  total={totalAcuerdos.total}
                />
                {acuerdos.length > 0 && acuerdosQueAutorizan.length === 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    El libro no tiene acuerdos aprobados del Comité: el convenio
                    los exige y no se puede suscribir sin uno.
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="convenio-monto-total">Monto total</Label>
                  <Input
                    id="convenio-monto-total"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={montoTotal}
                    onChange={(e) => setMontoTotal(e.target.value)}
                    placeholder="Deuda que el convenio regulariza"
                    disabled={enviandoAlta}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor="convenio-cuotas">
                    Cuotas mensuales del saldo
                  </Label>
                  <Input
                    id="convenio-cuotas"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={numeroCuotas}
                    onChange={(e) => setNumeroCuotas(e.target.value)}
                    placeholder="No cuenta la primera cuota"
                    disabled={enviandoAlta}
                  />
                  <p className="text-xs text-muted-foreground">
                    No cuenta la primera cuota, que se paga al suscribir.
                  </p>
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor="convenio-primera-cuota">Primera cuota</Label>
                  <Input
                    id="convenio-primera-cuota"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={primeraCuota}
                    onChange={(e) => setPrimeraCuota(e.target.value)}
                    placeholder="Se registra pagada al suscribir"
                    disabled={enviandoAlta}
                  />
                </div>
              </div>

              {numerosCompletos && saldoCentavos > 0 && (
                <div
                  role="status"
                  className="rounded-md border bg-muted/30 px-3 py-2 text-xs leading-relaxed"
                >
                  <p>
                    {`Primera cuota ${pesos(primera)} al suscribir, registrada pagada. El saldo de ${pesos(
                      saldoCentavos / 100
                    )} se reparte en ${cuotas} cuotas mensuales: ${pesos(
                      cuotaBaseCentavos / 100
                    )} cada una${
                      residuoCentavos > 0
                        ? ` y la última ${pesos(
                            (cuotaBaseCentavos + residuoCentavos) / 100
                          )}`
                        : ""
                    }.`}
                  </p>
                  <p className="text-muted-foreground">
                    Los montos y los vencimientos los calcula el servidor: esta
                    cuenta es la que va a aplicar, no un dato que la pantalla
                    guarde.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <Label htmlFor="convenio-observaciones">Observaciones</Label>
                <Input
                  id="convenio-observaciones"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Cómo se acordó el convenio (opcional)"
                  maxLength={500}
                  disabled={enviandoAlta}
                />
                <p className="text-xs text-muted-foreground">
                  Opcional, hasta 500 caracteres. Queda registrado con la fecha y
                  el usuario de la sesión.
                </p>
              </div>

              {errorAlta && (
                <p
                  role="alert"
                  className="flex items-center gap-2 text-sm text-destructive"
                >
                  <IconAlertTriangle className="size-4" aria-hidden="true" />
                  {errorAlta}
                </p>
              )}

              {exitoAlta && (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <IconCircleCheck className="size-4" aria-hidden="true" />
                  {exitoAlta}
                </p>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={enviandoAlta || !formularioCompleto}>
                  {enviandoAlta ? (
                    <IconLoader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <IconPlus className="size-4" aria-hidden="true" />
                  )}
                  Suscribir convenio
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={cuotaAPagar !== null}
        onOpenChange={(abierto) => {
          if (!abierto) cerrarPago()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {cuotaAPagar
                ? `Registrar el pago de la ${nombreDeCuota(
                    cuotaAPagar.cuota.numero
                  ).toLowerCase()}`
                : "Registrar el pago de la cuota"}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              {cuotaAPagar &&
                `Unidad ${
                  cuotaAPagar.convenio.unidadNumero ?? "—"
                }: ${pesos(cuotaAPagar.cuota.monto)} con vencimiento el ${fechaDe(
                  cuotaAPagar.cuota.venceEn
                )}. El pago queda en el cargo FI de la cuota y, si era la última pendiente, el convenio se cierra como saldado. La fecha y el usuario los pone el servidor.`}
            </DialogDescription>
          </DialogHeader>

          {errorPago && (
            <p
              role="alert"
              className="flex items-center gap-2 text-sm text-destructive"
            >
              <IconAlertTriangle className="size-4" aria-hidden="true" />
              {errorPago}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={cerrarPago}
              disabled={pagando}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void confirmarPago()}
              disabled={pagando}
            >
              {pagando && (
                <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Registrar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
