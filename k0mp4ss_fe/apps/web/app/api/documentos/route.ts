/**
 * /api/documentos — ARCHIVO de documentos de la comunidad (F35 serie A, A1).
 *
 * Una sola entidad, dos naturalezas (ver `lib/documento-archivo.ts`):
 *   · `legal`       ⊂ append-only. Se corrige con otra versión: DELETE y PUT
 *                     responden 409 y el POST repetido sobre la misma fila también.
 *                     Exige `referenciaAutentica`.
 *   · `comunitario` ⊂ reemplazable: PUT y DELETE son parte del contrato.
 *
 * La VERSIÓN la asigna el servidor, dentro de (comunidadId, tipoDocumental): un
 * legal nuevo del mismo tipo sube uno; reemplazar un comunitario conserva el
 * número. El schema zod no declara `version`, así que zod la descarta si el
 * cliente la manda.
 *
 * La guardia `antesDeEscribir` es el único lugar donde viven las reglas que
 * necesitan mirar otra fila o el payload completo (inmutabilidad legal y
 * asignación de versión); corre tanto en el POST (upsert) como en el PUT
 * parcial. La regla «legal exige referencia auténtica» también vive acá, y no en
 * el schema, porque la factory hace `schema.partial()` para el PUT: un
 * `.refine()` devolvería un `ZodEffects` sin `.partial()` y rompería la edición
 * de los comunitarios.
 *
 * Authz: clave `doc` (administración todo, comité ver+crear, residente ver).
 */
import {
  DocumentoArchivoSchema,
  esInmutable,
  MENSAJE_LEGAL_INMUTABLE,
  MENSAJE_REFERENCIA_AUTENTICA,
  requiereReferenciaAutentica,
} from "@/lib/documento-archivo"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import {
  createCrudHandlers,
  delegado,
  type AntesDeEscribir,
} from "@/lib/api/crud-factory"
import { jsonError } from "@/lib/api/with-comunidad-scope"

/**
 * Siguiente versión dentro de (comunidad, tipo documental).
 *
 * Se cuenta sobre toda la comunidad y no por naturaleza: un legal nuevo dentro
 * del mismo tipo no puede reutilizar el número de una versión anterior, porque
 * la historia del archivo es una sola línea por tipo.
 */
async function siguienteVersion(
  comunidadId: string,
  tipoDocumental: unknown
): Promise<number> {
  const { _max } = await prisma.documento.aggregate({
    where: { comunidadId, tipoDocumental: String(tipoDocumental) },
    _max: { version: true },
  })
  return (_max.version ?? 0) + 1
}

const antesDeEscribir: AntesDeEscribir = async ({ datos, previo, scope }) => {
  // S2 · lo legal es append-only. Se chequea antes de todo: un replay del POST o
  // un PUT sobre una fila legal no puede cambiar una coma.
  if (previo && esInmutable(String(previo.naturaleza))) {
    return jsonError(409, MENSAJE_LEGAL_INMUTABLE)
  }

  // S3 · legal exige referencia auténtica. En el PUT parcial la fila previa
  // completa el cuadro: si ya tenía referencia y el payload no la toca, vale.
  const naturaleza = String(datos.naturaleza ?? previo?.naturaleza ?? "")
  const referencia = datos.referenciaAutentica ?? previo?.referenciaAutentica
  if (requiereReferenciaAutentica(naturaleza) && !String(referencia ?? "").trim()) {
    return jsonError(400, MENSAJE_REFERENCIA_AUTENTICA, {
      campo: "referenciaAutentica",
    })
  }

  // S1 · la versión la pone el servidor. Un comunitario reemplazado conserva la
  // suya; un alta (legal o no) toma la siguiente de su tipo.
  datos.version = previo
    ? previo.version
    : await siguienteVersion(scope.comunidadId, datos.tipoDocumental)

  return null
}

export const documentoHandlers = createCrudHandlers({
  model: delegado(prisma.documento),
  schema: DocumentoArchivoSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "doc"),
  // S2 · la baja de un legal es 409: el archivo no se puede mutilar. La factory
  // no llama a `antesDeEscribir` en el DELETE, así que la guardia va acá.
  beforeDelete: async (record) =>
    esInmutable(String((record as { naturaleza?: string }).naturaleza))
      ? jsonError(409, MENSAJE_LEGAL_INMUTABLE)
      : null,
  antesDeEscribir,
})

export const GET = documentoHandlers.GET
export const POST = documentoHandlers.POST
