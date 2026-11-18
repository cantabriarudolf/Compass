import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { puede } from "@/lib/authz"
import { logger } from "@/lib/logger"
import { randomUUID } from "node:crypto"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import {
  CATEGORIA_AUDITORIA_CUENTAS,
  crearInvitacionDeAcceso,
} from "@/lib/invitacion-acceso"

export const dynamic = "force-dynamic"

/** Se lanzan dentro de la transacción para que el rechazo no deje nada a medias. */
class CuentaNoPertenece extends Error {}
class CuentaYaDefinioContrasena extends Error {}
class CuentaInactiva extends Error {}

const MENSAJE_YA_DEFINIO_CONTRASENA =
  "La cuenta ya definió su contraseña: la invitación no se puede reenviar."
const MENSAJE_CUENTA_INACTIVA =
  "La cuenta está inactiva: activala antes de reenviar la invitación."

/**
 * POST /api/admin/usuarios/invitacion — reenvío de la invitación de acceso (F42 · T2).
 *
 * Qué hace: emite una invitación NUEVA para una cuenta que ya existe y deja la
 * anterior inservible **en el mismo acto**. La anterior no se borra —la bitácora
 * de a quién se invitó y cuándo es parte de S4/S5— sino que se vence en el
 * instante del reenvío: `definirPasswordConInvitacion` exige `expiraEn` futuro,
 * así que un enlace viejo deja de abrir nada. El criterio es del owner: dos
 * enlaces vivos para la misma cuenta son dos puertas.
 *
 * Quién: el mismo portón que el alta —`administrador` de la comunidad de la
 * sesión (`puede(rol, "crear", "admin:usuarios")`)—, porque reenviar es volver a
 * crear la puerta de entrada de esa cuenta.
 *
 * Qué NO devuelve: el token. Igual que el alta, la respuesta sólo trae la forma
 * pública (`InvitacionAccesoPublica`); el secreto lo transporta F43.
 *
 * Cuándo NO se reenvía: si la cuenta ya definió su contraseña (`passwordHash`) el
 * enlace no tiene qué habilitar, y si está inactiva el login la rechaza aunque
 * defina una: emitirlo sería prometer un acceso que el sistema niega. Los dos son
 * 409 con texto propio, y el chequeo corre DENTRO de la transacción para que el
 * veredicto no dependa de una lectura que otra petición pueda cambiar.
 */
export async function POST(request: NextRequest) {
  const sesion = await auth()
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }

  const url = new URL(request.url)
  const comunidadId =
    url.searchParams.get("comunidadId") ??
    request.headers.get("x-comunidad-id") ??
    request.headers.get("x-comunidadId")

  if (
    !comunidadId ||
    typeof comunidadId !== "string" ||
    comunidadId.trim().length === 0
  ) {
    return NextResponse.json({ error: "comunidadId requerido" }, { status: 400 })
  }
  const cid = comunidadId.trim()

  const actor = await prisma.usuario.findUnique({ where: { id: sesion.user.id } })
  if (!actor || !actor.activo) {
    return NextResponse.json(
      { error: "Usuario no encontrado o inactivo" },
      { status: 401 }
    )
  }

  const comunidad = await prisma.comunidad.findUnique({ where: { id: cid } })
  if (!comunidad) {
    return NextResponse.json({ error: "Comunidad no encontrada" }, { status: 404 })
  }

  const membresiaActor = await prisma.membresia.findFirst({
    where: { usuarioId: actor.id, comunidadId: cid },
  })
  if (!membresiaActor) {
    return NextResponse.json(
      { error: "Sin pertenencia a la comunidad" },
      { status: 403 }
    )
  }

  if (!puede(membresiaActor.rol, "crear", "admin:usuarios")) {
    logger.warn(
      {
        event: "RP_PERMISSION_DENIED",
        usuarioId: actor.id,
        rol: membresiaActor.rol,
        recurso: "admin:usuarios",
        accion: "reenviar_invitacion",
        comunidadId: cid,
      },
      "[authz] RP_PERMISSION_DENIED admin:usuarios"
    )
    return NextResponse.json(
      { error: "Permiso denegado. Requiere rol administrador." },
      { status: 403 }
    )
  }

  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }
  const datos = (
    cuerpo !== null && typeof cuerpo === "object" ? cuerpo : {}
  ) as Record<string, unknown>
  const usuarioId =
    typeof datos.usuarioId === "string" ? datos.usuarioId.trim() : ""
  if (!usuarioId) {
    return NextResponse.json({ error: "usuarioId requerido" }, { status: 400 })
  }

  // La cuenta tiene que ser de ESTA comunidad. El 404 es el mismo del PATCH y el
  // mismo para una cuenta inexistente: no se cuenta qué existe fuera del tenant.
  const membresiaDestino = await prisma.membresia.findFirst({
    where: { usuarioId, comunidadId: cid },
    select: { id: true },
  })
  if (!membresiaDestino) {
    return NextResponse.json(
      { error: "Usuario no pertenece a la comunidad" },
      { status: 404 }
    )
  }

  let resultado: {
    invitacion: Awaited<ReturnType<typeof crearInvitacionDeAcceso>>["invitacion"]
    invalidadas: number
  }

  try {
    resultado = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.usuario.findUnique({
        where: { id: usuarioId },
        select: { passwordHash: true, activo: true },
      })
      // La membresía se leyó arriba; si la cuenta desapareció en el medio, el
      // mismo 404 que si nunca hubiera estado en esta comunidad.
      if (!cuenta) throw new CuentaNoPertenece()
      if (!cuenta.activo) throw new CuentaInactiva()
      if (cuenta.passwordHash !== null) throw new CuentaYaDefinioContrasena()

      const ahora = new Date()
      // La anterior deja de servir AHORA: vencida, con el rastro intacto.
      const invalidadas = await tx.invitacionAcceso.updateMany({
        where: {
          usuarioId,
          comunidadId: cid,
          usadoEn: null,
          expiraEn: { gt: ahora },
        },
        data: { expiraEn: ahora },
      })

      const { invitacion } = await crearInvitacionDeAcceso({
        usuarioId,
        comunidadId: cid,
        creadoPor: actor.id,
        ahora,
        client: tx,
      })

      await registrarEventoAuditoria(
        {
          id: randomUUID(),
          comunidadId: cid,
          timestamp: ahora.toISOString(),
          usuario: actor.id,
          categoria: CATEGORIA_AUDITORIA_CUENTAS,
          tipoAccion: "invitacion_reenviada",
          referenciaId: usuarioId,
          descripcion:
            "La administración reenvió la invitación de acceso de un solo uso; la anterior quedó vencida en el mismo acto.",
        },
        tx
      )

      return { invitacion, invalidadas: invalidadas.count }
    })
  } catch (error) {
    if (error instanceof CuentaYaDefinioContrasena) {
      return NextResponse.json(
        { error: MENSAJE_YA_DEFINIO_CONTRASENA },
        { status: 409 }
      )
    }
    if (error instanceof CuentaInactiva) {
      return NextResponse.json(
        { error: MENSAJE_CUENTA_INACTIVA },
        { status: 409 }
      )
    }
    if (error instanceof CuentaNoPertenece) {
      return NextResponse.json(
        { error: "Usuario no pertenece a la comunidad" },
        { status: 404 }
      )
    }
    throw error
  }

  // Sólo estado: ni token, ni hash, ni `passwordHash` en la respuesta.
  return NextResponse.json(
    {
      ok: true,
      invitacion: resultado.invitacion,
      invalidadas: resultado.invalidadas,
    },
    { status: 201 }
  )
}
