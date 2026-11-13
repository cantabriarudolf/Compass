/**
 * almacen-documentos — el DEPÓSITO PRIVADO de archivos de la comunidad (F29 · V5).
 *
 * Por qué existe: el convenio de pago se firma a mano y la administración lo
 * escanea. El valor del instrumento es la firma del deudor, así que el sistema no
 * puede generar ese papel —generarlo sin firma sería mentir en el archivo legal—:
 * lo RECIBE como PDF y lo archiva. El binario vive en el store privado de Vercel
 * Blob del proyecto (`compass-docs`) y en la base viven los metadatos y la ruta
 * que lo identifica (D1: media por referencia, jamás bytes ni base64).
 *
 * ── Las reglas que están codificadas acá (no reinterpretar) ─────────────────
 *
 * 1. **Sin dependencias nuevas**: se habla con la API REST del store por `fetch`.
 *    La subida es `PUT <base>/<pathname>` con `authorization: Bearer <token>`,
 *    `x-api-version: 12` y el tipo del archivo en `x-content-type`; la lectura es
 *    `GET` del mismo pathname con el mismo `authorization`, y el borrado es
 *    `DELETE`. No se agrega `@vercel/blob` ni ninguna otra librería.
 * 2. **El store es PRIVADO**: la subida declara `x-vercel-blob-access: private` y
 *    este módulo NUNCA devuelve ni guarda una URL pública. Lo que se archiva es el
 *    `pathname`; la única puerta de lectura es una ruta de la app con su guard
 *    (`GET /api/convenios/documento`), que descarga con el token del SERVIDOR.
 *    Un residente no puede pedirle el archivo al store: no tiene el token.
 * 3. **El pathname lo decide el servidor**, nunca el cliente, y la subida pide
 *    `x-add-random-suffix: 0`. Sin sufijo aleatorio la ruta es la que el servidor
 *    calculó, y el archivo que se archiva es exactamente el que se pidió guardar.
 * 4. **Falla cerrada**: sin token no se inventa una subida. Cada llamada lanza
 *    `ErrorDelDeposito` y el llamador decide — la ruta de subida no escribe nada
 *    hasta que el archivo está guardado.
 *
 * ── La variable que existe sólo para las pruebas ────────────────────────────
 *
 * `BLOB_API_BASE_URL` cambia el origen del depósito y existe para que la suite
 * hable con un servidor falso en `127.0.0.1`, el mismo criterio del servidor SMTP
 * de prueba (`test/lib/servidor-smtp-falso.ts`): en la app y en el deploy NUNCA
 * se define, así que el destino es el store real. No abre ninguna lectura: el
 * store sigue siendo privado y toda descarga pasa por una ruta autenticada.
 *
 * El token (`BLOB_READ_WRITE_TOKEN`) se lee del entorno en cada llamada y no se
 * persiste, no se loguea y no se devuelve: vive sólo en la cabecera.
 */

/** Origen del store privado cuando nadie lo redirige (producción, preview, dev). */
const BASE_POR_DEFECTO = "https://blob.vercel-storage.com"

/** Versión de la API del store que se usa (la que entiende `access: private`). */
const VERSION_DE_API = "12"

/** Tope de la descarga que se sirve por la ruta: un escaneo no es un archivo gigante. */
export const MAXIMO_BYTES_POR_ARCHIVO = 25 * 1024 * 1024

/**
 * Falla del depósito. El `estado` es el HTTP que devolvió el store (o `null` si
 * no respondió): el llamador traduce a su propia respuesta, y el mensaje de esta
 * clase NO se reenvía al cliente —describe la operación, no la fila del deudor—.
 */
export class ErrorDelDeposito extends Error {
  readonly estado: number | null

  constructor(mensaje: string, estado: number | null = null) {
    super(mensaje)
    this.name = "ErrorDelDeposito"
    this.estado = estado
  }
}

/**
 * Entorno inyectable: en la app es `process.env` y los tests pasan el suyo. El
 * token NO se lee de otro lado —no hay base ni configuración para un secreto de
 * infraestructura— y su ausencia es una falla del depósito, no un valor vacío.
 */
export type EntornoDelDeposito = { [variable: string]: string | undefined }

/** Token del store. Falla cerrada: sin token no hay depósito. */
function tokenDelDeposito(env: EntornoDelDeposito): string {
  const token = (env.BLOB_READ_WRITE_TOKEN ?? "").trim()
  if (token === "") {
    throw new ErrorDelDeposito("Falta BLOB_READ_WRITE_TOKEN: no hay depósito configurado.")
  }
  return token
}

