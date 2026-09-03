import { NextResponse } from 'next/server';
import { getQaDashboardData, guardarNotaEtapa, recalibrarBaselineEtapa } from '@/lib/qa-estado';
import { isWriteApiEnabled } from '@/lib/env-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isWriteApiEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
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
