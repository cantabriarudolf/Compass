/**
 * /api/certificados-ct/mis-vinculos — los vínculos VIGENTES del actor (F34).
 *
 * Existe por una razón medida: `/comunidad/certificados` no se podía poblar para
 * el residente. La pantalla pedía `GET /api/vinculos` (exige `mp`),
 * `GET /api/pe/unidades` (exige `pe:bitacora`) y `GET /api/configuracion` (exige
 * `cf`), y la solución elegida NO fue abrir esas rutas: el padrón del edificio y
 * los parámetros operativos de la comunidad no son datos del residente. Abrirlas
 * cambiaba una pantalla rota por una fuga.
 *
 * Esta ruta es la fuente PROPIA que reemplaza a las tres para el caso «residencia»:
 * devuelve exactamente los vínculos de la persona del `Usuario` de la sesión, con
 * el rótulo de la unidad y la identidad del residente. La regla es la misma de
 * `unidadesVinculadasDb` / `personaIdDelUsuarioDb` (`lib/api/sesion-persona.ts`),
 * que es la que ya usan las rutas de F27 (`avisos-cobro`) y el alcance CT: el
 * `personaId` sale de la BD de la sesión y NUNCA del query ni del body, así que
 * un id ajeno en la URL no amplía nada (el caso está en
 * `test/api/certificados-ct-emision-residente.test.ts`).
 *
 * Qué NO es: no es el listado de vínculos de la comunidad (eso sigue siendo
 * `GET /api/vinculos`, con `mp`), no acepta filtros de cliente y no devuelve
 * vínculos cerrados — «vigente» es `fechaFin: null`, el mismo criterio que usan
 * `unidadesVinculadasDb` y el gate de residencia del POST.
 *
 * Fail-closed: un rol acotado sin ficha en el Maestro de Personas recibe
 * `{ data: [] }`, no la comunidad. Sin `personaId` no hay «lo propio» que
 * resolver, y devolver todo sería exactamente el fail-open que la serie
 * «permisos por objeto» cerró en las demás rutas.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { personaIdDelUsuarioDb } from "@/lib/api/sesion-persona"

/** Un vínculo propio, con el rótulo que la pantalla imprime (no ids crudos). */
interface VinculoPropio {
  id: string
  unidadId: string
  unidad: string
  personaId: string
  persona: string
  rut: string
  rol: string
  fechaInicio: string
}

/**
 * `Depto 101`: etiqueta y número de la unidad, juntos y en ese orden — el mismo
 * rótulo que usa `GET /api/pe/unidades` (`etiqueta` + `numero`). Se arma acá, del
 * lado del servidor, porque el residente no puede leer el padrón para resolverlo.
 */
function rotuloDeUnidad(etiqueta: string, numero: string): string {
  return `${etiqueta} ${numero}`.trim()
}

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  // La lectura de certificados es el permiso que ya gobierna la pantalla: quien no
  // ve `ct` no tiene nada que hacer en el formulario de emisión.
  if (!puede(scope.rol, "ver", "ct")) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const personaId = await personaIdDelUsuarioDb(scope.usuarioId)
    if (!personaId) return Response.json({ data: [] })

    // `fechaFin: null` es la definición de «vigente» de toda la serie: el mismo
    // filtro de `unidadesVinculadasDb` y el que exige el POST de residencia.
    const vinculos = await prisma.vinculoUnidad.findMany({
      where: { personaId, comunidadId: scope.comunidadId, fechaFin: null },
      orderBy: [{ fechaInicio: "desc" }, { id: "desc" }],
      select: { id: true, unidadId: true, personaId: true, rol: true, fechaInicio: true },
    })
    if (vinculos.length === 0) return Response.json({ data: [] })

    // `VinculoUnidad` guarda los ids sin relación de Prisma, así que los rótulos se
    // resuelven con dos lecturas acotadas por los ids que ya son propios.
    const [unidades, persona] = await Promise.all([
      prisma.unidad.findMany({
        where: {
          comunidadId: scope.comunidadId,
          id: { in: [...new Set(vinculos.map((v) => v.unidadId))] },
        },
        select: { id: true, etiqueta: true, numero: true },
      }),
      prisma.persona.findFirst({
        where: { id: personaId, comunidadId: scope.comunidadId },
        select: { nombres: true, apellidos: true, nombreCompleto: true, rut: true },
      }),
    ])
    const rotulos = new Map(unidades.map((u) => [u.id, rotuloDeUnidad(u.etiqueta, u.numero)]))
    const nombre = persona
      ? `${persona.nombres} ${persona.apellidos}`.trim() || persona.nombreCompleto
      : ""
    const rut = persona?.rut ?? ""

    const data: VinculoPropio[] = vinculos.map((v) => ({
      id: v.id,
      unidadId: v.unidadId,
      // Sin rótulo la pantalla mostraría el id: el fallback conserva el dato antes
      // que inventar una unidad.
      unidad: rotulos.get(v.unidadId) ?? v.unidadId,
      personaId: v.personaId,
      persona: nombre,
      rut,
      rol: v.rol,
      fechaInicio: v.fechaInicio,
    }))
    return Response.json({ data })
  } catch (e) {
    logger.error({ err: e }, "[api/certificados-ct/mis-vinculos] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}
