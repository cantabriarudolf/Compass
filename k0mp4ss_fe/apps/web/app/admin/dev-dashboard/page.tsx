'use client';

import React, { useState } from 'react';
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
  IconFileCode2, 
  IconInfoSmall,
  IconBrandVscode
} from '@tabler/icons-react';

interface Task {
  id: string;
  title: string;
  section: string;
  completed: boolean;
  context: string;
  files: string[];
  specs: string[];
  hermesPrompt: string;
}

const initialTasks: Task[] = [
  {
    id: '1.1',
    title: '1.1 Crear el componente FormularioVinculoUnidad en components/comunidad/formulario-vinculo.tsx',
    section: '1. UI Atómica (Formularios de Vínculo)',
    completed: false,
    context: 'Construir el formulario modular para vincular unidades con personas. Debe importar las interfaces creadas en docs/06 e integrar los componentes de @workspace/ui (Select, Input, Button, Card).',
    files: ['apps/web/components/comunidad/formulario-vinculo.tsx', 'packages/ui/src/components/select.tsx'],
    specs: ['docs/05 - CRUD Vinculacion de Unidades.md', 'docs/06 - Interfaces TypeScript FormularioVinculoUnidad.md'],
    hermesPrompt: 'Ejecuta la tarea 1.1 del change vinculacion-unidades: Crea el componente FormularioVinculoUnidad en apps/web/components/comunidad/formulario-vinculo.tsx basándote en las interfaces descritas en docs/06 - Interfaces TypeScript FormularioVinculoUnidad.md.'
  },
  {
    id: '1.2',
    title: '1.2 Implementar selector de Unidades buscando en el inventario real (Mock de estructura.ts)',
    section: '1. UI Atómica (Formularios de Vínculo)',
    completed: false,
    context: 'Cargar la lista de unidades disponibles desde el mock apps/web/data/comunidad/estructura.ts y desplegarlas en un componente <Select> con información de Torre y Depto.',
    files: ['apps/web/data/comunidad/estructura.ts', 'apps/web/components/comunidad/formulario-vinculo.tsx'],
    specs: ['docs/05 - CRUD Vinculacion de Unidades.md'],
    hermesPrompt: 'Ejecuta la tarea 1.2 del change vinculacion-unidades: Conecta el selector de unidades de FormularioVinculoUnidad con el mock apps/web/data/comunidad/estructura.ts.'
  },
  {
    id: '1.3',
    title: '1.3 Selector obligatorio de Roles (Propietario, Arrendatario, Copropietario/Familiar, Ocupante)',
    section: '1. UI Atómica (Formularios de Vínculo)',
    completed: false,
    context: 'Permitir al usuario seleccionar el rol de la persona en la unidad especificada.',
    files: ['apps/web/components/comunidad/formulario-vinculo.tsx'],
    specs: ['docs/05 - CRUD Vinculacion de Unidades.md'],
    hermesPrompt: 'Ejecuta la tarea 1.3 del change vinculacion-unidades: Agrega el dropdown de selección de rol de ocupación en FormularioVinculoUnidad.'
  },
  {
    id: '2.1',
    title: '2.1 Validar para evitar vínculos duplicados hacia la misma unidad en la persona actual',
    section: '2. Lógica Dinámica y Validaciones',
    completed: false,
    context: 'Verificar si la persona ya tiene vinculada la unidad seleccionada antes de permitir guardar.',
    files: ['apps/web/components/comunidad/formulario-vinculo.tsx'],
    specs: ['docs/05 - CRUD Vinculacion de Unidades.md'],
    hermesPrompt: 'Ejecuta la tarea 2.1 del change vinculacion-unidades: Agrega validación para bloquear vínculos duplicados a la misma unidad.'
  },
  {
    id: '2.2',
    title: '2.2 Mostrar switch "Privacidad Financiera" SOLO si el rol es Propietario',
    section: '2. Lógica Dinámica y Validaciones',
    completed: false,
    context: 'Campos condicionales según el rol. El switch de finanzas solo aplica para Propietarios.',
    files: ['apps/web/components/comunidad/formulario-vinculo.tsx'],
    specs: ['docs/05 - CRUD Vinculacion de Unidades.md'],
    hermesPrompt: 'Ejecuta la tarea 2.2 del change vinculacion-unidades: Implementa el renderizado condicional del switch de Privacidad Financiera.'
  },
  {
    id: '2.3',
    title: '2.3 Mostrar selector "Estado Inmobiliario" SOLO si el rol es Propietario',
    section: '2. Lógica Dinámica y Validaciones',
    completed: false,
    context: 'Campos condicionales para Portal Inmobiliario (Venta, Arriendo, Uso Propio).',
    files: ['apps/web/components/comunidad/formulario-vinculo.tsx'],
    specs: ['docs/05 - CRUD Vinculacion de Unidades.md'],
    hermesPrompt: 'Ejecuta la tarea 2.3 del change vinculacion-unidades: Agrega el selector de estado inmobiliario condicional para propietarios.'
  },
  {
    id: '3.1',
    title: '3.1 Añadir botón "Vincular Unidad" en el Tab <TabUnidades /> dentro de /comunidad/personas/[id]/page.tsx',
    section: '3. Integración en Ficha de Identidad',
    completed: false,
    context: 'Integrar la acción principal de vinculación en la vista de detalle de la persona.',
    files: ['apps/web/app/comunidad/personas/[id]/page.tsx'],
    specs: ['docs/05 - CRUD Vinculacion de Unidades.md'],
    hermesPrompt: 'Ejecuta la tarea 3.1 del change vinculacion-unidades: Añade el botón Vincular Unidad en el TabUnidades dentro de /comunidad/personas/[id]/page.tsx.'
  },
  {
    id: '3.2',
    title: '3.2 Conectar el botón a un Dialog (Modal) que renderice FormularioVinculoUnidad',
    section: '3. Integración en Ficha de Identidad',
    completed: false,
    context: 'Abrir el modal de vinculación al hacer clic en el botón.',
    files: ['apps/web/app/comunidad/personas/[id]/page.tsx'],
    specs: ['docs/05 - CRUD Vinculacion de Unidades.md'],
    hermesPrompt: 'Ejecuta la tarea 3.2 del change vinculacion-unidades: Conecta el botón a un Dialog modal que despliegue el FormularioVinculoUnidad.'
  },
  {
    id: '3.3',
    title: '3.3 Actualizar estado local para inyectar la nueva unidad vinculada sin recargar la página',
    section: '3. Integración en Ficha de Identidad',
    completed: false,
    context: 'Reflejar la nueva unidad en las cards del Tab de forma reactiva en la UI.',
    files: ['apps/web/app/comunidad/personas/[id]/page.tsx'],
    specs: ['docs/05 - CRUD Vinculacion de Unidades.md'],
    hermesPrompt: 'Ejecuta la tarea 3.3 del change vinculacion-unidades: Implementa el estado reactivo para inyectar el nuevo vínculo en la vista.'
  },
  {
    id: '3.4',
    title: '3.4 Agregar lógica para eliminar vínculos existentes (Botón Eliminar en las Cards)',
    section: '3. Integración en Ficha de Identidad',
    completed: false,
    context: 'Permitir la eliminación/desvinculación con confirmación.',
    files: ['apps/web/app/comunidad/personas/[id]/page.tsx'],
    specs: ['docs/05 - CRUD Vinculacion de Unidades.md'],
    hermesPrompt: 'Ejecuta la tarea 3.4 del change vinculacion-unidades: Agrega la función de eliminación de vínculo en las cards de unidades.'
  }
];

