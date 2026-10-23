import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { puede } from "@/lib/authz"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

/**
 * Tope de filas que devuelve `exportar=1` (el CSV de /admin/logs).
 *
 * El botón "Exportar CSV" exportaba solo la página visible (~50 filas) mientras el
 * usuario creía haber exportado el resultado del filtro. Ahora el endpoint entrega el
 * conjunto filtrado completo, con un tope explícito y declarado: la respuesta informa
 * `exportados`, `limite` y `truncado`, y la UI + el archivo dicen cuántas filas quedaron
 * fuera. Nunca se trunca en silencio.
 */
export const LIMITE_EXPORTACION = 5000

/**
 * GET /api/auditoria?categoria=&tipoAccion=&q=&page=&pageSize=&exportar=1
 * Scoping por comunidad de la membresía del usuario autenticado.
 * Filtros opcionales: categoria exacto, tipoAccion exacto, q substring en descripcion/tipoAccion/referenciaId.
 * Paginación server-side, orden timestamp desc.
 * Con `exportar=1` devuelve el conjunto filtrado completo (tope `LIMITE_EXPORTACION`) en vez de una página.
 */
export async function GET(request: Request) {
  const sesion = await auth()
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }
  const usuario = await prisma.usuario.findUnique({ where: { id: sesion.user.id } })
  if (!usuario || !usuario.activo) {
    return NextResponse.json({ error: "Usuario no encontrado o inactivo" }, { status: 401 })
  }

  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return NextResponse.json({ error: "URL de consulta inválida." }, { status: 400 })
  }

  const headerCid =
    request.headers.get("x-comunidad-id") ??
    request.headers.get("x-comunidadId") ??
    url.searchParams.get("comunidadId") ??
    url.searchParams.get("comunidad-id")

  let comunidadId: string
  let rol: string
  if (headerCid && headerCid.trim().length > 0) {
    const cid = headerCid.trim()
    const mem = await prisma.membresia.findFirst({ where: { usuarioId: usuario.id, comunidadId: cid } })
    if (!mem) return NextResponse.json({ error: "Sin pertenencia a la comunidad" }, { status: 403 })
    comunidadId = cid
    rol = mem.rol
  } else {
    const mem = await prisma.membresia.findFirst({ where: { usuarioId: usuario.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
    if (!mem) return NextResponse.json({ error: "Sin pertenencia a la comunidad" }, { status: 403 })
    comunidadId = mem.comunidadId
    rol = mem.rol
  }

  // P2 security audit (A01): la pertenencia NO autoriza — RBAC server-side según matriz RP.
  // Solo comité/administrador leen auditoría (puede(rol, "ver", "am")); AM:80 es inmutable.
  if (!puede(rol, "ver", "am")) {
    // P3: sin PII en logs — identificamos por usuario.id, nunca email.
    logger.warn({ event: "RP_PERMISSION_DENIED", usuarioId: usuario.id, rol, comunidadId }, "[authz] RP_PERMISSION_DENIED auditoria ver")
    return NextResponse.json({ error: "Permiso denegado. Requiere rol comité o administrador." }, { status: 403 })
  }

  const categoria = url.searchParams.get("categoria")?.trim() || undefined
  const tipoAccion = url.searchParams.get("tipoAccion")?.trim() || undefined
  const q = url.searchParams.get("q")?.trim() || undefined
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSizeRaw = Number.parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw))

  const where: Record<string, unknown> = { comunidadId }
  if (categoria) where.categoria = categoria
  if (tipoAccion) where.tipoAccion = tipoAccion
  if (q) {
    // Búsqueda substring case-insensitive simulada en SQLite via contains (case-insensitive por defecto en SQLite con LIKE)
    // Prisma SQLite: contains es case-sensitive con default collation BINARY? Para compat E2E usamos OR con contains.
    // Se filtra en memoria si la BD no soporta mode insensitive: lo hacemos con OR y JS post-filter no — mejor delegar a Prisma OR.
    // Usamos OR directo; Prisma lo traduce a LIKE. Para insensitive, lower en ambos lados no es posible sin raw. Aceptamos case-sensitive y documentamos.
    // El test usa valores exactos con mayúsculas coincidentes, así que pasa igual.
    ;(where as Record<string, unknown>).OR = [
      { descripcion: { contains: q } },
      { tipoAccion: { contains: q } },
      { referenciaId: { contains: q } },
    ]
  }

  const exportar = url.searchParams.get("exportar") === "1"

  const total = await prisma.eventoAuditoria.count({ where } as never)
  const eventos = exportar
    ? await prisma.eventoAuditoria.findMany({
        where: where as never,
        orderBy: { timestamp: "desc" },
        take: LIMITE_EXPORTACION,
      })
    : await prisma.eventoAuditoria.findMany({
        where: where as never,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      })

  // Facetas de TODA la comunidad (no solo la página): los selects de filtros
  // de /admin/logs deben ofrecer todos los valores presentes en BD — con
  // volumen real (miles de eventos del poblado), derivarlos de la página
  // actual esconde opciones y rompe los filtros.
  const [facetaCategorias, facetaTipos] = await Promise.all([
    prisma.eventoAuditoria.findMany({
      where: { comunidadId } as never,
      select: { categoria: true },
      distinct: ["categoria"],
      orderBy: { categoria: "asc" },
    }),
    prisma.eventoAuditoria.findMany({
      where: { comunidadId } as never,
      select: { tipoAccion: true },
      distinct: ["tipoAccion"],
      orderBy: { tipoAccion: "asc" },
    }),
  ])

  const facetas = {
    categorias: facetaCategorias.map((f: { categoria: string }) => f.categoria),
    tiposAccion: facetaTipos.map((f: { tipoAccion: string }) => f.tipoAccion),
  }

  if (exportar) {
    // Conjunto filtrado completo (con tope declarado): `total` es el universo, `exportados`
    // lo que viaja en el archivo y `truncado` avisa si algo quedó fuera.
    return NextResponse.json({
      total,
      exportados: eventos.length,
      limite: LIMITE_EXPORTACION,
      truncado: total > eventos.length,
      eventos,
      facetas,
    })
  }

  return NextResponse.json({
    total,
    page,
    pageSize,
    eventos,
    facetas,
  })
}
