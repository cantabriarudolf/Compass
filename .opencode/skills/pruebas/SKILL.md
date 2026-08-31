---
name: pruebas
description: Puerta de entrada de QA del proyecto — presenta el abanico de pruebas (unit/e2e, suite/smoke/auth/flujo/CRUD por módulo, headless/headed en vivo/ui/reporte), estima carga del sistema y tiempos CLI vs Chrome antes de correr, corre lo elegido, registra el resultado en el dashboard /admin/qa-dashboard y reporta. Use when the user says "pruebas", "qa", "/qa", "correr pruebas", "probar módulo X", "ver pruebas en vivo", "navegador visible", "reporte de tests", "qué pruebas hay", "crud de un módulo", "estado de las pruebas", "cuánto demora una prueba".
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
2. **Preflight de sistema + estimado (SIEMPRE antes de ejecutar, ver §Estimados)**:
   mide la carga (`uptime` + `free -h` + `nproc`), calcula factor y muestra al owner el
   estimado CLI vs Chrome del alcance elegido. Si la máquina está ahogada (swap >90%,
   RAM <700 MB libres o factor >2), adviértelo en 1 línea y pregunta si correr igual.
3. **Ejecuta el comando** del mapa de abajo (workdir `k0mp4ss_fe/apps/web`).
4. **Reporta en 2-4 líneas**: passed/failed/skipped + duración + estimado vs real. Ante
   fallo: archivo + test + causa raíz (leer `test-results/**/error-context.md` ANTES de
   diagnosticar) y proponer fix sin aplicarlo, salvo que sea obvio de una línea.
5. **Registra la corrida en el dashboard (SIEMPRE al terminar, pase lo que pase)**:
   agrega la corrida a `k0mp4ss_fe/apps/web/qa-estado.json` (schema en
   `lib/qa-estado.ts`, máx 10 runs, agotar el más viejo) y recalibra el baseline del
   alcance en §Estimados con la duración real (máquina sana, factor ≤1.2). Cierra el
   reporte apuntando al dashboard: Desarrollo AI → "Estado de Pruebas QA"
   (`/admin/qa-dashboard`, API `/api/qa-estado`, visible solo en development).

## Estimados CLI vs Chrome + carga del sistema

**Medir carga al momento de ejecutar** (preflight y para registrar en el JSON):

```bash
uptime && free -h && nproc   # load avg 1/5/15, RAM/swap libre, cores
```

- `factorCarga = max(1, load₁ / cores)` (redondeado a 1 decimal). El dashboard
  (`/admin/qa-dashboard`) muestra este factor en vivo y escala los estimados solos.
- **Máquina ahogada** = swap >90% llena, o RAM <700 MB libres, o factor >2. Hoy esto
  causó: `browserType.launch` timeout 180s, GPU process `exit_code=9` y `page.goto`
  que nunca dispara `load` aunque curl responda 200 en ~1s (swap thrashing). Con esa
  señal: avisar y (si el owner acepta) pedirle liberar recursos antes de correr.

**Baselines (máquina sana, recalibrar con cada corrida real)** — CLI = Vitest,
Chrome = Playwright:

| Prueba | Motor | Base |
|---|---|---|
| suite completa (413 tests) | CLI | 3.5 min (medido 208s, cierre Serie CRUD-E2E) |
| un archivo | CLI | ~12 s |
| smoke (8 módulos) | Chrome | 2.5 min |
| auth (login/guard) | Chrome | 1.5 min |
| flujo (journey + personas) | Chrome | 3.6 min (medido) |
| CRUD general (lane, 22 specs) | Chrome | 12 min (medido 11.8m) |
| suite completa | Chrome | 16 min (medido 15.8m, 38 passed) |
| show-report | Chrome | instantáneo |

**Estimado al owner** = `base × factorCarga` del alcance elegido, en 1-2 líneas
("Suite completa e2e: ~20 min base, ~29 min con la carga actual ×1.4"). Al terminar,
compara estimado vs real en el reporte y recalibra si factor ≤1.2.

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
| logs | `crud/logs.spec.ts` (read-oriented) | evento real vía módulo → buscar/filtrar/exportar CSV |
| permisos | `crud/permisos.spec.ts` (read-oriented) | matriz RBAC + membresías scoping A/B (selector propio) |
| personas | `e2e/flujo/personas.spec.ts` (existente) | Nueva Identidad → grilla |

Fixture gated: `/admin/qa-lab` → "Poblar todo de una vez" → esperar `🟢 Listo` (desde la
Serie QA-LAB la carga completa es "Carga completa OK" con 27→0 errores y 22/22 fases OK;
el guard "Existen datos TEST-*" bloquea una 2ª corrida sin limpiar antes).

## Mapa de la suite

- `test/` — 38 archivos / 413 tests Vitest (stores, auth, seguridad, migraciones). Lane de
  unidad/integración con mocks.
- `e2e/` — `auth.setup.ts` (login real → storageState compartido), `auth/ingresar.spec.ts`
  (3 flujos), `auth/rate-limit.spec.ts` (GATED), `smoke/modulos.spec.ts` (8 módulos, 0
  pageerror), `flujo/` (journey Historia de Poblamiento via QA Lab + CRUD personas +
  `ciclo.spec.ts`: ciclo limpiar→poblar→validar→limpiar y guard de 2ª corrida),
  `crud/` (Serie CRUD-E2E: 22 specs + logs/permisos read-oriented, SERIE COMPLETA).
- CI (`.github/workflows/ci.yml`): jobs `unit`, `e2e`, `e2e-rate-limit` (aislado). Node 24.
- Dashboard de estado: `/admin/qa-dashboard` (Desarrollo AI → "Estado de Pruebas QA").
  Lee `apps/web/qa-estado.json` vía `/api/qa-estado` (`lib/qa-estado.ts`). Muestra última
  corrida (passed/failed/skipped, duración, estimado vs real, fallos con causa), carga del
  sistema en vivo con factor y alerta de máquina ahogada, tabla estimados CLI vs Chrome y
  historial (últimas 10). Solo en development (`env-guard`).
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
6. Servidores y rutas: un `next dev` **muy viejo** puede no registrar rutas nuevas de
   turbopack (404 limpio) — reinícialo con acuerdo del owner. Si turbopack panic
   (`inner_of_upper_lost_followers`) al arrancar: `rm -rf .next` y volver a subir. El
   Laboratorio QA se oculta cuando el gate da "production" (`getAppEnv()` en
   `app/admin/qa-lab/page.tsx`) — en CI el job e2e define `NEXT_PUBLIC_APP_ENV=development`.
