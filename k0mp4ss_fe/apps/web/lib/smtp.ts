/**
 * lib/smtp.ts — emisor SMTP real (F4, `specs/PENDIENTES-FUNCIONALIDAD.md`).
 *
 * Hasta acá CF guardaba `smtpHost`, `smtpPort`, `smtpUser`, `smtpSecurity`,
 * `smtpFrom`, `smtpFromName`, `smtpBcc` y `smtpRecepcion`, pero **no existía
 * emisor**: todo correo quedaba en la cola de salida como `pendiente` para
 * siempre. Este módulo envía UN mensaje con esa configuración y devuelve uno de
 * tres desenlaces que NO se confunden entre sí (regla del manual 11 - CF):
 *
 * - `no_configurado`: estado de configuración. Falta la fila de CF, algún campo
 *   obligatorio o la variable `SMTP_PASSWORD`. No se abre ninguna conexión.
 * - `enviado`: el servidor ACEPTÓ el mensaje (250 al final del DATA). Incluye el
 *   id que devolvió el servidor cuando lo trae.
 * - `fallido`: el envío se intentó y rebotó, con el motivo (timeout, autenticación
 *   rechazada, conexión rechazada, respuesta inesperada del servidor).
 *
 * Decisiones que no se reinterpretan:
 * - **La contraseña del camino global vive SOLO en `process.env.SMTP_PASSWORD`.**
 *   No se lee de la base, no se persiste, no se loguea, no se devuelve y no se
 *   incluye en ningún motivo de error: se redacta (literal y en base64) antes de
 *   armar el texto. La fila de CF se lee con un `select` explícito que NI SIQUIERA
 *   pide `smtpPassword`, así el secreto no entra en memoria desde la base.
 * - **F33: la credencial de la comunidad se resuelve ACÁ, no en cada llamador.**
 *   `enviarCorreoComunidad` lee la `CredencialCorreoComunidad` de la comunidad
 *   (`lib/correo-comunidad.ts`), descifra el secreto en memoria con la clave
 *   maestra y la usa. Precedencia: credencial EXPLÍCITA (`opciones.credencial`, la
 *   que ya pasan el barrido de vigencia y la prueba de envío) > credencial de la
 *   comunidad > variable global `SMTP_PASSWORD`. Resolverla en el emisor y no en
 *   el llamador es deliberado: un llamador nuevo que se olvide no puede caer en
 *   silencio a la contraseña global. Los llamadores no cambian de firma; el
 *   barrido de vigencia sigue pasando su credencial y no se re-resuelve.
 * - **Cuando se envía con la variable global, el motivo dice POR QUÉ.** La
 *   resolución devuelve `comunidad_sin_credencial` (no hay fila),
 *   `clave_maestra_ausente` (la variable falta o no mide 32 bytes) o
 *   `credencial_ilegible` (el paquete guardado no se abre). Ese motivo viaja en
 *   el resultado y `motivoSMTP` lo escribe en la cola de salida, porque una fila
 *   que sólo dice «aceptado» no puede insinuar una credencial que no se usó. Si
 *   la comunidad no tiene credencial y el emisor global tampoco está
 *   configurado, el desenlace sigue siendo `no_configurado` (condición de
 *   configuración, no envío fallido) y el motivo nombra las dos cosas.
 * - **Nunca se dice `enviado` sin aceptación del servidor**: el resultado sale del
 *   código de respuesta final del DATA, no de que la conexión se haya abierto.
 * - **Sin dependencias**: el diálogo SMTP (EHLO, STARTTLS, AUTH PLAIN/LOGIN,
 *   MAIL/RCPT/DATA) se habla sobre `node:net`/`node:tls`. No se agrega
 *   `nodemailer` ni ninguna otra librería para esto.
 * - **A una dirección que no puede existir no se le envía nada.** Los dominios
 *   reservados por RFC 2606 / RFC 6761 (`*.test`, `*.example`, `*.invalid`,
 *   `*.localhost`, y los literales `example.com`/`example.org`/`example.net`) y
 *   el dominio ficticio de los datos semilla (`email.com`) no tienen buzones
 *   reales: aceptarles un mensaje es fabricar un rebote. Un rebote suelto es
 *   inofensivo; un patrón de rebotes daña la reputación del remitente y puede
 *   dejar el dominio de la comunidad en una lista negra. Por eso el rechazo es
 *   local (se decide ANTES de abrir la conexión), se registra como `fallido`
 *   —nunca `pendiente`, que significa "sin emisor configurado"— y el motivo dice
 *   por qué y nombra la dirección. El choque real que lo motivó: un e2e entregó
 *   un aviso a `juan.perez@email.com` (semilla, inexistente) y el servidor lo
 *   aceptó. Las direcciones malformadas (sin `@`, sin parte local, con espacios)
 *   caen en la misma guardia. Un BCC o un Reply-To con dirección imposible
 *   rechaza el envío ENTERO y el motivo nombra esa dirección: descartar sólo la
 *   copia escondería el error de CF y el BCC igual rebota. El `From` no entra en
 *   la guardia: es el emisor declarado en CF y no es destinatario de ningún
 *   rebote.
 * - Los llamadores traducen el desenlace con `estadoRegistroSMTP`/`motivoSMTP`,
 *   de modo que la cola de salida diga siempre la verdad.
 */
