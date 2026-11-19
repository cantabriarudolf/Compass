/**
 * lib/correo-bienvenida.ts — el correo de bienvenida al emitir una invitación (F43).
 *
 * El alta crea la cuenta sin contraseña y entrega un enlace de un solo uso; el
 * invitado no se entera si nadie se lo cuenta. Este módulo es el mensaje y su
 * constancia, con tres reglas que no se reinterpretan:
 *
 * 1. **El texto está cerrado y no cita la ley.** Sale tal cual de la redacción
 *    aprobada en `odd/tasks/correo-de-bienvenida.md` («Texto del correo»): lleva
 *    nombre, comunidad, rol, qué puede hacer el rol y el enlace. La base legal
 *    vive en `specs/AU-autenticacion-sesion/spec.md` y en el manual del módulo,
 *    no en la bandeja del invitado: un correo con «art. 21» no lo lee nadie y
 *    envejece mal. Un test falla si aparece una cita.
 * 2. **Las viñetas salen de la matriz (S8).** Cada viñeta declara el par
 *    (acción, recurso) que `puede()` concede. El texto NO se genera desde la
 *    matriz —la matriz no tiene prosa—, pero se pinea contra ella: un test falla
 *    si el rol pierde la capacidad que la viñeta promete. Un correo que promete
 *    permisos que el motor niega es peor que no mandar correo. Además, el envío
 *    filtra por `puede()`: si la concesión desapareciera en caliente, el correo
 *    dice menos, nunca miente, y jamás rellena con una viñeta vacía.
 * 3. **La constancia no miente y no lleva el secreto.** Se reusa
 *    `planDeCanal("email", …)` de `lib/entrega-aviso.ts`: `enviado` sólo si el
 *    servidor aceptó el mensaje, `fallido` con el motivo del servidor y
 *    `pendiente` con `MOTIVO_SIN_SMTP` cuando la comunidad no tiene emisor. El
 *    resultado se escribe en la fila de `InvitacionAcceso` (el historial es la
 *    cadena de invitaciones) y el enlace/token se redactan del motivo antes de
 *    persistir: el cuerpo del correo sólo existe en memoria durante el envío.
 *
 * El envío corre SIEMPRE fuera de la transacción que emite la invitación: el
 * diálogo SMTP no retiene el lock de la base y una falla del correo no puede
 * deshacer la cuenta ni el enlace (el correo es un atajo, no la única puerta).
 */
import { puede, type Accion, type Recurso, type Rol } from "@/lib/authz"
import { planDeCanal } from "@/lib/entrega-aviso"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import type { EstadoEntregaAviso } from "@/lib/schemas"

/** Máximo de viñetas por rol: tres. Se eligen las más consecuentes, no se rellena. */
export const MAX_VINETAS_POR_ROL = 3

/**
 * Estados del envío del correo de bienvenida. Son los de `ESTADOS_ENTREGA_AVISO`
 * menos `entregado`: esa palabra describe la entrega que prueba una
 * `Notificacion` del visor, y el correo no crea ninguna.
 */
export const ESTADOS_ENVIO_BIENVENIDA = ["enviado", "pendiente", "fallido"] as const
export type EstadoEnvioBienvenida = (typeof ESTADOS_ENVIO_BIENVENIDA)[number]

/** Cómo se nombra cada rol en el correo (el rol técnico no se muestra crudo). */
export const ETIQUETA_ROL: Record<Rol, string> = {
  administrador: "administrador",
  comite: "comité",
  conserjeria: "conserjería",
  residente: "residente",
  mantencion: "mantención",
}

/**
 * Párrafo por rol: qué implica el rol en lenguaje llano. Sale de la redacción
 * cerrada; conserjería y mantención se declaran criterio del proyecto, no
 * obligación legal, porque no tienen obligación legal asociada.
 */
