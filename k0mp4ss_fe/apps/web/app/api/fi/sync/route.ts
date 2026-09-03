import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

export const dynamic = "force-dynamic"

const MAX_BATCH = 500

interface FondoIn {
  id: string
  nombre: string
  tipo: string
  descripcion?: string
  porcentajeAporte?: number
  activo: boolean
  saldoInicial?: number
}

interface EgresoIn {
  id: string
  folio?: string
  fecha: string
  categoria: string
  descripcion: string
  monto: number
  fondoId: string
  esRecurrente?: boolean
  proveedor?: string
  unidadId?: string
}

interface IngresoIn {
  id: string
  fecha: string
  monto: number
  concepto: string
  fondoId: string
  familia?: string
}

function esTexto(r: Record<string, unknown>, k: string): boolean {
  return typeof r[k] === "string" && (r[k] as string).trim().length > 0
}

function esPositivo(r: Record<string, unknown>, k: string): boolean {
  return typeof r[k] === "number" && Number.isFinite(r[k] as number) && (r[k] as number) > 0
}

function esOpcionalTexto(r: Record<string, unknown>, k: string): boolean {
  return r[k] === undefined || (typeof r[k] === "string" && (r[k] as string).trim().length > 0)
}

function esOpcionalNoNegativo(r: Record<string, unknown>, k: string): boolean {
  return r[k] === undefined || (typeof r[k] === "number" && Number.isFinite(r[k] as number) && (r[k] as number) >= 0)
}

function esFondoValido(f: unknown): f is FondoIn {
  if (!f || typeof f !== "object") return false
  const r = f as Record<string, unknown>
  return (
    esTexto(r, "id") &&
    esTexto(r, "nombre") &&
    esTexto(r, "tipo") &&
    typeof r.activo === "boolean" &&
    esOpcionalTexto(r, "descripcion") &&
    esOpcionalNoNegativo(r, "porcentajeAporte") &&
    esOpcionalNoNegativo(r, "saldoInicial")
  )
}

function esEgresoValido(e: unknown): e is EgresoIn {
  if (!e || typeof e !== "object") return false
  const r = e as Record<string, unknown>
  return (
    esTexto(r, "id") &&
    esTexto(r, "fecha") &&
    esTexto(r, "categoria") &&
    esTexto(r, "descripcion") &&
    esPositivo(r, "monto") &&
    esTexto(r, "fondoId") &&
    esOpcionalTexto(r, "folio") &&
    esOpcionalTexto(r, "proveedor") &&
    esOpcionalTexto(r, "unidadId") &&
    (r.esRecurrente === undefined || typeof r.esRecurrente === "boolean")
  )
}

function esIngresoValido(i: unknown): i is IngresoIn {
  if (!i || typeof i !== "object") return false
  const r = i as Record<string, unknown>
  return (
    esTexto(r, "id") &&
    esTexto(r, "fecha") &&
    esPositivo(r, "monto") &&
    esTexto(r, "concepto") &&
    esTexto(r, "fondoId") &&
    esOpcionalTexto(r, "familia")
  )
}

async function resolverComunidadId(request: Request, usuarioId: string): Promise<{ comunidadId: string | null; error?: { status: number; body: { error: string } } }> {
  const url = new URL(request.url)
  const headerCid =
    request.headers.get("x-comunidad-id") ??
    request.headers.get("x-comunidadId") ??
    url.searchParams.get("comunidadId") ??
    url.searchParams.get("comunidad-id")

  if (headerCid && headerCid.trim().length > 0) {
    const cid = headerCid.trim()
    const mem = await prisma.membresia.findFirst({ where: { usuarioId, comunidadId: cid } })
    if (!mem) return { comunidadId: null, error: { status: 403, body: { error: "Sin pertenencia a la comunidad" } } }
    return { comunidadId: cid }
  }
  // Sin comunidadId explícito: primera membresía del usuario (orden creación)
  const mem = await prisma.membresia.findFirst({ where: { usuarioId }, orderBy: { createdAt: "asc" } })
  if (!mem) return { comunidadId: null, error: { status: 403, body: { error: "Sin pertenencia a la comunidad" } } }
  return { comunidadId: mem.comunidadId }
}

/**
 * POST /api/fi/sync — espejo BD de Finanzas (fi-sync-bd): ingesta batch idempotente
 * (upsert por id) de fondos (con saldoInicial), egresos e ingresos, scoped por
 * comunidadId de membresía. Sin delete. Máx 500 elementos sumados por petición.
 * Body: { fondos?: FondoIn[], egresos?: EgresoIn[], ingresos?: IngresoIn[] }
 */