import { randomUUID } from "node:crypto"
import { connect as conectarRed, isIP, type Socket } from "node:net"
import { connect as conectarTls, type TLSSocket } from "node:tls"
import { prisma } from "@/lib/prisma"
import {
  EXPLICACION_MOTIVO_GLOBAL,
  resolverCredencialDeComunidad,
  type MotivoCredencialGlobal,
} from "@/lib/correo-comunidad"

/** Motivo por el que un envío se resolvió con el emisor global (F33). */
export type { MotivoCredencialGlobal } from "@/lib/correo-comunidad"

/**
 * Desenlace de un intento de envío. Estados que NO se confunden entre sí.
 *
 * `motivoGlobal` dice por qué se envió con la variable global en lugar de la
 * credencial de la comunidad (F33); ausente significa que se usó la credencial de
 * la comunidad o una credencial explícita.
 */
export type ResultadoEnvioSMTP =
  | { estado: "enviado"; messageId: string | null; motivoGlobal?: MotivoCredencialGlobal }
  | { estado: "no_configurado"; motivo: string; motivoGlobal?: MotivoCredencialGlobal }
  | { estado: "fallido"; motivo: string; motivoGlobal?: MotivoCredencialGlobal }

/** Estado tal como se persiste en la cola de salida (`pendiente|enviado|fallido`). */
export type EstadoRegistroSMTP = "pendiente" | "enviado" | "fallido"

/** Campos de CF que usa el emisor (la contraseña NO está en esta lista). */
export interface FilaConfiguracionSMTP {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpSecurity: string
  smtpFrom: string
  smtpFromName: string
  smtpBcc?: string | null
  smtpRecepcion?: string | null
}

/** Un mensaje de texto plano: lo único que la plataforma envía hoy. */
export interface MensajeSMTP {
  to: string
  subject: string
  text: string
}

/** Entorno inyectable (en producción es `process.env`; los tests pasan el suyo). */
export type EntornoSMTP = { [variable: string]: string | undefined }

export interface OpcionesEnvioSMTP {
  /** Entorno del que se lee `SMTP_PASSWORD`. Default: `process.env`. */
  env?: EntornoSMTP
  /** Tope de la conversación completa. Default: `TIEMPO_LIMITE_MS`. */
  tiempoLimiteMs?: number
  /**
   * Credencial de la comunidad (F33), con el secreto EN CLARO y solo en memoria:
   * quien la pasa lo descifra con la clave maestra del entorno y no lo persiste.
   * Cuando está, el emisor usa este host/puerto/usuario/secreto y NO consulta
   * `SMTP_PASSWORD`; tampoco resuelve la credencial guardada de la comunidad (la
   * explícita manda).
   */
  credencial?: CredencialSMTP
  /**
   * Motivo por el que `enviarCorreoComunidad` decidió usar el emisor global
   * (F33). Lo llena ese envoltorio —único que conoce el `comunidadId`— para que
   * el motivo persistido diga la verdad; un llamador directo de
   * `enviarCorreoSMTP` no lo pasa.
   */
  motivoGlobal?: MotivoCredencialGlobal
}

/**
 * Credencial SMTP de UNA comunidad, ya descifrada. Vive en memoria durante un
 * envío y nunca se escribe en un motivo, un log ni una respuesta.
 */
export interface CredencialSMTP {
  host: string
  puerto: number
  usuario: string
  /** Contraseña en claro: la descifra el llamador con la clave maestra. */
  secreto: string
}

/** Tope de la conversación SMTP completa (incluye conexión y handshake TLS). */
export const TIEMPO_LIMITE_MS = 15_000

/** Nombre que se anuncia en el EHLO. */
const NOMBRE_CLIENTE = "compass.local"

// --- Contrato público --------------------------------------------------------

/**
 * Lee la configuración SMTP de una comunidad (CF) con un `select` explícito que
 * NO pide `smtpPassword`: el secreto no entra en memoria desde la base.
 * Devuelve `null` cuando la comunidad todavía no tiene fila de configuración.
 */
