/**
 * /api/reglamento — versión vigente del reglamento del cobro (T3).
 *
 * GET: devuelve la versión que rige el período pedido (`?periodo=AAAA-MM`, por
 * defecto el mes en curso). 404 si la comunidad todavía no declaró ninguna.
 * POST: crea una versión nueva; `version` la asigna el servidor y la fuente se
 * restringe a las reales (reglamento de copropiedad o acta de asamblea).
 *
 * Las versiones son append-only: no hay PUT ni DELETE, porque una versión ya
 * usada por una emisión no puede cambiar (S4). Authz: `fi:gasto_comun` (la
 * configuración del cobro GC), el granular que ya separa el gasto común del
 * resto de FI: el administrador escribe y el comité lee.
 */
import { NuevaVersionReglamentoSchema, PeriodoFacturacionSchema, VersionReglamentoSchema } from "@/lib/schemas"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { hoyISO } from "@/lib/date-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { versionReglamentoVigenteDeComunidad } from "@/lib/reglamento"
import { errorGenerico } from "@/app/api/personas/route"

/** GET: versión vigente de la comunidad para el período pedido. */
export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "ver", "fi:gasto_comun")) {
    return jsonError(403, "Permiso denegado.")
  }

  const periodo =
    new URL(req.url).searchParams.get("periodo") ?? hoyISO().slice(0, 7)
  const periodoValido = PeriodoFacturacionSchema.safeParse(periodo)
  if (!periodoValido.success) {
    return jsonError(400, "El período debe tener formato AAAA-MM.")
  }

  try {
    const version = await versionReglamentoVigenteDeComunidad(
      scope.comunidadId,
      periodo
    )
    if (!version) {
      return jsonError(
        404,
        `La comunidad no tiene una versión del reglamento vigente para el período ${periodo}.`
      )
    }
    return Response.json(version)
  } catch (e) {
    logger.error({ err: e }, "[api/reglamento] error GET")
    return errorGenerico(e)
  }
}

/** POST: alta de una versión del reglamento (append-only). */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "crear", "fi:gasto_comun")) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parsed = NuevaVersionReglamentoSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { fuenteInstrumento, actaRef, formaContribucion, parametros, vigenteDesde } =
    parsed.data

  try {
    const ultima = await prisma.versionReglamento.findFirst({
      where: { comunidadId: scope.comunidadId },
      orderBy: { version: "desc" },
      select: { version: true },
    })
    const candidata = {
      id: generarId("vreg"),
      version: (ultima?.version ?? 0) + 1,
      vigenteDesde,
      fuenteInstrumento,
      actaRef: actaRef ?? null,
      formaContribucion,
      parametros,
    }
    const valida = VersionReglamentoSchema.safeParse(candidata)
    if (!valida.success) {
      return jsonError(400, "Datos inválidos.", {
        detalles: valida.error.flatten(),
      })
    }

    const creada = await prisma.versionReglamento.create({
      data: { ...valida.data, comunidadId: scope.comunidadId } as never,
    })

    // Auditoría `FI_REG_VERSION`: la emisión no bloquea una escritura ya
    // persistida (mismo patrón que /api/configuracion).
    try {
      await registrarEventoAuditoria({
        id: generarId("ev"),
        comunidadId: scope.comunidadId,
        timestamp: new Date().toISOString(),
        usuario: scope.usuarioId,
        categoria: "FI",
        tipoAccion: "FI_REG_VERSION",
        referenciaId: creada.id,
        descripcion: `Reglamento versión ${creada.version} vigente desde ${creada.vigenteDesde} (${creada.fuenteInstrumento}, ${creada.formaContribucion}).`,
      })
    } catch (e) {
      logger.error({ err: e }, "[api/reglamento] no se pudo registrar FI_REG_VERSION")
    }

    return Response.json(creada, { status: 201 })
  } catch (e) {
    logger.error({ err: e }, "[api/reglamento] error POST")
    return errorGenerico(e)
  }
}
