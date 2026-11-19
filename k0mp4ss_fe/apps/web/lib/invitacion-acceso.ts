/**
 * lib/invitacion-acceso.ts — la invitación de acceso (F42 · T1 · S4).
 *
 * El administrador nunca conoce la contraseña de nadie. El alta emite un enlace
 * de un solo uso y con vencimiento; la persona define su contraseña al abrirlo.
 * Este módulo es la única puerta de esa mecánica:
 *
 * - **Token en claro fuera de la base.** 32 bytes aleatorios (base64url) y en la
 *   tabla solo su SHA-256 hex. Alta entropía ⇒ el hash rápido es suficiente: no
 *   hay diccionario que atacar. Un dump de `invitaciones_acceso` no abre nada.
 * - **Comparación segura.** El token recibido se hashea y se compara con
 *   `timingSafeEqual`, no con `===`, para no medir prefijos por tiempo.
 * - **Un solo uso, sin carreras.** El consumo marca `usadoEn` con un
 *   `updateMany` condicionado (`usadoEn: null` y `expiraEn` futuro) dentro de la
 *   MISMA transacción que escribe `passwordHash`. Dos canjes simultáneos del
 *   mismo enlace: uno solo cuenta 1, el otro cuenta 0 y no escribe nada.
 * - **Vencido no sirve en absoluto.** La condición de vencimiento está en el
 *   `where` del consumo, no en un `if` que otra rama pueda saltear.
 * - **El secreto se revela una sola vez, al administrador (L4).** Emitir la
 *   invitación entrega el token a quien lo va a TRANSPORTAR, y la ruta del alta o
 *   del reenvío lo convierte con `enlaceInvitacionDeAcceso(...)`: esa respuesta es
 *   la ÚNICA que lo incluye, para el administrador autenticado de la comunidad.
 *   Desde F43 el enlace también viaja en el correo de bienvenida que sale en el
 *   mismo acto (`lib/correo-bienvenida.ts`), pero el correo es un atajo: si queda
 *   `pendiente` o `fallido`, la respuesta es la puerta que queda. El estado que
 *   devuelve el listado (`InvitacionAccesoPublica`) no tiene token ni hash, y
 *   ninguna lectura posterior puede reconstruirlo: en la base sólo vive su
 *   SHA-256.
 *
 * Sin invitación no hay alta: la cuenta nace sin `passwordHash`, así que el
 * login la rechaza (`lib/auth.ts:111-114`) hasta que este módulo la habilita.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { registrarEventoAuditoria } from "@/lib/auditoria"

/** Vigencia del enlace: 72 h. Una invitación es un trámite, no una credencial permanente. */
export const VIGENCIA_INVITACION_MS = 72 * 60 * 60 * 1000

/**
 * Un único rechazo para token inventado, vencido y ya usado. Distinguirlos le
 * diría a quien prueba enlaces si un token existió, que es justo lo que no se
 * quiere contar por una ruta sin sesión.
 */
export const MENSAJE_INVITACION_INVALIDA =
  "La invitación no es válida o ya venció."

/** Categoría de bitácora de las cuentas de acceso (misma en alta y en uso). */
export const CATEGORIA_AUDITORIA_CUENTAS = "usuarios"

/** Costo bcrypt: el mismo que usa el resto del repo (`lib/seed-authz.ts:65`). */
const COSTO_BCRYPT = 10

export type EstadoInvitacion = "pendiente" | "usada" | "vencida"

/**
 * Estados del envío del correo de bienvenida de ESTA invitación (F43). Son los de
 * `ESTADOS_ENTREGA_AVISO` menos `entregado`: esa palabra describe la entrega que
 * prueba una `Notificacion` del visor, y el correo no crea ninguna.
 */
export const ESTADOS_ENVIO_INVITACION = ["enviado", "pendiente", "fallido"] as const
export type EstadoEnvioInvitacion = (typeof ESTADOS_ENVIO_INVITACION)[number]

/**
 * La constancia del envío, en la proyección pública. `enviadoEn` sólo lleva fecha
 * cuando el servidor aceptó el mensaje: un `pendiente` o un `fallido` no se
 * fechan como enviados. Nunca contiene el token ni el enlace.
 */
export interface EnvioInvitacionPublico {
  estado: EstadoEnvioInvitacion
  motivo: string | null
  enviadoEn: string | null
}