export async function leerConfiguracionSMTP(
  comunidadId: string
): Promise<FilaConfiguracionSMTP | null> {
  const fila = await prisma.configuracionGlobal.findUnique({
    where: { comunidadId },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpSecurity: true,
      smtpFrom: true,
      smtpFromName: true,
      smtpBcc: true,
      smtpRecepcion: true,
    },
  })
  return fila
}

/**
 * Envía un mensaje con la configuración SMTP de la comunidad.
 *
 * Es el punto donde se resuelve la credencial de la comunidad (F33): quien llama
 * no tiene que pasar nada y, si no la hay, el envío cae a la variable global con
 * el motivo escrito. Con credencial explícita en `opciones.credencial` no se
 * resuelve ninguna otra: esa manda (barrido de vigencia y prueba de envío).
 *
 * No lanza: cualquier falla —incluida una excepción inesperada del transporte—
 * vuelve como `{ estado: "fallido", motivo }` con el secreto redactado.
 */
export async function enviarCorreoComunidad(
  comunidadId: string,
  mensaje: MensajeSMTP,
  opciones: OpcionesEnvioSMTP = {}
): Promise<ResultadoEnvioSMTP> {
  let fila: FilaConfiguracionSMTP | null = null
  try {
    fila = await leerConfiguracionSMTP(comunidadId)
  } catch {
    // La base no respondió: no es "falló el envío", es "no hay configuración
    // legible". Se declara como tal en vez de inventar un resultado.
    return {
      estado: "no_configurado",
      motivo: "Sin emisor SMTP configurado: no se pudo leer la configuración global (CF).",
    }
  }

  // F33: la credencial se resuelve UNA vez, acá. Sin fila de CF no hay remitente
  // con el que enviar, así que no se consulta la credencial para nada.
  let credencial = opciones.credencial
  let motivoGlobal: MotivoCredencialGlobal | undefined
  if (!credencial && fila) {
    try {
      const resuelta = await resolverCredencialDeComunidad(comunidadId)
      if (resuelta.ok) credencial = resuelta.credencial
      else motivoGlobal = resuelta.motivo
    } catch {
      // No se pudo saber si la comunidad tiene credencial. Declarar
      // `comunidad_sin_credencial` sería inventar y enviar con la global a
      // ciegas también: sin configuración legible no se envía.
      return {
        estado: "no_configurado",
        motivo:
          "Sin emisor SMTP configurado: no se pudo leer la credencial de correo de la comunidad.",
      }
    }
  }

  return enviarCorreoSMTP(fila, mensaje, { ...opciones, credencial, motivoGlobal })
}

/**
 * Envía un mensaje con una fila de CF ya leída. Es el núcleo que usan las rutas
 * (vía `enviarCorreoComunidad`) y los tests de transporte.
 *
 * Antes de resolver la configuración se ejecuta la guardia de direcciones que no
 * pueden existir (ver `direccionInexistente`): una dirección imposible no se
 * arregla configurando el emisor, así que se declara `fallido` de entrada y no
 * puede quedar `pendiente`.
 */
export async function enviarCorreoSMTP(
  fila: FilaConfiguracionSMTP | null,
  mensaje: MensajeSMTP,
  opciones: OpcionesEnvioSMTP = {}
): Promise<ResultadoEnvioSMTP> {
  const entorno = opciones.env ?? process.env
  const credencial = opciones.credencial
  const motivoGlobal = opciones.motivoGlobal

  // Nadie a quien enviar: se rechaza sin mirar la configuración ni abrir nada.
  const rechazoDelDestinatario = motivoDireccionRechazada("el destinatario", mensaje.to)
  if (rechazoDelDestinatario) return { estado: "fallido", motivo: rechazoDelDestinatario }

  const resuelta = resolverConfiguracion(fila, entorno, credencial)
  if (!resuelta.ok) {
    return {
      estado: "no_configurado",
      motivo: conNotaCredencialNoUsada(resuelta.motivo, motivoGlobal),
      motivoGlobal,
    }
  }

  // Las copias de CF rebotan igual que el destinatario: si alguna es imposible,
  // se rechaza el envío completo y el motivo nombra la dirección y el campo.
  for (const copia of resuelta.config.bcc) {
    const rechazo = motivoDireccionRechazada("el BCC de auditoría configurado en CF", copia)
    if (rechazo) return { estado: "fallido", motivo: rechazo }
  }
  if (resuelta.config.replyTo) {
    const rechazo = motivoDireccionRechazada(
      "el Reply-To (correo de recepción de CF)",
      resuelta.config.replyTo
    )
    if (rechazo) return { estado: "fallido", motivo: rechazo }
  }

  const secreto = credencial ? credencial.secreto : secretoDelEntorno(entorno)
  const tiempoLimiteMs = opciones.tiempoLimiteMs ?? TIEMPO_LIMITE_MS
  try {
    const { messageId } = await conversar(resuelta.config, secreto, mensaje, tiempoLimiteMs)
    return { estado: "enviado", messageId, motivoGlobal }
  } catch (error) {
    return {
      estado: "fallido",
      motivo: conNotaEmisorGlobal(motivoDeFallo(error, secreto), motivoGlobal),
      motivoGlobal,
    }
  }
}

