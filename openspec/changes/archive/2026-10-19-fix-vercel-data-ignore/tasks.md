# Tasks: fix-vercel-data-ignore

- [x] Reproducir el matching: simular `.vercelignore` con `ignore@7.0.5` y
  confirmar que `Data/` excluye `k0mp4ss_fe/apps/web/data/**`
- [x] Identificar el patrón culpable exacto (línea 6: `Data/`)
- [x] Descartar otras trampas (dirs `test/`/`e2e/`/`scripts/` excluidos a
  propósito; ningún `.md` se importa como módulo; sin `.gitattributes`)
- [x] Aplicar el fix (`/Data/` + comentario de advertencia)
- [x] Re-simular: `data/` se conserva, `Data/`/tests/e2e siguen excluidos
- [x] Segundo bloqueante detrás del primero: `tsc` 5 errores
  `permiteCreacionManualCV` en `Persona` (`app/comunidad/visor/page.tsx` +
  `scripts/seed-db-from-mocks.ts`). La SERIE-UI-MIGRACION-BD P5 migró el visor
  a `usePersonas()` (tipo de `@/data/comunidad/personas`) pero esa interfaz no
  tenía el campo que sí tienen PersonaSchema, la whitelist de /api/personas,
  Prisma (`Boolean?`) y el store legacy. Fix: campo opcional en la interfaz —
  `tsc` 0 errores.
- [x] Tests afectados en verde (2026-10-06: `store-migracion-seed`, `store-fase-a`, `rut`,
  `store-validacion` → 61/61 pass)
- [x] Commit del fix (solo archivos del cambio) → `52b26b9`
- [x] F1 (SERIE-DEUDA-4, 2026-10-19): **segundo archivo con el mismo bug**.
  `k0mp4ss_fe/.vercelignore` (el del `Root Directory`, que existe y Vercel lee
  además del de la raíz) tenía `Data/` sin anclar en la línea 6 → mismo efecto:
  excluía `apps/web/data/**`. Fix: `Data/` → `/Data/` + el mismo bloque de
  comentario de advertencia que el de la raíz.
- [x] F1: evidencia del matching con `ignore@7.0.5` (`ignorecase: true`),
  archivo por archivo y base por base:
  - **antes** (`Data/`): `EXCLUIDO | k0mp4ss_fe/apps/web/data/comunidad/personas.ts`,
    `EXCLUIDO | apps/web/data/maestros.ts`
  - **después** (`/Data/`): `INCLUIDO | k0mp4ss_fe/apps/web/data/comunidad/personas.ts`,
    `INCLUIDO | apps/web/data/maestros.ts`
  - **sigue excluido**: `EXCLUIDO | Data/NSGC/backups/dev-2026-10-01.db`,
    `EXCLUIDO | Data/NSGC/docs/notas.txt`, `EXCLUIDO | openspec/BACKLOG-100.md`
- [x] F1: gates verdes — `tsc` 0 · `lint` 0 problemas · `npm test` 1304/1304 (128
  archivos) · `openspec validate --all` 39/39 · `check-delta-coverage` 0 que
  romperían el archive · `npm run build` de `apps/web` ✓ (91/91 páginas).
- [ ] Orquestador/Owner: push, redeploy en Vercel (el check del PR #3 pasa a
  verde) y archive de este change tras CI verde.
