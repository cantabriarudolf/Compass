/**
 * acuerdo-documento — los PAPELES FIRMADOS del acuerdo presencial (S1/S3 de
 * `odd/tasks/acuerdo-presencial-y-respaldo.md`).
 *
 * Por qué existe: el acta firmada es OBLIGATORIA para cerrar un acuerdo
 * presencial —pedido textual del owner: «obligatoria, no debemos fomentar la
 * flojera hacia el administrador»— y el sistema no genera la firma, la recibe.
 * La administración escanea el papel y esta pieza define cómo se archiva: el
 * binario va al depósito privado, la base guarda metadatos y la ruta, y el
 * `Documento` legal lleva el hash que prueba que lo servido es lo archivado.
 * La lista de asistencia y los poderes respaldan la habilidad acreditada en la
 * sala (S6) y se suben cuando existen; el acta, siempre.
 *
 * ── Las reglas que están codificadas acá (no reinterpretar) ─────────────────
 *
 * 1. **El archivo que entra es un PDF.** El papel se firma a mano y se escanea
 *    en PDF; un archivo con otro formato no entra al archivo legal y la ruta lo
 *    rechaza con 400 antes de tocar el depósito. La verificación es la cabecera
 *    mágica `%PDF-` de los BYTES (reusada del papel del convenio).
 * 2. **El pathname lo arma el servidor** y nombra la comunidad, el acuerdo y el
 *    documento: la ruta no lleva nada que venga del cliente, así que un cuerpo
 *    manipulado no puede escribir fuera de la carpeta de la comunidad ni pisar
 *    el papel de otro acuerdo.
 * 3. **El nombre del archivo se sanea** porque entra en una cabecera HTTP
 *    (`content-disposition`): se conservan letras, números, punto, guion y guion
 *    bajo, y la extensión se normaliza a `.pdf` (el mismo saneo del convenio).
 * 4. **El tamaño y el hash se calculan de los BYTES**, no se estiman ni se
 *    declaran: son la huella que prueba que el archivo servido es el archivado.
 *
 * ── Tipo documental: `otros`, constante dedicada ────────────────────────────
 *
 * La `version` del archivo se numera por (comunidad, tipoDocumental). El acta
 * firmada del acuerdo NO es un acta del libro (`actas-comite` /
 * `actas-asamblea`): compartirla con esas altas haría chocar dos numeraciones
 * que no tienen nada que ver. `otros` es la entrada honesta —la misma que ya
 * usa el papel firmado del convenio y el requerimiento del corte— y la
 * constante es DEDICADA para que el acuerdo no herede el tipo de otro trámite
 * si un día cambia.
 *
 * Módulo puro: no lee base, no lee reloj y no habla con el depósito. El hash usa
 * `node:crypto`, igual que `lib/requerimiento-corte.ts` (la ruta corre en Node).
 */
import {
  esPdf,
  hashDelArchivo,
  tamanoEnKB,
} from "@/lib/convenio-documento"

// Helpers de bytes compartidos con el papel firmado del convenio: la misma
// verificación de cabecera, el mismo hash y la misma unidad de tamaño.
export { esPdf, hashDelArchivo, tamanoEnKB, MARCA_PDF } from "@/lib/convenio-documento"

/** Tipo documental de la lista cerrada: ver el encabezado (ninguno de los doce aplica). */
export const TIPO_DOCUMENTAL_ACUERDO = "otros" as const

/** MIME del papel escaneado: entra siempre como PDF. */
export const MIME_DEL_ACUERDO = "application/pdf" as const

/**
 * Los papeles que respaldan un acuerdo presencial (S3): el acta firmada es
 * obligatoria para cerrar; la asistencia y los poderes se suben cuando existen.
 */
export const PAPELES_DEL_ACUERDO = ["acta", "asistencia", "poderes"] as const

export type PapelDelAcuerdo = (typeof PAPELES_DEL_ACUERDO)[number]

