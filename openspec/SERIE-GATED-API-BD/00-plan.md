# Serie GATED-API-BD — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE en P2–P5),
> marcar su fila EN CURSO y actualizarla antes del push final. La Bitácora es
> el registro durable. La verdad es el repo, no los chats.

| Ventana | Alcance | Estado | Commit final |
| --- | --- | --- | --- |
| P1 | GATED FI/CT vía API: pagos + certificados independizados de QA-Lab (setup TEST vía POST + cleanup), sin cambios de app | HECHA | — |
| P2 | API PI + migración portal: routes publicaciones/leads + hooks SWR + page a BD + spec independizado | pendiente | — |
| P3 | API PL + migración remuneraciones: routes liquidaciones/adelantos + hooks SWR + page a BD + spec independizado | pendiente | — |
| P4 | QA-Lab coherente + lane GATED verde: poblar vía API donde exista, higiene, GATED 10/10 | pendiente | — |
| P5 | Cierre integral: full verde + checklist §4 owner + archivo 5+ changes + nsgc-prepush + push + VALIDACION-PERFILES COMPLETA | pendiente | — |

MÁXIMO: 5 ventanas. Post-serie (fuera): super-admin global, migración
SQLite→PostgreSQL, resto de BACKLOG-100.

## Base de hechos (leer antes de cada ventana)

- Estado heredado E2E-FULL-VERDE P4 PARCIAL (`18bdef4`, main ahead 9 sin push):
  STORE_VERSION 28 · vitest 83 archivos 817/817 · tsc 0 · lint 0 errores ·
  no-GATED 89 pass / 2 skip · GATED 6 pass / 4 fail
  (certificados, pagos, portal, remuneraciones).
- Diagnóstico P4 verificado con evidencia (verificar, no asumir): páginas FI/CT
  leen BD vía API REST (`useCobrosFI`, `useCertificadosCT`); portal lee
  `publicacionesPortal`/`leadsPortal` del store; remuneraciones lee
  `liquidacionesPL`/`adelantosPL` del store; QA-Lab "Poblar todo" escribe el
  store legacy. Por eso los 4 GATED ven vacío tras poblar.
- Schema Prisma YA trae `PublicacionPortal`, `LeadPortal`, `LiquidacionPL`,
  `AdelantoPL` (migración solo si hay desajuste de campos — verificar).
- Patrón a replicar (P3 E2E): specs con datos TEST propios vía API + cleanup,
  sin depender de QA-Lab. Convención TEST-*/cleanup + GATED (orden no-GATED→GATED,
  `e2e:full-orden`) siguen vigentes.
- Changes abiertos al inicio: `e2e-higiene-determinismo`, `e2e-rojos-crud`,
  `e2e-rojos-flujo-a11y-smoke`, `roles-specs-perfil`,
  `roles-validacion-comunidad-a` (este falla `validate` por diseño: sin deltas).
  P5 los archiva todos más los de esta serie.
- Reglas permanentes: dato de dominio solo vía API REST con scope `comunidadId`
  (`withComunidadScope`: última membresía, take:1, sin override); mocks de `data/`
  son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en
  localStorage ni código; cada cambio de esquema Prisma = migración + tests.
  Terminología RG §4: "comunidad" (nunca "condominio").
- Cuentas TEST (password universal `Test1234!`, 2FA off, comunidad `comunidad-a`):
  `admin/comite/conserjeria/residente/mantencion/arrendatario@test.cl`.
- Seed reproducible: `npm run e2e:reseed-base` (= `seed:authz` +
  `seed:mocks -- --comunidad-id=comunidad-a`) + `npm run e2e:higiene -- --apply`.
  Scope A verificado = membresía admin-a última por createdAt. Servidor dev
  `http://localhost:3000`. Comandos build/test con `workdir k0mp4ss_fe/apps/web`.
- `next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
- Track humano P0: checklist manual §4 de
  `openspec/changes/roles-validacion-comunidad-a/cuentas-funcionales.md`
  (7 cuentas, ~15 min). P5 lo requiere para cerrar.

## Bitácora

- [2026-09-29] Serie materializada por orquestador (5 ventanas, cap duro). Base:
  P4 E2E-FULL-VERDE PARCIAL (`18bdef4`): GATED estructural confirmado + checklist
  §4 en manos del owner. Estrategia: P1 sin app (FI/CT ya tienen API), P2/P3 con
  API+page (PI/PL store-only), P4 coherencia QA-Lab, P5 cierre de ambas series.
- [2026-09-29] P1 HECHA: pagos + certificados reescritos con dato TEST propio
  vía API + cleanup (sin QA-Lab; pagos sin fallback localStorage). GATED 3/4
  (pagos, certificados, portal verdes; remuneraciones rojo heredado a P3).
  tsc 0, lint 0 errores, validate 38 pass / 7 sin-deltas pre-existentes,
  spot-check no-GATED 2/2, 0 residuos test-p1 en BD. Change
  `e2e-gated-fi-ct-api` abierto (archiva P5). Sin push (serie en curso).
