/**
 * /api/reportes-re/[id]/distribuir — publica el informe en el visor interno y
 * encola el email opcional.
 *
 * POST custom (`re` editar): paridad server-side con `distribuirReporteRE` del
 * store legacy, con las decisiones del plan SERIE-FASE2 §V3:
 * - **Distribuir = publicar en el visor interno con permiso + email opcional.**
 *   Los destinatarios se resuelven AHORA (segmentación EF + perfil + tenencia),
 *   no al emitir: el informe congelado no cambia, la audiencia sí puede.
 * - El **email sale por el emisor SMTP real** (`lib/smtp.ts`, F4): `enviado`
 *   solo cuando el servidor aceptó el mensaje, `fallido` con el motivo cuando
 *   rebotó y `pendiente` cuando no hay emisor configurado (falta la CF o
 *   `SMTP_PASSWORD`). Esta ruta NUNCA responde que se envió algo que el servidor
 *   no aceptó. Solo el visor queda en estado `publicado`.
 * - El estado del envío se persiste en `envios` (una entrada por canal y
 *   destinatario, con fecha y estado) y se resume en `estadoDistribucion` con el
 *   estado más restrictivo: `pendiente` > `fallido` > `enviado` > `publicado`.
 *
 * Authz: SOLO administrador (`re` editar); el comité solo lee (`re` ver).
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { hoyISO } from "@/lib/date-utils"
import { generarId } from "@/lib/id-utils"
import { resolverSegmentacionRE } from "@/lib/reporteria-utils"
import { enviarCorreoComunidad, estadoRegistroSMTP, motivoSMTP } from "@/lib/smtp"
import type { EnvioReporteRE, ReporteRE } from "@/lib/schemas"
import { jsonError } from "@/lib/api/with-comunidad-scope"
import { cargarReporteRE, contextoAccionRE, registrarEventoRE } from "../../_acciones"

type Ctx = { params: Promise<{ id: string }> }

/** Entrada: `email` permite distribuir solo al visor interno (nunca al revés). */
const EntradaDistribuirSchema = z.object({
  email: z.boolean().optional(),
})

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

    // Envíos por email: UN mensaje por destinatario con correo registrado, fuera
    // de la transacción (la red no se mezcla con la escritura en la base). El
    // estado es el que declaró el servidor SMTP; los destinatarios sin correo
    // quedan `fallido` (no hay a dónde entregar) en vez de un `pendiente` falso.
    const enviosEmail: EnvioReporteRE[] = []
    const motivosEmail = new Set<string>()
    if (encolarEmail) {
      for (const personaId of destinatarios) {
        const destino = porPersona.get(personaId)?.email?.trim() ?? ""
        const envio = destino
          ? await enviarCorreoComunidad(scope.comunidadId, {
              to: destino,
              subject: asuntoEnvio,
              text: cuerpoEnvio,
            })
          : ({
              estado: "fallido" as const,
              motivo:
                "Falló el envío por SMTP: el destinatario no tiene correo electrónico registrado.",
            })
        motivosEmail.add(motivoSMTP(envio))
        enviosEmail.push({
          canal: "email",
          destinatarioPersonaId: personaId,
          fecha,
          estado: estadoRegistroSMTP(envio),
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

    await prisma.$transaction(async (tx) => {
      // El informe se publica en la bandeja interna de cada destinatario
      // resuelto (mismo texto que el legacy: el contenido congelado).
      for (const personaId of destinatarios) {
        const persona = porPersona.get(personaId)
        const rolBandeja = (persona?.roles as string[] | undefined)?.includes("personal")
          ? "personal"
          : (persona?.roles as string[] | undefined)?.includes("directiva") ||
              persona?.datosGobernanza !== null && persona?.datosGobernanza !== undefined
            ? "directiva"
            : "residente"
        await tx.notificacion.create({
          data: {
            id: generarId("not"),
            comunidadId: scope.comunidadId,
            destinatarioRol: rolBandeja,
            destinatarioPersonaId: personaId,
            asunto: asuntoEnvio,
            cuerpo: cuerpoEnvio,
            canal: "email_simulado",
            moduloOrigen: "RE",
            fecha,
            leida: false,
          },
        })
      }

      await tx.reporteRE.update({
        where: { id },
        data: {
          destinatariosPersonaId: destinatarios as never,
          distribuidoA: destinatarios.length,
          fechaDistribucion: fecha,
          envios: envios as never,
          estadoDistribucion,
        },
      })

      await registrarEventoRE(
        scope,
        "RE_REPORT_DISTRIBUTED",
        id,
        `Reporte "${reporte.titulo}"${reporte.numero ? ` N°${reporte.numero}` : ""} publicado en el visor interno para ${destinatarios.length} destinatario(s)${
          encolarEmail
            ? `; email → ${estadoEmail} (${enviosEmail.length} envío(s) registrado(s))${[...motivosEmail].length > 0 ? `: ${[...motivosEmail].join(" | ")}` : ""}.`
            : " (sin email)."
        }`,
        tx
      )
    })

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
