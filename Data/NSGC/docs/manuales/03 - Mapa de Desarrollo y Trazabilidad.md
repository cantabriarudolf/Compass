# 03 - Mapa de Desarrollo y Trazabilidad

Este documento vincula la arquitectura del menú con los archivos de especificación y el orden lógico de construcción. Úsalo para saber qué estamos construyendo, de dónde viene la información y qué falta. 
**Fuente de fases y estados:** `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts:64` (`PHASES`) + `deriveStatus` (detecta spec sucio post-archivo vía `isSpecDirtyAfterArchive`). Este archivo se regenera desde el dashboard.

> [!IMPORTANT]
> Este documento es actualizado por el Agente al finalizar cada hito de desarrollo para garantizar la trazabilidad del proyecto.

## 🚥 Leyenda de Estados
- 🟢 **Completado**: Archivado en `openspec/changes/archive/` sin suciedad (spec no modificado después).
- 🟡 **Documentado**: Spec en `openspec/specs/` existe (o archivado sucio — spec modificado tras archivar, requiere re-archivar).
- 🔵 **En Proceso**: Change activo en `openspec/changes/`.
- ⏳ **Pendiente**: Sin spec ni change.
- 🔴 **Bloqueado**: Falta información o dependencia previa.

## 🗺️ Trazabilidad: Documento -> Menú -> Ruta

