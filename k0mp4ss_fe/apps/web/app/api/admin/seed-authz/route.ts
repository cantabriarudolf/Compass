import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { seedUsuariosMembresias } from "@/lib/seed-authz"
import { puede } from "@/lib/authz"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/seed-authz — seed dev 2 comunidades + usuarios TEST (B3, P5)
 * Solo administrador (puede crear admin:usuarios). Idempotente.
 * Primer arranque sin usuarios: usar `npm run seed:authz` (bootstrap CLI),
 * porque con Auth.js el login exige usuarios en BD (fail-closed).
 */
export async function POST() {
  const sesion = await auth()
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }
  const usuario = await prisma.usuario.findUnique({ where: { id: sesion.user.id } })
  if (!usuario || !usuario.activo) {
    return NextResponse.json({ error: "Usuario no encontrado o inactivo" }, { status: 401 })
  }
  const membresia = await prisma.membresia.findFirst({ where: { usuarioId: usuario.id } })
  if (!membresia || !puede(membresia.rol, "crear", "admin:usuarios")) {
    return NextResponse.json({ error: "Permiso denegado. Requiere rol administrador." }, { status: 403 })
  }

  try {
    const result = await seedUsuariosMembresias()
    return NextResponse.json(result)
  } catch (e) {
    console.error("[seed-authz] error", e)
    return NextResponse.json({ error: "No se pudo crear seed" }, { status: 500 })
  }
}
