/**
 * /api/periodos-directiva/buscar-personas — la búsqueda ligera de la nómina de
 * la directiva (T11 de S10, «el barrido de listas ciegas»).
 *
 * El diálogo de `/comunidad/directiva` armaba la nómina (impar de 3 a 5, art. 17
 * Ley 21.442) con un checkbox por persona sobre `personas.filter(p =>
 * p.estadoCuenta === "activa")`, y esa colección venía de `usePersonas()` →
 * `/api/personas?pageSize=100`: una persona fuera de las primeras cien filas del
 * padrón NO podía ser nombrada directora. La directiva es un órgano legal y no
 * poder nombrar a quien corresponde es un defecto de fondo, no de comodidad.
 * Esta ruta resuelve la búsqueda EN el servidor, con la regla que la pantalla
 * aplicaba a mano:
 *
 *   · universo: personas con `estadoCuenta: "activa"` de la comunidad — la MISMA
 *     regla del checkbox, sin requisitos nuevos (ni vínculo ni unidad);
 *   · `q` filtra por nombre, RUT y email (los mismos tres campos de
 *     `/api/personas`), sobre TODA la comunidad, sin el techo de 100 filas del
 *     padrón del cliente;
 *   · cada fila trae `nombreCompleto` y `rut`: el payload de la nómina necesita
 *     el nombre de la persona elegida, y el padrón del cliente puede no conocerla;
 *   · la página es chica y la respuesta declara `total`, `page` y `pageSize`:
 *     el recorte se DECLARA, no se esconde (mismo criterio que
 *     `certificados-ct/buscar-personas` y `unidades-con-deuda`);
 *   · el scope de comunidad sale de la sesión (`withComunidadScope`): la fila de
 *     otra comunidad no es un dato ajeno que se ignora, es una fila que no existe;
 *   · alcance por filas de la serie «permisos por objeto»
 *     (`alcancePorFilasDeSesion`): administración y comité buscan la comunidad
 *     entera; un rol acotado sólo encuentra SU propia persona y, sin ficha en el
 *     Maestro de Personas, NADA (falla cerrado — el fail-open de devolver la
 *     comunidad entera a un rol acotado es exactamente lo que la serie cerró);
 *   · la compuerta de la matriz es `gd` con `ver` — la familia que gobierna el
 *     libro de la directiva (actas y períodos), la misma clave de las rutas
 *     hermanas `app/api/periodos-directiva/*`. En la MATRIZ no existe ninguna
 *     clave granular `gd:*`: sin hermanos granulares, la raíz no es «desnuda»
 *     para la regla R1 del auditor y el guardián queda verde con la clave tal
 *     como la declararon H5. La acción es `ver` (lectura, paridad con el buscador
 *     de certificados): el que pueda registrar la nómina pasa por la compuerta
 *     de `crear`/`editar` del POST/PUT de la colección, no por acá;
 *   · `q` necesita AL MENOS DOS caracteres. El mínimo ya existía en
 *     `components/buscador-entidad.tsx` (`MINIMO_CARACTERES = 2`): un techo que
 *     sólo impone la UI no es un techo, y cualquier otro cliente podía barrer el
 *     padrón 25 filas por letra;
 *   · `q` no acepta los comodines de LIKE (`%` y `_`, R1-001): `contains` arma
 *     el patrón `%q%` sin escapar, así que `q=%%` cumplía el mínimo de dos y
 *     enumeraba el padrón entero. Los nombres, RUT y emails no usan esos
 *     caracteres: el término con comodín se rechaza;
 *   · el `contains` declara `mode: "insensitive"` SÓLO cuando la base es
 *     PostgreSQL según `DATABASE_URL` (R3-1, derivado con `proveedorDeUrl` de
 *     `lib/database-url.ts`): allá el `contains` es case-sensitive y una
 *     búsqueda en minúsculas no encontraba nada. En SQLite —dev y suite— el
 *     conector RECHAZA `mode` y su `LIKE` ya es case-insensitive para ASCII,
 *     así que allá el filtro queda como siempre. La detección NO lee el
 *     cliente generado ni camina el sistema de archivos: depende del MISMO
 *     entorno que lee el cliente Prisma para conectarse, así que no hay un
 *     artefacto cuya ausencia apague el modo en silencio, ni una lectura de
 *     99 KB por cold start;
 *   · sesenta búsquedas por minuto por usuario, con el contador en memoria del
 *     patrón `lib/rate-limit-volumen` y con el ámbito PROPIO de esta ruta
 *     (`"periodos-directiva"`): el verificador de la serie midió que compartir el
 *     pozo entre buscadores dejaba sin cuota a endpoints ajenos — cuarenta
 *     búsquedas de certificados cortaban al buzón en la solicitud 21. El límite
 *     corre ANTES de validar `q`, así que una ráfaga inválida también se paga;
 *   · el tope del `page` no es cosmético: con un número fuera del rango de Int,
 *     Prisma rechaza el `skip` y la ruta responde 500 en vez de una página vacía
 *     (hallazgo L9 de la serie). Se topa en 10 000 antes de calcular el `skip`.
 *
 * La ruta es ESTÁTICA —sin segmento `[id]`— y responde 400 sin `q` y con `q` de un
 * solo carácter: la búsqueda es la razón de la ruta (un browse sin término es el
 * padrón, no una búsqueda).
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { excedeVolumen } from "@/lib/rate-limit-volumen"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { alcancePorFilasDeSesion } from "@/lib/api/sesion-persona"
import { proveedorDeUrl, type ProveedorBase } from "@/lib/database-url"

/**
 * Tamaño de página de la búsqueda: el mismo orden de magnitud que
 * `PAGE_SIZE_BUSQUEDA` de los selectores de la operación y el mismo del buscador
 * de certificados. El `total` viaja en la respuesta y el buscador declara cuántas
 * quedaron fuera.
 */
