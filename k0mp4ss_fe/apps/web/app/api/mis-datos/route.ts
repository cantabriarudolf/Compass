import { NextResponse, NextRequest } from "next/server"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import {
  emailCanonico,
  MENSAJE_EMAIL_DUPLICADO,
  personaConEmailDuplicado,
} from "@/lib/invariantes/persona"
import { auth } from "@/lib/auth"
import { puede } from "@/lib/authz"
import { logger } from "@/lib/logger"
import { registrarEventoAuditoria } from "@/lib/auditoria"

export const dynamic = "force-dynamic"

/**
 * SERIE-PRODUCCION-FASE2 P6 — derechos ARCO (Ley 21.719).
 * - GET: acceso/portabilidad — todos los datos personales del autenticado.
 * - DELETE: solicitud de eliminación (derecho a olvido). No borra de inmediato
 *   (integridad referencial); marca solicitud + fecha para proceso en 30 días.
 * - PATCH: rectificación — actualiza email/teléfonos de su ficha de persona
 *   (y su email de login si cambia). Todo cambio queda en auditoría.
 *
 * A1b (serie «Permisos por objeto», 2026-11-09): la rectificación es el acto que
 * la matriz describe como «el residente edita sus propios datos» (`mp:propios`
 * ver+editar para comité, conserjería, residente y mantención; el administrador
 * por comodín). Hasta hoy la ruta escribía la ficha mirando sólo la sesión, así
 * que la clave no tenía puerta. El PATCH pide ahora `puede(rol, "editar",
 * "mp:propios")` **además** del alcance por `personaId`, que no se toca: la
 * puerta dice «puede editar su ficha», el `where` dice «y sólo la suya».
 * El rol sale de la membresía canónica de la cuenta (la última, el mismo criterio
 * con el que se ancla la auditoría) y, si no hay ninguna, se niega: un rol que la
 * matriz no conoce no edita nada (la serie falla cerrado desde T16).
 * GET y DELETE quedan sin la clave a propósito: son derechos ARCO sobre la
 * propia cuenta —leer lo que el sistema guarda de uno y pedir el borrado—, no
 * editan datos y no alcanzan la fila de un tercero.
 */

const PatchSchema = z
  .object({
    email: z.string().trim().email("Correo electrónico inválido.").optional(),
    telefonoMovil: z.string().trim().min(6, "Teléfono móvil inválido.").max(20).optional(),
    telefonoFijo: z.string().trim().max(20).optional().nullable(),
  })
  .refine((d) => d.email !== undefined || d.telefonoMovil !== undefined || d.telefonoFijo !== undefined, {
    message: "Indique al menos un campo a actualizar.",
  })

async function usuarioAutenticado() {
  const sesion = await auth()
  if (!sesion?.user?.id) return null
  const usuario = await prisma.usuario.findUnique({ where: { id: sesion.user.id } })
  if (!usuario || !usuario.activo) return null
  return usuario
}