/** Origen efectivo del depósito (el real, salvo que las pruebas lo redirijan). */
export function origenDelDeposito(env: EntornoDelDeposito): string {
  const configurado = (env.BLOB_API_BASE_URL ?? "").trim()
  return configurado === "" ? BASE_POR_DEFECTO : configurado
}

/**
 * URL del archivo en el store.
 *
 * Cada segmento del pathname se codifica: la ruta la arma el servidor con ids y
 * nombres saneados, y no hay forma de que un valor del cliente agregue `..` o
 * cambie el origen de la petición.
 */
export function urlDelArchivo(env: EntornoDelDeposito, pathname: string): URL {
  const origen = origenDelDeposito(env)
  const base = origen.endsWith("/") ? origen : `${origen}/`
  const relativa = pathname
    .split("/")
    .filter((segmento) => segmento !== "")
    .map((segmento) => encodeURIComponent(segmento))
    .join("/")
  return new URL(relativa, base)
}

/**
 * Copia de los bytes en un `ArrayBuffer` concreto.
 *
 * `fetch` no acepta un `Uint8Array` cuyo buffer pueda ser compartido
 * (`SharedArrayBuffer`): la copia fija el cuerpo en memoria propia del depósito.
 */
function copiaBinaria(bytes: Uint8Array): ArrayBuffer {
  const copia = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copia).set(bytes)
  return copia
}

/** Metadatos del archivo tal como quedaron en el depósito. */
export interface ArchivoEnElDeposito {
  readonly pathname: string
  readonly tamanoBytes: number
}

/**
 * Sube UN archivo con acceso privado al pathname que decidió el servidor.
 *
 * Devuelve el pathname y el tamaño de los bytes ENVIADOS (el que se archivó): el
 * llamador guarda esos dos datos y no vuelve a preguntarle al store qué subió.
 */
export async function subirArchivoPrivado(input: {
  pathname: string
  bytes: Uint8Array
  tipoMime: string
  env?: EntornoDelDeposito
}): Promise<ArchivoEnElDeposito> {
  const env = input.env ?? process.env
  const token = tokenDelDeposito(env)
  const url = urlDelArchivo(env, input.pathname)

  let respuesta: Response
  try {
    respuesta = await fetch(url, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "x-api-version": VERSION_DE_API,
        "x-content-type": input.tipoMime,
        // La ruta la decidió el servidor: el store no le agrega un sufijo aleatorio.
        "x-add-random-suffix": "0",
        // Store privado: el archivo no se sirve por ninguna URL pública.
        "x-vercel-blob-access": "private",
      },
      body: copiaBinaria(input.bytes),
      cache: "no-store",
    })
  } catch {
    throw new ErrorDelDeposito("El depósito de documentos no respondió a la subida.")
  }

  if (!respuesta.ok) {
    throw new ErrorDelDeposito("El depósito de documentos rechazó la subida.", respuesta.status)
  }

  return { pathname: input.pathname, tamanoBytes: input.bytes.length }
}

/**
 * Descarga UN archivo privado con el token del SERVIDOR.
 *
 * Es la única forma de leer el archivo: el store no tiene URL pública, así que
 * sin este token el archivo no se puede pedir.
 */
export async function descargarArchivoPrivado(input: {
  pathname: string
  env?: EntornoDelDeposito
}): Promise<Uint8Array<ArrayBuffer>> {
  const env = input.env ?? process.env
  const token = tokenDelDeposito(env)
  const url = urlDelArchivo(env, input.pathname)

  let respuesta: Response
  try {
    respuesta = await fetch(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "x-api-version": VERSION_DE_API,
      },
      cache: "no-store",
    })
  } catch {
    throw new ErrorDelDeposito("El depósito de documentos no respondió a la lectura.")
  }

  if (!respuesta.ok) {
    throw new ErrorDelDeposito("El depósito de documentos no devolvió el archivo.", respuesta.status)
  }

  return new Uint8Array(await respuesta.arrayBuffer())
}

/**
 * Borra UN archivo privado. Devuelve `true` si el store confirmó el borrado.
 *
 * Se usa cuando la transacción que iba a archivar el documento no se pudo
 * aplicar: sin esto, el depósito guardaría un archivo que ninguna fila menciona.
 */
export async function borrarArchivoPrivado(input: {
  pathname: string
  env?: EntornoDelDeposito
}): Promise<boolean> {
  const env = input.env ?? process.env
  const token = tokenDelDeposito(env)
  const url = urlDelArchivo(env, input.pathname)

  let respuesta: Response
  try {
    respuesta = await fetch(url, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`,
        "x-api-version": VERSION_DE_API,
      },
      cache: "no-store",
    })
  } catch {
    throw new ErrorDelDeposito("El depósito de documentos no respondió al borrado.")
  }

  return respuesta.ok
}
