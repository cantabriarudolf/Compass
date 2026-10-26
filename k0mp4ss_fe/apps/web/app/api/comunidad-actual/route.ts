/**
 * /api/comunidad-actual — PROYECCIÓN de solo lectura con la marca de la comunidad activa.
 *
 * Los dos componentes que envuelven TODA la app (`app-sidebar` y `community-header`) necesitan
 * exclusivamente el nombre de la comunidad y su logo. Leerlos de `GET /api/configuracion` era
 * imposible para la app completa: esa ruta gatea con `cf: ver` (solo administrador y comité en la
 * matriz — criterio la respuesta no cambia) y conserjería, residente y mantención obtenían 403 y
 * caían al fallback. La solución es el mismo patrón de operación que F6 (`/api/pe/personas`,
 * `/api/pe/unidades`, `/api/pe/maestros`): una proyección angosta con el scope de la sesión y sin
 * permiso adicional, porque cualquier sesión con comunidad válida ya opera la app.
 *
 * Qué NO expone: nada del resto de `ConfiguracionGlobal` — ni SMTP (`smtpHost`, `smtpUser`,
 * `smtpPassword`), ni claves (`claveEliminacionMaestro`), ni parámetros legales (UF, SIS), ni
 * naturaleza/estado de la comunidad — ni licencia, ni forma de Administrador, ni forma de Usuario.
 * El `select` de Prisma es cerrado a propósito: no hay `spread` del registro.
 * No permite escribir: la configuración sigue viviendo en `CF_UPDATE_PARAM`, medio SMTP y del
 * recurso `cf`, referidos a la vida del proceso.
 *
 * Resolución del nombre: `ConfiguracionGlobal.nombreComunidad` si hay fila y el valor no viene
 * vacío; si no, `Comunidad.nombre` (la efectos, la comunidad raíz siempre existe junto a sus
 * membresías, pero el respaldo la responde y no tira 500 si alguna gota la borra).
 * El logo es opcional por diseño: no hay fila de configuración, así que el encabezado
 * cae a su ícono (IconCommand) sin error.
 *
 * Envelope: `{ data: { nombre, logoUrl } }`.
 */
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  try {
    const [comunidad, configuracion] = await Promise.all([
      prisma.comunidad.findUnique({
        where: { id: scope.comunidadId },
        select: { nombre: true },
      }),
      prisma.configuracionGlobal.findUnique({
        where: { comunidadId: scope.comunidadId },
        select: { nombreComunidad: true, logoUrl: true },
      }),
    ])
    if (!comunidad) {
      // La membresía del scope apunta a una comunidad que ya no existe: el resto de la API la
      // trata igual de mal si el vínculo ruge sin raíz — acá se responde francamente.
      return jsonError(404, "Comunidad no encontrada.")
    }
    const nombre = configuracion?.nombreComunidad.trim() || comunidad.nombre
    const logoUrl = configuracion?.logoUrl?.trim() || null

    return Response.json({ data: { nombre, logoUrl } })
  } catch (e) {
    logger.error({ err: e }, "[api/comunidad-actual] error inesperado")
    return jsonError(500, "No se pudo consultar la comunidad.")
  }
}
