import { NextResponse } from 'next/server';
import { getDashboardData, toggleTask } from '@/lib/dev-dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(getDashboardData());
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
