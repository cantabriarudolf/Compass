import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type ModuleStatus = 'pendiente' | 'documentado' | 'en_proceso' | 'completado';

export type CierreStatus = 'cerrado' | 'pendiente' | 'no_aplica';

export interface ModuleInfo {
  code: string;
  name: string;
  file: string;
  phase: string;
  route: string;
  status: ModuleStatus;
  change?: string;
  cierre: CierreStatus;
  mockData: boolean;
  mockFile?: string;
  documented: boolean;
  specFile?: string;
  hasManual: boolean;
  manualFile?: string;
  notes: string;
  notesFile?: string;
  notesStatus?: 'pendientes' | 'atendidas';
}

export interface TaskItem {
  id: string;
  section: string;
  title: string;
  completed: boolean;
}

export interface ChangeInfo {
  id: string;
  archived: boolean;
  created?: string;
  tasks: TaskItem[];
}

export interface SpecCapability {
  name: string;
  code: string;
  files: string[];
}

export interface DashboardStats {
  total: number;
  completado: number;
  enProceso: number;
  documentado: number;
  pendiente: number;
}

export interface DashboardData {
  modules: ModuleInfo[];
  changes: ChangeInfo[];
  archived: ChangeInfo[];
  specs: SpecCapability[];
  stats: DashboardStats;
}

const PHASES: Record<string, string> = {
  RG: 'Fase 0',
  ST: 'Fase 0',
  UI: 'Fase 0',
  TU: 'Fase 1',
  EF: 'Fase 1',
  ES: 'Fase 1',
  MA: 'Fase 2',
  MP: 'Fase 2',
  VU: 'Fase 2',
  CF: 'Fase 2',
  PI: 'Fase 2',
  FI: 'Fase 3',
  AD: 'Fase 3',
  GD: 'Fase 3',
  CO: 'Fase 3',
  CV: 'Fase 3',
  GE: 'Fase 3',
  RE: 'Fase 3',
  AM: 'Fase 3',
  PE: 'Fase 4',
  PL: 'Fase 4',
  RA: 'Fase 4',
  CT: 'Fase 4',
  IN: 'Fase 4',
  MT: 'Fase 4',
  RP: 'Fase 4',
  IR: 'Fase 4',
};

const ROUTES: Record<string, string> = {
  RG: '(Lógica Base)',
  ST: '(Cross-cutting)',
  UI: '(Cross-cutting)',
  TU: '/inventario/tipos',
  EF: '/inventario/estructura',
  ES: '/inventario/estacionamientos',
  MA: '/admin/maestros',
  MP: '/comunidad/personas',
  VU: '/comunidad/personas/[id]',
  CF: '/admin/configuracion',
  FI: '/finanzas/gastos-comunes',
  AD: '/dashboard',
  GD: '/comunidad/directiva',
  CO: '/comunidad/comunicacion',
  CV: '/comunidad/visor-mensajes',
  GE: '/operaciones/solicitudes',
  RA: '/operaciones/reservas',
  AM: '/admin/metricas',
  RP: '/admin/permisos',
  PI: '/comunidad/portal',
  CT: '/comunidad/certificados',
  IN: '/finanzas/multas',
  IR: '/inventario/recursos',
  MT: '/inventario/proyectos',
  PE: '/personas/personal',
  PL: '/finanzas/remuneraciones',
  RE: '/reportes',
};

const ARCHIVED_OVERRIDES: Record<string, { code: string; name?: string }> = {
  'inventario-estructura': { code: 'EF' },
  'maestro-personas': { code: 'MP' },
  'UI-interfaz-principal': { code: 'UI', name: 'Interfaz Principal' },
};

const MOCK_DATA_FILES: Record<string, string> = {
  RG: 'data/maestros.ts',
  MA: 'data/maestros.ts',
  EF: 'data/inventario/estructura.ts',
  TU: 'data/inventario/estructura.ts',
  ES: 'data/inventario/estacionamientos.ts',
  MP: 'data/comunidad/personas.ts',
  VU: 'data/comunidad/personas.ts',
};

const PHASE_ORDER: Record<string, number> = {
  'Fase 0': 0,
  'Fase 1': 1,
  'Fase 2': 2,
  'Fase 3': 3,
  'Fase 4': 4,
};

