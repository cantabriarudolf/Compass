/**
 * /api/reportes-re/generar — EMITE el informe y congela su snapshot.
 *
 * POST custom (`re` crear): paridad server-side con `generarReporteRE` del store
 * legacy, con la decisión del plan SERIE-FASE2 §V3: **emitir congela**. El
 * informe se calcula UNA vez, acá, DESDE LA BD, y se persiste con:
 * - `payloadSnapshot`: el contenido emitido (inmutable al abrirlo después),
 * - `fechaGeneracion`: la fecha de emisión,
 * - `numero`: correlativo por comunidad,
 * - `autorUsuarioId` / `autorNombre`: quién emitió.
 *
 * Idempotencia: el id se deriva del contenido (comunidad + periodo + título +
 * bloques + segmento). Emitir dos veces el MISMO informe devuelve el snapshot ya
 * congelado (200, `idempotente: true`) en vez de duplicarlo; jamás lo recalcula.
 *
 * Authz: SOLO administrador (`re` crear; el comité tiene `re` ver y el residente
 * no tiene `re`), porque emitir un informe es un acto de administración.
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import {
  BloqueReporteRESchema,
  IdEntidadSchema,
  ReporteRESchema,
  validarConEsquema,
  type BloqueReporteRE,
  type ReporteRE,
} from "@/lib/schemas"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import {
  calcularPayloadSnapshot,
  cargarReporteRE,
  contextoAccionRE,
  idIdempotenteRE,
  numeroSiguienteRE,
  periodoActual,
  registrarEventoRE,
} from "../_acciones"

/** Entrada de emisión: lo que el generador de la página envía. */
const EntradaGenerarSchema = z.object({
  titulo: z
    .string({ required_error: "El título del reporte es obligatorio." })
    .trim()
    .min(3, "El título debe tener al menos 3 caracteres."),
  bloques: z
    .array(BloqueReporteRESchema)
    .min(1, "Selecciona al menos un bloque de información."),
  segmento: z
    .object({
      macroSectorIds: z.array(IdEntidadSchema).optional(),
      microSectorIds: z.array(IdEntidadSchema).optional(),
      unidadIds: z.array(IdEntidadSchema).optional(),
      perfiles: z
        .array(z.enum(["administracion", "personal", "propietario", "residente"]))
        .optional(),
      tenencias: z.array(z.enum(["propietarios", "arrendatarios"])).optional(),
    })
    .optional(),
  periodo: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "El periodo debe tener formato AAAA-MM.")
    .optional(),
  /** Clave de idempotencia explícita (opcional; por defecto se deriva del contenido). */
  id: IdEntidadSchema.optional(),
})

/** POST calcula el informe desde la BD y persiste su snapshot inmutable. */
export async function POST(req: Request): Promise<Response> {
  const contexto = await contextoAccionRE("re", "crear")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto

  const crudo = await req.json().catch(() => null)
  const parsed = EntradaGenerarSchema.safeParse(crudo)
  if (!parsed.success) {
    return jsonError(
      400,
      parsed.error.issues[0]?.message ?? "Datos del reporte inválidos."
    )
  }
  const datos = parsed.data
  const bloques = [...new Set(datos.bloques)] as BloqueReporteRE[]
  const periodo = datos.periodo ?? periodoActual()
  const segmento: ReporteRE["segmento"] = {
    macroSectorIds: datos.segmento?.macroSectorIds ?? [],
    microSectorIds: datos.segmento?.microSectorIds ?? [],
    unidadIds: datos.segmento?.unidadIds ?? [],
    perfiles: datos.segmento?.perfiles ?? [],
    tenencias: datos.segmento?.tenencias ?? [],
  }

  try {
    // Validación FK del segmento contra la Estructura Física de la comunidad.
    const [macros, micros, unidades] = await Promise.all([
      segmento.macroSectorIds.length > 0
        ? prisma.macroSector.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: segmento.macroSectorIds } },
            select: { id: true },
          })
        : Promise.resolve([]),
      segmento.microSectorIds.length > 0
        ? prisma.microSector.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: segmento.microSectorIds } },
            select: { id: true },
          })
        : Promise.resolve([]),
      segmento.unidadIds.length > 0
        ? prisma.unidad.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: segmento.unidadIds } },
            select: { id: true },
          })
        : Promise.resolve([]),
    ])
    const existentes = new Set([...macros, ...micros, ...unidades].map((x) => x.id))
    for (const [ids, mensaje] of [
      [segmento.macroSectorIds, "macroSectorId"],
      [segmento.microSectorIds, "microSectorId"],
      [segmento.unidadIds, "unidadId"],
    ] as const) {
      const faltante = ids.find((id) => !existentes.has(id))
      if (faltante) {
        return jsonError(
          400,
          `${mensaje} ${faltante} no existe en la Estructura Física de la comunidad.`
        )
      }
    }

    // Clave de idempotencia: mismo informe → mismo id → mismo snapshot congelado.
    const id =
      datos.id ??
      idIdempotenteRE({
        comunidadId: scope.comunidadId,
        periodo,
        titulo: datos.titulo,
        bloques,
        segmento,
      })

    const yaEmitido = await cargarReporteRE(id, scope)
    if (yaEmitido) {
      return Response.json({
        ok: true,
        id,
        numero: yaEmitido.numero,
        fechaGeneracion: yaEmitido.fechaGeneracion,
        idempotente: true,
      })
    }

    const payloadSnapshot = await calcularPayloadSnapshot(
      scope.comunidadId,
      bloques,
      periodo
    )
    const autor = await prisma.usuario.findUnique({
      where: { id: scope.usuarioId },
      select: { email: true },
    })

    const resultado = await prisma.$transaction(async (tx) => {
      const numero = await numeroSiguienteRE(tx, scope.comunidadId)
      const fechaGeneracion = hoyISO()
      const registro = {
        id,
        comunidadId: scope.comunidadId,
        titulo: datos.titulo,
        bloques: bloques as never,
        segmento: segmento as never,
        payloadSnapshot: payloadSnapshot as never,
        fechaGeneracion,
        destinatariosPersonaId: [] as never,
        distribuidoA: 0,
        numero,
        periodo,
        autorUsuarioId: scope.usuarioId,
        ...(autor?.email ? { autorNombre: autor.email } : {}),
        envios: [] as never,
        lecturas: [] as never,
      }
      const validacion = validarConEsquema(ReporteRESchema, {
        ...registro,
        envios: [],
        lecturas: [],
      })
      if (!validacion.ok) return { tipo: "invalido" as const, error: validacion.error }

      await tx.reporteRE.create({ data: registro as never })
      await registrarEventoRE(
        scope,
        "RE_REPORT_GENERATED",
        id,
        `Reporte "${datos.titulo}" emitido como N°${numero} con ${bloques.length} bloque(s); snapshot inmutable congelado desde la BD (periodo ${periodo}).`,
        tx
      )
      return { tipo: "ok" as const, numero, fechaGeneracion }
    })

    if (resultado.tipo === "invalido") {
      return jsonError(400, resultado.error)
    }
    return Response.json(
      {
        ok: true,
        id,
        numero: resultado.numero,
        fechaGeneracion: resultado.fechaGeneracion,
        idempotente: false,
      },
      { status: 201 }
    )
  } catch (e) {
    logger.error({ err: e }, "[api/reportes-re/generar] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
