"use client"

/**
 * Consola del registro de acuerdos de gobernanza (U3b · F28/F29/F31).
 *
 * Las rutas del registro existían desde U3a —alta del acuerdo y voto inmutable—
 * y no había cómo leerlas: el registro solo se usaba por curl. Esta pantalla
 * pone el libro en la cara y no decide nada que sea del servidor:
 *
 *   · la LECTURA viene de `GET /api/acuerdos`, que acota a la comunidad de la
 *     sesión y recomputa el resultado con `resultadoDelAcuerdo`. La pantalla no
 *     suma votos ni mide mayorías: muestra los totales y el motivo que devolvió
 *     el servidor, y después de cada acto vuelve a leer porque el veredicto es
 *     del servidor;
 *   · los conteos se leen en DERECHOS cuando el cuerpo es la asamblea (ahí el
 *     voto se pondera por prorrateo, art. 15) y en VOTOS cuando es el comité (un
 *     voto por miembro, art. 17): el mismo número significa cosas distintas según
 *     el cuerpo y decir «votos» en la asamblea sería falso;
 *   · el VOTO PROPIO se ofrece mientras el acuerdo está `abierto` y manda
 *     EXCLUSIVAMENTE la decisión: quién puede votar, con qué peso y cuál es el
 *     resultado lo deriva el servidor de la sesión y de los vínculos. No hay
 *     elegibilidad calculada en el navegador —un duplicado de la regla del
 *     servidor sería una segunda verdad capaz de divergir— y por eso un 403/409
 *     se muestra con el texto de la API tal cual;
 *   · el ALTA manda cuerpo, materia y regla de quórum; el folio, la fecha, el
 *     estado inicial y quién lo registra los pone el servidor. Las cuatro reglas
 *     se ofrecen con su nombre legal y su ayuda, y sólo las que el cuerpo admite
 *     (`AcuerdoSchema` rechaza la combinación incoherente): la pantalla no
 *     inventa quórums ni deja elegir uno que la API va a rechazar.
 *   · el ALTA declara la MODALIDAD (T3): `presencial` se cierra con el resultado
 *     proclamado y su acta firmada; `electronica` es el default de la base y el
 *     cuerpo del alta no la manda, para que el camino electrónico quede byte a
 *     byte igual que hoy (S4).
 *   · el CIERRE PRESENCIAL (T3 · S1/S2/S5) manda el resultado tal como la sala
 *     lo proclamó (a favor, en contra, abstenciones, presentes y el quórum) y
 *     deja los papeles en el archivo legal por su propia ruta. El botón de
 *     cierre no se habilita sin el acta firmada archivada —leída de la fila del
 *     servidor, no del click— y un 409 se muestra verbatim, sin relectura.
 *
 * Frontera deliberada: el quórum de ASISTENCIA de la asamblea (para que sesione)
 * es un requisito de la sesión y lo prueba el acta, no este registro; acá se
 * computan los votos emitidos sobre el acuerdo.
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
  IconFileText,
  IconGavel,
  IconLoader2,
  IconPlus,
} from "@tabler/icons-react"
import { ESTADO_ACUERDO_ABIERTO } from "@/lib/schemas"

const RUTA = {
  listado: "/api/acuerdos",
  actas: "/api/actas-gd",
} as const

/** La ruta del voto de un acuerdo concreto (un voto por persona, inmutable). */
const rutaVoto = (id: string): string => `${RUTA.listado}/${id}/voto`

/** La ruta del cierre presencial (`POST /api/acuerdos/[id]`): lo proclamado. */
const rutaCierre = (id: string): string => `${RUTA.listado}/${id}`

/** La ruta de los papeles firmados del acuerdo (acta, asistencia, poderes). */
const rutaDocumento = (id: string): string => `${RUTA.listado}/${id}/documento`

/**
 * Mínimo de la materia: es el `min(5)` de `AcuerdoSchema`. La pantalla no deja
 * mandar un cuerpo que el servidor va a rechazar; el servidor igual re-valida.
 */
const MINIMO_MATERIA = 5

/** Un voto tal como lo devuelve `GET /api/acuerdos`. */
interface VotoLeido {
  personaId: string
  /** Nombre de quien votó; `null` si la ficha ya no está en el maestro. */
  nombre: string | null
  decision: string
  peso: number
  unidadId: string | null
  fecha: string
}

/** El cómputo que derivó el servidor con `resultadoDelAcuerdo`. */
interface ResultadoLeido {
  resultado: string
  aFavor: number
  enContra: number
  abstenciones: number
  motivo: string
}

/** El resultado proclamado en la sala, tal como lo archivó el servidor (S2). */
interface ProclamadoLeido {
  aFavor: number
  enContra: number
  abstenciones: number
  presentes: number
  quorumAlcanzado: boolean
}

/** Un acta del libro (`GET /api/actas-gd`): lo que el cierre necesita saber. */
interface ActaLeida {
  id: string
  folio: string | null
  estado: string
  fecha: string
}

/** Una fila del registro: el acuerdo con sus votos y su resultado derivado. */
interface AcuerdoLeido {
  id: string
  folio: string
  cuerpo: string
  materia: string
  estado: string
  quorumRequerido: string
  fecha: string
  resueltoEn: string | null
  actaId: string | null
  modalidad: string | null
  actaDocumentoId: string | null
  asistenciaDocumentoId: string | null
  poderesDocumentoId: string | null
  proclamado: ProclamadoLeido | null
  derechosTotales: number
  resultado: ResultadoLeido
  votos: VotoLeido[]
}

