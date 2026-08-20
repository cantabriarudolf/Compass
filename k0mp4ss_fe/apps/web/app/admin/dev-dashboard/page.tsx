'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import {
  IconListCheck,
  IconStack2,
  IconCheck,
  IconClipboardCopy,
  IconInfoSmall,
  IconRefresh,
  IconAlertTriangle,
  IconFileCode2,
  IconArchive,
  IconArrowLeft,
  IconSearch,
  IconDownload,
  IconUpload,
  IconTrash,
  IconChevronDown
} from '@tabler/icons-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@workspace/ui/components/collapsible';
import type { DashboardData, ModuleInfo, TaskItem, ChangeInfo } from '@/lib/dev-dashboard';
import { useCompassStore, STORE_VERSION, seedData } from '@/lib/store';
import { STORE_KEY, validateStoreBackup, type BackupValidation } from '@/lib/store-backup';
import { diffCompassData, type CompassDataDiff } from '@/lib/store-diff';

const STATUS_BADGE: Record<ModuleInfo['status'], { label: string; className: string }> = {
  completado: { label: '🟢 Completado', className: 'bg-emerald-600 hover:bg-emerald-700' },
  en_proceso: { label: '🔵 En Proceso', className: 'bg-primary hover:bg-primary' },
  documentado: { label: '📘 Documentado', className: 'bg-sky-600 hover:bg-sky-700' },
  pendiente: { label: '⏳ Pendiente', className: '' },
};

const STATUS_LEVEL: Record<ModuleInfo['status'], number> = {
  pendiente: 0,
  documentado: 1,
  en_proceso: 2,
  completado: 4,
};

const STATUS_BAR_COLOR: Record<ModuleInfo['status'], string> = {
  pendiente: 'bg-muted-foreground/40',
  documentado: 'bg-sky-500',
  en_proceso: 'bg-primary',
  completado: 'bg-emerald-500',
};

function buildHermesPrompt(changeId: string | undefined, task: TaskItem): string {
  return `hermes run "Ejecuta la tarea ${task.id} del change ${changeId ?? ''}: ${task.title}"`;
}

interface BackupSummaryItem {
  label: string;
  count: number;
  type: 'main' | 'maestro';
}

