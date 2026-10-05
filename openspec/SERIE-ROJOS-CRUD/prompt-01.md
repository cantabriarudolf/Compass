> **Este archivo ES tu prompt.** Ventana P1 de la serie ROJOS-CRUD.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie ROJOS-CRUD)

Estado previo: E2E-SIN-GATED COMPLETA + GATED-API-BD/VALIDACION-PERFILES cerradas y pusheadas — STORE_VERSION 28, unit 85/835, tsc 0, lint 0 errores, e2e única 93+2 skip, validate 37/6 sin-deltas (de otras series).
Change `e2e-rojos-crud` (12/12 tasks, E2E-FULL-VERDE P2): 9 deltas con nombres cortos que no matchean mains; 8 MODIFIED sin requirement existente en mains (código shippeó, specs desactualizados); delta `GATED-qa-lab` muerto (el tag ya no existe).
Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.
Reglas permanentes: dato de dominio solo vía API REST con scope `comunidadId` (`withComunidadScope`); Terminología RG §4: "comunidad" (nunca "condominio"). Comandos con `workdir k0mp4ss_fe/apps/web`. Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en `openspec/SERIE-ROJOS-CRUD/00-plan.md`.

## Alcance P1 — Revisar 5 deltas vs código y remapear (SIN archivar)

Eres la primera ventana: marca tu fila EN CURSO en `00-plan.md`.

1. Partí de tree limpio (verificá `git status`). Para CADA uno de estos 5 deltas de `openspec/changes/e2e-rojos-crud/specs/`:
   - `TU-tipos-unidad` (carpeta exacta, main `TU-tipos-unidad`): requirement "Discriminador crear vs editar por modo, no por id"
   - `CF-configuracion` → main `CF-configuracion-global`: "Columna RUT de la comunidad con nombre canónico"
   - `RE-reporteria` → main `RE-reporteria-dashboards`: "Historial de reportes con fuente BD"
   - `MT-proyectos` → main `MT-mantenimiento-proyectos`: "Alta de trabajo con folio único y transiciones vía API"
   - `PE-personal` (ADDED) → main `PE-personal-servicios`: "Poda de nulls de BD antes de enviar (sinNulos)"
   a. Verificá contra el CÓDIGO actual que el comportamiento descripto existe y está vigente (grep + lectura acotada, no toda la app).
   b. Verificá por grep que el requirement NO esté ya en el main destino (evitar duplicados).
   c. Si (a) y (b) OK: mové la carpeta con `git mv` al nombre del main (`specs/<main-exacto>/`) y, SOLO si el header es MODIFIED y el requirement no existe en el main, convertí el header a `## ADDED Requirements` con una línea de razón (`<!-- P1 ROJOS-CRUD: era MODIFIED sin target; el spec nunca lo tuvo -->`).
   d. Si el comportamiento NO existe en el código: NO muevas nada; anotalo en la Bitácora como delta descartado con evidencia.
2. NO corras `openspec archive` (lo hace P2 con los 8 deltas listos). NO toques los otros 4 deltas (AD, FI, MP, GATED).
3. Valida: `openspec validate e2e-rojos-crud --type change` debe seguir válido + `npx tsc --noEmit` (solo si tocaste código; no deberías) + `openspec validate --all` (contrastá con 37/6).
4. Commit (conventional español), sin push. Actualiza fila P1 y Bitácora (qué deltas se remapearon, cuáles se descartaron y por qué).

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados (ninguno en P1). 4. Números finales: STORE_VERSION,
   specs x/y, unit x/y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes heredados a P2.
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
