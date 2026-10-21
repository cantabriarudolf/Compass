/**
 * _acciones.ts — utilidades compartidas de las acciones IR sobre solicitudes de
 * insumo (entregar y resolver comodín).
 *
 * Módulo co-locado (no es una ruta de Next): resuelve el scope de comunidad y
 * el permiso `editar` sobre "ir:mantenimiento" — el MISMO recurso que ya usan
 * las rutas IR desplegadas (`/api/ir/recursos`, `/api/ir/solicitudes-insumo`) —
 * carga la solicitud scoped, deriva el código de inventario `IR-A-####`
 * correlativo y emite eventos de auditoría con el mismo shape que
 * `registrarEvento` del store legacy.
 *
 * Decisión owner 2026-10-21 ("se están pasando insumos básicos, no es controlar
 * el stock de uranio"): entregar descuenta stock en la MISMA acción, sin
 * segunda aprobación; el comodín se resuelve en un click.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
} from "@/lib/api/with-comunidad-scope"

/** Recurso RBAC de las acciones IR (el mismo de las rutas IR desplegadas). */
export const RECURSO_IR = "ir:mantenimiento"

export type ContextoAccionIR =
  | { ok: true; scope: ComunidadScope }
  | { ok: false; response: Response }

/**
 * Error de negocio con status HTTP: cada route lo traduce a `jsonError` y, si se
 * lanza dentro de `$transaction`, Prisma revierte la transacción completa (así
 * el descuento de stock y el cambio de estado son atómicos de verdad).
 */
export class RechazoIR extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = "RechazoIR"
  }
}

/**
 * Cliente Prisma mínimo de las acciones IR: el cliente normal o el `tx` de
 * `prisma.$transaction`. Mantiene los helpers reusables dentro y fuera de una
 * transacción sin acoplarse al tipo completo.
 */
export type ClienteIR = Pick<
  typeof prisma,
  "solicitudInsumoIR" | "recursoIR" | "eventoAuditoria"
>

/**
 * Contexto server-side de una acción IR: sesión + membresía + `editar` sobre
 * "ir:mantenimiento" (hoy solo el administrador; ver REPORTE de la ventana).
 */
export async function contextoAccionIR(): Promise<ContextoAccionIR> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado
  if (!puede(resultado.scope.rol, "editar", RECURSO_IR)) {
    return { ok: false, response: jsonError(403, "Permiso denegado.") }
  }
  return { ok: true, scope: resultado.scope }
}

/**
 * Carga la solicitud por id y exige que pertenezca a la comunidad del scope.
 * Devuelve `null` tanto si no existe como si es de otra comunidad: el route
 * responde 404 sin filtrar existencia (mismo contrato que el resto de la API).
 */
export async function cargarSolicitudInsumo(
  id: string,
  scope: ComunidadScope,
  client: ClienteIR = prisma
) {
  const solicitud = await client.solicitudInsumoIR.findUnique({ where: { id } })
  if (!solicitud || solicitud.comunidadId !== scope.comunidadId) return null
  return solicitud
}

/** Carga un recurso/insumo por id y exige que pertenezca a la comunidad del scope. */
export async function cargarRecursoIR(
  id: string,
  scope: ComunidadScope,
  client: ClienteIR = prisma
) {
  const recurso = await client.recursoIR.findUnique({ where: { id } })
  if (!recurso || recurso.comunidadId !== scope.comunidadId) return null
  return recurso
}

/** Emite UN evento de auditoría IR (con `client` se integra a la transacción). */
export function registrarEventoIR(
  scope: ComunidadScope,
  tipoAccion: string,
  referenciaId: string,
  descripcion: string,
  client: Pick<typeof prisma, "eventoAuditoria"> = prisma
): Promise<unknown> {
  return client.eventoAuditoria.create({
    data: {
      id: generarId("ev"),
      comunidadId: scope.comunidadId,
      timestamp: new Date().toISOString(),
      usuario: scope.usuarioId,
      categoria: "IR",
      tipoAccion,
      referenciaId,
      descripcion,
    },
  })
}

/**
 * Alarma de reposición (`IR_STOCK_LOW`) SOLO en la transición real: el stock
 * previo estaba sobre el umbral y el nuevo quedó en o bajo él. Re-guardar una
 * entrega sobre un insumo ya bajo el umbral no repite el evento (paridad
 * `entregarSolicitudInsumoIR` del store).
 */
export async function registrarAlarmaStockBajo(
  scope: ComunidadScope,
  recurso: {
    id: string
    nombre: string
    esCritico: boolean
    umbralCritico: number | null
  },
  stockPrevio: number,
  stockNuevo: number,
  client: Pick<typeof prisma, "eventoAuditoria"> = prisma
): Promise<void> {
  const umbral = recurso.umbralCritico
  if (!recurso.esCritico || umbral === null) return
  if (stockNuevo > umbral || stockPrevio <= umbral) return
  await registrarEventoIR(
    scope,
    "IR_STOCK_LOW",
    recurso.id,
    `Alarma de reposición: ${recurso.nombre} llegó a ${stockNuevo} (umbral ${umbral}).`,
    client
  )
}

/**
 * Siguiente código de inventario `IR-A-####` correlativo dentro de la
 * comunidad (espejo de `siguienteCodigoIR` del store legacy, que opera sobre la
 * colección hidratada).
 */
export async function siguienteCodigoIR(
  comunidadId: string,
  client: ClienteIR = prisma
): Promise<string> {
  const recursos = await client.recursoIR.findMany({
    where: { comunidadId },
    select: { codigo: true },
  })
  const numeros = recursos
    .map((r) => Number.parseInt((r.codigo ?? "").replace(/^IR-A-/, ""), 10))
    .filter((n) => Number.isFinite(n))
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
  return `IR-A-${String(siguiente).padStart(4, "0")}`
}
