/**
 * /api/personas — colección MP (BD-FUENTE-VERDAD Fase 0).
 *
 * Scoping por withComunidadScope (el comunidadId es decisión del servidor).
 * Reglas de negocio espejo de savePersona (lib/store.ts), ahora en servidor:
 * - D1: media por referencia (foto/firma), jamás data:/blob:.
 * - GD: coherencia rol↔ficha (sin directiva se depura datosGobernanza) y
 *   herencia del período vigente cuando la ficha no lo declara.
 * - PE: FKs laborales contra los maestros legales de MA.
 * - MP: RUT y email únicos por comunidad (409).
 * - ABAC residente: en colección GET ve únicamente su propia ficha.
 * - PE-visitas: `?rut=` resuelve la identidad leída del QR de la cédula
 *   (match exacto sobre las grafías normalizadas del RUN).
 * - Directorio de residentes: `?esResidente=1` filtra a las personas con vínculo
 *   vigente (`fechaFin` null) como propietario o arrendatario, y agrega al envelope
 *   `vinculosVigentes` con esos vínculos de las personas de la página. La regla vive
 *   acá porque el padrón se pagina: filtrar una página en el cliente esconde gente.
 * - Filtros aditivos de los directorios (opcionales, sin parámetros nuevos no cambia nada):
 *   `?rol=` (roles propios de `Persona.roles`), `?rolDirectorio=` (roles derivados del
 *   Directorio de Gestión Administrativa: propietario/residente/directiva/personal) y
 *   `?estadoCuenta=` (`activa|inactiva|bloqueada`). Se intersectan entre sí, con `q`/`rut`/
 *   `esResidente` y con el ABAC: siempre suman condiciones a `where.AND`, nunca reemplazan el
 *   `where` de permisos.
 */
import { PersonaSchema, ROLES_PERSONA } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { variantesRun } from "@/lib/validacion-rut"
import {
  emailCanonico,
  MENSAJE_EMAIL_DUPLICADO,
  MENSAJE_RUT_DUPLICADO,
  personaConEmailDuplicado,
  personaConRutDuplicado,
} from "@/lib/invariantes/persona"
import { randomUUID } from "node:crypto"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"

/** Campos persistibles de Persona (lista blanca: descarta id, comunidadId,
 * vinculosUnidad —no es campo de BD— y cualquier clave ajena). */
const CAMPOS_PERSONA = [
  "rut",
  "nombreCompleto",
  "nombres",
  "apellidos",
  "email",
  "telefonoMovil",
  "telefonoFijo",
  "fotografiaUrl",
  "estadoCuenta",
  "condicionesEspecialesIds",
  "roles",
  "datosLaborales",
  "datosGobernanza",
  "permiteCreacionManualCV",
] as const

export function limpiarPayloadPersona(datos: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const campo of CAMPOS_PERSONA) {
    if (campo in datos) salida[campo] = datos[campo]
  }
  // INV-01: el email se persiste SIEMPRE en forma canónica (minúsculas, sin
  // espacios). Se normaliza acá —y no sólo en la validación— porque el PUT de
  // `/api/personas/[id]` escribe `limpiarPayloadPersona(parcial.data)` y no el
  // payload validado: sin esto la comparación exacta de la regla se rompe.
  if (typeof salida.email === "string") salida.email = emailCanonico(salida.email)
  return salida
}

/** personaId (MP) asociado al usuario de la sesión, o null. */
export async function personaIdDelUsuario(usuarioId: string): Promise<string | null> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { personaId: true },
  })
  return usuario?.personaId ?? null
}

type DelegateBusqueda = {
  findFirst(args: { where: Record<string, unknown> }): Promise<unknown>
}

/** Mapeo error Prisma → HTTP (misma semántica que crud-factory). */
export function errorGenerico(e: unknown): Response {
  if (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2025"
  ) {
    return jsonError(404, "Registro no encontrado.")
  }
  logger.error({ err: e }, "[api/personas] error inesperado")
  return jsonError(500, "Error interno del servidor.")
}

export type ValidacionPersona =
  | { ok: true; datos: Record<string, unknown> }
  | { ok: false; response: Response }

/**
 * Validaciones de negocio sobre datos ya validados por PersonaSchema
 * (completo en POST, mergeado con el registro existente en PUT).
 * Muta `datos` (strip/inject de gobernanza) y devuelve el payload limpio.
 */
