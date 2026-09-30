# Serie GATED-API-BD — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE en P2–P5),
> marcar su fila EN CURSO y actualizarla antes del push final. La Bitácora es
> el registro durable. La verdad es el repo, no los chats.

| Ventana | Alcance | Estado | Commit final |
| --- | --- | --- | --- |
| P1 | GATED FI/CT vía API: pagos + certificados independizados de QA-Lab (setup TEST vía POST + cleanup), sin cambios de app | HECHA | 61b4daf |
| P2 | API PI + migración portal: routes publicaciones/leads + hooks SWR + page a BD + spec independizado | HECHA | f4d40d7 |
| P3 | API PL + migración remuneraciones: routes liquidaciones/adelantos + hooks SWR + page a BD + spec independizado | HECHA | — |
| P4 | QA-Lab coherente + lane GATED verde: poblar vía API donde exista, higiene, GATED 10/10 | HECHA | — |
| P5 | Cierre integral: full verde + checklist §4 owner + archivo 5+ changes + nsgc-prepush + push + VALIDACION-PERFILES COMPLETA | PARCIAL | — |

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
- [2026-09-29] P2 HECHA: API PI (`/api/publicaciones-portal` factory + 409 con
  leads, `/api/leads-portal` POST custom con notify+`PI_LEAD_CONTACT`, resto
  factory; authz lectura abierta / escritura admin / crear-lead abierto) +
  hooks SWR + page portal a BD (UX intacta) + spec patrón P3 sin QA-Lab.
  Investigación previa: portal estaba verde sin tocar (STORE+QA-Lab coherentes
  en este reseed); igual se migró (el acoplo store era el riesgo que P4 debe
  eliminar). Sin migración Prisma (1:1). GATED portal+vecinos verdes,
  unit 84/824, tsc 0, lint 0 errores, validate 39 pass / 7 sin-deltas
  pre-existentes, 0 residuos. Change `pi-api-portal` abierto (archiva P5).
  Desvío motivado: leads API incluido (spec no lo exigía) para no romper "Me
  interesa". Sin push (serie en curso).
- [2026-09-29] P3 HECHA: API PL (`POST /api/liquidaciones` generar con
  cálculo server-side + folio LIQ-, `POST /api/liquidaciones/[id]/confirmar`
  con egreso FI sueldos espejo, GET/DELETE factory con guard borrador, sin PUT
  por snapshot inmutable; authz admin-only `puede(rol,accion,"pl")`) + hook
  `use-liquidaciones` + page a BD (UX intacta) + spec patrón P3 sin QA-Lab
  (trabajador TEST con ficha vía API personas + params CF vía API + cleanup).
  Causa raíz verificada: combo leía API (sin TEST) + ficha seed sin sueldoBase;
  fix solo-spec imposible. Sin migración Prisma (1:1). GATED remuneraciones +
  pagos + certificados verdes (1ª corrida remuneraciones flake por compilación
  fría Turbopack, verde al rerun), unit 85/834, tsc 0, lint 0 errores,
  validate 40 pass / 7 sin-deltas pre-existentes. Residuo honesto: 1
   liquidación confirmada TEST (periodo 2027-11, inmutable por diseño);
   persona+egreso TEST eliminados. Change `pl-api-remuneraciones` abierto
   (archiva P5). Alcance recortado por prompt: sin `/api/adelantos` (pestaña y
   preview siguen en store). Sin push (serie en curso).
- [2026-09-29] P4 HECHA: QA-Lab coherente — fase PI vía API (upsert pub
  `test-pub-pi-qa` con unidad del seed + lead `test-lead-pi-qa`, vitrina
  visible) y fase PL vía API (PUT CF + upsert trabajador `test-qa-pl-trab`
  RUT 77.777.777-7 + generar en periodo libre rotativo 2027–2031 + confirmar
  con egreso espejo en BD; sin descuento por adelanto —sin `/api/adelantos`—;
  espejo store transitorio para CT-4/certificados/huérfanos; adelanto
  `test-ade-1` legacy en store documentado) + "Borrar todo" purga BD vía API
  (lead→pub, notif PI, borradores, espejo, persona) + guard clean-first en
  ambos mundos (`tieneDatosTest(state, bd?)`) + manual 34 actualizado. Hallazgo
  debug: confirmar responde `{ ok, egresoId }` (no la liquidación) — la
  verificación relee la entidad. GATED 10/10 (2 corridas), poblado-idempotente
  8/8, poblamiento 9/9 (huérfanos 0), ciclo 9/9, unit 85/835, tsc 0, lint 0,
  validate 41 pass / 7 sin-deltas pre-existentes. Residuo honesto: confirmadas
  QA rotativas inmutables (las purga `e2e:higiene` en cada reseed) + 8 egresos
  "TEST Persona QA Uno" pre-existentes de series anteriores (higiene no toca
   egresos por regla punto-cero). Change `qa-lab-poblar-api` abierto (archiva
   P5). Sin push (serie en curso).
- [2026-09-29] P5 PARCIAL (inline, sin delegado: el harness rechazó 2
  lanzamientos por red/backend saturado; un intento previo marcó P5 EN CURSO y
  dejó 2 specs sin commitear). ARRANQUE: P4 cerrada OK (validate 41/7).
  Hallazgo con trace: el `clickPoblar` con re-clicks heredado abría el diálogo
  del guard a mitad del poblar (fondo inerte → clickBorrar final imposible);
  fix `315cd70` (un solo click efectivo + acción idempotente si hay diálogo) y
  `7121ff9` (apertura idempotente de selects Radix por data-state/aria-expanded
  para el flake de slots RA). Verificado: ciclo 9/9, residente-ficha 7/7.
  Integral: unit 85/835 (3 flake en 1ra corrida, verde al rerun), tsc 0, lint
  0 errores, no-GATED 88 pass/1 fail(residente flake, fixeado y verificado)/2
  skip, GATED 10/10, validate 41/7 sin-deltas. Sin checklist §4 del owner
  (dijo "aún no lo hago") → NO archiva, NO pushea (main ahead 17). Hereda:
  (1) checklist §4 Ricardo; (2) archivar 9 changes + nsgc-prepush + push;
  (3) marcar GATED-API-BD y VALIDACION-PERFILES COMPLETAS.
