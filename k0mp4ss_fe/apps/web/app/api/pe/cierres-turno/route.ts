/**
 * /api/pe/cierres-turno — cierres de turno PE (Fase 4).
 *
 * GET paginado vía factory. POST upsert idempotente por id. Authz sobre el
 * recurso granular `pe:cierre_turno` (decisión owner 2026-11-05), el MISMO que ya
 * usa el `[id]`: iniciar/cerrar turno es de conserjería, el comité audita el panel
 * y mantención no entra (su `pe` de tareas ya no se hereda por prefijo). Hasta
 * ahora la colección pedía la raíz desnuda `pe` y por eso el par estaba partido:
 * mantención leía y creaba cierres por acá aunque el `[id]` le devolviera 403.
 *
 * INV-02 (docs/INVARIANTES.md): un trabajador cierra UN turno por fecha y
 * jornada. La regla vivía sólo en la pantalla de bitácora; ahora el servidor la
 * impone con la misma identidad que usa MP (ficha con RUT), no con el nombre.
 *
 * Alcance por filas (`alcanceCierresTurnoPE`, el MISMO helper que declara el
 * `[id]`): la lista de un rol acotado trae sólo los turnos de SU persona; antes
 * el portón leía las novedades de todos los cierres del edificio porque el
 * `where` era sólo la comunidad. Gestión (administrador, comité) conserva la
 * comunidad entera, y un rol acotado sin ficha MP recibe `total: 0` en vez de la
 * comunidad completa (fail-closed del helper).
 *
 * Las dos pantallas que consumen esta colección son de GESTIÓN, así que ninguna
 * pierde visibilidad: `app/admin/reporteria/page.tsx:62` alimenta el KPI de
 * «jornadas informadas hoy» y vive en el menú de administrador y comité
 * (`components/app-sidebar.tsx:167`); `app/personas/personal/page.tsx:194` pinta
 * el monitor de jornadas del día y vive en el grupo «Personas», que el menú
 * reserva a administrador (`components/app-sidebar.tsx:152-158`). Los dos roles
 * de reportería están en `ROLES_CON_ALCANCE_DE_COMUNIDAD`
 * (`lib/api/sesion-persona.ts`), así que siguen leyendo la comunidad entera.
 *
 * ESCRITURA (T17): el alcance de arriba solo resuelve la fila que el upsert intenta
 * SOBREESCRIBIR; el alta no tiene fila. Por eso `antesDeEscribir` encadena dos
 * guardias: `rechazoDeCierreTurnoAjeno` primero —la conserjería con identidad MP solo
 * cierra turnos de SU persona, la gestión cierra el de cualquiera— y después
 * `guardiaCierreUnico` (INV-02). El cierre del otro trabajador responde 404, no 403.
 */
import { CierreTurnoPESchema } from "@/lib/schemas"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import {
  createCrudHandlers,
  delegado,
  type AntesDeEscribir,
} from "@/lib/api/crud-factory"
import { guardiaCierreUnico } from "@/lib/invariantes/pe"
import { alcanceCierresTurnoPE, rechazoDeCierreTurnoAjeno } from "./_alcance"

/**
 * Las dos guardias previas a la escritura, en orden: primero la PROPIEDAD del cierre
 * (T17) y después INV-02. `antesDeEscribir` es un solo hook, así que la composición
 * vive acá y no en `lib/invariantes/pe.ts`, que no conoce identidades.
 */
const antesDeEscribir: AntesDeEscribir = async (args) =>
  (await rechazoDeCierreTurnoAjeno(args)) ?? guardiaCierreUnico(args)

const handlers = createCrudHandlers({
  model: delegado(prisma.cierreTurnoPE),
  schema: CierreTurnoPESchema,
  authzCheck: (rol, accion) => puede(rol, accion, "pe:cierre_turno"),
  // El MISMO helper del `[id]`: el alcance también resuelve la fila que el POST
  // intenta sobreescribir, así que un cierre ajeno ya no se puede reescribir por
  // el upsert de la colección (404 por alcance, no edición).
  alcance: alcanceCierresTurnoPE,
  // T17 + INV-02: la propiedad del cierre (alta) y, después, la regla de unicidad.
  antesDeEscribir,
})

export const GET = handlers.GET
export const POST = handlers.POST
