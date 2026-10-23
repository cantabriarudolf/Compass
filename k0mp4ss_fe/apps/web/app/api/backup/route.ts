import { NextResponse } from 'next/server';
import { isWriteApiEnabled } from '@/lib/env-guard';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { puede } from '@/lib/authz';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const MAX_BACKUP_BYTES = 10 * 1024 * 1024; // 10 MB

const PREFIJO_POR_DEFECTO = 'compass-backup';
const PREFIJO_VALIDO = /^[a-zA-Z0-9-]{1,60}$/;

/**
 * Nombre del archivo: `<prefijo>-YYYY-MM-DD_HH-mm.json`.
 *
 * La FECHA la fija siempre el servidor: el reloj del cliente puede faltar o estar
 * mal, y un respaldo sin fecha no sirve. El prefijo solo aporta semántica
 * (`compass-backup` por defecto, `compass-seed-report` para el comprobante del
 * QA-Lab); si no es válido se cae al de por defecto. `fileName` del cliente no
 * se usa.
 */
function nombreBackupServidor(prefijo: string | undefined, now = new Date()): string {
  const limpio = prefijo && PREFIJO_VALIDO.test(prefijo) ? prefijo : PREFIJO_POR_DEFECTO;
  const iso = now.toISOString(); // 2026-10-23T15:11:12.345Z
  return `${limpio}-${iso.slice(0, 10)}_${iso.slice(11, 16).replace(':', '-')}.json`;
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

  const desdeHeader =
    request.headers.get('x-comunidad-id') ?? request.headers.get('x-comunidadId');
  // `new URL` lanza TypeError con una request malformada: sin el resguardo el
  // handler respondería 500 en vez de seguir su flujo normal (403 o 200).
  let desdeQuery: string | null = null;
  try {
    desdeQuery = new URL(request.url).searchParams.get('comunidadId');
  } catch {
    desdeQuery = null;
  }
  const comunidadId = desdeHeader ?? desdeQuery;
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

    // La fecha del nombre la fija el servidor; el cliente solo aporta el prefijo
    // semántico. `fileName` ya no se usa (un nombre del cliente podría quedar sin
    // fecha o con una falsa).
    const { content, prefijo } = (body ?? {}) as Record<string, unknown>;
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content es requerido' }, { status: 400 });
    }
    const prefijoValido = typeof prefijo === 'string' ? prefijo : undefined;

    // El disco del servidor es efímero en producción: la copia viaja como descarga.
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nombreBackupServidor(prefijoValido)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
