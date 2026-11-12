/**
 * /api/configuracion/correo — credencial SMTP POR COMUNIDAD, cifrada en la base
 * (F33, `specs/PENDIENTES-FUNCIONALIDAD.md`).
 *
 * Qué resuelve: hasta acá la contraseña del buzón vivía en UNA sola variable de
 * entorno (`SMTP_PASSWORD`), así que un despliegue con dos comunidades y dos
 * buzones no podía autenticar en la segunda. Acá el secreto se guarda por
 * comunidad, cifrado con AES-256-GCM (ver `lib/cifrado-secretos.ts`).
 *
 * El contrato de la lectura es angosto a propósito:
 *   `{ configurada, host, puerto, usuario, actualizadoEn, actualizadoPor }`
 * No existe campo para el secreto ni para el paquete cifrado, y el `select` de
 * la base NI SIQUIERA pide las columnas del cifrado: el texto plano no puede
 * viajar al navegador porque no entra en memoria desde la base.
 *
 * La clave maestra sale SOLO de `CLAVE_MAESTRA_SECRETOS` (entorno del servidor):
 * no se guarda en la base, no entra en los backups, no se devuelve y no se
 * loguea. Si falta o es inválida, el guardado responde 500 con el mensaje que
 * nombra la variable y NO se escribe ninguna fila: falla cerrada, nunca cae a
 * texto plano ni a la `SMTP_PASSWORD` global.
 *
 * Authz: recurso `cf`, el mismo que gobierna la configuración global —
 * `ver` para leer (administración y comité), `editar` para guardar (solo
 * administración). El `comunidadId` sale del scope del servidor, nunca del
 * cuerpo.
 *
 * Auditoría: `CF_CREDENCIAL_CORREO_ACTUALIZADA`, emitido en la MISMA transacción
 * que la escritura (si la bitácora no se puede escribir, no hay cambio de
 * credencial a medias). La descripción dice que se cargó o se rotó y NADA del
 * valor: ni el secreto, ni su prefijo, ni su longitud, ni un hash.
 */
import { puede } from "@/lib/authz"
import { prisma } from "@/lib/prisma"
import { jsonError, withComunidadScope } from "@/lib/api/with-comunidad-scope"
import { logger } from "@/lib/logger"
import { generarId } from "@/lib/id-utils"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import { CredencialCorreoComunidadSchema } from "@/lib/schemas"
import { cifrarSecreto, estadoClaveMaestra } from "@/lib/cifrado-secretos"

/**
 * Forma EXACTA de la respuesta. Un campo nuevo acá es una decisión de contrato:
 * hoy no hay ninguno que pueda llevar el secreto ni el paquete cifrado.
 */
interface CredencialVisible {
  configurada: boolean
  host: string | null
  puerto: number | null
  usuario: string | null
  actualizadoEn: string | null
  actualizadoPor: string | null
}

/** Columnas que se leen y se devuelven: sin `secretoCifrado`, sin `iv`, sin `authTag`. */
const CAMPOS_VISIBLES = {
  host: true,
  puerto: true,
  usuario: true,
  actualizadoEn: true,
  actualizadoPor: true,
} as const

/** Una fila leída con `CAMPOS_VISIBLES` (más `id` cuando la escritura lo necesita). */
interface FilaVisible {
  host: string
  puerto: number
  usuario: string
  actualizadoEn: Date
  actualizadoPor: string
}

const SIN_CREDENCIAL: CredencialVisible = {
  configurada: false,
  host: null,
  puerto: null,
  usuario: null,
  actualizadoEn: null,
  actualizadoPor: null,
}

const DESCRIPCION_ALTA =
  "Se cargó la credencial de correo de la comunidad. El secreto se guardó cifrado (AES-256-GCM) y no se registra su valor."
const DESCRIPCION_ROTACION =
  "Se rotó la credencial de correo de la comunidad. El secreto se guardó cifrado (AES-256-GCM) y no se registra su valor."

function visible(fila: FilaVisible): CredencialVisible {
  return {
    configurada: true,
    host: fila.host,
    puerto: fila.puerto,
    usuario: fila.usuario,
    actualizadoEn: fila.actualizadoEn.toISOString(),
    actualizadoPor: fila.actualizadoPor,
  }
}

