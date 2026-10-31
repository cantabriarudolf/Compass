# Tasks: e2e-fin-gated

- [x] Reseed limpio + arranque P1 verificado (validate 42/7, fila P1 HECHA)
- [x] Quitar `(GATED)` de los 4 describes (pagos, certificados, portal, remuneraciones)
- [x] Eliminar scripts `e2e:nongated` / `e2e:gated` / `e2e:full-orden` (sin consumidores vivos)
- [x] CI job `e2e`: seed completo `e2e:reseed-base` + timeout 25→60 min (rate-limit y deploy intactos)
- [x] Verificar qué specs exigen mocks (unidades/fondos/maestros del seed → seed completo los provee)
- [x] Corrida única local `npx playwright test` de punta a punta en verde
  (1ª paralela 91+2 con 2 rojos con mecanismo de orden → independizados
  personas.spec y admin-maestros.spec; confirmatoria secuencial 93+2 skip, 0 failed)
- [x] Change `e2e-fin-gated` (proposal + tasks, sin deltas, queda abierto)
- [x] Validar: única + unit + tsc 0 + lint 0 + validate + 0 residuos TEST
- [x] Commit local sin push + fila P2 y Bitácora en `00-plan.md`
