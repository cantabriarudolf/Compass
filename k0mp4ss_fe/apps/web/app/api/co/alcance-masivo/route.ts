/**
 * /api/co/alcance-masivo — los destinatarios del envío masivo se resuelven en el
 * SERVIDOR (T14, S10).
 *
 * La consola de comunicación calculaba los destinatarios del envío masivo en el
 * CLIENTE cruzando TRES colecciones paginadas a cien (`usePersonas`, `useVinculos`
 * y `useUnidades`): una comunidad con más de cien filas recibía el envío
 * incompleto y nadie se entera — el alcance mostrado era exactamente el alcance
 * enviado. Un `AvisoTruncamiento` declaraba el recorte, pero declarar no es
 * resolver: el envío seguía saliendo incompleto.
 *
 * Este endpoint aplica EXACTAMENTE las reglas que el cliente tenía (sin reglas
 * nuevas sobre quién entra):
 *
 *   · candidatos: personas con `estadoCuenta === "activa"` de la comunidad;
 *   · el rol de la persona son los roles de sus vínculos VIGENTES (`fechaFin:
 *     null`); sin vínculo vigente, los `roles` de la ficha menos `"directiva"`
 *     (la `rolPersona` del cliente) — pero sólo el caso `personal` entra sin
 *     vínculo: sin vínculo vigente y sin ser `personal`, no entra;
 *   · el caso especial `personal` se conserva tal cual: si el filtro de roles lo
 *     incluye, entra con `unidadId` indefinido (aunque su vínculo vigente tenga
 *     unidad) y no se le aplican los filtros de sector — con un filtro activo,
 *     el `personal` cae igual que en el `lista.filter(d => d.unidadId && ...)`;
 *   · de los vínculos vigentes que calzan con el filtro de roles, entra el
 *     PRIMERO (el `if (!base.has(p.id))` del cliente fijaba la primera unidad);
 *   · los filtros de sector/unidad se resuelven contra las unidades de la
 *     comunidad: la unidad puntual gana, luego el micro, luego el macro — vía
 *     los micro sectores del macro. (En el cliente `macroSel` y `unidadSel`
 *     eran un no-op sobre el alcance resuelto, porque `unidadesVisibles` sólo
 *     miraba `microSel`; acá se aplican de verdad — decisión declarada del
 *     endpoint, no una regla nueva sobre quién entra.)
 *
 * Reglas del molde de la serie:
 *   · la compuerta de la matriz es `co` con `crear` —la misma de POST
 *     /api/co/envios, el alta de la difusión masiva: el alcance se consulta
 *     para ENVIAR, así que la ruta no abre más de lo que abre el envío—;
 *   · el scope de comunidad sale de la sesión (`withComunidadScope`): la fila
 *     de otra comunidad no es un dato ajeno que se ignora, es una fila que no
 *     existe;
 *   · alcance por filas de la serie (`alcancePorFilasDeSesion`): comunidad para
 *     administración y comité; para un rol acotado, SU persona o nada. Hoy
 *     NINGUNA clave de la matriz le da `co` crear a un rol acotado, así que el
 *     403 del guardián es el borde cerrado observable; el `denegado` responde
 *     el vacío con `total: 0` antes de Prisma como guardia por si la matriz
 *     cambia;
 *   · `excedeVolumen("co-alcance", usuarioId)`: la pantalla vuelve a consultar
 *     en cada cambio de filtro, y el techo de volumen es por usuario, no por IP.
 *     El 429 deja constancia en SU PROPIO evento de auditoría
 *     (`RP_VOLUME_LIMITED`, una vez por ventana por usuario — R4-001): un 429 no
 *     es una denegación de permiso y no toca `RP_PERMISSION_DENIED`;
 *   · la respuesta es `{ data, total, page, pageSize }` con filas
 *     `{ personaId, unidadId, personaNombre }` — el nombre sale de la ficha en
 *     el servidor, porque la pantalla no puede resolver el de una persona fuera
 *     de la primera página del padrón. El conjunto resuelto se pagina en el
 *     servidor con orden determinista (nombre, id).
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { excedeVolumen } from "@/lib/rate-limit-volumen"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { alcancePorFilasDeSesion } from "@/lib/api/sesion-persona"
import { registrarDenegacionCo, registrarLimiteVolumen } from "../_lib/denegacion"

/**
 * Tamaño de página por defecto y tope de la ruta.
 *
 * NO son los cien de las colecciones CO a medida: la consola camina las páginas
 * hasta el `total` que el servidor declara, y cada página es una solicitud
 * contra el techo de volumen de 60/min por usuario. Con lotes de 100, un
 * universo de 6.000 destinatarios necesita 60 solicitudes —las justas para
 * morir en el 429— y el alcance se limpia sin que nadie pueda enviar (F37,
 * `R1-ALCANCE-RATE-LIMIT` del refuter de `review-7ac93a0a9180ee0a`, CRITICAL
 * `introduced` de `337d2a7`). Con 500, ese universo entra en 12. El techo y el
 * contrato del cuerpo no cambian: cambia cuántas filas viajan por respuesta.
 */
