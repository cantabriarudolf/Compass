# Tasks: deuda-menor — el último warning de lint y la robustez de 4 CLIs

Ventana **F2** de `openspec/SERIE-DEUDA-4/00-plan.md`. Rama `serie/deuda-1`.

## 1. El último warning de lint (`packages/ui`)

- [x] **Medición de apertura** (`cd k0mp4ss_fe/packages/ui && npx eslint .`): **1 problem (0
  errors, 1 warning)** — `react-hooks/set-state-in-effect` en `src/hooks/use-mobile.ts:14`
  (`setIsMobile(...)` dentro del cuerpo del `useEffect`).
- [x] Reescritura con `useSyncExternalStore` (sin `eslint-disable`): `subscribe` al media query
  `(max-width: 767px)` con cleanup, `getSnapshot()` = `window.innerWidth < 768` y
  `getServerSnapshot()` = `false` (el valor inicial histórico del hook). Ver `design.md` §1.
- [x] Test de fijación `apps/web/test/use-mobile.test.tsx` (5 casos, `vitest run` → **5/5 pass**):
  valor inicial mobile (`innerWidth 375` → `true`), valor inicial desktop (`1280` → `false`),
  reacción al `change` del `matchMedia` en ambos sentidos (`1280 → 500 → 1024`), cleanup (el
  listener se remueve al desmontar) y snapshot de servidor (`renderToString` con `innerWidth 375`
  → `desktop`, o sea `false`).
- [x] **Medición de cierre**: `cd k0mp4ss_fe/packages/ui && npx eslint .` → **0 problems** (exit 0) ·
  `cd k0mp4ss_fe/apps/web && npx eslint .` → **0 problems** (exit 0).

## 2. Robustez de los 4 CLIs (`apps/web/scripts/`)

- [x] **`restore-db.mjs`** (`JSON.parse` del manifest): el error nombra el manifest y el motivo, más
  chequeo de forma (`databaseUrlFile` + `counts`).
- [x] **`deploy-migrar-datos.mjs`** (`execSync` en `correr()`): `try/catch` propio que agrega qué
  paso del corte falló y deja pasar el output real de la herramienta (`stdio: "inherit"`) y su
  causa; el `catch` externo sigue reportando y saliendo con `exit 1`.
- [x] **`security-recheck.mjs`** y **`check-headers.mjs`**: `new URL(import.meta.url).pathname` →
  `fileURLToPath(import.meta.url)` + guarda de precondición (si la raíz resuelta no tiene
  `package.json`, aborta nombrando el directorio, `exit 1`).
- [x] **Happy path sin cambios** (corrido en la ventana):
  - `node scripts/security-recheck.mjs` → `5/5 OK`, **exit 0**
  - `node scripts/check-headers.mjs` → mismos headers estáticos, **exit 0**
  - `node scripts/deploy-migrar-datos.mjs --help` → ayuda, **exit 0**
  - `node scripts/restore-db.mjs` sin `--yes` → aborta pidiendo confirmación, **exit 1** (pre-existente)
