# Proposal: e2e-rojos-flujo-a11y-smoke (SERIE-E2E-FULL-VERDE P3)

## Problema
Tras P2 (lane `e2e/crud` no-GATED verde sobre reseed limpio), quedan 6 rojos
P3 (full run scope A 2026-09-27): `e2e/flujo/poblamiento` ×2 (persona semilla
del relato en MP, depto 999 en EF), `e2e/flujo/personas` (crear persona desde
directorio), `e2e/a11y/axe` ×2 (reservas, bitácora), `e2e/smoke/modulos-mobile`
(bitácora 390×844). Causa estructural conocida (P2/GATED): el QA-Lab "Poblar
todo de una vez" escribe al store legacy mientras las páginas migradas leen BD
vía API — el relato de poblamiento asume estado que el seed/QA-Lab cambian.

## Propuesta
1. Triage por spec (estado-dependencia vs bug real, verificar no asumir).
2. Poblamiento ×2: independizar el spec (datos propios TEST-* vía API BD +
   cleanup) en vez de depender del QA-Lab/store; el test 1 (coherencia sin
   huérfanos, autocontenido en QA-Lab) se conserva.
3. Flujo/personas: hacer determinista (email único por corrida + cleanup) si el
   triage muestra colisión de reejecución.
4. A11y ×2 + smoke-mobile: re-chequear tras null-guards P3 de
   VALIDACION-PERFILES; solo fix mínimo de a11y si hay violaciones
   críticas/serias reales.
5. Criterio de salida: lanes `e2e/flujo` + `e2e/a11y` + `e2e/smoke` en verde
   sobre reseed limpio (una corrida por lane) + tsc/lint/validate OK.

## No-objetivos
- Retrabajar CRUD (P2) ni GATED (P4/owner: QA-Lab legacy vs BD).
- Migración SQLite→PostgreSQL, super-admin global, resto de BACKLOG-100.
- Cambios al store (`STORE_VERSION` queda en 28).
