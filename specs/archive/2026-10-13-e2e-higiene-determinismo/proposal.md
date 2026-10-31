# Proposal: e2e-higiene-determinismo (SERIE-E2E-FULL-VERDE P1)

## Problema
La corrida e2e full válida (scope A) da 70 pass / 23 fail / 2 skip sobre 95 tests.
Tres causas son de higiene-infra, no de producto, y bloquean P2/P3:

1. `scripts/seed-authz.mjs` hace upsert in place (`findFirst` + update de `rol`):
   NO reordena membresías, así que restore + seeds pierde scope A (el scope es la
   ÚLTIMA membresía por `createdAt desc, id desc` en `withComunidadScope`). Hoy se
   depende de una receta manual (borrar y recrear la membresía admin-a). El espejo
   `lib/seed-authz.ts` (usado por QA-Lab) ni siquiera trae el mismo orden (admin-a
   primera en vez de última) ni al arrendatario.
2. Los specs que crean registros usan `TEST-*` de forma ad hoc: sin convención
   escrita de nombrado + cleanup, los runs dejan duplicados/saldos/conteos que
   rompen corridas siguientes.
3. Los 4 specs GATED (`certificados`, `pagos`, `portal`, `remuneraciones`) usan QA-Lab
   "Poblar todo de una vez", que reemplaza el store del seed y contamina al resto
   de la corrida si van intercalados.

## Propuesta
1. Fix `scripts/seed-authz.mjs` (+ espejo `lib/seed-authz.ts`): tras asegurar
   existencia, reescribir `createdAt` en orden canónico con admin-a ÚLTIMA
   (timestamps escalonados, documentado en el seed). Verificación: restore del
   backup P3 + 2 seeds → scope admin = comunidad-a SIN pasos manuales.
2. Convención `TEST-*` + cleanup documentada como delta `DEV-qa-lab` en este
   change: nombre `TEST-<modulo>-<timestamp>`, limpiar lo creado en el propio spec;
   lo no-limpiable se lista como conocido.
3. Estrategia GATED: orden fijo (no-GATED primero, 4 GATED al final) + re-seed
   posterior documentado y funcionando (script npm + verificación de que el
   restore de nombre de `admin-configuracion` en `finally` sigue compatible).
4. Criterio de salida P1: receta reseed 100% reproducible + `e2e/auth` verde sobre
   ese estado + tsc/lint/`validate` del change OK.

## No-objetivos
- Ningún fix de producto de los rojos P2/P3 (17 CRUD + 6 flujo/a11y/smoke).
- Migración SQLite→PostgreSQL, super-admin global, resto de BACKLOG-100.
- Cambios al store (`STORE_VERSION` queda en 28).

> **Nota 2026-10-13 (saneamiento S4):** el punto 3 de la propuesta (estrategia GATED:
> orden fijo + re-seed) quedó obsoleto — SERIE-E2E-SIN-GATED (`b7e88a8`) eliminó el tag
> GATED y los scripts `e2e:nongated`/`e2e:gated`/`e2e:full-orden`; hoy la suite corre en
> corrida única con specs autónomos. El delta `DEV-qa-lab` se refrescó a ese diseño
> antes de archivar. Los puntos 1, 2 y 4 siguen vigentes y verificados.