function DiffSection({ title, diffs }: { title: string; diffs: import('@/lib/store-diff').CollectionDiff[] }) {
  const withChanges = diffs.filter(d => d.added.length + d.removed.length + d.modified.length > 0);
  if (withChanges.length === 0) return null;
  return (
    <div className="mt-1.5 pt-1.5 border-t space-y-2">
      <p className="text-muted-foreground font-medium">{title}</p>
      {withChanges.map((d) => (
        <div key={d.label} className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{d.label}</span>
            <span className="text-muted-foreground">({d.seedCount} → {d.currentCount})</span>
            {d.added.length > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0 text-emerald-700 bg-emerald-100">+{d.added.length}</Badge>}
            {d.removed.length > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0 text-destructive bg-destructive/10">-{d.removed.length}</Badge>}
            {d.modified.length > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0 text-amber-700 bg-amber-100">~{d.modified.length}</Badge>}
          </div>
          <div className="pl-2 space-y-1">
            {d.added.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-emerald-700 text-[10px] font-medium">Agregados:</span>
                {d.added.map((item) => (
                  <span key={item.id} className="text-[10px] bg-emerald-50 text-emerald-700 px-1 rounded border border-emerald-200">{item.name}</span>
                ))}
              </div>
            )}
            {d.removed.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-destructive text-[10px] font-medium">Eliminados:</span>
                {d.removed.map((item) => (
                  <span key={item.id} className="text-[10px] bg-destructive/5 text-destructive px-1 rounded border border-destructive/20 line-through">{item.name}</span>
                ))}
              </div>
            )}
            {d.modified.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-amber-700 text-[10px] font-medium">Modificados:</span>
                {d.modified.map((item) => (
                  <span key={item.id} className="text-[10px] bg-amber-50 text-amber-700 px-1 rounded border border-amber-200">{item.name}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DevDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModuleCode, setSelectedModuleCode] = useState<string | null>(null);
  const [showTasks, setShowTasks] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [fileView, setFileView] = useState<{ file: string; content: string; loading: boolean } | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [moduleSearch, setModuleSearch] = useState('');
  const [modulePhases, setModulePhases] = useState<string[]>([]);
  const [moduleStatuses, setModuleStatuses] = useState<string[]>([]);
  const [moduleCierres, setModuleCierres] = useState<string[]>([]);
  const [moduleSort, setModuleSort] = useState<{ key: keyof ModuleInfo; dir: 1 | -1 } | null>(null);
  const [showComparative, setShowComparative] = useState(false);
  const [storeBackupMsg, setStoreBackupMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [storeImportPending, setStoreImportPending] = useState<{ json: string; fileName: string } | null>(null);
  const [storeImportValidation, setStoreImportValidation] = useState<BackupValidation | null>(null);
  const [storeImportDialogOpen, setStoreImportDialogOpen] = useState(false);
  const [storeClearDialogOpen, setStoreClearDialogOpen] = useState(false);
  const [backupSummary, setBackupSummary] = useState<BackupSummaryItem[] | null>(null);
  const [backupDetailOpen, setBackupDetailOpen] = useState(false);
  const [backupToRepo, setBackupToRepo] = useState(false);
  const [backupDiff, setBackupDiff] = useState<CompassDataDiff | null>(null);
  const storeFileInputRef = useRef<HTMLInputElement>(null);

  const exportStore = useCallback(async () => {
    try {
      const s = useCompassStore.getState();
      const items: BackupSummaryItem[] = [
        { label: 'Tipos de Unidad', count: s.tiposUnidad.length, type: 'main' },
        { label: 'Macro Sectores', count: s.macroSectores.length, type: 'main' },
        { label: 'Micro Sectores', count: s.microSectores.length, type: 'main' },
        { label: 'Unidades', count: s.unidades.length, type: 'main' },
        { label: 'Personas', count: s.personas.length, type: 'main' },
        { label: 'Vínculos', count: s.vinculos.length, type: 'main' },
      ];
      const m = s.maestros;
      const maestroEntries: [string, unknown[]][] = [
        ['AFP', m.afps], ['Previsión Salud', m.previsionesSalud], ['Mutuales/Cajas', m.mutualesCajas],
        ['Feriados', m.feriados], ['Bancos', m.bancos], ['Índices Ajuste', m.indicesAjuste],
        ['Cajas Fondos', m.cajasFondos], ['Categorías Insumos', m.categoriasInsumos],
        ['Unidades Medida', m.unidadesMedida], ['Contactos Emergencia', m.contactosEmergencia],
        ['Condiciones Especiales', m.condicionesEspeciales], ['Estados Ocupación', m.estadosOcupacion],
        ['Categorías Macro', m.categoriasMacro], ['Categorías Micro', m.categoriasMicro],
        ['Categorías Unidad', m.categoriasUnidad],
        ['Estados Inmobiliarios', m.estadosInmobiliarios],
      ];
      for (const [label, arr] of maestroEntries) {
        items.push({ label, count: Array.isArray(arr) ? arr.length : 0, type: 'maestro' });
      }

      const totalRecords = items.reduce((sum, it) => sum + it.count, 0);
      const withData = items.filter(it => it.count > 0).length;

      const payload = {
        _summary: {
          exportDate: new Date().toISOString(),
          totalRecords,
          collectionsWithData: withData,
          details: items,
        },
        state: {
          tiposUnidad: s.tiposUnidad,
          macroSectores: s.macroSectores,
          microSectores: s.microSectores,
          unidades: s.unidades,
          personas: s.personas,
          vinculos: s.vinculos,
          configuracion: s.configuracion,
          maestros: s.maestros,
        },
        version: STORE_VERSION,
      };
      const jsonStr = JSON.stringify(payload, null, 2);
      const now = new Date();
      const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `compass-backup-${stamp}.json`;

      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      let repoMsg = '';
      if (backupToRepo) {
        try {
          const res = await fetch('/api/backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: jsonStr, fileName }),
          });
          const data = await res.json();
          if (data.ok) {
            repoMsg = ` | Copia en: ${data.path}`;
          } else {
            repoMsg = ` | Error al guardar en repo: ${data.error}`;
          }
        } catch (err) {
          repoMsg = ` | Error al conectar con el servidor`;
        }
      }

      setBackupSummary(items);
      setBackupDiff(diffCompassData(s, seedData()));
      setBackupDetailOpen(false);
      setStoreBackupMsg({
        type: 'ok',
        text: `Backup exportado: ${fileName} — ${totalRecords} registros en ${withData} colecciones${repoMsg}`,
      });
    } catch (e) {
      setStoreBackupMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  }, [backupToRepo]);

  const onStoreFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const validation = validateStoreBackup(parsed);
        setStoreImportValidation(validation);
        setStoreImportPending({ json: JSON.stringify(parsed), fileName: file.name });
        setStoreImportDialogOpen(true);
      } catch {
        setStoreBackupMsg({ type: 'error', text: 'El archivo no es un JSON válido.' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const confirmStoreImport = useCallback(() => {
    if (!storeImportPending || !storeImportValidation) return;
    if (!storeImportValidation.ok) {
      setStoreBackupMsg({
        type: 'error',
        text: `Importación bloqueada: ${storeImportValidation.errors[0]}`,
      });
      return;
    }
    try {
      const parsed = JSON.parse(storeImportPending.json);
      const envelope =
        parsed && typeof parsed === 'object' && 'state' in parsed
          ? parsed
          : { state: parsed, version: STORE_VERSION };
      localStorage.setItem(STORE_KEY, JSON.stringify(envelope));
      setStoreImportDialogOpen(false);
      setStoreImportPending(null);
      setStoreImportValidation(null);
      setStoreBackupMsg({ type: 'ok', text: 'Importación exitosa. Recargando...' });
      window.setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setStoreBackupMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) });
      setStoreImportDialogOpen(false);
    }
  }, [storeImportPending, storeImportValidation]);

  const confirmStoreClear = useCallback(() => {
    try {
      localStorage.removeItem(STORE_KEY);
      setStoreClearDialogOpen(false);
      setStoreBackupMsg({ type: 'ok', text: 'Datos temporales eliminados. Recargando con los datos de fábrica...' });
      window.setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setStoreBackupMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) });
      setStoreClearDialogOpen(false);
    }
  }, []);

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
    // `archived` y `dirty` ya vienen calculados server-side con isSpecDirtyAfterArchive
    return data.specs.map(s => ({
      ...s,
      archived: (s as unknown as { archived?: boolean }).archived ?? false,
      dirty: (s as unknown as { dirty?: boolean }).dirty ?? false,
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
        (m.change ?? '').toLowerCase().includes(term) ||
        (m.cierre ?? '').includes(term) ||
        (m.notesStatus ? `nota ${m.notesStatus}` : '').includes(term);
      const matchesPhase = modulePhases.length === 0 || modulePhases.includes(m.phase);
      const matchesStatus = moduleStatuses.length === 0 || moduleStatuses.includes(m.status);
      const matchesCierre = moduleCierres.length === 0 || moduleCierres.includes(m.cierre);
      return matchesSearch && matchesPhase && matchesStatus && matchesCierre;
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
  }, [data, moduleSearch, modulePhases, moduleStatuses, moduleCierres, moduleSort]);

  const completedCount = activeChange?.tasks.filter(t => t.completed).length ?? 0;
  const totalCount = activeChange?.tasks.length ?? 0;
  const progressPercent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const nextTask = activeChange?.tasks.find(t => !t.completed) ?? null;

  const toggleTask = useCallback(
    async (task: TaskItem) => {
      if (!activeChange) return;
      const inArchived = data?.archived.some(c => c.id === activeChange.id) ?? false;
      setSavingId(task.id);
      const patchTasks = (c: ChangeInfo) =>
        c.id === activeChange.id
          ? { ...c, tasks: c.tasks.map(t => (t.id === task.id ? { ...t, completed: !t.completed } : t)) }
          : c;
      setData(prev =>
        prev
          ? {
              ...prev,
              changes: inArchived ? prev.changes : prev.changes.map(patchTasks),
              archived: inArchived ? prev.archived.map(patchTasks) : prev.archived,
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
          prev
            ? {
                ...prev,
                changes: inArchived ? prev.changes : prev.changes.map(c => (c.id === activeChange.id ? json.change : c)),
                archived: inArchived ? prev.archived.map(c => (c.id === activeChange.id ? json.change : c)) : prev.archived,
              }
            : prev
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        refresh();
      } finally {
        setSavingId(null);
      }
    },
    [activeChange, data, refresh]
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

  const saveNotes = useCallback(async (file: string, content: string, status?: 'pendientes' | 'atendidas') => {
    setNotesSaving(true);
    setNotesSaved(false);
    try {
      const res = await fetch('/api/dev-dashboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, content, status }),
      });
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      setNotesSaved(true);
      setData(prev =>
        prev
          ? {
              ...prev,
              modules: prev.modules.map(m =>
                m.file === file
                  ? {
                      ...m,
                      notes: content,
                      notesFile: `openspec/notes/${file.replace(/\.md$/, '')}.md`,
                      notesStatus: status ?? 'pendientes',
                    }
                  : m
              ),
            }
          : prev
      );
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setNotesSaving(false);
    }
  }, []);

  const setNotesStatus = useCallback(async (file: string, status: 'pendientes' | 'atendidas') => {
    setNotesSaving(true);
    try {
      const res = await fetch('/api/dev-dashboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, status }),
      });
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      setData(prev =>
        prev
          ? {
              ...prev,
              modules: prev.modules.map(m =>
                m.file === file ? { ...m, notesStatus: status } : m
              ),
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setNotesSaving(false);
    }
  }, []);

  useEffect(() => {
    setNotesDraft(selectedModule?.notes?.replace(/^\s*<!--\s*estado:.*?-->\s*/, '').trim() ?? '');
  }, [selectedModule]);

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
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <input
                ref={storeFileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={onStoreFileChange}
              />
              <Button variant="outline" size="sm" onClick={exportStore} title="Descargar los datos del store local (localStorage) como JSON">
                <IconDownload className="size-4 mr-1" /> Exportar datos
              </Button>
              <Button variant="outline" size="sm" onClick={() => storeFileInputRef.current?.click()} title="Restaurar un backup JSON del store local">
                <IconUpload className="size-4 mr-1" /> Importar datos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStoreClearDialogOpen(true)}
                title="Eliminar los datos temporales del store local y volver a los datos de fábrica"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
              >
                <IconTrash className="size-4 mr-1" /> Limpiar datos
              </Button>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <Checkbox
                checked={backupToRepo}
                onCheckedChange={(v) => setBackupToRepo(v === true)}
              />
              Guardar copia en Data/NSGC/backups/
            </label>
            {storeBackupMsg && (
              <span
                className={`text-xs font-medium ${storeBackupMsg.type === 'ok' ? 'text-emerald-600' : 'text-destructive'}`}
              >
                {storeBackupMsg.text}
              </span>
            )}
            {backupSummary && backupDiff && (
              <Collapsible open={backupDetailOpen} onOpenChange={setBackupDetailOpen}>
                <div className="mt-1 rounded-lg border bg-muted/40 p-2.5 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {backupDiff.main.filter(d => d.added.length + d.removed.length + d.modified.length > 0).map((d) => (
                        <Badge key={d.label} variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
                          {d.label}: {d.seedCount}→{d.currentCount}
                          {d.added.length > 0 && <span className="text-emerald-600 ml-1">+{d.added.length}</span>}
                          {d.removed.length > 0 && <span className="text-destructive ml-1">-{d.removed.length}</span>}
                          {d.modified.length > 0 && <span className="text-amber-600 ml-1">~{d.modified.length}</span>}
                        </Badge>
                      ))}
                      {(() => {
                        const maestroAdded = backupDiff.maestros.reduce((s, d) => s + d.added.length, 0);
                        const maestroRemoved = backupDiff.maestros.reduce((s, d) => s + d.removed.length, 0);
                        const maestroModified = backupDiff.maestros.reduce((s, d) => s + d.modified.length, 0);
                        const totalChanges = maestroAdded + maestroRemoved + maestroModified;
                        return totalChanges > 0 ? (
                          <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                            Maestros
                            {maestroAdded > 0 && <span className="text-emerald-600 ml-1">+{maestroAdded}</span>}
                            {maestroRemoved > 0 && <span className="text-destructive ml-1">-{maestroRemoved}</span>}
                            {maestroModified > 0 && <span className="text-amber-600 ml-1">~{maestroModified}</span>}
                          </Badge>
                        ) : null;
                      })()}
                    </div>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] gap-0.5">
                        Detalle
                        <IconChevronDown className={`size-3 transition-transform ${backupDetailOpen ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <DiffSection title="Colecciones principales" diffs={backupDiff.main} />
                    <DiffSection title="Maestros" diffs={backupDiff.maestros} />
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}
          </div>
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

      <Dialog open={storeImportDialogOpen} onOpenChange={setStoreImportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Importar datos del store</DialogTitle>
            <DialogDescription>
              Se reemplazará el contenido actual del store local (<code className="font-mono text-xs">compass-store</code>) con el
              archivo <code className="font-mono text-xs">{storeImportPending?.fileName ?? ''}</code>. La página se recargará al confirmar.
            </DialogDescription>
          </DialogHeader>

          {storeImportValidation && (
            <div className="space-y-3 text-sm">
              {storeImportValidation.exportSummary && (
                <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Fecha de exportación</p>
                    <p className="font-mono font-bold">
                      {storeImportValidation.exportSummary.exportDate
                        ? new Date(storeImportValidation.exportSummary.exportDate).toLocaleString()
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Total registros</p>
                    <p className="font-mono font-bold">{storeImportValidation.exportSummary.totalRecords ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Colecciones con datos</p>
                    <p className="font-mono font-bold">{storeImportValidation.exportSummary.collectionsWithData ?? '—'}</p>
                  </div>
                </div>
              )}

              {storeImportValidation.summary && (
                <div className="rounded-lg border bg-muted/40 p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Versión</p>
                    <p className="font-mono font-bold">v{storeImportValidation.summary.version}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Personas</p>
                    <p className="font-mono font-bold">{storeImportValidation.summary.personas}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Vínculos</p>
                    <p className="font-mono font-bold">{storeImportValidation.summary.vinculos}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Unidades</p>
                    <p className="font-mono font-bold">{storeImportValidation.summary.unidades}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Maestros</p>
                    <p className="font-mono font-bold">{storeImportValidation.summary.maestros} colecciones</p>
                  </div>
                </div>
              )}

              {storeImportValidation.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="font-semibold text-destructive mb-1">Errores de validación:</p>
                  <ul className="space-y-1">
                    {storeImportValidation.errors.map((err, i) => (
                      <li key={i} className="text-xs text-destructive flex items-start gap-1">
                        <IconAlertTriangle className="size-3.5 mt-0.5 shrink-0" /> {err}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {storeImportValidation.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="font-semibold text-amber-600 mb-1">Advertencias:</p>
                  <ul className="space-y-1">
                    {storeImportValidation.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-600 flex items-start gap-1">
                        <IconAlertTriangle className="size-3.5 mt-0.5 shrink-0" /> {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setStoreImportDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirmStoreImport} disabled={!storeImportValidation?.ok}>
              <IconCheck className="size-4 mr-1" /> Confirmar importación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={storeClearDialogOpen} onOpenChange={setStoreClearDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Limpiar datos temporales</DialogTitle>
            <DialogDescription>
              Se eliminará el contenido actual del store local (<code className="font-mono text-xs">compass-store</code>) y la
              app recargará con los datos de fábrica (seed). Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm flex items-start gap-2">
            <IconAlertTriangle className="size-4 mt-0.5 shrink-0 text-destructive" />
            <span>
              Los cambios temporales realizados en la app se perderán. Usa{' '}
              <span className="font-semibold">Exportar datos</span> si quieres conservar una copia antes de limpiar.
            </span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStoreClearDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmStoreClear}>
              <IconTrash className="size-4 mr-1" /> Confirmar limpieza
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <span className="font-medium">🟠 Pendiente (change activo)</span> ·{' '}
              <span className="font-medium">🟡 Sucio (spec modificado post-archivo)</span>
            </p>
            {data && capabilities.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {capabilities.map(spec => {
                  const dirty = (spec as unknown as { dirty?: boolean }).dirty;
                  const isArchived = (spec as unknown as { archived?: boolean }).archived;
                  const tone = dirty ? 'dirty' : isArchived ? 'archived' : 'pending';
                  return (
                  <div
                    key={spec.name}
                    className={`rounded-lg border p-4 flex flex-col gap-2 ${
                      tone === 'archived' ? 'border-emerald-500/40 bg-emerald-500/5' : tone === 'dirty' ? 'border-sky-500/40 bg-sky-500/5' : 'border-orange-500/50 bg-orange-500/5'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <IconFileCode2 className="size-4 text-primary" />
                      <code className="font-mono font-bold text-sm">{spec.name}</code>
                      {spec.code && <Badge variant="outline" className="text-[10px]">{spec.code}</Badge>}
                      <Badge
                        variant={tone === 'archived' ? 'default' : 'outline'}
                        className={`text-[10px] ${
                          tone === 'archived' ? 'bg-emerald-600 hover:bg-emerald-700' : tone === 'dirty' ? 'bg-sky-600 hover:bg-sky-700 text-white' : 'bg-orange-500 hover:bg-orange-600'
                        }`}
                        title={
                          tone === 'archived'
                            ? 'Archivada: spec sincronizado con el último archive en openspec/changes/archive/'
                            : tone === 'dirty'
                              ? 'Sucio: spec modificado después de archivar — el sistema lo detecta solo (spec mtime > archive mtime), ejecuta /cierra-modulo para re-archivar y volver a verde'
                              : 'Pendiente: capability con spec pero sin archive, o con change activo en openspec/changes/'
                        }
                      >
                        {tone === 'archived' ? '🟢 Archivada' : tone === 'dirty' ? '🟡 Sucio' : '🟠 Pendiente'}
                      </Badge>
                    </div>
                    <ul className="text-xs text-muted-foreground font-mono space-y-1">
                      {spec.files.map(f => (
                        <li key={f}>• {spec.name}/{f}</li>
                      ))}
                    </ul>
                  </div>
                )})}
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

                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold flex items-center gap-2">
                        <IconClipboardCopy className="size-4 text-muted-foreground" /> Notas del módulo
                        {selectedModule.notesStatus === 'atendidas' && (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40 text-[10px]">
                            ✓ Atendidas
                          </Badge>
                        )}
                        {selectedModule.notesStatus === 'pendientes' && (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/40 text-[10px]">
                            ⏳ Pendientes
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Pendientes y control de avance. Se guardan en{' '}
                        <code className="font-mono text-[10px]">
                          {selectedModule.notesFile ?? `openspec/notes/${selectedModule.file.replace(/\.md$/, '')}.md`}
                        </code>.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {notesSaved && (
                        <span className="text-xs text-emerald-600 font-medium">✓ Guardado</span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setNotesDraft(selectedModule?.notes ?? '')}
                        disabled={notesSaving}
                        title="Descartar cambios sin guardar"
                      >
                        Revertir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setNotesStatus(
                            selectedModule.file,
                            selectedModule.notesStatus === 'atendidas' ? 'pendientes' : 'atendidas'
                          )
                        }
                        disabled={notesSaving || !selectedModule.notesStatus}
                        title={
                          selectedModule.notesStatus === 'atendidas'
                            ? 'Quitar la marca de atendidas (volver a pendientes)'
                            : 'Marcar las notas como revisadas y atendidas'
                        }
                      >
                        {selectedModule.notesStatus === 'atendidas' ? 'Quitar marca' : 'Marcar atendidas'}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveNotes(selectedModule.file, notesDraft, selectedModule.notesStatus)}
                        disabled={notesSaving}
                      >
                        {notesSaving ? 'Guardando...' : 'Guardar notas'}
                      </Button>
                    </div>
                  </div>
                  <textarea
                    value={notesDraft}
                    onChange={e => setNotesDraft(e.target.value)}
                    placeholder="Ej. Falta definir el calculador de prorrateo, revisar herencia de metraje con EF, etc."
                    className="w-full min-h-[96px] rounded-lg border bg-muted/30 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

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
              <CardTitle className="text-xl">Mapa Global de Fases y Módulos</CardTitle>
              <CardDescription>
                Estado derivado de <code className="font-mono text-xs">Data/NSGC/docs/especificaciones/</code> + OpenSpec.{' '}
                <span className="font-medium">🧪 Mock</span> ·{' '}
                <span className="font-medium">✓ Spec</span> ·{' '}
                <span className="font-medium">📘 Manual</span> ·{' '}
                <span className="font-medium">📝 Notas</span>
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="md:w-auto">
                      <IconArchive className="size-4 mr-2" /> Cierre
                      {moduleCierres.length > 0 && (
                        <Badge variant="default" className="ml-2 text-[10px]">{moduleCierres.length}</Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Filtrar por cierre (/cierra-modulo)</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {([
                      ['pendiente', '🔵 Falta cierre'],
                      ['cerrado', '🟢 Cerrado'],
                      ['no_aplica', '— No aplica'],
                    ] as const).map(([k, label]) => (
                      <DropdownMenuCheckboxItem
                        key={k}
                        checked={moduleCierres.includes(k)}
                        onCheckedChange={checked => {
                          setModuleCierres(prev =>
                            checked ? [...prev, k] : prev.filter(x => x !== k)
                          );
                        }}
                      >
                        {label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {moduleCierres.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={e => { e.preventDefault(); setModuleCierres([]); }}
                          className="text-xs text-destructive focus:text-destructive"
                        >
                          Limpiar cierres
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
                            ['notesStatus', 'Notas'],
                            ['change', 'Change'],
                            ['cierre', 'Cierre'],
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
                            {m.notesStatus === 'atendidas' ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40" title="Notas marcadas como atendidas">
                                ✓ Atendidas
                              </Badge>
                            ) : m.notesStatus === 'pendientes' ? (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/40" title="Tiene notas pendientes de revisión">
                                📝 Pendientes
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
                            {m.cierre === 'cerrado' ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40" title="Módulo cerrado (change archivado)">
                                🟢 Cerrado
                              </Badge>
                            ) : m.cierre === 'pendiente' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[10px] bg-orange-500/10 text-orange-600 border-orange-500/40 hover:bg-orange-500/20"
                                title={`Copiar comando: /cierra-modulo ${m.change ?? ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(`/cierra-modulo ${m.change ?? ''}`, `cierre-${m.code}`);
                                }}
                              >
                                {copiedId === `cierre-${m.code}` ? (
                                  <>
                                    <IconCheck className="size-3 mr-1 text-green-500" /> ¡Copiado!
                                  </>
                                ) : (
                                  <>🔵 Falta cierre</>
                                )}
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2" title={`${STATUS_BADGE[m.status].label}`}>
                              <div className="flex items-end gap-0.5" aria-hidden>
                                {[0, 1, 2, 3].map(i => (
                                  <span
                                    key={i}
                                    className={`w-1.5 rounded-sm transition-colors ${
                                      i < STATUS_LEVEL[m.status]
                                        ? STATUS_BAR_COLOR[m.status]
                                        : 'bg-muted'
                                    }`}
                                    style={{ height: `${7 + i * 3}px` }}
                                  />
                                ))}
                              </div>
                              <span className="text-[10px] text-muted-foreground font-medium">
                                {STATUS_BADGE[m.status].label.split(' ').slice(1).join(' ')}
                              </span>
                            </div>
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
