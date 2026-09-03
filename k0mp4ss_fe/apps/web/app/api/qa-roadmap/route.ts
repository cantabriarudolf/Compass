import { NextResponse } from 'next/server';
import { ALCANCES_ROADMAP, getQaRoadmapData } from '@/lib/qa-estado';
import { isWriteApiEnabled } from '@/lib/env-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isWriteApiEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  const { searchParams } = new URL(request.url);
  const alcance = searchParams.get('alcance') ?? 'suite completa';
  if (!(ALCANCES_ROADMAP as readonly string[]).includes(alcance)) {
    return NextResponse.json({ ok: false, error: `Alcance no reconocido: ${alcance}` }, { status: 400 });
  }
  try {
    return NextResponse.json(getQaRoadmapData(alcance));
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
