/**
 * POST /api/vigencia-registro/mi-declaracion — el arrendatario declara sólo si
 * el propietario lo habilita, y toda declaración guarda quién la hizo (S5).
 *
 * El obligado del art. 9 es el propietario; el dato lo tiene quien habita la
 * unidad. Esta ruta deja que la cuenta acotada del residente declare el Registro
 * de SU unidad, y nada más:
 *
 * - El `personaId` sale de la BD de la sesión (`personaIdDelUsuarioDb`) y el
 *   `comunidadId` de la membresía (`withComunidadScope`). Del cuerpo sólo se
 *   aceptan `unidadId` y `detalle`; el origen NO se acepta del cliente.
 * - Sin vínculo vigente con esa unidad en ESTA comunidad, la respuesta es 404
 *   «Unidad no encontrada.»: no se revela que la unidad exista para otro.
 * - Propietario vigente (`fechaFin: null`) declara siempre: es su obligación.
 * - Arrendatario vigente declara sólo con `puedeDeclararRegistro`, el permiso
 *   que el dueño enciende por vínculo (default `false`). Sin él, 403 con el
 *   motivo dicho: falta la habilitación del propietario.
 * - Cualquier otro rol (copropietario, ocupante), 403: no es el obligado ni el
 *   habilitado.
 *
 * La escritura es la misma transacción del acto administrativo —subir
 * `ultimaActualizacion`, limpiar `requerimientoEn`, dejar la evidencia
 * append-only y auditar— porque cumplir es cumplir, lo haga quien lo haga. Las
 * filas de `RequerimientoVigencia` no se tocan (S6). Lo único que cambia es la
 * procedencia: `origen` y el `tipoAccion` del evento dicen que la declaración
 * fue del propio interesado, no de la administración.
 */
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { RevalidacionVigenciaSchema } from "@/lib/schemas"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"
import { estadoDelCaso } from "@/lib/vigencia-registro"
import { propietarioVigenteDeUnidad } from "@/lib/entrega-aviso"

/** Quién declaró. Se deriva del vínculo de la sesión, nunca del cuerpo. */
type OrigenDeclaracion = "propietario" | "arrendatario"

export async function POST(request: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  const cuerpo: unknown = await request.json().catch(() => null)
  const parseado = RevalidacionVigenciaSchema.safeParse(cuerpo)
  if (!parseado.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parseado.error.issues.map(
        (issue) => `${issue.path.join(".") || "body"}: ${issue.message}`
      ),
    })
  }

  const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
  // Sin identidad no hay vínculo posible: el mismo 404 de una unidad ajena.
  if (!personaId) return jsonError(404, "Unidad no encontrada.")

  const unidad = await prisma.unidad.findFirst({
    where: { id: parseado.data.unidadId, comunidadId: scope.comunidadId },
    select: { id: true, numero: true },
  })
  if (!unidad) return jsonError(404, "Unidad no encontrada.")

  // «Vigente» es `fechaFin: null`, el criterio de toda la serie. La consulta
  // incluye el permiso para no decidir el acceso con un dato del cliente, y el
  // propietario vigente se resuelve con el criterio YA definido para la serie
  // (el mismo de la entrega de avisos): una sola definición de dueño vigente.
  const [propietarioVigente, vinculosPropios] = await Promise.all([
    propietarioVigenteDeUnidad(scope.comunidadId, unidad.id),
    prisma.vinculoUnidad.findMany({
      where: {
        comunidadId: scope.comunidadId,
        personaId,
        unidadId: unidad.id,
        fechaFin: null,
      },
      orderBy: { fechaInicio: "desc" },
      select: { rol: true, puedeDeclararRegistro: true },
    }),
  ])
  if (vinculosPropios.length === 0) return jsonError(404, "Unidad no encontrada.")

  // Precedencia: el propietario es el obligado, así que si además arrienda la
  // unidad declara como propietario y no como arrendatario habilitado.
  const arrendatario = vinculosPropios.find((v) => v.rol === "arrendatario")
  let origen: OrigenDeclaracion
  if (propietarioVigente === personaId) {
    origen = "propietario"
  } else if (arrendatario?.puedeDeclararRegistro) {
    origen = "arrendatario"
  } else if (arrendatario) {
    return jsonError(
      403,
      "El propietario de la unidad todavía no habilitó al arrendatario para declarar el Registro de Copropietarios."
    )
  } else {
    return jsonError(
      403,
      "Sólo el propietario vigente o un arrendatario habilitado por él pueden declarar el Registro de esta unidad."
    )
  }

  const ahora = new Date()

  try {
    await prisma.$transaction(async (tx) => {
      // Se lee el caso ANTES de escribir, igual que el acto administrativo: el
      // evento dice si esta declaración cerró un ciclo abierto.
      const previo = await tx.vigenciaRegistroUnidad.findUnique({
        where: {
          comunidadId_unidadId: {
            comunidadId: scope.comunidadId,
            unidadId: unidad.id,
          },
        },
        select: { requerimientoEn: true },
      })

      await tx.vigenciaRegistroUnidad.upsert({
        where: {
          comunidadId_unidadId: {
            comunidadId: scope.comunidadId,
            unidadId: unidad.id,
          },
        },
        create: {
          comunidadId: scope.comunidadId,
          unidadId: unidad.id,
          ultimaActualizacion: ahora,
          requerimientoEn: null,
        },
        update: { ultimaActualizacion: ahora, requerimientoEn: null },
      })

      // La evidencia dice qué se confirmó, cuándo, quién lo hizo y con qué
      // procedencia. Es append-only: la declaración anterior no se reescribe.
      await tx.revalidacionVigencia.create({
        data: {
          comunidadId: scope.comunidadId,
          unidadId: unidad.id,
          fecha: ahora,
          revalidadoPor: scope.usuarioId,
          detalle: parseado.data.detalle,
          origen,
        },
      })

      const cierre = previo?.requerimientoEn
        ? ` Cierra el ciclo abierto el ${previo.requerimientoEn.toISOString().slice(0, 10)}.`
        : ""

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "AD",
          tipoAccion: "AD_VIGENCIA_DECLARACION_PROPIA",
          referenciaId: unidad.id,
          descripcion: `Declaración del Registro de Copropietarios de la unidad ${unidad.numero}, hecha por el ${origen}: se confirmó el estado del registro.${cierre}`,
        },
        tx
      )
    })
  } catch {
    return jsonError(500, "No se pudo registrar la declaración.")
  }

  const veredicto = estadoDelCaso(
    { ultimaActualizacion: ahora, requerimientoEn: null },
    ahora
  )

  return Response.json({
    ok: true,
    unidadId: unidad.id,
    estado: veredicto.estado,
  })
}
