/**
 * /api/maestros/[tipo] — colección MA de maestros administrativos
 * (BD-FUENTE-VERDAD Fase 0). El `tipo` kebab-case se resuelve dinámicamente a
 * delegado Prisma + schema Zod y los handlers estándar vienen de la factory
 * (scoping, upsert idempotente, paginación y errores estandarizados).
 * Baja protegida por `beforeDelete`: maestros referenciados por personas o
 * vínculos no se eliminan (409).
 */
import { MAESTRO_SCHEMAS } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, type CrudHandlers } from "@/lib/api/crud-factory"
import type { CrudDelegate } from "@/lib/api/crud-factory"
import { jsonError, type ComunidadScope } from "@/lib/api/with-comunidad-scope"

interface EntradaMaestro {
  delegate: CrudDelegate
  schemaKey: keyof typeof MAESTRO_SCHEMAS
}

// SAFETY: los delegados tipados de Prisma cumplen estructuralmente el contrato
// CrudDelegate (findMany/findUnique/count/upsert/update/delete); el cast único
// evita frotar los tipos genéricos generados por Prisma en cada entrada.
function delegado(modelo: unknown): CrudDelegate {
  return modelo as CrudDelegate
}

/** Mapeo kebab-case → delegado Prisma + clave de MAESTRO_SCHEMAS. */
const MODELOS_MAESTRO: Record<string, EntradaMaestro> = {
  afps: { delegate: delegado(prisma.afp), schemaKey: "afps" },
  "previsiones-salud": {
    delegate: delegado(prisma.previsionSalud),
    schemaKey: "previsionesSalud",
  },
  "mutuales-cajas": {
    delegate: delegado(prisma.mutualCaja),
    schemaKey: "mutualesCajas",
  },
  feriados: { delegate: delegado(prisma.feriado), schemaKey: "feriados" },
  bancos: { delegate: delegado(prisma.banco), schemaKey: "bancos" },
  "indices-ajuste": {
    delegate: delegado(prisma.indiceAjuste),
    schemaKey: "indicesAjuste",
  },
  "cajas-fondos": {
    delegate: delegado(prisma.cajaFondo),
    schemaKey: "cajasFondos",
  },
  "categorias-insumos": {
    delegate: delegado(prisma.categoriaInsumo),
    schemaKey: "categoriasInsumos",
  },
  "unidades-medida": {
    delegate: delegado(prisma.unidadMedida),
    schemaKey: "unidadesMedida",
  },
  "contactos-emergencia": {
    delegate: delegado(prisma.contactoEmergencia),
    schemaKey: "contactosEmergencia",
  },
  "condiciones-especiales": {
    delegate: delegado(prisma.condicionEspecial),
    schemaKey: "condicionesEspeciales",
  },
  "estados-ocupacion": {
    delegate: delegado(prisma.estadoOcupacion),
    schemaKey: "estadosOcupacion",
  },
  "categorias-macro": {
    delegate: delegado(prisma.categoriaMacro),
    schemaKey: "categoriasMacro",
  },
  "categorias-micro": {
    delegate: delegado(prisma.categoriaMicro),
    schemaKey: "categoriasMicro",
  },
  "categorias-unidad": {
    delegate: delegado(prisma.categoriaUnidad),
    schemaKey: "categoriasUnidad",
  },
  "estados-inmobiliarios": {
    delegate: delegado(prisma.estadoInmobiliario),
    schemaKey: "estadosInmobiliarios",
  },
  "asignaciones-familiar": {
    delegate: delegado(prisma.asignacionFamiliar),
    schemaKey: "asignacionFamiliar",
  },
  jornadas: { delegate: delegado(prisma.jornada), schemaKey: "jornadas" },
  couriers: { delegate: delegado(prisma.courier), schemaKey: "couriers" },
  contratistas: {
    delegate: delegado(prisma.contratista),
    schemaKey: "contratistas",
  },
}

/** Campo FK dentro de Persona.datosLaborales que referencia a cada maestro. */
const CAMPOS_FK_LABORALES: Record<string, string> = {
  afps: "afpId",
  "previsiones-salud": "saludId",
  "mutuales-cajas": "mutualidadId",
  bancos: "bancoId",
  "asignaciones-familiar": "asignacionFamiliarId",
}

/**
 * Guardia de borrado: corta con 409 si el maestro está en uso por la
 * comunidad (vínculos, condiciones especiales o fichas laborales).
 */
async function beforeDeleteMaestro(
  tipo: string,
  record: unknown,
  scope: ComunidadScope
): Promise<Response | null> {
  const id = (record as { id: string }).id
  const comunidadId = scope.comunidadId

  if (tipo === "estados-ocupacion") {
    const enUso = await prisma.vinculoUnidad.count({
      where: { comunidadId, estadoOcupacionPropiedad: id },
    })
    if (enUso > 0) {
      return jsonError(
        409,
        "Conflicto: el estado de ocupación está en uso por vínculos de unidad."
      )
    }
  }

  if (tipo === "condiciones-especiales") {
    // En SQLite/Json no hay query por elemento: se filtra en memoria.
    const personas = await prisma.persona.findMany({
      where: { comunidadId },
      select: { condicionesEspecialesIds: true },
    })
    const enUso = personas.some(
      (p) =>
        Array.isArray(p.condicionesEspecialesIds) &&
        (p.condicionesEspecialesIds as unknown[]).includes(id)
    )
    if (enUso) {
      return jsonError(
        409,
        "Conflicto: la condición especial está asignada a personas de la comunidad."
      )
    }
  }

  const campoFk = CAMPOS_FK_LABORALES[tipo]
  if (campoFk) {
    const personas = await prisma.persona.findMany({
      where: { comunidadId },
      select: { datosLaborales: true },
    })
    const enUso = personas.some((p) => {
      const dl = p.datosLaborales as Record<string, unknown> | null
      return dl !== null && typeof dl === "object" && dl[campoFk] === id
    })
    if (enUso) {
      return jsonError(
        409,
        `Conflicto: el maestro está en uso por fichas laborales (campo ${campoFk}).`
      )
    }
  }

  return null
}

/** Handlers CRUD de un tipo resuelto, o null si el tipo es desconocido. */
export function handlersMaestro(tipo: string): CrudHandlers | null {
  const entrada = MODELOS_MAESTRO[tipo]
  if (!entrada) return null
  return createCrudHandlers({
    model: entrada.delegate,
    schema: MAESTRO_SCHEMAS[entrada.schemaKey],
    authzCheck: (rol, accion) => puede(rol, accion, "mp"),
    beforeDelete: (record, scope) => beforeDeleteMaestro(tipo, record, scope),
  })
}

type CtxTipo = { params: Promise<{ tipo: string }> }

/** GET lista paginada. */
export async function GET(req: Request, ctx: CtxTipo): Promise<Response> {
  const { tipo } = await ctx.params
  const handlers = handlersMaestro(tipo)
  if (!handlers) return jsonError(400, "Tipo de maestro desconocido.")
  return handlers.GET(req)
}

/** POST upsert idempotente por id. */
export async function POST(req: Request, ctx: CtxTipo): Promise<Response> {
  const { tipo } = await ctx.params
  const handlers = handlersMaestro(tipo)
  if (!handlers) return jsonError(400, "Tipo de maestro desconocido.")
  return handlers.POST(req)
}
