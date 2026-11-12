/**
 * POST /api/vigencia-registro/multa/[id]/aplicar — el Comité aplica o desestima (S4).
 *
 * El sistema propone; la aplicación es del Comité, como manda el reglamento. Por
 * eso el cuerpo exige `acuerdoReferencia` —el acta o el número de acuerdo que la
 * aprobó— y sin ese texto la multa no se puede aplicar: sin acuerdo no hay multa.
 * Desestimar exige un `motivo` y no crea ninguna infracción.
 *
 * Al aplicar se escribe UNA `InfraccionIN` para la unidad con el **monto congelado
 * en la propuesta** (no el monto vigente del maestro) y la propuesta pasa a
 * `aplicada` con quién, cuándo y con qué acuerdo. Todo en una transacción: una
 * propuesta resuelta no se vuelve a resolver (409) y la infracción existe una
 * sola vez. La materialización financiera (`CargoFI`) queda en el módulo IN: acá
 * no se crea.
 */
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { normalizaRol, puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Aplicar y desestimar son dos actos distintos con cuerpos distintos: exigir el
 * acuerdo en el camino de aplicar y el motivo en el de desestimar evita que un
 * cuerpo incompleto se cuele como el otro acto.
 */
const ResolucionMultaVigenciaSchema = z.union([
  z.object({
    desestimar: z.literal(true),
    motivo: z
      .string()
      .trim()
      .min(10, "El motivo de la desestimación debe explicar la decisión.")
      .max(500, "El motivo no puede superar los 500 caracteres."),
  }),
  z.object({
    desestimar: z.literal(false).optional(),
    acuerdoReferencia: z
      .string()
      .trim()
      .min(
        5,
        "El acuerdo del Comité debe indicar el acta o el número de acuerdo que aprobó la multa."
      )
      .max(300, "La referencia del acuerdo no puede superar los 300 caracteres."),
  }),
])

/** Intentos de folio antes de rendirse ante colisiones reales (mismo tope que actas GD). */
const MAX_INTENTOS_FOLIO = 3

/**
 * ¿El error es la colisión del índice único `(comunidadId, folio)`?
 *
 * La garantía contra dos sanciones con el mismo número es ese índice: cuando la
 * carrera ocurre, la segunda escritura llega acá como P2002 y el reintento le
 * asigna el folio siguiente en vez de dejar un 500 o un duplicado.
 */
function esConflictoDeFolio(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  )
}

/**
 * Folio `IN-####` correlativo de la comunidad, el mismo formato que usa el módulo
 * IN. Se calcula dentro de la transacción. El contador no es la garantía: el
 * índice único `(comunidadId, folio)` lo es, y por eso el alta de la infracción
 * reintenta cuando dos aplicaciones leen el mismo máximo.
 */
