/**
 * F35 serie A (A1) — ARCHIVO de documentos de la comunidad (Ley 21.442 art. 9).
 *
 * Una sola entidad, dos naturalezas:
 *   · `legal`       ⊂ append-only. No se edita ni se borra: la ruta responde 409 y
 *                     la corrección es una versión nueva. Exige `referenciaAutentica`
 *                     (fojas, fecha, notaría o Conservador), que es lo que prueba que
 *                     el papel es el auténtico y no una copia suelta.
 *   · `comunitario` ⊂ reemplazable. Se edita y se borra con la clave `doc`, igual que
 *                     cualquier maestro: la versión se conserva al reemplazarlo.
 *
 * `version` NO viene del cliente: la asigna el servidor dentro de
 * (comunidadId, tipoDocumental). Por eso el schema no la declara y zod la
 * descarta si llega en el payload.
 *
 * D1 (media por referencia): el archivo son metadatos + URL, jamás bytes ni
 * base64 — la misma regla que `ImagenReferenciaSchema` en `lib/schemas.ts`. No
 * hay endpoint de descarga ni columna de contenido porque el sistema nunca
 * guarda el binario.
 *
 * El schema es un `z.object` pelado a propósito: la factory CRUD de
 * `lib/api/crud-factory.ts` hace `schema.partial()` para el PUT parcial, y un
 * `.refine()`/`.superRefine()` devolvería un `ZodEffects` sin `.partial()`. La
 * regla condicional («legal exige referencia auténtica») vive por eso en la
 * guardia de escritura de la ruta, no acá.
 */
import { z } from "zod"
import { FechaISOSchema, IdEntidadSchema } from "@/lib/schemas"

export const NATURALEZAS_DOCUMENTO = ["legal", "comunitario"] as const

export type NaturalezaDocumento = (typeof NATURALEZAS_DOCUMENTO)[number]

/**
 * Lista cerrada de tipos documentales. Los doce primeros son los que la ley
 * manda conservar y poner a disposición (Ley 21.442 art. 9); `otros` existe para
 * que lo comunitario que la ley no nombra no se fuerce dentro de un tipo legal.
 */
export const TIPOS_DOCUMENTALES = [
  "reglamento-copropiedad",
  "actas-asamblea",
  "actas-comite",
  "registro-copropietarios",
  "permiso-edificacion-planos",
  "certificado-copropiedad-plano",
  "proveedores-subcontratistas",
  "carpeta-ascensores",
  "manuales-instalaciones",
  "plan-emergencia",
  "polizas-seguro",
  "contabilidad-rendiciones",
  "otros",
] as const

export type TipoDocumental = (typeof TIPOS_DOCUMENTALES)[number]

/** Etiqueta humana de cada tipo: la pantalla (A2) no repite la lista. */
export const ETIQUETAS_TIPO_DOCUMENTAL: Record<TipoDocumental, string> = {
  "reglamento-copropiedad": "Reglamento de copropiedad y sus modificaciones",
  "actas-asamblea": "Actas de asamblea",
  "actas-comite": "Actas de comité",
  "registro-copropietarios": "Registro de Copropietarios",
  "permiso-edificacion-planos": "Permiso de edificación y planos",
  "certificado-copropiedad-plano": "Certificado de copropiedad y plano",
  "proveedores-subcontratistas": "Proveedores y subcontratistas",
  "carpeta-ascensores": "Carpeta de ascensores",
  "manuales-instalaciones": "Manuales de instalaciones",
  "plan-emergencia": "Plan de emergencia",
  "polizas-seguro": "Pólizas de seguro",
  "contabilidad-rendiciones": "Contabilidad y rendiciones",
  otros: "Otros documentos de la comunidad",
}

/** S2 · Lo legal es inmutable: no hay PUT ni DELETE, solo una versión nueva. */
export function esInmutable(naturaleza: string): boolean {
  return naturaleza === "legal"
}

/** S3 · La referencia auténtica es obligatoria para lo legal. */
export function requiereReferenciaAutentica(naturaleza: string): boolean {
  return naturaleza === "legal"
}

/** Mensaje único: lo usan la guardia de la ruta y el test de contrato. */
export const MENSAJE_REFERENCIA_AUTENTICA =
  "Un documento legal exige referencia auténtica (fojas, fecha, notaría o Conservador)."

export const MENSAJE_LEGAL_INMUTABLE =
  "El documento legal es inmutable: se corrige con una versión nueva (registro auditable)."

const HASH_SHA256 = /^[a-fA-F0-9]{64}$/

const UrlArchivoSchema = z
  .string()
  .min(1, "La URL del archivo es obligatoria.")
  .max(2048, "La URL excede el largo permitido.")
  .refine((valor) => !/^data:/i.test(valor) && !/^blob:/i.test(valor), {
    message:
      "Media por referencia: no se permiten data-URL ni Blob embebidos (D1).",
  })

export const DocumentoArchivoSchema = z.object({
  id: IdEntidadSchema,
  naturaleza: z.enum(NATURALEZAS_DOCUMENTO, {
    errorMap: () => ({
      message: "La naturaleza debe ser legal o comunitario.",
    }),
  }),
  tipoDocumental: z.enum(TIPOS_DOCUMENTALES, {
    errorMap: () => ({
      message: "El tipo documental no está en la lista cerrada de la ley.",
    }),
  }),
  glosa: z
    .string()
    .min(1, "La glosa es obligatoria: dice a qué corresponde el documento.")
    .max(500, "La glosa excede el largo permitido."),
  referenciaAutentica: z
    .string()
    .min(1, "La referencia auténtica no puede venir vacía.")
    .max(300, "La referencia auténtica excede el largo permitido.")
    .optional(),
  archivoNombre: z.string().min(1, "El nombre del archivo es obligatorio."),
  archivoTipoMime: z.string().min(1, "El tipo MIME es obligatorio."),
  archivoTamanoKB: z.number().min(0, "El tamaño no puede ser negativo."),
  archivoUrl: UrlArchivoSchema,
  hash: z
    .string()
    .regex(HASH_SHA256, "El hash debe ser SHA-256 en hexadecimal.")
    .optional(),
  vigenteDesde: FechaISOSchema,
  subidoPorPersonaId: IdEntidadSchema.optional(),
})

export type DocumentoArchivo = z.infer<typeof DocumentoArchivoSchema>
