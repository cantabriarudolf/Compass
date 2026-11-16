/**
 * /api/certificados-ct/[id] — detalle/actualización parcial/baja de un certificado CT.
 *
 * GET por id con alcance por objeto (permisos por objeto, 2026-11-06): la fila se
 * busca ya acotada por `alcanceCertificadosCT`, el MISMO `where` que usa la
 * colección. Administrador y comité leen toda la comunidad; cualquier otro rol
 * —el residente— solo los certificados de sus unidades con vínculo vigente o
 * emitidos a su persona (`unidadesVinculadasDb` / `personaIdDelUsuarioDb`,
 * resueltos del servidor).
 *
 * La fila ajena responde 404 «Registro no encontrado.» y no 403: el 403
 * confirmaría que el certificado existe. La consulta va acotada, así que la fila
 * ajena tampoco se carga en memoria.
 *
 * Inmutabilidad del PUT (A2/A5, 2026-11-16): el `PUT` de la factory es un parche
 * parcial del schema completo, así que aceptaba cambiar `tipo`, `unidadId`,
 * `personaId` y `detalle` de un documento ya emitido —contra el «documento
 * inmutable» del manual— y con él un `unidadId` de OTRA comunidad. La guarda
 * angosta rechaza cambiar esos cuatro campos con 409 y deja el resto del parche
 * como estaba. `resumen`, `solicitanteNombre`, `folio`, `firmaUrl` y `origenRef`
 * siguen editables: el objetivo es que el documento no mute, no blindar la fila
 * entera.
 */
import { alcanceCertificadosCT, certificadosHandlers } from "../route"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

type Ctx = { params: Promise<{ id: string }> }

/** GET por id — `ct` ver, con el alcance por objeto aplicado en el `where`. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "ver", "ct")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params
  try {
    const alcance = await alcanceCertificadosCT(scope)
    const record = await prisma.certificadoCT.findFirst({
      where: { id, comunidadId: scope.comunidadId, ...(alcance ?? {}) },
    })
    if (!record) return jsonError(404, "Registro no encontrado.")
    return Response.json(record)
  } catch (e) {
    logger.error({ err: e }, "[api/certificados-ct/[id]] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}

/**
 * Los cuatro campos que hacen al documento emitido. Un certificado es inmutable
 * (design.md Decisión 5), así que el `PUT` no los cambia: mismo criterio que el
 * `DELETE`, que ya responde 409.
 *
 * Deliberadamente angosto: `resumen`, `solicitanteNombre`, `folio`, `firmaUrl` y
 * `origenRef` siguen editables por la ruta parcial, porque el pedido del owner fue
 * cerrar la mutación del documento, no convertir el `PUT` en un segundo `DELETE`.
 */
const CAMPOS_INMUTABLES = ["tipo", "unidadId", "personaId", "detalle"] as const

/** Igualdad por valor del shape guardado. `detalle` es un arreglo de `{clave, valor}`. */
function mismoValor(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * PUT parcial con la guarda de inmutabilidad delante — `ct` editar.
 *
 * El orden de compuertas es el del `DELETE`: scope (401) → permiso (403) →
 * alcance por objeto (404) → 409. Así el 409 sólo confirma la inmutabilidad de
 * un registro propio y no filtra existencia ajena. Un campo inmutable que llega
 * con el MISMO valor no es un cambio y pasa: la guarda rechaza mutaciones, no
 * clientes que reenvían el objeto completo.
 */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "editar", "ct")) {
    return jsonError(403, "Permiso denegado.")
  }

  // El clon se lee sólo para mirar el cuerpo: la factory recibe el pedido intacto
  // y sigue siendo la única que valida el shape y escribe.
  const cuerpo = await req
    .clone()
    .json()
    .catch(() => null)
  if (cuerpo === null || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    return certificadosHandlers.PUT(req, ctx)
  }

  const { id } = await ctx.params
  try {
    const alcance = await alcanceCertificadosCT(scope)
    const record = await prisma.certificadoCT.findFirst({
      where: { id, comunidadId: scope.comunidadId, ...(alcance ?? {}) },
    })
    if (!record) return jsonError(404, "Registro no encontrado.")

    const pedido = cuerpo as Record<string, unknown>
    const guardado = record as unknown as Record<string, unknown>
    const intentaCambiar = CAMPOS_INMUTABLES.some(
      (campo) => campo in pedido && !mismoValor(pedido[campo], guardado[campo])
    )
    if (intentaCambiar)
      return jsonError(
        409,
        "Documento inmutable: no se puede cambiar el tipo, la unidad, la persona ni el detalle de un certificado."
      )

    return certificadosHandlers.PUT(req, ctx)
  } catch (e) {
    logger.error({ err: e }, "[api/certificados-ct/[id]] error PUT")
    return jsonError(500, "Error interno del servidor.")
  }
}

/** DELETE: 409 siempre — el certificado es inmutable (design.md Decisión 5).
 *
 * Un certificado emitido es un documento que no se elimina. La regla se aplica
 * en la capa API, no en el cliente, para que ningún consumidor distinto del
 * QA-Lab pueda saltarla. El scoping y la authz se evalúan ANTES del rechazo
 * (401/403/404 igual que la factory), así el 409 sólo confirma la inmutabilidad
 * de un registro propio y no filtra existencia ajena. El alcance por objeto no
 * hace falta acá: `ct` eliminar lo tiene solo el administrador (wildcard), así
 * que el rol con unidad nunca llega al 409 — se queda en el 403 de la clave.
 * El residuo TEST lo purga `e2e:higiene`, no un endpoint de borrado.
 */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "eliminar", "ct")) {
    return jsonError(403, "Permiso denegado.")
  }

  const { id } = await ctx.params
  const record = await prisma.certificadoCT.findUnique({ where: { id } })
  if (!record || record.comunidadId !== scope.comunidadId) {
    return jsonError(404, "Registro no encontrado.")
  }
  return jsonError(
    409,
    "Documento inmutable: no se puede eliminar un certificado."
  )
}
