---
name: pruebas
description: Puerta de entrada de QA del proyecto — presenta el abanico de pruebas (unit/e2e, suite/smoke/auth/flujo/CRUD por módulo, headless/headed en vivo/ui/reporte), corre lo elegido y reporta. Use when the user says "pruebas", "qa", "/qa", "correr pruebas", "probar módulo X", "ver pruebas en vivo", "navegador visible", "reporte de tests", "qué pruebas hay", "crud de un módulo".
---

# Skill: Pruebas — puerta de entrada de QA (abanico de combinaciones)

Todas las rutas relativas al repo: `k0mp4ss_fe/apps/web/` (usar `workdir` ahí).
Cuando el owner invoque esta skill, NO asumas qué quiere: ofrece el abanico, deja que
elige y corre. Tu rol es de recepcionista de QA + corredor + reportero.

## Protocolo de puerta de entrada (SIEMPRE al invocar)

1. **Presenta el abanico con el tool `question`** (una sola tanda, máx 3 preguntas):
   - **¿Qué probar?** `unit` (Vitest, rápido, sin navegador) · `e2e` (Chrome real) · `ambas`
   - **¿Alcance?** (si e2e o ambas) `suite completa` · `smoke (8 módulos renderizan)` ·
     `auth (login/guard)` · `flujo (journey poblamiento + CRUD personas)` ·
     `CRUD de un módulo` (menú con el mapa de abajo) · `CRUD general (todo el lane)`
   - **¿Cómo lo ves?** (si e2e) `headless (como CI)` · `--headed (Chrome VISIBLE en vivo)` ·
     `--ui (debugger paso a paso)` · `show-report (HTML del último run)`
   Si el owner ya dijo qué quiere ("prueba el módulo reservas en vivo"), salta esa pregunta.
2. **Ejecuta el comando** del mapa de abajo (workdir `k0mp4ss_fe/apps/web`).
3. **Reporta en 2-4 líneas**: passed/failed/skipped + duración. Ante fallo: archivo + test +
   causa raíz (leer `test-results/**/error-context.md` ANTES de diagnosticar) y proponer
   fix sin aplicarlo, salvo que sea obvio de una línea.

## Mapa de comandos validados

```bash
# UNIT (Vitest)
npx vitest run                                  # suite completa (413), rápido
npx vitest run test/store-finanzas.test.ts      # un archivo
npx vitest run --coverage                       # como CI (umbrales)

# E2E (Playwright) — workdir k0mp4ss_fe/apps/web
npx playwright test                             # headless (lo mismo que CI)
npx playwright test --headed                    # VER el navegador en vivo
npx playwright test e2e/smoke/modulos.spec.ts   # smoke de módulos
npx playwright test e2e/flujo/                  # journey poblamiento + CRUD personas
npx playwright test e2e/crud/reservas.spec.ts   # CRUD de un módulo
npx playwright test e2e/crud/                   # CRUD general (todo el lane)
npx playwright test --ui                        # debugger interactivo
npx playwright show-report                      # reporte HTML del último run
```

## Mapa módulo → spec CRUD (lane `e2e/crud/` — Serie CRUD-E2E)

> El lane se materializa con la serie `openspec/SERIE-CRUD-E2E/` (ver su `00-plan.md` para
> el estado). Si un spec aún no existe, ofrece el smoke del módulo como alternativa.

