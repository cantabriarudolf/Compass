'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Checkbox } from '@workspace/ui/components/checkbox';
import { Input } from '@workspace/ui/components/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@workspace/ui/components/sheet';
import {
  IconAdjustments,
  IconListCheck,
  IconStack2,
  IconCheck,
  IconClipboardCopy,
  IconInfoSmall,
  IconBrandVscode,
  IconRefresh,
  IconAlertTriangle,
  IconFileCode2,
  IconArchive,
  IconArrowLeft,
  IconSearch
} from '@tabler/icons-react';
import type { DashboardData, ModuleInfo, TaskItem, ChangeInfo } from '@/lib/dev-dashboard';

const STATUS_BADGE: Record<ModuleInfo['status'], { label: string; className: string }> = {
  completado: { label: '🟢 Completado', className: 'bg-emerald-600 hover:bg-emerald-700' },
  en_proceso: { label: '🔵 En Proceso', className: 'bg-primary hover:bg-primary' },
  documentado: { label: '📘 Documentado', className: 'bg-sky-600 hover:bg-sky-700' },
  pendiente: { label: '⏳ Pendiente', className: '' },
};

function buildHermesPrompt(changeId: string | undefined, task: TaskItem): string {
  return `hermes run "Ejecuta la tarea ${task.id} del change ${changeId ?? ''}: ${task.title}"`;
}

