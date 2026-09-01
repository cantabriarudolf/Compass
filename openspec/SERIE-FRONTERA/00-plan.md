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
| P1 | C2 | Guard QA Lab → confirmación "Limpiar y poblar de una vez" + e2e `crud/poblado-idempotente.spec.ts` | HECHA | — |
| P2 | C1.1 | change `am-auditoria-sync`: API `POST /api/auditoria/sync` + `GET /api/auditoria` + cliente sync debounce + tests API con Prisma real | pendiente | — |
| P3 | C1.2 | change `am-logs-bd`: `/admin/logs` lee BD (GET auditoría), export adaptado, e2e con BD | pendiente | — |
| P4 | C4.1 | change `rp-abac-contextual`: `puedeContextual()` + migración 4 checks inline sin cambio de comportamiento | pendiente | — |
| P5 | C4.2 | change `rp-abac-matriz`: sección "Permisos contextuales (ABAC)" read-only en `/admin/permisos` | pendiente | — |
| P6 | Cierre | Suite completa (Vitest + e2e) + avance NSGC + SERIE COMPLETA + BACKLOG-100 actualizado (C3 en pausa) | pendiente | — |

## Bitácora

- [2026-09-01] P1 HECHA: guard QA Lab idempotente via Dialog confirmación "Limpiar y poblar" (limpiar()+runFase todo) + e2e poblado-idempotente 2 tests (confirmar/cancelar) + fix ciclo.spec guard → dialog + fix STORE finanzas vencimiento día 1 (2 meses) para 425/425 (commit —)
