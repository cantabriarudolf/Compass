import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { saveBackup } from '@/lib/backup';
import { isWriteApiEnabled } from '@/lib/env-guard';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { puede } from '@/lib/authz';

export const dynamic = 'force-dynamic';

const MAX_BACKUP_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  if (!isWriteApiEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  // B3: autorización fina server-side (SG §4.1) — solo administrador puede ejecutar backup.
  // proxy.ts ya verificó autenticación (401); aquí se verifica rol via lib/authz.ts.
  // Sesión Auth.js: sub = Usuario.id en BD (AU §3 P5). Sin fallback legado (P5 eliminó
  // ADMIN_EMAIL/ADMIN_PASSWORD: los usuarios viven en BD).
  const sesion = await auth();
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }
  const usuario = await prisma.usuario.findUnique({ where: { id: sesion.user.id } }) as
    | { id: string; email: string; activo: boolean }
    | null;
  if (!usuario || !usuario.activo) {
    return NextResponse.json({ error: 'Usuario no encontrado o inactivo' }, { status: 401 });
  }

  const comunidadId =
    request.headers.get('x-comunidad-id') ?? request.headers.get('x-comunidadId') ?? new URL(request.url).searchParams.get('comunidadId');
  let membresia: { rol: string } | null = null;
  if (comunidadId) {
    membresia = await prisma.membresia.findFirst({ where: { usuarioId: usuario.id, comunidadId } });
    if (!membresia) {
      return NextResponse.json({ error: 'Sin pertenencia a la comunidad' }, { status: 403 });
    }
  } else {
    // sin comunidadId: exige alguna membresía con rol que pueda ejecutar backup (admin)
    membresia = await prisma.membresia.findFirst({ where: { usuarioId: usuario.id, rol: 'administrador' } });
  }
  if (!membresia || !puede(membresia.rol, 'ejecutar', 'backup')) {
    console.warn(`[authz] RP_PERMISSION_DENIED backup usuario=${usuario.email} rol=${membresia?.rol ?? 'none'}`);
    return NextResponse.json({ error: 'Permiso denegado. Requiere rol administrador.' }, { status: 403 });
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
