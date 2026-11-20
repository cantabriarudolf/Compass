/**
 * /api/co/cola — la cola de salida del correo de las difusiones masivas de CO
 * (S2/S3/S4/S5/S6).
 *
 * `GET`  devuelve la métrica honesta de la cola: **enviados, fallidos y
 *        pendientes** con el motivo del último error. No hay tasa de apertura ni
 *        «entregados»: SMTP no informa aperturas y esa palabra es del visor (S4/S5).
 *
 * `POST` drena UN lote acotado y responde cuántas tomó, cuántas envió, cuántas
 *        fallaron y cuántas quedan. Es el proceso explícito de S6: nada se envía
 *        por un `setInterval` ni por un efecto de importación — si nadie invoca
 *        esta ruta, no sale un solo correo.
 *
 * Autorización: es la misma operación administrativa que el envío masivo. La
 * compuerta es `co:difusiones` con `crear` —la clave granular que ya usa
 * `GET /api/co/alcance-masivo`, que existe para el mismo acto—, y `ver` para la
 * métrica. La raíz desnuda `co` no se usa en un endpoint nuevo (candado R1: la
 * MATRIZ ya declara hermanos granulares y el fallback de prefijo se los
 * heredaría a todo rol con `co`).
 *
 * El scope de comunidad sale de la sesión (`withComunidadScope`). Un `envioId`
 * de otra comunidad no es un dato ajeno que se ignora: es un envío que no existe
 * (404), y su cola no se toca.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import {
  drenarColaSalidaCO,
  resumenColaSalidaCO,
} from "@/lib/co-cola"
import { registrarDenegacionCo } from "../_lib/denegacion"

/** El envío existe y es de la comunidad de la sesión. */
async function esEnvioDeLaComunidad(envioId: string, comunidadId: string): Promise<boolean> {
  const fila = await prisma.envioCO.findUnique({
    where: { id: envioId },
    select: { comunidadId: true },
  })
  return fila !== null && fila.comunidadId === comunidadId
}

export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", "co:difusiones")) {
    registrarDenegacionCo(scope, "co:difusiones", "ver")
    return jsonError(403, "Permiso denegado.")
  }

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }
  const envioId = url.searchParams.get("envioId")?.trim() || undefined

  try {
    // Un envío de otra comunidad responde 404 antes de contar nada.
    if (envioId !== undefined && !(await esEnvioDeLaComunidad(envioId, scope.comunidadId))) {
      return jsonError(404, "Registro no encontrado.")
    }
    return Response.json(
      await resumenColaSalidaCO({ comunidadId: scope.comunidadId, envioId })
    )
  } catch (e) {
    logger.error({ err: e }, "[api/co/cola] error en GET")
    return jsonError(500, "Error interno del servidor.")
  }
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "crear", "co:difusiones")) {
    registrarDenegacionCo(scope, "co:difusiones", "crear")
    return jsonError(403, "Permiso denegado.")
  }

  // El cuerpo es opcional (`{}` drena el lote de omisión); lo que llegue tiene
  // que ser un objeto JSON. `limite` se acota en `lib/co-cola.ts`.
  const crudo: unknown = await req.json().catch(() => ({}))
  if (crudo === null || typeof crudo !== "object" || Array.isArray(crudo)) {
    return jsonError(400, "Cuerpo JSON inválido.")
  }
  const cuerpo = crudo as Record<string, unknown>
  const envioIdCrudo = cuerpo.envioId
  if (
    envioIdCrudo !== undefined &&
    (typeof envioIdCrudo !== "string" || envioIdCrudo.trim() === "")
  ) {
    return jsonError(400, "El identificador del envío es inválido.")
  }
  const envioId = typeof envioIdCrudo === "string" ? envioIdCrudo.trim() : undefined

  try {
    if (envioId !== undefined && !(await esEnvioDeLaComunidad(envioId, scope.comunidadId))) {
      return jsonError(404, "Registro no encontrado.")
    }
    return Response.json(
      await drenarColaSalidaCO({
        comunidadId: scope.comunidadId,
        envioId,
        limite: cuerpo.limite,
      })
    )
  } catch (e) {
    logger.error({ err: e }, "[api/co/cola] error en POST")
    return jsonError(500, "Error interno del servidor.")
  }
}