export default function DevDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModuleCode, setSelectedModuleCode] = useState<string | null>(null);
  const [showTasks, setShowTasks] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [fileView, setFileView] = useState<{ file: string; content: string; loading: boolean } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [moduleSearch, setModuleSearch] = useState('');
  const [modulePhases, setModulePhases] = useState<string[]>([]);
  const [moduleStatuses, setModuleStatuses] = useState<string[]>([]);
  const [moduleSort, setModuleSort] = useState<{ key: keyof ModuleInfo; dir: 1 | -1 } | null>(null);
  const [showComparative, setShowComparative] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/dev-dashboard');
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      const json: DashboardData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedModule = useMemo(
    () => data?.modules.find(m => m.code === selectedModuleCode) ?? null,
    [data, selectedModuleCode]
  );

  const activeChange = useMemo(
    () => {
      if (!data || !selectedModule?.change) return null;
      return (
        data.changes.find(c => c.id === selectedModule.change) ??
        data.archived.find(c => c.id === selectedModule.change) ??
        null
      );
    },
    [data, selectedModule]
  );

  const comparative = useMemo(() => {
    if (!data) return null;
    const specCodes = new Set(data.specs.map(s => s.code).filter(Boolean));
    const covered = data.modules.filter(m => m.code && specCodes.has(m.code)).length;
    return { total: data.modules.length, covered, active: data.changes.length, archived: data.archived.length };
  }, [data]);

  const capabilities = useMemo(() => {
    if (!data) return [];
    const activeIds = data.changes.map(c => c.id.toUpperCase());
    return data.specs.map(s => ({
      ...s,
      archived: s.code ? !activeIds.some(id => id.startsWith(`${s.code.toUpperCase()}-`)) : true,
    }));
  }, [data]);

  const moduleByArchivedChange = useMemo(() => {
    const map = new Map<string, string[]>();
    data?.modules.forEach(m => {
      if (m.status === 'completado' && m.change) {
        const arr = map.get(m.change) ?? [];
        arr.push(`${m.code} · ${m.name}`);
        map.set(m.change, arr);
      }
    });
    return map;
  }, [data]);

  const changeMap = useMemo(() => {
    const map = new Map<string, { done: number; total: number; pct: number; archived: boolean }>();
    const add = (items: ChangeInfo[] | undefined, archived: boolean) => {
      items?.forEach(c => {
        const done = c.tasks.filter(t => t.completed).length;
        const total = c.tasks.length;
        map.set(c.id, { done, total, pct: total ? Math.round((done / total) * 100) : 0, archived });
      });
    };
    add(data?.changes, false);
    add(data?.archived, true);
    return map;
  }, [data]);

  const changeTone = (info: { pct: number; total: number }): { tone: 'green' | 'yellow' | 'red'; label: string } => {
    if (info.total === 0 || info.pct === 0) return { tone: 'red', label: 'Sin ejecutar' };
    if (info.pct === 100) return { tone: 'green', label: 'Listo' };
    return { tone: 'yellow', label: 'En progreso' };
  };

  const phases = useMemo(() => {
    const set = new Set(data?.modules.map(m => m.phase).filter(Boolean) ?? []);
    return [...set].sort((a, b) => {
      const num = (p: string) => Number(p.match(/\d+/)?.[0] ?? 99);
      return num(a) - num(b);
    });
  }, [data]);

  const filteredModules = useMemo(() => {
    if (!data) return [];
    const term = moduleSearch.trim().toLowerCase();
    let rows = data.modules.filter(m => {
      const matchesSearch =
        !term ||
        (m.code ?? '').toLowerCase().includes(term) ||
        m.name.toLowerCase().includes(term) ||
        (m.route ?? '').toLowerCase().includes(term) ||
        (m.mockData ? 'mock' : '').includes(term) ||
        (m.documented ? 'spec' : '').includes(term) ||
        (m.hasManual ? 'manual' : '').includes(term) ||
        (m.change ?? '').toLowerCase().includes(term);
      const matchesPhase = modulePhases.length === 0 || modulePhases.includes(m.phase);
      const matchesStatus = moduleStatuses.length === 0 || moduleStatuses.includes(m.status);
      return matchesSearch && matchesPhase && matchesStatus;
    });
    if (moduleSort) {
      const { key, dir } = moduleSort;
      rows = [...rows].sort((a, b) => {
        const va = String(a[key] ?? '');
        const vb = String(b[key] ?? '');
        return va.localeCompare(vb, 'es', { numeric: true }) * dir;
      });
    }
    return rows;
  }, [data, moduleSearch, modulePhases, moduleStatuses, moduleSort]);

  const completedCount = activeChange?.tasks.filter(t => t.completed).length ?? 0;
  const totalCount = activeChange?.tasks.length ?? 0;
  const progressPercent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const nextTask = activeChange?.tasks.find(t => !t.completed) ?? null;

  const toggleTask = useCallback(
    async (task: TaskItem) => {
      if (!activeChange) return;
      setSavingId(task.id);
      setData(prev =>
        prev
          ? {
              ...prev,
              changes: prev.changes.map(c =>
                c.id === activeChange.id
                  ? { ...c, tasks: c.tasks.map(t => (t.id === task.id ? { ...t, completed: !t.completed } : t)) }
                  : c
              ),
            }
          : prev
      );
      try {
        const res = await fetch('/api/dev-dashboard', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changeId: activeChange.id, taskId: task.id }),
        });
        if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
        const json = await res.json();
        setData(prev =>
          prev ? { ...prev, changes: prev.changes.map(c => (c.id === activeChange.id ? json.change : c)) } : prev
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        refresh();
      } finally {
        setSavingId(null);
      }
    },
    [activeChange, refresh]
  );

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openFile = useCallback(async (file: string) => {
    try {
      setFileView({ file, content: '', loading: true });
      const res = await fetch('/api/dev-dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file }),
      });
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      const json = await res.json();
      setFileView({ file, content: json.content, loading: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFileView(null);
    }
  }, []);

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-96 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <IconAlertTriangle className="size-10 text-destructive" />
          <div>
            <p className="font-semibold">No se pudo leer el dashboard desde el filesystem.</p>
            <p className="text-sm text-muted-foreground font-mono mt-1">{error}</p>
          </div>
          <Button onClick={refresh}>
            <IconRefresh className="size-4 mr-2" /> Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">Control OpenSpec</h1>
            <Badge variant="outline" className="text-primary border-primary/30">
              Ambiente Activo
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Lectura en vivo de <code className="font-mono text-xs">openspec/</code> y{' '}
            <code className="font-mono text-xs">Data/NSGC/docs/especificaciones/</code>. Estado derivado del repositorio, sin datos manuales.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-black text-primary">{progressPercent}%</div>
            <div className="text-xs text-muted-foreground font-medium">Progreso Change Activo</div>
          </div>
          <div className="w-32 bg-muted h-3 rounded-full overflow-hidden border">
            <div
              className="bg-primary h-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <Button variant="outline" size="icon" onClick={refresh} disabled={loading} title="Recargar desde el repositorio">
            <IconRefresh className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="font-bold text-xs uppercase tracking-wider">Módulos Completados</CardDescription>
            <IconStack2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.stats.completado ?? 0} / {data?.stats.total ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data?.stats.enProceso ?? 0} en proceso · {data?.stats.documentado ?? 0} documentados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="font-bold text-xs uppercase tracking-wider">Change OpenSpec Activo</CardDescription>
            <IconBrandVscode className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-primary truncate">{activeChange?.id ?? '—'}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data?.changes.length ?? 0} change(s) activo(s) · {data?.archived.length ?? 0} archivados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="font-bold text-xs uppercase tracking-wider">Tareas del Change</CardDescription>
            <IconListCheck className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {activeChange ? `${completedCount} / ${totalCount}` : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeChange
                ? `${totalCount - completedCount} tareas pendientes`
                : 'Selecciona un change'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="font-bold text-xs uppercase tracking-wider">Agente Configurado</CardDescription>
            <IconAdjustments className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-emerald-600">Hermes Builder</div>
            <p className="text-xs text-muted-foreground mt-1">HERMES.md cargado</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 space-y-6">
          {selectedModule && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
                <div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={() => { setSelectedModuleCode(null); setShowTasks(false); }}>
                      <IconArrowLeft className="size-4 mr-1" /> Cerrar detalle
                    </Button>
                    <CardTitle className="text-xl">
                      {selectedModule.code || '—'} · {selectedModule.name}
                    </CardTitle>
                    <Badge variant={selectedModule.status === 'pendiente' ? 'outline' : 'default'} className={STATUS_BADGE[selectedModule.status].className}>
                      {STATUS_BADGE[selectedModule.status].label}
                    </Badge>
                  </div>
                  <CardDescription>
                    Fase {selectedModule.phase.replace('Fase ', '')} · Ruta{' '}
                    <code className="font-mono text-xs">{selectedModule.route || '—'}</code> · Spec NSGC{' '}
                    <code className="font-mono text-xs">{selectedModule.file}</code>
                  </CardDescription>
                </div>
                {showTasks && activeChange && (
                  <Badge variant="secondary">
                    {completedCount} de {totalCount} Completadas
                  </Badge>
                )}
              </CardHeader>

              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className={`rounded-lg border p-4 flex flex-col gap-2 ${selectedModule.mockData ? 'bg-amber-500/5 border-amber-500/40' : 'bg-muted/20'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">🧪 Mock</span>
                        <Badge variant="outline" className="text-[10px]">{selectedModule.mockData ? 'Disponible' : 'Sin mock'}</Badge>
                      </div>
                      {selectedModule.mockData && selectedModule.mockFile && (
                        <Button size="sm" variant="outline" onClick={() => openFile(selectedModule.mockFile!)}>
                          <IconFileCode2 className="size-3.5 mr-1" /> Ver
                        </Button>
                      )}
                    </div>
                    {selectedModule.mockData && selectedModule.mockFile ? (
                      <code className="text-[11px] text-muted-foreground font-mono break-all">{selectedModule.mockFile}</code>
                    ) : (
                      <span className="text-xs text-muted-foreground">Módulo aún sin datos mockeados.</span>
                    )}
                  </div>
                  <div className={`rounded-lg border p-4 flex flex-col gap-2 ${selectedModule.documented ? 'bg-emerald-500/5 border-emerald-500/40' : 'bg-muted/20'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">✓ Spec</span>
                        <Badge variant="outline" className="text-[10px]">{selectedModule.documented ? 'Documentada' : 'Sin spec'}</Badge>
                      </div>
                      {selectedModule.documented && selectedModule.specFile && (
                        <Button size="sm" variant="outline" onClick={() => openFile(selectedModule.specFile!)}>
                          <IconFileCode2 className="size-3.5 mr-1" /> Ver
                        </Button>
                      )}
                    </div>
                    {selectedModule.documented && selectedModule.specFile ? (
                      <code className="text-[11px] text-muted-foreground font-mono break-all">{selectedModule.specFile}</code>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin capability en openspec/specs/.</span>
                    )}
                  </div>
                  <div className={`rounded-lg border p-4 flex flex-col gap-2 ${selectedModule.hasManual ? 'bg-blue-500/5 border-blue-500/40' : 'bg-muted/20'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">📘 Manual</span>
                        <Badge variant="outline" className="text-[10px]">{selectedModule.hasManual ? 'Disponible' : 'Sin manual'}</Badge>
                      </div>
                      {selectedModule.hasManual && selectedModule.manualFile && (
                        <Button size="sm" variant="outline" onClick={() => openFile(selectedModule.manualFile!)}>
                          <IconFileCode2 className="size-3.5 mr-1" /> Ver
                        </Button>
                      )}
                    </div>
                    {selectedModule.hasManual && selectedModule.manualFile ? (
                      <code className="text-[11px] text-muted-foreground font-mono break-all">{selectedModule.manualFile}</code>
                    ) : (
                      <span className="text-xs text-muted-foreground">Módulo aún sin manual.</span>
                    )}
                  </div>
                </div>

                {selectedModule.change && (
                  <div className="rounded-lg border p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Change asociado</p>
                      <code className="font-mono font-semibold text-sm">{selectedModule.change}</code>
                    </div>
                    {activeChange && (
                      <Button size="sm" variant={showTasks ? 'outline' : 'default'} onClick={() => setShowTasks(v => !v)}>
                        <IconListCheck className="size-4 mr-2" />
                        {showTasks ? 'Ocultar tareas' : `Ver tareas (${activeChange.tasks.length})`}
                      </Button>
                    )}
                  </div>
                )}

                {showTasks && activeChange && (
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <IconListCheck className="size-4 text-amber-600" /> Tareas - {activeChange.id}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        <code className="font-mono text-[10px]">openspec/changes/{activeChange.id}/tasks.md</code>
                      </span>
                    </div>
                    {activeChange.tasks.length > 0 ? (
                      <div className="space-y-4">
                        {activeChange.tasks.map(task => (
                          <div
                            key={task.id}
                            className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg border transition-all gap-4 ${
                              task.completed
                                ? 'bg-muted/40 opacity-70 border-border'
                                : 'bg-card border-border hover:border-primary/40'
                            }`}
                          >
                          <div className="flex items-start gap-3 flex-1">
                            <Checkbox
                              id={`task-${activeChange.id}-${task.id}`}
                              checked={task.completed}
                              disabled={savingId === task.id}
                              onCheckedChange={() => toggleTask(task)}
                              className="mt-1"
                            />
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <label
                                  htmlFor={`task-${activeChange.id}-${task.id}`}
                                  className={`font-semibold cursor-pointer text-sm ${
                                    task.completed ? 'line-through text-muted-foreground' : 'text-foreground'
                                  }`}
                                >
                                  {task.title}
                                </label>
                                {nextTask?.id === task.id && (
                                  <Badge variant="default" className="text-[10px]">
                                    SIGUIENTE A EJECUTAR
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{task.section}</p>
                              <div className="flex flex-wrap gap-2 pt-1">
                                <Badge variant="outline" className="text-[10px] font-mono">
                                  Tarea {task.id}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <Sheet>
                              <SheetTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => setSelectedTask(task)}>
                                  <IconInfoSmall className="size-4 mr-1" /> Contexto
                                </Button>
                              </SheetTrigger>
                              <SheetContent className="sm:max-w-xl">
                                {selectedTask && (
                                  <div className="space-y-6 mt-4">
                                    <SheetHeader>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="default">Tarea {selectedTask.id}</Badge>
                                        <Badge variant="outline">{selectedTask.section}</Badge>
                                      </div>
                                      <SheetTitle className="text-xl font-bold mt-2">{selectedTask.title}</SheetTitle>
                                      <SheetDescription>
                                        Contexto técnico e instrucciones para el agente, generados desde OpenSpec.
                                      </SheetDescription>
                                    </SheetHeader>

                                    <div className="space-y-4 text-sm">
                                      <div>
                                        <h4 className="font-semibold text-primary mb-1">Change y Fuente:</h4>
                                        <p className="bg-muted p-3 rounded-lg border font-mono text-xs text-muted-foreground">
                                          openspec/changes/{activeChange?.id}/tasks.md · Tarea {selectedTask.id}
                                        </p>
                                      </div>

                                      <div>
                                        <h4 className="font-semibold text-primary mb-1">Prompt Recomendado para Hermes:</h4>
                                        <div className="bg-muted p-3 rounded-lg border text-xs font-mono relative">
                                          <p className="text-foreground break-words">{buildHermesPrompt(activeChange?.id, selectedTask)}</p>
                                          <Button
                                            size="sm"
                                            onClick={() =>
                                              copyToClipboard(buildHermesPrompt(activeChange?.id, selectedTask), selectedTask.id)
                                            }
                                            className="mt-3 w-full"
                                          >
                                            {copiedId === selectedTask.id ? (
                                              <>
                                                <IconCheck className="size-4 mr-1 text-green-400" /> ¡Copiado al portapapeles!
                                              </>
                                            ) : (
                                              <>
                                                <IconClipboardCopy className="size-4 mr-1" /> Copiar Prompt para Hermes
                                              </>
                                            )}
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </SheetContent>
                            </Sheet>

                            <Button
                              size="sm"
                              variant={task.completed ? 'outline' : 'default'}
                              disabled={savingId === task.id}
                              onClick={() => toggleTask(task)}
                            >
                              {task.completed ? 'Desmarcar' : 'Completar ✓'}
                            </Button>
                          </div>
                        </div>
                      ))}
                      </div>
                    ) : (
                      <div className="py-12 text-center text-muted-foreground">
                        El change no tiene tareas en <code className="font-mono text-xs">tasks.md</code>.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Sheet open={!!fileView} onOpenChange={open => { if (!open) setFileView(null); }}>
            <SheetContent className="sm:max-w-2xl flex flex-col">
              <SheetHeader>
                <SheetTitle className="text-lg font-bold break-all font-mono text-sm">{fileView?.file}</SheetTitle>
                <SheetDescription>
                  Lectura del archivo directamente desde el repositorio.
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-auto rounded-lg border bg-muted/20 p-4">
                {fileView?.loading ? (
                  <div className="h-40 animate-pulse rounded bg-muted" />
                ) : (
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                    {fileView?.content}
                  </pre>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Comparativa de Cobertura</CardTitle>
              <CardDescription>
                Especificaciones del catálogo vs capabilities en OpenSpec vs changes archivados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase font-bold text-muted-foreground">Especificaciones</p>
                  <p className="text-2xl font-black text-primary">{comparative?.total ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Data/NSGC/docs/especificaciones/</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase font-bold text-muted-foreground">Cubiertas en Specs</p>
                  <p className="text-2xl font-black text-sky-600">
                    {comparative?.covered ?? 0} <span className="text-sm text-muted-foreground">/ {comparative?.total ?? 0}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {((comparative?.total ?? 0) - (comparative?.covered ?? 0))} sin capability en openspec/specs/
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase font-bold text-muted-foreground">Changes Archivados</p>
                  <p className="text-2xl font-black text-emerald-600">{comparative?.archived ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">openspec/changes/archive/</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase font-bold text-muted-foreground">Changes Activos</p>
                  <p className="text-2xl font-black text-amber-600">{comparative?.active ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">en desarrollo</p>
                </div>
              </div>

              <div className="border-t pt-6 mt-6 flex flex-col items-start gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-3">
                  <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <IconFileCode2 className="size-5 text-primary" /> Detalle Specs OpenSpec
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Capabilities consolidadas en <code className="font-mono text-[10px]">openspec/specs/</code> y el historial en{' '}
                      <code className="font-mono text-[10px]">openspec/changes/archive/</code>.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowComparative(v => !v)}>
                    {showComparative ? (
                      <>
                        <IconArrowLeft className="size-4 mr-1" /> Ocultar
                      </>
                    ) : (
                      <>
                        <IconListCheck className="size-4 mr-1" /> Ver
                      </>
                    )}
                  </Button>
                </div>

                {showComparative && (
              <div className="w-full">
                <div className="border-t pt-6 mt-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <IconFileCode2 className="size-5 text-primary" /> Capabilities en openspec/specs/
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  La fuente de verdad consolidada: las capabilities aceptadas del sistema. Se acumulan al archivar changes.{' '}
                  <span className="font-medium">🟢 Archivada</span> ·{' '}
                  <span className="font-medium">🟠 Pendiente (change activo)</span>
                </p>
                {data && capabilities.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {capabilities.map(spec => (
                      <div
                        key={spec.name}
                        className={`rounded-lg border p-4 flex flex-col gap-2 ${
                          spec.archived ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-orange-500/50 bg-orange-500/5'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <IconFileCode2 className="size-4 text-primary" />
                          <code className="font-mono font-bold text-sm">{spec.name}</code>
                          {spec.code && <Badge variant="outline" className="text-[10px]">{spec.code}</Badge>}
                          <Badge
                            variant={spec.archived ? 'default' : 'outline'}
                            className={`text-[10px] ${
                              spec.archived ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-500 hover:bg-orange-600'
                            }`}
                          >
                            {spec.archived ? '🟢 Archivada' : '🟠 Pendiente'}
                          </Badge>
                        </div>
                        <ul className="text-xs text-muted-foreground font-mono space-y-1">
                          {spec.files.map(f => (
                            <li key={f}>• {spec.name}/{f}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    No hay capabilities definidas en <code className="font-mono text-xs">openspec/specs/</code>.
                  </div>
                )}
              </div>

              <div className="border-t pt-6 mt-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <IconArchive className="size-5 text-muted-foreground" />
                  Changes Archivados
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Historial en <code className="font-mono text-xs">openspec/changes/archive/</code> y los módulos que completaron.
                </p>
                {data && data.archived.length > 0 ? (
                  <div className="space-y-3">
                    {data.archived.map(c => {
                      const relatedModules = moduleByArchivedChange.get(c.id) ?? [];
                      const done = c.tasks.filter(t => t.completed).length;
                      return (
                        <div key={c.id} className="rounded-lg border p-4 flex flex-col md:flex-row justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <IconArchive className="size-4 text-muted-foreground" />
                              <span className="font-mono font-semibold text-sm">{c.id}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Creado: {c.created ?? '—'} · {done}/{c.tasks.length} tareas completadas
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1 items-start md:justify-end">
                            {relatedModules.length > 0 ? (
                              relatedModules.map(m => (
                                <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>
                              ))
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">Sin módulo de negocio</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    No hay changes archivados todavía.
                  </div>
                )}
              </div>
                </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Mapa Global de Fases y Módulos</CardTitle>
              <CardDescription>
                Estado derivado de <code className="font-mono text-xs">Data/NSGC/docs/especificaciones/</code> + OpenSpec.{' '}
                <span className="font-medium">🧪 Mock</span> ·{' '}
                <span className="font-medium">✓ Spec</span> ·{' '}
                <span className="font-medium">📘 Manual</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-3 mb-4">
                <div className="flex-1 relative">
                  <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por código, módulo o ruta..."
                    value={moduleSearch}
                    onChange={e => setModuleSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="md:w-auto">
                      <IconStack2 className="size-4 mr-2" /> Fases
                      {modulePhases.length > 0 && (
                        <Badge variant="default" className="ml-2 text-[10px]">{modulePhases.length}</Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Filtrar por fase</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {phases.map(p => (
                      <DropdownMenuCheckboxItem
                        key={p}
                        checked={modulePhases.includes(p)}
                        onCheckedChange={checked => {
                          setModulePhases(prev =>
                            checked ? [...prev, p] : prev.filter(x => x !== p)
                          );
                        }}
                      >
                        {p}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {modulePhases.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={e => { e.preventDefault(); setModulePhases([]); }}
                          className="text-xs text-destructive focus:text-destructive"
                        >
                          Limpiar fases
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="md:w-auto">
                      <IconListCheck className="size-4 mr-2" /> Estados
                      {moduleStatuses.length > 0 && (
                        <Badge variant="default" className="ml-2 text-[10px]">{moduleStatuses.length}</Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Filtrar por estado</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {Object.entries(STATUS_BADGE).map(([k, v]) => (
                      <DropdownMenuCheckboxItem
                        key={k}
                        checked={moduleStatuses.includes(k)}
                        onCheckedChange={checked => {
                          setModuleStatuses(prev =>
                            checked ? [...prev, k] : prev.filter(x => x !== k)
                          );
                        }}
                      >
                        {v.label.replace(/^\S+\s+/, '')}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {moduleStatuses.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={e => { e.preventDefault(); setModuleStatuses([]); }}
                          className="text-xs text-destructive focus:text-destructive"
                        >
                          Limpiar estados
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {data && data.modules.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted text-muted-foreground font-semibold border-b">
                      <tr>
                        {(
                          [
                            ['code', 'Código'],
                            ['phase', 'Fase'],
                            ['name', 'Módulo'],
                            ['route', 'Ruta'],
                            ['mockData', 'Mock'],
                            ['documented', 'Spec'],
                            ['hasManual', 'Manual'],
                            ['change', 'Change'],
                          ] as [keyof ModuleInfo, string][]
                        ).map(([key, label]) => (
                          <th
                            key={key}
                            className="p-3 cursor-pointer select-none hover:text-foreground transition-colors"
                            onClick={() =>
                              setModuleSort(prev =>
                                prev?.key === key
                                  ? { key, dir: prev.dir === 1 ? -1 : 1 }
                                  : { key, dir: 1 }
                              )
                            }
                          >
                            <span className="inline-flex items-center gap-1">
                              {label}
                              <span className="text-[10px]">
                                {moduleSort?.key === key ? (moduleSort.dir === 1 ? '▲' : '▼') : '↕'}
                              </span>
                            </span>
                          </th>
                        ))}
                        <th className="p-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredModules.map((m, idx) => {
                        const info = m.change ? changeMap.get(m.change) : undefined;
                        return (
                          <tr
                            key={idx}
                            className="cursor-pointer transition-colors hover:bg-primary/5"
                            onClick={() => {
                              setSelectedModuleCode(m.code);
                              setShowTasks(false);
                            }}
                            title={m.code ? `Ver detalle del módulo ${m.code}` : undefined}
                          >
                          <td className="p-3 font-mono font-bold text-primary">{m.code || '—'}</td>
                          <td className="p-3 text-muted-foreground">{m.phase}</td>
                          <td className="p-3 font-semibold">{m.name}</td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">{m.route || '—'}</td>
                          <td className="p-3">
                            {m.mockData ? (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/40">
                                🧪 Mock
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            {m.documented ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">
                                ✓ Spec
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            {m.hasManual ? (
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/40">
                                📘 Manual
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            {m.change ? (
                              <span className="flex flex-wrap items-center gap-2" title={`${m.change} · ${info?.done ?? 0} de ${info?.total ?? 0} tareas`}>
                                <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/40 font-mono text-[10px]">
                                  {m.change}
                                </Badge>
                                {info && (
                                  <Badge variant="outline" className="text-[10px] gap-1">
                                    <span className={`size-2 rounded-full ${changeTone(info).tone === 'green' ? 'bg-emerald-500' : changeTone(info).tone === 'yellow' ? 'bg-amber-500' : 'bg-red-500'}`} />
                                    {changeTone(info).label}
                                  </Badge>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge variant={m.status === 'pendiente' ? 'outline' : 'default'} className={STATUS_BADGE[m.status].className}>
                              {STATUS_BADGE[m.status].label}
                            </Badge>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredModules.length === 0 && (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      Sin resultados para los filtros aplicados.
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  No se encontraron especificaciones en <code className="font-mono text-xs">Data/NSGC/docs/especificaciones/</code>.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
    </div>
  );
}
