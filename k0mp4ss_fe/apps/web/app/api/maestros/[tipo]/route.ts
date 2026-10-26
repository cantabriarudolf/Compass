/**
 * /api/maestros/[tipo] — colección MA de maestros administrativos
 * (BD-FUENTE-VERDAD Fase 0). El `tipo` kebab-case se resuelve dinámicamente a
 * delegado Prisma + schema Zod y los handlers estándar vienen de la factory
 * (scoping, upsert idempotente, paginación y errores estandarizados).
 * Baja protegida por `beforeDelete`: maestros referenciados por personas o
 * vínculos no se eliminan (409).
 *
 * F20 (fase 1b): `?incluirOcultos=1` en un catálogo nacional devuelve también
 * las filas ocultadas por esta comunidad (es para pantallas de administración,
 * no para formularios) y anota cada fila con el booleano `oculto`. Sin el
 * parámetro el GET es el de siempre: ocultas excluidas y sin el campo; los
 * tipos no nacionales ignoran el parámetro y no cambian su forma.
 */
import { MAESTRO_SCHEMAS } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import {
  esNacional,
  esTipoNacional,
  MENSAJE_NACIONAL_PROTEGIDO,
} from "@/lib/maestros-nacionales"
import { createCrudHandlers, type CrudHandlers } from "@/lib/api/crud-factory"
import type { CrudDelegate } from "@/lib/api/crud-factory"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"

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

/** Handlers CRUD de un tipo resuelto, o null si el tipo es desconocido.
 *
 * F20 (fase 1): `ocultos` permite inyectar los ids ocultados por esta
 * comunidad en un catálogo nacional. El delegate se envuelve para que el
 * findMany/count de la factory excluya esas filas del listado y del `total`
 * sin duplicar la lógica de paginación ni tocar el módulo compartido.
 */
export function handlersMaestro(tipo: string, ocultos: readonly string[] = []): CrudHandlers | null {
  const entrada = MODELOS_MAESTRO[tipo]
  if (!entrada) return null
  return createCrudHandlers({
    model: envolverOcultos(entrada.delegate, ocultos),
    schema: MAESTRO_SCHEMAS[entrada.schemaKey],
    authzCheck: (rol, accion) => puede(rol, accion, "mp"),
    beforeDelete: (record, scope) => beforeDeleteMaestro(tipo, record, scope),
  })
}

/**
 * Envoltura aditiva del delegate: si la comunidad ocultó filas de este
 * catálogo nacional, findMany/count agregan `id NOT IN (ocultos)` al where
 * que la factory ya construyó (scoping por comunidad + búsqueda `q`).
 * Las demás operaciones (upsert/update/delete) pasan intactas: el guard de
 * nacional vive en las rutas, no acá.
 */
function envolverOcultos(
  modelo: CrudDelegate,
  ocultos: readonly string[]
): CrudDelegate {
  if (ocultos.length === 0) return modelo
  const excluir = (args?: Record<string, unknown>): Record<string, unknown> => {
    const where = (args?.where as Record<string, unknown> | undefined) ?? {}
    return { ...(args ?? {}), where: { ...where, id: { notIn: [...ocultos] } } }
  }
  return {
    ...modelo,
    findMany: (args) => modelo.findMany(excluir(args)),
    count: (args) => modelo.count(excluir(args)),
  }
}

/** Ids de catálogo nacional ocultados por esta comunidad para el tipo dado. */
async function idsOcultos(tipo: string, comunidadId: string): Promise<string[]> {
  const filas = await prisma.maestroOculto.findMany({
    where: { comunidadId, tipo },
    select: { maestroId: true },
  })
  return filas.map((f) => f.maestroId)
}

type CtxTipo = { params: Promise<{ tipo: string }> }

/** GET lista paginada.
 *
 * F20 (fase 1): en los catálogos nacionales se resuelve primero el scope de
 * comunidad para excluir del listado (y del `total`) las filas que esa
 * comunidad ocultó; el resto del comportamiento es el de la factory.
 *
 * F20 (fase 1b): con `?incluirOcultos=1` el delegate va SIN envoltura (las
 * ocultas entran al listado y al `total`) y cada fila suma `oculto`, booleano
 * según la tabla de ocultamiento de esta comunidad. La anotación se hace sobre
 * la respuesta de la factory para no duplicar su paginación ni su where.
 */
export async function GET(req: Request, ctx: CtxTipo): Promise<Response> {
  const { tipo } = await ctx.params
  if (!MODELOS_MAESTRO[tipo]) return jsonError(400, "Tipo de maestro desconocido.")
  if (!esTipoNacional(tipo)) return handlersMaestro(tipo)!.GET(req)
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  // El factory valida la URL igual (400 "URL de solicitud inválida."); acá se
  // repite el guard para leer el parámetro antes de delegar.
  let incluirOcultos = false
  try {
    incluirOcultos =
      new URL(req.url).searchParams.get("incluirOcultos") === "1"
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }
  const ocultos = await idsOcultos(tipo, resultado.scope.comunidadId)
  const handlers = incluirOcultos
    ? handlersMaestro(tipo)
    : handlersMaestro(tipo, ocultos)
  const respuesta = await handlers!.GET(req)
  if (!incluirOcultos || !respuesta.ok) return respuesta
  const cuerpo = (await respuesta.json()) as {
    data: { id: unknown }[]
  }
  const conjunto = new Set(ocultos)
  return Response.json({
    ...cuerpo,
    data: cuerpo.data.map((fila) => ({
      ...fila,
      oculto: conjunto.has(String(fila.id)),
    })),
  })
}

/** POST upsert idempotente por id.
 *
 * F20 (fase 1): crear sigue permitido — una entrada nueva del administrador no
 * es nacional y puede editarse y borrarse. Pero el POST es upsert por id, así
 * que si el id coincide con una fila nacional sería una edición encubierta del
 * catálogo nacional: se corta con 403, igual que el PUT de la ruta [id].
 */
export async function POST(req: Request, ctx: CtxTipo): Promise<Response> {
  const { tipo } = await ctx.params
  const handlers = handlersMaestro(tipo)
  if (!handlers) return jsonError(400, "Tipo de maestro desconocido.")
  if (esTipoNacional(tipo)) {
    const cuerpo = await req.clone().json().catch(() => null)
    const id =
      typeof cuerpo === "object" && cuerpo !== null
        ? (cuerpo as { id?: unknown }).id
        : undefined
    if (typeof id === "string" && esNacional(tipo, id)) {
      return jsonError(403, MENSAJE_NACIONAL_PROTEGIDO)
    }
  }
  return handlers.POST(req)
}
