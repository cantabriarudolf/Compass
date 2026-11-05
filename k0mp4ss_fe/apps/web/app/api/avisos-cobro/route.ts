/**
 * /api/avisos-cobro — el aviso de cobro mensual (serie aviso-de-cobro, T4).
 *
 * GET paginado vía factory (scoped por comunidad, `ver` de FI: administración y
 * comité). POST emite los avisos de un período: para todas las unidades que
 * tienen cobro, o para una sola. Sin PUT y sin DELETE de colección.
 *
 * Por qué el POST no es el upsert de la factory: un aviso NO se reescribe. Cada
 * fila nace con su contenido congelado, su folio `AC-####` correlativo por
 * comunidad y su código de verificación, todo asignado en el servidor dentro de
 * una transacción (mismo patrón que los certificados CT). La garantía dura es el
 * índice único `(comunidadId, folio)`: si dos emisiones leen el mismo máximo, la
 * segunda choca y se reintenta con el número siguiente.
 *
 * Compuertas, en este orden, porque ninguna cuesta una escritura:
 *   1. el período DEBE tener emisión de gasto común (409);
 *   2. la unidad pedida debe existir en la comunidad (404) y tener cobro en el
 *      período (400); al emitir para todas, las unidades sin cobro se OMITEN
 *      (no hay nada que cobrarles y un aviso en $0 sería un documento falso);
 *   3. ninguna de las unidades objetivo puede tener ya un aviso de ese período
 *      (409): el aviso emitido no se reemplaza;
 *   4. los totales de comunidad del período deben ser computables (400): sin
 *      fondos de caja no hay saldo al cierre que declarar (art. 31).
 *
 * El vencimiento del aviso NO se copia del cargo (S6): se deriva de la fecha de
 * emisión y de los `diasPagoGc` de la versión que rige el período
 * (`vencimientoAviso`). Como el aviso es el documento que cuenta, la emisión
 * alinea el `fechaVencimiento` del cargo a la fecha del papel dentro de la misma
 * transacción: la mora corre desde esa fecha y no puede correr desde una que el
 * residente nunca vio. Un aviso sin versión vigente no tiene plazo declarado:
 * queda con `vencimiento` en `null` y el cargo no se toca.
 *
 * Lo que la ley exige y no se puede computar (reglamento vigente, prorrateo de
 * la unidad) NO bloquea la emisión: queda declarado en `contenido.noComputables`
 * con su motivo, y el documento lo imprime en vez de un cero. Ver
 * `lib/aviso-cobro.ts`.
 */
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { puede } from "@/lib/authz"
import { generarId } from "@/lib/id-utils"
import { hoyISO } from "@/lib/date-utils"
import {
  AvisoCobroSchema,
  IdEntidadSchema,
  PeriodoFacturacionSchema,
  type ConceptoCobroFI,
  type LineaCobroFI,
  type MoraCobroFI,
  type PagoCobroFI,
} from "@/lib/schemas"
import {
  parametrosDeVersion,
  versionReglamentoVigenteDeComunidad,
} from "@/lib/reglamento"
import {
  contenidoAviso,
  folioNumerado,
  hashContenido,
  nuevoCodigoVerificacion,
  siguienteNumeroDeFolio,
  totalesDelPeriodo,
  vencimientoAviso,
  type ContenidoAviso,
  type ReglamentoDelAviso,
} from "@/lib/aviso-cobro"
import type { ResumenMensual } from "@/lib/resumen-mensual"
import {
  personaIdDelUsuarioDb,
  unidadesVinculadasDb,
} from "@/lib/api/sesion-persona"
import { createCrudHandlers, type CrudDelegate } from "@/lib/api/crud-factory"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

// Adaptador de delegate Prisma a la factory (mismo patrón que maestros/[tipo]).
function delegado(modelo: unknown): CrudDelegate {
  return modelo as CrudDelegate
}

export const avisosHandlers = createCrudHandlers({
  model: delegado(prisma.avisoCobro),
  schema: AvisoCobroSchema,
  authzCheck: (rol, accion) => puede(rol, accion, "fi:gasto_comun"),
})

