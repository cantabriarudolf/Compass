/**
 * /api/certificados-ct/buscar-personas — la búsqueda ligera del formulario de
 * emisión de certificados (F36).
 *
 * El formulario de `/comunidad/certificados` ofrecía la persona solicitante en
 * una lista truncada: `usePersonas()` pide `/api/personas?pageSize=100` y el
 * `Select` montaba esa primera página filtrada en el cliente con los vínculos de
 * `/api/vinculos?pageSize=100` — también recortados. Un certificado de residencia
 * es un documento legal sobre UNA persona, y esa persona tenía que estar dentro
 * de las primeras 100 filas del padrón (y su vínculo dentro de las primeras 100
 * de la colección de vínculos) para poder elegirse. Esta ruta resuelve la
 * búsqueda EN el servidor, con la regla que la pantalla aplicaba a mano:
 *
 *   · sólo personas con vínculo VIGENTE (`fechaFin: null`) en la comunidad — la
 *     misma regla del gate de residencia y de `unidadesVinculadasDb`;
 *   · `q` filtra por nombre, RUT y email (los mismos tres campos de
 *     `/api/personas`), sobre TODA la comunidad, no sobre la página traída;
 *   · cada fila trae sus vínculos vigentes con el rótulo de la unidad, para que
 *     el formulario ofrezca la unidad del vínculo y arme el payload de emisión
 *     sin volver a las colecciones truncadas del cliente;
 *   · la página es chica y la respuesta declara `total`, `page` y `pageSize`:
 *     el recorte se DECLARA, no se esconde (mismo criterio que
 *     `unidades-con-deuda`, que declara `total` y `mostrados`);
 *   · el scope de comunidad sale de la sesión (`withComunidadScope`): la fila de
 *     otra comunidad no es un dato ajeno que se ignora, es una fila que no existe;
 *   · alcance por filas de la serie «permisos por objeto»
 *     (`alcancePorFilasDeSesion`): administración y comité buscan la comunidad
 *     entera; un rol acotado sólo encuentra SU propia persona y, sin ficha en el
 *     Maestro de Personas, NADA (falla cerrado — el fail-open de devolver la
 *     comunidad entera a un rol acotado es exactamente lo que la serie cerró);
 *   · la compuerta de la matriz es la clave de emisión de la tipología que
 *     alimenta (`ct:residencia` con `ver`, el despacho de
 *     `RECURSO_DE_EMISION_POR_TIPO.residencia`): el buscador existe para elegir a
 *     la persona solicitante del certificado de residencia. El fallback de
 *     prefijo de `puede()` da la misma población que la compuerta de
 *     `mis-vinculos` —todo rol con `ct` `ver` entra—, expresada con la clave
 *     granular que exige el candado R1 de recursos;
 *   · `q` necesita AL MENOS DOS caracteres. El mínimo ya existía, pero vivía sólo
 *     en `components/buscador-entidad.tsx` (`MINIMO_CARACTERES = 2`): un techo
 *     que sólo impone la UI no es un techo, y cualquier otro cliente podía barrer
 *     el padrón 25 filas por letra;
 *   · sesenta búsquedas por minuto por usuario, con el contador en memoria del
 *     mismo patrón que `app/api/csp-report/route.ts`. La clave es el `usuarioId` y
 *     no la IP: una conserjería con varios residentes detrás de la misma IP se
 *     bloquearía a sí misma. El límite corre ANTES de validar `q`, así que una
 *     ráfaga inválida también se paga.
 *
 * La ruta es ESTÁTICA —sin segmento `[id]`— y responde 400 sin `q` y con `q` de un
 * solo carácter: la búsqueda es la razón de la ruta (un browse sin término es el
 * padrón, no una búsqueda).
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { alcancePorFilasDeSesion } from "@/lib/api/sesion-persona"

/**
 * Tamaño de página de la búsqueda: el mismo orden de magnitud que
 * `PAGE_SIZE_BUSQUEDA` de los selectores de la operación. El `total` viaja en la
 * respuesta y el buscador declara cuántas quedaron fuera.
 */
const PERSONAS_POR_PAGINA = 25

/**
 * Mínimo de caracteres de `q`, espejo de `MINIMO_CARACTERES` del buscador de la
 * pantalla. Con un carácter la búsqueda deja de ser una búsqueda y pasa a ser un
 * barrido del padrón de 25 filas por letra.
 */
const MINIMO_CARACTERES = 2

/**
 * Volumen del typeahead: 60 búsquedas por minuto alcanzan de sobra para tipear y
 * cortan el barrido. Mismo techo que `app/api/csp-report/route.ts`.
 */
const MAX_BUSQUEDAS_POR_VENTANA = 60
const VENTANA_LIMITE_MS = 60_000

/** Contador en memoria por usuario (clave usuarioId → { n, reset }). */
const contador = new Map<string, { n: number; reset: number }>()

