import { NextResponse } from 'next/server';
import { isWriteApiEnabled } from '@/lib/env-guard';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { puede } from '@/lib/authz';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const MAX_BACKUP_BYTES = 10 * 1024 * 1024; // 10 MB

/** Nombre del archivo fijado por el servidor (`compass-backup-YYYY-MM-DD_HH-mm.json`). */
function nombreBackupServidor(now = new Date()): string {
  const iso = now.toISOString(); // 2026-10-23T15:11:12.345Z
  return `compass-backup-${iso.slice(0, 10)}_${iso.slice(11, 16).replace(':', '-')}.json`;
}

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
    // P3: sin PII en logs — identificamos por usuario.id, nunca email.
    logger.warn({ event: 'RP_PERMISSION_DENIED', usuarioId: usuario.id, rol: membresia?.rol ?? 'none', recurso: 'backup' }, '[authz] RP_PERMISSION_DENIED backup');
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

    // `fileName` del cliente ya no se usa: si el nombre viniera del cliente, el archivo
    // podría quedar sin fecha o con una fecha falsa. El nombre lo fija el servidor.
    const { content } = (body ?? {}) as Record<string, unknown>;
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content es requerido' }, { status: 400 });
    }

    // El disco del servidor es efímero en producción: la copia viaja como descarga.
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nombreBackupServidor()}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
