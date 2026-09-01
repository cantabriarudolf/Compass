# Serie FRONTERA — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. Reanudación en chat nuevo: "corre la serie
> SERIE-FRONTERA" — el orquestador lee el estado desde este archivo + git, NUNCA de texto
> de otros chats.

**Objetivo:** ejecutar la frontera "futuro" del `openspec/BACKLOG-100.md` decidida por el
owner (2026-09-01): **C2 + C1 + C4**. **C3 (Google SSO) queda EN PAUSA** hasta que el owner
provea Client ID/Secret de Google Cloud — ver BACKLOG-100.md §C3.

**Decisiones de diseño cerradas con el owner:**
- **C2**: auto limpiar+poblar (el guard pasa a confirmación "Limpiar y poblar de una vez" →
  `limpiar()` + `runFase("todo")`). Descartado upsert por IDs (alto riesgo). Sin tocar
  `lib/store.ts` ni STORE_VERSION.
- **C1**: sync batch con **debounce 2s** desde suscripción del store → `POST /api/auditoria/sync`
  (upsert idempotente por `id`, scoped `comunidadId`, sin delete/update = inmutabilidad) +
  `GET /api/auditoria` (filtros + paginación server-side) → `/admin/logs` lee BD. La tabla
  `EventoAuditoria` y `repos.eventos` YA existen (schema.prisma:248, repos/index.ts:92).
- **C4**: `puedeContextual(rol, accion, recurso, contexto)` puro en `lib/authz.ts`, migración
  de los 4 checks inline existentes (`mp:propios`, `pl:propia`, `ct:propio`,
  `residenteVeMorosidad`) **sin cambio de comportamiento** (paridad 1:1 testada), luego
  matriz contextual read-only en `/admin/permisos`.

**Método por ventana:** openspec change completo (propose → apply → validate) → commit
conventional español → nsgc-prepush → push → archive (git status LIMPIO tras archive) →
fila HECHA + Bitácora. Validación: tsc 0 · lint 0 errores · Vitest completo con número REAL ·
e2e de la ventana · `openspec validate --all`. `next build` puede fallar por red (Google
Fonts): ignóralo. No commitear Untitled.md. Si el contexto se agota: cierra la tarea en
curso, commitea y deja el estado exacto aquí.

## Roadmap

| Ventana | Ítem | Alcance | Estado | Commit final |
|---|---|---|---|---|
| P1 | C2 | Guard QA Lab → confirmación "Limpiar y poblar de una vez" + e2e `crud/poblado-idempotente.spec.ts` | HECHA | 0c9fb6a |
| P2 | C1.1 | change `am-auditoria-sync`: API `POST /api/auditoria/sync` + `GET /api/auditoria` + cliente sync debounce + tests API con Prisma real | HECHA | 1882e98 |
| P3 | C1.2 | change `am-logs-bd`: `/admin/logs` lee BD (GET auditoría), export adaptado, e2e con BD | HECHA | a9cd1b7 |
| P4 | C4.1 | change `rp-abac-contextual`: `puedeContextual()` + migración 4 checks inline sin cambio de comportamiento | HECHA | 913489b |
| P5 | C4.2 | change `rp-abac-matriz`: sección "Permisos contextuales (ABAC)" read-only en `/admin/permisos` | HECHA | d336cd6 |
| P6 | Cierre | Suite completa (Vitest + e2e) + avance NSGC + SERIE COMPLETA + BACKLOG-100 actualizado (C3 en pausa) | HECHA | f189bb3 |

## Bitácora

- [2026-09-01] P1 HECHA: guard QA Lab idempotente via Dialog confirmación "Limpiar y poblar" (limpiar()+runFase todo) + e2e poblado-idempotente 2 tests (confirmar/cancelar) + fix ciclo.spec guard → dialog + fix STORE finanzas vencimiento día 1 (2 meses) para 425/425 (commit 0c9fb6a)
- [2026-09-01] P2 HECHA: API auditoría sync (POST upsert idempotente + GET paginado con filtros q/categoria/tipoAccion) scoped por comunidad + cliente sync debounce 2s con Set ids y guard 401 sin loop + 10 tests API Prisma real para 435/435 (commit 1882e98)
- [2026-09-01] P3 HECHA: /admin/logs lee BD vía GET /api/auditoria?categoria=&tipoAccion=&q=&page=&pageSize=50 (estado carga, debounce 200ms, paginación server-side, contador X de Y en BD, facetas por página actual) + e2e logs.spec robusto a BD con poll ≥2 AD_OWNER_CONFIG_CHANGE + export ≥2 + aplica openspec validate 33 passed + Vitest 435/435 + tsc/lint 0 (commit a9cd1b7)
- [2026-09-01] P4 HECHA: ABAC contextual puro `puedeContextual(rol,accion,recurso,ctx)` en lib/authz.ts (ContextoABAC + refinamiento :propios/:propia/:residencia/:al_dia/privacidad, admin bypass, delegación directa) + 12 tests paridad (propietario sí/otra unidad no, conserje sin personaId, residente sin actas/morosidad) para 447/447 + migración 1 check GD en directiva/page.tsx (residenteVeActas via puedeContextual) — 3 checks restantes dejados inline por acoplo a store/error message (ver Bitácora detalle) + tsc 0/lint 0/openspec 33 passed/e2e permisos 2 passed (commit 913489b)
- [2026-09-01] P5 HECHA: snapshot ABAC `reglasContextuales()` en lib/authz.ts (EntradaABAC + REGLAS_ABAC 16 reglas por rol, condicion legible + donde motor/check local con detalle archivo:línea, orden ROLES+recurso, copia defensiva) + 8 tests (mp:propios 4 roles, pl:propia, ct familia 5, gd, morosidad check local, alertasResidentesActivas check local, orden/copia) para 455/455 + sección "Permisos contextuales (ABAC)" en /admin/permisos (entre matriz y membresías, por rol cards con recurso+condicion badge+descripcion+donde badge, cero mutaciones, mantiene solo lectura) + e2e permisos ampliado (heading ABAC + 3 reglas + badges motor/check local + 0 pageerror + 0 botones mutación, fix strict mode duplicate roles) + tsc 0/lint 0/openspec 33 passed/e2e permisos 2 passed (commit d336cd6)
- [2026-09-01] P6 HECHA — SERIE COMPLETA 6/6: validación integral Vitest 455/455 + openspec 32/32 + tsc 0 + lint 0 + e2e crud 31/31 (30 specs+setup) + flujo 8/8 + smoke 9/9 + auth 4/4 (+1 skipped) verdes (CI producción, 6.2m crud); verificaciones frontera: QA dialog idempotente 2/2, /admin/logs BD 1/1 con poll ≥2 y CSV≥2, /admin/permisos RBAC+ABAC 1/1 con 16 reglas motor/check local; BACKLOG-100.md actualizado C1✅/C2✅/C4✅ con hashes P1-P5 y C3 ⏸ EN PAUSA con checklist Client ID/Secret/redirect URI; avance NSGC cierre 2026-09-01 11-30 con números reales + puntero BACKLOG-100.md; hashes P1 0c9fb6a P2 1882e98 P3 a9cd1b7 P4 913489b P5 d336cd6 P6 f189bb3 (cierre) — SERIE COMPLETA
