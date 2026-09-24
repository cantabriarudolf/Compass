/**
 * /api/periodos-directiva/[id]/cerrar — cierre manual del período vigente (Fase 2).
 *
 * POST: cambia estado a "cerrado", fija fechaFin (body opcional, default hoy)
 * y archiva la nómina en `miembros` desde las fichas de MP en BD. Al cerrar,
 * la nómina queda congelada (el PUT con miembros responde 409).
 * Solo administrador/directiva con permiso de edición sobre GD.
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { puede } from "@/lib/authz"
import { hoyISO } from "@/lib/date-utils"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { errorPeriodos } from "../../route"

const CerrarSchema = z.object({
  fechaFin: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fechaFin debe ser YYYY-MM-DD.")
    .optional(),
})

type CtxTipo = { params: Promise<{ id: string }> }

/** POST cierra el período vigente archivando su nómina. */
export async function POST(req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "editar", "gd")) {
    return jsonError(403, "Permiso denegado.")
  }
  const { id } = await ctx.params

  const body: unknown = await req.json().catch(() => null)
  const parsed = CerrarSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }

  try {
    const periodo = await prisma.periodoDirectiva.findUnique({ where: { id } })
    if (!periodo || periodo.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (periodo.estado === "cerrado") {
      return jsonError(409, "El período ya está cerrado.")
    }
    const fechaFin = parsed.data.fechaFin ?? hoyISO()

    // Archiva la nómina desde las fichas de gobernanza en BD (libro físico).
    const personas = await prisma.persona.findMany({
      where: { comunidadId: scope.comunidadId },
      select: { id: true, nombreCompleto: true, datosGobernanza: true },
    })
    // SAFETY: fichas Json escritas por la API de personas (ExtensionGobernanzaSchema); se archivan tal cual.
    const roster = personas.flatMap((p) => {
      const ficha = p.datosGobernanza as unknown as {
        periodoId?: string
        cargoDirectiva: string
        fechaAsuncion: string
        fechaTermino?: string
        motivoTermino?: string
      } | null
      return ficha && ficha.periodoId === id
        ? [
            {
              personaId: p.id,
              nombre: p.nombreCompleto,
              cargo: ficha.cargoDirectiva,
              fechaAsuncion: ficha.fechaAsuncion,
              ...(ficha.fechaTermino ? { fechaTermino: ficha.fechaTermino } : {}),
              ...(ficha.motivoTermino ? { motivoTermino: ficha.motivoTermino } : {}),
            },
          ]
        : []
    })

    // SAFETY: roster validado al asignar fichas; round-trip elimina undefined para InputJsonValue.
    const cerrado = await prisma.periodoDirectiva.update({
      where: { id },
      data: {
        estado: "cerrado",
        fechaFin,
        miembros: JSON.parse(JSON.stringify(roster)) as never,
      },
    })
    return Response.json(cerrado)
  } catch (e) {
    return errorPeriodos(e)
  }
}
