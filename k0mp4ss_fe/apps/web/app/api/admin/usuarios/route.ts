import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { puede } from "@/lib/authz"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/usuarios
 * - SIN comunidadId: comunidades donde el usuario autenticado tiene membresía
 *   ({ comunidades: [{ id, nombre, rol }] }) — sin datos de terceros (RP /admin/permisos).
 * - CON comunidadId (query ?comunidadId= o header x-comunidad-id): lista membresías +
 *   usuarios de esa comunidad.
 * Autorización server-side (SG §4.1): proxy solo autentica, aquí se decide puede(rol, ver, admin:usuarios).
 * Sesión vía Auth.js: sub = Usuario.id en BD (AU §3 P5).
 */
export async function GET(request: NextRequest) {
  const sesion = await auth()
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }

  const url = new URL(request.url)
  const comunidadId =
    url.searchParams.get("comunidadId") ??
    request.headers.get("x-comunidad-id") ??
    request.headers.get("x-comunidadId")

  const usuario = await prisma.usuario.findUnique({ where: { id: sesion.user.id } })
  if (!usuario || !usuario.activo) {
    return NextResponse.json({ error: "Usuario no encontrado o inactivo" }, { status: 401 })
  }

  // Rama sin comunidadId: comunidades propias (vista /admin/permisos, solo lectura)
  if (!comunidadId || typeof comunidadId !== "string" || comunidadId.trim().length === 0) {
    const propias = await prisma.membresia.findMany({
      where: { usuarioId: usuario.id },
      include: { comunidad: true },
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json({
      comunidades: propias.map((m) => ({
        id: m.comunidadId,
        nombre: (m as unknown as { comunidad: { nombre: string } }).comunidad.nombre,
        rol: m.rol,
      })),
    })
  }

  const cid = comunidadId.trim()

  // Verifica que la comunidad existe (D3 tenant existe)
  const comunidad = await prisma.comunidad.findUnique({ where: { id: cid } })
  if (!comunidad) {
    return NextResponse.json({ error: "Comunidad no encontrada" }, { status: 404 })
  }

  const membresia = await prisma.membresia.findFirst({
    where: { usuarioId: usuario.id, comunidadId: cid },
  })

  if (!membresia) {
    return NextResponse.json({ error: "Sin pertenencia a la comunidad" }, { status: 403 })
  }

  if (!puede(membresia.rol, "ver", "admin:usuarios")) {
    // RP Menor privilegio → RP_PERMISSION_DENIED (AM) — se loguea server side
    // P3: sin PII en logs — identificamos por usuario.id, nunca email.
    logger.warn({ event: "RP_PERMISSION_DENIED", usuarioId: usuario.id, rol: membresia.rol, recurso: "admin:usuarios", comunidadId: cid }, "[authz] RP_PERMISSION_DENIED admin:usuarios")
    return NextResponse.json({ error: "Permiso denegado. Requiere rol administrador." }, { status: 403 })
  }

  // Scoping obligatorio via comunidadId (D3) — solo datos de esa comunidad (C1b)
  const membresias = await prisma.membresia.findMany({
    where: { comunidadId: cid },
    include: { usuario: true },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({
    comunidadId: cid,
    comunidadNombre: comunidad.nombre,
    total: membresias.length,
    membresias: membresias.map((m) => ({
      id: m.id,
      rol: m.rol,
      comunidadId: m.comunidadId,
      usuario: {
        id: (m as unknown as { usuario: { id: string; email: string; personaId: string | null; activo: boolean } }).usuario.id,
        email: (m as unknown as { usuario: { email: string } }).usuario.email,
        personaId: (m as unknown as { usuario: { personaId: string | null } }).usuario.personaId,
        activo: (m as unknown as { usuario: { activo: boolean } }).usuario.activo,
      },
    })),
  })
}

/**
 * PATCH /api/admin/usuarios
 * Actualiza un usuario (rol o estado activo). Requiere admin.
 * SERIE-PRODUCCION-FASE2 P2: incrementa tokenVersion al cambiar rol o desactivar,
 * invalidando sesiones activas del usuario.
 */
export async function PATCH(request: NextRequest) {
  const sesion = await auth()
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }

  const url = new URL(request.url)
  const comunidadId =
    url.searchParams.get("comunidadId") ??
    request.headers.get("x-comunidad-id") ??
    request.headers.get("x-comunidadId")

  if (!comunidadId || typeof comunidadId !== "string") {
    return NextResponse.json({ error: "comunidadId requerido" }, { status: 400 })
  }

  const cid = comunidadId.trim()
  const adminMembresia = await prisma.membresia.findFirst({
    where: { usuarioId: sesion.user.id, comunidadId: cid },
  })

  if (!adminMembresia || !puede(adminMembresia.rol, "editar", "admin:usuarios")) {
    return NextResponse.json({ error: "Permiso denegado" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }

  const usuarioId = String(body.usuarioId ?? "")
  if (!usuarioId) {
    return NextResponse.json({ error: "usuarioId requerido" }, { status: 400 })
  }

  // Verificar que el usuario pertenece a la comunidad
  const membresia = await prisma.membresia.findFirst({
    where: { usuarioId, comunidadId: cid },
  })
  if (!membresia) {
    return NextResponse.json({ error: "Usuario no pertenece a la comunidad" }, { status: 404 })
  }

  const cambiaRol = typeof body.rol === "string"
  const cambiaActivo = typeof body.activo === "boolean"

  if (cambiaRol) {
    await prisma.membresia.update({
      where: { id: membresia.id },
      data: { rol: String(body.rol) },
    })
  }

  if (cambiaActivo) {
    await prisma.usuario.update({
      where: { id: usuarioId },
      data: { activo: Boolean(body.activo) },
    })
  }

  // P2: invalidar sesiones si cambió rol o desactivó
  if (cambiaRol || (cambiaActivo && body.activo === false)) {
    await prisma.usuario.update({
      where: { id: usuarioId },
      data: { tokenVersion: { increment: 1 } },
    })
    logger.info({ event: "SESSION_INVALIDATED", usuarioId, adminId: sesion.user.id, comunidadId: cid }, "Sesión invalidada por cambio de rol/estado")
  }

  return NextResponse.json({ ok: true, cambios: { rol: cambiaRol, activo: cambiaActivo } })
}