function findRepoRoot(): string {
  const env = process.env.COMPASS_ROOT;
  if (env && existsSync(env)) return env;
  let dir = process.cwd();
  const root = path.parse(dir).root;
  while (dir !== root) {
    if (existsSync(path.join(dir, 'openspec')) && existsSync(path.join(dir, 'Data'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return path.resolve(process.cwd(), '..');
}

const REPO_ROOT = findRepoRoot();
const WEB_ROOT = existsSync(path.join(REPO_ROOT, 'k0mp4ss_fe', 'apps', 'web'))
  ? path.join(REPO_ROOT, 'k0mp4ss_fe', 'apps', 'web')
  : path.join(REPO_ROOT, 'apps', 'web');
const ESPEC_DIR = path.join(REPO_ROOT, 'Data', 'NSGC', 'docs', 'especificaciones');
const MANUALS_DIR = path.join(REPO_ROOT, 'Data', 'NSGC', 'docs', 'manuales');
const OPENSPEC_DIR = path.join(REPO_ROOT, 'openspec');
const SPECS_DIR = path.join(OPENSPEC_DIR, 'specs');
const CHANGES_DIR = path.join(OPENSPEC_DIR, 'changes');
const ARCHIVE_DIR = path.join(CHANGES_DIR, 'archive');

function readModules(): ModuleInfo[] {
  if (!existsSync(ESPEC_DIR)) return [];
  const specCodes = new Set(readSpecCodes());
  const manualCodes = readManualCodes();
  return readdirSync(ESPEC_DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('00'))
    .map((f): ModuleInfo => {
      const base = f.replace(/\.md$/, '');
      const match = base.match(/^([A-Za-z]{2,3})\s*[-–—]\s*(.+)$/);
      const code = match ? match[1]!.toUpperCase() : '';
      const name = match ? match[2]!.trim() : base;
      const mockFile = code ? MOCK_DATA_FILES[code] : undefined;
      const specFile = findSpecFile(code);
      const manualFile = findManualFile(code, name);
      return {
        code,
        name,
        file: f,
        phase: PHASES[code] ?? '—',
        route: ROUTES[code] ?? '',
        status: 'pendiente',
        cierre: 'no_aplica',
        mockData: mockFile ? existsSync(path.join(WEB_ROOT, mockFile)) : false,
        mockFile: mockFile && existsSync(path.join(WEB_ROOT, mockFile)) ? path.relative(REPO_ROOT, path.join(WEB_ROOT, mockFile)) : undefined,
        documented: specCodes.has(code),
        specFile,
        hasManual: manualCodes.has(code) || !!manualFile,
        manualFile,
        notes: readModuleNotes(f),
        notesFile: existsSync(path.join(REPO_ROOT, notesFileFor(f))) ? notesFileFor(f) : undefined,
        notesStatus: moduleNotesStatus(f),
      };
    })
    .sort((a, b) => {
      const phaseDiff = (PHASE_ORDER[a.phase] ?? 99) - (PHASE_ORDER[b.phase] ?? 99);
      return phaseDiff !== 0 ? phaseDiff : a.code.localeCompare(b.code);
    });
}

function parseTasks(content: string): TaskItem[] {
  const tasks: TaskItem[] = [];
  let section = '';
  for (const line of content.split('\n')) {
    const sectionMatch = line.match(/^##\s+(.+)/);
    if (sectionMatch) {
      section = sectionMatch[1]!.trim();
      continue;
    }
    const taskMatch = line.match(/^\s*-\s*\[([ xX])\]\s+([0-9.]+)\s+(.+)$/);
    if (taskMatch) {
      tasks.push({
        id: taskMatch[2]!,
        section,
        title: taskMatch[3]!.trim(),
        completed: taskMatch[1]!.toLowerCase() === 'x',
      });
    }
  }
  return tasks;
}

function readChange(dirPath: string, id: string, archived: boolean): ChangeInfo | null {
  const tasksPath = path.join(dirPath, 'tasks.md');
  if (!existsSync(tasksPath)) return null;
  let created: string | undefined;
  const metaPath = path.join(dirPath, '.openspec.yaml');
  if (existsSync(metaPath)) {
    const match = readFileSync(metaPath, 'utf8').match(/^created:\s*(.+)$/m);
    if (match) created = match[1]!.trim();
  }
  return {
    id,
    archived,
    created,
    tasks: parseTasks(readFileSync(tasksPath, 'utf8')),
  };
}

function readChanges(dir: string, archived: boolean): ChangeInfo[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => readChange(path.join(dir, entry.name), entry.name, archived))
    .filter((change): change is ChangeInfo => change !== null);
}

function readSpecCodes(): string[] {
  if (!existsSync(SPECS_DIR)) return [];
  return readdirSync(SPECS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => (entry.name.split('-')[0] ?? '').toUpperCase());
}

function readSpecs(): SpecCapability[] {
  if (!existsSync(SPECS_DIR)) return [];
  return readdirSync(SPECS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const dirPath = path.join(SPECS_DIR, entry.name);
      const files = readdirSync(dirPath).filter(f => f.endsWith('.md'));
      return {
        name: entry.name,
        code: entry.name.split('-')[0]?.toUpperCase() ?? '',
        files,
      };
    });
}

function archivedKey(id: string): string {
  return id.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

function keywordsMatch(changeId: string, moduleName: string): boolean {
  const changeTokens = new Set(
    changeId
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 4 && !/^\d+$/.test(t))
  );
  return moduleName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some(t => t.length >= 4 && changeTokens.has(t));
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3)
    .join(' ');
}

function readManualCodes(): Set<string> {
  const codes = new Set<string>();
  if (!existsSync(MANUALS_DIR)) return codes;
  for (const f of readdirSync(MANUALS_DIR)) {
    const fullPath = path.join(MANUALS_DIR, f);
    if (statSync(fullPath).size === 0) continue;
    const match = f.match(/^\d+\s*[-–—]\s*([A-Za-z]{2,3})\s*[-–—]/);
    if (match) codes.add(match[1]!.toUpperCase());
  }
  return codes;
}

function findSpecFile(code: string): string | undefined {
  if (!code || !existsSync(SPECS_DIR)) return undefined;
  return readdirSync(SPECS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.toUpperCase().startsWith(`${code}-`))
    .map(e => `openspec/specs/${e.name}/spec.md`)
    .find(f => existsSync(path.join(REPO_ROOT, f)));
}

function findManualFile(code: string, name: string): string | undefined {
  if (!existsSync(MANUALS_DIR)) return undefined;
  const target = normalize(name);
  const candidates: string[] = [];

  for (const f of readdirSync(MANUALS_DIR)) {
    const fullPath = path.join(MANUALS_DIR, f);
    if (statSync(fullPath).size === 0) continue;
    if (code) {
      const codeMatch = f.match(/^\d+\s*[-–—]\s*([A-Za-z]{2,3})\s*[-–—]/);
      if (codeMatch && codeMatch[1]!.toUpperCase() === code) {
        candidates.push(f);
      }
    }
  }

  if (candidates.length > 0) {
    for (const f of candidates) {
      const manualName = f.replace(/\.md$/, '').replace(/^\d+\s*[-–—]\s*([A-Za-z]{2,3})\s*[-–—]\s*/, '');
      const mn = normalize(manualName);
      if (target && (mn.includes(target) || target.includes(mn))) {
        return `Data/NSGC/docs/manuales/${f}`;
      }
    }
    return `Data/NSGC/docs/manuales/${candidates[0]}`;
  }

  for (const f of readdirSync(MANUALS_DIR)) {
    const fullPath = path.join(MANUALS_DIR, f);
    if (statSync(fullPath).size === 0) continue;
    const manualName = f.replace(/\.md$/, '').replace(/^\d+\s*[-–—]\s*/, '');
    const mn = normalize(manualName);
    if (target && (mn.includes(target) || target.includes(mn))) {
      return `Data/NSGC/docs/manuales/${f}`;
    }
  }
  return undefined;
}

function deriveStatus(
  module: ModuleInfo,
  activeIds: string[],
  archivedIds: string[],
  specCodes: string[]
): { status: ModuleStatus; change?: string; cierre: CierreStatus } {
  const { code } = module;
  if (!code) return { status: 'pendiente', cierre: 'no_aplica' };

  const active = activeIds.find(id => id.toUpperCase().startsWith(`${code}-`));
  if (active) return { status: 'en_proceso', change: active, cierre: 'pendiente' };

  const byOverride = archivedIds.find(id => {
    const override = ARCHIVED_OVERRIDES[archivedKey(id)];
    return override && override.code === code && (!override.name || module.name.includes(override.name));
  });
  if (byOverride) return { status: 'completado', change: byOverride, cierre: 'cerrado' };

  const keywordArchived = archivedIds.find(
    id => !ARCHIVED_OVERRIDES[archivedKey(id)] && keywordsMatch(id, module.name)
  );
  if (keywordArchived) return { status: 'completado', change: keywordArchived, cierre: 'cerrado' };

  if (specCodes.includes(code)) return { status: 'documentado', cierre: 'no_aplica' };
  return { status: 'pendiente', cierre: 'no_aplica' };
}

export function getDashboardData(): DashboardData {
  const modules = readModules();
  const changes = readChanges(CHANGES_DIR, false);
  const archived = readChanges(ARCHIVE_DIR, true);
  const specCodes = readSpecCodes();

  const activeIds = changes.map(c => c.id);
  const archivedIds = archived.map(c => c.id);

  const stats: DashboardStats = { total: modules.length, completado: 0, enProceso: 0, documentado: 0, pendiente: 0 };

  for (const mod of modules) {
    const derived = deriveStatus(mod, activeIds, archivedIds, specCodes);
    mod.status = derived.status;
    mod.change = derived.change;
    mod.cierre = derived.cierre;
    if (derived.status === 'completado') stats.completado += 1;
    else if (derived.status === 'en_proceso') stats.enProceso += 1;
    else if (derived.status === 'documentado') stats.documentado += 1;
    else stats.pendiente += 1;
  }

  return { modules, changes, archived, specs: readSpecs(), stats };
}

export function toggleTask(changeId: string, taskId: string): ChangeInfo | null {
  const candidates = [path.join(CHANGES_DIR, changeId), path.join(ARCHIVE_DIR, changeId)];
  const dirPath = candidates.find(existsSync);
  if (!dirPath) return null;

  const filePath = path.join(dirPath, 'tasks.md');
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, 'utf8');
  const updated = content
    .split('\n')
    .map(line => {
      const match = line.match(/^(\s*-\s*\[)([ xX])(\]\s*)([0-9.]+)(\s.*)$/);
      if (match && match[4] === taskId) {
        return `${match[1]}${match[2]!.toLowerCase() === 'x' ? ' ' : 'x'}${match[3]}${match[4]}${match[5]}`;
      }
      return line;
    })
    .join('\n');
  writeFileSync(filePath, updated, 'utf8');

  const archived = dirPath.startsWith(ARCHIVE_DIR);
  return readChange(dirPath, changeId, archived);
}

const ALLOWED_FILE_PREFIXES = [
  `${REPO_ROOT}/openspec/specs/`,
  `${REPO_ROOT}/openspec/changes/`,
  `${REPO_ROOT}/Data/NSGC/docs/`,
  `${WEB_ROOT}/data/`,
];

const NOTES_STATUS_PREFIX = '<!-- estado:';

export function notesFileFor(file: string): string {
  const base = path.basename(file, '.md');
  return `openspec/notes/${base}.md`;
}

function notesStatusOf(content: string): 'pendientes' | 'atendidas' | undefined {
  const match = content.match(new RegExp(`${NOTES_STATUS_PREFIX}\\s*(pendientes|atendidas)\\s*-->`));
  if (match) return match[1] as 'pendientes' | 'atendidas';
  return undefined;
}

function notesWithoutStatus(content: string): string {
  return content.replace(new RegExp(`^\\s*${NOTES_STATUS_PREFIX}.*-->\\s*`), '').trim();
}

export function readModuleNotes(file: string): string {
  const rel = notesFileFor(file);
  const full = path.join(REPO_ROOT, rel);
  if (!existsSync(full)) return '';
  return readFileSync(full, 'utf8');
}

export function moduleNotesStatus(file: string): 'pendientes' | 'atendidas' | undefined {
  const content = readModuleNotes(file);
  if (!content.trim()) return undefined;
  return notesStatusOf(content);
}

export function saveModuleNotes(file: string, content: string, status?: 'pendientes' | 'atendidas'): { ok: boolean; error?: string } {
  const rel = notesFileFor(file);
  const full = path.join(REPO_ROOT, rel);
  const dir = path.dirname(full);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const statusLine = status ? `${NOTES_STATUS_PREFIX} ${status} -->\n\n` : '';
  writeFileSync(full, `${statusLine}${notesWithoutStatus(content)}`, 'utf8');
  return { ok: true };
}

export function setModuleNotesStatus(file: string, status: 'pendientes' | 'atendidas'): { ok: boolean; error?: string } {
  const content = readModuleNotes(file);
  return saveModuleNotes(file, content, status);
}

export function readProjectFile(relPath: string): string | null {
  const normalized = path.normalize(relPath).replace(/^[/\\]+/, '');
  const full = path.resolve(REPO_ROOT, normalized);
  if (!ALLOWED_FILE_PREFIXES.some(p => full.startsWith(p))) return null;
  if (!existsSync(full) || statSync(full).size === 0) return null;
  return readFileSync(full, 'utf8');
}