export async function validarYLimpiarPersona(
  datos: Record<string, unknown>,
  scope: ComunidadScope,
  idParaExcluir?: string
): Promise<ValidacionPersona> {
  const comunidadId = scope.comunidadId

  // AD (D1): foto y firma digitalizada solo por referencia; jamás base64/Blob.
  // P2 E2E-FULL-VERDE: null de BD equivale a ausente (filas Prisma traen null
  // en opcionales; sin esto el PUT de firma revienta con TypeError → 500).
  const esReferenciaValida = (valor?: string | null): boolean =>
    valor == null ||
    (!/^data:/i.test(valor) &&
      !/^blob:/i.test(valor) &&
      valor.length <= 2048)
  if (!esReferenciaValida(datos.fotografiaUrl as string | undefined)) {
    return {
      ok: false,
      response: jsonError(
        400,
        "Media por referencia (D1): la fotografía debe ser una URL, no contenido embebido."
      ),
    }
  }
  const firma = (datos.datosGobernanza as Record<string, unknown> | undefined | null)?.firmaDigital
  if (!esReferenciaValida(firma as string | undefined)) {
    return {
      ok: false,
      response: jsonError(
        400,
        "Media por referencia (D1): la firma digitalizada debe ser una URL, no contenido embebido."
      ),
    }
  }

  // GD: coherencia rol↔ficha — sin rol directiva no hay miembro vigente.
  const roles = Array.isArray(datos.roles) ? (datos.roles as string[]) : []
  if (!roles.includes("directiva") && datos.datosGobernanza) {
    delete datos.datosGobernanza
  } else if (
    roles.includes("directiva") &&
    datos.datosGobernanza &&
    !(datos.datosGobernanza as Record<string, unknown>).periodoId
  ) {
    // GD-períodos: la ficha sin período hereda el vigente (alta espejo del libro).
    const vigente = await prisma.periodoDirectiva.findFirst({
      where: { comunidadId, estado: "vigente" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    })
    if (vigente) {
      datos.datosGobernanza = {
        ...(datos.datosGobernanza as Record<string, unknown>),
        periodoId: vigente.id,
      }
    }
  }

  // PE: FKs de la ficha laboral contra los maestros legales de MA (RG escritura).
  const dl = datos.datosLaborales as Record<string, unknown> | undefined | null

  // F18 — sólo la FICHA MÉDICA exige consentimiento expreso vigente.
  //
  // Decisión del owner (2026-10-27): el consentimiento cubre **sólo la ficha
  // médica** (medicamentos, alergias, condiciones). Todo el resto de la ficha
  // laboral —previsión de salud incluida, sin la cual no se generan
  // liquidaciones— se guarda siempre.
  if (dl && typeof dl === "object") {
    const consentimiento = (dl as Record<string, unknown>).consentimientoDatosSensibles as
      | { otorgado?: unknown }
      | undefined
    if (consentimiento?.otorgado !== true) {
      for (const campo of ["fichaMedica"]) {
        delete (dl as Record<string, unknown>)[campo]
      }
    }
  }

  if (dl && typeof dl === "object") {
    const fks: [string, DelegateBusqueda][] = [
      ["afpId", prisma.afp],
      ["saludId", prisma.previsionSalud],
      ["asignacionFamiliarId", prisma.asignacionFamiliar],
      ["mutualidadId", prisma.mutualCaja],
      ["bancoId", prisma.banco],
    ]
    for (const [campo, modelo] of fks) {
      const valor = dl[campo]
      if (typeof valor === "string" && valor.length > 0) {
        const existe = await modelo.findFirst({ where: { comunidadId, id: valor } })
        if (!existe) {
          return {
            ok: false,
            response: jsonError(
              400,
              `${campo} no existe en el maestro correspondiente.`
            ),
          }
        }
      }
    }
  }

  // MP: condicionesEspecialesIds subset de los maestros MA de la comunidad.
  const conds = Array.isArray(datos.condicionesEspecialesIds)
    ? (datos.condicionesEspecialesIds as string[])
    : []
  if (conds.length > 0) {
    const validas = await prisma.condicionEspecial.findMany({
      where: { comunidadId },
      select: { id: true },
    })
    const ids = new Set(validas.map((c) => c.id))
    for (const cid of conds) {
      if (!ids.has(cid)) {
        return {
          ok: false,
          response: jsonError(400, `condicionEspecial ${cid} no existe.`),
        }
      }
    }
  }

  // INV-01 (docs/INVARIANTES.md): RUT y email únicos por comunidad, repetibles
  // entre comunidades. La regla vive en `lib/invariantes/persona.ts` para que
  // toda ruta que escriba `Persona` la aplique igual; acá solo se decide el 409.
  // El email se normaliza ANTES de validar y de persistir: sin eso la
  // comparación exacta deja pasar `Juan@X.cl` y `juan@x.cl` como dos fichas.
  if (typeof datos.email === "string" && datos.email) {
    datos.email = emailCanonico(datos.email)
  }
  const excluirId = idParaExcluir ?? (typeof datos.id === "string" ? datos.id : "")
  if (typeof datos.rut === "string" && datos.rut) {
    if (await personaConRutDuplicado(comunidadId, datos.rut, excluirId || undefined)) {
      return { ok: false, response: jsonError(409, MENSAJE_RUT_DUPLICADO) }
    }
  }
  if (typeof datos.email === "string" && datos.email) {
    if (
      await personaConEmailDuplicado(comunidadId, datos.email, excluirId || undefined)
    ) {
      return { ok: false, response: jsonError(409, MENSAJE_EMAIL_DUPLICADO) }
    }
  }

  return { ok: true, datos }
}

/** Fila mínima (Prisma/dominio) para decidir la poda de gobernanza. */
type FilaGobernanza = {
  id: string
  nombreCompleto: string
  roles: unknown
  datosGobernanza: unknown
}

/**
 * AD: audita la poda efectiva de la ficha de gobernanza
 * (`AD_DIRECTIVA_DESVINCULADA`). Se invoca DESPUÉS de la escritura, con la fila
 * persistida: solo emite si la fila anterior tenía ficha y la persistida ya no
 * la tiene con `roles` sin `directiva`. Así no se audita una poda que la
 * escritura no llegó a persistir, y una misma request que toca el helper de
 * validación y el epílogo del PUT emite un único evento.
 *
 * Patrón server-side (no `registrarEvento` de zustand, client-only): la
 * auditoría nunca bloquea la respuesta de la ruta — espejo de
 * `app/api/mis-datos/route.ts`.
 */
export async function auditarPodaGobernanza(
  scope: ComunidadScope,
  anterior: FilaGobernanza | null,
  actual: FilaGobernanza
): Promise<void> {
  if (anterior?.datosGobernanza == null || actual.datosGobernanza != null) return
  const roles = Array.isArray(actual.roles) ? (actual.roles as string[]) : []
  if (roles.includes("directiva")) return

  try {
    await registrarEventoAuditoria({
      id: randomUUID(),
      comunidadId: scope.comunidadId,
      timestamp: new Date().toISOString(),
      usuario: scope.usuarioId,
      categoria: "AD",
      tipoAccion: "AD_DIRECTIVA_DESVINCULADA",
      referenciaId: actual.id,
      descripcion: `Ficha de gobernanza depurada de ${actual.nombreCompleto}: rol directiva removido.`,
    })
  } catch (e) {
    // intencional: la auditoría nunca bloquea la escritura (patrón mis-datos).
    logger.error({ err: e }, "[api/personas] fallo al auditar la poda de gobernanza")
  }
}

function denegar(rol: string, accion: "ver" | "crear" | "editar" | "eliminar"): Response | null {
  if (puede(rol, accion, "mp")) return null
  return jsonError(403, "Permiso denegado.")
}

/** Roles de vínculo que hacen «residente» a una persona (regla del directorio). */
const ROLES_RESIDENTE = ["propietario", "arrendatario"] as const

/** Estados de cuenta que persiste `Persona.estadoCuenta` (MP). */
const ESTADOS_CUENTA = ["activa", "inactiva", "bloqueada"] as const

/** Roles derivados del Directorio de Gestión Administrativa (`?rolDirectorio=`). */
const ROLES_DIRECTORIO = ["propietario", "residente", "directiva", "personal"] as const

/**
 * Valores de un query param en CSV (`?rol=propietario,residente`): recortados, sin
 * vacíos y sin repetidos. Ausente o vacío → lista vacía, que significa «no filtrar»:
 * así los parámetros son aditivos y ningún caller de antes cambia de resultado.
 */
function valoresCsv(valor: string | null): string[] {
  if (!valor) return []
  return [...new Set(valor.split(",").map((v) => v.trim()).filter(Boolean))]
}

/**
 * Ids de las personas que tienen al menos uno de los `roles` pedidos en `Persona.roles`
 * (`?rol=`).
 *
 * El conjunto se resuelve con una proyección mínima de la comunidad y se intersecta con
 * `where.AND` (mismo patrón que `vinculosDeResidentes`): la regla se resuelve sobre la
 * colección completa, nunca sobre una página. Prisma no filtra arrays Json en SQLite
 * (`array_contains` es exclusivo de PostgreSQL y la ruta corre sobre las dos bases), así
 * que la pertenencia se evalúa en el servidor, no en el cliente.
 */
async function idsPorRol(comunidadId: string, roles: readonly string[]): Promise<string[]> {
  const filas = await prisma.persona.findMany({
    where: { comunidadId },
    select: { id: true, roles: true },
  })
  return filas
    .filter((fila) => {
      const propios = Array.isArray(fila.roles) ? (fila.roles as string[]) : []
      return propios.some((rol) => roles.includes(rol))
    })
    .map((fila) => fila.id)
}

/** Fila mínima para evaluar los roles derivados del directorio administrativo. */
type FilaRolesDirectorio = {
  id: string
  roles: unknown
  datosGobernanza: unknown
  datosLaborales: unknown
}

/**
 * Ids de las personas que cumplen al menos uno de los roles DERIVADOS del Directorio de
 * Gestión Administrativa (`?rolDirectorio=`).
 *
 * Es espejo exacto de `rolesDe` de `app/admin/gestion/page.tsx` (y de
 * `api-personas-falsa.ts` en los tests):
 * - propietario: rol propio, o cualquier vínculo de rol propietario (vigente o cerrado);
 * - residente: arrendatario con vínculo vigente, o rol residente sin rol propietario;
 * - directiva: ficha de gobernanza presente;
 * - personal: ficha laboral presente.
 *
 * El filtro vive en el servidor por el mismo motivo que `esResidente`: la pantalla pagina,
 * y filtrar una página esconde gente. Igual que `idsPorRol`, solo aporta un conjunto de ids
 * que se intersecta en `where.AND`; nunca reemplaza el alcance de permisos.
 */
async function idsPorRolDirectorio(
  comunidadId: string,
  roles: readonly string[]
): Promise<string[]> {
  const [filas, vinculos] = await Promise.all([
    prisma.persona.findMany({
      where: { comunidadId },
      select: { id: true, roles: true, datosGobernanza: true, datosLaborales: true },
    }),
    prisma.vinculoUnidad.findMany({
      where: { comunidadId },
      select: { personaId: true, rol: true, fechaFin: true },
    }),
  ])

  const propietarioPorVinculo = new Set(
    vinculos.filter((v) => v.rol === "propietario").map((v) => v.personaId)
  )
  const arrendatarioVigente = new Set(
    vinculos
      .filter((v) => v.rol === "arrendatario" && v.fechaFin === null)
      .map((v) => v.personaId)
  )

  const derivadosDe = (fila: FilaRolesDirectorio): Set<string> => {
    const propios = Array.isArray(fila.roles) ? (fila.roles as string[]) : []
    const derivados = new Set<string>()
    if (propios.includes("propietario") || propietarioPorVinculo.has(fila.id)) {
      derivados.add("propietario")
    }
    if (
      arrendatarioVigente.has(fila.id) ||
      (propios.includes("residente") && !propios.includes("propietario"))
    ) {
      derivados.add("residente")
    }
    if (fila.datosGobernanza != null) derivados.add("directiva")
    if (fila.datosLaborales != null) derivados.add("personal")
    return derivados
  }

  return filas
    .filter((fila) => {
      const derivados = derivadosDe(fila)
      return roles.some((rol) => derivados.has(rol))
    })
    .map((fila) => fila.id)
}

/** Vínculo vigente que el directorio de residentes necesita para su columna «Unidad vinculada». */
export interface VinculoVigenteResidente {
  id: string
  personaId: string
  unidadId: string
  rol: string
  /** Etiqueta legible de la unidad (`etiqueta numero`), resuelta en el servidor. */
  unidadEtiqueta: string | null
}

/**
 * Vínculos vigentes (`fechaFin` null) de rol propietario/arrendatario de la comunidad.
 *
 * `VinculoUnidad` no declara relación Prisma con `Persona` (solo `personaId` indexado), así que
 * el directorio no puede usar un `some` de relación: el filtro se resuelve con la lista cerrada
 * de `personaId`. Se calcula sobre TODOS los vínculos de la comunidad y nunca sobre una página:
 * filtrar en el cliente una página truncada esconde residentes que sí existen.
 *
 * La etiqueta de la unidad también se resuelve acá: el padrón de unidades pagina en 100 (de 184)
 * y el directorio mostraría ids crudos en la mitad de sus filas.
 */
async function vinculosDeResidentes(
  comunidadId: string
): Promise<VinculoVigenteResidente[]> {
  const filas = await prisma.vinculoUnidad.findMany({
    where: { comunidadId, fechaFin: null, rol: { in: [...ROLES_RESIDENTE] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, personaId: true, unidadId: true, rol: true },
  })
  if (filas.length === 0) return []

  const unidades = await prisma.unidad.findMany({
    where: { comunidadId, id: { in: [...new Set(filas.map((f) => f.unidadId))] } },
    select: { id: true, etiqueta: true, numero: true },
  })
  const etiquetas = new Map(unidades.map((u) => [u.id, `${u.etiqueta} ${u.numero}`]))
  return filas.map((f) => ({ ...f, unidadEtiqueta: etiquetas.get(f.unidadId) ?? null }))
}

/** GET lista paginada, filtrable por ?q= (nombreCompleto | rut | email).
 * Residente: ve únicamente su propia ficha (ABAC mp:propios).
 * `?esResidente=1` agrega el filtro de residente y `vinculosVigentes` al envelope.
 * `?rol=`, `?rolDirectorio=` y `?estadoCuenta=` son filtros aditivos de los directorios. */
export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope
  const residente = scope.rol === "residente"
  if (!residente && !puede(scope.rol, "ver", "mp")) {
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
  const q = url.searchParams.get("q")?.trim()
  const rut = url.searchParams.get("rut")?.trim()
  const esResidente = url.searchParams.get("esResidente") === "1"
  // Filtros aditivos: ausentes (o vacíos) no cambian nada del comportamiento de siempre.
  const roles = valoresCsv(url.searchParams.get("rol"))
  const rolesDirectorio = valoresCsv(url.searchParams.get("rolDirectorio"))
  const estadosCuenta = valoresCsv(url.searchParams.get("estadoCuenta"))

  const where: Record<string, unknown> = { comunidadId: scope.comunidadId }
  if (residente) {
    const personaId = await personaIdDelUsuario(scope.usuarioId)
    where.id = personaId ?? "__sin_persona__"
  }
  if (q) {
    where.OR = [
      { nombreCompleto: { contains: q } },
      { rut: { contains: q } },
      { email: { contains: q } },
    ]
  }
  if (rut) {
    // Filtro exacto por RUT (PE-visitas): el mismo RUN puede estar guardado con
    // puntos o sin ellos, así que se buscan todas sus grafías canónicas. El
    // alcance sigue siendo el del scope: nunca se consulta otra comunidad.
    const variantes = variantesRun(rut)
    if (variantes.length === 0) {
      return jsonError(400, "El RUT informado no es válido.")
    }
    where.rut = { in: variantes }
  }

  // Validación DESPUÉS del RUT para no cambiar el 400 que ya existía: un RUT inválido
  // sigue siendo el primer error de la petición. Un valor desconocido en los filtros
  // nuevos devuelve 400 en vez de una lista vacía que parezca «no hay nadie».
  if (roles.some((rol) => !(ROLES_PERSONA as readonly string[]).includes(rol))) {
    return jsonError(400, "El rol informado no es válido.")
  }
  if (rolesDirectorio.some((rol) => !(ROLES_DIRECTORIO as readonly string[]).includes(rol))) {
    return jsonError(400, "El rol de directorio informado no es válido.")
  }
  if (estadosCuenta.some((estado) => !(ESTADOS_CUENTA as readonly string[]).includes(estado))) {
    return jsonError(400, "El estado de cuenta informado no es válido.")
  }

  try {
    // Filtros de los directorios: cada uno aporta una condición más a `AND`, así se
    // intersectan entre sí y con el `where` que ya fijaron el scope y el ABAC del
    // residente. Nunca se reemplaza el `where` de permisos.
    const condiciones: Record<string, unknown>[] = []
    if (roles.length > 0) {
      condiciones.push({ id: { in: await idsPorRol(scope.comunidadId, roles) } })
    }
    if (rolesDirectorio.length > 0) {
      condiciones.push({
        id: { in: await idsPorRolDirectorio(scope.comunidadId, rolesDirectorio) },
      })
    }
    if (estadosCuenta.length > 0) {
      condiciones.push({ estadoCuenta: { in: estadosCuenta } })
    }

    // Directorio de residentes: la regla se resuelve sobre los vínculos de la
    // comunidad completa, no sobre una página. Va en `AND` y no en `where.id`
    // para no pisar el id que ya fijó el ABAC del residente.
    const vinculosResidentes = esResidente
      ? await vinculosDeResidentes(scope.comunidadId)
      : null
    if (vinculosResidentes) {
      const ids = [...new Set(vinculosResidentes.map((v) => v.personaId))]
      condiciones.push({ id: { in: ids } })
    }
    if (condiciones.length > 0) where.AND = condiciones

    const [data, total] = await Promise.all([
      prisma.persona.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.persona.count({ where }),
    ])
    // Envelope backward compatible: `data/page/pageSize/total` siguen igual; la
    // clave nueva aparece SOLO cuando se pide `esResidente=1`.
    const respuesta: Record<string, unknown> = { data, page, pageSize, total }
    if (vinculosResidentes) {
      const idsDeLaPagina = new Set(data.map((p) => p.id))
      respuesta.vinculosVigentes = vinculosResidentes.filter((v) =>
        idsDeLaPagina.has(v.personaId)
      )
    }
    return Response.json(respuesta)
  } catch (e) {
    return errorGenerico(e)
  }
}

/** POST upsert idempotente por id (la fuente de verdad gana, no el orden). */
export async function POST(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  const body: unknown = await req.json().catch(() => null)
  if (body === null) return jsonError(400, "Cuerpo JSON inválido.")

  const parsed = PersonaSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", { detalles: parsed.error.flatten() })
  }
  const id = parsed.data.id

  try {
    const existente = await prisma.persona.findUnique({ where: { id } })
    // Upsert sobre un registro de OTRA comunidad → 404 (sin filtrar existencia)
    if (existente && existente.comunidadId !== scope.comunidadId) {
      return jsonError(404, "Registro no encontrado.")
    }
    const denegado = denegar(scope.rol, existente ? "editar" : "crear")
    if (denegado) return denegado

    const validado = await validarYLimpiarPersona(
      // SAFETY: parsed.data ya pasó PersonaSchema; el helper opera sobre un
      // Record genérico y no conoce el tipo Zod (solo lee/escribe claves).
      parsed.data as unknown as Record<string, unknown>,
      scope,
      id
    )
    if (!validado.ok) return validado.response

    const datos = limpiarPayloadPersona(validado.datos)
    // GD: mismo criterio que el PUT. En el alta el helper ya descarta la ficha
    // entrante sin rol `directiva` (poda silenciosa, espejo del store legacy);
    // en el upsert sobre una fila existente hay que fijar la columna en null,
    // porque si no Prisma la salta y la ficha vieja sobrevive como fantasma.
    const roles = Array.isArray(validado.datos.roles) ? (validado.datos.roles as string[]) : []
    if (!roles.includes("directiva") && existente?.datosGobernanza != null) {
      datos.datosGobernanza = null
    }

    const record = await prisma.persona.upsert({
      where: { id },
      create: {
        ...datos,
        id,
        comunidadId: scope.comunidadId,
      } as never,
      update: datos as never,
    })
    // AD: la poda efectiva se audita recién cuando la escritura quedó
    // persistida (en el alta no hay ficha anterior, así que no emite).
    await auditarPodaGobernanza(scope, existente, record)
    return Response.json(record, { status: existente ? 200 : 201 })
  } catch (e) {
    return errorGenerico(e)
  }
}