/**
 * Estado que se persiste en la cola de salida. `no_configurado` es una
 * CONDICIÓN DE CONFIGURACIÓN, no un envío fallido: queda `pendiente`.
 */
export function estadoRegistroSMTP(resultado: ResultadoEnvioSMTP): EstadoRegistroSMTP {
  return resultado.estado === "no_configurado" ? "pendiente" : resultado.estado
}

/**
 * Motivo textual que se persiste junto al estado. Nunca incluye la contraseña;
 * para `pendiente` deja escrito que el correo NO se reporta como enviado.
 */
export function motivoSMTP(resultado: ResultadoEnvioSMTP): string {
  if (resultado.estado === "no_configurado") {
    return `${resultado.motivo} El correo queda en la cola de salida (outbox) y no se reporta como enviado.`
  }
  if (resultado.estado === "enviado") {
    const aceptado = resultado.messageId
      ? `Aceptado por el servidor SMTP (id ${resultado.messageId}).`
      : "Aceptado por el servidor SMTP."
    return conNotaEmisorGlobal(aceptado, resultado.motivoGlobal)
  }
  return resultado.motivo
}

// --- Notas de la credencial usada (F33) -------------------------------------

/**
 * Agrega al motivo por qué se envió con la variable global en vez de la
 * credencial de la comunidad. Sin `motivoGlobal` el motivo no cambia: el camino
 * con credencial de la comunidad no lleva ninguna nota.
 */
function conNotaEmisorGlobal(
  motivo: string,
  motivoGlobal: MotivoCredencialGlobal | undefined
): string {
  if (!motivoGlobal) return motivo
  return `${motivo} Se usó el emisor global (SMTP_PASSWORD) porque ${EXPLICACION_MOTIVO_GLOBAL[motivoGlobal]}.`
}

/**
 * Agrega al motivo por qué no se usó la credencial de la comunidad cuando el
 * envío tampoco tiene emisor global: son dos hechos y la fila los dice los dos.
 */
function conNotaCredencialNoUsada(
  motivo: string,
  motivoGlobal: MotivoCredencialGlobal | undefined
): string {
  if (!motivoGlobal) return motivo
  return `${motivo} La credencial de correo de la comunidad no se usó porque ${EXPLICACION_MOTIVO_GLOBAL[motivoGlobal]}.`
}

// --- Guardia de direcciones que no pueden existir ---------------------------

/**
 * Dominios de primer nivel reservados por RFC 2606 y RFC 6761. Ninguno puede
 * tener un buzón real: `*.test` (pruebas), `*.example` (documentación),
 * `*.invalid` (direcciones deliberadamente inválidas) y `*.localhost` (el propio
 * equipo). Aceptarles un mensaje es fabricar un rebote.
 */
const TLD_RESERVADOS: readonly string[] = ["test", "example", "invalid", "localhost"]

/** Dominios literales reservados por RFC 2606 §2 para documentación. */
const DOMINIOS_RESERVADOS: readonly string[] = ["example.com", "example.org", "example.net"]

/**
 * El dominio ficticio de los datos semilla de la plataforma: los residentes
 * sembrados llevan direcciones `@email.com` que NO existen como buzones. Se
 * declara acá, con nombre propio, para que se lea por qué está en la lista.
 */
const DOMINIO_FICTICIO_DE_LA_SEMILLA = "email.com"

/** Por qué una dirección no puede ser un buzón real. */
type ClaseDireccionInexistente = "reservada" | "semilla" | "malformada"

interface DireccionInexistente {
  /** Dirección recortada, para nombrarla en el motivo. */
  direccion: string
  clase: ClaseDireccionInexistente
  /** Explicación corta del porqué, para el texto del rechazo. */
  detalle: string
}

/**
 * Decide si una dirección NO puede ser un buzón real. Devuelve `null` cuando la
 * dirección es plausible y el envío puede intentarse.
 *
 * Tres clases: malformada (sin `@`, sin parte local, sin dominio, con espacios o
 * con más de un `@`), reservada (RFC 2606 / RFC 6761) y semilla (el dominio
 * ficticio de los datos sembrados).
 */