| Orden | Fase | Módulo | Documento Fuente (Data/NSGC/docs/) | Etiqueta Menú | Ruta Kebab-case | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **00** | **0** | **RG** | `RG - Reglas Generales.md` | (Lógica Base) | N/A | 🟢 Completado (`enhance-rg-st-seed-gears` archivado `2026-08-24`) |
| **01** | **0** | **ST** | `ST - Capa de Datos Persistente.md` | (Capa de Datos) | `lib/store.ts` v18 | 🟢 Completado (`enhance-rg-st-seed-gears` archivado `2026-08-24`) |
| **02** | **0** | **UI** | `UI - Interfaz Principal.md`, `UI - Navegacion Lateral.md` | (Interfaz) | (transversal) | 🟡 Documentado |
| **03** | **0** | **RP** | `RP - Roles y Permisos.md` | Permisos | `/admin/permisos` | 🟡 Documentado |
| **04** | **1** | **MA** | `MA - Maestros Administrativos.md` | Maestros | `/admin/maestros` | 🟡 Documentado |
| **05** | **1** | **TU** | `TU - Tipos de Unidad.md` | Infraestructura | `/inventario/tipos` | 🟢 Completado (`TU-tipos-unidad` archivado `2026-08-24`) |
| **06** | **1** | **EF** | `EF - Estructura Física.md` | Estructura Física | `/inventario/estructura` | 🟢 Completado (`EF-estructura-fisica` archivado `2026-08-24`) |
| **07** | **1** | **ES** | `ES - Estacionamientos.md` | Estacionamientos | `/inventario/estacionamientos` (deprecado v8) | 🟢 Completado (`ES-estacionamientos` archivado como absorbido `u-E-*` en EF) |
| **08** | **2** | **MP** | `MP - Maestro de Personas.md` | Directorio Personas | `/comunidad/personas` | 🟡 Documentado (spec re-sincronizada `2026-08-24`) |
| **09** | **2** | **VU** | `VU - Vinculacion Unidades.md` | Pestaña Unidades | `/comunidad/personas/[id]` | 🟢 Completado (`VU-vinculacion-unidades` + `VU-historial-asignaciones-unidad`, archivados `2026-08-24`) |
| **10** | **2** | **CF** | `CF - Configuración Global.md` | Configuración | `/admin/configuracion` | 🟡 Documentado (D4 parametrización legal Chile en spec vía `prep-fundamentos-serie-2`) |
| **11** | **2** | **PI** | `PI - Portal Inmobiliario.md` | Portal Inmobiliario | `/comunidad/portal` | 🟢 Completado (`PI-portal-inmobiliario` archivado `2026-08-25`, Sesión 1 NSGC) |
| **12** | **3** | **FI** | `FI - Finanzas y Morosidad.md` | Gastos Comunes | `/finanzas/gastos-comunes` (+ Recaudación `/finanzas/pagos` + Espejo BD `/finanzas`) | 🟢 Completado (`FI-finanzas-morosidad` archivado `2026-08-25`, Sesión 5 NSGC; materializa `cargoFIReferencia` de IN/MT/RA y activa el gate de morosidad de RA. `fi-sync-bd` archivado `2026-09-03`: espejo Prisma/SQLite del punto cero con `POST /api/fi/sync` + panel "Espejo BD (ST)") |
| 13 | 3 | AD | `AD - Gestión Administrativa.md` | Resumen | `/admin/gestion` | 🟢 Completado (`AD-gestion-administrativa` archivado `2026-08-25`, Sesión 1 NSGC) |
| 14 | 3 | GD | `GD - Gestión de Directiva.md` | Directiva | `/comunidad/directiva` | 🟢 Completado (`GD-gestion-directiva` archivado `2026-08-25`, Sesión 1 NSGC) |
| 15 | 3 | CO | `CO - Comunicación Vecinos.md` | Comunicación | `/comunidad/comunicacion` | 🟢 Completado (`CO-comunicacion-vecinos` archivado `2026-08-25`, Sesión 2 NSGC) |
| 16 | 3 | CV | `CV - Visor de Mensajes.md` | Visor | `/comunidad/visor` (+ visor público `/visor-mensajes`) | 🟢 Completado (`CV-visor-mensajes` archivado `2026-08-25`, Sesión 4 NSGC; materializa `avisoCVReferencia` de GD) |
| 17 | 3 | GE | `GE - Gestión de Solicitudes.md` | Solicitudes | `/operaciones/solicitudes` | 🟢 Completado (`GE-gestion-solicitudes` archivado `2026-08-25`, Sesión 2 NSGC) |
| 18 | 3 | AM | `AM - Auditoría y Métricas.md` | Auditoría | `/admin/metricas` | 🟡 Documentado |
| 19 | 3 | RE | `RE - Reportería y Dashboards.md` | Reportería y Dashboards | `/admin/reporteria` | 🟢 Completado (`RE-reporteria-dashboards` archivado `2026-08-26`, Sesión 7 NSGC; Centro de Mando + segmentación EF×MP×tenencia, rank 99 sumidero) |
| **20** | **4** | **PE** | `PE - Personal y Servicios.md` | Personal / Bitácora | `/personas/personal` (+ Bitácora `/operaciones/bitacora` + Proveedores `/operaciones/proveedores`) | 🟢 Completado (`PE-personal-servicios` archivado `2026-08-25`, Sesión 6 NSGC; proyección de costos viaja a FI con `liquidacionPLReferencia` materializada por PL desde Sesión 7) |
| 21 | 4 | PL | `PL - Liquidaciones y Remuneraciones.md` | Remuneraciones | `/finanzas/remuneraciones` | 🟢 Completado (`PL-liquidaciones-remuneraciones` archivado `2026-08-26`, Sesión 7 NSGC; materializa `liquidacionPLReferencia` de PE y sincroniza egreso FI Sueldos) |
| 22 | 4 | RA | `RA - Reservas y Amenities.md` | Reservas y Amenities | `/operaciones/reservas` | 🟢 Completado (`RA-reservas-amenities` archivado `2026-08-25`, Sesión 4 NSGC) |
| 23 | 4 | IR | `IR - Inventario y Recursos.md` | Recursos y EPP | `/inventario/recursos` | 🟢 Completado (`IR-inventario-recursos` archivado `2026-08-25`, Sesión 3 NSGC) |
| 24 | 4 | IN | `IN - Infracciones y Multas.md` | Multas | `/finanzas/multas` | 🟢 Completado (`IN-infracciones-multas` archivado `2026-08-25`, Sesión 3 NSGC) |
| 25 | 4 | MT | `MT - Mantenimiento y Proyectos.md` | Mantenimiento | `/inventario/proyectos` | 🟢 Completado (`MT-mantenimiento-proyectos` archivado `2026-08-25`, Sesión 3 NSGC) |
| 26 | 4 | CT | `CT - Certificados.md` | Certificados | `/comunidad/certificados` | 🟢 Completado (`CT-certificados` archivado `2026-08-26`, Sesión 7 NSGC; firma embebida solo en el PDF con código de verificación VC) |
| **27** | **0** | **34 - Historia** | `34 - Historia de Poblamiento - Relato de Uso.md` | (Transversal) | (manual) | 🟢 Completado (`enhance-rg-st-seed-gears`) |
| **28** | **5** | **LAB** | `LAB - Mejoras Lab` (Fase 5) | Laboratorio QA | `/admin/qa-lab` | 🟢 Completado (`lab-fase-mejoras` archivado `2026-08-24`) |
| 29 | 5 | QA-Lab | `DEV-qa-lab` | Laboratorio QA | `/admin/qa-lab` | 🟢 Completado (`qa-lab` archivado `2026-08-24`; pasos 8–10 PI/AD/GD en Sesión 1; pasos CO/GE con limpieza inversa en Sesión 2) |
| 30 | 5 (Plat.) | AU | `AU - Autenticacion y Sesion.md` | Autenticación | `/ingresar` + `/api/auth/*` | 🟢 Completado (`au-authjs` archivado `2026-08-27`, P5 Auth.js JWT + D-v) |
| 31 | D (Plat.) | SG | `SG - Hardening y Despliegue.md` | Hardening | (transversal: `proxy.ts` + `next.config.mjs` + `scripts/backup-db.mjs`) | 🟢 Completado (`sg-predeploy-headers` archivado `2026-08-27`, P6 D-i/ii/iii CSP report-only + headers + 5/5; FASE2 P5 CSP enforcement + Sentry code-complete, P4 cifrado AES-256, P2-P3 auth (policy/JWT24h/2FA), P6 ARCO (ver manuales AU/SG + `openspec/SERIE-PRODUCCION-FASE2/00-plan.md`); P7 D-iv re-auditoría OWASP cero 🔴 + D-vi backups `backup:db`/`restore:db` con restore probado) |