export async function POST(request: Request) {
  const sesion = await auth()
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }
  const usuario = await prisma.usuario.findUnique({ where: { id: sesion.user.id } })
  if (!usuario || !usuario.activo) {
    return NextResponse.json({ error: "Usuario no encontrado o inactivo" }, { status: 401 })
  }

  const { comunidadId, error } = await resolverComunidadId(request, usuario.id)
  if (error) return NextResponse.json(error.body, { status: error.status })
  const cid = comunidadId!

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 })
  }

  const b = (body ?? {}) as Record<string, unknown>
  const fondosRaw = Array.isArray(b.fondos) ? b.fondos : []
  const egresosRaw = Array.isArray(b.egresos) ? b.egresos : []
  const ingresosRaw = Array.isArray(b.ingresos) ? b.ingresos : []
  const recibidos = fondosRaw.length + egresosRaw.length + ingresosRaw.length
  if (recibidos === 0) {
    return NextResponse.json({ ok: true, recibidos: 0, persistidos: 0, porColeccion: { fondos: 0, egresos: 0, ingresos: 0 }, idsPersistidos: [] })
  }
  if (recibidos > MAX_BATCH) {
    return NextResponse.json({ error: `Batch demasiado grande: máximo ${MAX_BATCH} elementos` }, { status: 400 })
  }

  const fondos = fondosRaw.filter(esFondoValido)
  const egresos = egresosRaw.filter(esEgresoValido)
  const ingresos = ingresosRaw.filter(esIngresoValido)
  if (fondos.length === 0 && egresos.length === 0 && ingresos.length === 0) {
    return NextResponse.json({ error: "Ningún elemento válido en el batch" }, { status: 400 })
  }

  let persistidos = 0
  const idsPersistidos: string[] = []
  let pf = 0
  let pe = 0
  let pi = 0

  for (const f of fondos) {
    try {
      await prisma.fondoFI.upsert({
        where: { id: f.id },
        update: {
          comunidadId: cid,
          nombre: f.nombre,
          tipo: f.tipo,
          descripcion: f.descripcion,
          porcentajeAporte: f.porcentajeAporte,
          activo: f.activo,
          saldoInicial: f.saldoInicial,
        },
        create: {
          id: f.id,
          comunidadId: cid,
          nombre: f.nombre,
          tipo: f.tipo,
          descripcion: f.descripcion,
          porcentajeAporte: f.porcentajeAporte,
          activo: f.activo,
          saldoInicial: f.saldoInicial,
        },
      })
      persistidos += 1
      pf += 1
      idsPersistidos.push(f.id)
    } catch {
      // No bloquea el batch
    }
  }

  for (const e of egresos) {
    try {
      await prisma.egresoFI.upsert({
        where: { id: e.id },
        update: {
          comunidadId: cid,
          folio: e.folio,
          fecha: e.fecha,
          categoria: e.categoria,
          descripcion: e.descripcion,
          monto: e.monto,
          fondoId: e.fondoId,
          esRecurrente: e.esRecurrente ?? false,
          proveedor: e.proveedor,
          unidadId: e.unidadId,
        },
        create: {
          id: e.id,
          comunidadId: cid,
          folio: e.folio,
          fecha: e.fecha,
          categoria: e.categoria,
          descripcion: e.descripcion,
          monto: e.monto,
          fondoId: e.fondoId,
          esRecurrente: e.esRecurrente ?? false,
          proveedor: e.proveedor,
          unidadId: e.unidadId,
        },
      })
      persistidos += 1
      pe += 1
      idsPersistidos.push(e.id)
    } catch {
      // No bloquea el batch
    }
  }

  for (const i of ingresos) {
    try {
      await prisma.ingresoFI.upsert({
        where: { id: i.id },
        update: {
          comunidadId: cid,
          fondoId: i.fondoId,
          fecha: i.fecha,
          monto: i.monto,
          concepto: i.concepto,
          familia: i.familia,
        },
        create: {
          id: i.id,
          comunidadId: cid,
          fondoId: i.fondoId,
          fecha: i.fecha,
          monto: i.monto,
          concepto: i.concepto,
          familia: i.familia,
        },
      })
      persistidos += 1
      pi += 1
      idsPersistidos.push(i.id)
    } catch {
      // No bloquea el batch
    }
  }

  return NextResponse.json({
    ok: true,
    recibidos,
    persistidos,
    porColeccion: { fondos: pf, egresos: pe, ingresos: pi },
    idsPersistidos,
  })
}
