import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * GET /api/fi?fondoId=&q=&page=&pageSize= — lectura del espejo BD de Finanzas (fi-sync-bd).
 * Retorna egresos e ingresos paginados (misma page/pageSize), fondos completos y
 * totales agregados por fondo (conteos + sumas de monto, saldo = COALESCE(saldoInicial,0)
 * + ingresos - egresos). Scoped por comunidad de la membresía del usuario autenticado.
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

  const url = new URL(request.url)
  const headerCid =
    request.headers.get("x-comunidad-id") ??
    request.headers.get("x-comunidadId") ??
    url.searchParams.get("comunidadId") ??
    url.searchParams.get("comunidad-id")

  let comunidadId: string
  if (headerCid && headerCid.trim().length > 0) {
    const cid = headerCid.trim()
    const mem = await prisma.membresia.findFirst({ where: { usuarioId: usuario.id, comunidadId: cid } })
    if (!mem) return NextResponse.json({ error: "Sin pertenencia a la comunidad" }, { status: 403 })
    comunidadId = cid
  } else {
    const mem = await prisma.membresia.findFirst({ where: { usuarioId: usuario.id }, orderBy: { createdAt: "asc" } })
    if (!mem) return NextResponse.json({ error: "Sin pertenencia a la comunidad" }, { status: 403 })
    comunidadId = mem.comunidadId
  }

  const fondoId = url.searchParams.get("fondoId")?.trim() || undefined
  const q = url.searchParams.get("q")?.trim() || undefined
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSizeRaw = Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw))
  const skip = (page - 1) * pageSize
  const take = pageSize

  const whereEgresos: Record<string, unknown> = { comunidadId }
  if (fondoId) whereEgresos.fondoId = fondoId
  if (q) {
    whereEgresos.OR = [
      { descripcion: { contains: q } },
      { folio: { contains: q } },
    ]
  }
  const whereIngresos: Record<string, unknown> = { comunidadId }
  if (fondoId) whereIngresos.fondoId = fondoId
  if (q) {
    whereIngresos.OR = [
      { concepto: { contains: q } },
      { familia: { contains: q } },
    ]
  }

  const [totalEgresos, egresos, totalIngresos, ingresos, fondos, agrupEgresos, agrupIngresos] = await Promise.all([
    prisma.egresoFI.count({ where: whereEgresos } as never),
    prisma.egresoFI.findMany({
      where: whereEgresos as never,
      orderBy: [{ fecha: "asc" }, { folio: "asc" }],
      skip,
      take,
    }),
    prisma.ingresoFI.count({ where: whereIngresos } as never),
    prisma.ingresoFI.findMany({
      where: whereIngresos as never,
      orderBy: { fecha: "asc" },
      skip,
      take,
    }),
    prisma.fondoFI.findMany({ where: { comunidadId } as never, orderBy: { nombre: "asc" } }),
    prisma.egresoFI.groupBy({ by: ["fondoId"], _count: { _all: true }, _sum: { monto: true }, where: { comunidadId } as never }),
    prisma.ingresoFI.groupBy({ by: ["fondoId"], _count: { _all: true }, _sum: { monto: true }, where: { comunidadId } as never }),
  ])

  const mapaEgresos = new Map(agrupEgresos.map((g) => [g.fondoId, g]))
  const mapaIngresos = new Map(agrupIngresos.map((g) => [g.fondoId, g]))
  const totalesPorFondo = fondos.map((f) => {
    const ge = mapaEgresos.get(f.id)
    const gi = mapaIngresos.get(f.id)
    const saldoInicial = f.saldoInicial ?? 0
    const montoEgresos = ge?._sum.monto ?? 0
    const montoIngresos = gi?._sum.monto ?? 0
    return {
      fondoId: f.id,
      nombre: f.nombre,
      saldoInicial,
      egresos: ge?._count._all ?? 0,
      montoEgresos,
      ingresos: gi?._count._all ?? 0,
      montoIngresos,
      saldo: saldoInicial + montoIngresos - montoEgresos,
    }
  })

  return NextResponse.json({
    page,
    pageSize,
    egresos: { total: totalEgresos, items: egresos },
    ingresos: { total: totalIngresos, items: ingresos },
    fondos,
    totalesPorFondo,
  })
}
