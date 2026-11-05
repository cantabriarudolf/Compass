/**
 * /api/pe/unidades — padrón de unidades para la operación de conserjería (F6).
 *
 * El conserje registra visitas, encomiendas y contratistas contra una unidad destino y necesita
 * buscar en TODO el padrón de su comunidad. El padrón completo vive en `/api/unidades`, pero ese
 * recurso es `mp` y conserjería no lo tiene (`mp:propios` es ABAC del propio vínculo): pedirlo
 * ahí devolvía 403 al rol que registra la visita.
 *
 * Esta ruta es una PROYECCIÓN de solo lectura para esa operación: cuatro campos, el scope de la
 * sesión y el permiso `pe:bitacora`, que conserjería ya tiene por su trabajo en la bitácora.
 * No expone el resto del registro (metraje, prorrateo, estado, servicios) ni permite escribir.
 *
 * Excluye las plazas de estacionamiento: no son destino de visita. La pertenencia la decide la
 * etiqueta y no el prefijo del id — los departamentos de la torre E comparten el prefijo `u-E-`
 * con las plazas.
 *
 * Envelope: `{ data, page, pageSize, total }`. El `total` es el count del MISMO `where` que la
 * lista, para que el panel pueda avisar el truncamiento (AvisoTruncamiento) en vez de cortar en
 * silencio: los selects de la operación piden el padrón completo con `pageSize=100`, mientras que
 * las búsquedas por texto siguen pidiendo `pageSize=25`.
 *
 * `?page=` es aditivo y opcional (default 1 = `skip 0`): con él la búsqueda se puede recorrer
 * hasta el final de a una página, que es lo que habilita «Cargar más resultados» en
 * `components/selector-buscable.tsx`. Sin `page` la ruta responde exactamente lo de antes; el
 * `total` es lo que le dice al cliente si quedan páginas (`page * pageSize < total`).
 *
 * `?ids=<id>,<id>,…` es una lista cerrada (máximo 50): devuelve solo esas filas del scope con el
 * mismo `select` y sin truncar por `pageSize`. Es el complemento de `?q=` para resolver la
 * etiqueta de filas del día cuya unidad quedó fuera de la primera página del padrón; `ids` gana
 * sobre `q` cuando vienen los dos, y sin ids (o con lista vacía) el comportamiento no cambia.
 *
 * Orden TOTAL (`numero`, `rolSii`, `id`): paginar exige un orden determinista. `numero` no es
 * único (el schema lo declara: «No unique on [comunidadId, numero]», C3b/D5) y `rolSii` tampoco
 * (todo el padrón sin rol SII comparte la cadena vacía), así que sin el desempate final por `id`
 * el motor es libre de devolver las filas empatadas en cualquier orden: dos pedidos idénticos
 * podían traer páginas distintas y dos páginas consecutivas podían solaparse o saltear filas. Con
 * el desempate, las páginas particionan el resultado sin solapamiento ni huecos.
 */
import type { Prisma } from "@prisma/client"
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { ETIQUETA_NO_DESTINO } from "@/lib/unidades-destino"

/** Página pedida por defecto: `1` deja el `skip` en 0, así que sin `?page=` nada cambia. */
const PAGINA_POR_DEFECTO = 1

const PAGE_SIZE_POR_DEFECTO = 25
/**
 * Tope de página: sube de 50 a 100 porque el padrón de los selects de la operación pide
 * `pageSize=100` (`LIMITE_SELECT` en `components/pe/aviso-truncamiento.tsx`); las búsquedas por
 * texto siguen pidiendo el default de 25.
 */
const PAGE_SIZE_MAXIMO = 100

/** Tope de la lista cerrada `?ids=`: es la cota del lote que piden los paneles del día. */
export const MAXIMO_IDS = 50

/**
 * Lista cerrada de `?ids=`: recorta, quita vacíos y responde 400 si pasa el tope. `null` cuando
 * el parámetro no viene, para distinguir «sin filtro» de «filtro por lista vacía».
 */
function idsPedidos(valor: string | null): { ids: string[] } | { error: string } | null {
  if (valor === null) return null
  const ids = valor
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
  if (ids.length > MAXIMO_IDS) {
    return { error: `Se piden más de ${MAXIMO_IDS} ids; el máximo de la lista cerrada es ${MAXIMO_IDS}.` }
  }
  return { ids }
}

export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  // Conserjería y mantención operan la bitácora; el administrador entra por wildcard.
  if (!puede(scope.rol, "ver", "pe:bitacora")) {
    return jsonError(403, "Permiso denegado.")
  }

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }
  const filtroIds = idsPedidos(url.searchParams.get("ids"))
  if (filtroIds && "error" in filtroIds) return jsonError(400, filtroIds.error)
  const q = url.searchParams.get("q")?.trim() ?? ""
  const pageSize = Math.min(
    PAGE_SIZE_MAXIMO,
    Math.max(
      1,
      Number.parseInt(
        url.searchParams.get("pageSize") ?? String(PAGE_SIZE_POR_DEFECTO),
        10
      ) || PAGE_SIZE_POR_DEFECTO
    )
  )

  const page = Math.max(
    PAGINA_POR_DEFECTO,
    Math.trunc(
      Number.parseInt(
        url.searchParams.get("page") ?? String(PAGINA_POR_DEFECTO),
        10
      ) || PAGINA_POR_DEFECTO
    )
  )
  /** Lista cerrada de ids: se sirve completa y siempre desde el principio, como hasta hoy. */
  const listaCerrada = filtroIds !== null && filtroIds.ids.length > 0

  const where: Prisma.UnidadWhereInput = {
    comunidadId: scope.comunidadId,
    etiqueta: { not: ETIQUETA_NO_DESTINO },
    // `ids` gana sobre `q`: es una lista cerrada de ids concretos, no una búsqueda de texto.
    ...(filtroIds
      ? filtroIds.ids.length > 0
        ? { id: { in: filtroIds.ids } }
        : {}
      : q
        ? {
            OR: [
              { numero: { contains: q } },
              { etiqueta: { contains: q } },
              { rolSii: { contains: q } },
            ],
          }
        : {}),
  }

  try {
    const [data, total] = await Promise.all([
      prisma.unidad.findMany({
        where,
        // Total: `id` es único, así que los empates de `numero`/`rolSii` dejan de ser ambiguos
        // y `skip`/`take` cortan siempre las mismas filas con el mismo orden.
        orderBy: [{ numero: "asc" }, { rolSii: "asc" }, { id: "asc" }],
        // Lista cerrada: sin truncar por pageSize (el panel necesita TODAS las etiquetas pedidas).
        take: listaCerrada ? filtroIds.ids.length : pageSize,
        // La lista cerrada ignora `page`: no es una búsqueda, es un lote de ids concretos.
        skip: listaCerrada ? 0 : (page - 1) * pageSize,
        select: { id: true, numero: true, etiqueta: true, rolSii: true },
      }),
      prisma.unidad.count({ where }),
    ])
    return Response.json({ data, page, pageSize, total })
  } catch (e) {
    logger.error({ err: e }, "[api/pe/unidades] error inesperado")
    return jsonError(500, "No se pudo consultar el padrón de unidades.")
  }
}
