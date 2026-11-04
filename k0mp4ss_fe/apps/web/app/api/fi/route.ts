import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { puede } from "@/lib/authz"
import { logger } from "@/lib/logger"
import { saldoFondo } from "@/lib/finanzas-utils"
import type { ConceptoCobroFI, LineaCobroFI, PagoCobroFI } from "@/lib/schemas"

export const dynamic = "force-dynamic"

/**
 * GET /api/fi?fondoId=&q=&page=&pageSize= — lectura del espejo BD de Finanzas (fi-sync-bd).
 * Retorna egresos e ingresos paginados (misma page/pageSize), fondos completos y
 * totales agregados por fondo (conteos + sumas de monto). El `saldo` de cada fondo
 * suma su apertura y sus ingresos manuales, resta sus egresos y acredita lo que las
 * unidades PAGARON en los cobros, imputado por las LÍNEAS de cada cobro (S5): el
 * recargo de reserva vive en cobros del fondo de gasto común, así que repartirlo por
 * `cobro.fondoId` le negaría la caja al fondo de reserva. Scoped por comunidad de la
 * membresía del usuario autenticado.
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
  // Solo comité/administrador leen finanzas (puede(rol, "ver", "fi")); conserjería/residente/mantención no (RP §Roles Estándar).
  if (!puede(rol, "ver", "fi")) {
    // P3: sin PII en logs — identificamos por usuario.id, nunca email.
    logger.warn({ event: "RP_PERMISSION_DENIED", usuarioId: usuario.id, rol, comunidadId }, "[authz] RP_PERMISSION_DENIED fi ver")
    return NextResponse.json({ error: "Permiso denegado. Requiere rol comité o administrador." }, { status: 403 })
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

  const [totalEgresos, egresos, totalIngresos, ingresos, fondos, agrupEgresos, agrupIngresos, cobros] = await Promise.all([
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
    // Los cobros entran en la MISMA ronda de consultas: uno solo para toda la
    // comunidad, nunca uno por fondo. Se piden únicamente las columnas que
    // deciden el reparto de lo pagado.
    prisma.cobroFI.findMany({
      where: { comunidadId } as never,
      select: { fondoId: true, pagos: true, concepto: true, montoBase: true, lineas: true },
    }),
  ])

  type AgrupFI = {
    fondoId: string
    _count: { _all: number }
    _sum: { monto: number | null }
  }
  const mapaEgresos = new Map(agrupEgresos.map((g: AgrupFI) => [g.fondoId, g]))
  const mapaIngresos = new Map(agrupIngresos.map((g: AgrupFI) => [g.fondoId, g]))
  // Los cobros de la comunidad, ya en memoria: `saldoFondo` reparte lo pagado por
  // las líneas de cada cobro (el cobro legacy sin detalle es una línea a su propio
  // fondo) y es la MISMA fórmula del guard de retiros y del saldo de proyectos MT.
  const cobrosDeLaComunidad = cobros.map((c) => ({
    fondoId: c.fondoId,
    // SAFETY: pagos es Json con shape PagoCobroFI[] validado por CobroFISchema.
    pagos: (c.pagos ?? []) as unknown as PagoCobroFI[],
    // SAFETY: concepto es String en BD con los valores de ConceptoCobroFISchema.
    concepto: c.concepto as ConceptoCobroFI,
    montoBase: c.montoBase,
    // SAFETY: lineas es Json con shape LineaCobroFI[] validado por CobroFISchema.
    lineas: c.lineas as unknown as LineaCobroFI[] | null,
  }))
  // Los agregados que ya se cuentan en la respuesta alimentan la misma resta del
  // saldo, así `saldo` y los contadores no pueden divergir.
  const egresosPorFondo = agrupEgresos.map((g: AgrupFI) => ({ fondoId: g.fondoId, monto: g._sum.monto ?? 0 }))
  const ingresosPorFondo = agrupIngresos.map((g: AgrupFI) => ({ fondoId: g.fondoId, monto: g._sum.monto ?? 0 }))
  const totalesPorFondo = fondos.map((f: (typeof fondos)[number]) => {
    const ge = mapaEgresos.get(f.id) as AgrupFI | undefined
    const gi = mapaIngresos.get(f.id) as AgrupFI | undefined
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
      saldo: saldoFondo(f.id, {
        cobros: cobrosDeLaComunidad,
        egresos: egresosPorFondo,
        ingresosFI: ingresosPorFondo,
        saldoInicialPorFondo: { [f.id]: saldoInicial },
      }),
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
