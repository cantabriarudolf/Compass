/**
 * /api/pe/bitacora-visitas — bitácora de visitas PE (BD-FUENTE-VERDAD Fase 4).
 *
 * GET paginado vía factory (paginación obligatoria: alta frecuencia de
 * registros). POST upsert idempotente por id. Authz sobre el recurso "pe"
 * (conserjería + administrador operan; admin elimina).
 *
 * Auditoría (T1c): el store legacy emitía `PE_VISITA_INGRESADA` al guardar una
 * visita que queda `ingresada`; la factory conserva el evento vía el hook
 * post-escritura con el mismo texto. En POST no se mira el `previo` (el store
 * emitía en cada save), solo el estado final de la fila.
 */
import { BitacoraVisitaPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { createCrudHandlers, delegado } from "@/lib/api/crud-factory"
import { registrarEventoPE } from "@/app/api/pe/_acciones"

interface FilaVisita {
  id: string
  nombre: string
  origenAgenda: string
  estado: string
  horaIngreso?: string | null
}

/** Texto exacto del store legacy (`lib/store.ts` saveBitacoraVisitaPE). */
async function emitirVisitaIngresada(
  fila: FilaVisita,
  scope: Parameters<typeof registrarEventoPE>[0]
): Promise<void> {
  if (fila.estado !== "ingresada") return
  const hora = fila.horaIngreso ?? new Date().toTimeString().slice(0, 5)
  await registrarEventoPE(
    scope,
    "PE_VISITA_INGRESADA",
    fila.id,
    `Visita ${fila.nombre} ingresada (${fila.origenAgenda === "pre_agendada" ? "agendada" : "sin aviso"}) a las ${hora}.`
  )
}

const handlers = createCrudHandlers({
  model: delegado(prisma.bitacoraVisitaPE),
  schema: BitacoraVisitaPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe"),
  despuesDeEscribir: async ({ registro, scope }) => {
    await emitirVisitaIngresada(registro as FilaVisita, scope)
  },
})

export const GET = handlers.GET
export const POST = handlers.POST