- [x] **Evidencia de "falla claro" (comando + salida + exit code)**:

  **a) `restore-db.mjs`** — esqueleto temporal con `openspec/` + `Data/NSGC/backups/db-20260101T000000/`
  (nunca la carpeta real de backups):

  ```text
  $ node /tmp/f2-restore.XXXX/scripts/restore-db.mjs latest --yes      # manifest corrupto
  ANTES:   restore:db FALLO: Expected double-quoted property name in JSON at position 30 (line 1 column 31)   → exit 1
  DESPUES: restore:db FALLO: Manifest ilegible en Data/NSGC/backups/db-20260101T000000/manifest.json:
           Expected double-quoted property name in JSON at position 30 (line 1 column 31).
           Regenerá el backup con `npm run backup:db` antes de restaurar.                                      → exit 1

  $ node /tmp/f2-restore.XXXX/scripts/restore-db.mjs latest --yes      # manifest = {}
  DESPUES: restore:db FALLO: Manifest incompleto en Data/NSGC/backups/db-20260101T000000/manifest.json:
           falta "databaseUrlFile" y/o "counts". ¿El backup lo generó `npm run backup:db`?                     → exit 1
  ```

  **b) `deploy-migrar-datos.mjs`** — `DATABASE_URL` PG inalcanzable (5.7 s, sin tocar bases):

  ```text
  $ DATABASE_URL="postgresql://demo:demo@127.0.0.1:9/demo?sslmode=require" node scripts/deploy-migrar-datos.mjs
  Error: P1001: Can't reach database server at `127.0.0.1:9`          <- output real de prisma (stdio: inherit)
  ❌ Corte fallido: Falló el paso del corte: `npx prisma db push`
     Command failed: npx prisma db push
     Revisá el output de la herramienta de arriba. La BD SQLite local queda intacta
     (el script de datos hace backup antes de migrar).                                                    → exit 1
  ```

  **c) `security-recheck.mjs`** — copia del script en una ruta **con espacio** (`/tmp/f2 cli.<rand>/`),
  que es donde `new URL().pathname` rompía:

  ```text
  $ node "/tmp/f2 cli.XXXX/scripts/security-recheck.mjs"
  ANTES:   [1/5] … FAIL — falta MAX/413/content-length/byteLength   (+ 4 FAIL más, contra `/tmp/f2%20cli.XXXX`)
           --- Resumen estático: 0/5 OK, 5/5 FAIL ---                                        → exit 1 (5 FAILs engañosos)
  DESPUES: security-recheck ABORTADO: no encuentro package.json en /tmp/f2 cli.XXXX.
           Ejecutalo con workdir k0mp4ss_fe/apps/web.                                        → exit 1
  ```

  **d) `check-headers.mjs`** — misma copia en ruta con espacio:

  ```text
  $ node "/tmp/f2 cli.XXXX/scripts/check-headers.mjs"
  ANTES:   Error leyendo next.config.mjs: Cannot find module '/tmp/f2%20cli.XXXX/next.config.mjs' …
           Error leyendo proxy.ts: ENOENT: no such file or directory, open '/tmp/f2%20cli.XXXX/proxy.ts'
           === FIN check:headers — estáticos OK si todos OK arriba ===                       → exit 0 (falso verde)
  DESPUES: check:headers ABORTADO: no encuentro package.json en /tmp/f2 cli.XXXX.
           Ejecutalo con workdir k0mp4ss_fe/apps/web.                                        → exit 1
  ```

## 3. Change y documentación

- [x] Change openspec `deuda-menor` (proposal + design + tasks + `.openspec.yaml` con
  `skip_specs: true` justificado).
- [x] `openspec validate deuda-menor --strict` ✓ y `node openspec/scripts/check-delta-coverage.mjs
  deuda-menor` → sin nada que rompería el archive (sin `specs/`, por `skip_specs`).
- [x] Avance NSGC en `Data/NSGC/docs/avances/` con la tabla antes/después del warning y de los 4
  CLIs.

## 4. Gate de la ventana

- [x] `npx tsc --noEmit` (apps/web) → **0 errores**
- [x] `npm run lint` de la app → **0 problems** · `npx eslint .` de `packages/ui` → **0 problems**
- [x] `npm test` (apps/web) → **1309/1309 en 129 archivos** (1304 + los 5 del test del hook),
  pisos vigentes (global 93/84/92/93 · `lib/**` 98/93/98/98 · `app/api/**` 87/74/88/87) sin bajar
- [x] `openspec validate --all` sin fallos
- [x] `check-delta-coverage` ok

## Pendiente para el orquestador

- [ ] Push de `serie/deuda-1` (la ventana cierra **sin pushear**) y archive del change tras CI verde.
