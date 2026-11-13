/**
 * convenio-documento — el PAPEL FIRMADO del convenio de pago (F29 · V5).
 *
 * Por qué existe: la ley manda celebrar el convenio de pago por escrito y con la
 * firma del deudor (Ley 21.442 art. 6 inc. 4; Reglamento art. 9), y el sistema
 * registraba el trámite sin el papel. El instrumento vale por la firma: el sistema
 * NO lo genera —un PDF sin firma no prueba consentimiento—, lo recibe escaneado
 * por la administración y lo archiva como `Documento` legal.
 *
 * ── Las reglas que están codificadas acá (no reinterpretar) ─────────────────
 *
 * 1. **El archivo que entra es un PDF.** El papel se firma a mano y se escanea en
 *    PDF; un archivo con otro formato (una foto JPEG del papel, por ejemplo) no
 *    entra al archivo legal y la ruta lo rechaza con 400 antes de tocar el
 *    depósito. La verificación es la cabecera mágica `%PDF-` de los BYTES.
 * 2. **El pathname lo arma el servidor** y nombra la comunidad, el convenio y el
 *    documento: la ruta no lleva nada que venga del cliente (ni el nombre del
 *    archivo ni rutas relativas), así que un cuerpo manipulado no puede escribir
 *    fuera de la carpeta de la comunidad ni pisar el papel de otro convenio.
 * 3. **El nombre del archivo se sanea** porque entra en una cabecera HTTP
 *    (`content-disposition`): se conservan letras, números, punto, guion y guion
 *    bajo, y la extensión se normaliza a `.pdf`.
 * 4. **El tamaño y el hash se calculan de los BYTES**, no se estiman ni se
 *    declaran: son la huella que prueba que el archivo servido es el archivado.
 *
 * ── Tipo documental: `otros` ────────────────────────────────────────────────
 *
 * Los doce tipos de la lista cerrada (`lib/documento-archivo.ts`) son los papeles
 * que la ley manda conservar (art. 9): actas, registro, planos, pólizas,
 * contabilidad… El convenio firmado es un instrumento del trámite de cobranza y no
 * es ninguno de esos; forzarlo dentro de un tipo ajeno ensuciaría ese tipo. `otros`
 * es la entrada honesta del archivo, y es la misma que ya usa el requerimiento del
 * corte.
 *
 * Módulo puro: no lee base, no lee reloj y no habla con el depósito. El hash usa
 * `node:crypto`, igual que `lib/requerimiento-corte.ts` (la ruta corre en Node).
 */
import { createHash } from "node:crypto"

/** Tipo documental de la lista cerrada: ver el encabezado (ninguno de los doce aplica). */
export const TIPO_DOCUMENTAL_CONVENIO = "otros" as const

/** MIME del papel firmado: el escaneo entra siempre como PDF. */
export const MIME_DEL_CONVENIO = "application/pdf" as const

/** Cabecera mágica de un PDF: lo primero que dicen sus bytes. */
export const MARCA_PDF = "%PDF-" as const

/**
 * Canal de la constancia de entrega.
 *
 * El contrato de `EnvioDocumento` tiene dos canales (`visor` | `email`). El visor
 * se registra `entregado` SÓLO porque en la misma transacción se crea la
 * `Notificacion` que lo prueba; acá no se crea ninguna, así que el visor no puede
 * ser el canal de una constancia que todavía no existe. Queda `email`, el canal por
 * el que esta entrega se cursa cuando se curse.
 */
export const CANAL_DE_LA_CONSTANCIA_DEL_CONVENIO = "email" as const

/**
 * Motivo de la constancia PENDIENTE.
 *
 * En esta unidad no hay envío de correo: el papel se archiva y su entrega al deudor
 * queda por cursar. El contrato de los envíos dice que `entregado` se registra SÓLO
 * si el servidor aceptó el mensaje; escribir `entregado` sin envío sería declarar
 * una entrega que no ocurrió, justo en el documento que prueba la firma del deudor.
 */
export const MOTIVO_CONSTANCIA_PENDIENTE =
  "El convenio firmado quedó archivado, pero su entrega al deudor todavía no se cursó por ningún canal: la constancia queda pendiente hasta que exista un envío real. El estado `entregado` sólo se registra si el servidor de correo aceptó el mensaje."

