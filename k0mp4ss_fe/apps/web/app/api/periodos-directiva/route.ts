/**
 * /api/periodos-directiva — colección GD de períodos (BD-FUENTE-VERDAD Fase 2).
 *
 * Reemplaza la factory genérica de Fase 0 con las reglas del libro (espejo de
 * savePeriodoDirectiva en lib/store.ts):
 * - GET paginado scoped (residente puede ver: puede(rol, "ver", "gd")).
 * - POST upsert idempotente, validado con PeriodoDirectivaSchema.
 * - `referenciaInscripcion` es un respaldo externo OPCIONAL (la ley no exige
 *   inscribir la directiva); su ausencia no bloquea registro ni cierre. Su
 *   hermana `fechaInscripcion` también es opcional y se persiste como cadena
 *   vacía ("" = no aplica: la comunidad no inscribió el período).
 * - Art. 17 Ley 21.442: duración ≤ 36 meses (schema) + nómina impar de 3 a 5
 *   al activar un vigente + cada miembro existe y tiene cuenta activa.
 * - Solo un período "vigente" por comunidad (409 si otro vigente existe).
 * - Al activar un vigente se cierra el previo archivando su nómina y se
 *   asignan las fichas de gobernanza de la nómina entrante (conserva id).
 * - Decisión del owner (opción A): el registro del libro no se destruye al
 *   rotar. Antes de depurar la PROYECCIÓN (`Persona.datosGobernanza`, "quién
 *   está ahora"), la rotación escribe en el snapshot del período que cierra la
 *   información de cierre de quien sale: `capacidad` (elegibilidad, art. 17
 *   inc. 4), `fechaTermino`, `motivoTermino` y, si corresponde, la entrega de
 *   documentos del presidente saliente. El snapshot nunca se borra ni se vacía.
 */
import {
  PeriodoDirectivaSchema,
  leerMiembrosPeriodo,
  type CapacidadDirectiva,
  type MiembroPeriodo,
  type MotivoTerminoDirectiva,
} from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"
import { CARGOS_DIRECTIVA } from "@/lib/api/gd-guard"

/** Campos persistibles de PeriodoDirectiva. */
const CAMPOS_PERIODO = [
  "fechaInicio",
  "duracionMeses",
  "fechaFin",
  "fechaInscripcion",
  "referenciaInscripcion",
  "fechasEstimadas",
  "estado",
  "actaOrigenId",
  "miembros",
] as const

export function limpiarPayloadPeriodo(
  datos: Record<string, unknown>
): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const campo of CAMPOS_PERIODO) {
    if (campo in datos) salida[campo] = datos[campo]
  }
  return salida
}

export function errorPeriodos(e: unknown): Response {
  if (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  ) {
    return jsonError(404, "Registro no encontrado.")
  }
  logger.error({ err: e }, "[api/periodos-directiva] error inesperado")
  return jsonError(500, "Error interno del servidor.")
}

export interface MiembroNomina {
  personaId: string
  nombre: string
  cargo: string
  fechaAsuncion: string
  /** Elegibilidad con que se designó el cargo (art. 17 inc. 4). */
  capacidad?: CapacidadDirectiva
  fechaTermino?: string
  motivoTermino?: string
}

function esFechaISO(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)
}

/**
 * Valida la nómina contra MP en BD: cargos válidos, fechas ISO, personas
 * existentes con cuenta activa. No muta.
 */
export async function validarNomina(
  miembros: unknown,
  scope: ComunidadScope
): Promise<{ ok: true; nomina: MiembroNomina[] } | { ok: false; response: Response }> {
  const nomina = (Array.isArray(miembros) ? miembros : []) as MiembroNomina[]
  for (const m of nomina) {
    if (!(CARGOS_DIRECTIVA as readonly string[]).includes(m.cargo)) {
      return {
        ok: false,
        response: jsonError(400, `Cargo inválido en la nómina: ${m.cargo}.`),
      }
    }
    if (!esFechaISO(m.fechaAsuncion)) {
      return {
        ok: false,
        response: jsonError(
          400,
          `Fecha de asunción inválida en la nómina: ${m.fechaAsuncion}.`
        ),
      }
    }
    const persona = await prisma.persona.findUnique({
      where: { id: m.personaId },
      select: { id: true, nombreCompleto: true, estadoCuenta: true, comunidadId: true },
    })
    if (!persona || persona.comunidadId !== scope.comunidadId) {
      return {
        ok: false,
        response: jsonError(
          400,
          `No se puede activar: la persona "${m.personaId}" no existe.`
        ),
      }
    }
    if (persona.estadoCuenta !== "activa") {
      return {
        ok: false,
        response: jsonError(
          400,
          `No se puede activar: ${persona.nombreCompleto} no tiene cuenta activa.`
        ),
      }
    }
  }
  return { ok: true, nomina }
}

