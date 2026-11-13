/**
 * lib/correo-comunidad.ts — la credencial de correo de UNA comunidad, resuelta
 * en UN solo lugar (F33).
 *
 * Por qué existe: la credencial cifrada (`CredencialCorreoComunidad`) y el emisor
 * SMTP existían por separado, y cada llamador tenía que acordarse de resolverla y
 * descifrarla. Ese olvido no falla: cae en silencio a la contraseña global
 * `SMTP_PASSWORD` y el correo sale con el buzón equivocado. Por eso la resolución
 * vive acá, como única lectura de la tabla, y la ejecuta el emisor
 * (`enviarCorreoComunidad` de `lib/smtp.ts`) justo donde el mensaje se manda.
 *
 * Decisiones que no se reinterpretan:
 * - **El secreto se descifra en memoria y muere con el envío.** No se guarda, no
 *   se loguea, no se devuelve y no entra en ningún motivo ni en ningún error.
 * - **La clave maestra vive SOLO en `process.env.CLAVE_MAESTRA_SECRETOS`.** Sin
 *   ella, o con una que no mide 32 bytes, no hay reemplazo ni clave derivada: se
 *   devuelve `clave_maestra_ausente` y quien llama decide (hoy: el camino global,
 *   con el motivo escrito en la cola de salida).
 * - **Tres motivos, no uno.** `comunidad_sin_credencial` (no hay fila),
 *   `clave_maestra_ausente` (la variable falta o no sirve) y
 *   `credencial_ilegible` (el paquete guardado no se abre). Distinguirlos es lo
 *   que permite que el registro diga la verdad en vez de un «sin emisor» genérico.
 * - **Esta función no lanza por clave ni por paquete**: devuelve el motivo. Una
 *   excepción de la base SÍ sube, porque no poder leer la fila no es lo mismo que
 *   no tener credencial y no se puede declarar ninguna de las dos cosas.
 * - **Una sola fila por comunidad** (`comunidadId` es único en el modelo): la
 *   consulta no elige entre varias ni ordena nada.
 */
import { prisma } from "@/lib/prisma"
import {
  descifrarSecreto,
  estadoClaveMaestra,
  type EntornoCifrado,
} from "@/lib/cifrado-secretos"
import type { CredencialSMTP } from "@/lib/smtp"

/** No hay fila de credencial para la comunidad. */
export const MOTIVO_COMUNIDAD_SIN_CREDENCIAL = "comunidad_sin_credencial"
/** La clave maestra del servidor falta o no mide 32 bytes. */
export const MOTIVO_CLAVE_MAESTRA_AUSENTE = "clave_maestra_ausente"
/** La fila existe pero el paquete cifrado no se puede abrir. */
export const MOTIVO_CREDENCIAL_ILEGIBLE = "credencial_ilegible"

/** Por qué el envío NO usó la credencial de la comunidad. */
export type MotivoCredencialGlobal =
  | typeof MOTIVO_COMUNIDAD_SIN_CREDENCIAL
  | typeof MOTIVO_CLAVE_MAESTRA_AUSENTE
  | typeof MOTIVO_CREDENCIAL_ILEGIBLE

/**
 * Explicación en prosa de cada motivo, para el texto que se persiste junto al
 * envío. El identificador entre paréntesis es el mismo que devuelve esta función:
 * quien lee la fila ve el hecho y el código que lo clasifica.
 */
export const EXPLICACION_MOTIVO_GLOBAL: Record<MotivoCredencialGlobal, string> = {
  [MOTIVO_COMUNIDAD_SIN_CREDENCIAL]:
    "la comunidad no tiene credencial de correo guardada (comunidad_sin_credencial)",
  [MOTIVO_CLAVE_MAESTRA_AUSENTE]:
    "falta la clave maestra de secretos del servidor o no es válida, así que la credencial de la comunidad no se puede descifrar (clave_maestra_ausente)",
  [MOTIVO_CREDENCIAL_ILEGIBLE]:
    "la credencial de correo guardada no se pudo descifrar con la clave maestra del servidor (credencial_ilegible)",
}

/** O la credencial utilizable, o el motivo por el que no la hay. Nunca las dos. */
export type ResolucionCredencialComunidad =
  | { ok: true; credencial: CredencialSMTP }
  | { ok: false; motivo: MotivoCredencialGlobal }

/**
 * Resuelve la credencial SMTP de la comunidad con el secreto YA descifrado.
 *
 * No lanza por clave ausente, clave inválida ni paquete ilegible: cada caso es un
 * motivo distinto. Lanza solo si la base no responde, porque ahí no se sabe si la
 * comunidad tiene credencial y declarar cualquiera de los dos sería inventar.
 */
export async function resolverCredencialDeComunidad(
  comunidadId: string,
  entorno: EntornoCifrado = process.env
): Promise<ResolucionCredencialComunidad> {
  const fila = await prisma.credencialCorreoComunidad.findUnique({
    where: { comunidadId },
    select: {
      host: true,
      puerto: true,
      usuario: true,
      secretoCifrado: true,
      iv: true,
      authTag: true,
    },
  })
  if (!fila) return { ok: false, motivo: MOTIVO_COMUNIDAD_SIN_CREDENCIAL }

  // Se mira la clave ANTES de descifrar para no confundir un despliegue sin la
  // variable con un paquete alterado: los dos fallan, pero no son el mismo hecho.
  if (estadoClaveMaestra(entorno) !== "valida") {
    return { ok: false, motivo: MOTIVO_CLAVE_MAESTRA_AUSENTE }
  }

  try {
    const secreto = descifrarSecreto(
      { secretoCifrado: fila.secretoCifrado, iv: fila.iv, authTag: fila.authTag },
      entorno
    )
    return {
      ok: true,
      credencial: {
        host: fila.host,
        puerto: fila.puerto,
        usuario: fila.usuario,
        secreto,
      },
    }
  } catch {
    // GCM no abre el paquete: clave maestra distinta, dato alterado o paquete
    // mal formado. No se devuelve nada parcial y no se reintenta con la global
    // acá: el emisor decide y deja el motivo escrito.
    return { ok: false, motivo: MOTIVO_CREDENCIAL_ILEGIBLE }
  }
}
