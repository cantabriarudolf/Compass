import { NextResponse } from 'next/server';
import { getQaDashboardData, guardarNotaEtapa, recalibrarBaselineEtapa } from '@/lib/qa-estado';
import { isWriteApiEnabled } from '@/lib/env-guard';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function requireAuth() {
  const sesion = await auth();
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }
  return null;
}

export async function GET() {
  if (!isWriteApiEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    return NextResponse.json(getQaDashboardData());
  } catch {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isWriteApiEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  const authError = await requireAuth();
  if (authError) return authError;
  let body: { accion?: string; runId?: string; etapaId?: string; texto?: string; minutosReales?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 });
  }
  if (body.accion === 'nota') {
    const resultado = guardarNotaEtapa(String(body.runId ?? ''), String(body.etapaId ?? ''), String(body.texto ?? ''));
    return resultado.ok ? NextResponse.json(resultado) : NextResponse.json(resultado, { status: 400 });
  }
  if (body.accion === 'recalibrar') {
    const resultado = recalibrarBaselineEtapa(String(body.etapaId ?? ''), Number(body.minutosReales));
    return resultado.ok ? NextResponse.json(resultado) : NextResponse.json(resultado, { status: 400 });
  }
  return NextResponse.json({ ok: false, error: 'Acción no reconocida' }, { status: 400 });
}