function direccionInexistente(correo: string): DireccionInexistente | null {
  const direccion = correo.trim()
  const malformada = (detalle: string): DireccionInexistente => ({
    direccion,
    clase: "malformada",
    detalle,
  })

  if (direccion === "") return malformada("está vacía")
  if (/\s/.test(direccion)) return malformada("contiene espacios en blanco")

  const partes = direccion.split("@")
  if (partes.length === 1) return malformada("no tiene @")
  if (partes.length > 2) return malformada("tiene más de un @")
  const [local = "", dominioCrudo = ""] = partes
  if (local === "") return malformada("no tiene parte local (nada antes del @)")

  const dominio = dominioCrudo.toLowerCase()
  if (dominio === "") return malformada("no tiene dominio (nada después del @)")

  const etiquetas = dominio.split(".")
  const tld = etiquetas[etiquetas.length - 1] ?? ""
  if (TLD_RESERVADOS.includes(tld)) {
    return {
      direccion,
      clase: "reservada",
      detalle: `"${tld}" es un dominio de primer nivel reservado por RFC 2606/RFC 6761 para pruebas y documentación`,
    }
  }
  if (DOMINIOS_RESERVADOS.includes(dominio)) {
    return {
      direccion,
      clase: "reservada",
      detalle: `"${dominio}" es un dominio reservado por RFC 2606 para pruebas y documentación`,
    }
  }
  if (dominio === DOMINIO_FICTICIO_DE_LA_SEMILLA) {
    return {
      direccion,
      clase: "semilla",
      detalle: `"${dominio}" es el dominio ficticio de los datos semilla de la plataforma`,
    }
  }
  return null
}

/**
 * Motivo del rechazo para un destinatario, o `null` si la dirección es
 * plausible. El motivo dice qué dirección, qué rol cumple (destinatario, BCC o
 * Reply-To), por qué no puede existir y que por eso no se envió nada: es el
 * texto que ve el operador en la cola de salida.
 */
function motivoDireccionRechazada(rol: string, correo: string): string | null {
  const inexistente = direccionInexistente(correo)
  if (!inexistente) return null
  const explicacion =
    inexistente.clase === "malformada"
      ? `no es una dirección de correo válida (${inexistente.detalle})`
      : `es una dirección de prueba o inexistente (${inexistente.detalle})`
  return `Falló el envío por SMTP: ${rol} "${inexistente.direccion}" ${explicacion}, por lo que no se envió nada y no se abrió ninguna conexión SMTP.`
}

// --- Resolución de la configuración -----------------------------------------

interface ConfiguracionResuelta {
  host: string
  port: number
  user: string
  seguridad: "ssl" | "tls" | "none"
  from: string
  fromName: string
  bcc: string[]
  /** Correo de recepción de CF (`smtpRecepcion`) como Reply-To, si está puesto. */
  replyTo: string | null
}

/** La contraseña del entorno; vacía o en blanco significa "no configurada". */
function secretoDelEntorno(entorno: EntornoSMTP): string {
  return entorno.SMTP_PASSWORD ?? ""
}

function seguridadValida(valor: string): "ssl" | "tls" | "none" {
  if (valor === "ssl" || valor === "tls") return valor
  return "none"
}

/** Correos separados por coma o punto y coma (así se escriben en CF). */
function listaDeCorreos(valor: string | null | undefined): string[] {
  if (!valor) return []
  return valor
    .split(/[,;]/)
    .map((correo) => correo.trim())
    .filter((correo) => correo.length > 0)
}

/**
 * Decide si hay con qué enviar. `no_configurado` es un estado de configuración
 * (no se abre ninguna conexión) y su motivo nombra el campo que falta, nunca el
 * valor de un secreto.
 */
