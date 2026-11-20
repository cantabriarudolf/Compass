/**
 * /api/comunidad-actual — la identidad de la comunidad activa: nombre y logo.
 *
 * GET es una PROYECCIÓN de solo lectura. Los dos componentes que envuelven TODA la
 * app (`app-sidebar` y `community-header`) necesitan exclusivamente el nombre de la
 * comunidad y su logo. Leerlos de `GET /api/configuracion` era imposible para la app
 * completa: esa ruta gatea con `cf: ver` (solo administrador y comité en la
 * matriz — criterio la respuesta no cambia) y conserjería, residente y mantención
 * obtenían 403 y caían al fallback. La solución es el mismo patrón de operación que
 * F6 (`/api/pe/personas`, `/api/pe/unidades`, `/api/pe/maestros`): una proyección
 * angosta con el scope de la sesión y sin permiso adicional, porque cualquier sesión
 * con comunidad válida ya opera la app.
 *
 * **Nombre: una sola fuente (S1 de `odd/tasks/identidad-unica.md`).** El nombre sale
 * de `Comunidad.nombre` y de ningún otro lado. `ConfiguracionGlobal.nombreComunidad`
 * quedó deprecada el 2026-11-20: no se lee ni se escribe acá, ni en la pantalla, ni
 * en los papeles. El logo sigue viviendo en CF porque es la única superficie donde
 * se carga (`components/admin/logo-uploader.tsx`), y es opcional: sin fila de
 * configuración el encabezado cae a su ícono (IconCommand) sin error.
 *
 * PUT es el único camino de escritura del nombre: renombra `Comunidad.nombre` con
 * `cf: editar` (es la identidad legal de la comunidad, la misma compuerta con la que
 * se edita el resto de la identidad en `/admin/configuracion`). No hay POST ni
 * DELETE: la comunidad existe o no existe, no se crea desde acá. No toca la fila de
 * CF ni su columna deprecada.
 *
 * Qué NO expone: nada del resto de `ConfiguracionGlobal` — ni SMTP (`smtpHost`,
 * `smtpUser`, `smtpPassword`), ni claves (`claveEliminacionMaestro`), ni parámetros
 * legales (UF, SIS), ni naturaleza/estado de la comunidad — ni licencia, ni forma de
 * Administrador, ni forma de Usuario. Los `select` de Prisma son cerrados a
 * propósito: no hay `spread` del registro.
 *
 * Envelope: `{ data: { nombre, logoUrl } }`.
 */
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { puede } from "@/lib/authz"
import { NombreComunidadSchema } from "@/lib/schemas"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

/** La regla del nombre es la del contrato, no una copia. */
const NombreDeLaComunidadSchema = z.object({ nombre: NombreComunidadSchema })

/** La marca de la comunidad: el nombre de la fila y el logo de CF (si hay fila). */
async function marcaDe(comunidadId: string): Promise<
  | { ok: true; nombre: string; logoUrl: string | null }
  | { ok: false }
> {
  const [comunidad, configuracion] = await Promise.all([
    prisma.comunidad.findUnique({
      where: { id: comunidadId },
      select: { nombre: true },
    }),
    prisma.configuracionGlobal.findUnique({
      where: { comunidadId },
      select: { logoUrl: true },
    }),
  ])
  if (!comunidad) return { ok: false }
  return {
    ok: true,
    nombre: comunidad.nombre,
    logoUrl: configuracion?.logoUrl?.trim() || null,
  }
}

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  try {
    const marca = await marcaDe(scope.comunidadId)
    if (!marca.ok) {
      // La membresía del scope apunta a una comunidad que ya no existe: el resto de
      // la API la trata igual de mal si el vínculo ruge sin raíz — acá se responde
      // francamente.
      return jsonError(404, "Comunidad no encontrada.")
    }
    return Response.json({ data: { nombre: marca.nombre, logoUrl: marca.logoUrl } })
  } catch (e) {
    logger.error({ err: e }, "[api/comunidad-actual] error inesperado")
    return jsonError(500, "No se pudo consultar la comunidad.")
  }
}

export async function PUT(req: Request): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "editar", "cf")) {
    return jsonError(403, "Permiso denegado.")
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.")
  }

  const parsed = NombreDeLaComunidadSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "El nombre de la comunidad es obligatorio.")
  }
  // El contrato exige no-vacío después de recortar: "   " no es un nombre.
  const nombre = parsed.data.nombre.trim()
  if (nombre === "") {
    return jsonError(400, "El nombre de la comunidad es obligatorio.")
  }

  try {
    const comunidad = await prisma.comunidad.findUnique({
      where: { id: scope.comunidadId },
      select: { id: true },
    })
    if (!comunidad) return jsonError(404, "Comunidad no encontrada.")

    await prisma.comunidad.update({
      where: { id: scope.comunidadId },
      data: { nombre },
    })

    const marca = await marcaDe(scope.comunidadId)
    if (!marca.ok) return jsonError(404, "Comunidad no encontrada.")
    return Response.json({ data: { nombre: marca.nombre, logoUrl: marca.logoUrl } })
  } catch (e) {
    logger.error({ err: e }, "[api/comunidad-actual] error al renombrar")
    return jsonError(500, "No se pudo actualizar la comunidad.")
  }
}
