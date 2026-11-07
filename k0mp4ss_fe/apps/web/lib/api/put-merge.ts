/**
 * put-merge — PUT parcial con validación de objeto completo (BD-FUENTE-VERDAD Fase 4).
 *
 * La factory (`crud-factory`) exige schemas ZodObject para su PUT (aplica
 * `.partial()`), pero varios schemas de dominio son ZodEffects (`.refine` de
 * negocio: ElementoRA, AvisoCV, PlantillaCV…). Este helper implementa el PUT
 * parcial sin `.partial()`: fusiona el parche sobre el registro existente y
 * valida el objeto COMPLETO, de modo que los refinamientos de negocio se
 * siguen cumpliendo en actualizaciones parciales.
 *
 * Contrato idéntico al resto de la serie:
 * - `comunidadId` desde sesión, jamás del body.
 * - Authz `editar` antes de tocar Prisma.
 * - Registro de otra comunidad → 404 (sin filtrar existencia).
 * - Alcance por filas opcional (`alcance`, misma forma y contrato que en la
 *   factory): la comunidad dice qué filas PUEDEN existir para el actor; el
 *   alcance dice cuáles de ellas son suyas.
 * - Claves desconocidas (createdAt/updatedAt de Prisma) las poda Zod.
 */
import type { z } from "zod"
import { logger } from "@/lib/logger"
import type { Accion } from "@/lib/authz"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "./with-comunidad-scope"
import type {
  AlcanceDeFilas,
  AntesDeEscribir,
  AuthzCheck,
  CrudDelegate,
  DespuesDeEscribir,
} from "./crud-factory"

export interface PutMergeConfig {
  model: CrudDelegate
  schema: z.ZodType
  authzCheck?: AuthzCheck
  recurso?: string
  /**
   * Alcance por filas, opcional y aditivo. Misma firma y contrato que
   * `CrudConfig.alcance` (`crud-factory`): recibe el scope de la sesión y
   * devuelve el fragmento `where` de «lo propio», o `null` cuando el rol ve la
   * comunidad completa.
   *
   * `null` es la ausencia de restricción y la decide el ROL (gestión: administrador
   * y comité ven la comunidad completa), nunca la ausencia de identidad. Un rol
   * acotado por filas cuyo usuario no tiene `personaId` **no** recibe `null`: recibe
   * un fragmento que no matchea nada y falla cerrado (ver
   * `alcancePorFilasDeSesion` en `lib/api/sesion-persona.ts`).
   *
   * Sin esta opción el comportamiento es exactamente el de siempre:
   * `findUnique({ where: { id } })` + comparación de `comunidadId`, UNA consulta.
   * Con fragmento, el filtro viaja en el `where` (`findFirst`), así que la fila
   * de otro dueño NO se carga y responde el 404 genérico de la serie —nunca 403:
   * el 403 confirmaría que existe—, con el mismo criterio que el PUT de la
   * factory. Una ruta que ya declara `alcance` para su colección debe pasar AQUÍ
   * el MISMO helper (el `_alcance.ts` del recurso), no un segundo filtro: así la
   * definición de «lo propio» es una sola por recurso.
   */
  alcance?: AlcanceDeFilas
  /**
   * Hook post-escritura (auditoría, T1c), opcional y aditivo: se invoca
   * después del `model.update` con `accion: "editar"`, `registro` = fila
   * actualizada y `previo` = fila existente. Si lanza, el error se registra
   * con `logger.error` y la respuesta sigue siendo la del éxito ya confirmado:
   * la fila ya está escrita y devolver 500 haría que el cliente reintente y
   * duplique la escritura. La auditoría no puede romper la operación, pero
   * tampoco puede quedar en silencio.
   */
  despuesDeEscribir?: DespuesDeEscribir
  /**
   * Guardia previa a la escritura, misma semántica que en la factory CRUD:
   * corre después de authz y antes del `model.update`, con el payload ya
   * fusionado y validado. Devuelve un Response para cortar, o null para seguir.
   */
  antesDeEscribir?: AntesDeEscribir
}

type Ctx = { params: Promise<{ id: string }> }

/**
 * Crea un handler PUT parcial: fusiona parche + existente y valida completo.
 */
