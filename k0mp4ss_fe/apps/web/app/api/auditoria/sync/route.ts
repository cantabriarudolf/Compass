import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { puede } from "@/lib/authz"

export const dynamic = "force-dynamic"

const MAX_BATCH = 500

interface EventoIn {
  id: string
  timestamp: string
  usuario: string
  categoria: string
  tipoAccion: string
  referenciaId: string
  descripcion: string
}

function esEventoValido(e: unknown): e is EventoIn {
  if (!e || typeof e !== "object") return false
  const r = e as Record<string, unknown>
  return (
    typeof r.id === "string" && r.id.trim().length > 0 &&
    typeof r.timestamp === "string" &&
    typeof r.usuario === "string" &&
    typeof r.categoria === "string" &&
    typeof r.tipoAccion === "string" &&
    typeof r.referenciaId === "string" &&
    typeof r.descripcion === "string"
  )
}

async function resolverComunidadId(request: Request, usuarioId: string): Promise<{ comunidadId: string | null; rol?: string; error?: { status: number; body: { error: string } } }> {
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
    return { comunidadId: cid, rol: mem.rol }
  }
  // Sin comunidadId explícito: scope canónico = ÚLTIMA membresía (P2).
  const mem = await prisma.membresia.findFirst({ where: { usuarioId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
  if (!mem) return { comunidadId: null, error: { status: 403, body: { error: "Sin pertenencia a la comunidad" } } }
  return { comunidadId: mem.comunidadId, rol: mem.rol }
}

/**
 * POST /api/auditoria/sync — ingesta batch idempotente (upsert por id), scoped por comunidadId de membresía.
 * Body: { eventos: EventoAuditoria[] } — máx ~500. Sin delete/update.
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

  const { comunidadId, rol, error } = await resolverComunidadId(request, usuario.id)
  if (error) return NextResponse.json(error.body, { status: error.status })
  const cid = comunidadId!

  // P2 security audit (A01): la ingesta de eventos de auditoría es RBAC admin-only
  // (puede(rol, "crear", "am")); comité solo lee. Evita falsificación del rastro AM:80.
  if (!puede(rol ?? "", "crear", "am")) {
    console.warn(`[authz] RP_PERMISSION_DENIED auditoria sync usuario=${usuario.email} rol=${rol ?? "none"} comunidad=${cid}`)
    return NextResponse.json({ error: "Permiso denegado. Requiere rol administrador." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 })
  }
  const eventosRaw = (body as Record<string, unknown>)?.eventos
  if (!Array.isArray(eventosRaw)) {
    return NextResponse.json({ error: "`eventos` debe ser un arreglo" }, { status: 400 })
  }
  if (eventosRaw.length > MAX_BATCH) {
    return NextResponse.json({ error: `Batch demasiado grande: máximo ${MAX_BATCH} eventos` }, { status: 400 })
  }
  if (eventosRaw.length === 0) {
    return NextResponse.json({ ok: true, recibidos: 0, persistidos: 0 })
  }

  // Filtrar solo eventos con forma válida; si alguno inválido, se rechaza el batch completo si todos inválidos?
  // Se persiste solo el delta válido; los inválidos no cuentan como persistidos. Si hay inválidos mezclados, se ignora inválido.
  const validos = eventosRaw.filter(esEventoValido)
  if (validos.length === 0) {
    return NextResponse.json({ error: "Ningún evento válido en el batch" }, { status: 400 })
  }

  let persistidos = 0
  for (const ev of validos) {
    try {
      await prisma.eventoAuditoria.upsert({
        where: { id: ev.id },
        update: {
          comunidadId: cid,
          timestamp: ev.timestamp,
          usuario: ev.usuario,
          categoria: ev.categoria,
          tipoAccion: ev.tipoAccion,
          referenciaId: ev.referenciaId,
          descripcion: ev.descripcion,
        },
        create: {
          id: ev.id,
          comunidadId: cid,
          timestamp: ev.timestamp,
          usuario: ev.usuario,
          categoria: ev.categoria,
          tipoAccion: ev.tipoAccion,
          referenciaId: ev.referenciaId,
          descripcion: ev.descripcion,
        },
      })
      persistidos += 1
    } catch {
      // No bloquea el batch; se cuenta solo los persistidos con éxito
    }
  }

  return NextResponse.json({ ok: true, recibidos: eventosRaw.length, persistidos })
}