const modulesList = [
  { code: '01', phase: 'Fase 0', name: 'Reglas Generales (RG)', route: '(Lógica Base)', status: 'completado' },
  { code: '02', phase: 'Fase 1', name: 'Tipos de Unidad (TU)', route: '/inventario/tipos', status: 'completado' },
  { code: '03', phase: 'Fase 1', name: 'Estructura Física (EF)', route: '/inventario/estructura', status: 'completado' },
  { code: '04', phase: 'Fase 1', name: 'Estacionamientos (ES)', route: '/inventario/estacionamientos', status: 'completado' },
  { code: '05', phase: 'Fase 2', name: 'Maestros Administrativos (MA)', route: '/admin/maestros', status: 'completado' },
  { code: '06', phase: 'Fase 2', name: 'Maestro de Personas (MP)', route: '/comunidad/personas', status: 'completado' },
  { code: '07', phase: 'Fase 2', name: 'Vinculación de Unidades (VU)', route: '/comunidad/personas/[id]', status: 'proceso' },
  { code: '09', phase: 'Fase 2', name: 'Configuración Global (CF)', route: '/admin/configuracion', status: 'pendiente' },
  { code: '10', phase: 'Fase 3', name: 'Finanzas y Morosidad (FI)', route: '/finanzas/gastos-comunes', status: 'pendiente' },
  { code: '11', phase: 'Fase 3', name: 'Gestión Administrativa (AD)', route: '/dashboard', status: 'pendiente' },
  { code: '12', phase: 'Fase 3', name: 'Gestión de Directiva (GD)', route: '/comunidad/directiva', status: 'pendiente' },
  { code: '13', phase: 'Fase 3', name: 'Comunicación Vecinos (CO)', route: '/comunidad/comunicacion', status: 'pendiente' },
  { code: '14', phase: 'Fase 3', name: 'Gestión de Solicitudes (GE)', route: '/operaciones/solicitudes', status: 'pendiente' },
  { code: '15', phase: 'Fase 4', name: 'Personal y Servicios (PE)', route: '/personas/personal', status: 'pendiente' },
  { code: '16', phase: 'Fase 4', name: 'Remuneraciones (PE)', route: '/finanzas/remuneraciones', status: 'pendiente' },
  { code: '17', phase: 'Fase 4', name: 'Reservas y Amenities (RA)', route: '/operaciones/reservas', status: 'pendiente' }
];