type Cuerpo = "comite" | "asamblea"

const ETIQUETA_CUERPO: Record<string, string> = {
  comite: "Comité",
  asamblea: "Asamblea",
}

const ETIQUETA_ESTADO: Record<string, string> = {
  abierto: "Abierto",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
}

const COLOR_ESTADO: Record<string, string> = {
  abierto: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  aprobado:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  rechazado: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
}

const ETIQUETA_DECISION: Record<string, string> = {
  a_favor: "A favor",
  en_contra: "En contra",
  abstencion: "Abstención",
}

const ETIQUETA_MODALIDAD: Record<string, string> = {
  electronica: "Electrónica",
  presencial: "Presencial",
}

/** Los papeles firmados que recibe el archivo legal (S3); el acta es obligatoria. */
type PapelDelAcuerdo = "acta" | "asistencia" | "poderes"

const ETIQUETA_PAPEL: Record<PapelDelAcuerdo, string> = {
  acta: "Acta firmada",
  asistencia: "Lista de asistencia",
  poderes: "Poderes acreditados",
}

/** Las tres decisiones, con el nombre del botón que las emite. */
const DECISIONES = [
  { clave: "a_favor", etiqueta: "A favor", etiquetaVoto: "Votar a favor" },
  { clave: "en_contra", etiqueta: "En contra", etiquetaVoto: "Votar en contra" },
  { clave: "abstencion", etiqueta: "Abstención", etiquetaVoto: "Abstenerse" },
] as const

/**
 * Las cuatro reglas declarables, con su nombre legal y su ayuda. No se inventan
 * umbrales: el texto describe lo que `lib/acuerdos.ts` computa y la ley fija
 * (Ley 21.442 art. 15 y 17).
 */
const REGLAS: Record<
  string,
  { etiqueta: string; ayuda: string; cuerpo: Cuerpo }
> = {
  un_voto_por_miembro: {
    etiqueta: "Un voto por miembro",
    ayuda:
      "Comité. Cada miembro vale un voto y se exige mayoría de los votos emitidos (Ley 21.442 art. 17): es la única regla de un acuerdo del comité.",
    cuerpo: "comite",
  },
  mayoria_absoluta_presentes: {
    etiqueta: "Mayoría absoluta de los derechos presentes",
    ayuda:
      "Asamblea ordinaria. Exige más de la mitad de los derechos presentes en la sesión (Ley 21.442 art. 15): cuenta lo emitido en la sesión, no los derechos de toda la comunidad.",
    cuerpo: "asamblea",
  },
  mayoria_absoluta_derechos: {
    etiqueta: "Mayoría absoluta de los derechos de la comunidad",
    ayuda:
      "Asamblea extraordinaria. Exige más de la mitad de los derechos de toda la comunidad, aunque la sesión se haya constituido con el quórum de asistencia.",
    cuerpo: "asamblea",
  },
  mayoria_reforzada_derechos: {
    etiqueta: "Mayoría reforzada de los derechos de la comunidad",
    ayuda:
      "Asamblea extraordinaria reforzada. Exige al menos el 66% de los derechos de la comunidad (Ley 21.442 art. 15, tabla MINVU).",
    cuerpo: "asamblea",
  },
}

/** Las reglas que un cuerpo admite, en el orden en que se ofrecen. */
const REGLAS_POR_CUERPO: Record<Cuerpo, readonly string[]> = {
  comite: ["un_voto_por_miembro"],
  asamblea: [
    "mayoria_absoluta_presentes",
    "mayoria_absoluta_derechos",
    "mayoria_reforzada_derechos",
  ],
}

/** Número legible en español: hasta 4 decimales y coma decimal. */
function numero(valor: number): string {
  if (!Number.isFinite(valor)) return "0"
  return String(Number(valor.toFixed(4))).replace(".", ",")
}

/** Fecha en el formato del libro (AAAA-MM-DD): la hora no la lee nadie acá. */
function fechaCorta(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—"
}

/**
 * El papel firmado se SUBE (nunca por URL): el escaneo se lee en el navegador y
 * viaja en base64 dentro del JSON, que es lo que la ruta del archivo legal
 * espera. Que sea un PDF lo verifica el servidor mirando los BYTES: duplicar
 * acá la regla sería una segunda verdad capaz de divergir.
 */
function leerArchivoComoBase64(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => {
      const resultado = String(lector.result ?? "")
      const coma = resultado.indexOf(",")
      resolver(coma >= 0 ? resultado.slice(coma + 1) : resultado)
    }
    lector.onerror = () => rechazar(new Error("No se pudo leer el archivo."))
    lector.readAsDataURL(archivo)
  })
}

/** Los cuatro conteos proclamados: números finitos y no negativos, o nada. */
function numerosCompletos(valores: string[]): boolean {
  return valores.every((valor) => {
    const recortado = valor.trim()
    if (recortado === "") return false
    const numero = Number(recortado)
    return Number.isFinite(numero) && numero >= 0
  })
}

/**
 * Si el acta firmada está archivada lo dice la fila del servidor
 * (`actaDocumentoId`): la pantalla no pinta «archivada» porque una subida salió
 * bien — la relee. El acuerdo electrónico no lleva papeles.
 */
