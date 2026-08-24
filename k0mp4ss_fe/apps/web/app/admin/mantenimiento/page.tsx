'use client';

import React, { useCallback, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Button } from '@workspace/ui/components/button';
import { Checkbox } from '@workspace/ui/components/checkbox';
import { Badge } from '@workspace/ui/components/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import {
  IconTrash,
  IconDownload,
  IconAlertTriangle,
  IconDatabase,
  IconArrowLeft,
  IconShieldExclamation,
} from '@tabler/icons-react';
import { useCompassStore, STORE_VERSION, useStoreRehydrated, seedData } from '@/lib/store';
import { STORE_KEY } from '@/lib/store-backup';
import Link from 'next/link';

export default function MantenimientoPage() {
  useStoreRehydrated();
  const hasHydrated = useCompassStore((s) => s.hasHydrated);
  const store = useCompassStore();

  const [storeClearDialogOpen, setStoreClearDialogOpen] = useState(false);
  const [backupToRepo, setBackupToRepo] = useState(false);
  const [storeBackupMsg, setStoreBackupMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const exportStore = useCallback(async () => {
    try {
      const s = useCompassStore.getState();
      const items = [
        { label: 'Tipos de Unidad', count: s.tiposUnidad.length },
        { label: 'Macro Sectores', count: s.macroSectores.length },
        { label: 'Micro Sectores', count: s.microSectores.length },
        { label: 'Unidades', count: s.unidades.length },
        { label: 'Personas', count: s.personas.length },
        { label: 'Vínculos', count: s.vinculos.length },
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
        items.push({ label, count: Array.isArray(arr) ? arr.length : 0 });
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
        } catch {
          repoMsg = ` | Error al conectar con el servidor`;
        }
      }

      setStoreBackupMsg({
        type: 'ok',
        text: `Backup exportado: ${fileName} — ${totalRecords} registros en ${withData} colecciones${repoMsg}`,
      });
    } catch (e) {
      setStoreBackupMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  }, [backupToRepo]);

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

  if (!hasHydrated) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />;
  }

  const totalUnidades = store.unidades.length;
  const totalPersonas = store.personas.length;
  const totalVinculos = store.vinculos.length;
  const seed = seedData();
  const diffUnidades = totalUnidades - seed.unidades.length;
  const diffPersonas = totalPersonas - seed.personas.length;
  const diffVinculos = totalVinculos - seed.vinculos.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b pb-5">
        <div className="flex items-center gap-2">
          <Link href="/admin/dev-dashboard">
            <Button variant="ghost" size="sm">
              <IconArrowLeft className="size-4 mr-1" /> Volver al Dashboard
            </Button>
          </Link>
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconDatabase className="size-7 text-primary" /> Mantenimiento
          </h1>
          <p className="text-muted-foreground">
            Gestión de datos temporales del store local (<code className="font-mono text-xs">compass-store</code> v{STORE_VERSION}).
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Esta sección está aislada intencionalmente para evitar limpiezas accidentales desde el dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Unidades: {totalUnidades} {diffUnidades !== 0 && <span className={diffUnidades > 0 ? 'text-emerald-600 ml-1' : 'text-amber-600 ml-1'}>({diffUnidades > 0 ? '+' : ''}{diffUnidades} vs seed)</span>}</Badge>
          <Badge variant="outline">Personas: {totalPersonas} {diffPersonas !== 0 && <span className={diffPersonas > 0 ? 'text-emerald-600 ml-1' : 'text-amber-600 ml-1'}>({diffPersonas > 0 ? '+' : ''}{diffPersonas})</span>}</Badge>
          <Badge variant="outline">Vínculos: {totalVinculos} {diffVinculos !== 0 && <span className={diffVinculos > 0 ? 'text-emerald-600 ml-1' : 'text-amber-600 ml-1'}>({diffVinculos > 0 ? '+' : ''}{diffVinculos})</span>}</Badge>
          <Badge variant="outline">Tipos Unidad: {store.tiposUnidad.length}</Badge>
          <Badge variant="outline">Macro Sectores: {store.macroSectores.length}</Badge>
        </div>
      </div>

      {storeBackupMsg && (
        <div className={`rounded-lg border p-3 text-sm ${storeBackupMsg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-300' : 'bg-destructive/10 border-destructive/40 text-destructive'}`}>
          {storeBackupMsg.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconDownload className="size-5 text-primary" /> Respaldar antes de limpiar
          </CardTitle>
          <CardDescription>
            Recomendado: exporta una copia antes de borrar. El backup incluye el snapshot completo del store validable con <code className="font-mono text-xs">validateStoreBackup</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={exportStore}>
              <IconDownload className="size-4 mr-1" /> Exportar datos
            </Button>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <Checkbox
                checked={backupToRepo}
                onCheckedChange={(v) => setBackupToRepo(v === true)}
              />
              Guardar copia en Data/NSGC/backups/
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Genera <code className="font-mono text-xs">compass-backup-YYYY-MM-DD.json</code> con <code className="font-mono text-xs">{`{ state, version }`}</code> y opcionalmente lo guarda en el repo vía <code className="font-mono text-xs">POST /api/backup</code>.
          </p>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <IconShieldExclamation className="size-5" /> Zona peligrosa
          </CardTitle>
          <CardDescription>
            Esta acción elimina <code className="font-mono text-xs">compass-store</code> de <code className="font-mono text-xs">localStorage</code> y recarga la app con los datos de fábrica (seed). No se puede deshacer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm flex items-start gap-2">
            <IconAlertTriangle className="size-4 mt-0.5 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="font-semibold text-destructive">Se perderán los cambios temporales:</p>
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                <li>Unidades, personas y vínculos creados en el navegador</li>
                <li>Maestros y configuración editados localmente</li>
                <li>Datos de prueba del Laboratorio QA (prefijo TEST-)</li>
              </ul>
              <p className="text-xs font-medium">Usa <span className="font-semibold">Exportar datos</span> si quieres conservar una copia antes de limpiar.</p>
            </div>
          </div>

          <Button
            variant="destructive"
            onClick={() => setStoreClearDialogOpen(true)}
          >
            <IconTrash className="size-4 mr-1" /> Limpiar datos temporales
          </Button>
        </CardContent>
      </Card>

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
    </div>
  );
}