function excedeLimite(clave: string, ahora: number): boolean {
  const registro = contador.get(clave)
  if (!registro || ahora >= registro.reset) {
    // Poda oportunista para que el Map no crezca sin límite.
    if (contador.size > 1000) contador.clear()
    contador.set(clave, { n: 1, reset: ahora + VENTANA_LIMITE_MS })
    return false
  }
  registro.n += 1
  return registro.n > MAX_BUSQUEDAS_POR_VENTANA
}

/** Vínculo vigente de una fila, con el rótulo que imprime el certificado. */
interface VinculoBuscado {
  id: string
  unidadId: string
  unidad: string
  rol: string
}

/** Fila del buscador: identidad mínima + los vínculos que la vuelven certificable. */
interface PersonaBuscada {
  id: string
  nombres: string
  apellidos: string
  rut: string
  vinculos: VinculoBuscado[]
}

export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  // La clave de emisión de la tipología que este buscador alimenta: la persona
  // solicitante existe sólo en el flujo del certificado de residencia
  // (`RECURSO_DE_EMISION_POR_TIPO.residencia`). Por el fallback de prefijo de
  // `puede()`, todo rol con `ct` `ver` entra igual que en `mis-vinculos`.
  if (!puede(scope.rol, "ver", "ct:residencia")) {
    return jsonError(403, "Permiso denegado.")
  }

  // El límite va acá, después de la compuerta y antes de validar `q`: protege la
  // base de la ráfaga y no deja que un `q` inválido sea barato de spamear.
  if (excedeLimite(scope.usuarioId, Date.now())) {
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
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)

  // Alcance por filas (misma decisión de toda la serie): comunidad para
  // administración y comité; para un rol acotado, SU persona o nada.
  const alcance = await alcancePorFilasDeSesion(scope)
  if (alcance.tipo === "denegado") {
    return Response.json({ data: [], page, pageSize: PERSONAS_POR_PAGINA, total: 0 })
  }

  try {
    // El universo son las personas con vínculo VIGENTE en la comunidad: la regla
    // que el formulario aplicaba en el cliente sobre páginas de 100, ahora en el
    // servidor y sin tope de filas vistas.
    const conVinculo = await prisma.vinculoUnidad.findMany({
      where: {
        comunidadId: scope.comunidadId,
        fechaFin: null,
        ...(alcance.tipo === "propio" ? { personaId: alcance.personaId } : {}),
      },
      select: { personaId: true },
      distinct: ["personaId"],
    })
    const idsConVinculo = conVinculo.map((v) => v.personaId)

    // Mismos tres campos de búsqueda que `/api/personas` (nombre, RUT, email).
    const where = {
      comunidadId: scope.comunidadId,
      id: { in: idsConVinculo },
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

    // Vínculos VIGENTES de las filas de la página, en el mismo orden de
    // `mis-vinculos`, con el rótulo `etiqueta numero` — el mismo que imprime el
    // formulario para la unidad (`refUnidadUI`).
    const idsPagina = filas.map((p) => p.id)
    const vinculos =
      idsPagina.length === 0
        ? []
        : await prisma.vinculoUnidad.findMany({
            where: {
              comunidadId: scope.comunidadId,
              personaId: { in: idsPagina },
              fechaFin: null,
            },
            orderBy: [{ fechaInicio: "desc" }, { id: "desc" }],
            select: { id: true, personaId: true, unidadId: true, rol: true },
          })

    const unidadIds = [...new Set(vinculos.map((v) => v.unidadId))]
    const unidades =
      unidadIds.length === 0
        ? []
        : await prisma.unidad.findMany({
            where: { comunidadId: scope.comunidadId, id: { in: unidadIds } },
            select: { id: true, etiqueta: true, numero: true },
          })
    const rotulos = new Map(unidades.map((u) => [u.id, `${u.etiqueta} ${u.numero}`]))

    const vinculosPorPersona = new Map<string, VinculoBuscado[]>()
    for (const v of vinculos) {
      const lista = vinculosPorPersona.get(v.personaId) ?? []
      // Sin rótulo la pantalla mostraría el id: el fallback conserva el dato antes
      // que inventar una unidad (mismo criterio que `mis-vinculos`).
      lista.push({
        id: v.id,
        unidadId: v.unidadId,
        unidad: rotulos.get(v.unidadId) ?? v.unidadId,
        rol: v.rol,
      })
      vinculosPorPersona.set(v.personaId, lista)
    }

    const data: PersonaBuscada[] = filas.map((p) => ({
      id: p.id,
      nombres: p.nombres,
      apellidos: p.apellidos,
      rut: p.rut,
      vinculos: vinculosPorPersona.get(p.id) ?? [],
    }))
    return Response.json({ data, page, pageSize: PERSONAS_POR_PAGINA, total })
  } catch (e) {
    logger.error({ err: e }, "[api/certificados-ct/buscar-personas] error GET")
    return jsonError(500, "Error interno del servidor.")
  }
}
