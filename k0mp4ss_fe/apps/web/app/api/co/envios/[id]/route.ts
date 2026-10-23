/**
 * /api/co/envios/[id] — detalle/actualización parcial/baja.
 *
 * GET a medida (change co-lectura-residente, D2 · S2/S3): el residente solo abre
 * envíos donde figura como destinatario y **un envío ajeno responde 404**, igual
 * que un id inexistente: el 404 no distingue «no es tuyo» de «no existe».
 * PUT parcial y DELETE con authz `co`. El PUT va a medida (tarea 1.6) porque la
 * edición tiene que escribir `EnvioDestinatarioCO` y el `lecturas` derivado en la
 * misma `$transaction` que el snapshot.
 */
import { EnvioCOSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import {
  cargarDestinos,
  proyectarEnvio,
  rolProyeccion,
  whereEnvioDetalle,
} from "../../_lib/proyeccion-envio"
import { escribirEnvioCO } from "../../_lib/escritura-envio"

type Ctx = { params: Promise<{ id: string }> }

const modelo = delegado(prisma.envioCO)
const authzCheck = (rol: string, accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar") =>
  puede(rol, accion, "co")

const handlers = createCrudHandlers({
  model: modelo,
  schema: EnvioCOSchema,
  authzCheck,
})

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", "co")) return jsonError(403, "Permiso denegado.")

  const { id } = await ctx.params
  const rol = rolProyeccion(scope.rol)
  try {
    const personaId = rol === "residente" ? await personaIdDelUsuarioDb(scope.usuarioId) : null
    const fila = await prisma.envioCO.findFirst({
      where: whereEnvioDetalle(rol, scope.comunidadId, id, personaId),
    })
    if (!fila) return jsonError(404, "Registro no encontrado.")
    const destinos = await cargarDestinos([fila.id], rol === "residente" ? personaId : null)
    return Response.json(proyectarEnvio(rol, fila, destinos))
  } catch (e) {
    logger.error({ err: e }, "[api/co/envios/[id]] error en GET")
    return jsonError(500, "Error interno del servidor.")
  }
}

/**
 * PUT parcial: fusiona el parche sobre el registro existente y valida el objeto
 * COMPLETO (misma semántica que `put-merge`: los `null` de BD equivalen a
 * "ausente"), pero escribe por `escribirEnvioCO` para mantener la tabla de
 * destinatarios y el `lecturas` derivado en una sola transacción.
 */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  const body: unknown = await req.json().catch(() => null)
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Cuerpo JSON inválido.")
  }

  const { id } = await ctx.params
  try {
    const existente = await prisma.envioCO.findUnique({ where: { id } })
    if (!existente || existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, "editar", "co")) return jsonError(403, "Permiso denegado.")

    const parche = body as Record<string, unknown>
    const base: Record<string, unknown> = {}
    for (const [clave, valor] of Object.entries(existente)) {
      if (valor === null && !(clave in parche)) continue
      base[clave] = valor
    }
    const parsed = EnvioCOSchema.safeParse({ ...base, ...parche })
    if (!parsed.success) {
      return jsonError(400, "Datos inválidos.", { detalles: parsed.error.flatten() })
    }
    const datos = parsed.data

    await prisma.$transaction((tx) =>
      escribirEnvioCO(
        tx,
        {
          id,
          comunidadId: scope.comunidadId,
          asunto: datos.asunto,
          cuerpo: datos.cuerpo,
          plantillaId: datos.plantillaId ?? null,
          fechaEnvio: datos.fechaEnvio,
          destinatarios: datos.destinatarios,
          // En la edición la nómina puede cambiar: las lecturas ya confirmadas se
          // conservan por fila (ver `sincronizarDestinatarios`), no por el parche.
          lecturas: [],
        },
        { crear: false }
      )
    )
    const actualizado = await prisma.envioCO.findUnique({ where: { id } })
    return Response.json(actualizado)
  } catch (e) {
    logger.error({ err: e }, "[api/co/envios/[id]] error en PUT")
    return jsonError(500, "Error interno del servidor.")
  }
}

export const DELETE = handlers.DELETE
