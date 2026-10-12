/**
 * _acciones.ts — utilidades compartidas de las acciones RA sobre reservas.
 *
 * Módulo co-locado (no es una ruta de Next): resuelve el scope de comunidad y
 * el permiso "ra", carga la reserva scoped, resuelve el cobro al Fondo de
 * Amenities (folio `RA-####` correlativo, fondo activo y unidad de cobro),
 * materializa de forma idempotente por procedencia y emite eventos de auditoría
 * con el mismo shape que `registrarEvento` del store legacy.
 *
 * Reglas espejo de `lib/store.ts` (`saveReservaRA`, `cancelarReservaRA`,
 * `retenerGarantiaRA`): la tarifa/garantía se snapshotean del elemento al alta,
 * el cobro sólo se materializa si hay fondo de amenities activo y unidad de
 * cobro, y el cargo vive en FI con `origenModulo: "RA"` + `origenRef` = id de
 * la reserva.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import { CobroFISchema } from "@/lib/schemas"
import { jsonError, withComunidadScope, type ComunidadScope } from "@/lib/api/with-comunidad-scope"

/** Conceptos FI de RA (los mismos tres del store). */
export type ConceptoRA = "reserva_ra" | "penalizacion_ra" | "garantia_ra"

export type ContextoAccionRA =
  | { ok: true; scope: ComunidadScope }
  | { ok: false; response: Response }

/** Error de negocio con status HTTP: cada route lo traduce a `jsonError`. */
export class RechazoRA extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>
  ) {
    super(message)
    this.name = "RechazoRA"
  }
}

/**
 * Cliente Prisma mínimo usado por las acciones RA: el cliente normal o el `tx`
 * de `prisma.$transaction`. Mantiene los helpers reusables dentro y fuera de
 * una transacción sin acoplarse al tipo completo.
 */
export type ClienteRA = Pick<
  typeof prisma,
  "reservaRA" | "elementoRA" | "cobroFI" | "fondoFI" | "vinculoUnidad" | "persona" | "eventoAuditoria"
>

/** Contexto server-side de una acción RA: sesión + membresía + permiso de edición. */
export async function contextoAccionRA(): Promise<ContextoAccionRA> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado
  if (!puede(resultado.scope.rol, "editar", "ra")) {
    return { ok: false, response: jsonError(403, "Permiso denegado.") }
  }
  return { ok: true, scope: resultado.scope }
}

/** Lee el body JSON como objeto plano; `null` si no es JSON parseable. */
export async function leerCuerpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json()
    if (typeof body !== "object" || body === null || Array.isArray(body)) return {}
    return body as Record<string, unknown>
  } catch {
    return null
  }
}

/** Carga la reserva por id y exige que pertenezca a la comunidad del scope. */
export async function cargarReserva(
  id: string,
  scope: ComunidadScope,
  client: ClienteRA = prisma
) {
  const reserva = await client.reservaRA.findUnique({ where: { id } })
  if (!reserva || reserva.comunidadId !== scope.comunidadId) return null
  return reserva
}

/** Emite UN evento de auditoría RA (con `client` se integra a la transacción). */
export function registrarEventoRA(
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
      categoria: "RA",
      tipoAccion,
      referenciaId,
      descripcion,
    },
  })
}

/** Siguiente folio `RA-####` correlativo dentro de la comunidad (espejo `siguienteFolioRA`). */
export async function siguienteFolioRA(
  comunidadId: string,
  client: ClienteRA = prisma
): Promise<string> {
  const reservas = await client.reservaRA.findMany({
    where: { comunidadId },
    select: { folio: true },
  })
  const numeros = reservas
    .map((r) => Number.parseInt(r.folio.replace(/^RA-/, ""), 10))
    .filter((n) => Number.isFinite(n))
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
  return `RA-${String(siguiente).padStart(4, "0")}`
}