function notaActa(acuerdo: AcuerdoLeido): string | null {
  if (acuerdo.modalidad !== "presencial") return null
  if (acuerdo.actaDocumentoId) {
    return "El acta firmada está archivada en el archivo legal."
  }
  return acuerdo.estado === ESTADO_ACUERDO_ABIERTO
    ? "El acta firmada no está en el archivo legal: se sube al cerrar el acuerdo."
    : "El acta firmada no está en el archivo legal."
}

/** ¿El acuerdo ya archivó ESTE papel? (cada papel se sube una sola vez). */
function papelArchivado(acuerdo: AcuerdoLeido, papel: PapelDelAcuerdo): boolean {
  if (papel === "acta") return acuerdo.actaDocumentoId != null
  if (papel === "asistencia") return acuerdo.asistenciaDocumentoId != null
  return acuerdo.poderesDocumentoId != null
}

/**
 * Los conteos de un acuerdo, en la unidad en la que se votó. En la asamblea los
 * números son DERECHOS (prorrateo) y en el comité son VOTOS (un voto por
 * miembro): decir «votos» en la asamblea haría leer 60 como sesenta manos.
 */
function textoDeConteos(acuerdo: AcuerdoLeido): string {
  const unidad = acuerdo.cuerpo === "asamblea" ? "derechos" : "votos"
  const { aFavor, enContra, abstenciones } = acuerdo.resultado
  return `A favor: ${numero(aFavor)} ${unidad} · En contra: ${numero(enContra)} ${unidad} · Abstenciones: ${numero(abstenciones)} ${unidad}`
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

/** Manda un cuerpo JSON a una ruta con el método indicado. */
function enviarJson(
  url: string,
  method: "POST",
  cuerpo: Record<string, unknown>
): Promise<RespuestaLeida> {
  return leerJson(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  })
}

/** Un error de una acción, atado al acuerdo que lo produjo. */
interface ErrorDeAccion {
  acuerdoId: string
  mensaje: string
}

export interface ConsolaAcuerdosProps {
  /**
   * `gd` con `crear` en la sesión: el permiso del alta. La lectura ya la autorizó
   * el `page.tsx` con `gd` ver, que es el portón de esta pantalla.
   */
  puedeRegistrar: boolean
}

