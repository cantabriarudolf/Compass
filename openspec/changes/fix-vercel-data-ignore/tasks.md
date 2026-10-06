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
- [ ] Owner: redeploy en Vercel y archivar este change tras CI verde