export const PARRAFO_POR_ROL: Record<Rol, string> = {
  administrador:
    "Como administrador te toca custodiar el archivo de la comunidad y rendir cuentas: todos los meses al comité y al menos una vez al año a la asamblea. En la plataforma eso significa decidir sobre las finanzas, las personas y la configuración de la comunidad.",
  comite:
    "El comité ejerce las facultades de la asamblea, salvo las materias que la ley reserva a una sesión extraordinaria. Recibes la cuenta mensual del administrador y la revisas antes de que se vote.",
  residente:
    "Ves tus unidades, tus gastos y tus trámites. No ves los datos de las demás personas de la comunidad: la plataforma trata los datos personales según la normativa vigente, así que cada vecino ve lo suyo.",
  conserjeria:
    "Este rol no nace de la ley sino de cómo esta comunidad decidió organizarse: registro de visitas, novedades y lo operativo del día a día.",
  mantencion:
    "Este rol no nace de la ley sino de cómo esta comunidad decidió organizarse: los trabajos y las órdenes de trabajo que se te asignan.",
}

/** Una viñeta declarada: el texto que se manda y la capacidad que lo respalda. */
export interface VinetaDeclarada {
  accion: Accion
  recurso: Recurso
  texto: string
}

/**
 * Las viñetas de cada rol, con el par (acción, recurso) que las respalda. Se
 * eligen las tres más consecuentes del mapa de recursos; tres es el tope y no se
 * agrega relleno. `test/lib/correo-bienvenida.test.ts` pinea cada par contra
 * `puede()`: si una concesión se pierde, el test nombra el rol y la capacidad.
 */
export const VINETAS_POR_ROL: Record<Rol, readonly VinetaDeclarada[]> = {
  administrador: [
    {
      accion: "crear",
      recurso: "fi:gasto_comun",
      texto: "Emitir el gasto común y los avisos de cobro de la comunidad.",
    },
    {
      accion: "crear",
      recurso: "admin:usuarios",
      texto: "Crear cuentas de acceso y asignar el rol de cada persona.",
    },
    {
      accion: "crear",
      recurso: "doc",
      texto: "Subir y ordenar los documentos del archivo de la comunidad.",
    },
  ],
  comite: [
    {
      accion: "ver",
      recurso: "fi:gasto_comun",
      texto: "Revisar los avisos de cobro y los presupuestos de la comunidad.",
    },
    {
      accion: "ver",
      recurso: "gd",
      texto: "Leer las actas de la asamblea y del comité.",
    },
    {
      accion: "ver",
      recurso: "am",
      texto: "Revisar la auditoría de los actos de la comunidad.",
    },
  ],
  residente: [
    {
      accion: "ver",
      recurso: "fi:aviso:propio",
      texto: "Ver los avisos de cobro de tus unidades.",
    },
    {
      accion: "editar",
      recurso: "mp:propios",
      texto: "Mantener al día tus datos personales.",
    },
    {
      accion: "crear",
      recurso: "ct:residencia",
      texto: "Emitir tu certificado de residencia.",
    },
  ],
  conserjeria: [
    {
      accion: "crear",
      recurso: "pe:bitacora",
      texto: "Registrar las visitas y las novedades del portón.",
    },
    {
      accion: "editar",
      recurso: "pe:encomienda",
      texto: "Recibir y entregar las encomiendas.",
    },
    {
      accion: "ejecutar",
      recurso: "pe:cierre_turno",
      texto: "Iniciar y cerrar el turno.",
    },
  ],
  mantencion: [
    {
      accion: "ver",
      recurso: "mt",
      texto: "Ver las tareas y los proyectos de mantención que se te asignan.",
    },
    {
      accion: "ejecutar",
      recurso: "mt",
      texto: "Cerrar las tareas cuando el trabajo está hecho.",
    },
    {
      accion: "editar",
      recurso: "ir:mantenimiento",
      texto: "Entregar los insumos del inventario y resolver comodines.",
    },
  ],
}