function resolverConfiguracion(
  fila: FilaConfiguracionSMTP | null,
  entorno: EntornoSMTP,
  credencial?: CredencialSMTP
): { ok: true; config: ConfiguracionResuelta } | { ok: false; motivo: string } {
  if (!fila) {
    return {
      ok: false,
      motivo:
        "Sin emisor SMTP configurado: la comunidad no tiene configuración global (CF).",
    }
  }

  // Camino de F33: la credencial de la comunidad manda sobre host/puerto/usuario
  // y sobre el secreto. El remitente y la seguridad siguen viniendo de CF.
  if (credencial) {
    const faltantesCredencial: string[] = []
    if (!fila.smtpFrom?.trim()) faltantesCredencial.push("smtpFrom")
    if (!fila.smtpFromName?.trim()) faltantesCredencial.push("smtpFromName")
    if (!credencial.host?.trim()) faltantesCredencial.push("host")
    if (!credencial.puerto || credencial.puerto <= 0) faltantesCredencial.push("puerto")
    if (!credencial.usuario?.trim()) faltantesCredencial.push("usuario")
    if (!credencial.secreto?.trim()) faltantesCredencial.push("secreto")
    if (faltantesCredencial.length > 0) {
      return {
        ok: false,
        motivo: `Sin emisor SMTP configurado: falta(n) en la credencial de correo de la comunidad ${faltantesCredencial.join(", ")}.`,
      }
    }
    return {
      ok: true,
      config: {
        host: credencial.host.trim(),
        port: credencial.puerto,
        user: credencial.usuario.trim(),
        seguridad: seguridadValida(fila.smtpSecurity),
        from: fila.smtpFrom.trim(),
        fromName: fila.smtpFromName.trim(),
        bcc: listaDeCorreos(fila.smtpBcc),
        replyTo: listaDeCorreos(fila.smtpRecepcion)[0] ?? null,
      },
    }
  }

  const faltantes: string[] = []
  if (!fila.smtpHost?.trim()) faltantes.push("smtpHost")
  if (!fila.smtpPort || fila.smtpPort <= 0) faltantes.push("smtpPort")
  if (!fila.smtpUser?.trim()) faltantes.push("smtpUser")
  if (!fila.smtpFrom?.trim()) faltantes.push("smtpFrom")
  if (!fila.smtpFromName?.trim()) faltantes.push("smtpFromName")
  if (faltantes.length > 0) {
    return {
      ok: false,
      motivo: `Sin emisor SMTP configurado: falta(n) en CF ${faltantes.join(", ")}.`,
    }
  }
  if (secretoDelEntorno(entorno).trim() === "") {
    return {
      ok: false,
      motivo:
        "Sin emisor SMTP configurado: falta la variable de entorno SMTP_PASSWORD en el servidor.",
    }
  }
  return {
    ok: true,
    config: {
      host: fila.smtpHost.trim(),
      port: fila.smtpPort,
      user: fila.smtpUser.trim(),
      seguridad: seguridadValida(fila.smtpSecurity),
      from: fila.smtpFrom.trim(),
      fromName: fila.smtpFromName.trim(),
      bcc: listaDeCorreos(fila.smtpBcc),
      replyTo: listaDeCorreos(fila.smtpRecepcion)[0] ?? null,
    },
  }
}

// --- Redacción del secreto ---------------------------------------------------

/**
 * Quita el secreto de cualquier texto que vaya a salir del módulo (motivo de
 * error o mensaje de log). Se redactan el literal y su base64, que es la forma
 * en que viaja en AUTH: un servidor que repitiera lo recibido tampoco lo filtra.
 */
function redactarSecreto(texto: string, secreto: string): string {
  if (secreto.trim() === "") return texto
  const variantes = [secreto, Buffer.from(secreto, "utf8").toString("base64")]
  return variantes.reduce((acc, variante) => acc.split(variante).join("[redactado]"), texto)
}

function motivoDeFallo(error: unknown, secreto: string): string {
  const crudo =
    error instanceof Error && error.message
      ? error.message
      : "el servidor SMTP no completó el envío"
  return `Falló el envío por SMTP: ${redactarSecreto(crudo, secreto)}`
}

// --- Conversación SMTP ------------------------------------------------------

interface RespuestaSMTP {
  codigo: number
  texto: string
}

/** Estado mutable de la conversación: el socket cambia al subir a TLS. */
interface SesionSMTP {
  socket: Socket | TLSSocket
  buzon: BuzonSMTP
}

/** Lector de respuestas SMTP sobre un socket (tolera respuestas multilínea). */
class BuzonSMTP {
  private buffer = ""
  private pendientes: string[] = []
  private despertar: (() => void) | null = null
  private falla: Error | null = null
  private cerrado = false

  private readonly alDatos = (trozo: Buffer): void => {
    this.buffer += trozo.toString("utf8")
    let corte = this.buffer.indexOf("\r\n")
    while (corte >= 0) {
      this.pendientes.push(this.buffer.slice(0, corte))
      this.buffer = this.buffer.slice(corte + 2)
      corte = this.buffer.indexOf("\r\n")
    }
    this.despertar?.()
  }

  private readonly alError = (error: Error): void => {
    this.falla ??= error
    this.despertar?.()
  }

  private readonly alCerrar = (): void => {
    this.cerrado = true
    this.despertar?.()
  }

  constructor(private readonly socket: Socket | TLSSocket) {
    socket.on("data", this.alDatos)
    socket.on("error", this.alError)
    socket.on("close", this.alCerrar)
  }

  /** Suelta el socket: la capa TLS toma los bytes crudos en un STARTTLS. */
  soltar(): void {
    this.socket.off("data", this.alDatos)
    this.socket.off("error", this.alError)
    this.socket.off("close", this.alCerrar)
  }

