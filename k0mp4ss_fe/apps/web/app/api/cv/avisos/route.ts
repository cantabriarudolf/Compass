/**
 * /api/cv/avisos — avisos del Visor de Mensajes CV (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id con refines de
 * negocio (multimedia excluyente, sin base64). Authz sobre "cv".
 *
 * Caducidad al leer (decisión del owner 2026-10-22): antes los avisos vencidos
 * solo se archivaban si alguien abría `/comunidad/visor`; si nadie la abría, el
 * vencido seguía publicado. Ahora el servidor resuelve al servir la lista.
 */
import { AvisoCVSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import { logger } from "@/lib/logger"
import { registrarEventosAuditoria } from "@/lib/auditoria"

const handlers = createCrudHandlers({
  model: delegado(prisma.avisoCV),
  schema: AvisoCVSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "cv"),
})

/** Tope por lectura: evita barrer un backlog enorme en una sola request. */
const MAX_CADUCADOS_POR_LECTURA = 200

/**
 * Archiva los avisos vencidos de la comunidad antes de responder la lista.
 *
 * - Un solo `findMany` acotado + un solo `updateMany` + un `createMany` de
 *   eventos: nada de N+1.
 * - Idempotente: solo toca `estado === "publicado"` con `expiresAt < hoy`.
 * - Best-effort: cualquier fallo se loguea y la lista responde igual; la
 *   caducidad no puede tumbar la lectura del visor.
 */
async function archivarVencidosAlLeer(): Promise<void> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return
  const { scope } = resultado

  const hoy = hoyISO()
  const vencidos = await prisma.avisoCV.findMany({
    where: {
      comunidadId: scope.comunidadId,
      estado: "publicado",
      expiresAt: { not: null, lt: hoy },
    },
    select: { id: true, titulo: true, expiresAt: true },
    orderBy: { id: "asc" },
    take: MAX_CADUCADOS_POR_LECTURA,
  })
  if (vencidos.length === 0) return

  await prisma.avisoCV.updateMany({
    where: { id: { in: vencidos.map((v) => v.id) } },
    data: { estado: "archivado", fechaArchivado: hoy },
  })

  // INV-03: cada evento pasa por la única puerta (`lib/auditoria.ts`), que
  // valida la forma mínima antes de escribir. Sigue siendo best-effort: el
  // llamador captura el fallo y la lista responde igual.
  //
  // Se emiten en UNA sentencia (`registrarEventosAuditoria`): validar-todos-y-
  // crear-de-una deja el efecto atómico, como el `createMany` que había antes.
  await registrarEventosAuditoria(
    vencidos.map((v) => ({
      id: generarId("ev"),
      comunidadId: scope.comunidadId,
      timestamp: new Date().toISOString(),
      usuario: scope.usuarioId,
      categoria: "CV",
      tipoAccion: "CV_ARCHIVED",
      referenciaId: v.id,
      descripcion: `Aviso "${v.titulo}" expiró automáticamente (${v.expiresAt}) y salió del carrusel.`,
    }))
  )
}

export async function GET(req: Request): Promise<Response> {
  await archivarVencidosAlLeer().catch((e) =>
    logger.error({ err: e }, "[cv/avisos] caducidad al leer")
  )
  return handlers.GET(req)
}

export const POST = handlers.POST
