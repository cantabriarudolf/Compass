# BACKLOG-100 — Frontera "futuro" (decisión del owner 2026-08-31 · actualizado 2026-09-01)

> Contexto durable para continuar en CUALQUIER chat futuro. El owner definió que el 100%
> del spec vigente se cierra con la `SERIE-MENU-100` (A+B, COMPLETA 6/6). La frontera
> C1-C4 se ejecuta en la **`SERIE-FRONTERA`** (C2 + C1 + C4; C3 EN PAUSA por credenciales
> Google). Estado vivo: ver `openspec/SERIE-FRONTERA/00-plan.md` §Roadmap/Bitácora.

## Estado de ejecución (2026-09-01)

| Ítem | Estado | Dónde |
|---|---|---|
| C2 Idempotencia poblado | 🔄 En ejecución (P1 SERIE-FRONTERA) — diseño cerrado: **auto limpiar+poblar** (guard → confirmación), descartado upsert por IDs | SERIE-FRONTERA P1 |
| C1 Retención logs 5 años | 🔄 En ejecución (P2-P3) — diseño cerrado: **sync batch debounce 2s** → `POST /api/auditoria/sync` upsert idempotente + `GET /api/auditoria` + `/admin/logs` lee BD. Base ya existente: tabla `EventoAuditoria` (schema.prisma:248) + `repos.eventos` (repos/index.ts:92) | SERIE-FRONTERA P2-P3 |
| C3 Google SSO | ⏸ **EN PAUSA** — requiere del owner: Client ID + Client Secret de Google Cloud Console, redirect URI autorizada (p. ej. `http://localhost:3000/api/auth/callback/google` y su equivalente de producción). Provider va en `lib/auth.ts` (runtime Node), vinculación solo para usuarios ya activados por email, credentials queda como fallback | Este archivo |
| C4 ABAC contextual | 🔄 En ejecución (P4-P5) — diseño cerrado: **`puedeContextual(rol, accion, recurso, contexto)`** behavior-preserving (migración 1:1 de checks inline: `mp:propios`, `pl:propia`, `ct:propio`, `residenteVeMorosidad`) + matriz contextual read-only en `/admin/permisos` | SERIE-FRONTERA P4-P5 |

## C1 — Retención de logs de auditoría (5 años)

- **Spec:** `openspec/specs/AM-auditoria-metricas/spec.md` §Logs de Auditoría (Scenario
  Retention: "MUST be retained for a minimum of 5 years") + `AM:80` inmutabilidad.
- **Estado hoy:** la vista `/admin/logs` (change `am-logs-visor`) lee `store.eventos`
  (localStorage) con tope `MAX_EVENTOS = 500`. La retención real requiere capa de datos ST.
- **Qué implica:** persistir eventos en Prisma/SQLite (modelo `EventoAuditoria`), API de
  ingesta o sync, y que `/admin/logs` consulte BD (server component o API) con la misma UX
  (filtros/export). Ponderar volumen (500 visibles vs histórico completo) y el coste de
  consultas. Toca `lib/store.ts` (fuente) o un writer paralelo en el repositorio ST.
- **Esfuerzo:** change grande (2-3 ventanas). **Dependencias:** ST (capa persistente).
- **Sugerencia:** change `am-retencion-logs`: tabla `EventoAuditoria` + writer en
  `registrarEvento` (o batch) + `/admin/logs` leyendo BD con paginación server-side.

## C2 — Idempotencia del poblado QA Lab

- **Spec/contexto:** Serie QA-LAB (`openspec/SERIE-QA-LAB/`, COMPLETA 3/3) dejó el guard
  clean-first ("Existen datos TEST-*: ejecuta primero «Borrar todo lo de prueba»"). La
  idempotencia = que "Poblar todo de una vez" sobre datos TEST existentes no bloquee ni
  duplique (upsert por IDs TEST).
- **Estado hoy:** segunda corrida BLOQUEADA por diseño. El fallback de `e2e/crud/pagos.spec.ts`
  existe porque CT paga los cobros TEST.
- **Qué implica:** semántica upsert en acciones del store (FI/PL/CV/CT), riesgo de romper
  las 425 pruebas unitarias y las 24 e2e que hoy asumen estado determinista. Requiere
  decisión de diseño: ¿re-poblar = upsert, o limpiar+poblar automático?
- **Esfuerzo:** medio-grande. **Dependencias:** ninguna externa, pero tocar `lib/store.ts`
  (STORE_VERSION bump probable).
- **Sugerencia:** change `qa-lab-poblado-idempotente` con spike primero (qué colecciones
  colisionan: FI cobros, PL liquidaciones, CV avisos, CT certificados).

## C3 — Google SSO

- **Spec:** `openspec/specs/AU-autenticacion-sesion/spec.md` §Autenticación Futura (Scenario
  Google SSO). El proyecto hoy: Auth.js credentials + JWT + rate limit persistente (Serie
  Plataforma P5/P4, ver `project.md`).
- **Estado hoy:** infraestructura Auth.js ya existe (adapter Prisma propio) — añadir provider
  Google es lo natural, PERO implica: credenciales OAuth (env/secretos), vincular
  `Usuario.email` ↔ cuenta Google, decisión de rol/membresía por defecto al primer login,
  y qué pasa con el rate limit por email.
- **Esfuerzo:** change grande. **Dependencias:** cuenta Google Cloud del owner + secretos.
- **Sugerencia:** change `au-google-sso` — provider opcional, solo para usuarios ya
  activados (Activación de Cuentas RP/MP), manteniendo credentials como fallback.

## C4 — ABAC contextual completo

- **Spec:** `openspec/specs/RP-roles-permisos/spec.md` §Permisos Contextuales (ABAC) +
  atributos ya presentes: `mp:propios`, `pl:propia`, `ct:propio`, `residenteVeMorosidad`
  (controles de privacidad `/admin/gestion`), `fi` filtrado por unidad.
- **Estado hoy:** parcial — `puede()` es RBAC puro; los filtros ABAC están hardcodeados en
  páginas/repos (propios/propia). Falta el modelo contextual formal (recurso + contexto →
  decisión) y su matriz visible.
- **Qué implica:** extender `lib/authz.ts` con `puedeContextual(rol, accion, recurso,
  contexto)` + migrar los checks inline existentes + visible en `/admin/permisos`. Toca el
  motor que hoy es puro y testeado (authz.test.ts 16 tests).
- **Esfuerzo:** grande. **Dependencias:** nada externo; riesgo alto de regresión en guardas.
- **Sugerencia:** change `rp-abac-contextual` en 2 fases: (1) modelo + migración de checks
  existentes sin cambio de comportamiento (tests verde), (2) vista en /admin/permisos.

## Nota de proceso

- Cualquier chat puede retomar estos ítems: la fuente de verdad es este archivo + los specs
  citados. Al elegir uno, crear el change openspec correspondiente (no serie necesaria salvo
  C1/C4 que ameritan 2 ventanas).
- Orden sugerido si hay ganas: C2 (mejora QA diaria) → C1 (compliance AM) → C3 → C4.
- Estado al 2026-08-31: A+B se ejecutan en SERIE-MENU-100; C1-C4 sin empezar.
