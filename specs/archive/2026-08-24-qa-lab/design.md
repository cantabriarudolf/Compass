## Context

`enhance-rg-st-seed-gears` deja Rank canónico `ST:9` y `34 Historia` como contrato. `k0mp4ss_fe/apps/web/lib/store.ts:57` ya tiene `save*` con validación parcial (`saveVinculo:278`, `remove*`) y `migrate v8:462` con `mergeById`, pero no `seedBulkLoad`. `k0mp4ss_fe/apps/web/app/admin/dev-dashboard/page.tsx:219` ya guarda backups en `Data/NSGC/backups` vía `POST /api/backup` y muestra diff `diffCompassData`. Sidebar `k0mp4ss_fe/apps/web/components/app-sidebar.tsx:125` tiene grupo `Desarrollo AI`.

## Goals / Non-Goals

**Goals:**
- Un click puebla `TEST-*` en Rank correcto y marca `🟢 OK` por módulo con `Detalle` y JSON en `Data/NSGC/backups`.
- Historia Viva refleja `34 Historia` capítulos iluminados por Rank.
- Solo visible en dev (`NODE_ENV !== production`) o `admin`.

**Non-Goals:**
- No implementar `FI/PE/IR` reales (solo deja patrón para futuros ranks 4..99).
- No bump `STORE_VERSION` (usa `TEST-` ids `k0mp4ss_fe/apps/web/lib/store.ts:115` `upsert` idempotente, `Limpiar TEST-*` hace borrado inverso `VU→EF→MP→TU→MA`).

## Decisions

- **Reusar `save*` existentes** en orden `Rank asc` dentro del lab, acumulando `SeedValidationReport {ok, errores[]}` sin nueva lib. Alternativa de mover lógica a `store.ts` se deja para `ST` delta opcional.
- **Dos tabs** `Carga Técnica` / `Historia Viva` para no mezclar contrato máquina y relato humano `Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md:1`.
- **IDs `TEST-`**: todos los seeds de lab usan prefijo `test-`/`TEST-` para que `Limpiar` filtre y no toque seed real `k0mp4ss_fe/apps/web/data/maestros.ts:6`.
- **Backups**: reutiliza `POST /api/backup` de `dev-dashboard:219` y `validateStoreBackup` `k0mp4ss_fe/apps/web/lib/store-backup.ts:1` para no duplicar API.

## Risks / Trade-offs

- **Rank futuro 4..99** aún sin UI (solo placeholder). Mitiga con diseño extensible (agregar fase sin refactorizar).
- **Validaciones `saveUnidad/savePersona` aún sin FK** `k0mp4ss_fe/apps/web/lib/store.ts:241` — el lab reportará éxito aunque FK dangling si no se añade validación en store; se mitiga añadiendo check local en lab y luego en `ST`.
