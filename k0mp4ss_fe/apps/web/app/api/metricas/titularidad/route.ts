/**
 * GET /api/metricas/titularidad — qué unidades no tienen propietario vigente.
 *
 * Una unidad sin dueño no se puede cobrar: esta ruta es la superficie del panel
 * (`/admin/metricas`) que nombra a las que están así, para que la administración
 * no se entere sólo cuando la emisión se bloquea con un conteo.
 *
 * La derivación NO se reinventa: el hecho sale de `leerTitularidad`
 * (`app/admin/metricas/_titularidad.ts`), la misma función que usa el chequeo de
 * integridad (`scripts/check-unidades-sin-propietario.ts`) y la prueba que exige
 * cero sobre la semilla de demo. Si esta ruta contara por su cuenta habría dos
 * verdades del mismo hecho. Costo: las MISMAS dos consultas del lector
 * —unidades y vínculos, una por colección—; ninguna consulta por unidad.
 *
 * La respuesta es agregado + lista corta de unidad y causa. La lista se corta en
 * un máximo declarado (como en `convenios/unidades-con-deuda`) y el TOTAL va
 * siempre al cuerpo: con la lista truncada, el conteo completo no se adivina.
 * NUNCA viaja dato de persona: ni nombre, ni RUT, ni id — numero y causa.
 *
 * Authz: `ad` con acción `editar`, igual que el KPI de vigencia que vive al lado
 * (`/api/vigencia-registro/kpi`). `ver` no alcanza porque el rol `residente` la
 * posee: la respuesta dice qué unidades quedaron sin dueño, y ese inventario no
 * le corresponde. El scoping sale de la sesión (`withComunidadScope`), nunca del
 * cliente.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { leerTitularidad } from "@/app/admin/metricas/_titularidad"

/** Máximo de unidades que la lista trae; el total va declarado aparte. */
const LIMITE_UNIDADES = 50

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "editar", "ad")) {
    return jsonError(403, "Permiso denegado.")
  }

  const titularidad = await leerTitularidad(scope.comunidadId, prisma)

  return Response.json({
    sinTitular: titularidad.total,
    nuncaDeclarado: titularidad.porCausa.nunca_declarado,
    vinculoCerradoSinReemplazo: titularidad.porCausa.vinculo_cerrado_sin_reemplazo,
    unidades: titularidad.sinTitular
      .slice(0, LIMITE_UNIDADES)
      .map((unidad) => ({ numero: unidad.numero, causa: unidad.causa })),
  })
}