/** Membresía canónica de la cuenta: la última (`comunidadAncla` y el rol salen de acá). */
async function membresiaAncla(usuarioId: string) {
  return prisma.membresia.findFirst({
    where: { usuarioId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
}

/** Comunidad para anclar eventos de auditoría (scope canónico: ÚLTIMA membresía; null si no hay). */
async function comunidadAncla(usuarioId: string): Promise<string | null> {
  const m = await membresiaAncla(usuarioId)
  return m?.comunidadId ?? null
}

async function auditar(comunidadId: string | null, usuarioId: string, tipoAccion: string, descripcion: string) {
  if (!comunidadId) {
    logger.warn({ event: "ARCO_SIN_COMUNIDAD", usuarioId, tipoAccion }, "ARCO sin comunidad para auditoría")
    return
  }
  try {
    await registrarEventoAuditoria({
      id: randomUUID(),
      comunidadId,
      timestamp: new Date().toISOString(),
      usuario: usuarioId,
      categoria: "privacidad",
      tipoAccion,
      referenciaId: usuarioId,
      descripcion,
    })
  } catch {
    // intencional: la auditoría nunca bloquea el derecho ARCO
  }
}

export async function GET() {
  const usuario = await usuarioAutenticado()
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }

  const [membresias, persona, eventos] = await Promise.all([
    prisma.membresia.findMany({
      where: { usuarioId: usuario.id },
      include: { comunidad: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: "asc" },
    }),
    usuario.personaId
      ? prisma.persona.findUnique({ where: { id: usuario.personaId } })
      : Promise.resolve(null),
    prisma.eventoAuditoria.findMany({
      where: { OR: [{ usuario: usuario.id }, { usuario: usuario.email }, { referenciaId: usuario.id }] },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ])

  return NextResponse.json({
    cuenta: {
      id: usuario.id,
      email: usuario.email,
      activo: usuario.activo,
      creadoEn: usuario.createdAt,
      autenticacion2FA: usuario.twoFactorEnabled,
      solicitudEliminacion: usuario.solicitudEliminacion,
      solicitudEliminacionAt: usuario.solicitudEliminacionAt,
    },
    persona,
    membresias: membresias.map((m: (typeof membresias)[number]) => ({
      comunidad: m.comunidad,
      rol: m.rol,
      desde: m.createdAt,
    })),
    actividad: eventos,
  })
}

export async function DELETE() {
  const usuario = await usuarioAutenticado()
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }
  if (usuario.solicitudEliminacion) {
    return NextResponse.json(
      { ok: true, mensaje: "Ya existe una solicitud de eliminación en curso." },
      { status: 200 }
    )
  }

  const ahora = new Date()
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { solicitudEliminacion: true, solicitudEliminacionAt: ahora },
  })
  const cid = await comunidadAncla(usuario.id)
  await auditar(cid, usuario.id, "ARCO_ELIMINACION_SOLICITADA", "Solicitud de eliminación de datos (derecho a olvido).")
  logger.info({ event: "ARCO_ELIMINACION_SOLICITADA", usuarioId: usuario.id }, "Solicitud de eliminación registrada")

  return NextResponse.json({
    ok: true,
    mensaje: "Solicitud registrada. Será procesada en un plazo de 30 días.",
  })
}

export async function PATCH(request: NextRequest) {
  const usuario = await usuarioAutenticado()
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }

  // A1b — la puerta de la matriz. Va después de «¿hay ficha que editar?» (409,
  // que es un hecho de la cuenta y no un permiso) y antes de leer el cuerpo: un
  // rol que no puede editar su propia ficha no gasta validación ni escribe nada.
  if (!usuario.personaId) {
    return NextResponse.json(
      { error: "Su cuenta no tiene ficha de persona asociada. Contacte a administración." },
      { status: 409 }
    )
  }

  const membresia = await membresiaAncla(usuario.id)
  if (!membresia || !puede(membresia.rol, "editar", "mp:propios")) {
    return NextResponse.json(
      { error: "Permiso denegado: su rol no permite editar sus datos personales." },
      { status: 403 }
    )
  }

  const body: unknown = await request.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    )
  }

  const { email, telefonoMovil, telefonoFijo } = parsed.data
  const cambios: string[] = []

  // INV-01 (docs/INVARIANTES.md): la regla "email de Persona único por
  // comunidad" tiene un solo dueño (`lib/invariantes/persona.ts`) y esta ruta
  // la aplicaba de menos: escribía `Persona.email` mirando solo `Usuario.email`.
  // El rechazo es duro y previo a cualquier escritura: ni la cuenta ni la ficha
  // cambian si el correo ya es de otra persona de la comunidad.
  if (email !== undefined) {
    const ficha = await prisma.persona.findUnique({
      where: { id: usuario.personaId },
      select: { comunidadId: true },
    })
    if (!ficha) {
      return NextResponse.json(
        { error: "Su cuenta no tiene ficha de persona asociada. Contacte a administración." },
        { status: 409 }
      )
    }
    if (
      await personaConEmailDuplicado(
        ficha.comunidadId,
        emailCanonico(email),
        usuario.personaId
      )
    ) {
      return NextResponse.json({ error: MENSAJE_EMAIL_DUPLICADO }, { status: 409 })
    }
  }

  if (email !== undefined && email.toLowerCase() !== usuario.email) {
    const ocupado = await prisma.usuario.findUnique({ where: { email: email.toLowerCase() } })
    if (ocupado && ocupado.id !== usuario.id) {
      return NextResponse.json({ error: "Ese correo ya está en uso por otra cuenta." }, { status: 409 })
    }
    await prisma.usuario.update({ where: { id: usuario.id }, data: { email: email.toLowerCase() } })
    cambios.push("email de cuenta")
  }

  const dataPersona: Record<string, string | null> = {}
  if (email !== undefined) {
    dataPersona.email = email.toLowerCase()
    cambios.push("email de persona")
  }
  if (telefonoMovil !== undefined) {
    dataPersona.telefonoMovil = telefonoMovil
    cambios.push("teléfono móvil")
  }
  if (telefonoFijo !== undefined) {
    dataPersona.telefonoFijo = telefonoFijo
    cambios.push("teléfono fijo")
  }
  if (Object.keys(dataPersona).length > 0) {
    await prisma.persona.update({ where: { id: usuario.personaId }, data: dataPersona })
  }

  const cid = await comunidadAncla(usuario.id)
  await auditar(cid, usuario.id, "ARCO_RECTIFICACION", `Datos actualizados: ${cambios.join(", ") || "sin cambios"}.`)
  logger.info({ event: "ARCO_RECTIFICACION", usuarioId: usuario.id, cambios }, "Datos personales actualizados")

  const actualizado = await prisma.usuario.findUnique({ where: { id: usuario.id } })
  return NextResponse.json({ ok: true, cambios, email: actualizado?.email ?? usuario.email })
}
