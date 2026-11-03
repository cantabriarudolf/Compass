/**
 * /api/comunidad/directorio — PUERTA DE LECTURA del directorio de emergencias.
 *
 * El directorio es información de la comunidad: la matriz RP declara
 * `pe:directorio` ver para residente, conserjería, mantención y comité (más el
 * comodín del administrador), o sea para los cinco roles. Pero los contactos se
 * leían de `/api/maestros/contactos-emergencia`, cuyo gate es el del maestro
 * administrativo (`mp` ver: bancos, AFP, feriados, condiciones especiales) y que
 * conserjería, residente y mantención no tienen: la pantalla abría y la lectura
 * respondía 403, así que el directorio se pintaba vacío para tres de los cinco
 * roles.
 *
 * Decisión del owner: `pe:directorio` NO se angosta (todos siguen leyendo el
 * directorio). Lo que se separa es la puerta, con el mismo patrón que ya usa
 * `/api/pe/proyecciones/enviar` para `pe:proyeccion:enviar` y que
 * `/api/comunidad-actual` usa para la marca de la comunidad:
 *
 *   - LECTURA para todos: esta ruta, gateada con `pe:directorio` ver.
 *   - ADMINISTRACIÓN del maestro: sigue siendo del administrador en
 *     `/api/maestros/contactos-emergencia`, con su gate `mp` intacto. Acá no se
 *     toca ni se relaja `mp`.
 *
 * Qué expone — y qué no:
 * - SOLO los contactos de emergencia de la comunidad de la sesión, y solo sus
 *   campos de directorio (`id`, `categoria`, `nombre`, `telefono`, `sitioWeb`).
 *   El `select` de Prisma es cerrado a propósito: nada de `comunidadId`,
 *   `createdAt`, `updatedAt`.
 * - Ningún otro maestro. La ruta NO recibe un `tipo`: no hay segmento dinámico ni
 *   parámetro que elegir, así que pedirle bancos, AFP o condiciones especiales
 *   es imposible por diseño, no por desuso (`?tipo=bancos` se ignora: el handler
 *   no lee la URL).
 * - Ningún verbo de escritura: el módulo exporta solo `GET`, así que crear,
 *   editar o borrar un contacto sigue siendo un acto administrativo (POST/PUT/
 *   DELETE del maestro con `mp`).
 *
 * Envelope: `{ data: ContactoEmergencia[], total: number }`.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"

/** Recurso RBAC del directorio: lectura de toda la comunidad, sin `mp`. */
const RECURSO_DIRECTORIO = "pe:directorio"

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  // Mismo permiso que el portón de la página: si la matriz habilita a un rol
  // nuevo para `pe:directorio`, la lectura se abre sin tocar este archivo.
  if (!puede(scope.rol, "ver", RECURSO_DIRECTORIO)) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const filas = await prisma.contactoEmergencia.findMany({
      where: { comunidadId: scope.comunidadId },
      // Mismo orden que el maestro administrativo (más reciente primero), con el
      // id como desempate para que dos filas del mismo instante no alternen.
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        categoria: true,
        nombre: true,
        telefono: true,
        sitioWeb: true,
      },
    })

    // Los opcionales salen como `null` de SQLite; el contrato del contacto
    // (`ContactoEmergencia` en lib/schemas.ts) los declara opcionales.
    const data = filas.map(({ categoria, sitioWeb, ...resto }) => ({
      ...resto,
      ...(categoria !== null ? { categoria } : {}),
      ...(sitioWeb !== null ? { sitioWeb } : {}),
    }))

    return Response.json({ data, total: data.length })
  } catch (e) {
    logger.error({ err: e }, "[api/comunidad/directorio] error inesperado")
    return jsonError(500, "No se pudo consultar el directorio de emergencias.")
  }
}