export default function DevDashboardPage() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selectedTask, setSelectedTask] = useState<Task | null>(tasks[0] ?? null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleTask = (id: string) => {
    setTasks(prev =>
      prev.map(t => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const completedCount = tasks.filter(t => t.completed).length;
  const progressPercent = Math.round((completedCount / tasks.length) * 100);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">Control OpenSpec</h1>
            <Badge variant="outline" className="text-primary border-primary/30">
              Ambiente Activo
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Monitoreo en vivo de avance, tareas de OpenSpec y prompts para Hermes / OpenCode.
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
        </div>
      </div>

      {/* KPI Cards (Matches Compass System Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="font-bold text-xs uppercase tracking-wider">Módulos Completados</CardDescription>
            <IconStack2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">6 / 24</div>
            <p className="text-xs text-muted-foreground mt-1">Fases 0, 1 y 2 (Parcial)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="font-bold text-xs uppercase tracking-wider">Change OpenSpec Activo</CardDescription>
            <IconBrandVscode className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-primary truncate">vinculacion-unidades</div>
            <p className="text-xs text-muted-foreground mt-1">Fase 2 - Pestaña Unidades</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="font-bold text-xs uppercase tracking-wider">Tareas del Change</CardDescription>
            <IconListCheck className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {completedCount} / {tasks.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {tasks.length - completedCount} tareas pendientes
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

      {/* Main Tabs */}
      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-2xl">
          <TabsTrigger value="tasks">
            <IconListCheck className="size-4 mr-2" /> Change Activo
          </TabsTrigger>
          <TabsTrigger value="modules">
            <IconStack2 className="size-4 mr-2" /> Mapa de Módulos
          </TabsTrigger>
          <TabsTrigger value="prompts">
            <IconTerminal2 className="size-4 mr-2" /> Prompts Hermes
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Tasks */}
        <TabsContent value="tasks" className="mt-6 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
              <div>
                <CardTitle className="text-xl">Lista de Tareas - Change: vinculacion-unidades</CardTitle>
                <CardDescription>
                  Selecciona o marca las tareas a medida que Hermes / OpenCode las vaya completando.
                </CardDescription>
              </div>
              <Badge variant="secondary">
                {completedCount} de {tasks.length} Completadas
              </Badge>
            </CardHeader>

            <CardContent className="p-6">
              <div className="space-y-4">
                {tasks.map(task => (
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
                        id={`task-${task.id}`}
                        checked={task.completed}
                        onCheckedChange={() => toggleTask(task.id)}
                        className="mt-1"
                      />
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <label
                            htmlFor={`task-${task.id}`}
                            className={`font-semibold cursor-pointer text-sm ${
                              task.completed ? 'line-through text-muted-foreground' : 'text-foreground'
                            }`}
                          >
                            {task.title}
                          </label>
                          {task.id === '1.1' && (
                            <Badge variant="default" className="text-[10px]">
                              SIGUIENTE A EJECUTAR
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{task.context}</p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {task.files.map((file, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] font-mono">
                              📁 {file.split('/').pop()}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedTask(task)}
                          >
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
                                <SheetTitle className="text-xl font-bold mt-2">
                                  {selectedTask.title}
                                </SheetTitle>
                                <SheetDescription>
                                  Contexto técnico completo e instrucciones para el agente.
                                </SheetDescription>
                              </SheetHeader>

                              <div className="space-y-4 text-sm">
                                <div>
                                  <h4 className="font-semibold text-primary mb-1">Descripción del Trabajo:</h4>
                                  <p className="bg-muted p-3 rounded-lg border text-muted-foreground text-xs leading-relaxed">
                                    {selectedTask.context}
                                  </p>
                                </div>

                                <div>
                                  <h4 className="font-semibold text-primary mb-1">Archivos Involucrados:</h4>
                                  <ul className="bg-muted p-3 rounded-lg border space-y-1 font-mono text-xs text-foreground">
                                    {selectedTask.files.map((f, idx) => (
                                      <li key={idx}>• {f}</li>
                                    ))}
                                  </ul>
                                </div>

                                <div>
                                  <h4 className="font-semibold text-primary mb-1">Especificaciones de Referencia:</h4>
                                  <ul className="bg-muted p-3 rounded-lg border space-y-1 font-mono text-xs text-foreground">
                                    {selectedTask.specs.map((s, idx) => (
                                      <li key={idx}>• {s}</li>
                                    ))}
                                  </ul>
                                </div>

                                <div>
                                  <h4 className="font-semibold text-primary mb-1">Prompt Recomendado para Hermes:</h4>
                                  <div className="bg-muted p-3 rounded-lg border text-xs font-mono relative">
                                    <p className="text-foreground">{selectedTask.hermesPrompt}</p>
                                    <Button
                                      size="sm"
                                      onClick={() => copyToClipboard(selectedTask.hermesPrompt, selectedTask.id)}
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
                        onClick={() => toggleTask(task.id)}
                      >
                        {task.completed ? 'Desmarcar' : 'Completar ✓'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Global Modules */}
        <TabsContent value="modules" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Mapa Global de Fases y Módulos</CardTitle>
              <CardDescription>
                Estado de implementación de los 24 módulos del ecosistema NSGC.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted text-muted-foreground font-semibold border-b">
                    <tr>
                      <th className="p-3">Código</th>
                      <th className="p-3">Fase</th>
                      <th className="p-3">Módulo</th>
                      <th className="p-3">Ruta Kebab-case</th>
                      <th className="p-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {modulesList.map((m, idx) => (
                      <tr key={idx} className="hover:bg-muted/40 transition-colors">
                        <td className="p-3 font-mono font-bold text-primary">{m.code}</td>
                        <td className="p-3 text-muted-foreground">{m.phase}</td>
                        <td className="p-3 font-semibold">{m.name}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{m.route}</td>
                        <td className="p-3">
                          {m.status === 'completado' && (
                            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                              🟢 Completado
                            </Badge>
                          )}
                          {m.status === 'proceso' && (
                            <Badge variant="default" className="bg-primary hover:bg-primary">
                              🔵 En Proceso
                            </Badge>
                          )}
                          {m.status === 'pendiente' && (
                            <Badge variant="outline">
                              ⏳ Pendiente
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Prompts */}
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
                  <span className="font-semibold text-sm">🎯 Ejecutar Tarea 1.1 (Formulario Vinculo)</span>
                  <Badge variant="outline" className="text-xs">Paso Inicial</Badge>
                </div>
                <p className="font-mono text-xs bg-muted p-3 rounded-lg border">
                  hermes run "Lee docs/05 - CRUD Vinculacion de Unidades.md y docs/06 - Interfaces TypeScript FormularioVinculoUnidad.md. Implementa la tarea 1.1 en k0mp4ss_fe/apps/web/components/comunidad/formulario-vinculo.tsx"
                </p>
              </div>

              <div className="p-4 bg-muted/30 border rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm">🚀 Ejecutar Todo el Change vinculacion-unidades</span>
                  <Badge variant="outline" className="text-xs">Workflow Completo</Badge>
                </div>
                <p className="font-mono text-xs bg-muted p-3 rounded-lg border">
                  hermes run "/opsx-apply vinculacion-unidades"
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
