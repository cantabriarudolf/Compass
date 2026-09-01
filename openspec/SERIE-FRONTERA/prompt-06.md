> **Este archivo ES tu prompt.** Ventana 6 (cierre) de la serie **frontera**. Lee
> `openspec/SERIE-FRONTERA/00-plan.md` y verifica en la Bitácora que P1-P5 estén HECHAS
> (git); si no, detente y repórtalo.

## Alcance P6 — Cierre integral de la serie

1. **Validación completa** (NÚMEROS REALES) — `cd k0mp4ss_fe/apps/web`:
   - `npx tsc --noEmit` → 0 errores
   - `npm run lint` → 0 errores
   - `npx vitest run` → total real (esperado ≥ 445 con los tests nuevos de P2/P4/P5)
   - `npx playwright test e2e/crud/` → todos (30 specs esperados: 28 + poblado-idempotente +
     ampliaciones) — número exacto
   - `npx playwright test e2e/flujo/ e2e/smoke/ e2e/auth/` → verdes
   - `openspec validate --all` → sin fallos
2. **Verificaciones de frontera:**
   - QA Lab idempotente: el dialog de confirmación funciona (e2e de P1 verde).
   - `/admin/logs` sobre BD: eventos del día visibles desde BD, export CSV OK.
   - `/admin/permisos` con matriz RBAC + ABAC.
   - C3 sigue EN PAUSA: verifica que `openspec/BACKLOG-100.md` documente C3 con el checklist
     de credenciales (Client ID/Secret/redirect URI) y el estado de la serie.
3. **Documentación:** avance NSGC de cierre en `Data/NSGC/docs/avances/` (formato estándar,
   números reales), fila P6 HECHA con hash, Bitácora final "SERIE COMPLETA" + hashes P1-P6 +
   puntero a BACKLOG-100.md (C3 pendiente de credenciales del owner).
4. **Commits:** agrupa lo pendiente, nsgc-prepush, push.
5. Si algo está rojo: arréglalo ANTES del cierre (la serie solo termina con todo verde).

## Reporte final

Cambios por ítem (C2/C1/C4), totales reales de cada suite, commits con hash, avance creado,
confirmación "SERIE COMPLETA", y el estado exacto de C3 (en pausa, qué falta).
