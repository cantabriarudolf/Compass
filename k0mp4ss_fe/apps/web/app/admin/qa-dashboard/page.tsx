'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import {
  IconRefresh,
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconCpu,
  IconTestPipe,
  IconHistory,
} from '@tabler/icons-react';
import type { QaEstadoData, QaEstimado, QaEtapaEstado, QaFactor, QaRoadmapData, QaRun, QaSistema } from '@/lib/qa-estado';

const ALCANCES_UI = ['suite completa', 'smoke', 'auth', 'flujo', 'crud', 'crud general'];

interface QaDashboardData {
  estado: QaEstadoData | null;
  sistema: QaSistema;
  factor: QaFactor;
  estimados: QaEstimado[];
}

function fmtMin(min: number): string {
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${min.toLocaleString('es-CL', { maximumFractionDigits: 1 })} min`;
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}

function fmtFecha(fecha: string): string {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
}

function emojiEstado(estado: QaEtapaEstado): string {
  if (estado === 'ok') return '✅';
  if (estado === 'en_curso') return '🦉';
  if (estado === 'fallida') return '❌';
  if (estado === 'omitida') return '⏭';
  return '⏳';
}

function etiquetaEstado(estado: QaEtapaEstado): string {
  if (estado === 'ok') return 'OK';
  if (estado === 'en_curso') return 'En curso';
  if (estado === 'fallida') return 'Fallida';
  if (estado === 'omitida') return 'Omitida';
  return 'Pendiente';
}

function clasesCirculo(estado: QaEtapaEstado): string {
  if (estado === 'ok') return 'border-emerald-500/70 text-emerald-600 dark:text-emerald-400';
  if (estado === 'en_curso') return 'border-amber-500/80 text-amber-600 dark:text-amber-400 animate-pulse';
  if (estado === 'fallida') return 'border-destructive/70 text-destructive';
  if (estado === 'omitida') return 'border-muted-foreground/30 text-muted-foreground/50 opacity-70';
  return 'border-muted-foreground/40 text-muted-foreground';
}

function BadgeEstado({ estado }: { estado: QaRun['resultado']['estado'] }) {
  if (estado === 'passed') return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">🟢 Passed</Badge>;
  if (estado === 'failed') return <Badge variant="destructive">🔴 Failed</Badge>;
  return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">🟡 Parcial</Badge>;
}

function MotorBadge({ motor }: { motor: QaEstimado['motor'] }) {
  return motor === 'cli' ? (
    <Badge variant="secondary" className="text-[10px]">CLI (Vitest)</Badge>
  ) : (
    <Badge variant="secondary" className="text-[10px]">Chrome (Playwright)</Badge>
  );
}

export default function QaDashboardPage() {
  const [data, setData] = useState<QaDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/qa-estado', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as QaDashboardData);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial intencional desde API al montar (avance 2026-09-02)
    cargar();
  }, [cargar]);

  const [modo, setModo] = useState<'corrida' | 'roadmap'>('corrida');
  const [alcanceRoadmap, setAlcanceRoadmap] = useState<string>('suite completa');
  const [roadmap, setRoadmap] = useState<QaRoadmapData | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [guardandoNota, setGuardandoNota] = useState<string | null>(null);
  const [notaMsg, setNotaMsg] = useState<{ etapaId: string; ok: boolean; texto: string } | null>(null);

  const cargarRoadmap = useCallback(async (alcance: string) => {
    try {
      const res = await fetch(`/api/qa-roadmap?alcance=${encodeURIComponent(alcance)}`, { cache: 'no-store' });
      const json = (await res.json()) as QaRoadmapData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRoadmap(json);
    } catch (e) {
      setError(`No se pudo cargar el roadmap: ${String(e)}`);
    }
  }, []);

  useEffect(() => {
    if (modo !== 'roadmap') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial intencional del plan al entrar al modo (avance 2026-09-03)
    void cargarRoadmap(alcanceRoadmap);
  }, [modo, alcanceRoadmap, cargarRoadmap]);

  const liveFresco = modo === 'roadmap' && roadmap?.live != null;

  useEffect(() => {
    if (!liveFresco) return;
    const id = setInterval(() => {
      void cargarRoadmap(alcanceRoadmap);
    }, 2000);
    return () => clearInterval(id);
  }, [liveFresco, alcanceRoadmap, cargarRoadmap]);

  const guardarNota = useCallback(
    async (etapaId: string) => {
      const texto = (notas[etapaId] ?? '').trim();
      const runId = roadmap?.runReferenciaId ?? null;
      if (!texto || !runId) return;
      setGuardandoNota(etapaId);
      setNotaMsg(null);
      try {
        const res = await fetch('/api/qa-estado', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accion: 'nota', runId, etapaId, texto }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setNotaMsg({ etapaId, ok: true, texto: 'Nota guardada' });
        await cargarRoadmap(alcanceRoadmap);
      } catch (e) {
        setNotaMsg({ etapaId, ok: false, texto: `No se pudo guardar: ${String(e)}` });
      } finally {
        setGuardandoNota(null);
      }
    },
    [notas, roadmap?.runReferenciaId, cargarRoadmap, alcanceRoadmap]
  );

  const runs = data?.estado?.runs ?? [];
  const ultima = runs.length > 0 ? runs[runs.length - 1] : null;
  const sistema = data?.sistema;
  const factor = data?.factor;
  const estimados = data?.estimados ?? [];
  const swapPct = sistema && sistema.swapTotalMB > 0 ? Math.round((1 - sistema.swapLibreMB / sistema.swapTotalMB) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b pb-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <IconTestPipe className="size-7 text-primary" /> Estado de Pruebas QA
            </h1>
            <p className="text-muted-foreground">
              Qué corrió la skill <code className="font-mono text-xs">pruebas</code>, cómo estaba el sistema al ejecutar y cuánto demoraría cada tipo de prueba.
            </p>
          </div>
          <Button variant="outline" onClick={cargar} disabled={loading}>
            <IconRefresh className="size-4 mr-1" /> Actualizar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={modo === 'corrida' ? 'default' : 'outline'} size="sm" onClick={() => setModo('corrida')}>
          Última corrida
        </Button>
        <Button variant={modo === 'roadmap' ? 'default' : 'outline'} size="sm" onClick={() => setModo('roadmap')}>
          🦉 Roadmap
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="py-3 text-sm text-destructive flex items-center gap-2">
            <IconAlertTriangle className="size-4" /> No se pudo cargar el estado: {error}
          </CardContent>
        </Card>
      )}

      {modo === 'corrida' && sistema && factor && (
        <Card className={factor.ahogada ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-900' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <IconCpu className="size-4 text-primary" /> Carga del sistema (ahora)
              {factor.ahogada && <Badge variant="destructive" className="text-[10px]">⚠ Máquina ahogada</Badge>}
            </CardTitle>
            <CardDescription className="text-xs">
              Factor de carga ×{factor.factorCarga} (load₁ {sistema.loadAvg1} / {sistema.cores} cores). Los estimados de abajo ya lo incluyen.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-xs">
            <span><b>Load:</b> {sistema.loadAvg1} / {sistema.loadAvg5} / {sistema.loadAvg15} (1/5/15 min)</span>
            <span><b>Cores:</b> {sistema.cores}</span>
            <span><b>RAM libre:</b> {sistema.memLibreMB} MB de {sistema.memTotalMB} MB</span>
            <span><b>Swap:</b> {sistema.swapTotalMB > 0 ? `${sistema.swapLibreMB} MB libres (${swapPct}% en uso)` : 'n/d'}</span>
            {factor.ahogada && factor.motivo && (
              <span className="w-full flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                <IconAlertTriangle className="size-3.5" /> {factor.motivo}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {modo === 'corrida' && (ultima ? (
        <Card className={ultima.resultado.estado === 'passed' ? 'border-emerald-500/40' : ultima.resultado.estado === 'failed' ? 'border-destructive/50' : 'border-amber-400/60'}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <IconCheck className="size-4 text-primary" /> Última ejecución
                  <BadgeEstado estado={ultima.resultado.estado} />
                </CardTitle>
                <CardDescription className="text-xs">
                  {fmtFecha(ultima.fecha)} · {ultima.alcance} · {ultima.visualizacion}
                </CardDescription>
              </div>
              <code className="font-mono text-[10px] text-muted-foreground max-w-[40%] truncate" title={ultima.comando}>{ultima.comando}</code>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-400">✓ {ultima.resultado.passed} passed</Badge>
              {ultima.resultado.failed > 0 && <Badge variant="secondary" className="text-destructive">✗ {ultima.resultado.failed} failed</Badge>}
              {ultima.resultado.skipped > 0 && <Badge variant="secondary">⏭ {ultima.resultado.skipped} skipped</Badge>}
              <Badge variant="secondary" className="flex items-center gap-1"><IconClock className="size-3" /> {ultima.resultado.duracion}</Badge>
              {ultima.estimadoMinutos != null && (
                <Badge variant="secondary">
                  Estimado eran {fmtMin(ultima.estimadoMinutos)} → {Number(ultima.estimadoMinutos) <= 0 ? '—' : 'comparar abajo'}
                </Badge>
              )}
              <Badge variant="secondary">Load₁ al correr: {ultima.sistema.loadAvg1} ({ultima.sistema.cores} cores)</Badge>
            </div>
            {ultima.sistema.nota && <p className="text-xs text-muted-foreground">{ultima.sistema.nota}</p>}
            {ultima.resultado.fallos.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-destructive">Fallos y causa raíz:</p>
                {ultima.resultado.fallos.map((f, i) => (
                  <div key={i} className="text-xs bg-destructive/5 border border-destructive/20 rounded p-2 space-y-0.5">
                    <p><code className="font-mono text-[11px]">{f.archivo}</code> — {f.test}</p>
                    <p className="text-muted-foreground">{f.causa}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        !loading && (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Aún no hay ejecuciones registradas. Corre la skill <code className="font-mono text-xs">pruebas</code> y el resultado aparecerá acá
              (<code className="font-mono text-xs">qa-estado.json</code>).
            </CardContent>
          </Card>
        )
      ))}

      {modo === 'corrida' && (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <IconClock className="size-4 text-primary" /> ¿Cuánto demoraría? — CLI vs Chrome
          </CardTitle>
          <CardDescription className="text-xs">
            Tiempo base (máquina sana) y estimado con la carga actual (×{factor?.factorCarga ?? 1}). CLI = Vitest sin navegador · Chrome = Playwright con navegador real.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-1.5 pr-3 font-medium">Prueba</th>
                  <th className="py-1.5 pr-3 font-medium">Motor</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Base</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Estimado ahora</th>
                  <th className="py-1.5 font-medium">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {estimados.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-3">{e.etiqueta}</td>
                    <td className="py-1.5 pr-3"><MotorBadge motor={e.motor} /></td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmtMin(e.minutosBase)}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${e.minutosEstimados > e.minutosBase * 1.5 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                      {fmtMin(e.minutosEstimados)}
                    </td>
                    <td className="py-1.5 text-muted-foreground">{e.fuente}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      )}

      {modo === 'corrida' && runs.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <IconHistory className="size-4 text-primary" /> Historial ({runs.length} últimas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5 pr-3 font-medium">Fecha</th>
                    <th className="py-1.5 pr-3 font-medium">Alcance</th>
                    <th className="py-1.5 pr-3 font-medium">Resultado</th>
                    <th className="py-1.5 pr-3 font-medium text-right">Duración</th>
                    <th className="py-1.5 font-medium">Load₁</th>
                  </tr>
                </thead>
                <tbody>
                  {[...runs].reverse().map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{fmtFecha(r.fecha)}</td>
                      <td className="py-1.5 pr-3">{r.alcance}</td>
                      <td className="py-1.5 pr-3"><BadgeEstado estado={r.resultado.estado} /></td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.resultado.duracion}</td>
                      <td className="py-1.5 tabular-nums">{r.sistema.loadAvg1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {modo === 'roadmap' && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <IconClock className="size-4 text-primary" /> 🦉 Roadmap — recorrido por etapas
                </CardTitle>
                <CardDescription className="text-xs">
                  Plan narrativo con estimados escalados por carga (×{roadmap?.factorCarga ?? factor?.factorCarga ?? 1}).
                  {roadmap?.live ? ' Run en vivo — actualizando cada 2s.' : ' Sin run en vivo: se muestra el último recorrido con etapas o el plan sugerido.'}
                </CardDescription>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Alcance:
                <select
                  value={alcanceRoadmap}
                  onChange={(e) => setAlcanceRoadmap(e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  {ALCANCES_UI.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2 text-xs pt-1">
              <Badge variant="secondary">Total estimado: {fmtMin(roadmap?.totalMinutos ?? 0)}</Badge>
              {roadmap?.testActual && <Badge variant="secondary" className="max-w-full truncate">🦉 {roadmap.testActual}</Badge>}
              {roadmap?.runReferenciaId && (
                <Badge variant="secondary" className="font-mono text-[10px]">run: {roadmap.runReferenciaId}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!roadmap ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Cargando plan del recorrido…</p>
            ) : roadmap.etapas.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                El alcance <b>{roadmap.alcance}</b> no tiene etapas asociadas.
              </p>
            ) : (
              <div className="relative">
                <div aria-hidden="true" className="absolute left-5 top-2 bottom-2 hidden w-px bg-border sm:block" />
                <div className="flex flex-col gap-3">
                  {roadmap.etapas.map((n, i) => (
                    <div key={n.id} className={`relative flex items-start gap-3 ${i % 2 === 0 ? 'sm:ml-10' : 'sm:mr-10'}`}>
                      <div
                        className={`z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 bg-background text-base ${clasesCirculo(n.estado)}`}
                        title={etiquetaEstado(n.estado)}
                      >
                        {emojiEstado(n.estado)}
                      </div>
                      <div className="min-w-0 flex-1 rounded-lg border bg-card p-3 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <p className="text-sm font-semibold">
                            {n.orden}. {n.nombre}
                          </p>
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            Estimado {fmtMin(n.minutosEstimados)}
                            {n.duracionRealMin != null ? ` → real ${fmtMin(n.duracionRealMin)}` : ''}
                          </span>
                        </div>
                        <p className="mt-1 text-xs italic text-muted-foreground">{n.chispa}</p>
                        {n.historico && (
                          <p className="mt-1 text-xs text-destructive/90">
                            última vez: {fmtFecha(n.historico.fecha)} — {n.historico.causa}
                          </p>
                        )}
                        <code className="mt-1 block truncate font-mono text-[10px] text-muted-foreground" title={n.comando}>
                          {n.comando}
                        </code>
                        <div className="mt-2 flex items-start gap-2">
                          <textarea
                            value={notas[n.id] ?? n.nota ?? ''}
                            onChange={(e) => setNotas((prev) => ({ ...prev, [n.id]: e.target.value }))}
                            rows={2}
                            placeholder="Nota para esta etapa — se guarda con el run y reaparece en futuros recorridos"
                            className="min-w-0 flex-1 rounded-md border bg-background p-2 text-xs"
                          />
                          <div className="flex flex-col items-start gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={guardandoNota === n.id || !roadmap.runReferenciaId || !(notas[n.id] ?? n.nota ?? '').trim()}
                              onClick={() => void guardarNota(n.id)}
                            >
                              {guardandoNota === n.id ? 'Guardando…' : 'Guardar nota'}
                            </Button>
                            {notaMsg?.etapaId === n.id && (
                              <span className={`text-[10px] ${notaMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                                {notaMsg.texto}
                              </span>
                            )}
                          </div>
                        </div>
                        {!roadmap.runReferenciaId && (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Sin run con etapas para asociar la nota (corre el roadmap por etapas primero).
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
