> **Este archivo ES tu prompt.** Ventana P2 de la serie ROJOS-CRUD (cierre).
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie ROJOS-CRUD)

Estado previo: E2E-SIN-GATED COMPLETA + GATED-API-BD/VALIDACION-PERFILES cerradas y pusheadas — STORE_VERSION 28, unit 85/835, tsc 0, lint 0 errores, e2e única 93+2 skip, validate 37/6 sin-deltas (de otras series).
Change `e2e-rojos-crud` (12/12 tasks, E2E-FULL-VERDE P2): 9 deltas con nombres cortos que no matchean mains; 8 MODIFIED sin requirement existente en mains (código shippeó, specs desactualizados); delta `GATED-qa-lab` muerto (el tag ya no existe).
Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.
Reglas permanentes: dato de dominio solo vía API REST con scope `comunidadId` (`withComunidadScope`); Terminología RG §4: "comunidad" (nunca "condominio"). Comandos con `workdir k0mp4ss_fe/apps/web`. Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en `openspec/SERIE-ROJOS-CRUD/00-plan.md`.

## Arranque: verificación de P1 (antes de tu alcance)

1. `git status` (tree limpio) y `git log --oneline -8`.
2. `openspec validate --all` → contrastá con el número que P1 declaró.
3. Lee `00-plan.md`: fila P1 HECHA → marcá tu fila EN CURSO y continúa.
   HECHA pero algo falla → ARREGLA primero, anótalo en la Bitácora, y solo después empieza tu alcance.
   PARCIAL → completa ESE alcance antes del tuyo. Nunca marques EN CURSO si P1 no está cerrada.

## Alcance P2 — 3 deltas + delta muerto + archive + commit

1. Partí de tree limpio. Igual que P1 (verificar vs código + grep anti-duplicado + `git mv` + conversión MODIFIED→ADDED documentada si corresponde) para:
   - `AD-gestion` → main `AD-gestion-administrativa`: "Switch de privacidad con reflejo inmediato"
   - `FI-espejo` → main `FI-finanzas-morosidad`: "Scope canónico único (última membresía) en resolvers legacy"
   - `MP-personas` → main `MP-maestro-personas`: "Validación de referencias tolerante a null de BD"
2. Delta muerto `GATED-qa-lab` ("los 4 specs GATED quedan PARCIAL"): verificalo muerto (grep `GATED` en describes de e2e → 0 resultados) y ELIMINALO con `git rm -r` documentando la razón en el commit. Si encontrás algún GATED vivo, STOP: no lo elimines y reportalo.
3. Corre `openspec archive e2e-rojos-crud -y` (debe fusionar 8 deltas a mains y mover el change a `archive/2026-*-e2e-rojos-crud`). Si aborta, reportá el mensaje exacto como PARCIAL sin inventar merges manuales.
4. Valida: `openspec validate --all` (esperado: 36 passed / 6 failed — mismos 6 pre-existentes) + `npx tsc --noEmit` + lint de lo tocado. Si P1+P2 movieron carpetas pero el archive abortó, el change sigue válido y abierto: commitea igual el remapeo.
5. Commit (conventional español), sin push (el push lo decide el owner al cierre). Actualiza fila P2 y Bitácora con números y el destino del archive.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números finales: STORE_VERSION,
   specs x/y, unit x/y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes fuera de la serie (decisiones del owner).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