| Módulo | Spec | Qué simula |
|---|---|---|
| admin maestros | `crud/admin-maestros.spec.ts` | sub-tab → Nuevo Registro → Guardar |
| admin configuración | `crud/admin-configuracion.spec.ts` | guardar cambios + persistencia |
| reportería | `crud/admin-reporteria.spec.ts` | generar reporte → distribuir |
| personal | `crud/personal.spec.ts` | crear ficha integral con FKs |
| tipos de unidad | `crud/tipos.spec.ts` | Nuevo Tipo → Actualizar Tarifario |
| estructura física | `crud/estructura.spec.ts` | Nueva Unidad → Registrar Unidad |
| recursos/EPP | `crud/recursos.spec.ts` | Nuevo recurso → stock |
| mantenimiento | `crud/proyectos.spec.ts` | Nuevo trabajo → Iniciar |
| reservas | `crud/reservas.spec.ts` | elemento + reserva (anti-overbooking) |
| solicitudes | `crud/solicitudes.spec.ts` | ticket → En Revisión auto |
| bitácora | `crud/bitacora.spec.ts` | visita → Marcar Ingresada |
| proveedores | `crud/proveedores.spec.ts` | Nuevo proveedor |
| gastos comunes | `crud/gastos-comunes.spec.ts` | fondo + egreso con folio FE |
| multas | `crud/multas.spec.ts` | registrar infracción |
| pagos | `crud/pagos.spec.ts` (gated: poblar) | procesar pago de cobro |
| comunicación | `crud/comunicacion.spec.ts` | nueva plantilla |
| directiva | `crud/directiva.spec.ts` | nueva acta borrador |
| visor | `crud/visor.spec.ts` | aviso → publicar → visor público |
| gestión | `crud/gestion.spec.ts` | switches privacidad + firma |
| certificados | `crud/certificados.spec.ts` (gated: poblar) | generar PDF firmado |
| remuneraciones | `crud/remuneraciones.spec.ts` (gated: poblar) | liquidación → confirmar |
| portal | `crud/portal.spec.ts` (gated: poblar) | publicación en vitrina |
| personas | `e2e/flujo/personas.spec.ts` (existente) | Nueva Identidad → grilla |

Fixture gated: `/admin/qa-lab` → "Poblar todo de una vez" → esperar `🟢 Listo` (los datos
TEST core se crean aunque hoy el mensaje diga "Carga con 27 errores"; tras la Serie QA-LAB
dirá "Carga completa OK").

## Mapa de la suite

- `test/` — 38 archivos / 413 tests Vitest (stores, auth, seguridad, migraciones). Lane de
  unidad/integración con mocks.
- `e2e/` — `auth.setup.ts` (login real → storageState compartido), `auth/ingresar.spec.ts`
  (3 flujos), `auth/rate-limit.spec.ts` (GATED), `smoke/modulos.spec.ts` (8 módulos, 0
  pageerror), `flujo/` (journey Historia de Poblamiento via QA Lab + CRUD personas),
  `crud/` (Serie CRUD-E2E: 16 módulos).
- CI (`.github/workflows/ci.yml`): jobs `unit`, `e2e`, `e2e-rate-limit` (aislado). Node 24.
- Contexto de decisiones: `Data/NSGC/docs/avances/avance - 2026-08-28 12-52.md` (por qué
  Playwright) y `avance - 2026-08-29 11-10.md` (lane flujo + quirúrgicos E2E).

## Advertencias obligatorias

1. **NUNCA correr `e2e/auth/rate-limit.spec.ts` local sin permiso explícito**: bloquea la IP
   15 minutos (rate limit persistente SG D-v). Solo con `E2E_RATE_LIMIT=1` y en CI aislado.
2. `--headed`, `--ui` y `show-report` quedan **vivos**: correrlos con timeout generoso y
   avisar cómo cerrarlos. Para `show-report`, lanzar en background (`nohup ... &`) y dar
   `http://localhost:9323` + cómo detenerlo.
3. Si hay un `next dev` propio del owner en :3000, Playwright lo reutiliza
   (`reuseExistingServer`) — no matarlo.
4. Video/screenshot de fallos: `test-results/`; el snapshot útil es
   `test-results/**/error-context.md`.
5. Quirúrgicos E2E del proyecto (dialogs fuera de viewport → `requestSubmit()`, alert()
   nativo en configuracion, botones pesados con `force/noWaitAfter`, strict mode scoping):
   ver `openspec/SERIE-CRUD-E2E/00-plan.md` §Quirúrgicos y el avance 2026-08-29 11-10.