const PERSONAS_POR_PAGINA = 25

/**
 * Mínimo de caracteres de `q`, espejo de `MINIMO_CARACTERES` del buscador de la
 * pantalla. Con un carácter la búsqueda deja de ser una búsqueda y pasa a ser un
 * barrido del padrón de 25 filas por letra.
 */
const MINIMO_CARACTERES = 2

/** Comodines de LIKE: `contains` arma `%q%` sin escapar, así que entran por el patrón. */
const COMODINES_LIKE = /[%_]/

/**
 * Proveedor de la base, derivado de `process.env.DATABASE_URL` con
 * `proveedorDeUrl` (`lib/database-url.ts`, el mismo criterio que la resolución
 * de URLs de los scripts de datos): `postgresql://` → PostgreSQL, `file:` →
 * SQLite, `null` si no se puede determinar — el filtro queda como siempre (sin
 * `mode`), que es el comportamiento de antes. La detección es una inspección
 * del entorno del proceso: no lee el disco, no camina directorios ni depende
 * del cliente generado. El test de proveedor
 * (`test/api/periodos-directiva-buscar-personas-proveedor.test.ts`) fuerza el
 * caso PostgreSQL mockeando este helper y espía el `where.OR` real.
 */
function proveedorDeLaBase(): ProveedorBase | null {
  return proveedorDeUrl(process.env.DATABASE_URL ?? "")
}

/**
 * El OR de los tres campos de búsqueda (los mismos de `/api/personas`: nombre,
 * RUT y email). `mode: "insensitive"` va SÓLO para el cliente PostgreSQL (R3-1):
 * allá `contains` es case-sensitive; en SQLite el conector rechaza `mode` y su
 * `LIKE` ya es case-insensitive para ASCII. Exportado para que el test pinee las
 * dos formas sin una base PostgreSQL al lado.
 */