/** Ficha de gobernanza tal como vive en el Json de MP (ExtensionGobernanzaSchema). */
interface FichaGobernanzaLeida {
  periodoId?: string
  cargoDirectiva: string
  fechaAsuncion: string
  capacidad?: CapacidadDirectiva
  fechaTermino?: string
  motivoTermino?: MotivoTerminoDirectiva
}

/** Persona de MP con su ficha de gobernanza (fila de prisma.persona). */
export interface PersonaConFicha {
  id: string
  nombreCompleto: string
  datosGobernanza: unknown
}

/** Información de cierre que se escribe en la nómina archivada de un período. */
export interface CierreDePeriodo {
  /** Fecha con la que se cierra el mandato de quien no continúa. */
  fechaCierre: string
  /**
   * true = esta operación termina mandatos (rotación: alguien deja el cargo).
   * false/ausente = el período se archiva sin declarar salidas (cierre manual:
   * nadie dejó el cargo por cerrar el libro, y el fin del período ya está en
   * `fechaFin`); solo se archiva el término que la propia ficha declare.
   */
  cierraMandatos?: boolean
  /** Motivo con el que se cierra el mandato de quien no declara uno propio. */
  motivoTermino?: MotivoTerminoDirectiva
  /** Personas cuyo mandato CONTINÚA: no se registran como salida. */
  continuidades?: ReadonlySet<string>
  /** Entrega de documentos del presidente saliente al entrante (art. 17). */
  entregaDocumentos?: {
    fecha: string
    receptor: { personaId: string; nombre: string }
  }
  /** Snapshot ya guardado del período: lo que declara no se pierde al rearchivar. */
  snapshotPrevio?: unknown
}

/** Fichas de gobernanza de la comunidad (lectura del libro físico en MP). */
export async function fichasDeComunidad(
  scope: ComunidadScope
): Promise<PersonaConFicha[]> {
  return prisma.persona.findMany({
    where: { comunidadId: scope.comunidadId },
    select: { id: true, nombreCompleto: true, datosGobernanza: true },
  })
}

/**
 * Construye la nómina archivada de un período desde las fichas de MP.
 *
 * Reglas del registro (owner, opción A):
 * - Se archiva lo que la ficha declara (`cargo`, `fechaAsuncion`, `capacidad`) y
 *   se MERGEA con el snapshot previo: lo ya registrado en el libro sobrevive
 *   aunque la ficha haya quedado sin ese dato.
 * - Quien NO continúa recibe `fechaTermino`/`motivoTermino`: es el hecho que
 *   antes se perdía al depurar la ficha. Si la ficha ya declaraba ambos, mandan
 *   los de la ficha.
 * - El presidente saliente registra la entrega de documentos al presidente
 *   entrante (art. 17: el libro es la prueba de la entrega).
 */
export function construirNominaArchivada(
  fichas: PersonaConFicha[],
  periodoId: string,
  cierre: CierreDePeriodo
): MiembroPeriodo[] {
  const previos = new Map(
    leerMiembrosPeriodo(cierre.snapshotPrevio).map((m) => [m.personaId, m])
  )
  const salida: MiembroPeriodo[] = []
  for (const p of fichas) {
    // SAFETY: ficha Json escrita por la API de personas (ExtensionGobernanzaSchema); se archiva tal cual.
    const ficha = p.datosGobernanza as unknown as FichaGobernanzaLeida | null
    if (!ficha || ficha.periodoId !== periodoId) continue
    const previo = previos.get(p.id)
    const continua = cierre.continuidades?.has(p.id) ?? false
    const terminoDeclarado = ficha.fechaTermino ?? previo?.fechaTermino
    const fechaTermino = continua
      ? undefined
      : terminoDeclarado ?? (cierre.cierraMandatos ? cierre.fechaCierre : undefined)
    const motivoTermino = fechaTermino
      ? ficha.motivoTermino ??
        previo?.motivoTermino ??
        (cierre.cierraMandatos ? cierre.motivoTermino : undefined)
      : undefined
    const capacidad = ficha.capacidad ?? previo?.capacidad
    // El presidente que se va entrega los documentos al que asume (art. 17).
    const entrega =
      cierre.entregaDocumentos &&
      ficha.cargoDirectiva === "presidente" &&
      cierre.entregaDocumentos.receptor.personaId !== p.id
        ? cierre.entregaDocumentos
        : undefined
    // Lo ya registrado en el libro manda: un rearchivo nunca borra una entrega.
    const fechaEntregaDocumentos =
      previo?.fechaEntregaDocumentos ?? entrega?.fecha
    const entregaDocumentosA =
      previo?.entregaDocumentosA ?? entrega?.receptor.nombre
    salida.push({
      personaId: p.id,
      nombre: p.nombreCompleto,
      cargo: ficha.cargoDirectiva as MiembroPeriodo["cargo"],
      fechaAsuncion: ficha.fechaAsuncion,
      ...(capacidad ? { capacidad } : {}),
      ...(fechaTermino ? { fechaTermino } : {}),
      ...(motivoTermino ? { motivoTermino } : {}),
      ...(fechaEntregaDocumentos ? { fechaEntregaDocumentos } : {}),
      ...(entregaDocumentosA ? { entregaDocumentosA } : {}),
    })
  }
  return salida
}

