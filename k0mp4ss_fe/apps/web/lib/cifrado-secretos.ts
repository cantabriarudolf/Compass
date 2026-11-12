/**
 * lib/cifrado-secretos.ts — cifrado de SECRETOS en reposo con clave maestra del
 * entorno (F33, `specs/PENDIENTES-FUNCIONALIDAD.md`: credenciales de correo por
 * comunidad).
 *
 * Por qué un módulo propio y no `lib/crypto.ts`: aquel protege datos sensibles
 * genéricos y, sin `CLAVE_CIFRADO_DATOS`, usa una clave dummy en dev/test y solo
 * falla en producción. Un secreto de autenticación no admite ese atajo: si la
 * clave maestra no está, no se guarda ni se envía nada, en ningún entorno. Este
 * módulo es el mismo algoritmo (AES-256-GCM, IV aleatorio por valor, tag de
 * autenticación) con la política estricta y una variable distinta, para que las
 * dos claves puedan rotarse por separado.
 *
 * Decisiones que no se reinterpretan:
 * - **La clave maestra vive SOLO en `process.env.CLAVE_MAESTRA_SECRETOS`.** No se
 *   lee de la base, no se persiste, no entra en los backups, no se devuelve y no
 *   se loguea. Sin ella el sistema falla cerrado: `cifrarSecreto` y
 *   `descifrarSecreto` lanzan, así que no existe un camino que guarde el texto
 *   plano "porque faltaba la clave".
 * - **Formato de la clave**: 32 bytes, en hex (64 caracteres) o en base64 (44 con
 *   relleno). Se rechaza cualquier otra cosa, incluida una clave de 32 caracteres
 *   crudos: base64 de 32 caracteres decodifica 24 bytes y aceptarla derivaría una
 *   clave más corta de lo que el operador cree.
 * - **IV de 12 bytes por llamada** (recomendación NIST para GCM) y tag de 16
 *   bytes guardados junto al ciphertext: el mismo secreto cifrado dos veces da
 *   paquetes distintos, así que la base no revela que dos comunidades comparten
 *   contraseña.
 * - **GCM autentica**: ciphertext, IV o tag alterados en un byte lanzan
 *   `SecretoIlegibleError` en vez de devolver basura a medias.
 * - **Ningún mensaje de error lleva el secreto**: los textos son fijos y nombran
 *   la variable o el paquete, nunca el valor.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/** Variable de entorno de la que sale la clave maestra. Nunca se guarda. */
export const VARIABLE_CLAVE_MAESTRA = "CLAVE_MAESTRA_SECRETOS"

/** AES-256-GCM: la clave mide exactamente 32 bytes. */
export const LONGITUD_CLAVE_BYTES = 32

/** IV de 12 bytes (NIST SP 800-38D), único por cifrado. */
const LONGITUD_IV_BYTES = 12

/** Tag de autenticación de GCM: 16 bytes. */
const LONGITUD_TAG_BYTES = 16

/** Entorno inyectable (en producción es `process.env`; los tests pasan el suyo). */
export type EntornoCifrado = { [variable: string]: string | undefined }

/**
 * Estado de la clave maestra. `ausente` y `invalida` son fallas de despliegue:
 * el llamador las traduce a un error explícito y no escribe nada.
 */
export type EstadoClaveMaestra = "valida" | "ausente" | "invalida"

/**
 * Paquete cifrado de un secreto, tal como se persiste: las tres columnas de la
 * fila (`secretoCifrado`, `iv`, `authTag`), en base64url.
 */
export interface PaqueteSecreto {
  secretoCifrado: string
  iv: string
  authTag: string
}

/** Falla de despliegue: falta la variable de la clave maestra. */
export class ClaveMaestraAusenteError extends Error {
  readonly codigo = "CLAVE_MAESTRA_AUSENTE"
  constructor() {
    super(
      "Falta la clave maestra de secretos: definí la variable de entorno " +
        VARIABLE_CLAVE_MAESTRA +
        " en el servidor. Sin ella no se puede cifrar ni descifrar una credencial."
    )
    this.name = "ClaveMaestraAusenteError"
  }
}

/** Falla de despliegue: la clave maestra no mide 32 bytes. */
export class ClaveMaestraInvalidaError extends Error {
  readonly codigo = "CLAVE_MAESTRA_INVALIDA"
  constructor(largoRecibido: number) {
    super(
      "La clave maestra de secretos (" +
        VARIABLE_CLAVE_MAESTRA +
        ") no es válida: se esperan 32 bytes en 64 caracteres hex o en base64 de 32 bytes, y " +
        "lo configurado mide " +
        String(largoRecibido) +
        " caracteres."
    )
    this.name = "ClaveMaestraInvalidaError"
  }
}