/**
 * Forma PÚBLICA de una invitación: lo único que puede salir por una respuesta.
 * No tiene token, ni hash, ni `usuarioId`: el estado y la constancia del envío se
 * leen para mostrarlos.
 */
export interface InvitacionAccesoPublica {
  id: string
  estado: EstadoInvitacion
  expiraEn: string
  usadoEn: string | null
  creadoEn: string
  /**
   * Constancia del correo de bienvenida de ESTA invitación, o `null` cuando
   * todavía no hubo intento (una fila recién emitida, o una anterior a F43).
   * `null` no es `pendiente`: `pendiente` es un intento con la cola sin emisor.
   */
  envio: EnvioInvitacionPublico | null
}

/** Cliente Prisma mínimo: el singleton o el `tx` de `prisma.$transaction`. */
export type ClienteInvitacion = Pick<typeof prisma, "invitacionAcceso">

type FilaInvitacion = {
  id: string
  expiraEn: Date
  usadoEn: Date | null
  createdAt: Date
  envioEstado: string | null
  envioMotivo: string | null
  envioEn: Date | null
}

/**
 * Estado derivado de los dos hechos persistidos. `usada` gana sobre `vencida`:
 * un enlace usado sigue usado aunque después pase la fecha.
 */
export function estadoInvitacion(
  fila: Pick<FilaInvitacion, "expiraEn" | "usadoEn">,
  ahora: Date = new Date()
): EstadoInvitacion {
  if (fila.usadoEn) return "usada"
  return fila.expiraEn.getTime() <= ahora.getTime() ? "vencida" : "pendiente"
}

/** `true` sólo para los estados que esta constancia puede escribir. */
function esEstadoEnvioInvitacion(valor: string): valor is EstadoEnvioInvitacion {
  return (ESTADOS_ENVIO_INVITACION as readonly string[]).includes(valor)
}

/**
 * Constancia pública del envío de una fila. Un estado fuera del catálogo —dato
 * escrito por fuera de la API— se proyecta como ausencia de constancia: no se
 * traduce a una promesa que la plataforma no puede sostener.
 */
export function envioInvitacionPublico(
  fila: Pick<FilaInvitacion, "envioEstado" | "envioMotivo" | "envioEn">
): EnvioInvitacionPublico | null {
  const estado = fila.envioEstado
  if (estado === null || !esEstadoEnvioInvitacion(estado)) return null
  return {
    estado,
    motivo: fila.envioMotivo,
    enviadoEn: fila.envioEn ? fila.envioEn.toISOString() : null,
  }
}

/** Proyección pública de una fila (sin secreto y con fechas ISO). */
export function invitacionPublica(
  fila: FilaInvitacion,
  ahora: Date = new Date()
): InvitacionAccesoPublica {
  return {
    id: fila.id,
    estado: estadoInvitacion(fila, ahora),
    expiraEn: fila.expiraEn.toISOString(),
    usadoEn: fila.usadoEn ? fila.usadoEn.toISOString() : null,
    creadoEn: fila.createdAt.toISOString(),
    envio: envioInvitacionPublico(fila),
  }
}

/** Token en claro: 32 bytes aleatorios en base64url (URL-safe, 43 caracteres). */
export function generarTokenInvitacion(): string {
  return randomBytes(32).toString("base64url")
}

