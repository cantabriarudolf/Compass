/**
 * /api/presupuestos — presupuesto por partidas de un período (F31).
 *
 * Ley 21.442: el art. 17 faculta al COMITÉ a aprobar presupuestos estimativos de
 * gastos comunes y el art. 15 reserva materias a la ASAMBLEA. Cuál de los dos
 * aprueba el presupuesto de partidas lo define el REGLAMENTO de cada comunidad,
 * así que el sistema no elige: LEE el acuerdo que lo aprueba y copia su cuerpo
 * (`comite` o `asamblea`) al presupuesto. Un cuerpo fuera de esos dos no se
 * asume y no habilita nada.
 *
 * Las reglas que la ley obliga se sostienen acá y en la regla pura
 * `lib/presupuesto.ts`, nunca en la voluntad de quien llama:
 *
 *   · el acuerdo se lee de la base (`Acuerdo`, U3): tiene que ser de esta
 *     comunidad y estar `aprobado` (400 con el motivo si no);
 *   · las partidas vacías o con monto negativo no constituyen presupuesto;
 *   · el total es la suma EXACTA de las partidas en centavos enteros y se
 *     persiste como snapshot de lo aprobado;
 *   · un presupuesto nuevo del mismo período REEMPLAZA al vigente con la versión
 *     siguiente, en la misma transacción: nunca conviven dos vigentes.
 *
 * - POST: guard `fi:gasto_comun` + crear (la administración registra el acuerdo;
 *   el comité lo lee por `ver`). Escribe el presupuesto, sus partidas y el evento
 *   `FI_PRESUPUESTO_CREADO` en UNA transacción: o existe el presupuesto con su
 *   total y su folio, o no existe nada.
 * - GET: guard `fi:gasto_comun` + ver. Acotado a la comunidad de la sesión —el
 *   `comunidadId` nunca viene del cliente— y leído en un número FIJO de consultas:
 *   las versiones con sus partidas en una, el conteo en otra y los folios de los
 *   acuerdos en una tercera para todo el listado.
 *
 * No hay PUT ni DELETE: un presupuesto aprobado es la evidencia de lo que un
 * cuerpo aprobó, no se reescribe. Cambiarlo es aprobar otro, que entra como
 * versión nueva y deja la anterior `reemplazado`.
 *
 * Tampoco hay `POST /reemplazar` separado: el reemplazo es la forma normal del
 * alta (versión + 1), y una ruta aparte duplicaría la transacción y abriría un
 * camino para crear la versión 1 sin pasar por el alta.
 */
import { PresupuestoCreacionSchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import {
  esCuerpoDelPresupuesto,
  presupuestoPermitido,
  validarPartidas,
} from "@/lib/presupuesto"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { vistaDePresupuesto, type PresupuestoEnLaVista } from "./_vista"

/**
 * Recurso de la matriz que gobierna el presupuesto: `fi:gasto_comun`.
 *
 * No es `fi` a secas. El candado de procesos del repositorio (R1) prohíbe que una
 * ruta NUEVA use la raíz desnuda cuando la matriz ya declara sus claves
 * granulares —y `fi` ni siquiera declara `crear`: sólo el wildcard de
 * administración lo alcanza—. La granular correcta es `fi:gasto_comun`: el
 * presupuesto es la configuración de lo que se va a cobrar como gasto común, la
 * misma clave con la que se declara la versión del reglamento del cobro. La
 * administración lo registra (`crear`) y el comité lo lee (`ver`), que es la
 * forma de la ley: el cuerpo que aprueba queda citado por el acuerdo, no por
 * quién escribe la fila.
 */
const RECURSO_PRESUPUESTOS = "fi:gasto_comun"

/**
 * Los textos de error van LITERALES en cada `jsonError`, no en constantes: así los
 * lee el guardián de mensajes de error (`test/api/permisos-por-objeto-mensajes.test.ts`),
 * que sólo puede auditar lo que está escrito en la ruta.
 */

/** Pesos en formato chileno para la bitácora. */
function pesos(monto: number): string {
  return `$${monto.toLocaleString("es-CL")}`
}

/** Nombre del cuerpo para la bitácora: la ley nombra comité o asamblea. */
function nombreDelCuerpo(cuerpo: string): string {
  return cuerpo === "comite" ? "el Comité" : "la Asamblea"
}

export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope: ComunidadScope = resultado.scope

  if (!puede(scope.rol, "crear", RECURSO_PRESUPUESTOS)) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = PresupuestoCreacionSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const datos = parsed.data

  // El acuerdo es la AUTORIZACIÓN y la fuente del cuerpo: se lee la fila real de
  // esta comunidad. Cada condición tiene su motivo, porque «no autorizado» no
  // dice qué falta.
  const acuerdo = await prisma.acuerdo.findFirst({
    where: { id: datos.acuerdoId, comunidadId: scope.comunidadId },
    select: { id: true, cuerpo: true, estado: true, folio: true },
  })
  if (!acuerdo) {
    return jsonError(
      400,
      "No se puede crear el presupuesto: el acuerdo no existe en esta comunidad."
    )
  }
  if (acuerdo.estado !== "aprobado") {
    return jsonError(
      400,
      "No se puede crear el presupuesto: el acuerdo no está aprobado."
    )
  }
  if (!esCuerpoDelPresupuesto(acuerdo.cuerpo)) {
    return jsonError(
      400,
      "No se puede crear el presupuesto: el acuerdo no tiene un cuerpo que pueda aprobarlo (comité o asamblea)."
    )
  }

  // Las reglas del dinero viven en la regla pura: al menos una partida y ningún
  // monto negativo o no finito. Zod ya las rechaza en el contrato del cuerpo; acá
  // se aplica la MISMA regla que cualquier otro consumidor de `lib/presupuesto.ts`.
  const partidas = validarPartidas(datos.partidas)
  if (!partidas.validas) {
    return jsonError(
      400,
      "No se puede crear el presupuesto: las partidas no constituyen un presupuesto válido."
    )
  }

  // El dictamen de la regla pura es la autoridad de la HABILITACIÓN. `yaHayVigente`
  // se lee para dejar dicha la regla: un vigente no bloquea, porque el reemplazo
  // versionado es el mecanismo (la versión se resuelve dentro de la transacción).
  const vigente = await prisma.presupuesto.findFirst({
    where: {
      comunidadId: scope.comunidadId,
      periodo: datos.periodo,
      estado: "vigente",
    },
    select: { version: true },
  })
  const dictamen = presupuestoPermitido({
    acuerdoEstado: acuerdo.estado,
    acuerdoCuerpo: acuerdo.cuerpo,
    yaHayVigente: vigente !== null,
  })
  if (!dictamen.permitido) {
    return jsonError(
      400,
      "No se puede crear el presupuesto: el acuerdo no habilita el presupuesto."
    )
  }

  const ahora = new Date()
  const presupuestoId = generarId("pre")
  const partidasAcrear = datos.partidas.map((partida, indice) => ({
    id: generarId("par", indice + 1),
    comunidadId: scope.comunidadId,
    presupuestoId,
    nombre: partida.nombre,
    categoria: partida.categoria,
    monto: partida.monto,
    orden: indice + 1,
  }))

  try {
    const vista = await prisma.$transaction<PresupuestoEnLaVista>(async (tx) => {
      // La versión y el reemplazo se resuelven DENTRO de la transacción que
      // escribe: leerlos afuera dejaría la ventana abierta entre la lectura y el
      // alta, y dos altas concurrentes podrían dejar dos vigentes. El índice único
      // `(comunidadId, periodo, version)` es la garantía dura contra la carrera.
      const vigenteAhora = await tx.presupuesto.findFirst({
        where: {
          comunidadId: scope.comunidadId,
          periodo: datos.periodo,
          estado: "vigente",
        },
        orderBy: { version: "desc" },
        select: { id: true, version: true },
      })
      const ultima = await tx.presupuesto.findFirst({
        where: { comunidadId: scope.comunidadId, periodo: datos.periodo },
        orderBy: { version: "desc" },
        select: { version: true },
      })
      const version = (ultima?.version ?? 0) + 1

      // La versión anterior no se borra: se marca `reemplazado` en la misma
      // transacción, así la historia de lo aprobado queda legible.
      if (vigenteAhora) {
        await tx.presupuesto.update({
          where: { id: vigenteAhora.id },
          data: { estado: "reemplazado" },
        })
      }

      const creado = await tx.presupuesto.create({
        data: {
          id: presupuestoId,
          comunidadId: scope.comunidadId,
          periodo: datos.periodo,
          // El cuerpo se COPIA del acuerdo: es la evidencia de quién aprobó.
          cuerpo: acuerdo.cuerpo,
          acuerdoId: acuerdo.id,
          version,
          estado: "vigente",
          // Snapshot de la suma exacta de las partidas (centavos enteros).
          total: partidas.total,
          creadoPor: scope.usuarioId,
        },
      })

      await tx.partidaPresupuesto.createMany({ data: partidasAcrear })

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: ahora.toISOString(),
          usuario: scope.usuarioId,
          categoria: "FI",
          tipoAccion: "FI_PRESUPUESTO_CREADO",
          referenciaId: creado.id,
          descripcion: `Presupuesto ${datos.periodo} versión ${version} aprobado por ${nombreDelCuerpo(acuerdo.cuerpo)} según el acuerdo ${acuerdo.folio}: ${datos.partidas.length} partida(s) por ${pesos(partidas.total)}${vigenteAhora ? `; reemplaza la versión ${vigenteAhora.version}` : ""} (Ley 21.442 arts. 15 y 17).`,
        },
        tx
      )

      return vistaDePresupuesto(creado, partidasAcrear, {
        acuerdoFolio: acuerdo.folio,
      })
    })

    return Response.json(vista, { status: 201 })
  } catch (e) {
    // P2002 = otra alta tomó la misma versión entre la lectura y la escritura: el
    // índice único hizo su trabajo y no se escribe nada a medias.
    if ((e as { code?: string }).code === "P2002") {
      return jsonError(
        409,
        "Ya se está registrando un presupuesto para ese período: reintentá la operación."
      )
    }
    logger.error({ err: e }, "[api/presupuestos] error inesperado al crear el presupuesto")
    return jsonError(500, "Error interno del servidor.")
  }
}