/**
 * Filtra las viñetas candidatas por lo que el rol puede de verdad. Devuelve sólo
 * texto: una viñeta sin concesión no se manda y una viñeta vacía tampoco existe.
 */
export function vinetasConcedidas(
  rol: string,
  vinetas: readonly VinetaDeclarada[]
): string[] {
  return vinetas
    .filter((vineta) => vineta.texto.trim() !== "" && puede(rol, vineta.accion, vineta.recurso))
    .map((vineta) => vineta.texto.trim())
}

/** Las viñetas que el rol puede ejercer, en el orden declarado (máximo tres). */
export function vinetasDelRol(rol: Rol): string[] {
  return vinetasConcedidas(rol, VINETAS_POR_ROL[rol]).slice(0, MAX_VINETAS_POR_ROL)
}

/**
 * El bloque «Tu rol es …» con sus viñetas. Sin viñetas queda sólo la oración del
 * rol: nunca un encabezado con dos puntos colgado ni un renglón `- ` vacío.
 */
export function bloqueDeVinetas(rol: Rol, vinetas: readonly string[]): string {
  const cabecera = `Tu rol es ${ETIQUETA_ROL[rol]}.`
  const limpias = vinetas
    .map((vineta) => vineta.trim())
    .filter((vineta) => vineta !== "")
    .slice(0, MAX_VINETAS_POR_ROL)
  if (limpias.length === 0) return cabecera
  return [
    `${cabecera} Esto es lo que puedes hacer con él:`,
    "",
    ...limpias.map((vineta) => `- ${vineta}`),
  ].join("\n")
}

/** Asunto del correo: nombra la comunidad y el producto. */
export function asuntoBienvenida(datos: { comunidad: string }): string {
  return `Tu acceso a ${datos.comunidad} en Compass`
}

/**
 * Cuerpo del correo, texto plano, con la redacción cerrada. El servidor
 * completa nombre, comunidad, rol y enlace; no hay secciones extra.
 */
export function cuerpoBienvenida(datos: {
  nombre: string
  comunidad: string
  rol: Rol
  enlace: string
}): string {
  return [
    `Hola ${datos.nombre}:`,
    "",
    `La administración de ${datos.comunidad} te creó una cuenta en Compass, la plataforma con la`,
    "que la comunidad maneja sus finanzas, sus trámites y su comunicación.",
    "",
    bloqueDeVinetas(datos.rol, vinetasDelRol(datos.rol)),
    "",
    PARRAFO_POR_ROL[datos.rol],
    "",
    "Para entrar, define tu contraseña acá:",
    "",
    datos.enlace,
    "",
    "El enlace sirve una sola vez y vence en 72 horas. Si se vence, pídele a la",
    "administración que te lo reenvíe.",
    "",
    `Si no esperabas este correo, avísale a la administración de ${datos.comunidad}.`,
  ].join("\n")
}

/** Motivo del intento que ni siquiera devolvió un desenlace del emisor. */
export const MOTIVO_ENVIO_INTERRUMPIDO =
  "El envío del correo de bienvenida no se pudo completar: el emisor no devolvió un desenlace."

/** Token en claro que viaja en el enlace (`?token=…`); vacío si no lo trae. */
function tokenDelEnlace(enlace: string): string {
  try {
    return new URL(enlace).searchParams.get("token") ?? ""
  } catch {
    return ""
  }
}

/**
 * Redacta del motivo el enlace completo y el token. El motivo de un rebote lo
 * escribe el servidor SMTP, así que puede traer cualquier texto: lo que no puede
 * llegar a la base es el secreto que abre la cuenta. Un motivo sin el enlace se
 * devuelve intacto.
 */