  private async siguienteLinea(): Promise<string> {
    for (;;) {
      const linea = this.pendientes.shift()
      if (linea !== undefined) return linea
      if (this.falla) throw this.falla
      if (this.cerrado) {
        throw new Error("la conexión SMTP se cerró sin completar la respuesta")
      }
      await new Promise<void>((resolver) => {
        this.despertar = resolver
      })
      this.despertar = null
    }
  }

  async respuesta(): Promise<RespuestaSMTP> {
    const partes: string[] = []
    for (;;) {
      const linea = await this.siguienteLinea()
      const codigo = Number(linea.slice(0, 3))
      if (!Number.isFinite(codigo)) {
        throw new Error(`respuesta SMTP inválida del servidor: ${linea.slice(0, 80)}`)
      }
      partes.push(linea.slice(4))
      if (linea[3] !== "-") return { codigo, texto: partes.join(" ") }
    }
  }
}

function exigir(respuesta: RespuestaSMTP, esperados: number[], etapa: string): string {
  if (!esperados.includes(respuesta.codigo)) {
    throw new Error(`${etapa}: el servidor respondió ${respuesta.codigo} ${respuesta.texto}`.trim())
  }
  return respuesta.texto
}

/** Manda una orden y exige uno de los códigos esperados. */
async function ordenar(
  sesion: SesionSMTP,
  orden: string,
  esperados: number[],
  etapa: string
): Promise<string> {
  sesion.socket.write(`${orden}\r\n`)
  const respuesta = await sesion.buzon.respuesta()
  return exigir(respuesta, esperados, etapa)
}

function esperarHandshake(socket: TLSSocket): Promise<void> {
  return new Promise<void>((resolver, rechazar) => {
    socket.once("secureConnect", () => resolver())
    socket.once("error", (error: Error) => rechazar(error))
  })
}

/** Mecanismos de AUTH anunciados en la última respuesta del EHLO. */
function mecanismosAuth(ehlo: string): string[] {
  const conocidos = new Set([
    "PLAIN",
    "LOGIN",
    "CRAM-MD5",
    "DIGEST-MD5",
    "XOAUTH2",
    "NTLM",
    "GSSAPI",
  ])
  const tokens = ehlo.split(/\s+/).filter((token) => token.length > 0)
  const mecanismos: string[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? ""
    if (/^auth=/i.test(token)) {
      // Forma RFC 4954: `AUTH=PLAIN,LOGIN`.
      mecanismos.push(
        ...token
          .slice(token.indexOf("=") + 1)
          .split(",")
          .map((mecanismo) => mecanismo.trim().toUpperCase())
      )
      continue
    }
    if (/^auth$/i.test(token)) {
      // Forma antigua: `AUTH PLAIN LOGIN` (lista separada por espacios).
      for (let j = i + 1; j < tokens.length; j += 1) {
        const candidato = (tokens[j] ?? "").toUpperCase()
        if (!conocidos.has(candidato)) break
        mecanismos.push(candidato)
      }
    }
  }
  return mecanismos.filter((mecanismo) => mecanismo.length > 0)
}

async function autenticar(
  sesion: SesionSMTP,
  user: string,
  secreto: string,
  mecanismos: string[]
): Promise<void> {
  if (mecanismos.length === 0) {
    // El servidor no pidió credenciales: no se mandan (relay interno/laboratorio).
    return
  }
  if (mecanismos.includes("PLAIN") || !mecanismos.includes("LOGIN")) {
    const credencial = Buffer.from(`\0${user}\0${secreto}`, "utf8").toString("base64")
    await ordenar(sesion, `AUTH PLAIN ${credencial}`, [235], "Autenticación SMTP")
    return
  }
  await ordenar(sesion, "AUTH LOGIN", [334], "Autenticación SMTP")
  await ordenar(
    sesion,
    Buffer.from(user, "utf8").toString("base64"),
    [334],
    "Autenticación SMTP (usuario)"
  )
  await ordenar(
    sesion,
    Buffer.from(secreto, "utf8").toString("base64"),
    [235],
    "Autenticación SMTP (contraseña)"
  )
}

function direccion(valor: string): string {
  return `<${valor.replace(/[<>\r\n]/g, "").trim()}>`
}

/** Codifica un header en RFC 2047 sólo si trae caracteres fuera de ASCII. */
function headerSeguro(valor: string): string {
  const limpio = valor.replace(/[\r\n]+/g, " ").trim()
  // eslint-disable-next-line no-control-regex -- se busca ASCII imprimible a propósito
  if (/^[\x20-\x7E]*$/.test(limpio)) return limpio
  return `=?UTF-8?B?${Buffer.from(limpio, "utf8").toString("base64")}?=`
}

