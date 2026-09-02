# BACKLOG-100 — Frontera "futuro" (decisión del owner 2026-08-31 · actualizado 2026-09-01 cierre SERIE-FRONTERA)

> Contexto durable para continuar en CUALQUIER chat futuro. El owner definió que el 100%
> del spec vigente se cierra con la `SERIE-MENU-100` (A+B, COMPLETA 6/6). La frontera
> C1-C4 se ejecuta en la **`SERIE-FRONTERA`** (C2 + C1 + C4; C3 EN PAUSA por credenciales
> Google). Estado vivo: ver `openspec/SERIE-FRONTERA/00-plan.md` §Roadmap/Bitácora.
> **SERIE-FRONTERA COMPLETA 6/6** — C1/C2/C4 HECHOS, C3 EN PAUSA pendiente de credenciales.

## Estado de ejecución (2026-09-01 — CIERRE)

| Ítem | Estado | Dónde |
|---|---|---|
| C2 Idempotencia poblado | ✅ HECHO — SERIE-FRONTERA P1 `0c9fb6a` — guard → confirmación "Limpiar y poblar de una vez" (`limpiar()`+`runFase todo`), e2e `poblado-idempotente` 2/2 | SERIE-FRONTERA P1 (00-plan.md + avance 2026-09-01 06-30) |
| C1 Retención logs 5 años | ✅ HECHO — SERIE-FRONTERA P2 `1882e98` + P3 `a9cd1b7` — sync batch debounce 2s → `POST /api/auditoria/sync` upsert idempotente + `GET /api/auditoria` paginado + `/admin/logs` lee BD con paginación server-side y export CSV | SERIE-FRONTERA P2-P3 (avances 2026-09-01 07-15/08-15) |
| C3 Google SSO | ⏸ **EN PAUSA** — requiere del owner (ver §C3 checklist) — provider en `lib/auth.ts` (runtime Node), solo usuarios activados, credentials fallback | Este archivo §C3 — pendiente |
| C4 ABAC contextual | ✅ HECHO — SERIE-FRONTERA P4 `913489b` + P5 `d336cd6` — `puedeContextual(rol,accion,recurso,ctx)` puro + `reglasContextuales()` snapshot + matriz contextual read-only en `/admin/permisos` (16 reglas, motor/check local) | SERIE-FRONTERA P4-P5 (avances 2026-09-01 09-30/10-30) |

## C1 — Retención de logs de auditoría (5 años) — ✅ HECHO P2-P3 (1882e98/a9cd1b7)

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

## C2 — Idempotencia del poblado QA Lab — ✅ HECHO P1 (0c9fb6a)

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

## C3 — Google SSO — ⏸ EN PAUSA (pendiente de credenciales del owner)

- **Spec:** `openspec/specs/AU-autenticacion-sesion/spec.md` §Autenticación Futura (Scenario
  Google SSO). El proyecto hoy: Auth.js credentials + JWT + rate limit persistente (Serie
  Plataforma P5/P4, ver `project.md`).
- **Estado hoy (2026-09-01 cierre):** SERIE-FRONTERA no ejecuta C3. Infraestructura Auth.js ya existe (adapter Prisma propio) — añadir provider Google es natural, PERO bloqueado hasta que el owner provea credenciales. SERIE COMPLETA 6/6 sin C3.
- **Checklist pendiente del owner (obligatorio para desbloquear `au-google-sso`):**
  - [ ] `GOOGLE_CLIENT_ID` — Client ID de Google Cloud Console (OAuth 2.0 Client)
  - [ ] `GOOGLE_CLIENT_SECRET` — Client Secret correspondiente (secreto, no commitear)
  - [ ] `redirect URI` autorizada — `http://localhost:3000/api/auth/callback/google` (dev) + URL de producción (ej. `https://<dominio>/api/auth/callback/google`) registrada en Google Cloud → Authorized redirect URIs
  - [ ] Decisión owner: vinculación solo para usuarios ya activados (`RP/MP Activación de Cuentas`), credentials queda como fallback; rol/membresía por defecto al primer login Google y tratamiento del rate limit por email
- **Esfuerzo:** change grande. **Dependencias:** cuenta Google Cloud del owner + secretos (bloqueante).
- **Sugerencia:** change `au-google-sso` — provider opcional, solo para usuarios ya activados (Activación de Cuentas RP/MP), manteniendo credentials como fallback. Al desbloquear, crear change openspec `au-google-sso` con `lib/auth.ts` (runtime Node) + env + tests.
- **Serie:** SERIE-FRONTERA P6 cierra con C3 documentado EN PAUSA en `openspec/SERIE-FRONTERA/00-plan.md` Bitácora "SERIE COMPLETA" + este §C3.

## C4 — ABAC contextual completo — ✅ HECHO P4-P5 (913489b/d336cd6)

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

## Punto cero financiero (2026-09-02)

**HECHO** — la historia real 2023-2024 (INGvsEGR.xlsx) es la línea base del sistema: feature
"Ingreso manual a fondo" + `FondoFI.saldoInicial` (versátil: fiel al flujo o cuadrado) +
STORE_VERSION 27 con migración idempotente (fondo "Cuenta Corriente", 182 egresos FE-0001..0182,
44 ingresos). **Pendiente**: sincronizar FI→Prisma (ST) para que el punto cero viva también en
BD — mismo patrón que el sync de auditoría (C1).

## Nota de proceso

- Cualquier chat puede retomar estos ítems: la fuente de verdad es este archivo + los specs
  citados. Al elegir uno, crear el change openspec correspondiente (no serie necesaria salvo
  C1/C4 que ameritan 2 ventanas).
- Orden sugerido si hay ganas: C2 (mejora QA diaria) → C1 (compliance AM) → C3 → C4.
- Estado al 2026-08-31: A+B se ejecutan en SERIE-MENU-100; C1-C4 sin empezar.