> Cambios v8: `MA` movido Fase2→Fase1 y `RP` a Fase0 para alinear `PHASES` con dependencias (MA alimenta EF/TU, RP transversal). `ES` marcado deprecado (ver `ES - ...md` y `ST` v8). `PI` queda Fase2 (no Fase5) y `AM/RE` Fase3 (no Fase5) para unificar Dashboard ↔ Plan.
> Cambios Sesión 1 NSGC (`2026-08-25`): `PI`, `AD`, `GD` pasan a 🟢 Completado con convención 1 módulo = 1 change; `TU/EF/ES/VU/RG/ST/LAB/QA-Lab` regularizados según archivo limpio `2026-08-24`. Ruta AD corregida a `/admin/gestion` (panel real, no `/dashboard`).
> Cambios Sesión 2 NSGC (`2026-08-25`): `CO`, `GE` pasan a 🟢 Completado (store v14/v15); ST actualizado a v15.
> Cambios Sesión 3 NSGC (`2026-08-25`): `IR`, `IN`, `MT` pasan a 🟢 Completado con convención 1 módulo = 1 change (store v16/v17/v18); pasos qa-lab 10–12 con limpieza inversa extendida.
> Cambios Sesión 4 NSGC (`2026-08-25`): `RA`, `CV` pasan a 🟢 Completado (store v19/v20); CV materializa `avisoCVReferencia` de GD vía `publicarActaEnCV`; paso qa-lab 13 (RA+CV) con aviso desde el acta TEST de GD.

---

## 🛠️ Lógica de Dependencias (Para no "quedar en pana")

Para asegurar un desarrollo fluido, seguiremos estas reglas de oro:

1.  **Fase 1 (Inventario)** debe estar terminada antes de **Fase 2 (Personas)**, porque no podemos registrar a un dueño si no existe el departamento donde vive.
2.  **Fase 2 (Identidad)** debe estar terminada antes de **Fase 3 (Finanzas)**, porque no podemos cobrar gastos comunes si no sabemos quién es el dueño y qué porcentaje de copropiedad tiene.
3.  **Fase 3 (Operaciones)** debe estar terminada antes de **Fase 4 (Reportería/Avanzado)**, porque los reportes necesitan datos históricos de las operaciones para mostrar algo útil.

---