export function createPutMerge(config: PutMergeConfig) {
  const { model, schema, authzCheck, recurso } = config

  /**
   * Fila por `id` que el actor puede escribir, o `null` (→ 404 genérico).
   *
   * Sin `alcance` se conserva la lectura de siempre —`findUnique` + comparación
   * de comunidad, UNA consulta—, así que las rutas que no lo declaran no cambian
   * ni de comportamiento ni de consulta. Con `alcance`, el filtro viaja en el
   * `where` (`findFirst`) y la fila de otro dueño no se carga; el PUT no necesita
   * distinguir «ajena» de «inexistente» (a diferencia del POST de la factory, no
   * hay upsert que pudiera reescribirla por `id`), así que ambos casos comparten
   * el mismo 404.
   */
  async function cargarFila(
    scope: ComunidadScope,
    id: string
  ): Promise<Record<string, unknown> | null> {
    const fragmento = config.alcance
      ? ((await config.alcance(scope)) ?? null)
      : null
    if (!fragmento) {
      const fila = (await model.findUnique({ where: { id } })) as Record<
        string,
        unknown
      > | null
      // Registro de OTRA comunidad → 404 (sin filtrar existencia).
      if (!fila || fila.comunidadId !== scope.comunidadId) return null
      return fila
    }
    if (!model.findFirst) {
      throw new Error(
        "El delegate no expone findFirst: el alcance por filas no se puede aplicar."
      )
    }
    return (await model.findFirst({
      where: { id, comunidadId: scope.comunidadId, ...fragmento },
    })) as Record<string, unknown> | null
  }

  return async function PUT(req: Request, ctx: Ctx): Promise<Response> {
    const resultado = await withComunidadScope()
    if (!resultado.ok) return resultado.response
    const scope = resultado.scope

    const body: unknown = await req.json().catch(() => null)
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return jsonError(400, "Cuerpo JSON inválido.")
    }

    const { id } = await ctx.params
    try {
      const existente = await cargarFila(scope, id)
      if (!existente) return jsonError(404, "Registro no encontrado.")
      if (authzCheck && !authzCheck(scope.rol, "editar" as Accion)) {
        return jsonError(403, "Permiso denegado.")
      }

      // Fusión parche + existente; Zod poda claves de Prisma (createdAt…).
      // Los NULL de BD equivalen a "ausente" para los opcionales de Zod
      // (optional acepta undefined, no null); se podan salvo que el parche
      // los envíe explícitamente (ahí valida el schema y falla si no admite null).
      const parche = body as Record<string, unknown>
      const base: Record<string, unknown> = {}
      for (const [clave, valor] of Object.entries(existente)) {
        if (valor === null && !(clave in parche)) continue
        base[clave] = valor
      }
      const fusionado = { ...base, ...parche }
      const parsed = schema.safeParse(fusionado)
      if (!parsed.success) {
        return jsonError(400, "Datos inválidos.", {
          detalles: parsed.error.flatten(),
        })
      }
      // SAFETY: parsed.data ya pasó safeParse del schema; solo se podan id/comunidadId.
      const datos = { ...(parsed.data as Record<string, unknown>) }
      delete datos.id
      delete datos.comunidadId
      if (config.antesDeEscribir) {
        const corto = await config.antesDeEscribir({
          datos: parsed.data as Record<string, unknown>,
          previo: existente,
          scope,
        })
        if (corto) return corto
      }
      const actualizado = await model.update({
        where: { id },
        data: datos,
      })
      // Hook post-escritura: la fila ya está confirmada y la respuesta de éxito
      // no se toca aunque el hook lance (el error queda en logger.error; ver
      // PutMergeConfig.despuesDeEscribir).
      if (config.despuesDeEscribir) {
        try {
          await config.despuesDeEscribir({
            accion: "editar",
            registro: actualizado,
            previo: existente,
            scope,
          })
        } catch (e) {
          logger.error(
            { err: e, recurso },
            "[api/put-merge] despuesDeEscribir falló"
          )
        }
      }
      return Response.json(actualizado)
    } catch (e) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        return jsonError(409, "Conflicto: registro duplicado.")
      }
      logger.error(
        { err: e, recurso },
        "[api/put-merge] error inesperado"
      )
      return jsonError(500, "Error interno del servidor.")
    }
  }
}
