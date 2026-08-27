import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { saveBackup } from '@/lib/backup';
import { isWriteApiEnabled } from '@/lib/env-guard';
import { prisma } from '@/lib/prisma';
import { NOMBRE_COOKIE_SESION, verificarToken } from '@/lib/auth';
import { puede } from '@/lib/authz';

export const dynamic = 'force-dynamic';

const MAX_BACKUP_BYTES = 10 * 1024 * 1024; // 10 MB

function extraerToken(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const viaNext = (request as unknown as NextRequest).cookies?.get?.(NOMBRE_COOKIE_SESION)?.value
  if (viaNext) return viaNext
  const match = cookieHeader.match(new RegExp(`${NOMBRE_COOKIE_SESION}=([^;]+)`))
  return match ? decodeURIComponent(match[1]!) : null
}

export async function POST(request: Request) {
  if (!isWriteApiEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  // B3: autorización fina server-side (SG §4.1) — solo administrador puede ejecutar backup
  // proxy.ts ya verificó autenticación (401), aquí se verifica rol via lib/authz.ts
  {
    const token = extraerToken(request)
    const sesion = verificarToken(token)
    if (!sesion) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
    }
    let usuario = await prisma.usuario.findUnique({ where: { email: sesion.sub } }) as { id: string; email: string; activo: boolean } | null
    // Fallback dev: si BD aún sin seed y sub es admin legado, permitir como administrador global (transición B3)
    const adminEmailFallback = process.env.ADMIN_EMAIL ?? 'admin@compass.local'
    const esAdminLegado = sesion.sub === adminEmailFallback || sesion.sub === 'admin@compass.local'
    if (!usuario) {
      if (esAdminLegado) {
        // bypass DB check: trata como admin sin membresia (hasta que se ejecute seed)
        usuario = { id: '__legacy__', email: sesion.sub, activo: true }
        // crea membresia virtual admin para permitir
        const virtualRol = 'administrador'
        if (!puede(virtualRol, 'ejecutar', 'backup')) {
          return NextResponse.json({ error: 'Permiso denegado. Requiere rol administrador.' }, { status: 403 })
        }
        // permite sin seguir comprobaciones de comunidad
        // salta al bloque de backup
        // (no hace falta validar comunidadId)
        // continúa directamente
      } else {
        return NextResponse.json({ error: 'Usuario no encontrado o inactivo' }, { status: 401 })
      }
    } else if (!usuario.activo) {
      return NextResponse.json({ error: 'Usuario no encontrado o inactivo' }, { status: 401 })
    } else {
      let membresia: { rol: string } | null = null
      const comunidadId =
        request.headers.get('x-comunidad-id') ?? request.headers.get('x-comunidadId') ?? new URL(request.url).searchParams.get('comunidadId')
      if (comunidadId) {
        membresia = await prisma.membresia.findFirst({ where: { usuarioId: usuario.id, comunidadId } })
        if (!membresia) {
          return NextResponse.json({ error: 'Sin pertenencia a la comunidad' }, { status: 403 })
        }
      } else {
        // sin comunidadId: busca cualquier membresia administradora
        membresia = await prisma.membresia.findFirst({ where: { usuarioId: usuario.id, rol: 'administrador' } })
        if (!membresia) {
          // fallback: primera membresia si tiene rol admin; sino 403
          const primera = await prisma.membresia.findFirst({ where: { usuarioId: usuario.id } })
          membresia = primera as { rol: string } | null
        }
        if (!membresia || !puede(membresia.rol, 'ejecutar', 'backup')) {
          return NextResponse.json({ error: 'Permiso denegado. Requiere rol administrador.' }, { status: 403 })
        }
      }
      if (!membresia || !puede(membresia.rol, 'ejecutar', 'backup')) {
        console.warn(`[authz] RP_PERMISSION_DENIED backup usuario=${usuario.email} rol=${membresia?.rol ?? 'none'}`)
        return NextResponse.json({ error: 'Permiso denegado. Requiere rol administrador.' }, { status: 403 })
      }
    }
  }
  try {
    const declaredLength = Number(request.headers.get('content-length') ?? '');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BACKUP_BYTES) {
      return NextResponse.json({ error: 'Solicitud demasiado grande' }, { status: 413 });
    }
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BACKUP_BYTES) {
      return NextResponse.json({ error: 'Solicitud demasiado grande' }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Cuerpo JSON inválido' }, { status: 400 });
    }

    const { content, fileName } = (body ?? {}) as Record<string, unknown>;
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content es requerido' }, { status: 400 });
    }
    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ error: 'fileName es requerido' }, { status: 400 });
    }

    const result = saveBackup(content, fileName);
    if (!result.ok) {
      console.error('[api/backup] Error al guardar backup:', result.error);
      return NextResponse.json({ error: 'No se pudo guardar el backup' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, path: result.path });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