/**
 * El paquete guardado no se puede abrir: clave maestra distinta, dato alterado o
 * paquete mal formado. Nunca devuelve texto parcial.
 */
export class SecretoIlegibleError extends Error {
  readonly codigo = "SECRETO_ILEGIBLE"
  constructor(detalle: string) {
    super(
      "No fue posible descifrar el secreto guardado: " +
        detalle +
        " No se devuelve ningún valor."
    )
    this.name = "SecretoIlegibleError"
  }
}

// --- Clave maestra -----------------------------------------------------------

/** Base64 estándar o url-safe de exactamente 32 bytes (43/44 caracteres). */
const BASE64_DE_32_BYTES = /^[A-Za-z0-9+/_-]{43}=?$/

/**
 * Decodifica la clave maestra a sus 32 bytes, o `null` si no es una clave de 32
 * bytes en hex o base64. No hay derivación por hash: la clave se usa tal cual, de
 * modo que lo que el operador configura es exactamente lo que el algoritmo usa.
 */
function decodificarClaveMaestra(valor: string): Buffer | null {
  const limpio = valor.trim()
  if (/^[0-9a-fA-F]{64}$/.test(limpio)) return Buffer.from(limpio, "hex")
  if (!BASE64_DE_32_BYTES.test(limpio)) return null
  const bytes = Buffer.from(limpio, "base64")
  return bytes.length === LONGITUD_CLAVE_BYTES ? bytes : null
}

/** Estado de la clave maestra, sin lanzar: la ruta lo traduce a su mensaje. */
export function estadoClaveMaestra(entorno: EntornoCifrado = process.env): EstadoClaveMaestra {
  const valor = entorno[VARIABLE_CLAVE_MAESTRA]
  if (valor === undefined || valor.trim() === "") return "ausente"
  return decodificarClaveMaestra(valor) === null ? "invalida" : "valida"
}

/**
 * Los 32 bytes de la clave maestra. Lanza `ClaveMaestraAusenteError` o
 * `ClaveMaestraInvalidaError`: nunca devuelve una clave de reemplazo.
 */
function claveMaestra(entorno: EntornoCifrado): Buffer {
  const valor = entorno[VARIABLE_CLAVE_MAESTRA]
  if (valor === undefined || valor.trim() === "") throw new ClaveMaestraAusenteError()
  const clave = decodificarClaveMaestra(valor)
  if (clave === null) throw new ClaveMaestraInvalidaError(valor.trim().length)
  return clave
}

// --- Contrato público --------------------------------------------------------

/**
 * Cifra un secreto con AES-256-GCM y un IV aleatorio nuevo.
 *
 * Lanza si falta la clave maestra o no es válida —antes de calcular nada—, así
 * que un fallo de despliegue no puede terminar en una fila con texto plano.
 */
export function cifrarSecreto(
  texto: string,
  entorno: EntornoCifrado = process.env
): PaqueteSecreto {
  const clave = claveMaestra(entorno)
  const iv = randomBytes(LONGITUD_IV_BYTES)
  const cifrador = createCipheriv("aes-256-gcm", clave, iv)
  const secretoCifrado = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()])
  const authTag = cifrador.getAuthTag()
  return {
    secretoCifrado: secretoCifrado.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: authTag.toString("base64url"),
  }
}

/**
 * Descifra un paquete guardado. Lanza `ClaveMaestraAusenteError` /
 * `ClaveMaestraInvalidaError` si la clave del servidor no sirve, y
 * `SecretoIlegibleError` si el paquete está mal formado, la clave maestra es
 * otra o el dato fue alterado (GCM verifica el tag).
 */
export function descifrarSecreto(
  paquete: PaqueteSecreto,
  entorno: EntornoCifrado = process.env
): string {
  const clave = claveMaestra(entorno)
  const iv = Buffer.from(paquete.iv ?? "", "base64url")
  const authTag = Buffer.from(paquete.authTag ?? "", "base64url")
  const secretoCifrado = Buffer.from(paquete.secretoCifrado ?? "", "base64url")
  if (iv.length !== LONGITUD_IV_BYTES) {
    throw new SecretoIlegibleError("el IV guardado no mide 12 bytes.")
  }
  if (authTag.length !== LONGITUD_TAG_BYTES) {
    throw new SecretoIlegibleError("el tag de autenticación guardado no mide 16 bytes.")
  }
  try {
    const descifrador = createDecipheriv("aes-256-gcm", clave, iv)
    descifrador.setAuthTag(authTag)
    return Buffer.concat([descifrador.update(secretoCifrado), descifrador.final()]).toString("utf8")
  } catch {
    throw new SecretoIlegibleError(
      "la clave maestra no corresponde o el dato fue alterado."
    )
  }
}