export async function GET(): Promise<Response> {
  const resultado = await withComunidadScope()
  if (!resultado.ok) return resultado.response
  const scope = resultado.scope

  if (!puede(scope.rol, "ver", "cf")) {
    return jsonError(403, "Permiso denegado.")
  }

  try {
    const fila = await prisma.credencialCorreoComunidad.findUnique({
      where: { comunidadId: scope.comunidadId },
      select: CAMPOS_VISIBLES,
    })
    return Response.json(fila ? visible(fila) : SIN_CREDENCIAL)
  } catch (e) {
    logger.error({ err: e }, "[configuracion/correo] error GET")
    return jsonError(500, "Error interno del servidor.")
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

  const parsed = CredencialCorreoComunidadSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "Datos inválidos.", { detalles: parsed.error.flatten() })
  }

  // Fail-closed ANTES de tocar la base: sin clave maestra no hay cifrado, y sin
  // cifrado no se guarda el secreto. Nunca se escribe texto plano "por ahora".
  const estadoClave = estadoClaveMaestra()
  if (estadoClave === "ausente") {
    return jsonError(
      500,
      "No se puede guardar la credencial de correo: falta la clave maestra de secretos en el servidor (CLAVE_MAESTRA_SECRETOS)."
    )
  }
  if (estadoClave === "invalida") {
    return jsonError(
      500,
      "No se puede guardar la credencial de correo: la clave maestra de secretos del servidor (CLAVE_MAESTRA_SECRETOS) no es válida (se esperan 32 bytes en hex o en base64)."
    )
  }

  const { host, puerto, usuario, secreto } = parsed.data

  let paquete: { secretoCifrado: string; iv: string; authTag: string }
  try {
    paquete = cifrarSecreto(secreto)
  } catch (e) {
    // La clave cambió entre el chequeo y el cifrado (o el entorno se movió): se
    // responde igual que una clave inválida y no se escribe nada.
    logger.error({ err: e }, "[configuracion/correo] no se pudo cifrar el secreto")
    return jsonError(
      500,
      "No se puede guardar la credencial de correo: la clave maestra de secretos del servidor (CLAVE_MAESTRA_SECRETOS) no es válida (se esperan 32 bytes en hex o en base64)."
    )
  }

  try {
    const anterior = await prisma.credencialCorreoComunidad.findUnique({
      where: { comunidadId: scope.comunidadId },
      select: { id: true },
    })
    const alta = anterior === null

    const guardada = await prisma.$transaction(async (tx) => {
      const fila = await tx.credencialCorreoComunidad.upsert({
        where: { comunidadId: scope.comunidadId },
        update: {
          host,
          puerto,
          usuario,
          secretoCifrado: paquete.secretoCifrado,
          iv: paquete.iv,
          authTag: paquete.authTag,
          version: 1,
          actualizadoPor: scope.usuarioId,
        },
        create: {
          id: generarId("cred"),
          comunidadId: scope.comunidadId,
          host,
          puerto,
          usuario,
          secretoCifrado: paquete.secretoCifrado,
          iv: paquete.iv,
          authTag: paquete.authTag,
          version: 1,
          actualizadoPor: scope.usuarioId,
        },
        select: { id: true, ...CAMPOS_VISIBLES },
      })

      await registrarEventoAuditoria(
        {
          id: generarId("ev"),
          comunidadId: scope.comunidadId,
          timestamp: new Date().toISOString(),
          usuario: scope.usuarioId,
          categoria: "CF",
          tipoAccion: "CF_CREDENCIAL_CORREO_ACTUALIZADA",
          referenciaId: fila.id,
          descripcion: alta ? DESCRIPCION_ALTA : DESCRIPCION_ROTACION,
        },
        tx
      )

      return fila
    })

    return Response.json(visible(guardada), { status: alta ? 201 : 200 })
  } catch (e) {
    logger.error({ err: e }, "[configuracion/correo] error PUT")
    return jsonError(500, "Error interno del servidor.")
  }
}
