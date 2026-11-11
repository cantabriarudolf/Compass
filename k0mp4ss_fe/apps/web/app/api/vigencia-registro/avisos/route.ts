/**
 * POST /api/vigencia-registro/avisos — el barrido de avisos de S8.
 *
 * S8 exige que el administrador **y** el Comité se enteren siempre del estado
 * del Registro, que el propietario reciba el aviso que le toca, y que una unidad
 * sin propietario registrado se notifique como incidente de datos en vez de
 * quedarse en silencio. Lo que este repositorio no tiene es un reloj que corra
 * solo: **emitir es un acto explícito y repetible de la administración**, no un
 * job programado. La programación automática está fuera del contrato de esta
 * capacidad; si algún día se decide, será una decisión aparte y no un cron
 * escondido en esta ruta.
 *
 * Por eso la idempotencia no es un adorno: volver a correr el barrido tiene que
 * ser seguro. Cada aviso se identifica por `(comunidad, unidad, tipo,
 * destinatario, hito)` en `avisos_vigencia`; la notificación y su constancia se
 * escriben en la MISMA transacción y el choque contra el índice único revierte
 * las dos y se cuenta como `omitido`, nunca como error. Dos administradores
 * apretando el botón a la vez no duplican avisos.
 *
 * El destinatario «propietario» es el VIGENTE de la unidad (`rol: "propietario"`
 * con `fechaFin: null`, el más reciente), el mismo criterio que
 * `propietarioVigenteDeUnidad()` de `lib/entrega-aviso.ts` usa para entregar
 * avisos de cobro. Acá se resuelve en una sola consulta para no hacer N+1 sobre
 * todas las unidades de la comunidad.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { estadoDelCaso } from "@/lib/vigencia-registro"
import {
  avisosDelCaso,
  type AvisoVigenciaDecidido,
} from "@/lib/vigencia-avisos"

/** P2002 = choque contra el índice único de idempotencia del barrido. */
function esDuplicado(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  )
}

interface EmisionAviso {
  comunidadId: string
  unidadId: string
  personaId: string | null
  aviso: AvisoVigenciaDecidido
  fecha: string
}

/**
 * Escribe UNA notificación con su constancia, o no escribe nada.
 *
 * La transacción es la que impide el medio aviso: si la constancia choca contra
 * el índice único, la notificación de esa misma transacción se revierte y el
 * aviso queda como `omitido` —el mismo aviso ya estaba emitido—.
 */
async function emitirAviso({
  comunidadId,
  unidadId,
  personaId,
  aviso,
  fecha,
}: EmisionAviso): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      const notificacionId = generarId("not")
      await tx.notificacion.create({
        data: {
          id: notificacionId,
          comunidadId,
          destinatarioRol: aviso.destinatario,
          // Sólo el propietario es una persona concreta; el administrador y el
          // Comité son roles y su bandeja se acota por `unidadId` (F5).
          destinatarioPersonaId:
            aviso.destinatario === "propietario" ? personaId : null,
          unidadId,
          asunto: aviso.asunto,
          cuerpo: aviso.cuerpo,
          canal: "email_simulado",
          moduloOrigen: "AD_VIGENCIA",
          fecha,
          leida: false,
        },
      })
      await tx.avisoVigencia.create({
        data: {
          comunidadId,
          unidadId,
          tipo: aviso.tipo,
          destinatario: aviso.destinatario,
          hito: aviso.hito,
          notificacionId,
        },
      })
    })
    return true
  } catch (error) {
    if (esDuplicado(error)) return false
    throw error
  }
}

/**
 * El barrido no recibe payload: la comunidad sale del scope del servidor y los
 * hechos salen de la base. Acepta el `Request` sólo por la firma de route
 * handler, y no lo lee a propósito.
 */
export async function POST(_request: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "editar", "ad")) {
    return jsonError(403, "Permiso denegado.")
  }

  const ahora = new Date()
  const fecha = ahora.toISOString()

  try {
    const [unidades, casos, vinculos] = await Promise.all([
      prisma.unidad.findMany({
        where: { comunidadId: scope.comunidadId },
        select: { id: true, numero: true },
        orderBy: { numero: "asc" },
      }),
      prisma.vigenciaRegistroUnidad.findMany({
        where: { comunidadId: scope.comunidadId },
        select: {
          unidadId: true,
          ultimaActualizacion: true,
          requerimientoEn: true,
        },
      }),
      // Mismo criterio que `propietarioVigenteDeUnidad()`: rol propietario,
      // vínculo abierto (`fechaFin: null`) y el más reciente primero. Una sola
      // consulta para todas las unidades: el primer vínculo de cada unidad es su
      // propietario vigente, igual que el `findFirst` por unidad.
      prisma.vinculoUnidad.findMany({
        where: {
          comunidadId: scope.comunidadId,
          rol: "propietario",
          fechaFin: null,
        },
        orderBy: { fechaInicio: "desc" },
        select: { unidadId: true, personaId: true },
      }),
    ])

    const casoPorUnidad = new Map(casos.map((caso) => [caso.unidadId, caso]))
    const propietarioPorUnidad = new Map<string, string>()
    for (const vinculo of vinculos) {
      if (!propietarioPorUnidad.has(vinculo.unidadId)) {
        propietarioPorUnidad.set(vinculo.unidadId, vinculo.personaId)
      }
    }

    let emitidos = 0
    let omitidos = 0

    for (const unidad of unidades) {
      const caso = casoPorUnidad.get(unidad.id)
      const personaId = propietarioPorUnidad.get(unidad.id) ?? null
      const veredicto = estadoDelCaso(
        {
          ultimaActualizacion: caso?.ultimaActualizacion ?? null,
          requerimientoEn: caso?.requerimientoEn ?? null,
        },
        ahora
      )

      const avisos = avisosDelCaso({
        veredicto,
        numeroUnidad: unidad.numero,
        hayPropietarioVigente: personaId !== null,
        hayRequerimientoAbierto: caso?.requerimientoEn != null,
      })

      for (const aviso of avisos) {
        const emitido = await emitirAviso({
          comunidadId: scope.comunidadId,
          unidadId: unidad.id,
          personaId,
          aviso,
          fecha,
        })
        if (emitido) emitidos += 1
        else omitidos += 1
      }
    }

    // Un evento por corrida, no uno por aviso: las notificaciones mismas son la
    // evidencia; este evento deja constancia de que el barrido se corrió y de
    // cuánto emitió y cuánto omitió por idempotencia.
    await registrarEventoAuditoria({
      id: generarId("ev"),
      comunidadId: scope.comunidadId,
      timestamp: fecha,
      usuario: scope.usuarioId,
      categoria: "AD",
      tipoAccion: "AD_VIGENCIA_AVISOS",
      referenciaId: scope.comunidadId,
      descripcion: `Avisos de vigencia del Registro de Copropietarios: ${emitidos} emitido(s) y ${omitidos} omitido(s) por idempotencia.`,
    })

    return Response.json({ ok: true, emitidos, omitidos })
  } catch {
    return jsonError(500, "No se pudieron emitir los avisos de vigencia.")
  }
}