export function filtroDeBusqueda(q: string, proveedor: ProveedorBase | null) {
  const contiene: { contains: string; mode?: "insensitive" } =
    proveedor === "postgresql" ? { contains: q, mode: "insensitive" } : { contains: q }
  return [{ nombreCompleto: contiene }, { rut: contiene }, { email: contiene }]
}

/**
 * Fila del buscador: identidad mínima de una persona ELEGIBLE para la nómina.
 * `nombreCompleto` es lo que muestra el buscador y lo que el payload del período
 * guarda como nombre del miembro.
 */
interface PersonaNomina {
  id: string
  nombreCompleto: string
  rut: string
}

export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  // La familia `gd` es la del libro de la directiva (actas + períodos): la misma
  // compuerta de las rutas hermanas `app/api/periodos-directiva`. Lectura, así
  // que `ver`: quien escribe la nómina la exige la colección (crear/editar).
  // El techo de volumen va ANTES del portón: si quedaba después, un rechazo no se contaba
  // nunca (hallazgo R1-001). El ámbito es propio de esta ruta — no comparte pozo con otros
  // buscadores, y la clave es el usuario, no la IP.
  if (excedeVolumen("periodos-directiva", scope.usuarioId)) {
    return jsonError(429, "Demasiadas solicitudes.")
  }

  if (!puede(scope.rol, "ver", "gd")) {
    return jsonError(403, "Permiso denegado.")
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
  // R1-001: `%%` cumple el mínimo de dos y el comodín de LIKE enumera el
  // padrón entero, porque `contains` arma el patrón `%q%` sin escapar. El
  // término con comodín se rechaza en vez de reescribirse por detrás.
  if (COMODINES_LIKE.test(q)) {
    return jsonError(400, "El parámetro q no acepta los comodines % y _.")
  }
  // El tope del `page` no es cosmético: con un número fuera del rango de Int, Prisma
  // rechaza el `skip` y la ruta responde 500 en vez de una página vacía.
  const paginaPedida = Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1
  const page = Math.min(10_000, Math.max(1, paginaPedida))

  // Alcance por filas (misma decisión de toda la serie): comunidad para
  // administración y comité; para un rol acotado, SU persona o nada.
  const alcance = await alcancePorFilasDeSesion(scope)
  if (alcance.tipo === "denegado") {
    return Response.json({ data: [], page, pageSize: PERSONAS_POR_PAGINA, total: 0 })
  }

  try {
    // El universo son las personas con cuenta ACTIVA de la comunidad: la regla
    // que la pantalla aplicaba en el cliente (`estadoCuenta === "activa"` sobre
    // una página de 100), ahora en el servidor y sin tope de filas vistas.
    const where = {
      comunidadId: scope.comunidadId,
      estadoCuenta: "activa",
      ...(alcance.tipo === "propio" ? { id: alcance.personaId } : {}),
      // Mismos tres campos de búsqueda que `/api/personas` (nombre, RUT, email),
      // con `mode` sólo cuando `DATABASE_URL` es de PostgreSQL (R3-1).
      OR: filtroDeBusqueda(q, proveedorDeLaBase()),
    }

    const [filas, total] = await Promise.all([
      prisma.persona.findMany({
        where,
        orderBy: [{ nombreCompleto: "asc" }, { id: "asc" }],
        skip: (page - 1) * PERSONAS_POR_PAGINA,
        take: PERSONAS_POR_PAGINA,
        select: { id: true, nombreCompleto: true, rut: true },
      }),
      prisma.persona.count({ where }),
    ])

    const data: PersonaNomina[] = filas.map((p) => ({
      id: p.id,
      nombreCompleto: p.nombreCompleto,
      rut: p.rut,
    }))
    return Response.json({ data, page, pageSize: PERSONAS_POR_PAGINA, total })
  } catch (e) {
    logger.error({ err: e }, "[api/periodos-directiva/buscar-personas] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}
