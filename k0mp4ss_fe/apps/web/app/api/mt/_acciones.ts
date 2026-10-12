/**
 * _acciones.ts — utilidades compartidas de las acciones MT sobre trabajos y
 * proyectos.
 *
 * Módulo co-locado (no es una ruta de Next): resuelve el scope de comunidad y
 * el permiso "mt", carga el trabajo scoped, deriva el folio `MT-####`
 * correlativo, emite eventos de auditoría con el mismo shape que
 * `registrarEvento` del store legacy y calcula el saldo de un fondo FI con la
 * MISMA fórmula que usa `saveProyectoMT` del store.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import { saldoFondo } from "@/lib/finanzas-utils"
import type { PagoCobroFI } from "@/lib/schemas"
import {
  jsonError,
  withComunidadScope,
  type ComunidadScope,
  type ScopeResult,
} from "@/lib/api/with-comunidad-scope"

export type ContextoAccionMT =
  | { ok: true; scope: ComunidadScope }
  | { ok: false; response: Response }

/** Error de negocio con status HTTP: cada route lo traduce a `jsonError`. */
export class RechazoMT extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>
  ) {
    super(message)
    this.name = "RechazoMT"
  }
}

/**
 * Cliente Prisma mínimo usado por las acciones MT: el cliente normal o el `tx`
 * de `prisma.$transaction`. Mantiene los helpers reusables dentro y fuera de
 * una transacción sin acoplarse al tipo completo.
 */
export type ClienteMT = Pick<
  typeof prisma,
  "trabajoMT" | "proyectoMT" | "fondoFI" | "cobroFI" | "egresoFI" | "emisionGC" | "eventoAuditoria"
>

/** Contexto server-side de una acción MT: sesión + membresía + permiso indicado. */
export async function contextoAccionMT(
  accion: "ver" | "crear" | "editar" | "eliminar" | "ejecutar" = "editar"
): Promise<ContextoAccionMT> {
  const resultado: ScopeResult = await withComunidadScope()
  if (!resultado.ok) return resultado
  if (!puede(resultado.scope.rol, accion, "mt")) {
    return { ok: false, response: jsonError(403, "Permiso denegado.") }
  }
  return { ok: true, scope: resultado.scope }
}

/** Carga el trabajo por id y exige que pertenezca a la comunidad del scope. */
export async function cargarTrabajo(
  id: string,
  scope: ComunidadScope,
  client: ClienteMT = prisma
) {
  const trabajo = await client.trabajoMT.findUnique({ where: { id } })
  if (!trabajo || trabajo.comunidadId !== scope.comunidadId) return null
  return trabajo
}

/** Emite UN evento de auditoría MT (con `client` se integra a la transacción). */
export function registrarEventoMT(
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
      categoria: "MT",
      tipoAccion,
      referenciaId,
      descripcion,
    },
  })
}

/** Siguiente folio `MT-####` correlativo dentro de la comunidad (espejo `saveTrabajoMT`). */
export async function siguienteFolioMT(
  comunidadId: string,
  client: ClienteMT = prisma
): Promise<string> {
  const trabajos = await client.trabajoMT.findMany({
    where: { comunidadId },
    select: { folio: true },
  })
  const numeros = trabajos
    .map((t) => Number.parseInt(t.folio.replace(/^MT-/, ""), 10))
    .filter((n) => Number.isFinite(n))
  const siguiente = (numeros.length > 0 ? Math.max(...numeros) : 0) + 1
  return `MT-${String(siguiente).padStart(4, "0")}`
}

/**
 * Suma meses a una fecha ISO con el MISMO cálculo del store
 * (`new Date("YYYY-MM-DDT00:00:00")` + `setMonth`, incluido el desborde de fin
 * de mes), para que la próxima fecha del preventivo coincida en ambos mundos.
 */
export function sumarMesesISO(fechaISO: string, meses: number): string {
  const base = new Date(`${fechaISO}T00:00:00`)
  base.setMonth(base.getMonth() + meses)
  return base.toISOString().slice(0, 10)
}

/**
 * Saldo de un fondo FI con la MISMA fórmula que `saveProyectoMT` del store:
 * `saldoFondo(fondoId, { cobros, egresos, emisiones })` — Σ pagos de cobros del
 * fondo + aportes de emisiones al fondo de reserva − Σ egresos del fondo. El
 * store NO incluye `saldoInicial` ni ingresos manuales en este guard, así que
 * el espejo tampoco (ver `lib/store.ts` ~4830).
 */
export async function saldoFondoProyectoMT(
  fondoId: string,
  comunidadId: string,
  client: ClienteMT = prisma
): Promise<number> {
  const [cobros, egresos, emisiones] = await Promise.all([
    client.cobroFI.findMany({
      where: { comunidadId, fondoId },
      select: { fondoId: true, pagos: true },
    }),
    client.egresoFI.findMany({
      where: { comunidadId, fondoId },
      select: { fondoId: true, monto: true },
    }),
    client.emisionGC.findMany({
      where: { comunidadId },
      select: { fondoReservaAporte: true },
    }),
  ])
  return saldoFondo(fondoId, {
    cobros: cobros.map((c) => ({
      fondoId: c.fondoId,
      // SAFETY: pagos es Json con shape PagoCobroFI[] validado por CobroFISchema.
      pagos: (c.pagos ?? []) as unknown as PagoCobroFI[],
    })),
    egresos,
    // SAFETY: fondoReservaAporte es Json con shape AporteFondoReserva validado por EmisionGCSchema.
    emisiones: emisiones as unknown as { fondoReservaAporte?: { fondoId: string; monto: number } }[],
  })
}
