/**
 * /api/mt/garantias/verificar — verifica garantías de trabajos finalizados.
 *
 * POST custom (edición sobre "mt"): la lógica vive en `_garantias.ts` para que
 * el `GET` de trabajos la ejecute también al servir la lista (decisión del owner
 * 2026-10-22: la alerta no puede depender de que alguien pulse el botón).
 */
import { logger } from "@/lib/logger"
import { errorGenerico } from "@/app/api/personas/route"
import { contextoAccionMT } from "../../_acciones"
import { verificarGarantiasAlLeer } from "../../_garantias"

/** POST verifica las garantías vigentes y devuelve cuántas alertas emitió. */
export async function POST(): Promise<Response> {
  const contexto = await contextoAccionMT("editar")
  if (!contexto.ok) return contexto.response

  try {
    const alertadas = await verificarGarantiasAlLeer(contexto.scope)
    return Response.json({ ok: true, alertadas })
  } catch (e) {
    logger.error({ err: e }, "[api/mt/garantias/verificar] error inesperado")
    return errorGenerico(e)
  }
}