/** Lo que se persiste: SHA-256 hex del token. Nunca el token. */
export function hashearTokenInvitacion(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

/**
 * Ruta de la página pública donde el invitado define su contraseña. Es la que
 * `app/invitacion/page.tsx` lee (`?token=…`) y la que arma el script del primer
 * arranque (`scripts/crear-admin.mjs`).
 */
export const RUTA_PAGINA_INVITACION = "/invitacion"

/**
 * Enlace completo que la administración entrega (L4). Se arma en la MISMA
 * respuesta que emite la invitación, porque es el único momento en que el token
 * en claro existe fuera de la base: después sólo queda su hash y no hay forma de
 * recuperarlo.
 *
 * `origen` es el origen público de la petición (`new URL(request.url).origin`),
 * así el enlace sirve tal cual en el navegador de quien lo recibe.
 */
export function enlaceInvitacionDeAcceso(token: string, origen: string): string {
  return `${origen.replace(/\/+$/, "")}${RUTA_PAGINA_INVITACION}?token=${encodeURIComponent(token)}`
}

/**
 * Comparación en tiempo constante de dos hashes hex. Devuelve false —sin lanzar—
 * si alguno no tiene la forma esperada, para que la ruta no convierta un token
 * basura en un 500.
 */
export function tokensCoinciden(a: string, b: string): boolean {
  const HEX_64 = /^[a-f0-9]{64}$/
  if (!HEX_64.test(a) || !HEX_64.test(b)) return false
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
}

/**
 * Emite una invitación para una cuenta ya creada y devuelve el token en claro a
 * quien la va a transportar. La respuesta de esa escritura lo convierte en el
 * enlace completo que la administración entrega UNA vez (L4); ninguna lectura
 * posterior lo devuelve.
 *
 * `client` acepta el `tx` del alta para que cuenta, membresía e invitación caigan
 * o suban juntas (S3).
 */
export async function crearInvitacionDeAcceso(datos: {
  usuarioId: string
  comunidadId: string
  creadoPor: string
  ahora?: Date
  vigenciaMs?: number
  client?: ClienteInvitacion
}): Promise<{ invitacion: InvitacionAccesoPublica; token: string }> {
  const ahora = datos.ahora ?? new Date()
  const token = generarTokenInvitacion()
  const fila = await (datos.client ?? prisma).invitacionAcceso.create({
    data: {
      usuarioId: datos.usuarioId,
      comunidadId: datos.comunidadId,
      tokenHash: hashearTokenInvitacion(token),
      expiraEn: new Date(
        ahora.getTime() + (datos.vigenciaMs ?? VIGENCIA_INVITACION_MS)
      ),
      creadoPor: datos.creadoPor,
    },
  })
  return { invitacion: invitacionPublica(fila, ahora), token }
}

export type ResultadoDefinirPassword =
  | { ok: true; usuarioId: string }
  | { ok: false }

/**
 * Consume el enlace: valida el token, marca `usadoEn` y define la contraseña de
 * la cuenta, todo en una transacción. El rastro (S5) se escribe en la misma
 * transacción: si el evento no se puede dejar, el enlace no se consume y la
 * contraseña no se escribe.
 *
 * La política de contraseñas no se valida acá: es la que ya existe en
 * `lib/password-policy.ts` y la aplica el llamador antes de llegar.
 */
export async function definirPasswordConInvitacion(datos: {
  token: string
  password: string
  ahora?: Date
}): Promise<ResultadoDefinirPassword> {
  const ahora = datos.ahora ?? new Date()
  const hashRecibido = hashearTokenInvitacion(datos.token)
  const fila = await prisma.invitacionAcceso.findUnique({
    where: { tokenHash: hashRecibido },
  })
  // Inexistente y hash que no coincide son el mismo hecho: no hay enlace.
  if (!fila || !tokensCoinciden(hashRecibido, fila.tokenHash)) return { ok: false }
  // Chequeo barato antes de gastar bcrypt; el `where` de abajo es el que manda.
  if (estadoInvitacion(fila, ahora) !== "pendiente") return { ok: false }

  const passwordHash = await bcrypt.hash(datos.password, COSTO_BCRYPT)

  return prisma.$transaction(async (tx) => {
    const marcada = await tx.invitacionAcceso.updateMany({
      where: {
        id: fila.id,
        usadoEn: null,
        expiraEn: { gt: ahora },
      },
      data: { usadoEn: ahora },
    })
    // 0 ⇒ otro canje ganó la carrera o el enlace venció entre la lectura y acá.
    if (marcada.count !== 1) return { ok: false }

    await tx.usuario.update({
      where: { id: fila.usuarioId },
      data: {
        passwordHash,
        // Una contraseña nueva no convive con sesiones viejas: misma invalidación que
        // el PATCH al cambiar rol o desactivar. En el alta no hay sesiones todavía,
        // pero el reenvío de T2 sobre una cuenta en uso sí necesita este corte.
        tokenVersion: { increment: 1 },
      },
    })

    await registrarEventoAuditoria(
      {
        id: randomUUID(),
        comunidadId: fila.comunidadId,
        timestamp: ahora.toISOString(),
        usuario: fila.usuarioId,
        categoria: CATEGORIA_AUDITORIA_CUENTAS,
        tipoAccion: "invitacion_usada",
        referenciaId: fila.usuarioId,
        descripcion:
          "La persona definió su contraseña con la invitación de acceso de un solo uso.",
      },
      tx
    )

    return { ok: true as const, usuarioId: fila.usuarioId }
  })
}