export function ConsolaAcuerdos({ puedeRegistrar }: ConsolaAcuerdosProps) {
  const [acuerdos, setAcuerdos] = React.useState<AcuerdoLeido[]>([])
  const [total, setTotal] = React.useState(0)
  const [limite, setLimite] = React.useState<number | null>(null)
  const [cargando, setCargando] = React.useState(true)
  const [errorCarga, setErrorCarga] = React.useState<string | null>(null)

  const [abiertos, setAbiertos] = React.useState<Record<string, boolean>>({})
  const [votando, setVotando] = React.useState<string | null>(null)
  const [errorVoto, setErrorVoto] = React.useState<ErrorDeAccion | null>(null)

  const [altaAbierta, setAltaAbierta] = React.useState(false)
  const [cuerpo, setCuerpo] = React.useState<Cuerpo>("comite")
  const [regla, setRegla] = React.useState<string>(
    REGLAS_POR_CUERPO.comite[0]!
  )
  const [modalidadAlta, setModalidadAlta] = React.useState<
    "electronica" | "presencial"
  >("electronica")
  const [materia, setMateria] = React.useState("")
  const [enviandoAlta, setEnviandoAlta] = React.useState(false)
  const [errorAlta, setErrorAlta] = React.useState<string | null>(null)

  // ── Cierre presencial (T3 · S1/S2/S5) ───────────────────────────────────────
  const [cierreDe, setCierreDe] = React.useState<string | null>(null)
  const [aFavor, setAFavor] = React.useState("")
  const [enContra, setEnContra] = React.useState("")
  const [abstenciones, setAbstenciones] = React.useState("")
  const [presentes, setPresentes] = React.useState("")
  const [quorumProclamado, setQuorumProclamado] = React.useState(false)
  const [actaLibroId, setActaLibroId] = React.useState("")
  /** El libro de actas leído al abrir el diálogo; `null` mientras llega. */
  const [actas, setActas] = React.useState<ActaLeida[] | null>(null)
  const [errorActas, setErrorActas] = React.useState<string | null>(null)
  const [archivoPapel, setArchivoPapel] = React.useState<
    Record<PapelDelAcuerdo, File | null>
  >({ acta: null, asistencia: null, poderes: null })
  const [subiendoPapel, setSubiendoPapel] = React.useState<PapelDelAcuerdo | null>(null)
  const [errorPapel, setErrorPapel] = React.useState<ErrorDeAccion | null>(null)
  const [cerrando, setCerrando] = React.useState(false)
  const [errorCierre, setErrorCierre] = React.useState<string | null>(null)

  const cargar = React.useCallback(async (): Promise<void> => {
    setCargando(true)
    const respuesta = await leerJson(RUTA.listado)
    const lista = respuesta.cuerpo?.data

    if (!respuesta.ok) {
      setErrorCarga(respuesta.mensaje)
      setAcuerdos([])
      setTotal(0)
      setLimite(null)
      setCargando(false)
      return
    }
    if (!Array.isArray(lista)) {
      setErrorCarga(
        "La respuesta del servidor no trae el registro de acuerdos: no se puede mostrar el libro."
      )
      setAcuerdos([])
      setTotal(0)
      setLimite(null)
      setCargando(false)
      return
    }

    const totalRecibido = respuesta.cuerpo?.total
    const limiteRecibido = respuesta.cuerpo?.limite
    setErrorCarga(null)
    setAcuerdos(lista as AcuerdoLeido[])
    setTotal(typeof totalRecibido === "number" ? totalRecibido : lista.length)
    setLimite(typeof limiteRecibido === "number" ? limiteRecibido : null)
    setCargando(false)
  }, [])

  React.useEffect(() => {
    void cargar()
  }, [cargar])

  function alternarDetalle(id: string) {
    setAbiertos((previo) => ({ ...previo, [id]: !previo[id] }))
  }

  async function votar(acuerdo: AcuerdoLeido, decision: string): Promise<void> {
    if (votando) return
    setVotando(acuerdo.id)
    setErrorVoto(null)
    // El cuerpo lleva SÓLO la decisión: quién vota, con qué peso y sobre qué
    // acuerdo los resuelve el servidor desde la sesión y la base.
    const respuesta = await enviarJson(rutaVoto(acuerdo.id), "POST", { decision })
    setVotando(null)

    // Sin éxito no se relee: la pantalla no puede declarar un acto que el
    // servidor no registró. El mensaje es el de la API, tal cual.
    if (!respuesta.ok) {
      setErrorVoto({ acuerdoId: acuerdo.id, mensaje: respuesta.mensaje })
      return
    }
    await cargar()
  }

  function abrirAlta() {
    setCuerpo("comite")
    setRegla(REGLAS_POR_CUERPO.comite[0]!)
    setModalidadAlta("electronica")
    setMateria("")
    setErrorAlta(null)
    setAltaAbierta(true)
  }

  function cerrarAlta() {
    if (enviandoAlta) return
    setAltaAbierta(false)
    setErrorAlta(null)
  }

  function cambiarCuerpo(nuevo: Cuerpo) {
    setCuerpo(nuevo)
    // La regla y el cuerpo no son independientes (`AcuerdoSchema`): al cambiar de
    // cuerpo se elige la primera regla que ese cuerpo admite, nunca una vieja.
    setRegla(REGLAS_POR_CUERPO[nuevo][0]!)
  }

  const materiaRecortada = materia.trim()
  const materiaCompleta = materiaRecortada.length >= MINIMO_MATERIA

  async function registrarAcuerdo(): Promise<void> {
    if (!materiaCompleta || enviandoAlta) return
    setEnviandoAlta(true)
    setErrorAlta(null)
    const respuesta = await enviarJson(RUTA.listado, "POST", {
      cuerpo,
      materia: materiaRecortada,
      quorumRequerido: regla,
      // La modalidad PRESENCIAL se declara; la electrónica NO viaja: la columna
      // nace electrónica por default en la base y el cuerpo del alta queda byte
      // a byte igual que hoy (S4 — el camino electrónico no cambia).
      ...(modalidadAlta === "presencial" ? { modalidad: "presencial" as const } : {}),
    })
    setEnviandoAlta(false)

    if (!respuesta.ok) {
      setErrorAlta(respuesta.mensaje)
      return
    }
    setAltaAbierta(false)
    setMateria("")
    // El folio y la fecha los puso el servidor: se relee para verlos.
    await cargar()
  }

  /** El acuerdo del diálogo de cierre, re-leído del servidor en cada render. */
  const acuerdoCierre = cierreDe
    ? (acuerdos.find((acuerdo) => acuerdo.id === cierreDe) ?? null)
    : null
  const actasPublicadas = (actas ?? []).filter(
    (acta) => acta.estado === "publicada" && !!acta.folio
  )
  const conteosCompletos = numerosCompletos([
    aFavor,
    enContra,
    abstenciones,
    presentes,
  ])
  // El botón de cierre no se habilita sin el acta (S1): los cuatro conteos, el
  // acta firmada archivada —leída de la fila del servidor— y el acta del libro
  // cuando el acuerdo no la declara. La pantalla no ofrece lo que el servidor
  // va a rechazar.
  const puedeCerrar =
    acuerdoCierre !== null &&
    conteosCompletos &&
    acuerdoCierre.actaDocumentoId != null &&
    (acuerdoCierre.actaId != null || actaLibroId !== "")
  const actaDeclaradaDelCierre =
    acuerdoCierre?.actaId && actas
      ? (actas.find((acta) => acta.id === acuerdoCierre.actaId) ?? null)
      : null

  async function abrirCierre(acuerdo: AcuerdoLeido): Promise<void> {
    setCierreDe(acuerdo.id)
    setAFavor("")
    setEnContra("")
    setAbstenciones("")
    setPresentes("")
    setQuorumProclamado(false)
    setActaLibroId("")
    setArchivoPapel({ acta: null, asistencia: null, poderes: null })
    setErrorPapel(null)
    setErrorCierre(null)
    setErrorActas(null)
    // El libro de actas se lee del servidor: el selector ofrece sólo las
    // publicadas con folio, que es lo único que el cierre acepta. El flujo
    // borrador → publicada → cerrar se recorre con la consola del libro.
    const respuesta = await leerJson(`${RUTA.actas}?pageSize=100`)
    if (!respuesta.ok) {
      setErrorActas(respuesta.mensaje)
      setActas([])
      return
    }
    const lista = respuesta.cuerpo?.data
    setActas(Array.isArray(lista) ? (lista as ActaLeida[]) : [])
  }

  function cancelarCierre() {
    if (cerrando || subiendoPapel) return
    setCierreDe(null)
    setErrorCierre(null)
    setErrorPapel(null)
  }

  async function subirPapel(
    acuerdo: AcuerdoLeido,
    papel: PapelDelAcuerdo
  ): Promise<void> {
    const archivo = archivoPapel[papel]
    if (!archivo || subiendoPapel) return
    setSubiendoPapel(papel)
    setErrorPapel(null)
    let contenidoBase64: string
    try {
      contenidoBase64 = await leerArchivoComoBase64(archivo)
    } catch {
      setSubiendoPapel(null)
      setErrorPapel({
        acuerdoId: acuerdo.id,
        mensaje: "No se pudo leer el archivo en el navegador.",
      })
      return
    }
    const respuesta = await enviarJson(rutaDocumento(acuerdo.id), "POST", {
      tipo: papel,
      nombreArchivo: archivo.name,
      contenidoBase64,
    })
    setSubiendoPapel(null)
    // Sin éxito no hay «archivado»: el error de la API se muestra tal cual y
    // nada cambia (la firma no se reemplaza).
    if (!respuesta.ok) {
      setErrorPapel({ acuerdoId: acuerdo.id, mensaje: respuesta.mensaje })
      return
    }
    // La pantalla RELEE: «archivada» lo dice la fila que devuelve el servidor,
    // no el click que salió bien.
    await cargar()
  }

  async function cerrarPresencial(acuerdo: AcuerdoLeido): Promise<void> {
    if (cerrando) return
    // Sin los cuatro números no se envía nada: declarar 0 porque el campo quedó
    // vacío sería registrar lo que la sala no proclamó. El botón ya está
    // deshabilitado; el envío forzado con números incompletos no viaja.
    if (!conteosCompletos) return
    setCerrando(true)
    setErrorCierre(null)
    const cuerpo: Record<string, unknown> = {
      resultado: {
        aFavor: Number(aFavor),
        enContra: Number(enContra),
        abstenciones: Number(abstenciones),
        presentes: Number(presentes),
        quorumAlcanzado: quorumProclamado,
      },
    }
    // El acta del libro viaja sólo si el acuerdo no la declara: la demás la
    // resuelve el servidor con la fila que ya tiene.
    if (actaLibroId) cuerpo.actaId = actaLibroId
    const respuesta = await enviarJson(rutaCierre(acuerdo.id), "POST", cuerpo)
    setCerrando(false)
    // El 409 es del servidor y se muestra verbatim: sin relectura ni éxito
    // declarado (S5 — lo cerrado no se reescribe).
    if (!respuesta.ok) {
      setErrorCierre(respuesta.mensaje)
      return
    }
    setCierreDe(null)
    // El estado nuevo lo dice el servidor: la fila se relee.
    await cargar()
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2 border-b pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              <IconGavel className="size-7 text-primary" /> Registro de Acuerdos
            </h1>
            <p className="text-muted-foreground">
              Los acuerdos del comité y de la asamblea, con sus votos inmutables.
              El resultado lo deriva el servidor de los votos emitidos: la
              pantalla no mide mayorías.
            </p>
          </div>
          {puedeRegistrar && (
            <Button
              type="button"
              onClick={abrirAlta}
              title="Registra un acuerdo del comité o de la asamblea: el folio del libro y la fecha los asigna el servidor."
            >
              <IconPlus className="size-4" aria-hidden="true" /> Nuevo acuerdo
            </Button>
          )}
        </div>
        <p role="status" className="text-sm text-muted-foreground">
          {`Acuerdos registrados: ${total}`}
        </p>
        {limite !== null && acuerdos.length < total && (
          <p className="text-xs text-muted-foreground">
            {`Se muestran los ${acuerdos.length} acuerdos más recientes de ${total}; el libro completo tenía más de ${limite}.`}
          </p>
        )}
      </div>

      {errorCarga && (
        <Card className="border-destructive/50">
          <CardContent className="py-3">
            <p
              role="alert"
              className="flex items-center gap-2 text-sm text-destructive"
            >
              <IconAlertTriangle className="size-4" aria-hidden="true" />
              {errorCarga}
            </p>
          </CardContent>
        </Card>
      )}

      {cargando && acuerdos.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
            Leyendo el registro de acuerdos…
          </CardContent>
        </Card>
      ) : acuerdos.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            La comunidad no tiene acuerdos registrados: el libro se estrena con el
            primer acuerdo del comité o de la asamblea.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {acuerdos.map((acuerdo) => {
            const detalleAbierto = !!abiertos[acuerdo.id]
            const esAsamblea = acuerdo.cuerpo === "asamblea"
            const esPresencial = acuerdo.modalidad === "presencial"
            // La regla declarada, con su nombre legal; si la fila trae un código
            // que la regla pura no reconoce, se muestra el código crudo (no se
            // inventa un nombre) y el motivo del servidor dice qué pasa.
            const reglaDeclarada = REGLAS[acuerdo.quorumRequerido]
            const votandoEste = votando === acuerdo.id
            return (
              <Card key={acuerdo.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        <IconFileText className="size-4" aria-hidden="true" />
                        <span className="font-mono">{acuerdo.folio}</span>
                        <Badge
                          variant="secondary"
                          className={`text-[11px] ${
                            COLOR_ESTADO[acuerdo.estado] ?? ""
                          }`}
                        >
                          {ETIQUETA_ESTADO[acuerdo.estado] ?? acuerdo.estado}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        {`${ETIQUETA_CUERPO[acuerdo.cuerpo] ?? acuerdo.cuerpo} · ${
                          ETIQUETA_MODALIDAD[acuerdo.modalidad ?? ""] ?? "Electrónica"
                        } · ${
                          reglaDeclarada?.etiqueta ?? acuerdo.quorumRequerido
                        } · Registrado el ${fechaCorta(acuerdo.fecha)}${
                          acuerdo.resueltoEn
                            ? ` · Resuelto el ${fechaCorta(acuerdo.resueltoEn)}`
                            : ""
                        }`}
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Ver votos del acuerdo ${acuerdo.folio}`}
                      aria-expanded={detalleAbierto}
                      onClick={() => alternarDetalle(acuerdo.id)}
                    >
                      {detalleAbierto
                        ? "Ocultar votos"
                        : `Ver votos (${acuerdo.votos.length})`}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 border-t pt-4">
                  <p className="text-sm font-medium">{acuerdo.materia}</p>
                  <p className="text-sm">{textoDeConteos(acuerdo)}</p>
                  {acuerdo.modalidad === "presencial" && acuerdo.proclamado && (
                    <p className="text-sm">
                      {`Proclamado en la sala: ${numero(acuerdo.proclamado.presentes)} ${
                        esAsamblea ? "derechos" : "personas"
                      } presentes · quórum ${
                        acuerdo.proclamado.quorumAlcanzado ? "alcanzado" : "no alcanzado"
                      }`}
                    </p>
                  )}
                  {notaActa(acuerdo) && (
                    <p className="text-xs text-muted-foreground">
                      {notaActa(acuerdo)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {acuerdo.resultado.motivo}
                  </p>

                  {detalleAbierto && (
                    <Table aria-label={`Votos del acuerdo ${acuerdo.folio}`}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Votante</TableHead>
                          <TableHead className="w-[120px]">Decisión</TableHead>
                          <TableHead className="w-[90px]">
                            {esAsamblea ? "Peso (derechos)" : "Peso"}
                          </TableHead>
                          <TableHead className="w-[120px]">Fecha</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {acuerdo.votos.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="text-center text-xs text-muted-foreground"
                            >
                              El acuerdo aún no tiene votos registrados.
                            </TableCell>
                          </TableRow>
                        ) : (
                          acuerdo.votos.map((voto) => (
                            <TableRow key={voto.personaId}>
                              <TableCell className="text-xs">
                                {voto.nombre ?? voto.personaId}
                              </TableCell>
                              <TableCell className="text-xs">
                                {ETIQUETA_DECISION[voto.decision] ??
                                  voto.decision}
                              </TableCell>
                              <TableCell className="text-xs">
                                {numero(voto.peso)}
                              </TableCell>
                              <TableCell className="text-xs">
                                {fechaCorta(voto.fecha)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  )}

                  {acuerdo.estado === ESTADO_ACUERDO_ABIERTO ? (
                    esPresencial ? (
                      puedeRegistrar ? (
                        <div className="flex flex-col gap-2 border-t pt-3">
                          <p className="text-xs text-muted-foreground">
                            El resultado se proclama en la sala: no hay votos por
                            persona. El cierre registra lo proclamado y exige el
                            acta firmada subida al archivo legal.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void abrirCierre(acuerdo)}
                          >
                            Cerrar el acuerdo presencial
                          </Button>
                        </div>
                      ) : (
                        <p className="border-t pt-3 text-xs text-muted-foreground">
                          El resultado se proclama en la sala: el cierre lo
                          registra quien administra el libro, y la API valida el
                          permiso.
                        </p>
                      )
                    ) : (
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <p className="w-full text-xs text-muted-foreground">
                        Tu voto lo registra el servidor con tu identidad y tu peso:
                        esta pantalla sólo envía la decisión. Si no sos quien vota,
                        la API lo rechaza y su mensaje se muestra acá.
                      </p>
                      {DECISIONES.map((decision) => (
                        <Button
                          key={decision.clave}
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={votandoEste}
                          onClick={() => void votar(acuerdo, decision.clave)}
                        >
                          {votandoEste && (
                            <IconLoader2
                              className="size-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          )}
                          {decision.etiquetaVoto}
                        </Button>
                      ))}
                    </div>
                    )
                  ) : (
                    <p className="border-t pt-3 text-xs text-muted-foreground">
                      El acuerdo ya fue resuelto: no admite más votos (el
                      resultado es evidencia de lo votado).
                    </p>
                  )}

                  {errorVoto?.acuerdoId === acuerdo.id && (
                    <p
                      role="alert"
                      className="flex items-center gap-2 text-sm text-destructive"
                    >
                      <IconAlertTriangle className="size-4" aria-hidden="true" />
                      {errorVoto.mensaje}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog
        open={altaAbierta}
        onOpenChange={(abierto) => {
          if (!abierto) cerrarAlta()
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar acuerdo</DialogTitle>
            <DialogDescription className="leading-relaxed">
              El cuerpo y la regla se conservan en el registro tal como se
              declaran: la ley reparte la competencia y el reglamento de cada
              comunidad fija cómo se aprueba su presupuesto. El folio del libro, la
              fecha y el estado inicial los asigna el servidor.
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(evento) => {
              evento.preventDefault()
              void registrarAcuerdo()
            }}
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">
                Cuerpo que adopta el acuerdo
              </legend>
              <div className="flex items-start gap-2">
                <input
                  type="radio"
                  id="acuerdo-cuerpo-comite"
                  name="cuerpo"
                  className="mt-1"
                  checked={cuerpo === "comite"}
                  onChange={() => cambiarCuerpo("comite")}
                  disabled={enviandoAlta}
                />
                <div>
                  <Label htmlFor="acuerdo-cuerpo-comite">Comité</Label>
                  <p className="text-xs text-muted-foreground">
                    La ley le reserva las materias del art. 6 y del art. 20 N°9
                    (corte de servicios, convenio de pago): cada miembro vale un
                    voto.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <input
                  type="radio"
                  id="acuerdo-cuerpo-asamblea"
                  name="cuerpo"
                  className="mt-1"
                  checked={cuerpo === "asamblea"}
                  onChange={() => cambiarCuerpo("asamblea")}
                  disabled={enviandoAlta}
                />
                <div>
                  <Label htmlFor="acuerdo-cuerpo-asamblea">Asamblea</Label>
                  <p className="text-xs text-muted-foreground">
                    Los copropietarios votan ponderados por sus derechos
                    (prorrateo), nunca uno por persona.
                  </p>
                </div>
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">
                Modalidad del acuerdo
              </legend>
              <div className="flex items-start gap-2">
                <input
                  type="radio"
                  id="acuerdo-modalidad-electronica"
                  name="modalidad"
                  className="mt-1"
                  checked={modalidadAlta === "electronica"}
                  onChange={() => setModalidadAlta("electronica")}
                  disabled={enviandoAlta}
                />
                <div>
                  <Label htmlFor="acuerdo-modalidad-electronica">Electrónica</Label>
                  <p className="text-xs text-muted-foreground">
                    El resultado se deduce de los votos en la base: cada miembro de
                    la sesión vota desde su ficha. Es la modalidad de todo acuerdo
                    existente.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <input
                  type="radio"
                  id="acuerdo-modalidad-presencial"
                  name="modalidad"
                  className="mt-1"
                  checked={modalidadAlta === "presencial"}
                  onChange={() => setModalidadAlta("presencial")}
                  disabled={enviandoAlta}
                />
                <div>
                  <Label htmlFor="acuerdo-modalidad-presencial">Presencial</Label>
                  <p className="text-xs text-muted-foreground">
                    El resultado se proclama en la sala y no hay votos por persona.
                    No se puede cerrar sin el acta firmada subida al archivo legal.
                  </p>
                </div>
              </div>
            </fieldset>

            <div className="flex flex-col gap-1">
              <Label htmlFor="acuerdo-materia">Materia del acuerdo</Label>
              <Input
                id="acuerdo-materia"
                value={materia}
                onChange={(evento) => setMateria(evento.target.value)}
                placeholder="Qué se acuerda y sobre qué caso"
                maxLength={300}
                disabled={enviandoAlta}
              />
              <p className="text-xs text-muted-foreground">
                Mínimo {MINIMO_MATERIA} caracteres. Es la materia que el acta o el
                trámite van a citar con el folio del acuerdo.
              </p>
            </div>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-medium">
                Regla de quórum aplicada
              </legend>
              {REGLAS_POR_CUERPO[cuerpo].map((clave) => {
                const reglaDeclarada = REGLAS[clave]
                if (!reglaDeclarada) return null
                return (
                  <div key={clave} className="flex items-start gap-2">
                    <input
                      type="radio"
                      id={`acuerdo-regla-${clave}`}
                      name="regla"
                      className="mt-1"
                      checked={regla === clave}
                      onChange={() => setRegla(clave)}
                      disabled={enviandoAlta}
                    />
                    <div>
                      <Label htmlFor={`acuerdo-regla-${clave}`}>
                        {reglaDeclarada.etiqueta}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {reglaDeclarada.ayuda}
                      </p>
                    </div>
                  </div>
                )
              })}
            </fieldset>

            {errorAlta && (
              <p
                role="alert"
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <IconAlertTriangle className="size-4" aria-hidden="true" />
                {errorAlta}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={cerrarAlta}
                disabled={enviandoAlta}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={enviandoAlta || !materiaCompleta}>
                {enviandoAlta && (
                  <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                )}
                Registrar acuerdo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cierreDe !== null}
        onOpenChange={(abierto) => {
          if (!abierto) cancelarCierre()
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cerrar acuerdo presencial</DialogTitle>
            <DialogDescription className="leading-relaxed">
              El resultado se registra tal como la sala lo proclamó: el sistema lo
              contrasta con la regla aplicada y no lo recalcula. El cierre no se
              reescribe y exige el acta firmada subida al archivo legal.
            </DialogDescription>
          </DialogHeader>
          {acuerdoCierre && (
            <form
              className="flex flex-col gap-4"
              aria-label={`Cerrar el acuerdo presencial ${acuerdoCierre.folio}`}
              onSubmit={(evento) => {
                evento.preventDefault()
                void cerrarPresencial(acuerdoCierre)
              }}
            >
              <p className="text-sm font-medium">{acuerdoCierre.materia}</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cierre-a-favor">A favor</Label>
                  <Input
                    id="cierre-a-favor"
                    type="number"
                    min={0}
                    step="any"
                    value={aFavor}
                    onChange={(evento) => setAFavor(evento.target.value)}
                    disabled={cerrando}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cierre-en-contra">En contra</Label>
                  <Input
                    id="cierre-en-contra"
                    type="number"
                    min={0}
                    step="any"
                    value={enContra}
                    onChange={(evento) => setEnContra(evento.target.value)}
                    disabled={cerrando}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cierre-abstenciones">Abstenciones</Label>
                  <Input
                    id="cierre-abstenciones"
                    type="number"
                    min={0}
                    step="any"
                    value={abstenciones}
                    onChange={(evento) => setAbstenciones(evento.target.value)}
                    disabled={cerrando}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cierre-presentes">Presentes</Label>
                  <Input
                    id="cierre-presentes"
                    type="number"
                    min={0}
                    step="any"
                    value={presentes}
                    onChange={(evento) => setPresentes(evento.target.value)}
                    disabled={cerrando}
                  />
                </div>
              </div>

              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="cierre-quorum"
                  className="mt-1"
                  checked={quorumProclamado}
                  onChange={(evento) => setQuorumProclamado(evento.target.checked)}
                  disabled={cerrando}
                />
                <div>
                  <Label htmlFor="cierre-quorum">
                    La sala alcanzó el quórum exigido
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Es la proclama del acta: dejalo sin marcar si la mayoría no se
                    alcanzó. La regla aplicada (
                    {REGLAS[acuerdoCierre.quorumRequerido]?.etiqueta ??
                      acuerdoCierre.quorumRequerido}
                    ) se contrasta con lo proclamado, no se recalcula.
                  </p>
                </div>
              </div>

              {acuerdoCierre.actaId ? (
                <p className="text-xs text-muted-foreground">
                  {`El acuerdo declara el acta del libro ${
                    actaDeclaradaDelCierre?.folio ?? acuerdoCierre.actaId
                  }${
                    actaDeclaradaDelCierre
                      ? ` (${actaDeclaradaDelCierre.estado})`
                      : ""
                  }. ${
                    actaDeclaradaDelCierre &&
                    actaDeclaradaDelCierre.estado !== "publicada"
                      ? "El servidor no cerrará el acuerdo hasta que esa acta esté publicada en el libro y con folio."
                      : ""
                  }`}
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cierre-acta-libro">
                    Acta del libro que respalda el cierre
                  </Label>
                  <select
                    id="cierre-acta-libro"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    value={actaLibroId}
                    onChange={(evento) => setActaLibroId(evento.target.value)}
                    disabled={cerrando}
                  >
                    <option value="">
                      {actas === null
                        ? "Leyendo el libro de actas…"
                        : "Elegí el acta publicada que respalda el cierre"}
                    </option>
                    {actasPublicadas.map((acta) => (
                      <option key={acta.id} value={acta.id}>
                        {`${acta.folio} (${acta.fecha.slice(0, 10)})`}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    El servidor sólo cierra con un acta publicada en el libro y con
                    folio; el flujo borrador → publicada → cerrar se recorre con la
                    consola del libro.
                  </p>
                  {errorActas && (
                    <p role="alert" className="text-sm text-destructive">
                      {errorActas}
                    </p>
                  )}
                </div>
              )}

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">
                  Papeles firmados al archivo legal
                </legend>
                {acuerdoCierre.actaDocumentoId && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    El acta firmada está archivada en el archivo legal.
                  </p>
                )}
                {(["acta", "asistencia", "poderes"] as PapelDelAcuerdo[]).map(
                  (papel) => (
                    <div key={papel} className="flex flex-col gap-1">
                      <Label htmlFor={`cierre-archivo-${papel}`}>
                        {`${ETIQUETA_PAPEL[papel]} (PDF)`}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id={`cierre-archivo-${papel}`}
                          type="file"
                          accept="application/pdf"
                          className="flex-1"
                          onChange={(evento) =>
                            setArchivoPapel((previo) => ({
                              ...previo,
                              [papel]: evento.target.files?.[0] ?? null,
                            }))
                          }
                          disabled={cerrando || subiendoPapel !== null}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            !archivoPapel[papel] ||
                            subiendoPapel !== null ||
                            cerrando
                          }
                          onClick={() => void subirPapel(acuerdoCierre, papel)}
                        >
                          {subiendoPapel === papel && (
                            <IconLoader2
                              className="size-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          )}
                          {`Subir ${ETIQUETA_PAPEL[papel].toLowerCase()}`}
                        </Button>
                      </div>
                      {papel !== "acta" && papelArchivado(acuerdoCierre, papel) && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-300">
                          {`${ETIQUETA_PAPEL[papel]} archivada en el archivo legal.`}
                        </p>
                      )}
                    </div>
                  )
                )}
                <p className="text-xs text-muted-foreground">
                  El acta firmada es obligatoria para cerrar (S1); la asistencia y
                  los poderes se archivan cuando existen. Cada papel se sube una
                  sola vez: repetirlo lo dice el servidor con su 409.
                </p>
              </fieldset>

              {errorPapel?.acuerdoId === acuerdoCierre.id && (
                <p
                  role="alert"
                  className="flex items-center gap-2 text-sm text-destructive"
                >
                  <IconAlertTriangle className="size-4" aria-hidden="true" />
                  {errorPapel.mensaje}
                </p>
              )}
              {errorCierre && (
                <p
                  role="alert"
                  className="flex items-center gap-2 text-sm text-destructive"
                >
                  <IconAlertTriangle className="size-4" aria-hidden="true" />
                  {errorCierre}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelarCierre}
                  disabled={cerrando}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={!puedeCerrar || cerrando}>
                  {cerrando && (
                    <IconLoader2 className="size-4 animate-spin" aria-hidden="true" />
                  )}
                  Cerrar acuerdo
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
