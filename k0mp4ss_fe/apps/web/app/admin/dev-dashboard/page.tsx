'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Checkbox } from '@workspace/ui/components/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@workspace/ui/components/sheet';
import {
  IconAdjustments,
  IconListCheck,
  IconStack2,
  IconTerminal2,
  IconCheck,
  IconClipboardCopy,
  IconInfoSmall,
  IconBrandVscode,
  IconRefresh,
  IconAlertTriangle,
  IconFileCode2,
  IconArchive
} from '@tabler/icons-react';
import type { DashboardData, ModuleInfo, TaskItem } from '@/lib/dev-dashboard';

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
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/dev-dashboard');
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      const json: DashboardData = await res.json();
      setData(json);
      setSelectedChangeId(prev => prev ?? json.changes[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activeChange = useMemo(
    () => data?.changes.find(c => c.id === selectedChangeId) ?? data?.changes[0] ?? null,
    [data, selectedChangeId]
  );

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
              {completedCount} / {totalCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalCount - completedCount} tareas pendientes
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

      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-3xl">
          <TabsTrigger value="tasks">
            <IconListCheck className="size-4 mr-2" /> Change Activo
          </TabsTrigger>
          <TabsTrigger value="modules">
            <IconStack2 className="size-4 mr-2" /> Mapa de Módulos
          </TabsTrigger>
          <TabsTrigger value="specs">
            <IconFileCode2 className="size-4 mr-2" /> Specs OpenSpec
          </TabsTrigger>
          <TabsTrigger value="prompts">
            <IconTerminal2 className="size-4 mr-2" /> Prompts Hermes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-6 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
              <div>
                <CardTitle className="text-xl">Lista de Tareas - Change: {activeChange?.id ?? 'sin change activo'}</CardTitle>
                <CardDescription>
                  Estado real desde <code className="font-mono text-xs">openspec/changes/{activeChange?.id}/tasks.md</code>. Marcar persiste el checkbox en el repositorio.
                </CardDescription>
              </div>
              <Badge variant="secondary">
                {completedCount} de {totalCount} Completadas
              </Badge>
            </CardHeader>

            <CardContent className="p-6">
              {(data?.changes.length ?? 0) > 1 && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {data?.changes.map(c => (
                    <Button
                      key={c.id}
                      size="sm"
                      variant={c.id === activeChange?.id ? 'default' : 'outline'}
                      onClick={() => setSelectedChangeId(c.id)}
                    >
                      {c.id}
                    </Button>
                  ))}
                </div>
              )}

              {activeChange && activeChange.tasks.length > 0 ? (
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
                  No hay changes activos en <code className="font-mono text-xs">openspec/changes/</code>.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Mapa Global de Fases y Módulos</CardTitle>
              <CardDescription>
                Estado derivado de <code className="font-mono text-xs">Data/NSGC/docs/especificaciones/</code> + OpenSpec.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data && data.modules.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted text-muted-foreground font-semibold border-b">
                      <tr>
                        <th className="p-3">Código</th>
                        <th className="p-3">Fase</th>
                        <th className="p-3">Módulo</th>
                        <th className="p-3">Ruta</th>
                        <th className="p-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.modules.map((m, idx) => (
                        <tr key={idx} className="hover:bg-muted/40 transition-colors">
                          <td className="p-3 font-mono font-bold text-primary">{m.code || '—'}</td>
                          <td className="p-3 text-muted-foreground">{m.phase}</td>
                          <td className="p-3 font-semibold">{m.name}</td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">{m.route || '—'}</td>
                          <td className="p-3">
                            <Badge variant={m.status === 'pendiente' ? 'outline' : 'default'} className={STATUS_BADGE[m.status].className}>
                              {STATUS_BADGE[m.status].label}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  No se encontraron especificaciones en <code className="font-mono text-xs">Data/NSGC/docs/especificaciones/</code>.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="specs" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Capabilities en openspec/specs/</CardTitle>
              <CardDescription>
                La fuente de verdad consolidada: las capabilities aceptadas del sistema. Se acumulan al archivar changes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data && data.specs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.specs.map(spec => (
                    <div key={spec.name} className="rounded-lg border p-4 flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <IconFileCode2 className="size-4 text-primary" />
                        <code className="font-mono font-bold text-sm">{spec.name}</code>
                        {spec.code && <Badge variant="outline" className="text-[10px]">{spec.code}</Badge>}
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <IconArchive className="size-5 text-muted-foreground" />
                Changes Archivados
              </CardTitle>
              <CardDescription>
                Historial en <code className="font-mono text-xs">openspec/changes/archive/</code> y los módulos que completaron.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompts" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Guía de Comandos Rápidos para Hermes / OpenCode</CardTitle>
              <CardDescription>
                Copia estos prompts para ejecutar tareas específicas en la copia duplicada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted/30 border rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm">🎯 Ejecutar la Siguiente Tarea del Change Activo</span>
                  <Badge variant="outline" className="text-xs">Paso Inicial</Badge>
                </div>
                {nextTask ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Tarea {nextTask.id} · {nextTask.title}
                    </p>
                    <p className="font-mono text-xs bg-muted p-3 rounded-lg border break-words">
                      {buildHermesPrompt(activeChange?.id, nextTask)}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">No hay tareas pendientes en el change activo.</p>
                )}
              </div>

              <div className="p-4 bg-muted/30 border rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm">🚀 Ejecutar Todo el Change {activeChange?.id}</span>
                  <Badge variant="outline" className="text-xs">Workflow Completo</Badge>
                </div>
                <p className="font-mono text-xs bg-muted p-3 rounded-lg border">{`hermes run "/opsx-apply ${activeChange?.id}"`}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
