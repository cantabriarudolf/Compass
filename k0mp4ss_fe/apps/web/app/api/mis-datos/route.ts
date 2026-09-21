import { NextResponse, NextRequest } from "next/server"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

/**
 * SERIE-PRODUCCION-FASE2 P6 — derechos ARCO (Ley 21.719).
 * - GET: acceso/portabilidad — todos los datos personales del autenticado.
 * - DELETE: solicitud de eliminación (derecho a olvido). No borra de inmediato
 *   (integridad referencial); marca solicitud + fecha para proceso en 30 días.
 * - PATCH: rectificación — actualiza email/teléfonos de su ficha de persona
 *   (y su email de login si cambia). Todo cambio queda en auditoría.
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

/** Comunidad para anclar eventos de auditoría (primera membresía; null si no hay). */
async function comunidadAncla(usuarioId: string): Promise<string | null> {
  const m = await prisma.membresia.findFirst({ where: { usuarioId }, orderBy: { createdAt: "asc" } })
  return m?.comunidadId ?? null
}

async function auditar(comunidadId: string | null, usuarioId: string, tipoAccion: string, descripcion: string) {
  if (!comunidadId) {
    logger.warn({ event: "ARCO_SIN_COMUNIDAD", usuarioId, tipoAccion }, "ARCO sin comunidad para auditoría")
    return
  }
  try {
    await prisma.eventoAuditoria.create({
      data: {
        id: randomUUID(),
        comunidadId,
        timestamp: new Date().toISOString(),
        usuario: usuarioId,
        categoria: "privacidad",
        tipoAccion,
        referenciaId: usuarioId,
        descripcion,
      },
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

  const body: unknown = await request.json().catch(() => null)
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    )
  }
  if (!usuario.personaId) {
    return NextResponse.json(
      { error: "Su cuenta no tiene ficha de persona asociada. Contacte a administración." },
      { status: 409 }
    )
  }

  const { email, telefonoMovil, telefonoFijo } = parsed.data
  const cambios: string[] = []

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