/**
 * Nómina a persistir en el período. El snapshot del libro NUNCA se vacía: si no
 * hay fichas legibles, se conserva íntegro el archivo previo.
 */
export function miembrosArchivados(
  fichas: PersonaConFicha[],
  periodo: { id: string; miembros: unknown },
  cierre: CierreDePeriodo
): MiembroPeriodo[] {
  const construidos = construirNominaArchivada(fichas, periodo.id, {
    ...cierre,
    // Lo ya registrado en el libro es el punto de partida del merge.
    snapshotPrevio: periodo.miembros,
  })
  return construidos.length > 0
    ? construidos
    : leerMiembrosPeriodo(periodo.miembros)
}

/**
 * Cierra el vigente previo archivando su nómina desde las fichas de MP
 * (libro físico) y asigna las fichas de la nómina entrante. Espejo de
 * savePeriodoDirectiva (lib/store.ts), ahora transaccional en servidor.
 *
 * La PROYECCIÓN de los salientes se depura (dejan de contar para el quórum),
 * pero antes el hecho queda en el snapshot del período que cierra.
 */
export async function rotarVigente(
  scope: ComunidadScope,
  nuevoId: string,
  fechaInicioNuevo: string,
  nomina: MiembroNomina[]
): Promise<void> {
  const previo = await prisma.periodoDirectiva.findFirst({
    where: { comunidadId: scope.comunidadId, estado: "vigente" },
  })
  if (previo && previo.id !== nuevoId) {
    const fichasPrevias = await fichasDeComunidad(scope)
    const idsNuevos = new Set(nomina.map((m) => m.personaId))
    const presidenteEntrante = nomina.find((m) => m.cargo === "presidente")
    const nombrePresidenteEntrante = presidenteEntrante
      ? (await prisma.persona.findUnique({
          where: { id: presidenteEntrante.personaId },
          select: { nombreCompleto: true },
        }))?.nombreCompleto ?? presidenteEntrante.nombre
      : undefined

    const roster = miembrosArchivados(fichasPrevias, previo, {
      fechaCierre: fechaInicioNuevo,
      cierraMandatos: true,
      motivoTermino: "fin_periodo",
      continuidades: idsNuevos,
      ...(presidenteEntrante && nombrePresidenteEntrante
        ? {
            entregaDocumentos: {
              fecha: fechaInicioNuevo,
              receptor: {
                personaId: presidenteEntrante.personaId,
                nombre: nombrePresidenteEntrante,
              },
            },
          }
        : {}),
    })

    // SAFETY: nómina construida con campos validados (cargos/fechas/personas); el
    // round-trip JSON elimina `undefined` para InputJsonValue.
    let miembrosArchivadosJson: unknown
    try {
      miembrosArchivadosJson = JSON.parse(JSON.stringify(roster))
    } catch (e) {
      logger.error({ err: e }, "[api/periodos-directiva] nómina archivada no serializable")
      throw e
    }
    await prisma.periodoDirectiva.update({
      where: { id: previo.id },
      data: {
        estado: "cerrado",
        fechaFin: fechaInicioNuevo,
        miembros: miembrosArchivadosJson as never,
      },
    })
    // Recién después de registrar el cierre se depuran las PROYECCIONES de las
    // personas que no continúan (sin ficha dejan de contar para el quórum).
    const aDepurar = fichasPrevias.filter((p) => {
      // SAFETY: solo se lee periodoId de la ficha Json validada al escribir.
      const ficha = p.datosGobernanza as unknown as { periodoId?: string } | null
      return (
        ficha?.periodoId === previo.id && !idsNuevos.has(p.id)
      )
    })
    for (const p of aDepurar) {
      await prisma.persona.update({
        where: { id: p.id },
        // SAFETY: null borra el Json (undefined sería no-op en Prisma update).
        data: { datosGobernanza: null as never },
      })
    }
  }

  // Asigna las fichas de la nómina entrante (conserva id estable por persona).
  for (const m of nomina) {
    const persona = await prisma.persona.findUnique({
      where: { id: m.personaId },
      select: { id: true, roles: true, datosGobernanza: true },
    })
    if (!persona) continue
    // SAFETY: roles es Json ROLES_PERSONA[]; se agrega "directiva" si falta (la API de personas lo valida al leer).
    const roles = (persona.roles as unknown as string[]).includes("directiva")
      ? (persona.roles as never)
      : ([...(persona.roles as unknown as string[]), "directiva"] as never)
    // SAFETY: ficha Json por ExtensionGobernanzaSchema; se conserva id/firma/capacidad y se reasigna período.
    const previa = persona.datosGobernanza as unknown as {
      id?: string
      firmaDigital?: string
      capacidad?: CapacidadDirectiva
    } | null
    const capacidad = m.capacidad ?? previa?.capacidad
    await prisma.persona.update({
      where: { id: m.personaId },
      data: {
        roles,
        datosGobernanza: {
          id: previa?.id ?? `g-${m.personaId}`,
          cargoDirectiva: m.cargo,
          fechaAsuncion: m.fechaAsuncion,
          periodoId: nuevoId,
          ...(capacidad ? { capacidad } : {}),
          ...(previa?.firmaDigital ? { firmaDigital: previa.firmaDigital } : {}),
        } as never,
      },
    })
  }
}