const PAGE_SIZE_DEFECTO = 500
const PAGE_SIZE_MAXIMO = 500

/** Fila del alcance: lo que la pantalla imprime y lo que arma el envío. */
interface FilaAlcance {
  personaId: string
  unidadId?: string
  personaNombre: string
}

export async function GET(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const { scope } = resultado

  // El techo de volumen va ANTES del portón. Si quedaba después, un rechazo no se contaba
  // nunca y una cuenta sin privilegios podía inundar la auditoría con `RP_PERMISSION_DENIED`
  // sin tope (hallazgo R1-001 de la revisión nativa).
  // La clave es el usuario, no la IP (una conserjería compartida no se bloquea sola).
  if (excedeVolumen("co-alcance", scope.usuarioId)) {
    // R4-001 (T15): el 429 deja constancia en su PROPIO evento de auditoría,
    // una vez por ventana por usuario — NO por respuesta: una inundación
    // produce un 429 por request y un evento por respuesta reconstruiría la
    // inundación de log que el techo existe para frenar.
    registrarLimiteVolumen(scope.usuarioId)
    return jsonError(429, "Demasiadas solicitudes.")
  }

  // La compuerta del envío masivo: crear sobre `co:difusiones`, la clave GRANULAR de la
  // difusión. La raíz desnuda `co` no sirve en un endpoint nuevo: la MATRIZ ya declara
  // hermanos granulares, así que el fallback de prefijo se la heredaría a todo rol con `co`
  // (candado R1 del repo). Previsualizar el alcance y enviar tienen que exigir lo
  // mismo, que es por qué esta clave existe. El 403 emite RP_PERMISSION_DENIED (AM §Menor
  // Privilegio) porque es un handler a medida, no el factory.
  if (!puede(scope.rol, "crear", "co:difusiones")) {
    registrarDenegacionCo(scope, "co:difusiones", "crear")
    return jsonError(403, "Permiso denegado.")
  }

  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return jsonError(400, "URL de solicitud inválida.")
  }
  // El tope del `page` no es cosmético: fuera del rango de Int, Prisma no llega
  // a rechazar el `skip` porque el recorte es en memoria, pero el tope acota igual.
  const page = Math.min(
    10_000,
    Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  )
  const pageSize = Math.min(
    PAGE_SIZE_MAXIMO,
    Math.max(
      1,
      Number.parseInt(url.searchParams.get("pageSize") ?? String(PAGE_SIZE_DEFECTO), 10) ||
        PAGE_SIZE_DEFECTO
    )
  )

  // Filtros de la pantalla, con sus mismos centinela ("todos"/"todas").
  const macro = url.searchParams.get("macro")?.trim() || "todos"
  const micro = url.searchParams.get("micro")?.trim() || "todos"
  const unidad = url.searchParams.get("unidad")?.trim() || "todas"
  const roles = (url.searchParams.get("roles") ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)

  // Alcance por filas de la serie: comunidad para administración y comité; para
  // un rol acotado, SU persona o NADA — antes de tocar Prisma.
  const alcance = await alcancePorFilasDeSesion(scope)
  if (alcance.tipo === "denegado") {
    return Response.json({ data: [], page, pageSize, total: 0 })
  }

  try {
    // Las unidades del filtro (misma semántica de la pantalla, con los tres
    // ejes aplicados de verdad): unidad puntual > micro > macro (vía sus micro
    // sectores). Sin filtro, el conjunto no restringe y el `personal` entra.
    let idsUnidades: Set<string> | null = null
    if (unidad !== "todas") {
      const filas = await prisma.unidad.findMany({
        where: { comunidadId: scope.comunidadId, id: unidad },
        select: { id: true },
      })
      idsUnidades = new Set(filas.map((u) => u.id))
    } else if (micro !== "todos") {
      const filas = await prisma.unidad.findMany({
        where: { comunidadId: scope.comunidadId, microSectorId: micro },
        select: { id: true },
      })
      idsUnidades = new Set(filas.map((u) => u.id))
    } else if (macro !== "todos") {
      const micros = await prisma.microSector.findMany({
        where: { comunidadId: scope.comunidadId, macroSectorId: macro },
        select: { id: true },
      })
      const filas = micros.length
        ? await prisma.unidad.findMany({
            where: {
              comunidadId: scope.comunidadId,
              microSectorId: { in: micros.map((m) => m.id) },
            },
            select: { id: true },
          })
        : []
      idsUnidades = new Set(filas.map((u) => u.id))
    }

    // Candidatos: cuenta activa de la comunidad (el alcance «propio» de la serie
    // acota, aunque hoy ninguna clave le dé `co` crear a un rol acotado).
    const personas = await prisma.persona.findMany({
      where: {
        comunidadId: scope.comunidadId,
        estadoCuenta: "activa",
        ...(alcance.tipo === "propio" ? { id: alcance.personaId } : {}),
      },
      select: { id: true, nombres: true, apellidos: true, roles: true },
    })

    // Vínculos VIGENTES de la comunidad (`fechaFin: null`), la misma condición
    // del cliente.
    const vinculos = await prisma.vinculoUnidad.findMany({
      where: { comunidadId: scope.comunidadId, fechaFin: null },
      select: { personaId: true, unidadId: true, rol: true },
    })
    const vigentesPorPersona = new Map<string, { unidadId: string; rol: string }[]>()
    for (const v of vinculos) {
      const lista = vigentesPorPersona.get(v.personaId)
      if (lista) lista.push({ unidadId: v.unidadId, rol: v.rol })
      else vigentesPorPersona.set(v.personaId, [{ unidadId: v.unidadId, rol: v.rol }])
    }

    // Las reglas del cliente, fila por fila.
    const resueltos: FilaAlcance[] = []
    for (const p of personas) {
      const vigentes = vigentesPorPersona.get(p.id) ?? []
      // `rolPersona`: roles de los vínculos vigentes, o la ficha menos "directiva".
      const rolesDerivados =
        vigentes.length > 0
          ? vigentes.map((v) => v.rol)
          : Array.isArray(p.roles)
            ? (p.roles as string[]).filter((r) => r !== "directiva")
            : []
      if (rolesDerivados.includes("personal")) {
        // El caso especial: entra sin unidad (el vínculo, si hay, no cuenta) y
        // sólo si el filtro de roles lo incluye. Los filtros de sector no lo
        // traen de vuelta: el recorte final exige unidadId.
        if (roles.includes("personal")) {
          resueltos.push({ personaId: p.id, personaNombre: `${p.nombres} ${p.apellidos}` })
        }
        continue
      }
      if (vigentes.length === 0) continue
      // La primera pareja vigente que calza fija la unidad (el `base.has` del cliente).
      for (const v of vigentes) {
        if (!roles.includes(v.rol)) continue
        resueltos.push({
          personaId: p.id,
          unidadId: v.unidadId,
          personaNombre: `${p.nombres} ${p.apellidos}`,
        })
        break
      }
    }

    // Filtros de sector/unidad: igual que el cliente, exigen unidadId (el
    // `personal` cae) y pertenecer al conjunto visible.
    const filtrados = idsUnidades
      ? resueltos.filter((d) => d.unidadId !== undefined && idsUnidades.has(d.unidadId))
      : resueltos

    // Orden determinista y paginación del conjunto YA resuelto: la resolución
    // mira la comunidad entera, el transporte pagina.
    filtrados.sort(
      (a, b) =>
        a.personaNombre.localeCompare(b.personaNombre) ||
        a.personaId.localeCompare(b.personaId)
    )
    const total = filtrados.length
    const data = filtrados.slice((page - 1) * pageSize, page * pageSize)
    return Response.json({ data, page, pageSize, total })
  } catch (e) {
    logger.error({ err: e }, "[api/co/alcance-masivo] error en GET")
    return jsonError(500, "Error interno del servidor.")
  }
}