/** El aviso es parte del gasto común: emitirlo, entregarlo y auditarlo. */
const RECURSO_AVISO = "fi:gasto_comun"

/**
 * F27 — la clave del RESIDENTE: lee el aviso de SU unidad.
 *
 * `ver` es su única acción (emitir y entregar siguen siendo `fi:gasto_comun`) y
 * el alcance por unidad es ABAC de ESTA ruta: el cliente nunca decide de quién
 * es el aviso, igual que `fi:cobranza:propia` en `cobros-fi/canales`.
 */
const RECURSO_AVISO_PROPIO = "fi:aviso:propio"

/**
 * Columnas de CF que el papel imprime: identidad de la comunidad, administrador
 * responsable y firma. Es lo que el PDF del residente necesita; el SMTP y la
 * clave de eliminación NO son parte del documento y no salen de acá.
 */
const COLUMNAS_DOCUMENTO = {
  nombreComunidad: true,
  direccionOficial: true,
  rutComunidad: true,
  administradorResponsable: true,
  rutAdministrador: true,
  firmaDigitalizadaUrl: true,
} as const

/**
 * GET lista paginada. Dos ramas, una sola forma de respuesta:
 *
 * - `fi:gasto_comun` (administración y comité): todos los avisos de la
 *   comunidad, como hasta hoy. `?unidadId=` acota a una unidad.
 * - `fi:aviso:propio` (residente): SOLO los avisos de las unidades donde tiene
 *   vínculo VIGENTE (`unidadesVinculadasDb`, la misma regla ABAC del resto de
 *   la app). Pedir una unidad ajena devuelve el conjunto VACÍO con 200, nunca
 *   403: un 403 confirmaría que existe un aviso de esa unidad.
 *
 * Cada fila viaja con su `contenido` congelado (el papel se arma solo desde la
 * fila guardada) y con `hash`, la huella calculada ACÁ con `hashContenido`: el
 * builder del PDF la exige como parámetro y del lado del cliente no se puede
 * calcular (`lib/aviso-cobro` es de servidor: crypto + Prisma).
 */
