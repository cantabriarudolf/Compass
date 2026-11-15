/**
 * /api/cv/personas-habilitadas — el padrón de la creación manual del visor (T12, S10).
 *
 * La pantalla del visor (`app/comunidad/visor`) llenaba dos lugares con el padrón
 * recortado del cliente (`usePersonas()` → `/api/personas?pageSize=100`, filtrado
 * después con `permiteCreacionManualCV`): la lectura de «quién tiene habilitación»
 * (visor/page.tsx:529) y el Select «Registrar como creación de tercero habilitado»
 * (visor/page.tsx:607). Una persona habilitada fuera de las primeras cien filas del
 * padrón no existía para la pantalla — decía «Nadie habilitado además de
 * administración» cuando SÍ había alguien. Es la misma lista ciega que la serie
 * cerró en convenios, certificados y comunicación, con una diferencia: el universo
 * es deliberadamente CHICO (sólo quien tiene el flag), así que NO corresponde un
 * buscador con `q` — corresponde que el conjunto completo venga del servidor, sin
 * paginar. La respuesta declara `total` para que el consumidor pueda declarar el
 * recorte si algún día el conjunto dejara de ser acotado.
 *
 * Reglas, en el orden del molde de la serie:
 *   · la compuerta de la matriz es `cv` con `ver` —la acción de lectura de la clave
 *     que gobierna el visor—: la ruta es una lectura (el listado del tab
 *     Configuración) que además alimenta el alta manual por tercero (el Select del
 *     formulario), y `cv` ver es la compuerta del GET del módulo, la misma del
 *     crud-factory de avisos. Los cinco roles tienen `cv` ver (decisión owner
 *     2026-10-21), así que la denegación observable es la de un rol que la matriz
 *     no conoce: falla cerrado;
 *   · el scope de comunidad sale de la sesión (`withComunidadScope`): la fila de
 *     otra comunidad no es un dato ajeno que se ignora, es una fila que no existe;
 *   · alcance por filas de la serie (`alcancePorFilasDeSesion`): administración y
 *     comité ven la comunidad; un rol acotado recibe a lo sumo SU propia persona y,
 *     sin ficha en el Maestro de Personas, NADA — `denegado` responde la colección
 *     vacía con `total: 0` antes de tocar la colección;
 *   · el universo es el que la pantalla ya aplicaba — sólo el flag
 *     `permiteCreacionManualCV`, sin `estadoCuenta` ni vínculos: acotar la
 *     población sería una decisión de negocio que esta ruta no toma;
 *   · el filtro es del SERVIDOR: el cliente ya no recorta nada.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { alcancePorFilasDeSesion } from "@/lib/api/sesion-persona"

/** Fila del padrón habilitado: lo mínimo que la pantalla imprime. */
interface PersonaHabilitada {
  id: string
  nombres: string
  apellidos: string
}

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "ver", "cv")) {
    return jsonError(403, "Permiso denegado.")
  }

  // Alcance por filas (misma decisión de toda la serie): comunidad para
  // administración y comité; para un rol acotado, SU persona o nada. El
  // `denegado` no consulta la colección: responde el vacío verificado.
  const alcance = await alcancePorFilasDeSesion(scope)
  if (alcance.tipo === "denegado") {
    return Response.json({ data: [], total: 0 })
  }

  try {
    const where = {
      comunidadId: scope.comunidadId,
      permiteCreacionManualCV: true,
      ...(alcance.tipo === "propio" ? { id: alcance.personaId } : {}),
    }

    // Sin paginar a cien: el conjunto es acotado por diseño (sólo quien tiene el
    // flag). Orden determinista como el resto de la serie.
    const [filas, total] = await Promise.all([
      prisma.persona.findMany({
        where,
        orderBy: [{ nombreCompleto: "asc" }, { id: "asc" }],
        select: { id: true, nombres: true, apellidos: true },
      }),
      prisma.persona.count({ where }),
    ])

    const data: PersonaHabilitada[] = filas.map((p) => ({
      id: p.id,
      nombres: p.nombres,
      apellidos: p.apellidos,
    }))
    return Response.json({ data, total })
  } catch (e) {
    logger.error({ err: e }, "[api/cv/personas-habilitadas] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}
