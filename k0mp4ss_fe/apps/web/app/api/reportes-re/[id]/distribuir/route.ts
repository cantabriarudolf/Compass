/**
 * /api/reportes-re/[id]/distribuir — publica el informe en el visor interno y
 * encola el email opcional.
 *
 * POST custom (`re` editar): paridad server-side con `distribuirReporteRE` del
 * store legacy, con las decisiones del plan SERIE-FASE2 §V3:
 * - **Distribuir = publicar en el visor interno con permiso + email opcional.**
 *   Los destinatarios se resuelven AHORA (segmentación EF + perfil + tenencia),
 *   no al emitir: el informe congelado no cambia, la audiencia sí puede.
 * - El **email sale por la puerta única** (`planDeCanal` de
 *   `lib/entrega-aviso.ts`, que habla con `lib/smtp.ts`) a través del PUENTE de
 *   entrega (`lib/entrega/notificar.ts`): `enviado` solo cuando el servidor
 *   aceptó el mensaje, `fallido` con el motivo cuando rebotó y `pendiente` con
 *   `MOTIVO_SIN_SMTP` cuando no hay emisor configurado. Esta ruta NUNCA responde
 *   que se envió algo que el servidor no aceptó. Solo el visor queda en estado
 *   `publicado`.
 * - **El aviso y la publicación del informe son un solo acto** (S3b): las
 *   notificaciones del visor y la constancia del informe entran en la MISMA
 *   transacción —el visor no habla con el transporte—, así que un fallo al
 *   escribir la constancia no deja avisos confirmados. El correo, si se pidió,
 *   sale DESPUÉS por `entregarPorCorreo`, con el cliente plano, y deja su fila
 *   en `entregas_notificacion` colgada del aviso de cada destinatario (S3): el
 *   diálogo SMTP no retiene el lock de la base. La constancia propia del informe
 *   (`envios`) se completa con el desenlace real del correo y sigue siendo la
 *   fuente de su estado.
 * - El estado del envío se persiste en `envios` (una entrada por canal y
 *   destinatario, con fecha y estado) y se resume en `estadoDistribucion` con el
 *   estado más restrictivo: `pendiente` > `fallido` > `enviado` > `publicado`. *
 * Authz: SOLO administrador (`re` editar); el comité solo lee (`re` ver).
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { resolverSegmentacionRE } from "@/lib/reporteria-utils"
import { avisar, entregarPorCorreo } from "@/lib/entrega/notificar"
import type { EnvioReporteRE, ReporteRE } from "@/lib/schemas"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { cargarReporteRE, contextoAccionRE, registrarEventoRE } from "../../_acciones"
import { CANAL_NOTIFICACION_EMAIL_SIMULADO } from "@/lib/schemas"

type Ctx = { params: Promise<{ id: string }> }

/** Entrada: `email` permite distribuir solo al visor interno (nunca al revés). */
const EntradaDistribuirSchema = z.object({
  email: z.boolean().optional(),
})

/**
 * Rol de bandeja del destinatario: la notificación va dirigida a una persona
 * (`destinatarioPersonaId`), así que el rol es sólo la etiqueta de su bandeja y
 * se deriva de su ficha, nunca del rol de la sesión que distribuye.
 */
function rolBandejaDe(persona: { roles: unknown; datosGobernanza: unknown } | undefined): string {
  const roles = Array.isArray(persona?.roles) ? (persona.roles as string[]) : []
  if (roles.includes("personal")) return "personal"
  if (
    roles.includes("directiva") ||
    (persona?.datosGobernanza !== null && persona?.datosGobernanza !== undefined)
  ) {
    return "directiva"
  }
  return "residente"
}

/**
 * El estado que la constancia del informe registra para el correo.
 *
 * El puente entrega los tres estados del emisor (más `entregado`, que el correo
 * nunca produce). Se traducen SIN inventar: `entregado` —la aceptación del
 * servidor en el vocabulario del aviso— se registra `enviado`, que es como lo
 * llama el catálogo de RE, y los otros tres viajan tal cual.
 */
function estadoReporteDeLaEntrega(
  estado: "entregado" | "enviado" | "pendiente" | "fallido"
): EnvioReporteRE["estado"] {
  return estado === "entregado" ? "enviado" : estado
}

