/**
 * /api/comunicacion/buscar-personas — el buscador de vecinos del buzón ciudadano.
 *
 * La consola de comunicación ofrecía al reportante de un reclamo en un `Select` llenado
 * con `usePersonas()` (`/api/personas?pageSize=100`): una persona fuera de las primeras
 * cien filas del padrón no se podía elegir, así que el reclamo recibido en la oficina
 * quedaba a nombre de quien no era o a nombre de la Administración por no poder elegirlo.
 * Es la misma lista ciega que la serie F36 cerró en convenios y certificados.
 *
 * Reglas, en el mismo orden que el molde de certificados:
 *
 *   · la compuerta de la matriz es `co:buzon` con `crear` —el permiso de registrar un
 *     reclamo en la oficina—, clave granular, así que pasa el candado R1 del guardián de
 *     inventario. Por el fallback de prefijo de `puede()`, administración y residente
 *     entran igual, que es la población del buzón;
 *   · el scope de comunidad sale de la sesión (`withComunidadScope`): la fila de otra
 *     comunidad no es un dato ajeno que se ignora, es una fila que no existe;
 *   · alcance por filas de la serie «permisos por objeto» (`alcancePorFilasDeSesion`):
 *     administración y comité buscan la comunidad entera; un rol acotado sólo encuentra
 *     SU propia persona y, sin ficha en el Maestro de Personas, NADA (falla cerrado).
 *     Eso es lo que impide que un residente registre un reclamo a nombre de un vecino;
 *   · el universo es el que la pantalla ya aplicaba —`estadoCuenta: "activa"`—, sin
 *     agregarle el vínculo vigente: acotar la población sería una decisión de negocio
 *     sobre quién puede reclamar, y esta ruta sólo reemplaza el recorte por la búsqueda;
 *   · `q` filtra por nombre, RUT y email sobre TODA la comunidad, y necesita dos
 *     caracteres como el resto de los buscadores: con uno el barrido de 25 filas por
 *     letra vuelve a ser posible;
 *   · la respuesta declara `data`, `page`, `pageSize` y `total`, así que el recorte se
 *     ve («Mostrando N de M») y no se esconde.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { excedeVolumen } from "@/lib/rate-limit-volumen"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { alcancePorFilasDeSesion } from "@/lib/api/sesion-persona"

/** Mismo tamaño de página que el buscador de certificados. */
const PERSONAS_POR_PAGINA = 25

/** Mínimo de caracteres de `q`, espejo de `MINIMO_CARACTERES` del buscador de la UI. */
const MINIMO_CARACTERES = 2

/** Fila del buscador: lo mínimo para elegir a la persona y armar el reclamo. */
interface PersonaBuscada {
  id: string
  nombres: string
  apellidos: string
  rut: string
}

export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  if (!puede(scope.rol, "crear", "co:buzon")) {
    return jsonError(403, "Permiso denegado.")
  }

  // Después de la compuerta y antes de validar `q`: protege la base de la ráfaga y no
  // deja que un `q` inválido sea barato de spamear. La clave es el usuario, no la IP.
  if (excedeVolumen("comunicacion", scope.usuarioId)) {
    return jsonError(429, "Demasiadas solicitudes.")
  }

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }

  const q = url.searchParams.get("q")?.trim() ?? ""
  if (q === "") return jsonError(400, "Falta el parámetro q.")
  if (q.length < MINIMO_CARACTERES) {
    return jsonError(400, "El parámetro q necesita al menos dos caracteres.")
  }
  // El tope del `page` no es cosmético: con un número fuera del rango de Int, Prisma
  // rechaza el `skip` y la ruta responde 500 en vez de una página vacía.
  const paginaPedida = Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1
  const page = Math.min(10_000, Math.max(1, paginaPedida))

  // Alcance por filas (misma decisión de toda la serie): comunidad para administración
  // y comité; para un rol acotado, SU persona o nada.
  const alcance = await alcancePorFilasDeSesion(scope)
  if (alcance.tipo === "denegado") {
    return Response.json({ data: [], page, pageSize: PERSONAS_POR_PAGINA, total: 0 })
  }

  try {
    // Mismos tres campos de búsqueda que `/api/personas` (nombre, RUT, email) y la
    // misma regla de la pantalla (`estadoCuenta: "activa"`), resuelta en el servidor.
    const where = {
      comunidadId: scope.comunidadId,
      estadoCuenta: "activa",
      ...(alcance.tipo === "propio" ? { id: alcance.personaId } : {}),
      OR: [
        { nombreCompleto: { contains: q } },
        { rut: { contains: q } },
        { email: { contains: q } },
      ],
    }

    const [filas, total] = await Promise.all([
      prisma.persona.findMany({
        where,
        orderBy: [{ nombreCompleto: "asc" }, { id: "asc" }],
        skip: (page - 1) * PERSONAS_POR_PAGINA,
        take: PERSONAS_POR_PAGINA,
        select: { id: true, nombres: true, apellidos: true, rut: true },
      }),
      prisma.persona.count({ where }),
    ])

    const data: PersonaBuscada[] = filas.map((p) => ({
      id: p.id,
      nombres: p.nombres,
      apellidos: p.apellidos,
      rut: p.rut,
    }))
    return Response.json({ data, page, pageSize: PERSONAS_POR_PAGINA, total })
  } catch (e) {
    logger.error({ err: e }, "[api/comunicacion/buscar-personas] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}