## 🗒️ Notas de Implementación
- El componente **AppSidebar.tsx** ya tiene configuradas todas estas rutas (ES como filtrado de EF `u-E-*` desde v8).
- Las carpetas en `apps/web/app/` deben crearse siguiendo exactamente la columna **Ruta Kebab-case**.
- Los estados `🟡 Documentado (sucio)` indican spec más nuevo que su archive — ejecutar `/cierra-modulo` para re-archivar o revertir.
> Cambios Sesión 6 NSGC (`2026-08-25`): `PE` pasa a 🟢 Completado (store v21→v22); cierra pendiente D3 (`asignacionFamiliar`) y añade maestros operativos `jornadas/couriers/contratistas`; paso qa-lab 15 (PE) con limpieza inversa; sidebar suma Proveedores y Servicios.
> Cambios Sesión 7 NSGC (`2026-08-26`, ventana 8): `PL`, `CT`, `RE` pasan a 🟢 Completado (store v22→v25, motor pdfmake); PL materializa `liquidacionPLReferencia` de PE y sincroniza egreso FI Sueldos; CT cierra la documentación oficial con firma embebida; RE suma el Centro de Mando bajo Sistema. **Serie NSGC de módulos COMPLETA** — queda fuera de serie AU B/C/D, SG y migración a BD.
> Cambios Sesión 8 NSGC (`2026-08-26`, ventana 9): QA integral de la serie sin features nuevas. Test de integración `store-integracion-nsgc.test.ts` (17 pruebas) espeja "Cargar Todo" completo (MA→RE) y las cadenas cross-módulo a–g; cobertura store.ts 93.16%→94.1%. Fixes con regresivo: qa-lab CT paga TODOS los cargos TEST antes del certificado Al Día, residencia CT usa vínculo propietario (arrendatario tiene fechaFin), y descuento FI de multa pasa a proporcional (10%) porque una multa % GC sin emisión previa cae al nominal $50. **Ventana 9 cierra la SERIE NSGC 1:1.**
> Cambios Sesión 9 Plataforma (`2026-08-27`, ventana P8, cierre): verificación integral de engranajes de la Serie Plataforma (automático, flujo de sesión en vivo login→`/admin`→API 200→logout→401, 403 por rol + aislamiento A/B, `migrate dev` desde cero, rate limit 10/15min en vivo, `check:headers`, re-chequeos 5/5, `backup:db`/`restore:db` 0 divergencias, store v26 con migración v25→v26). Fix puntual con test regresivo: `app/admin/page.tsx` redirige a `/admin/gestion` (GET `/admin` daba 404 con sesión válida; repara landing post-login y link "Sistema" del sidebar). project.md: AU sin "parcial", Remaining vacío, tabla cruzada 32/32. **SERIE PLATAFORMA P1–P8 COMPLETA.**
> Cambios Sesión 10 Testing (`2026-08-28`): lane E2E con navegador real (Playwright 1.62, `npm run test:e2e`) separada de Vitest. Login real contra `/ingresar` con storageState compartido (proyecto setup), smoke de 8 módulos con 0 `pageerror`, flujos auth (inválido/exitoso/redirect proxy) y rate-limit gateado con `E2E_RATE_LIMIT=1` (contamina contador IP SG D-v). Decisión fundamentada con skills `react-testing` + `e2e-testing` (instalada de `affaan-m/ecc`): Playwright sobre Cypress (CSP nonce de `proxy.ts` rompe inyección de Cypress) y TestSprite como backbone (sandbox cloud con datos NSGC; queda como auditoría IA opcional). 12 passed / 1 skipped; Vitest 413/413 intacto.
> Cambios Sesión 11 QA + Series de verificación (`2026-08-29`→`08-31`): Dashboard QA `/admin/qa-dashboard` (estado de corridas, estimados CLI vs Chrome, alerta de máquina ahogada) + skill `pruebas` v2.1 (preflight de sistema + registro en dashboard). **SERIE CRUD-E2E 6/6** (22 specs CRUD interactivos por módulo) · **SERIE QA-LAB 3/3** (lab 27→0 errores, "Carga completa OK", limpieza ownership-scoped, validar() 9 áreas, guard clean-first) · CI e2e verde con suite completa (setup e2e resiliente + gate del QA Lab por `APP_ENV`) · change `am-logs-visor` (vista `/admin/logs`) y `rp-permisos-visor` (vista `/admin/permisos` solo lectura) archivados. Vitest 435/435.
> Cambios Sesión 12 Menú 100% + Frontera (`2026-08-31`→`09-01`): **SERIE MENU-100 6/6** — `/personas/residentes` (MP filtrada), `/dashboard` Resumen gerencial, `/operaciones/accesos` y `/operaciones/paqueteria` (paneles extraídos de bitácora a `components/pe/`), menú sin placeholders y Dashboard OpenSpec 31/31 Completado (ARCHIVED_OVERRIDES). **SERIE FRONTERA 6/6** — C2 poblado idempotente (dialog "Limpiar y poblar"), C1 logs con retención en BD (`POST /api/auditoria/sync` upsert idempotente + `GET /api/auditoria` + `/admin/logs` sobre BD), C4 ABAC contextual (`puedeContextual()` paridad 1:1 + 16 reglas visibles en `/admin/permisos`). C3 Google SSO EN PAUSA (credenciales owner, ver `openspec/BACKLOG-100.md`). Vitest 455/455 · e2e 52 tests · CI verde.
> Cambios Sesión 13 Punto Cero + Espejo FI (`2026-09-02`→`09-03`): **SERIE PUNTO-CERO 3/3** — historia real 2023-2024 como línea base (ingreso manual a fondo + saldoInicial versátil + migración v27 con fondo CC 182 egresos/44 ingresos, saldo 0) · change `fi-sync-bd` — espejo Prisma/SQLite del punto cero (`POST /api/fi/sync` idempotente + panel "Espejo BD (ST)" en `/finanzas`, `FondoFI.saldoInicial` + modelo `IngresoFI`). Multi-cuenta: **SERIE CUENTAS 3/3** (5 storageStates, roles-accesos/journeys). Vitest 516/516 · e2e 67 tests · CI verde. Concierge `/inicio` (estado del repo en ventanas nuevas).
> Cambios Sesión 14 Roadmap QA (`2026-09-03`): change `qa-roadmap-visual` — Modo QA Roadmap tipo búho: recorrido narrativo por etapas (`ROADMAP_ETAPAS` 11 etapas con chispas de intuición, plan por alcance escalado por carga), modo por etapas con pausas y notas del owner persistentes (`POST /api/qa-estado`), modo "🦉 Roadmap" en `/admin/qa-dashboard` (path zigzag ✅🦉⏳❌ + línea histórica por nodo) y reporter de Playwright que escribe progreso test a test en `qa-roadmap-live.json` (el búho avanza en vivo). Baselines por etapa recalibrables con cada corrida real. Skill `pruebas` v3 ("¿Cómo recorres?": seguido/por etapas). Vitest 516/516 · smoke con búho en vivo 13/13 · capability `DEV-qa-roadmap`.
> Cambios Sesión 15 QA-Lab por API (`2026-10-12`): change `qlab-poblamiento-api-rest` migra el poblamiento del laboratorio a **BD vía API REST** con ids `test-*` fijos y espejo transitorio al store. Fases EF/VU (prerrequisito: `EF/VU → FI → CT`), FI (pasos 1-11 + conexiones 7-10, períodos TEST dedicados y purga BD TEST-scoped), CT (gate de deuda/saldo en servidor + historial inmutable 409 → residuo honesto que purga `e2e:higiene`), IN (máquina de estados + `multa_in` idempotente por procedencia), RA (folio `RA-####`, cobros `reserva_ra`/`penalizacion_ra`/`garantia_ra`) y MT (folio `MT-####`, iniciar/finalizar con preventivo automático, guard de saldo en proyectos). **Estados sin cambio**: `FI/CT/IN/RA/MT` siguen 🟢 Completado y `LAB`/`QA-Lab` siguen 🟢; el change queda 🔵 En Proceso hasta archivar (Fase 3). Evidencia: suite **944/944** · tsc 0 · eslint 0 · e2e `poblado-idempotente` 8/8 y `flujo/poblamiento` 9/9. Manuales 12/20/22/23/26 + `34 - Historia de Poblamiento` §10 + `especificaciones/LAB - Mejoras Lab` actualizados; avance `avance - 2026-10-12 08-40.md`. **Archivado `2026-10-12` tras CI verde**: el gate de cobertura de Vitest por área y la reactivación de la lane e2e viven en el change `ci-verde-ratchet-cobertura` (avance `avance - 2026-10-12 14-15.md`).
