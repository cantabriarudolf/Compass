/**
 * _actas.ts — utilidades compartidas de la PUBLICACIÓN DE ACTAS en el visor CV
 * (SERIE-FASE2 §V6). Módulo co-locado (no es una ruta de Next).
 *
 * Decisiones del plan que están codificadas acá (no reinterpretar):
 * - **Por referencia**: el visor guarda `actaId` + visibilidad; el contenido del
 *   acta NO se copia. El documento canónico e inmutable sigue siendo `actas_gd`
 *   (módulo GD) y esta tabla solo registra estado, actor y fechas.
 * - **Despublicable con auditoría**: cada transición emite un evento de la
 *   categoría CV (`CV_ACTA_PUBLICADA` / `CV_ACTA_DESPUBLICADA`) con el usuario
 *   de sesión, igual que el resto de las auditorías server-side.
 * - **Vista general informativa**: RUT siempre enmascarado y sin datos
 *   individualizados (nada de morosidad ni sanciones por unidad o persona).
 *   El texto obligatorio vive en `TEXTO_ACTA_INFORMATIVA_CV`.
 * - **Authz**: `cv` crear/editar (administrador y comité) publican y
 *   despublican; el residente solo `ver`, y además necesita la autorización
 *   `residenteVeActas` vigente (ABAC `residentesVenActas` en la ruta).
 */
import { puede, type Accion } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
  type ScopeResult,
} from "@/lib/api/with-comunidad-scope"

/** Recurso de la matriz que gobierna el visor (avisos y actas publicadas). */
export const RECURSO_ACTAS_CV = "cv"

/** Estados de visibilidad de un acta publicada en el visor. */
export const ESTADO_ACTA_PUBLICADA = "publicado"
export const ESTADO_ACTA_DESPUBLICADA = "despublicado"

/** Roles con vista restringida: solo ven actas si el propietario lo autorizó. */
export function esRolResidente(rol: string): boolean {
  const normalizado = rol.trim().toLowerCase()
  return normalizado === "residente" || normalizado === "propietario"
}

export type ContextoActasCV =
  | { ok: true; scope: ComunidadScope }
  | { ok: false; response: Response }

/**
 * Contexto server-side de una acción sobre actas publicadas: sesión + membresía
 * (vía `withComunidadScope`, el comunidadId nunca viene del cliente) + permiso
 * sobre `cv`.
 */
export async function contextoActasCV(
  accion: Accion
): Promise<ContextoActasCV> {
  const resultado: ScopeResult = await withComunidadScope()
  if (!resultado.ok) return { ok: false, response: resultado.response }
  if (!puede(resultado.scope.rol, accion, RECURSO_ACTAS_CV)) {
    return { ok: false, response: jsonError(403, "Permiso denegado.") }
  }
  return { ok: true, scope: resultado.scope }
}

/**
 * Enmascara un documento de identidad para la vista general del visor
 * (Ley 19.628: el visor no individualiza datos personales).
 * RUT `12.345.678-9` → `***.***.678-9`; pasaporte → `***` + últimos 2.
 */
export function enmascararDocumento(documento: string): string {
  const limpio = documento.trim()
  if (limpio === "") return ""
  const [cuerpoCrudo = "", dv] = limpio.split("-")
  if (dv !== undefined) {
    const cuerpo = cuerpoCrudo.replace(/\D/g, "")
    if (cuerpo.length <= 3) return `***-${dv}`
    return `***.***.${cuerpo.slice(-3)}-${dv}`
  }
  if (limpio.length <= 2) return "***"
  return `***${limpio.slice(-2)}`
}

/** Emite UN evento de auditoría CV (mismo shape que `registrarEvento` del store). */
export function registrarEventoCV(
  scope: ComunidadScope,
  tipoAccion: string,
  referenciaId: string,
  descripcion: string,
  client: Pick<typeof prisma, "eventoAuditoria"> = prisma
): Promise<unknown> {
  return client.eventoAuditoria.create({
    data: {
      id: generarId("ev"),
      comunidadId: scope.comunidadId,
      timestamp: new Date().toISOString(),
      usuario: scope.usuarioId,
      categoria: "CV",
      tipoAccion,
      referenciaId,
      descripcion,
    },
  })
}

/** Fila mínima de `actas_publicadas_cv` que se serializa al cliente. */
export interface PublicacionActaCVRaw {
  id: string
  actaId: string
  estado: string
  publicadoEn: Date
  publicadoPorUsuarioId: string
  despublicadoEn: Date | null
  despublicadoPorUsuarioId: string | null
}

/** Serializa una publicación (fechas ISO, sin columnas internas de Prisma). */
export function serializarPublicacion(p: PublicacionActaCVRaw): {
  id: string
  actaId: string
  estado: string
  publicadoEn: string
  publicadoPorUsuarioId: string
  despublicadoEn?: string
  despublicadoPorUsuarioId?: string
} {
  const serializada: {
    id: string
    actaId: string
    estado: string
    publicadoEn: string
    publicadoPorUsuarioId: string
    despublicadoEn?: string
    despublicadoPorUsuarioId?: string
  } = {
    id: p.id,
    actaId: p.actaId,
    estado: p.estado,
    publicadoEn: p.publicadoEn.toISOString(),
    publicadoPorUsuarioId: p.publicadoPorUsuarioId,
  }
  if (p.despublicadoEn) serializada.despublicadoEn = p.despublicadoEn.toISOString()
  if (p.despublicadoPorUsuarioId)
    serializada.despublicadoPorUsuarioId = p.despublicadoPorUsuarioId
  return serializada
}