/** Arma el mensaje RFC 5322 (texto plano UTF-8) con el cuerpo "dot-stuffed". */
function armarMensaje(
  config: ConfiguracionResuelta,
  mensaje: MensajeSMTP,
  messageId: string
): string {
  const cuerpo = mensaje.text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((linea) => (linea.startsWith(".") ? `.${linea}` : linea))
    .join("\r\n")
  const cabeceras = [
    `From: ${headerSeguro(config.fromName)} ${direccion(config.from)}`,
    `To: ${direccion(mensaje.to)}`,
    ...(config.replyTo ? [`Reply-To: ${direccion(config.replyTo)}`] : []),
    `Subject: ${headerSeguro(mensaje.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ]
  return `${cabeceras.join("\r\n")}\r\n\r\n${cuerpo}\r\n`
}

/** Id que devolvió el servidor (`queued as X`); si no lo dice, el Message-ID. */
function idDelServidor(respuestaFinal: string, messageId: string): string {
  const encontrado = /queued as (\S+)/i.exec(respuestaFinal)
  const id = encontrado?.[1]?.replace(/[<>;]/g, "").trim()
  return id && id.length > 0 ? id : messageId
}

function messageIdPara(from: string): string {
  const dominio = from.split("@")[1]?.trim() || NOMBRE_CLIENTE
  return `<${randomUUID()}@${dominio}>`
}

async function conversar(
  config: ConfiguracionResuelta,
  secreto: string,
  mensaje: MensajeSMTP,
  tiempoLimiteMs: number
): Promise<{ messageId: string | null }> {
  const servidor = isIP(config.host) ? undefined : config.host
  const socketInicial =
    config.seguridad === "ssl"
      ? conectarTls({ host: config.host, port: config.port, servername: servidor })
      : conectarRed({ host: config.host, port: config.port })
  // Un socket destruido no debe tumbar el proceso: el motivo real se arma desde
  // la respuesta o desde la excepción capturada por `enviarCorreoSMTP`.
  socketInicial.on("error", () => {})

  const sesion: SesionSMTP = { socket: socketInicial, buzon: new BuzonSMTP(socketInicial) }

  const conversacion = (async (): Promise<{ messageId: string | null }> => {
    if (config.seguridad === "ssl") await esperarHandshake(socketInicial as TLSSocket)

    exigir(await sesion.buzon.respuesta(), [220], "Saludo del servidor SMTP")

    let ehlo = await ordenar(sesion, `EHLO ${NOMBRE_CLIENTE}`, [250], "EHLO")

    if (config.seguridad === "tls") {
      if (!/starttls/i.test(ehlo)) {
        throw new Error("el servidor SMTP no ofrece STARTTLS y CF exige TLS")
      }
      await ordenar(sesion, "STARTTLS", [220], "STARTTLS")
      sesion.buzon.soltar()
      const seguro = conectarTls({ socket: sesion.socket, servername: servidor })
      seguro.on("error", () => {})
      sesion.socket = seguro
      sesion.buzon = new BuzonSMTP(seguro)
      await esperarHandshake(seguro)
      ehlo = await ordenar(sesion, `EHLO ${NOMBRE_CLIENTE}`, [250], "EHLO (TLS)")
    }

    await autenticar(sesion, config.user, secreto, mecanismosAuth(ehlo))

    await ordenar(sesion, `MAIL FROM:${direccion(config.from)}`, [250], "MAIL FROM")
    for (const destinatario of [mensaje.to, ...config.bcc]) {
      await ordenar(sesion, `RCPT TO:${direccion(destinatario)}`, [250, 251], "RCPT TO")
    }

    await ordenar(sesion, "DATA", [354], "DATA")
    const messageId = messageIdPara(config.from)
    sesion.socket.write(armarMensaje(config, mensaje, messageId))
    const final = await ordenar(sesion, ".", [250], "Recepción del mensaje")

    await ordenar(sesion, "QUIT", [221], "QUIT").catch(() => "")
    return { messageId: idDelServidor(final, messageId) }
  })()
  // La conversación se corta por timeout: no debe quedar como rechazo huérfano.
  conversacion.catch(() => {})

  let temporizador: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(new Error(`la conexión SMTP agotó el tiempo de espera (${tiempoLimiteMs} ms)`)),
      tiempoLimiteMs
    )
  })
  try {
    return await Promise.race([conversacion, limite])
  } finally {
    if (temporizador) clearTimeout(temporizador)
    sesion.buzon.soltar()
    sesion.socket.destroy()
    if (sesion.socket !== socketInicial) socketInicial.destroy()
  }
}
