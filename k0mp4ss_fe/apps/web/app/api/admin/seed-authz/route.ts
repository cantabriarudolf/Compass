import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { NOMBRE_COOKIE_SESION, verificarToken } from "@/lib/auth"
import { seedUsuariosMembresias } from "@/lib/seed-authz"
import { puede } from "@/lib/authz"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/seed-authz — seed dev 2 comunidades + usuarios TEST (B3)
 * Solo administrador o dev sin authz aún (fallback legado). Idempotente.
 */
export async function POST(request: NextRequest) {
  // En dev permitimos seed sin membresia previa si es admin legado; en P5 será estricto.
  const token = request.cookies.get(NOMBRE_COOKIE_SESION)?.value
  const sesion = verificarToken(token)
  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }
  const adminEmailFallback = process.env.ADMIN_EMAIL ?? "admin@compass.local"
  const esAdminLegado = sesion.sub === adminEmailFallback || sesion.sub === "admin@compass.local"
  let esAdmin = esAdminLegado
  if (!esAdminLegado) {
    const usuario = await prisma.usuario.findUnique({ where: { email: sesion.sub } })
    if (usuario) {
      const membresia = await prisma.membresia.findFirst({ where: { usuarioId: usuario.id } })
      if (membresia && puede(membresia.rol, "crear", "admin:usuarios")) esAdmin = true
    }
  }
  // En dev, si aún no hay usuarios, permite a cualquier autenticado crear seed (primer bootstrap)
  const totalUsuarios = await prisma.usuario.count().catch(() => 0)
  if (!esAdmin && totalUsuarios > 0) {
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

export async function GET(request: NextRequest) {
  return POST(request)
}