async function siguienteFolio(
  tx: Prisma.TransactionClient,
  comunidadId: string
): Promise<string> {
  const filas = await tx.infraccionIN.findMany({
    where: { comunidadId },
    select: { folio: true },
  })
  const mayor = filas.reduce((maximo, fila) => {
    const numero = Number.parseInt(fila.folio.replace(/^IN-/, ""), 10)
    return Number.isFinite(numero) && numero > maximo ? numero : maximo
  }, 0)
  return `IN-${String(mayor + 1).padStart(4, "0")}`
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "crear", "ad")) {
    return jsonError(403, "Permiso denegado.")
  }
  // S4: la decisión es del Comité. La administración también puede resolverla
  // (y queda registrada con su usuario), pero ningún otro rol.
  const rol = normalizaRol(scope.rol)
  if (rol !== "comite" && rol !== "administrador") {
    return jsonError(
      403,
      "Solo el Comité o la administración pueden aplicar o desestimar la propuesta de multa."
    )
  }

  const { id } = await ctx.params
  const cuerpo: unknown = await request.json().catch(() => null)
  const parseado = ResolucionMultaVigenciaSchema.safeParse(cuerpo)
  if (!parseado.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parseado.error.issues.map(
        (issue) => `${issue.path.join(".") || "body"}: ${issue.message}`
      ),
    })
  }

  const propuesta = await prisma.propuestaMultaVigencia.findUnique({
    where: { id },
    select: {
      id: true,
      comunidadId: true,
      unidadId: true,
      monto: true,
      referenciaLegal: true,
      tipoInfraccionId: true,
      estado: true,
      requerimientoEn: true,
      fecha: true,
    },
  })
  if (!propuesta || propuesta.comunidadId !== scope.comunidadId) {
    return jsonError(404, "Propuesta no encontrada.")
  }
  if (propuesta.estado !== "propuesta") {
    return jsonError(
      409,
      "La propuesta ya fue resuelta: no se puede volver a aplicar ni desestimar."
    )
  }

  const unidad = await prisma.unidad.findFirst({
    where: { id: propuesta.unidadId, comunidadId: scope.comunidadId },
    select: { numero: true },
  })
  const numero = unidad?.numero ?? propuesta.unidadId

  const ahora = new Date()
  const datos = parseado.data

  if (datos.desestimar === true) {
    try {
      const cerrada = await prisma.$transaction(async (tx) => {
        // Toma condicional: si otra resolución ganó la carrera, `count` vuelve 0
        // y no se escribe auditoría de un acto que no ocurrió.
        const tomada = await tx.propuestaMultaVigencia.updateMany({
          where: { id, comunidadId: scope.comunidadId, estado: "propuesta" },
          data: {
            estado: "desestimada",
            motivoDesestimacion: datos.motivo,
          },
        })
        if (tomada.count === 0) return false

        await registrarEventoAuditoria(
          {
            id: generarId("ev"),
            comunidadId: scope.comunidadId,
            timestamp: ahora.toISOString(),
            usuario: scope.usuarioId,
            categoria: "AD",
            tipoAccion: "AD_VIGENCIA_MULTA_DESESTIMADA",
            referenciaId: propuesta.unidadId,
            descripcion: `Propuesta de multa por vigencia DESESTIMADA para la unidad ${numero} (propuesta ${propuesta.id}): ${datos.motivo}. Resuelta por el rol «${rol}». No se crea ninguna infracción.`,
          },
          tx
        )
        return true
      })

      if (!cerrada) {
        return jsonError(
          409,
          "La propuesta ya fue resuelta: no se puede volver a aplicar ni desestimar."
        )
      }

      return Response.json({
        ok: true,
        propuestaId: propuesta.id,
        estado: "desestimada",
        infraccionId: null,
      })
    } catch {
      return jsonError(500, "No se pudo desestimar la propuesta de multa.")
    }
  }

  const acuerdoReferencia = datos.acuerdoReferencia

  // El folio de la sanción es único por comunidad (`IN-####`). Si dos aplicaciones
  // leen el mismo máximo, la segunda choca contra el índice único y la transacción
  // entera revierte —la propuesta vuelve a estar `propuesta`—, así que se reintenta
  // con el folio siguiente. Agotados los intentos el desenlace es un 409 de
  // conflicto: nunca un 500 ni una sanción con el folio repetido.
  for (let intento = 1; intento <= MAX_INTENTOS_FOLIO; intento++) {
    const infraccionId = generarId("in")

    try {
      const aplicada = await prisma.$transaction(async (tx) => {
        const tomada = await tx.propuestaMultaVigencia.updateMany({
          where: { id, comunidadId: scope.comunidadId, estado: "propuesta" },
          data: {
            estado: "aplicada",
            aplicadaPor: scope.usuarioId,
            aplicadaEn: ahora,
            acuerdoReferencia,
            infraccionId,
          },
        })
        if (tomada.count === 0) return null

        // S6: el vencimiento que se congeló al requerir es el hecho de la multa.
        // Se lee de la evidencia y no se recalcula; si no consta, cae en la fecha
        // de la propuesta (que también está congelada).
        const requerimiento = await tx.requerimientoVigencia.findFirst({
          where: {
            comunidadId: scope.comunidadId,
            unidadId: propuesta.unidadId,
            fecha: propuesta.requerimientoEn,
          },
          select: { venceEn: true },
          orderBy: { fecha: "desc" },
        })
        const suceso = requerimiento?.venceEn ?? propuesta.fecha
        const ancla = propuesta.referenciaLegal
          ? ` Ancla legal del monto: ${propuesta.referenciaLegal}.`
          : ""

        await tx.infraccionIN.create({
          data: {
            id: infraccionId,
            comunidadId: scope.comunidadId,
            folio: await siguienteFolio(tx, scope.comunidadId),
            tipoInfraccionId: propuesta.tipoInfraccionId,
            unidadId: propuesta.unidadId,
            fechaSuceso: suceso.toISOString().slice(0, 10),
            horaSuceso: "23:59",
            antecedentes: `Registro de Copropietarios no actualizado: la unidad ${numero} no respondió el requerimiento del ${propuesta.requerimientoEn.toISOString().slice(0, 10)} dentro de los 60 días corridos (venció el ${suceso.toISOString().slice(0, 10)}). Multa propuesta por el sistema con el monto congelado del maestro de la comunidad y aplicada por acuerdo del Comité: ${acuerdoReferencia}.${ancla}`,
            evidencias: [
              {
                nombre: `Propuesta de multa por vigencia ${propuesta.id}`,
                tipoMime: "text/plain",
                tamanoKB: 0,
                url: `/admin/gestion/vigencia-registro?propuesta=${propuesta.id}`,
              },
            ],
            estado: "aplicada",
            fechaRegistro: hoyISO(),
            // El monto congelado de la propuesta, no el vigente del maestro.
            montoAplicado: propuesta.monto,
            comentariosDirectiva: [],
            // `respaldosDirectiva` guarda ids de personas de la directiva: el
            // acuerdo del Comité ya vive en la propuesta y en la auditoría.
            respaldosDirectiva: [],
          },
        })

        await registrarEventoAuditoria(
          {
            id: generarId("ev"),
            comunidadId: scope.comunidadId,
            timestamp: ahora.toISOString(),
            usuario: scope.usuarioId,
            categoria: "AD",
            tipoAccion: "AD_VIGENCIA_MULTA_APLICADA",
            referenciaId: propuesta.unidadId,
            descripcion: `Multa por vigencia APLICADA para la unidad ${numero} (propuesta ${propuesta.id}): monto congelado $${propuesta.monto}; acuerdo del Comité: ${acuerdoReferencia}; aplicada por el rol «${rol}»; infracción ${infraccionId}.`,
          },
          tx
        )

        return { infraccionId }
      })

      if (!aplicada) {
        return jsonError(
          409,
          "La propuesta ya fue resuelta: no se puede volver a aplicar ni desestimar."
        )
      }

      return Response.json({
        ok: true,
        propuestaId: propuesta.id,
        estado: "aplicada",
        infraccionId: aplicada.infraccionId,
      })
    } catch (e) {
      // P2002 = otra aplicación tomó el folio entre la lectura y la escritura.
      // La transacción ya revirtió, así que el intento siguiente lee la base
      // real y asigna el folio que sigue; cualquier otro error es un 500.
      if (!esConflictoDeFolio(e)) {
        return jsonError(500, "No se pudo aplicar la propuesta de multa.")
      }
    }
  }

  return jsonError(
    409,
    "Conflicto: no se pudo asignar un folio único a la infracción, reintentá la aplicación de la multa."
  )
}
