#!/usr/bin/env node
/**
 * e2e-fresh — prepara una base descartable y sembrada para la lane e2e.
 *
 * Paridad con el job `e2e` de .github/workflows/ci.yml:
 *   1) npx prisma migrate deploy --schema=prisma/schema.sqlite.prisma (con DATABASE_URL propio)
 *   2) npx prisma generate --schema=prisma/schema.sqlite.prisma (el client debe apuntar a
 *      SQLite: si el último generate fue el default PostgreSQL — p. ej. tras el job
 *      unit-pg — el seed correría con el client equivocado)
 *   3) npm run e2e:reseed-base (usuarios TEST vía API/authz + seed de mocks)
 *   4) imprime las advertencias operativas y el comando Playwright exacto con paridad CI.
 *
 * La base vive en prisma/<nombre>.db (gitignored vía `*.db`). NUNCA toca
 * prisma/dev.db: el nombre se valida y DATABASE_URL se fija explícitamente para
 * los subprocesos (process.env tiene prioridad sobre --env-file / .env de Vite,
 * comprobado con Node 24 y vite-node).
 *
 * Uso: npm run e2e:fresh [-- <nombre>.db]   (default: perf-fresh.db)
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prismaDir = path.join(webDir, "prisma");
const nombreBase = process.argv[2] ?? "perf-fresh.db";
const dbPath = path.join(prismaDir, nombreBase);

// Guard 1: solo nombres tipo perf*.db, sin separadores de ruta y jamás dev.db.
if (!/^perf[A-Za-z0-9._-]*\.db$/.test(nombreBase) || dbPath === path.join(prismaDir, "dev.db")) {
  console.error(
    `[e2e-fresh] Nombre inválido: "${nombreBase}". Debe ser perf<algo>.db (p. ej. perf-fresh.db). ` +
      `prisma/dev.db jamás se usa ni se borra en esta lane.`,
  );
  process.exit(1);
}

const databaseUrl = `file:./${nombreBase}`;

function caja(titulo, lineas = []) {
  const ancho = Math.max(titulo.length, ...lineas.map((l) => l.length), 62) + 4;
  const barra = "!".repeat(ancho);
  const centrar = (t) => {
    const restante = ancho - 2 - t.length;
    const izq = Math.floor(restante / 2);
    return `!${" ".repeat(izq)}${t}${" ".repeat(restante - izq)}!`;
  };
  console.log("\n" + barra);
  console.log(centrar(titulo));
  for (const l of lineas) console.log(centrar(l));
  console.log(barra + "\n");
}

function advertencias() {
  caja("ADVERTENCIAS OPERATIVAS DE LA LANE E2E", [
    "1) BASE FRESCA POR CADA CORRIDA: recrea la base descartable con `npm run e2e:fresh`",
    "   antes de cada lane. Nunca reutilices una base de una corrida anterior.",
    "2) NO CORRAS PRIMERO EL SPEC DE RATE-LIMIT: bloquea la IP 15 minutos.",
    "   (E2E_RATE_LIMIT=1 ... e2e/auth/rate-limit.spec.ts corre SOLO al final y aislado;",
    "   si corre primero aborta auth.setup y la lane entera queda inutilizable 15 min.)",
  ]);
}

function correr(cmd, args, extraEnv) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, {
    cwd: webDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });
  if (res.error) {
    console.error(`[e2e-fresh] No se pudo ejecutar ${cmd}: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`[e2e-fresh] Falló "${cmd} ${args.join(" ")}" (exit ${res.status}).`);
    process.exit(res.status ?? 1);
  }
}

advertencias();

// (a) Base descartable desde cero con el schema SQLite.
for (const sufijo of ["", "-wal", "-shm", "-journal"]) {
  const p = dbPath + sufijo;
  if (existsSync(p)) {
    rmSync(p);
    console.log(`[e2e-fresh] Eliminada base anterior: ${path.relative(webDir, p)}`);
  }
}
correr("npx", ["prisma", "migrate", "deploy", "--schema=prisma/schema.sqlite.prisma"], {
  DATABASE_URL: databaseUrl,
});

if (!existsSync(dbPath)) {
  console.error(`[e2e-fresh] migrate deploy terminó pero no creó ${path.relative(webDir, dbPath)}.`);
  process.exit(1);
}
console.log(
  `[e2e-fresh] Base creada: ${path.relative(webDir, dbPath)} (${statSync(dbPath).size} bytes) — ` +
    `DATABASE_URL=${databaseUrl}`,
);

// (a.2) Cliente Prisma del schema SQLite: si el último `prisma generate` fue el
// default (PostgreSQL, p. ej. tras correr el job unit-pg), el seed de abajo
// fallaría contra esta base descartable. Regenerar acá fija el client correcto.
correr("npx", ["prisma", "generate", "--schema=prisma/schema.sqlite.prisma"], {
  DATABASE_URL: databaseUrl,
});

// (b) Seed completo contra ESA base (process.env DATABASE_URL pisa al .env).
correr("npm", ["run", "e2e:reseed-base"], { DATABASE_URL: databaseUrl });

// Verificación ligera de siembra (mejor esfuerzo: si better-sqlite3 no está, se omite).
try {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbPath, { readonly: true });
  const contar = (tabla) => {
    try {
      return db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get().n;
    } catch {
      return "n/d";
    }
  };
  console.log(
    `[e2e-fresh] Verificación de siembra: usuarios=${contar("usuarios")} · ` +
      `membresias=${contar("membresias")} · Comunidad=${contar("Comunidad")} · ` +
      `unidades=${contar("unidades")} · personas=${contar("personas")}`,
  );
  db.close();
} catch {
  console.log("[e2e-fresh] better-sqlite3 no disponible: siembra verificada por la salida del seed.");
}

// (c) Las dos advertencias, de nuevo, en grande, antes del comando.
advertencias();

// (d) Comando Playwright exacto con paridad CI (job e2e de ci.yml).
console.log("Corré la lane desde k0mp4ss_fe/apps/web con este comando (paridad CI):");
console.log(
  [
    "CI=1",
    `DATABASE_URL=${databaseUrl}`,
    "AUTH_SECRET=ci-e2e-secret-no-produccion",
    "NEXT_PUBLIC_APP_ENV=development",
    "GOOGLE_CLIENT_ID=ci-dummy",
    "GOOGLE_CLIENT_SECRET=ci-dummy",
    "npx playwright test <specs> --reporter=list",
  ].join(" "),
);
console.log("  # <specs> = rutas a correr, p. ej. e2e/crud e2e/flujo e2e/smoke");
console.log("  # CI=1 usa webServer `npm run start`: exige `npm run build` previo.");
console.log("  # El spec de rate-limit SOLO al final y aislado:");
console.log(
  "  # CI=1 E2E_RATE_LIMIT=1 DATABASE_URL=... npx playwright test e2e/auth/rate-limit.spec.ts --reporter=list",
);
console.log("\n[e2e-fresh] Lista: base fresca + seed completo. Buena lane.");
