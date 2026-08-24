import { NextResponse } from 'next/server';
import { getDashboardData, toggleTask, readProjectFile, saveModuleNotes, setModuleNotesStatus } from '@/lib/dev-dashboard';
import { isWriteApiEnabled } from '@/lib/env-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isWriteApiEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  try {
    return NextResponse.json(getDashboardData());
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isWriteApiEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  try {
    const body = await request.json();
    const { file } = body;
    if (!file || typeof file !== 'string') {
      return NextResponse.json({ error: 'file es requerido' }, { status: 400 });
    }
    const content = readProjectFile(file);
    if (content === null) {
      return NextResponse.json({ error: 'Recurso no disponible' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, file, content });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!isWriteApiEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  try {
    const body = await request.json();
    const { file, content, status } = body;
    if (!file || typeof file !== 'string') {
      return NextResponse.json({ error: 'file es requerido' }, { status: 400 });
    }
    let result;
    if (typeof content === 'string') {
      const validStatus = status === 'pendientes' || status === 'atendidas' ? status : undefined;
      result = saveModuleNotes(file, content, validStatus);
    } else if (status === 'pendientes' || status === 'atendidas') {
      result = setModuleNotesStatus(file, status);
    } else {
      return NextResponse.json({ error: 'content o status son requeridos' }, { status: 400 });
    }
    if (!result.ok) {
      console.error('[api/dev-dashboard] Error al guardar:', result.error);
      return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, file, status: status ?? undefined });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isWriteApiEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  try {
    const body = await request.json();
    const { changeId, taskId } = body;
    if (!changeId || !taskId) {
      return NextResponse.json({ error: 'changeId y taskId son requeridos' }, { status: 400 });
    }
    const change = toggleTask(changeId, taskId);
    if (!change) {
      return NextResponse.json({ error: 'Recurso no encontrado' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, change });
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