/**
 * GET /api/presupuestos — lectura de las versiones de la comunidad con sus
 * partidas.
 *
 * `_req` se declara porque Next lo entrega, pero NO se lee: no hay parámetro que
 * cambie el alcance. La comunidad sale de `withComunidadScope()`, la única
 * fuente, así que un `?comunidadId=` del cliente no mueve nada.
 */
export async function GET(_req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", RECURSO_PRESUPUESTOS)) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const [presupuestos, total] = await Promise.all([
      prisma.presupuesto.findMany({
        where: { comunidadId: scope.comunidadId },
        orderBy: [{ periodo: "desc" }, { version: "desc" }],
        include: { partidas: { orderBy: { orden: "asc" } } },
      }),
      prisma.presupuesto.count({ where: { comunidadId: scope.comunidadId } }),
    ])

    // Folios en UNA consulta para todo el listado (no una por presupuesto): el
    // presupuesto guarda el id del acuerdo y la pantalla necesita el folio.
    const acuerdoIds = [...new Set(presupuestos.map((fila) => fila.acuerdoId))]
    const acuerdos =
      acuerdoIds.length === 0
        ? []
        : await prisma.acuerdo.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: acuerdoIds } },
            select: { id: true, folio: true },
          })

    const folioPorAcuerdo = new Map(
      acuerdos.map((acuerdo) => [acuerdo.id, acuerdo.folio])
    )

    const data = presupuestos.map((fila) =>
      vistaDePresupuesto(fila, fila.partidas, {
        acuerdoFolio: folioPorAcuerdo.get(fila.acuerdoId) ?? null,
      })
    )

    return Response.json({ data, total, mostrados: data.length })
  } catch (e) {
    logger.error({ err: e }, "[api/presupuestos] error inesperado al leer los presupuestos")
    return jsonError(500, "Error interno del servidor.")
  }
}