/** POST publica en el visor, encola el email y deja el estado del envío. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const contexto = await contextoAccionRE("re", "editar")
  if (!contexto.ok) return contexto.response
  const { scope } = contexto
  const { id } = await ctx.params

  const crudo = await req.json().catch(() => null)
  const parsed = EntradaDistribuirSchema.safeParse(crudo ?? {})
  if (!parsed.success) {
    return jsonError(400, "Datos de la distribución inválidos.")
  }
  const encolarEmail = parsed.data.email ?? true

  try {
    const reporte = await cargarReporteRE(id, scope)
    if (!reporte) return jsonError(404, "Registro no encontrado.")
    if (reporte.fechaDistribucion || reporte.distribuidoA > 0 || reporte.estadoDistribucion) {
      return jsonError(
        409,
        `El reporte ya fue distribuido el ${reporte.fechaDistribucion ?? "—"} a ${reporte.distribuidoA} destinatario(s).`
      )
    }

    const segmento = reporte.segmento as ReporteRE["segmento"]
    const [micros, unidades, vinculos, personas] = await Promise.all([
      prisma.microSector.findMany({
        where: { comunidadId: scope.comunidadId },
        select: { id: true, macroSectorId: true },
      }),
      prisma.unidad.findMany({
        where: { comunidadId: scope.comunidadId },
        select: { id: true, microSectorId: true },
      }),
      prisma.vinculoUnidad.findMany({
        where: { comunidadId: scope.comunidadId },
        select: { personaId: true, unidadId: true, rol: true, fechaFin: true },
      }),
      prisma.persona.findMany({
        where: { comunidadId: scope.comunidadId },
        select: { id: true, email: true, estadoCuenta: true, roles: true, datosGobernanza: true },
      }),
    ])

    // Alcance EF resuelto: unidades directas + microsectores + macros completos.
    const alcance = new Set<string>(segmento.unidadIds)
    for (const microId of segmento.microSectorIds) {
      for (const u of unidades.filter((u) => u.microSectorId === microId)) alcance.add(u.id)
    }
    for (const macroId of segmento.macroSectorIds) {
      const microsDelMacro = new Set(
        micros.filter((m) => m.macroSectorId === macroId).map((m) => m.id)
      )
      for (const u of unidades.filter((u) => microsDelMacro.has(u.microSectorId))) alcance.add(u.id)
    }

    // Resolución vigente al momento de distribuir (mismas funciones puras que la UI).
    const destinatarios = resolverSegmentacionRE({
      segmento: { perfiles: segmento.perfiles, tenencias: segmento.tenencias },
      unidadesAlcanceIds: [...alcance],
      vinculos: vinculos as never,
      personas: personas.map((p) => ({
        id: p.id,
        estadoCuenta: p.estadoCuenta,
        roles: p.roles as string[],
        datosGobernanza: p.datosGobernanza ?? undefined,
      })) as never,
    })
    if (destinatarios.length === 0) {
      return jsonError(
        400,
        "La segmentación no resolvió destinatarios vigentes; ajusta el alcance."
      )
    }

    const fecha = hoyISO()
    const porPersona = new Map(personas.map((p) => [p.id, p]))
    const resumenBloques = (reporte.bloques as string[]).join(", ")
    const primerBloque = (reporte.payloadSnapshot as ReporteRE["payloadSnapshot"])[0]
    // Un solo texto para la bandeja interna y para el correo: el informe dice lo
    // mismo por los dos canales.
    const asuntoEnvio = `Reporte distribuido: ${reporte.titulo}`
    const cuerpoEnvio = `${reporte.titulo} — bloques: ${resumenBloques}.${
      primerBloque?.lineas[0]
        ? ` ${primerBloque.lineas[0].etiqueta}: ${primerBloque.lineas[0].valor}.`
        : ""
    }`

    // El aviso de cada destinatario y la publicación del informe se escriben
    // JUNTOS: si la constancia del informe falla, el aviso se revierte (S3b). No
    // hay red en esta transacción —el visor se prueba con la notificación—, así
    // que el correo se intenta después, con el cliente PLANO.
    const avisoPorPersona = new Map<string, string>()
    await prisma.$transaction(async (tx) => {
      for (const personaId of destinatarios) {
        const aviso = await avisar(tx, {
          comunidadId: scope.comunidadId,
          destinatarioRol: rolBandejaDe(porPersona.get(personaId)),
          destinatarioPersonaId: personaId,
          asunto: asuntoEnvio,
          cuerpo: cuerpoEnvio,
          canal: CANAL_NOTIFICACION_EMAIL_SIMULADO,
          moduloOrigen: "RE",
          fecha,
        })
        avisoPorPersona.set(personaId, aviso.notificacionId)
      }

      // La distribución queda publicada en el visor con su constancia propia.
      // El desenlace del correo se agrega después, cuando existe.
      await tx.reporteRE.update({
        where: { id },
        data: {
          destinatariosPersonaId: destinatarios as never,
          distribuidoA: destinatarios.length,
          fechaDistribucion: fecha,
          envios: [{ canal: "visor", fecha, estado: "publicado" }] as never,
          estadoDistribucion: "publicado",
        },
      })

      if (!encolarEmail) {
        await registrarEventoRE(
          scope,
          "RE_REPORT_DISTRIBUTED",
          id,
          `Reporte "${reporte.titulo}"${reporte.numero ? ` N°${reporte.numero}` : ""} publicado en el visor interno para ${destinatarios.length} destinatario(s) (sin email).`,
          tx
        )
      }
    })

    // Correo por destinatario, FUERA de toda transacción y colgado de su aviso
    // (S3b): el diálogo SMTP no retiene el lock de la base. El estado es el que
    // declaró el servidor; los destinatarios sin correo quedan `fallido` (no hay
    // a dónde entregar) en vez de un `pendiente` falso.
    const enviosEmail: EnvioReporteRE[] = []
    const motivosEmail = new Set<string>()
    if (encolarEmail) {
      for (const personaId of destinatarios) {
        const entregaEmail = await entregarPorCorreo(prisma, {
          comunidadId: scope.comunidadId,
          asunto: asuntoEnvio,
          cuerpo: cuerpoEnvio,
          destinatarioPersonaId: personaId,
          notificacionId: avisoPorPersona.get(personaId) ?? null,
        })
        if (entregaEmail.motivo) motivosEmail.add(entregaEmail.motivo)
        enviosEmail.push({
          canal: "email",
          destinatarioPersonaId: personaId,
          fecha,
          estado: estadoReporteDeLaEntrega(entregaEmail.estado),
        })
      }
    }

    // Envíos: el visor interno queda publicado y el email con el estado real.
    const envios: EnvioReporteRE[] = [
      { canal: "visor", fecha, estado: "publicado" },
      ...enviosEmail,
    ]
    const estadosEmail = enviosEmail.map((envio) => envio.estado)
    const estadoEmail = estadosEmail.includes("pendiente")
      ? "pendiente"
      : estadosEmail.includes("fallido")
        ? "fallido"
        : estadosEmail.includes("enviado")
          ? "enviado"
          : "publicado"
    const estadoDistribucion = estadoEmail === "publicado" ? "publicado" : estadoEmail

    if (encolarEmail) {
      await prisma.$transaction(async (tx) => {
        // El informe cierra su distribución con el desenlace del correo y se
        // audita, en una transacción corta (sin red adentro).
        await tx.reporteRE.update({
          where: { id },
          data: {
            envios: envios as never,
            estadoDistribucion,
          },
        })

        await registrarEventoRE(
          scope,
          "RE_REPORT_DISTRIBUTED",
          id,
          `Reporte "${reporte.titulo}"${reporte.numero ? ` N°${reporte.numero}` : ""} publicado en el visor interno para ${destinatarios.length} destinatario(s); email → ${estadoEmail} (${enviosEmail.length} envío(s) registrado(s))${[...motivosEmail].length > 0 ? `: ${[...motivosEmail].join(" | ")}` : ""}.`,
          tx
        )
      })
    }

    return Response.json({
      ok: true,
      destinatarios: destinatarios.length,
      estadoDistribucion,
      email: encolarEmail ? estadoEmail : "no_solicitado",
      mensaje: `Reporte publicado en el visor interno para ${destinatarios.length} destinatario(s).`,
    })
  } catch (e) {
    logger.error({ err: e }, "[api/reportes-re/distribuir] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
