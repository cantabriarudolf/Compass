> **Este archivo ES tu prompt.** Ventana 1 de la serie **menu-100**.

## Contexto común (válido para TODA la serie)

- Proyecto Compass. Front: `k0mp4ss_fe/apps/web`. Suite: Vitest 425/425, e2e 44 tests, CI 3/3 verde.
- Lee SIEMPRE `openspec/SERIE-MENU-100/00-plan.md` (base de hechos, quirúrgicos, roadmap, bitácora).
- Método por ventana: openspec-propose → implementar → validar (tsc 0, lint 0 errores, Vitest
  completo con número REAL, e2e de la ventana, `openspec validate --all`) → commit conventional
  en español → skill nsgc-prepush → push → `openspec archive <change> --yes` → fila HECHA en
  00-plan.md (Roadmap + Bitácora con hash).
- Confía en el CÓDIGO sobre el plan si un label difiere; anota desviaciones en la Bitácora.
- Si el contexto se agota: cierra la tarea en curso, commitea y deja el estado exacto en 00-plan.md.
- Reporta al final: cambios, verificaciones con NÚMEROS REALES, commits con hash, pendientes.

## Arranque (Ventana 1: lectura inicial)

1. Lee `openspec/SERIE-MENU-100/00-plan.md` completo y `openspec/BACKLOG-100.md` (contexto
   de la frontera C1-C4 — no la toques, solo entiende que existe).
2. Verifica repo: `git status` limpio y pusheado (`git log --oneline -5`), Vitest 425/425.
3. Marca tu fila P1 como EN CURSO en 00-plan.md.

## Alcance P1 — Dashboard OpenSpec: 6 "documentado" → "completado"

Los módulos UI (Navegacion Lateral), MA, CF, AM, AU y SG aparecen "documentado" porque
`deriveStatus` en `lib/dev-dashboard.ts` no encuentra su change archivado por keyword (sus
specs fueron actualizados por archives de OTROS changes o el nombre del change no matchea el
nombre del módulo). El mecanismo de overrides ya existe: `ARCHIVED_OVERRIDES` (ej. GE→AD).

1. Identifica para cada uno de los 6 su change archivado real en
   `openspec/changes/archive/` (ej. AU → `2026-08-27-au-autorizacion-roles` y el trabajo
   authz/au-authjs; AM → `2026-08-26-RE-reporteria-dashboards`? NO — investiga con
   `ls openspec/changes/archive/ | grep -i <code>` y el historial git de cada spec).
2. Añade las entradas mínimas en `ARCHIVED_OVERRIDES` (o keywords si es más correcto) con
   comentario de por qué. NO fuerces falsos completados: si un módulo de verdad tiene work
   pendiente (verifica el spec y el código), déjalo documentado y anótalo en la Bitácora.
3. Verifica con datos reales: `node --experimental-strip-types -e "const { getDashboardData }
   = await import('./lib/dev-dashboard.ts'); const d = getDashboardData();
   console.log(JSON.stringify(d.stats)); console.log(d.modules.filter(m=>m.status!=='completado').map(m=>m.code).join(','))"`
   → objetivo: 31 completado (o los reales) y 0 pendiente, sin falsos.
4. El Dashboard OpenSpec (`/admin/dev-dashboard`) lee esta lib — verifica en el navegador
   con un smoke rápido (`e2e/smoke` cubre /admin) y que la página renderiza sin errores.

## Verificación

`npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run` (425/425 REAL) ·
`openspec validate --all` · smoke de /admin/dev-dashboard (la serie no agrega spec e2e aquí:
es fix de mapeo interno verificado por datos). Sin change openspec (fix de mapeo, documéntalo
en la Bitácora como las series anteriores).
