import { NextResponse } from 'next/server';
import { saveBackup } from '@/lib/backup';
import { isWriteApiEnabled } from '@/lib/env-guard';

export const dynamic = 'force-dynamic';

const MAX_BACKUP_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  if (!isWriteApiEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
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