/** Fondo de amenities activo de la comunidad (espejo `fondosFI.find(amenities && activo)`). */
export function fondoAmenities(comunidadId: string, client: ClienteRA = prisma) {
  return client.fondoFI.findFirst({
    where: { comunidadId, tipo: "amenities", activo: true },
    orderBy: { id: "asc" },
  })
}

/**
 * Unidad a la que se imputa el cobro: la de la reserva y, si falta, la del
 * vínculo vigente del solicitante (mismo fallback del store).
 */
export async function unidadDeCobro(
  reserva: { unidadId: string | null; solicitantePersonaId: string },
  comunidadId: string,
  client: ClienteRA = prisma
): Promise<string | null> {
  if (reserva.unidadId) return reserva.unidadId
  const vinculo = await client.vinculoUnidad.findFirst({
    where: { comunidadId, personaId: reserva.solicitantePersonaId, fechaFin: null },
    orderBy: { id: "asc" },
  })
  return vinculo?.unidadId ?? null
}

/** Cobro FI candidato de RA (sin id): `construirCobro` lo valida contra el schema. */
export interface CandidatoCobroRA {
  unidadId: string
  concepto: ConceptoRA
  origenRef: string
  fondoId: string
  descripcion: string
  montoBase: number
  fechaCargo: string
  fechaVencimiento?: string
}

/**
 * Construye el cobro FI de RA con la forma exacta del store (mismo periodo
 * mensual, mismo `origenModulo`, arrays vacíos de moras/pagos/diferencias) y lo
 * valida con `CobroFISchema` antes de tocar la BD.
 */
export function construirCobro(c: CandidatoCobroRA): Record<string, unknown> {
  const candidato = {
    id: generarId("cob"),
    unidadId: c.unidadId,
    periodo: c.fechaCargo.slice(0, 7),
    concepto: c.concepto,
    origenModulo: "RA",
    origenRef: c.origenRef,
    fondoId: c.fondoId,
    descripcion: c.descripcion,
    montoBase: c.montoBase,
    fechaCargo: c.fechaCargo,
    ...(c.fechaVencimiento ? { fechaVencimiento: c.fechaVencimiento } : {}),
    moras: [],
    pagos: [],
    diferencias: [],
  }
  const validacion = CobroFISchema.safeParse(candidato)
  if (!validacion.success) {
    throw new RechazoRA(400, "Datos inválidos.", {
      detalles: validacion.error.flatten(),
    })
  }
  // SAFETY: el candidato ya pasó CobroFISchema.safeParse; el cast sólo borra la
  // forma nominal del schema para reusar el objeto como data Prisma.
  return validacion.data as unknown as Record<string, unknown>
}

/**
 * Materializa el cobro de forma idempotente por procedencia: si ya existe un
 * cobro del mismo `origenRef` y `concepto` se reutiliza (nunca se crea el
 * segundo) — mismo guard que `aplicar` de IN. Debe invocarse DENTRO de la
 * transacción para que el chequeo y el insert sean atómicos.
 */
export async function materializarCobro(
  tx: ClienteRA,
  comunidadId: string,
  candidato: Record<string, unknown>
): Promise<{ id: string; reutilizado: boolean }> {
  const existente = await tx.cobroFI.findFirst({
    where: {
      comunidadId,
      origenModulo: "RA",
      origenRef: candidato.origenRef as string,
      concepto: candidato.concepto as string,
    },
    orderBy: { id: "asc" },
  })
  if (existente) return { id: existente.id, reutilizado: true }
  await tx.cobroFI.create({
    // SAFETY: candidato pasó CobroFISchema.safeParse en construirCobro.
    data: { ...candidato, comunidadId } as never,
  })
  return { id: candidato.id as string, reutilizado: false }
}

/** Nombre visible de la persona solicitante (espejo `nombrePersona` del store). */
export async function nombreSolicitante(
  personaId: string,
  client: ClienteRA = prisma
): Promise<string> {
  const persona = await client.persona.findUnique({ where: { id: personaId } })
  return persona ? `${persona.nombres} ${persona.apellidos}` : personaId
}
