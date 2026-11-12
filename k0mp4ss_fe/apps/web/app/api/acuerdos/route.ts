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
 * - GET (U3b): lee el registro con su resultado DERIVADO. Guard `gd` + `ver`.
 *   Acotado a la comunidad de la sesión: el `comunidadId` nunca viene del
 *   cliente, y un `?comunidadId=` en la URL se ignora. Devuelve los últimos
 *   `LIMITE_ACUERDOS` acuerdos con el total del libro, cada uno con sus votos
 *   (persona, decisión, peso, unidad, fecha) y el cómputo de
 *   `resultadoDelAcuerdo` más los derechos totales usados: el resultado no se
 *   guarda, se recomputa al leer. `estado`/`resueltoEn` son el hecho persistido
 *   (un acuerdo resuelto no se reescribe); el cómputo es la vista de hoy.
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
import { idsDirectivaVigenteDb, periodoVigenteDb } from "@/lib/api/gd-guard"
import { resultadoDelAcuerdo, type CuerpoDelAcuerdo } from "@/lib/acuerdos"
import { puedeGestionarAcuerdos } from "./_guard"
import { anioDeFecha, siguienteFolioAcuerdo } from "./_folio"

/**
 * Tope de la lectura del registro (U3b).
 *
 * **Capitado, no paginado**: la lectura devuelve los `LIMITE_ACUERDOS` acuerdos
 * más recientes —ordenados por fecha y, a igual fecha, por folio descendente—
 * junto con `total`, el conteo completo del libro de la comunidad. Un libro de
 * gobernanza crece de a decenas por año, así que el tope no esconde nada
 * habitual; si la comunidad alguna vez lo supera, `total` delata la diferencia y
 * la paginación será su propia unidad de trabajo (no se inventa acá un
 * `page`/`pageSize` que nadie consume).
 */
const LIMITE_ACUERDOS = 100

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

/** Cuerpo del acuerdo en los dos valores que la regla pura sabe computar. */
function cuerpoDelAcuerdo(valor: string): CuerpoDelAcuerdo {
  // La fila guarda el código; `AcuerdoSchema` impide escribir otro. Si llegara
  // un valor viejo, se computa como comité —el cuerpo sólo cambia el texto del
  // motivo en las reglas que no son `un_voto_por_miembro`— y el estado
  // persistido sigue siendo el hecho.
  return valor === "asamblea" ? "asamblea" : "comite"
}

/**
 * GET /api/acuerdos — lectura del registro con el resultado recomputado.
 *
 * Se lee en un número FIJO de consultas, no por acuerdo ni por voto: los
 * acuerdos con sus votos en una sola lectura, el conteo del libro en otra, y el
 * padrón —miembros vigentes del comité y suma de prorrateos de la asamblea— una
 * vez por comunidad, no una vez por acuerdo.
 *
 * `_req` se declara porque Next lo entrega, pero NO se lee: no hay parámetro que
 * cambie el alcance. La comunidad sale de `withComunidadScope()`, la única
 * fuente, así que un `?comunidadId=` del cliente no mueve nada.
 */
export async function GET(_req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  // El registro expone QUIÉN votó qué: son datos personales de los miembros del
  // comité y de los propietarios. Por eso la lectura exige la misma acción que
  // administrar el libro (editar), no ver: el rol residente tiene gd:ver y vería
  // la deliberación completa de la comunidad. Mismo criterio que el registro de
  // vigencia (S5), y más estricto que el acta, que sí tiene su propio ABAC
  // (residenteVeActas).
  if (!puedeGestionarAcuerdos(scope.rol, "editar")) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const [acuerdos, total, derechosAsamblea, periodoVigente] = await Promise.all([
      prisma.acuerdo.findMany({
        where: { comunidadId: scope.comunidadId },
        orderBy: [{ fecha: "desc" }, { folio: "desc" }],
        take: LIMITE_ACUERDOS,
        select: {
          id: true,
          folio: true,
          cuerpo: true,
          materia: true,
          estado: true,
          quorumRequerido: true,
          fecha: true,
          resueltoEn: true,
          actaId: true,
          votos: {
            orderBy: { fecha: "asc" },
            select: {
              personaId: true,
              decision: true,
              peso: true,
              unidadId: true,
              fecha: true,
            },
          },
        },
      }),
      prisma.acuerdo.count({ where: { comunidadId: scope.comunidadId } }),
      prisma.unidad.aggregate({
        where: { comunidadId: scope.comunidadId },
        _sum: { prorrateo: true },
      }),
      periodoVigenteDb(scope.comunidadId),
    ])

    // El padrón del comité son los miembros VIGENTES de la directiva (un voto por
    // miembro, art. 17); el de la asamblea, los derechos de toda la comunidad
    // (art. 15). Se mide una vez por comunidad, nunca por acuerdo.
    const derechosComite = (
      await idsDirectivaVigenteDb(scope.comunidadId, periodoVigente?.id)
    ).length
    const derechosAsambleaTotal = derechosAsamblea._sum.prorrateo ?? 0

    // Nombre de quien votó, en UNA consulta para todos los votos del listado: la
    // evidencia del voto es la persona, y una pantalla que muestre ids de fila
    // no sirve. El voto sigue siendo de la persona (`personaId`), no del nombre.
    const personaIds = [
      ...new Set(acuerdos.flatMap((acuerdo) => acuerdo.votos.map((v) => v.personaId))),
    ]
    const personas =
      personaIds.length === 0
        ? []
        : await prisma.persona.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: personaIds } },
            select: { id: true, nombreCompleto: true },
          })
    const nombrePorPersona = new Map(
      personas.map((persona) => [persona.id, persona.nombreCompleto])
    )

    const data = acuerdos.map((acuerdo) => {
      const cuerpo = cuerpoDelAcuerdo(acuerdo.cuerpo)
      const derechosTotales =
        cuerpo === "asamblea" ? derechosAsambleaTotal : derechosComite
      return {
        id: acuerdo.id,
        folio: acuerdo.folio,
        cuerpo: acuerdo.cuerpo,
        materia: acuerdo.materia,
        estado: acuerdo.estado,
        quorumRequerido: acuerdo.quorumRequerido,
        fecha: acuerdo.fecha.toISOString(),
        resueltoEn: acuerdo.resueltoEn?.toISOString() ?? null,
        actaId: acuerdo.actaId,
        derechosTotales,
        // Derivado, nunca guardado aparte: la regla pura es la misma que usa el
        // POST del voto al resolver el acuerdo.
        resultado: resultadoDelAcuerdo({
          cuerpo,
          quorumRequerido: acuerdo.quorumRequerido,
          votos: acuerdo.votos,
          derechosTotales,
        }),
        votos: acuerdo.votos.map((voto) => ({
          personaId: voto.personaId,
          nombre: nombrePorPersona.get(voto.personaId) ?? null,
          decision: voto.decision,
          peso: voto.peso,
          unidadId: voto.unidadId,
          fecha: voto.fecha.toISOString(),
        })),
      }
    })

    return Response.json({
      data,
      total,
      limite: LIMITE_ACUERDOS,
      mostrados: data.length,
    })
  } catch (e) {
    logger.error({ err: e }, "[api/acuerdos] error inesperado al leer el registro")
    return jsonError(500, "Error interno del servidor.")
  }
}
