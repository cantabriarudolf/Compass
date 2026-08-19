import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function findRepoRoot(): string {
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
const BACKUPS_DIR = path.join(REPO_ROOT, 'Data', 'NSGC', 'backups');

export function saveBackup(content: string, fileName: string): { ok: boolean; path?: string; error?: string } {
  try {
    if (!existsSync(BACKUPS_DIR)) {
      mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fullPath = path.join(BACKUPS_DIR, safeName);
    writeFileSync(fullPath, content, 'utf8');
    return { ok: true, path: path.relative(REPO_ROOT, fullPath) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