export async function GET(req: Request): Promise<Response> {
  const scopeResult = await withComunidadScope()
  if (!scopeResult.ok) return scopeResult.response
  const scope = scopeResult.scope

  const veTodas = puede(scope.rol, "ver", RECURSO_AVISO)
  const veLaPropia = puede(scope.rol, "ver", RECURSO_AVISO_PROPIO)
  if (!veTodas && !veLaPropia) return jsonError(403, "Permiso denegado.")

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50)
  )
  const unidadId = url.searchParams.get("unidadId")?.trim() || undefined

  try {
    const where: Prisma.AvisoCobroWhereInput = { comunidadId: scope.comunidadId }
    if (!veTodas) {
      // Lo propio se resuelve en el SERVIDOR: el vínculo vigente (`fechaFin`
      // nulo) manda, y el parámetro `unidadId` solo puede INTERSECTAR, nunca
      // ampliar el alcance.
      const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
      const propias = personaId
        ? await unidadesVinculadasDb(personaId, scope.comunidadId)
        : []
      where.unidadId = {
        in: unidadId ? propias.filter((u) => u === unidadId) : propias,
      }
    } else if (unidadId) {
      where.unidadId = unidadId
    }

    const [filas, total, configuracion] = await Promise.all([
      prisma.avisoCobro.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.avisoCobro.count({ where }),
      prisma.configuracionGlobal.findUnique({
        where: { comunidadId: scope.comunidadId },
        select: COLUMNAS_DOCUMENTO,
      }),
    ])

    return Response.json({
      data: filas.map((fila) => ({
        ...fila,
        hash: hashContenido(fila.contenido),
      })),
      page,
      pageSize,
      total,
      documento: configuracion ?? null,
    })
  } catch (e) {
    logger.error({ err: e }, "[api/avisos-cobro] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}

const EmitirAvisosInputSchema = z.object({
  periodo: PeriodoFacturacionSchema,
  /** Ausente = todas las unidades con cobro en el período. */
  unidadId: IdEntidadSchema.optional(),
})

/** Intentos de asignación de folio antes de rendirse ante colisiones reales. */
const MAX_INTENTOS_CORRELATIVO = 3

/** Una fila de aviso armada, todavía sin folio ni código (los pone la transacción). */
interface FilaAvisoNueva {
  id: string
  comunidadId: string
  unidadId: string
  periodo: string
  fechaEmision: string
  vencimiento: string | null
  contenido: ContenidoAviso
  totalesComunidad: ResumenMensual
}

/** La unidad objetivo ya recibió su aviso entre la compuerta y la escritura. */
class AvisoDuplicado extends Error {
  constructor(readonly folio: string) {
    super(`La unidad ya tiene el aviso ${folio} para ese período.`)
  }
}

/** Material del índice único que disparó el P2002 ("folio", "unidadId,periodo"...). */
function targetDelConflicto(e: unknown): string {
  if (typeof e !== "object" || e === null || !("code" in e)) return ""
  const err = e as { code?: unknown; meta?: { target?: unknown } }
  if (err.code !== "P2002") return ""
  const target = err.meta?.target
  if (Array.isArray(target)) return target.join(",")
  return typeof target === "string" ? target : ""
}

/**
 * POST emite los avisos del período. Devuelve `{ avisos }` con las filas ya
 * foliadas, en el orden de las unidades objetivo.
 */
export async function POST(req: Request): Promise<Response> {
  const scopeResult = await withComunidadScope()
  if (!scopeResult.ok) return scopeResult.response
  const scope = scopeResult.scope
  if (!puede(scope.rol, "crear", "fi:gasto_comun")) {
    return jsonError(403, "Permiso denegado.")
  }

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")
  const parsed = EmitirAvisosInputSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const { periodo } = parsed.data

  try {
    // 1. El aviso cobra un período EMITIDO: sin emisión no hay gasto común que
    // notificar, y el papel quedaría sin respaldo.
    const emision = await prisma.emisionGC.findFirst({
      where: { comunidadId: scope.comunidadId, periodo },
      select: { id: true },
    })
    if (!emision) {
      return jsonError(
        409,
        `No se puede emitir el aviso: el período ${periodo} no tiene emisión de gasto común.`
      )
    }

    // 2. Unidades objetivo: solo las que tienen cobro en el período.
    const cobrosDelPeriodo = await prisma.cobroFI.findMany({
      where: { comunidadId: scope.comunidadId, periodo },
      orderBy: [{ fechaCargo: "asc" }, { id: "asc" }],
    })
    const unidadesConCobro = new Set(cobrosDelPeriodo.map((c) => c.unidadId))
    let objetivos: Array<{ id: string; numero: string; etiqueta: string; prorrateo: number }>
    if (parsed.data.unidadId) {
      const unidad = await prisma.unidad.findFirst({
        where: { id: parsed.data.unidadId, comunidadId: scope.comunidadId },
        select: { id: true, numero: true, etiqueta: true, prorrateo: true },
      })
      if (!unidad) return jsonError(404, "Unidad no encontrada.")
      if (!unidadesConCobro.has(unidad.id)) {
        return jsonError(
          400,
          `La unidad ${unidad.numero} no tiene cobro en el período ${periodo}: un aviso no cobra un período sin cargo.`
        )
      }
      objetivos = [unidad]
    } else {
      // Las unidades sin cobro se OMITEN: no hay monto que notificar y un aviso
      // en $0 sería un documento que miente sobre lo que se debe.
      objetivos = await prisma.unidad.findMany({
        where: {
          comunidadId: scope.comunidadId,
          id: { in: [...unidadesConCobro] },
        },
        select: { id: true, numero: true, etiqueta: true, prorrateo: true },
        orderBy: [{ numero: "asc" }, { id: "asc" }],
      })
      if (objetivos.length === 0) {
        return jsonError(
          400,
          `El período ${periodo} no tiene unidades con cobro: no hay aviso que emitir.`
        )
      }
    }

    // 3. Un aviso emitido no se reemplaza (ni se renumera).
    const yaEmitidos = await prisma.avisoCobro.findMany({
      where: {
        comunidadId: scope.comunidadId,
        periodo,
        unidadId: { in: objetivos.map((u) => u.id) },
      },
      select: { folio: true },
      orderBy: { folio: "asc" },
    })
    if (yaEmitidos.length > 0) {
      return jsonError(
        409,
        `El período ${periodo} ya tiene aviso emitido para ${yaEmitidos.length} de ${objetivos.length} unidad(es) (${yaEmitidos
          .map((a) => a.folio)
          .join(", ")}): un aviso emitido no se reemplaza.`
      )
    }

    // 4. Totales de comunidad del período (Ley 21.442 art. 31). Sin fondos de
    // caja el saldo al cierre no es computable y el aviso no se emite.
    const totales = await totalesDelPeriodo(scope.comunidadId, periodo)
    if (!totales.ok) return jsonError(400, totales.error)

    // 5. Términos con los que se calcula: copia congelada del reglamento vigente
    // (o `null` + motivo declarado en el contenido).
    const versionVigente = await versionReglamentoVigenteDeComunidad(
      scope.comunidadId,
      periodo
    )
    const reglamento: ReglamentoDelAviso | null = versionVigente
      ? {
          id: versionVigente.id,
          version: versionVigente.version,
          vigenteDesde: versionVigente.vigenteDesde,
          fuenteInstrumento: versionVigente.fuenteInstrumento,
          formaContribucion: versionVigente.formaContribucion,
          parametros: parametrosDeVersion(versionVigente),
        }
      : null
    // Los fondos dan nombre y naturaleza a cada línea: el recargo al fondo de
    // reserva se reconoce por el fondo al que la línea se imputó.
    const fondos = await prisma.fondoFI.findMany({
      where: { comunidadId: scope.comunidadId },
      select: { id: true, nombre: true, tipo: true },
    })

    const fechaEmision = hoyISO()
    // El plazo de pago (S6) es del DOCUMENTO, no del cargo: emisión + los días
    // que declara la versión que rige el período. Sin versión no hay plazo y el
    // vencimiento queda `null` en vez de inventar una fecha.
    const vencimiento = vencimientoAviso(
      fechaEmision,
      reglamento?.parametros?.diasPagoGc ?? null
    )
    const filas: FilaAvisoNueva[] = objetivos.map((unidad, idx) => {
      const cobros = cobrosDelPeriodo
        .filter((c) => c.unidadId === unidad.id)
        // El papel manda: el cargo se emite alineado a la fecha del aviso, así
        // que la copia congelada del contenido dice lo mismo que la columna
        // `vencimiento` y que el cargo alineado en la transacción.
        .map((cobro) => ({
          ...cobro,
          fechaVencimiento: vencimiento ?? cobro.fechaVencimiento,
        }))
      const contenido = contenidoAviso({
        periodo,
        fechaEmision,
        unidad,
        reglamento,
        fondos,
        // SAFETY: lineas/moras/pagos son Json con shape validado por CobroFISchema
        // y `concepto` es String en BD con los valores de CONCEPTOS_COBRO_FI; el
        // lector de líneas (lineasDeCobro) acepta NULL como cobro legacy.
        cobros: cobros.map((cobro) => ({
          id: cobro.id,
          concepto: cobro.concepto as ConceptoCobroFI,
          descripcion: cobro.descripcion,
          montoBase: cobro.montoBase,
          lineas: cobro.lineas as unknown as LineaCobroFI[] | null,
          fondoId: cobro.fondoId,
          fechaCargo: cobro.fechaCargo,
          fechaVencimiento: cobro.fechaVencimiento,
          moras: cobro.moras as unknown as MoraCobroFI[],
          pagos: cobro.pagos as unknown as PagoCobroFI[],
        })),
        resumen: totales.resumen,
      })
      return {
        id: generarId("avi", idx),
        comunidadId: scope.comunidadId,
        unidadId: unidad.id,
        periodo,
        fechaEmision,
        vencimiento,
        contenido,
        totalesComunidad: totales.resumen,
      }
    })

    for (let intento = 1; intento <= MAX_INTENTOS_CORRELATIVO; intento++) {
      try {
        const creados = await prisma.$transaction(async (tx) => {
          // La unicidad (unidad, período) se vuelve a mirar DENTRO de la
          // transacción: la compuerta de arriba y la escritura no pueden dejar
          // una ventana donde dos emisiones concurrentes emitan el mismo papel.
          const choque = await tx.avisoCobro.findFirst({
            where: {
              comunidadId: scope.comunidadId,
              periodo,
              unidadId: { in: filas.map((f) => f.unidadId) },
            },
            select: { folio: true },
          })
          if (choque) throw new AvisoDuplicado(choque.folio)

          const emitidos = await tx.avisoCobro.findMany({
            where: { comunidadId: scope.comunidadId },
            select: { folio: true, codigoVerificacion: true },
          })
          const codigos = new Set(emitidos.map((e) => e.codigoVerificacion))
          let numero = siguienteNumeroDeFolio(emitidos.map((e) => e.folio))

          const filasCreadas = []
          for (const fila of filas) {
            const codigoVerificacion = nuevoCodigoVerificacion(codigos)
            codigos.add(codigoVerificacion)
            filasCreadas.push(
              await tx.avisoCobro.create({
                data: {
                  ...fila,
                  folio: folioNumerado(numero),
                  codigoVerificacion,
                  // SAFETY: contenido y totalesComunidad son objetos planos
                  // serializables (el contenido es el Json del aviso).
                  contenido: fila.contenido as unknown as Prisma.InputJsonValue,
                  totalesComunidad:
                    fila.totalesComunidad as unknown as Prisma.InputJsonValue,
                },
              })
            )
            numero += 1
          }

          // S6, la otra mitad de la regla: si el cargo del período traía otra
          // fecha, el papel manda y el cargo queda con la fecha del aviso. La
          // mora corre desde `fechaVencimiento`, así que dejarla distinta sería
          // cobrar intereses contra una fecha que el residente nunca vio.
          if (vencimiento) {
            await tx.cobroFI.updateMany({
              where: {
                comunidadId: scope.comunidadId,
                periodo,
                unidadId: { in: filas.map((f) => f.unidadId) },
                // `not` no alcanza a las filas sin fecha: el `null` se nombra.
                OR: [
                  { fechaVencimiento: null },
                  { fechaVencimiento: { not: vencimiento } },
                ],
              },
              data: { fechaVencimiento: vencimiento },
            })
          }
          return filasCreadas
        })
        return Response.json({ avisos: creados }, { status: 201 })
      } catch (e) {
        if (e instanceof AvisoDuplicado) {
          return jsonError(
            409,
            `El período ${periodo} ya tiene aviso emitido (${e.folio}): un aviso emitido no se reemplaza.`
          )
        }
        const target = targetDelConflicto(e)
        if (target !== "") {
          const esCorrelativo =
            target.includes("folio") || target.includes("codigoVerificacion")
          // 409 de otro índice único = alguien emitió el mismo papel a la vez.
          if (esCorrelativo && intento < MAX_INTENTOS_CORRELATIVO) continue
          return jsonError(
            409,
            esCorrelativo
              ? "Conflicto: no se pudo reservar un folio libre para el aviso, reintentá la emisión."
              : `El período ${periodo} ya tiene aviso emitido: un aviso emitido no se reemplaza.`
          )
        }
        logger.error({ err: e }, "[api/avisos-cobro] error inesperado")
        return jsonError(500, "Error interno del servidor.")
      }
    }
    return jsonError(
      409,
      "Conflicto: no se pudo reservar un folio libre para el aviso, reintentá la emisión."
    )
  } catch (e) {
    logger.error({ err: e }, "[api/avisos-cobro] error inesperado")
    return jsonError(500, "Error interno del servidor.")
  }
}