/** GET lista paginada scoped por comunidad. */
export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  if (!puede(scope.rol, "ver", "gd")) {
    return jsonError(403, "Permiso denegado.")
  }

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
  const where = { comunidadId: scope.comunidadId }
  try {
    const [data, total] = await Promise.all([
      prisma.periodoDirectiva.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.periodoDirectiva.count({ where }),
    ])
    return Response.json({ data, page, pageSize, total })
  } catch (e) {
    return errorPeriodos(e)
  }
}

/** POST upsert idempotente por id con reglas del libro GD. */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = PeriodoDirectivaSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", {
      detalles: parsed.error.flatten(),
    })
  }
  const id = parsed.data.id

  try {
    const existente = await prisma.periodoDirectiva.findUnique({ where: { id } })
    // Upsert sobre un registro de OTRA comunidad → 404 (sin filtrar existencia)
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    if (!puede(scope.rol, existente ? "editar" : "crear", "gd")) {
      return jsonError(403, "Permiso denegado.")
    }
    // Un cerrado no se reabre por upsert (la nómina archivada es historia).
    if (existente?.estado === "cerrado" && parsed.data.estado === "vigente") {
      return jsonError(409, "Un período cerrado no se puede reabrir (el libro nunca se borra).")
    }

    // SAFETY: schema plano validado por zod; se trata como mapa para lista blanca.
    const datos = parsed.data as unknown as Record<string, unknown>
    const nominaValidada = await validarNomina(datos.miembros, scope)
    if (!nominaValidada.ok) return nominaValidada.response
    const nomina = nominaValidada.nomina

    if (parsed.data.estado === "vigente") {
      // Composición art. 17 Ley 21.442: impar de 3 a 5.
      if (nomina.length < 3 || nomina.length > 5 || nomina.length % 2 === 0) {
        return jsonError(
          400,
          `No se puede activar el período: la nómina debe ser impar de 3 a 5 miembros (art. 17 Ley 21.442). Recibidos: ${nomina.length}.`
        )
      }
      // Solo un vigente por comunidad: si hay otro, rota (cierra el previo
      // archivando su nómina); si no, solo asigna las fichas entrantes.
      await rotarVigente(scope, id, parsed.data.fechaInicio, nomina)
    }

    // SAFETY: payload blanqueado + comunidad del servidor; miembros Json ya validados.
    const record = await prisma.periodoDirectiva.upsert({
      where: { id },
      create: {
        ...limpiarPayloadPeriodo(datos),
        id,
        comunidadId: scope.comunidadId,
      } as never,
      update: limpiarPayloadPeriodo(datos) as never,
    })

    // Auditoría `GD_PERIODO_REGISTRADO` (categoría GD): se emite después de la
    // escritura y nunca la bloquea (patrón de las rutas que auditan a mano).
    try {
      await registrarEventoAuditoria({
        id: generarId("ev"),
        comunidadId: scope.comunidadId,
        timestamp: new Date().toISOString(),
        usuario: scope.usuarioId,
        categoria: "GD",
        tipoAccion: "GD_PERIODO_REGISTRADO",
        referenciaId: record.id,
        descripcion: `Período de directiva registrado (${record.estado}) desde ${record.fechaInicio}, ${record.duracionMeses} meses, nómina de ${nomina.length} miembros.`,
      })
    } catch (e) {
      logger.error({ err: e }, "[api/periodos-directiva] no se pudo registrar GD_PERIODO_REGISTRADO")
    }

    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    return errorPeriodos(e)
  }
}

