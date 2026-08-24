# Auditoría - 2026-08-24 - Testing

## 1. Alcance

Configuración inicial de **Vitest** en `k0mp4ss_fe/apps/web` (monorepo Turborepo + npm workspaces) y suite de tests unitarios de las reglas de negocio del store:

- `k0mp4ss_fe/apps/web/vitest.config.ts` — entorno jsdom, alias `@/`, coverage provider v8 sobre `lib/store.ts`.
- `k0mp4ss_fe/apps/web/package.json` — scripts `test` (`vitest run --coverage`) y `test:watch`.
- `k0mp4ss_fe/apps/web/test/setup.ts` — reset de `localStorage` entre tests.
- `k0mp4ss_fe/apps/web/test/helpers.ts` — reset del store singleton al estado semilla con hidratación simulada.
- Tests: `test/store-eliminaciones.test.ts`, `test/store-vinculos.test.ts`, `test/store-migracion-seed.test.ts`, `test/store-validacion.test.ts`.

Código bajo prueba: `lib/store.ts` (TU/EF/MP/VU/MA/CF), seed de `apps/web/data/**` y capa de validación `lib/schemas.ts`. **No** cubre componentes UI ni hooks (pendiente RTL).

## 2. Hallazgos

| ID | Severidad | Ubicación | Descripción | Estado |
|---|---|---|---|---|
| TST-001 | 🟡 Media | `k0mp4ss_fe/apps/web/lib/store.ts:356` | `saveVinculo` solo bloquea `estadoCuenta === "inactiva"`; personas con cuenta `"bloqueada"` (p-10, p-54 en seed) pueden vincularse a unidades sin restricción. | Abierto |
| TST-002 | 🟡 Media | `k0mp4ss_fe/apps/web/lib/store.ts:595-607` | Migración acumulativa desde versión ≤6 hacia v8: la rama `<8` reconstruye `unidades` con `mergeById(prev.unidades crudo, …)` y deshace la conversión `estado` → `estadoId` hecha por la rama `<3` (`migrarEstadoUnidades`). Las unidades legacy quedan con string `estado` y sin `estadoId`, rompiendo filtros y la validación de `removeMaestro("estadosOcupacion")`. Verificado empíricamente con persistido v0. | Abierto |
| TST-003 | 🟢 Baja | `k0mp4ss_fe/apps/web/lib/store.ts:469-479, 554-594` | Sin cobertura: `saveMaestro` (validación y upsert), ramas de migración v<7 (`<2`, `<3`, `<4`, `<5`, `<6`), autosolapamiento mismo rol (`saveVinculo`), evento `VU_NEW_TENANT` y `VU_DELETE` de tramos históricos. | Abierto |
| TST-004 | ℹ️ Info | `vitest.config.ts` (provider v8) | Artefacto de atribución: al correr la suite multi-archivo, el provider v8 sub-reporta líneas ejecutadas de la rama `<8` de `migrate` (verificadas cubiertas en corrida aislada y por aserciones directas vía `persist.getOptions().migrate()`). Afecta el % reportado, no la calidad real de la suite. | Observación |

## 3. Acciones aplicadas en esta sesión

1. Setup Vitest solo en `apps/web`: dependencias dev `vitest@^3.2.7`, `jsdom@^26.1.0`, `@vitest/coverage-v8@^3.2.7`; scripts `test` / `test:watch`; config con jsdom, alias `@/`, coverage restringido a `lib/store.ts`.
2. Reset de `localStorage` global entre tests (`test/setup.ts`) y helper `resetStore()` que restaura semilla + `hasHydrated: true` (las acciones del store se niegan sin hidratar).
3. **39 tests** priorizando reglas de negocio:
   - Eliminaciones bloqueadas por dependencias: tipo→unidades, macro→micro-sectores, micro→unidades, unidad→vínculos, persona→vínculos; y maestros en uso (estadosOcupacion, categoriasUnidad/Macro/Micro, estadosInmobiliarios, condicionesEspeciales) + caso feliz por cada bloqueo.
   - `saveVinculo`: guard de hidratación, persona inexistente, persona inactiva, vínculo activo duplicado (misma persona+unidad), solapamiento de arriendos por tramo cerrado insertado dentro de contrato vigente y por `cerrarAnterior: false`; éxito con cierre automático del titular saliente (`fechaFin = inicio - 1 día`) y eventos `VU_ASSIGN_RELEASED` + `VU_CHANGE_OWNER`; coexistencia legítima de ocupantes (sin exclusividad).
   - `removeVinculo`: eliminación de vínculo activo + evento de liberación.
   - Migración v8: función `migrate` probada directamente (mergeById de macro/micro/unidades previas con seed, merge de `categoriasMacro` por id, limpieza de claves legacy `estacionamientos` y `ubicacionesEstacionamiento`), rehidratación end-to-end de persistido v7 (`hasHydrated` true) y no-migración con versión vigente.
   - Seed: igualdad profunda del estado inicial contra `apps/web/data/**` (inventario, comunidad, maestros admin, configuración) y `STORE_VERSION === 8`.
   - Capa de validación Zod nueva: rechazo de email inválido (persona), metraje negativo (unidad), fecha mal formateada antes de reglas de negocio (vínculo), día de corte fuera de rango (configuración); aceptación de payloads conformes.

## 4. Pendientes

| Qué | Condición para abordarlo |
|---|---|
| Corregir TST-002 (reaplicar `migrarEstadoUnidades` tras `mergeById` en rama `<8`) y TST-001 (bloquear cuentas `"bloqueada"`) | Próxima sesión sobre datos persistentes; TST-002 antes de que usuarios reales migren stores ≤v6 |
| Tests de `saveMaestro`, autosolapamiento, `VU_NEW_TENANT`, `VU_DELETE` histórico y ramas migrate `<2.. <6` (TST-003) | Siguiente iteración de testing del store |
| Cobertura de componentes UI/hooks con React Testing Library + MSW (objetivo skill: ≥80% componentes, ≥85% hooks) | Al iniciar testing de UI; hoy no hay dependencias instaladas para RTL |
| Umbrales mínimos de cobertura en `vitest.config.ts` | Cuando la baseline se estabilice sobre el store actual (en evolución por otra sesión: `env-guard.ts`, `schemas.ts`) |

## 5. Verificación

Comandos ejecutados en `k0mp4ss_fe/apps/web`:

| Comando | Resultado |
|---|---|
| `npm run test` | ✅ 4 archivos, 39/39 tests pasan · cobertura `lib/store.ts`: 81.20% stmts/líneas · 74.05% branches · 82.14% funciones |
| `npm run lint` | ✅ 0 errores (60 warnings pre-existentes en código de app; ninguno de archivos de test/config) |
| `npm run typecheck` | ✅ `tsc --noEmit` sin errores |

Nota: los porcentajes de cobertura pueden variar levemente entre corridas por TST-004 (atribución v8 en multi-worker); la cifra oficial es la de la tabla.
