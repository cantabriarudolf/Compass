import { NextResponse } from 'next/server';
import { getDashboardData, toggleTask, readProjectFile, saveModuleNotes, setModuleNotesStatus } from '@/lib/dev-dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(getDashboardData());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { file } = body;
    if (!file || typeof file !== 'string') {
      return NextResponse.json({ error: 'file es requerido' }, { status: 400 });
    }
    const content = readProjectFile(file);
    if (content === null) {
      return NextResponse.json({ error: `Archivo no disponible: ${file}` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, file, content });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
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
      return NextResponse.json({ error: result.error ?? 'Error al guardar' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, file, status: status ?? undefined });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { changeId, taskId } = body;
    if (!changeId || !taskId) {
      return NextResponse.json({ error: 'changeId y taskId son requeridos' }, { status: 400 });
    }
    const change = toggleTask(changeId, taskId);
    if (!change) {
      return NextResponse.json({ error: `Change "${changeId}" no encontrado` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, change });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