/**
 * ¿Los bytes son un PDF?
 *
 * Se mira la cabecera, que es un hecho del archivo y no de su nombre: renombrar
 * `foto.jpg` a `.pdf` no cambia lo que el archivo es.
 */
export function esPdf(bytes: Uint8Array): boolean {
  if (bytes.length < MARCA_PDF.length) return false
  for (let i = 0; i < MARCA_PDF.length; i++) {
    if (bytes[i] !== MARCA_PDF.charCodeAt(i)) return false
  }
  return true
}

/** Tamaño en KB con un decimal: la unidad que guarda el archivo de documentos. */
export function tamanoEnKB(bytes: Uint8Array): number {
  return Math.round((bytes.length / 1024) * 10) / 10
}

/** SHA-256 en hexadecimal de los bytes: la huella del papel que se archivó. */
export function hashDelArchivo(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

/** Glosa del documento: nombra la unidad y al deudor que firmó. */
export function glosaDelConvenioFirmado(datos: {
  numeroUnidad: string
  deudorNombre: string
}): string {
  return `Convenio de pago firmado de la unidad ${datos.numeroUnidad} con ${datos.deudorNombre} (Ley 21.442 art. 6)`
}

/**
 * Referencia auténtica del documento legal.
 *
 * Lo que da fe de este papel es el acuerdo del Comité que autorizó el convenio
 * (art. 6: el convenio exige acuerdo del comité) y el trámite del que salió. Sin
 * eso el archivo guardaría un PDF sin origen verificable.
 */
export function referenciaAutenticaDelConvenio(datos: {
  convenioId: string
  acuerdoFolio: string
}): string {
  return `Acuerdo del Comité ${datos.acuerdoFolio} que autoriza el convenio ${datos.convenioId} (Ley 21.442 art. 6)`
}

/**
 * Ruta del papel firmado en el depósito privado.
 *
 * Determinista y armada sólo con ids del servidor: `convenios/<comunidad>/<convenio>/<documento>.pdf`.
 * El id del DOCUMENTO va en la ruta —y no sólo el del convenio— porque el papel se
 * sube una sola vez: si dos peticiones simultáneas subieran al mismo pathname, la
 * segunda pisaría los bytes de la firma que ya estaba archivada. Con un pathname
 * propio, la subida que no puede confirmarse se borra sin tocar el papel bueno.
 */
export function rutaDelConvenioFirmado(datos: {
  comunidadId: string
  convenioId: string
  documentoId: string
}): string {
  const segmento = (valor: string): string => valor.replace(/[^A-Za-z0-9_-]/g, "")
  return [
    "convenios",
    segmento(datos.comunidadId),
    segmento(datos.convenioId),
    `${segmento(datos.documentoId)}.pdf`,
  ].join("/")
}

/**
 * ¿El pathname archivado es una ruta de este depósito y de esta carpeta?
 *
 * La descarga lee la ruta guardada en la fila. Aceptar cualquier cadena sería
 * dejar que una fila apunte a otro origen y que la ruta del servidor lo pidiera
 * con el token en la mano; por eso sólo se sirve lo que tiene la forma que este
 * módulo escribe.
 */
export function esRutaDelConvenioFirmado(pathname: string): boolean {
  if (pathname.includes("..")) return false
  if (pathname.includes("\\")) return false
  return /^convenios\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.pdf$/.test(pathname)
}

/** Largo máximo del nombre saneado: el schema ya acota el original (200). */
const MAXIMO_NOMBRE = 120

/**
 * Nombre del archivo para el archivo legal y para la cabecera de descarga.
 *
 * El nombre lo escribe quien sube el escaneo, así que se sanea: letras, números,
 * punto, guion y guion bajo —nada de comillas, saltos de línea ni separadores de
 * ruta— y la extensión `.pdf`. Un nombre vacío después de sanear toma el del
 * convenio, que siempre existe.
 */
export function nombreDelConvenioFirmado(nombre: string, convenioId: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/-+/g, "-")
  const recortado = base.length > MAXIMO_NOMBRE ? base.substring(0, MAXIMO_NOMBRE) : base
  const seguro = recortado === "" ? convenioId.replace(/[^A-Za-z0-9_-]/g, "") : recortado
  return `${seguro}.pdf`
}
