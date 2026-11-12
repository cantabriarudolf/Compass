/**
 * /api/acuerdos — registro de acuerdos de gobernanza (U3 de la serie «saldar
 * para pruebas manuales»).
 *
 * Es la pieza que hoy no existe y que necesitan tres trámites: el corte de
 * servicios (F28, acuerdo del comité — Ley 21.442 art. 20 N°9), el convenio de
 * pago (F29, art. 6) y el presupuesto por partidas (F31, que el reglamento de
 * cada comunidad manda aprobar a un cuerpo). Por eso el acuerdo guarda CUÁL fue
 * el cuerpo y CUÁL la regla de quórum aplicada: el registro no lo asume.
 *
 * - POST: crea el acuerdo. Guard `gd` + `crear` (comité y administración, el
 *   mismo permiso de las actas). El servidor asigna id, folio del libro
 *   (`AD-<año>-<correlativo>`, con reintento si el índice único choca), fecha,
 *   estado inicial `abierto` y `creadoPor`; el cliente no decide ninguno.
 * - Los votos NO se emiten acá: van por `[id]/voto` (un voto por persona,
 *   inmutable). No hay PUT ni DELETE: un acuerdo no se reescribe por API.
 */
import { AcuerdoSchema } from "@/lib/schemas"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { puedeGestionarAcuerdos } from "./_guard"
import { anioDeFecha, siguienteFolioAcuerdo } from "./_folio"

/** Intentos de asignación de folio antes de rendirse ante colisiones reales. */
const MAX_INTENTOS_FOLIO = 3

/** ¿El error es la colisión del índice único `(comunidadId, folio)`? */
function esConflictoDeFolio(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  )
}

/**
 * Siguiente folio del libro de acuerdos de la comunidad: `max(correlativo del
 * año) + 1`. Lectura simple, sin transacción: el índice único es lo que impide
 * repetir el folio, no el aislamiento (mismo criterio medido para el libro de
 * actas, ver `app/api/actas-gd/route.ts`).
 */
async function asignarFolio(comunidadId: string, anio: string): Promise<string> {
  const emitidos = await prisma.acuerdo.findMany({
    where: { comunidadId },
    select: { folio: true },
  })
  return siguienteFolioAcuerdo(
    emitidos.map((acuerdo) => acuerdo.folio),
    anio
  )
}

function errorAcuerdos(e: unknown): Response {
  if (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  ) {
    return jsonError(404, "Registro no encontrado.")
  }
  logger.error({ err: e }, "[api/acuerdos] error inesperado")
  return jsonError(500, "Error interno del servidor.")
}

/** Nombres legibles para la bitácora (la fila guarda el código, no el nombre). */
const NOMBRE_CUERPO: Record<string, string> = {
  comite: "Comité",
  asamblea: "Asamblea",
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope: ComunidadScope = resultado.scope

  if (!puedeGestionarAcuerdos(scope.rol, "crear")) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = AcuerdoSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const datos = parsed.data

  // El acta es la prueba de la sesión (asamblea) o de la reunión (comité): si se
  // declara, tiene que existir en ESTA comunidad. Un id suelto de otra comunidad
  // sería una cita falsa en el registro.
  if (datos.actaId) {
    const acta = await prisma.actaGD.findFirst({
      where: { id: datos.actaId, comunidadId: scope.comunidadId },
      select: { id: true },
    })
    if (!acta) {
      return jsonError(
        400,
        `No se puede registrar el acuerdo: el acta "${datos.actaId}" no existe en esta comunidad.`
      )
    }
  }

  const ahora = new Date()
  const anio = anioDeFecha(hoyISO())
  const cuerpo = datos.cuerpo

  for (let intento = 1; intento <= MAX_INTENTOS_FOLIO; intento++) {
    const folio = await asignarFolio(scope.comunidadId, anio)
    try {
      const record = await prisma.$transaction(async (tx) => {
        const creado = await tx.acuerdo.create({
          data: {
            id: generarId("acu"),
            comunidadId: scope.comunidadId,
            cuerpo,
            materia: datos.materia,
            folio,
            quorumRequerido: datos.quorumRequerido,
            fecha: ahora,
            actaId: datos.actaId ?? null,
            creadoPor: scope.usuarioId,
          },
        })
        // El alta queda auditada en la misma transacción: o existe el acuerdo
        // foliado y su evento, o no existe ninguno de los dos.
        await registrarEventoAuditoria(
          {
            id: generarId("ev"),
            comunidadId: scope.comunidadId,
            timestamp: ahora.toISOString(),
            usuario: scope.usuarioId,
            categoria: "AD",
            tipoAccion: "AD_ACUERDO_CREADO",
            referenciaId: creado.id,
            descripcion: `Se registró el acuerdo ${folio} de ${NOMBRE_CUERPO[cuerpo] ?? cuerpo} sobre «${datos.materia}» (regla aplicada: ${datos.quorumRequerido}).`,
          },
          tx
        )
        return creado
      })
      return Response.json(record, { status: 201 })
    } catch (e) {
      // P2002 = índice único `(comunidadId, folio)`: otra alta tomó el número
      // entre la lectura y la escritura. Se reintenta con el siguiente.
      if (!esConflictoDeFolio(e)) return errorAcuerdos(e)
    }
  }

  return jsonError(
    409,
    "Conflicto: no se pudo reservar un folio libre para el acuerdo, reintentá el registro."
  )
}