/** Etiqueta del papel, para la glosa y la auditoría. */
export function etiquetaDelPapel(papel: PapelDelAcuerdo): string {
  const etiquetas: Record<PapelDelAcuerdo, string> = {
    acta: "Acta firmada",
    asistencia: "Lista de asistencia",
    poderes: "Poderes acreditados",
  }
  return etiquetas[papel]
}

/**
 * Glosa del documento: nombra el acuerdo del libro al que respalda.
 *
 * `cuerpo` es el que declaró el acuerdo (comite | asamblea): el papel respalda
 * la sesión de ESE cuerpo.
 */
export function glosaDelPapelDelAcuerdo(datos: {
  papel: PapelDelAcuerdo
  folio: string
  cuerpo: string
}): string {
  return `${etiquetaDelPapel(datos.papel)} del acuerdo ${datos.folio} (${datos.cuerpo})`
}

/**
 * Referencia auténtica del documento legal (obligatoria si es legal).
 *
 * Lo que da fe de este papel es el acuerdo del libro de acuerdos que respalda:
 * sin eso el archivo guardaría un PDF sin origen verificable.
 */
export function referenciaAutenticaDelPapelDelAcuerdo(datos: {
  papel: PapelDelAcuerdo
  folio: string
  cuerpo: string
}): string {
  const respaldo: Record<PapelDelAcuerdo, string> = {
    acta: "el acta firmada que respalda lo proclamado",
    asistencia: "la lista de asistencia de la sesión",
    poderes: "los poderes acreditados en la sala",
  }
  return `Acuerdo ${datos.folio} del libro de acuerdos (${datos.cuerpo}); ${respaldo[datos.papel]}`
}

/**
 * Ruta del papel en el depósito privado.
 *
 * Determinista y armada sólo con ids del servidor:
 * `acuerdos/<comunidad>/<acuerdo>/<documento>.pdf`. El id del DOCUMENTO va en
 * la ruta —y no sólo el del acuerdo— porque el papel se sube una sola vez: si
 * dos peticiones simultáneas subieran al mismo pathname, la segunda pisaría los
 * bytes del papel que ya estaba archivado. Con un pathname propio, la subida
 * que no puede confirmarse se borra sin tocar el papel bueno.
 */
export function rutaDelPapelDelAcuerdo(datos: {
  comunidadId: string
  acuerdoId: string
  documentoId: string
}): string {
  const segmento = (valor: string): string => valor.replace(/[^A-Za-z0-9_-]/g, "")
  return [
    "acuerdos",
    segmento(datos.comunidadId),
    segmento(datos.acuerdoId),
    `${segmento(datos.documentoId)}.pdf`,
  ].join("/")
}

/**
 * ¿El pathname archivado es una ruta de este depósito y de esta carpeta?
 *
 * La descarga lee la ruta guardada en la fila. Aceptar cualquier cadena sería
 * dejar que una fila apunte a otro origen; por eso sólo se sirve lo que tiene
 * la forma que este módulo escribe.
 */
export function esRutaDelPapelDelAcuerdo(pathname: string): boolean {
  if (pathname.includes("..")) return false
  if (pathname.includes("\\")) return false
  return /^acuerdos\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.pdf$/.test(pathname)
}

/** Largo máximo del nombre saneado: el schema ya acota el original (200). */
const MAXIMO_NOMBRE = 120

/**
 * Nombre del archivo para el archivo legal y para la cabecera de descarga.
 *
 * El nombre lo escribe quien sube el escaneo, así que se sanea: letras, números,
 * punto, guion y guion bajo —nada de comillas, saltos de línea ni separadores de
 * ruta— y la extensión `.pdf`. Un nombre vacío después de sanear toma el del
 * acuerdo, que siempre existe.
 */
export function nombreDelPapelDelAcuerdo(nombre: string, acuerdoId: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/-+/g, "-")
  const recortado = base.length > MAXIMO_NOMBRE ? base.substring(0, MAXIMO_NOMBRE) : base
  const seguro = recortado === "" ? acuerdoId.replace(/[^A-Za-z0-9_-]/g, "") : recortado
  return `${seguro}.pdf`
}
