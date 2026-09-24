/**
 * /api/actas-gd/[id]/aprobar — firma de aprobación de un acta GD (Fase 2).
 *
 * Espejo servidor de `aprobarActaGD` (lib/store.ts):
 * - El firmante debe ser miembro vigente de la directiva (período vigente en BD).
 * - Anti-suplantación: `personaId` debe ser la persona del usuario de sesión.
 * - Sin doble firma (409).
 * - Quórum 100% de la directiva vigente → el acta se publica (estado,
 *   fechaPublicacion, avisoCVReferencia "pendiente" para CV).
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { hoyISO } from "@/lib/date-utils"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import {
  esMiembroVigente,
  idsDirectivaVigenteDb,
  periodoVigenteDb,
  personaIdDelUsuarioDb,
  type FichaGobernanzaMin,
} from "@/lib/api/gd-guard"
import { errorActas } from "../../route"

const AprobarSchema = z.object({
  personaId: z.string().min(1, "personaId es obligatorio."),
})

type CtxTipo = { params: Promise<{ id: string }> }

/** POST agrega la firma y publica al completar el quórum. */
export async function POST(req: Request, ctx: CtxTipo): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const { id } = await ctx.params

  const body: unknown = await req.json().catch(() => null)
  const parsed = AprobarSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { personaId } = parsed.data

  // Anti-suplantación: solo se firma como uno mismo.
  const propiaPersona = await personaIdDelUsuarioDb(scope.usuarioId)
  if (!propiaPersona || propiaPersona !== personaId) {
    return jsonError(
      403,
      "Solo puedes firmar actas como tu propia persona (sin suplantación)."
    )
  }

  try {
    const acta = await prisma.actaGD.findUnique({ where: { id } })
    if (!acta || acta.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (acta.estado === "publicada") {
      return jsonError(409, "El acta ya está publicada.")
    }

    const vigente = await periodoVigenteDb(scope.comunidadId)
    const firmante = await prisma.persona.findUnique({
      where: { id: personaId },
      select: { id: true, estadoCuenta: true, datosGobernanza: true, comunidadId: true },
    })
    // SAFETY: ficha Json validada por ExtensionGobernanzaSchema al escribir; solo se lee periodoId/fechaTermino.
    const ficha = (firmante?.datosGobernanza as unknown as FichaGobernanzaMin | null) ?? null
    if (
      !firmante ||
      firmante.comunidadId !== scope.comunidadId ||
      !esMiembroVigente(
        { estadoCuenta: firmante.estadoCuenta, datosGobernanza: ficha },
        vigente?.id
      )
    ) {
      return jsonError(
        403,
        "Solo un miembro vigente de la directiva puede aprobar el acta."
      )
    }

    // SAFETY: aprobaciones es Json string[] validado por ActaGDSchema al escribir.
    const aprobaciones = [...((acta.aprobaciones as unknown as string[]) ?? [])]
    if (aprobaciones.includes(personaId)) {
      return jsonError(409, "Esta persona ya aprobó el acta.")
    }
    aprobaciones.push(personaId)

    // Quórum 100% de la directiva vigente (lee desde Prisma, no del store).
    const directiva = await idsDirectivaVigenteDb(scope.comunidadId, vigente?.id)
    const quorumCompleto =
      directiva.length > 0 && directiva.every((m) => aprobaciones.includes(m))

    // SAFETY: update parcial con campos escalares del modelo; Json ya validado.
    const actualizada = await prisma.actaGD.update({
      where: { id },
      data: {
        aprobaciones: aprobaciones as never,
        ...(quorumCompleto
          ? {
              estado: "publicada",
              fechaPublicacion: hoyISO(),
              avisoCVReferencia: "pendiente",
            }
          : {}),
      },
    })
    return Response.json({ acta: actualizada, publicada: quorumCompleto })
  } catch (e) {
    return errorActas(e)
  }
}
