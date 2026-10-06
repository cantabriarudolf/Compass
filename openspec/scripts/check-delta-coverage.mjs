#!/usr/bin/env node
/**
 * check-delta-coverage.mjs — gate local previo al archive de openspec.
 *
 * Por qué existe: `openspec validate` (incluso --strict) NO detecta que un bloque
 * MODIFIED pierda escenarios, que apunte a un requirement inexistente, que una
 * capacidad destino no exista o que un ADDED colisione. El único gate real es
 * `openspec archive`, que falla cerrado al final del trabajo. Este script replica
 * esos guards para que el problema aparezca al escribir, no al archivar.
 *
 * Uso:
 *   node openspec/scripts/check-delta-coverage.mjs            # todos los changes activos
 *   node openspec/scripts/check-delta-coverage.mjs <change>   # uno solo
 *
 * Salida: 0 si todo aplica; 1 si algún archive fallaría. Sin dependencias.
 * Ver también: openspec/CONVENCION-DELTAS.md
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OPSX = resolve(dirname(fileURLToPath(import.meta.url)), ".."); // <root>/openspec
const CHANGES = join(OPSX, "changes");
const SPECS = join(OPSX, "specs");

const problems = [];
const notes = [];
const ok = [];

/* ---------- parseo ---------- */

function splitH2(text) {
  const out = new Map();
  let fence = null;
  let cur = null;
  let buf = [];
  const flush = () => {
    if (cur !== null && !out.has(cur)) out.set(cur, buf.join("\n"));
    buf = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const fm = line.match(/^\s*(`{3,}|~{3,})/);
    if (fm) {
      if (fence === null) fence = fm[1][0];
      else if (fm[1][0] === fence) fence = null;
      if (cur !== null) buf.push(line);
      continue;
    }
    if (fence === null) {
      const h2 = line.match(/^##\s+(.+?)\s*$/);
      if (h2) {
        flush();
        cur = h2[1];
        continue;
      }
    }
    if (cur !== null) buf.push(line);
  }
  flush();
  return out;
}

const normReq = (s) => s.trim().replace(/\s+/g, " ");
const normScen = (s) => s.trim();

function requirementBlocks(sectionText) {
  const out = new Map();
  let fence = null;
  let cur = null;
  let buf = [];
  const flush = () => {
    if (cur !== null && !out.has(cur.key)) out.set(cur.key, { name: cur.name, raw: buf.join("\n") });
    buf = [];
  };
  for (const line of sectionText.split(/\r?\n/)) {
    const fm = line.match(/^\s*(`{3,}|~{3,})/);
    if (fm) {
      if (fence === null) fence = fm[1][0];
      else if (fm[1][0] === fence) fence = null;
      if (cur !== null) buf.push(line);
      continue;
    }
    if (fence === null) {
      const h3 = line.match(/^###\s+Requirement:\s*(.+?)\s*$/i);
      if (h3) {
        flush();
        const name = h3[1].trim();
        cur = { key: normReq(name), name };
        buf = [line];
        continue;
      }
    }
    if (cur !== null) buf.push(line);
  }
  flush();
  return out;
}

function scenarioNames(blockRaw) {
  const names = [];
  let fence = null;
  for (const line of blockRaw.split(/\r?\n/)) {
    const fm = line.match(/^\s*(`{3,}|~{3,})/);
    if (fm) {
      if (fence === null) fence = fm[1][0];
      else if (fm[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const h4 = line.match(/^####\s+Scenario:\s*(.+?)\s*$/);
    if (h4) names.push(normScen(h4[1]));
  }
  return names;
}

function multisetDiff(current, incoming) {
  const pool = new Map();
  for (const n of incoming) pool.set(n, (pool.get(n) ?? 0) + 1);
  const missing = [];
  for (const n of current) {
    const left = pool.get(n) ?? 0;
    if (left > 0) pool.set(n, left - 1);
    else missing.push(n);
  }
  return missing;
}

function renamedPairs(sectionText) {
  const pairs = [];
  let pendingFrom = null;
  for (const line of sectionText.split(/\r?\n/)) {
    const from = line.match(/^\s*-?\s*FROM:\s*`?###\s*Requirement:\s*(.+?)`?\s*$/);
    const to = line.match(/^\s*-?\s*TO:\s*`?###\s*Requirement:\s*(.+?)`?\s*$/);
    if (from) pendingFrom = from[1].trim();
    else if (to && pendingFrom) {
      pairs.push({ from: pendingFrom, to: to[1].trim() });
      pendingFrom = null;
    }
  }
  return pairs;
}

function hasSkipSpecs(changeDir) {
  const p = join(changeDir, ".openspec.yaml");
  if (!existsSync(p)) return false;
  return /^\s*skip_specs:\s*true\s*$/m.test(readFileSync(p, "utf8"));
}

/* ---------- chequeo ---------- */

function specFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const cap of readdirSync(dir)) {
    const capDir = join(dir, cap);
    if (!statSync(capDir).isDirectory()) continue;
    for (const f of readdirSync(capDir)) {
      if (f.endsWith(".md")) out.push({ cap, file: join(capDir, f) });
    }
  }
  return out;
}

function checkChangeInner(change) {
  const dir = join(CHANGES, change);
  const files = specFiles(join(dir, "specs"));

  if (files.length === 0) {
    if (hasSkipSpecs(dir)) notes.push(`${change}: sin deltas y skip_specs: true → correcto`);
    else problems.push(`${change}: sin deltas en specs/ y sin skip_specs: true → \`openspec validate\` fallará. Si no modifica specs, agregar \`.openspec.yaml\` con skip_specs: true`);
    return;
  }

  for (const { cap, file } of files) {
    const rel = file.slice(OPSX.length + 1);
    const livePath = join(SPECS, cap, "spec.md");
    if (!existsSync(livePath)) {
      problems.push(`${change}: ${rel} apunta a la capacidad "${cap}", que no existe en openspec/specs/ → el archive fallará`);
      continue;
    }
    const delta = splitH2(readFileSync(file, "utf8"));
    const liveAll = requirementBlocks(readFileSync(livePath, "utf8"));

    const renamed = renamedPairs(delta.get("RENAMED Requirements") ?? "");
    const toOriginal = new Map(renamed.map((p) => [normReq(p.to), p.from]));
    for (const { from, to } of renamed) {
      if (!liveAll.has(normReq(from))) problems.push(`${change}: RENAMED FROM "${from}" no existe en ${cap} → el archive fallará`);
      if (liveAll.has(normReq(to))) problems.push(`${change}: RENAMED TO "${to}" ya existe en ${cap} → el archive fallará`);
    }

    for (const [name, block] of requirementBlocks(delta.get("ADDED Requirements") ?? "")) {
      if (liveAll.has(name)) {
        problems.push(`${change}: ADDED "${block.name}" ya existe en ${cap} → el archive fallará (usar MODIFIED)`);
      }
    }

    for (const name of (delta.get("REMOVED Requirements") ?? "").split(/\r?\n/)) {
      const m = name.match(/^\s*-?\s*`?###\s*Requirement:\s*(.+?)`?\s*$/);
      if (m && !liveAll.has(normReq(m[1]))) notes.push(`${change}: REMOVED "${m[1].trim()}" no está en ${cap} → el archive lo trata como no-op`);
    }

    for (const [name, block] of requirementBlocks(delta.get("MODIFIED Requirements") ?? "")) {
      const liveName = toOriginal.get(name) ?? block.name;
      const liveKey = normReq(liveName);
      const liveBlock = liveAll.get(liveKey);
      if (!liveBlock) {
        problems.push(`${change}: MODIFIED "${block.name}" no existe en ${cap} → el archive fallará (si lo estás renombrando, usar RENAMED FROM/TO)`);
        continue;
      }
      const missing = multisetDiff(scenarioNames(liveBlock.raw), scenarioNames(block.raw));
      if (missing.length > 0) {
        problems.push(`${change}: MODIFIED "${block.name}" perdería ${missing.length} escenario(s) de ${cap}: ${missing.map((n) => `"${n}"`).join(", ")}`);
      } else {
        ok.push(`${change}: MODIFIED "${block.name}" cubre los ${scenarioNames(liveBlock.raw).length} escenarios de ${cap}`);
      }
    }
  }
}

function checkChange(change) {
  const before = { ok: ok.length, problems: problems.length };
  checkChangeInner(change);
  if (problems.length === before.problems && ok.length === before.ok) {
    ok.push(`${change}: deltas consistentes`);
  }
}

/* ---------- main ---------- */

const arg = process.argv[2];
if (!existsSync(CHANGES)) {
  console.error(`No encuentro ${CHANGES}. Correr desde el repo de Compass.`);
  process.exit(2);
}
const targets = arg
  ? [arg]
  : readdirSync(CHANGES).filter((n) => n !== "archive" && statSync(join(CHANGES, n)).isDirectory());

for (const change of targets) checkChange(change);

for (const line of ok) console.log(`  ok    ${line}`);
for (const line of notes) console.log(`  info  ${line}`);
for (const line of problems) console.log(`  FALLA ${line}`);

console.log(
  `\n${targets.length} change(s) · ${ok.length} ok · ${notes.length} info · ${problems.length} que romperían el archive`,
);
process.exit(problems.length > 0 ? 1 : 0);
