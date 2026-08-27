import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { NOMBRE_COOKIE_SESION, verificarToken } from "@/lib/auth"
import { puede } from "@/lib/authz"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/usuarios?comunidadId=xxx
 * Lista membresías + usuarios de la comunidad del contexto.
 * Autorización server-side (SG §4.1): proxy solo autentica, aquí se decide puede(rol, ver, admin:usuarios).
 * Headers alternativos: x-comunidad-id
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(NOMBRE_COOKIE_SESION)?.value
  const sesion = verificarToken(token)
  if (!sesion) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }

  const url = new URL(request.url)
  const comunidadId =
    url.searchParams.get("comunidadId") ??
    request.headers.get("x-comunidad-id") ??
    request.headers.get("x-comunidadId")

  if (!comunidadId || typeof comunidadId !== "string" || comunidadId.trim().length === 0) {
    return NextResponse.json({ error: "comunidadId es requerido (query ?comunidadId= o header x-comunidad-id)" }, { status: 400 })
  }

  const cid = comunidadId.trim()

  // Verifica que la comunidad existe (D3 tenant existe)
  const comunidad = await prisma.comunidad.findUnique({ where: { id: cid } })
  if (!comunidad) {
    return NextResponse.json({ error: "Comunidad no encontrada" }, { status: 404 })
  }

  const usuario = await prisma.usuario.findUnique({ where: { email: sesion.sub } })
  if (!usuario || !usuario.activo) {
    return NextResponse.json({ error: "Usuario no encontrado o inactivo" }, { status: 401 })
  }

  const membresia = await prisma.membresia.findFirst({
    where: { usuarioId: usuario.id, comunidadId: cid },
  })

  if (!membresia) {
    return NextResponse.json({ error: "Sin pertenencia a la comunidad" }, { status: 403 })
  }

  if (!puede(membresia.rol, "ver", "admin:usuarios")) {
    // RP Menor privilegio → RP_PERMISSION_DENIED (AM) — se loguea server side
    console.warn(`[authz] RP_PERMISSION_DENIED usuario=${usuario.email} rol=${membresia.rol} recurso=admin:usuarios comunidad=${cid}`)
    return NextResponse.json({ error: "Permiso denegado. Requiere rol administrador." }, { status: 403 })
  }

  // Scoping obligatorio via comunidadId (D3) — solo datos de esa comunidad (C1b)
  const membresias = await prisma.membresia.findMany({
    where: { comunidadId: cid },
    include: { usuario: true },
    orderBy: { createdAt: "asc" },
  })

  // También demuestra scoping de repo (opcional): personas de la comunidad
  // const repo = crearRepositorio(cid)
  // const personas = await repo.personas.findMany()

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