export function sinEnlaceEnElMotivo(
  motivo: string | null,
  enlace: string
): string | null {
  if (motivo === null) return null
  let limpio = motivo
  if (enlace !== "") limpio = limpio.split(enlace).join("")
  const token = tokenDelEnlace(enlace)
  if (token !== "") limpio = limpio.split(token).join("")
  // Si el servidor devolvió sólo la query del enlace (sin el origen), el valor
  // del token sigue ahí: se reemplaza el valor, no la palabra.
  return limpio.replace(/(token=)[^\s&"')]+/gi, "$1[redactado]")
}

/**
 * Traduce el desenlace del canal email a los estados de esta constancia.
 * `entregado` es del visor y el canal email no lo produce; si apareciera, el
 * hecho real es que el correo no salió.
 */
function estadoDelCorreo(estado: EstadoEntregaAviso): EstadoEnvioBienvenida {
  if (estado === "enviado" || estado === "pendiente" || estado === "fallido") {
    return estado
  }
  return "fallido"
}

/** Lo que necesita el envío: la invitación que deja constancia y el mensaje. */
export interface DatosEnvioBienvenida {
  /** Fila de `InvitacionAcceso` que registra ESTE intento (una por invitación). */
  invitacionId: string
  comunidadId: string
  /** Nombre de la comunidad, para el asunto y el cuerpo. */
  comunidad: string
  /** Correo de la cuenta; vacío o `null` = no hay a quién mandarle. */
  destinatario: string | null
  nombre: string
  rol: Rol
  /** Enlace en claro de la invitación: sólo existe en el instante del envío. */
  enlace: string
  ahora?: Date
}

/** La constancia tal como queda escrita (y tal como la lee la pantalla). */
export interface ConstanciaEnvioBienvenida {
  estado: EstadoEnvioBienvenida
  motivo: string | null
  /** ISO sólo cuando el servidor aceptó el mensaje; null en `pendiente` y `fallido`. */
  enviadoEn: string | null
}

/**
 * Manda el correo de bienvenida de UNA invitación y escribe su constancia.
 *
 * Corre fuera de la transacción del alta o del reenvío. No lanza: un envío que
 * falla —o una constancia que no se puede guardar— no puede deshacer la cuenta
 * ni el enlace. Si la fila no se puede actualizar queda el rastro en el log y la
 * respuesta al administrador sigue trayendo el enlace.
 */
export async function enviarBienvenida(
  datos: DatosEnvioBienvenida
): Promise<ConstanciaEnvioBienvenida> {
  let estado: EstadoEnvioBienvenida
  let motivo: string | null

  try {
    const plan = await planDeCanal("email", {
      email: {
        comunidadId: datos.comunidadId,
        destinatario: datos.destinatario,
        asunto: asuntoBienvenida({ comunidad: datos.comunidad }),
        cuerpo: cuerpoBienvenida({
          nombre: datos.nombre,
          comunidad: datos.comunidad,
          rol: datos.rol,
          enlace: datos.enlace,
        }),
      },
    })
    estado = estadoDelCorreo(plan.estado)
    motivo = sinEnlaceEnElMotivo(plan.motivo, datos.enlace)
  } catch {
    // El emisor devolvió una excepción en vez de un desenlace: se declara
    // fallido, nunca enviado, y el motivo no repite el cuerpo del mensaje.
    estado = "fallido"
    motivo = MOTIVO_ENVIO_INTERRUMPIDO
  }

  const enviadoEn = estado === "enviado" ? (datos.ahora ?? new Date()) : null

  try {
    await prisma.invitacionAcceso.update({
      where: { id: datos.invitacionId },
      data: { envioEstado: estado, envioMotivo: motivo, envioEn: enviadoEn },
    })
  } catch {
    logger.warn(
      {
        event: "INVITACION_ENVIO_SIN_CONSTANCIA",
        invitacionId: datos.invitacionId,
        estado,
      },
      "[f43] no se pudo guardar la constancia del correo de bienvenida"
    )
  }

  return { estado, motivo, enviadoEn: enviadoEn ? enviadoEn.toISOString() : null }
}
