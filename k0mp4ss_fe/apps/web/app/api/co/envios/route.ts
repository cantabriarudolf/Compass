/**
 * /api/co/envios — envíos de Comunicación con Vecinos CO (Fase 4).
 *
 * GET a medida (change co-lectura-residente, D2): `createCrudHandlers` solo sabe
 * filtrar por `comunidadId`, así que la proyección por rol y el filtro por
 * pertenencia se resuelven acá. Cada rol recibe un shape distinto y el residente
 * solo ve los envíos donde figura en `EnvioDestinatarioCO`.
 *
 * POST a medida (tarea 1.6): el alta escribe el envío, sus filas de
 * `EnvioDestinatarioCO` y el `lecturas` derivado en una sola `$transaction`.
 */
import { EnvioCOSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import {
  cargarDestinos,
  proyectarEnvio,
  rolProyeccion,
  whereEnvios,
} from "../_lib/proyeccion-envio"
import { escribirEnvioCO } from "../_lib/escritura-envio"

export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", "co")) return jsonError(403, "Permiso denegado.")

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50)
  )

  const rol = rolProyeccion(scope.rol)
  try {
    // El residente filtra por SU persona del Maestro de Personas, nunca por query.
    const personaId = rol === "residente" ? await personaIdDelUsuarioDb(scope.usuarioId) : null
    const where = whereEnvios(rol, scope.comunidadId, personaId)
    const [filas, total] = await Promise.all([
      prisma.envioCO.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.envioCO.count({ where }),
    ])
    const destinos = await cargarDestinos(
      filas.map((f) => f.id),
      rol === "residente" ? personaId : null
    )
    const data = filas.map((fila) =>
      proyectarEnvio(
        rol,
        fila,
        destinos.filter((d) => d.envioId === fila.id)
      )
    )
    return Response.json({ data, page, pageSize, total })
  } catch (e) {
    logger.error({ err: e }, "[api/co/envios] error en GET")
    return jsonError(500, "Error interno del servidor.")
  }
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  const body: unknown = await req.json().catch(() => null)
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Cuerpo JSON inválido.")
  }

  const parsed = EnvioCOSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", { detalles: parsed.error.flatten() })
  }
  const datos = parsed.data
  const id = typeof datos.id === "string" ? datos.id : undefined
  if (!id) return jsonError(400, "El identificador (id) es obligatorio.")

  try {
    const existente = await prisma.envioCO.findUnique({
      where: { id },
      select: { comunidadId: true },
    })
    // Upsert sobre un registro de OTRA comunidad → 404 (sin filtrar existencia)
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, existente ? "editar" : "crear", "co")) {
      return jsonError(403, "Permiso denegado.")
    }

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
          lecturas: datos.lecturas,
        },
        { crear: !existente }
      )
    )
    const record = await prisma.envioCO.findUnique({ where: { id } })
    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    logger.error({ err: e }, "[api/co/envios] error en POST")
    return jsonError(500, "Error interno del servidor.")
  }
}
