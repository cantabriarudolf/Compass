import { NextResponse } from 'next/server';
import { getQaDashboardData } from '@/lib/qa-estado';
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
