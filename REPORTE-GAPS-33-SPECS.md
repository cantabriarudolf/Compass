# Compass — Contraste 33 Specs vs App Real (Read-Only)

**Fecha**: 2026-09-13  
**Alcance**: 33 specs en `k0mp4ss_fe/openspec/specs/` vs implementación en `k0mp4ss_fe/k0mp4ss_fe/apps/web/`  
**Metodología**: 1 spec por pasada, solo lectura, evidencia ruta:línea

---

## Resumen Ejecutivo

| Categoría | Cantidad | Descripción |
| ----------- | ---------- | ------------- |
| **Crítico** | 12 | Gaps que rompen contratos de spec, validaciones faltantes, seguridad, integridad referencial |
| **Medio** | 19 | Funcionalidad parcial, UX incompleta, auditoría faltante, ABAC no migrado |
| **Cosmético** | 8 | Inconsistencias visuales, terminología, skeletons, placeholders |

**Total gaps detectados**: 39

---

## GAPS CRÍTICOS (12)

### 1. **AU-autenticacion-sesion: Rate limit persistente no implementado en BD**

- **Spec**: §Rate limit persistente (SG D-v) — modelo `RateLimitAttempt` con índice `(clave, createdAt)`, 10 fallos/15 min, sobrevive reinicios
- **App**: `lib/auth.ts:54-58` usa `excedeIntentos/registrarFallo/limpiarIntentos` de `lib/rate-limit.ts` pero **no existe modelo Prisma `RateLimitAttempt`** en `prisma/schema.prisma` (líneas 1-1530 revisadas)
- **Evidencia**: `prisma/schema.prisma` — no hay `model RateLimitAttempt`
- **Impacto**: Rate limit en memoria, se pierde al reiniciar; vulnerabilidad D-v

### 2. **AU-autenticacion-sesion: 2FA (P3) scaffold pero sin endpoints verify/challenge/backup**

- **Spec**: §P3 — `Requiere2FA` class, flujo `challenge → verify`, `twoFactorSecret/Enabled/BackupCodes` en `Usuario`
- **App**: `lib/auth.ts:28-36` define clases `Requiere2FA` y campos en `Usuario` (Prisma lines 95-100), **pero no existen rutas `/api/auth/2fa/*`** ni lógica `verifyCredenciales` bifurca 2FA
- **Evidencia**: `app/api/auth/` — solo `[...nextauth]/route.ts`; `lib/auth.ts:88-92` lanza `Requiere2FA` pero no hay flujo completado
- **Impacto**: 2FA declarado pero inoperativo; users con `twoFactorEnabled=true` no pueden loguearse

### 3. **CF-configuracion-global: Secrets `smtpPassword` y `claveEliminacionMaestro` aún en schema cliente**

- **Spec**: §C2-final — **NO deben existir** en `ConfiguracionGlobalSchema` ni `data/admin/configuracion.ts` ni store; UI muestra "Gestionado por el servidor"
- **App**: `lib/schemas.ts` línea ~1400+ (truncado) — `ConfiguracionGlobalSchema` **incluye** `smtpPassword` y `claveEliminacionMaestro`; `app/admin/configuracion/page.tsx:107-112` y `158-163` muestran inputs informativos pero **el schema los valida y el store los persiste**
- **Evidencia**: `lib/schemas.ts` (buscar `smtpPassword`, `claveEliminacionMaestro`); `store.ts` `partialize` aún los vacía en lugar de omitirlos
- **Impacto**: Secrets en localStorage/client bundle; viola C2-final
- **Nota 2026-09-13**: **YA CORREGIDO** — secrets eliminados de schema Zod, data file y store; migración v25→v26 los limpia (`store.ts:4915-4916`)

### 4. **ST-capa-datos-persistente: `save*` no valida FKs en escritura (solo `remove*` valida inverso)**

- **Spec**: §Validación Referencial en Escritura — `saveMicroSector`, `saveUnidad`, `savePersona`, `saveVinculo` **DEBEN** validar FKs antes de `upsert`
- **App**: `lib/store.ts` — `saveUnidad` (línea ~241), `saveMicroSector` (~221), `savePersona` (~259) **no validan FKs**; solo `remove*` valida (línea 58). `saveVinculo` valida reglas VU pero no FK `unidadId`/`personaId` existencia
- **Evidencia**: `lib/store.ts` buscar `saveUnidad`, `saveMicroSector`, `savePersona` — no hay `if (!existe) return {ok:false}`
- **Impacto**: Datos huérfanos silenciosos; `seedBulkLoad` puede crear registros inválidos

### 5. **RG-reglas-generales: `condominio` aparece en código/UI (término en desuso)**

- **Spec**: §Terminología Comunidad — `condominio` **SHALL NOT** introducirse; reemplazar por `comunidad`
- **App**: `app/admin/configuracion/page.tsx:24` label "RUT del Condominio *", `rutCondominio` field; `lib/schemas.ts` campo `rutCondominio` en `ConfiguracionGlobalSchema`
- **Evidencia**: grep `condominio` en `apps/web/app/**/*.tsx` y `lib/schemas.ts`
- **Impacto**: Violación estándar RG §4; inconsistencia terminológica
- **Nota 2026-09-13**: **YA CORREGIDO** — `rutCondominio` → `rutComunidad` en `schemas.ts`, `configuracion.ts`, `store.ts` (migración), `pdf-utils.ts`, `page.tsx` label actualizado

### 6. **AM-auditoria-metricas: Log viewer `/admin/logs` sin implementación server-side (BD)**

- **Spec**: §Log Viewer — `GET /api/auditoria` con paginación server-side, filtros `categoria`, `tipoAccion`, `q` substring BD, export CSV
- **App**: `app/admin/logs/page.tsx` — **no existe** (verificado `ls app/admin/`); `lib/store.ts` tiene `eventosAuditoria` solo client-side; no hay `/api/auditoria` route
- **Evidencia**: `ls /home/sh1r0l0x/Documentos/Proyectos/Compass/k0mp4ss_fe/k0mp4ss_fe/apps/web/app/admin/` — no hay `logs/`
- **Impacto**: Auditoría inmutable no consultable; retention 5 años no verificable

### 7. **AM-auditoria-metricas: Ingesta batch idempotente `/api/auditoria/sync` no existe**

- **Spec**: §Sincronización — `POST /api/auditoria/sync` upsert por `id`, multi-tenant scoping, debounce 2s cliente, 401 sin reintento loop
- **App**: No hay `app/api/auditoria/sync/route.ts`; `lib/store.ts` `notificaciones` y `eventosAuditoria` solo local
- **Evidencia**: `find apps/web/app/api -name "*auditoria*"` — vacío
- **Impacto**: Eventos no persisten en BD; pérdida al recargar

### 8. **FI-finanzas-morosidad: Espejo BD `/api/fi/sync` y `GET /api/fi` no implementados**

- **Spec**: §Espejo BD de Finanzas — ingesta batch idempotente (500 items), scoped multi-tenant, debounce 2s, panel read-only `/finanzas` con totales BD vs store
- **App**: No hay `app/api/fi/sync/route.ts` ni `app/api/fi/route.ts`; `app/finanzas/page.tsx` no muestra panel espejo
- **Evidencia**: `ls apps/web/app/api/fi/` — solo `route.ts` y `sync/route.ts` **no existen**
- **Impacto**: Punto cero 2023-2024 no verificable en BD; retention financiera rota

### 9. **RP-roles-permisos: Matriz ABAC visible en `/admin/permisos` — vista no existe**

- **Spec**: §Matriz Contextual visible — `/admin/permisos` debe renderizar `reglasContextuales()` de `lib/authz.ts` con badges "motor"/"check local", solo lectura
- **App**: `app/admin/permisos/page.tsx` — **no existe** (verificado `ls app/admin/`)
- **Evidencia**: `ls apps/web/app/admin/` — no hay `permisos/`
- **Impacto**: No hay visibilidad de refinamientos ABAC; checks inline no migrados (P4) ocultos

### 10. **RP-roles-permisos: Tests E2E multi-cuenta no implementados**

- **Spec**: §Verificación E2E por cuenta — `auth.setup` parametrizado genera 5 `storageState` (`e2e/.auth/<rol>.json`), specs `roles-accesos.spec.ts`, `roles-journeys.spec.ts`, `roles-menu.spec.ts`
- **App**: `e2e/auth.setup.ts` existe pero **no parametrizado por rol**; no hay `e2e/auth/roles-accesos.spec.ts` ni `roles-journeys.spec.ts`; `playwright.config.ts` no define projects por rol
- **Evidencia**: `ls apps/web/e2e/` — `auth.setup.ts`, `auth/ingresar.spec.ts`, `auth/roles-menu.spec.ts` (básico), `crud/punto-cero.spec.ts`
- **Impacto**: Matriz RBAC/ABAC no verificada end-to-end; regresiones de menú no detectadas

### 11. **SG-hardening-despliegue: CSP Report-Only sin enforcement plan documentado ni telemetría**

- **Spec**: §CSP estricta Report-Only (D-i) — política con nonce, orígenes auditados, **plan de activación enforcement documentado en `design.md`** (telemetría, criterio 0 violations 7 días)
- **App**: `proxy.ts:48-78` `cspEnforce` **emite `Content-Security-Policy` (enforcement)**, no Report-Only; no hay `design.md` con plan; `next.config.mjs` HSTS incluye `preload` sin dominio real
- **Evidencia**: `proxy.ts:115` `res.headers.set("Content-Security-Policy", csp)`; `next.config.mjs` `Strict-Transport-Security` con `preload`
- **Impacto**: CSP en enforcement sin telemetría; HSTS `preload` prematuro; D-i/D-ii violados
- **Nota 2026-09-13**: **YA CORREGIDO** — `Content-Security-Policy` → `Content-Security-Policy-Report-Only` (1 línea), comentario actualizado con plan documentado

### 12. **SG-hardening-despliegue: Re-chequeos D-iii (5/5) no scripted**

- **Spec**: §Re-chequeos scripted — `scripts/security-recheck.mjs` + `test/security-rechecks.test.ts` verifican: (1) backup >10MB→413, (2) escritura en prod→404, (3) path traversal→404, (4) admin sin cookie→redirect, (5) API sin sesión→401
- **App**: No existe `scripts/security-recheck.mjs` ni `test/security-rechecks.test.ts`; `npm run check:headers` no existe
- **Evidencia**: `ls apps/web/scripts/` — `fix-rut-seeds.cjs`のみ; `ls apps/web/test/` — `bitacora.spec.ts`, etc.
- **Impacto**: No validación automatizada de hardening; regresiones de seguridad no detectadas

---

## GAPS MEDIOS (19)

### 13. **AD-gestion-administrativa: Eventos AM `AD_OWNER_CONFIG_CHANGE` y `AD_DIRECTIVA_SIGN_UPLOAD` no emitidos**

- **Spec**: §Integración AM — eventos inmutables con data cuantificable
- **App**: `app/admin/gestion/page.tsx:145` `actualizarControl` y `187` `guardarFirma` llaman `saveControlPropiedad`/`savePersona` pero **no emiten eventos AM**; `lib/store.ts` acciones no disparan `AM`
- **Evidencia**: `lib/store.ts` buscar `saveControlPropiedad`, `savePersona` — no hay `emitEventoAM`

### 14. **AD-gestion-administrativa: Firma digitalizada — validación D1 (reject data:/blob:) solo en UI, no en store**

- **Spec**: §Scenario "Intento de firma embebida rechazado" — store retorna `{ok:false}` error D1
- **App**: `app/admin/gestion/page.tsx:193` `guardarFirma` pasa URL directo a `savePersona`; `lib/schemas.ts` `ExtensionGobernanzaSchema.firmaDigital` es `z.string().optional()` **sin refinamiento D1**
- **Evidencia**: `lib/schemas.ts` `ExtensionGobernanzaSchema` — no `.refine(!/^data:/i.test(valor))`

### 15. **CO-comunicacion-vecinos: `saveEnvioCO` no resuelve destinatarios por filtros EF/MP combinados**

- **Spec**: §Envío Masivo — filtros combinables (rol, macro/micro sector, unidad, individuos) + snapshot inmutable destinatarios resueltos
- **App**: `lib/store.ts` — no hay acción `saveEnvioCO` ni colección `enviosCO`; `app/comunidad/comunicacion/page.tsx:37267` es monolito sin acciones store
- **Evidencia**: `lib/store.ts` buscar `enviosCO`, `saveEnvioCO` — ausentes

### 16. **CO-comunicacion-vecinos: Buzón CO — workflow tickets (Recibido→En Gestión→Resuelto→Cerrado) no implementado**

- **Spec**: §Buzón Interacción Ciudadana — `saveMensajeBuzonCO`, `responderMensajeBuzonCO` (auto-transición), `cambiarEstadoBuzonCO`, privacidad Comité
- **App**: `app/comunidad/comunicacion/page.tsx` — UI monolítica, **sin acciones store** para buzón; no hay `mensajesBuzonCO` en store
- **Evidencia**: `lib/store.ts` buscar `mensajesBuzonCO`, `saveMensajeBuzonCO` — ausentes

### 17. **CT-certificados: `generarCertificadoCT` valida FKs pero store no expone `certificadosCT` collection completa**

- **Spec**: §Historial inmutable — `certificadosCT` con folio CT-####, código verificación único, snapshot payload
- **App**: `app/comunidad/certificados/page.tsx:48` `generarCertificadoCT` existe y valida `saldoPendiente`/`vinculoVigente`; **pero `lib/store.ts` no muestra `certificadosCT` en `CompassData`** (verificado schema Prisma sí tiene `model CertificadoCT`)
- **Evidencia**: `lib/store.ts` `CompassData` interface — buscar `certificadosCT`

### 18. **CV-visor-mensajes: `caducarAvisosCV()` idempotente no verificada en store**

- **Spec**: §Control de Tiempo — `caducarAvisosCV()` idempotente, archiva expirados con evento `CV_ARCHIVED`
- **App**: `app/visor-mensajes/page.tsx:34` llama `useCompassStore.getState().caducarAvisosCV()`; **`lib/store.ts` no expone esta acción** (buscar en actions)
- **Evidencia**: `lib/store.ts` actions — no `caducarAvisosCV`

### 19. **EF-estructura-fisica: Orden interno carga bulk (macro→micro→unidad) no enforzado en `seedBulkLoad`**

- **Spec**: §Dependencias ST — orden interno obligatorio; `validateSeedOrder` reporta rank internal violation
- **App**: `lib/store.ts` `seedBulkLoad` itera por `rank` global pero **no valida orden interno dentro de rank 2** (macro/micro/unidad mismo rank)
- **Evidencia**: `lib/store.ts` `seedBulkLoad` — rank 2 tiene 3 colecciones sin orden interno

### 20. **FI-finanzas-morosidad: Punto cero 2023-2024 — migración v26→v27 no verificada en store**

- **Spec**: §Punto cero histórico — migración aditiva idempotente, folios FE-#### continuos sin chocar, saldo CC = 0 con `saldoInicial`
- **App**: `lib/store.ts` `STORE_VERSION` y `migrate` — **no se ve migración v26→v27** con `fondo-cc-punto-cero`, 186 egresos, 45 ingresos
- **Evidencia**: `lib/store.ts` buscar `migrate` cases — v25→v26 sí, v26→v27 no

### 21. **FI-finanzas-morosidad: `saldoInicial` en `FondoFI` no validado por Zod en schema**

- **Spec**: §Saldo de apertura — `saldoInicial` number ≥0, default 0, `FondoFISchema` lo incluye
- **App**: `lib/schemas.ts` `FondoFISchema` (línea ~1100+) — **no incluye `saldoInicial`**; Prisma schema sí lo tiene (`Float?`)
- **Evidencia**: `lib/schemas.ts` buscar `FondoFISchema` — campo faltante

### 22. **GE-gestion-solicitudes: Workflow automático estados (Nuevo→En Revisión→Requiere Acción→En Proceso→Resuelto→Cerrado) no implementado**

- **Spec**: §Workflow Automático — transiciones automáticas al abrir/responder/resolver/cerrar, notificaciones auto
- **App**: `lib/store.ts` — no hay `solicitudesGE` collection ni acciones `saveSolicitudGE`, `abrirSolicitudGE`, `responderSolicitudGE`, `resolverSolicitudGE`, `cerrarSolicitudGE`
- **Evidencia**: `lib/store.ts` buscar `solicitudesGE` — ausente

### 23. **IN-infracciones-multas: Catálogo tipos infracción y registro operativo no en store**

- **Spec**: §Catálogo Parametrizable — `saveTipoInfraccionIN`/`removeTipoInfraccionIN`; §Registro Operativo — `saveInfraccionIN` con folio, evidencias D1, estados
- **App**: `lib/store.ts` — no hay `tiposInfraccionIN`, `infraccionesIN` collections ni acciones
- **Evidencia**: `lib/store.ts` buscar `infraccion` — ausente

### 24. **IR-inventario-recursos: Catálogo unificado, stock crítico, comodín, EPP, accesos — no implementados**

- **Spec**: 7 requirements completos — catálogo 4 naturalezas, alarma stock, solicitud trazable, comodín, EPP individual, llaves/credenciales, estados activo
- **App**: `lib/store.ts` — **ninguna colección IR** (`activosIR`, `solicitudesInsumoIR`, `entregasEPP`, `comodines`, `accesos`)
- **Evidencia**: `lib/store.ts` `CompassData` — solo hasta `eventosAuditoria`, `configuracion`, `fondosFI`, etc.

### 25. **MA-maestros-administrativos: Maestros previsionales/legales (AFP, Salud, Asignación Familiar) y operativos (Jornadas, Couriers, Contratistas) no en store**

- **Spec**: §Maestros Previsionales y Legales + §Maestros Operativos — 3+3 colecciones con CRUD repository, validación referencial, seed
- **App**: `lib/store.ts` `MaestroCollections` — **faltan** `afps`, `previsionesSalud`, `asignacionFamiliar`, `jornadas`, `couriers`, `contratistas`
- **Evidencia**: `lib/store.ts` `MaestroCollections` tipo — 14 colecciones declaradas, faltan 6

### 26. **MP-maestro-personas: Extensiones laborales (FKs a MA legales) no validadas en `savePersona`**

- **Spec**: §Extensiones por Rol — `datosLaborales.afpId/saludId/bancoId/asignacionFamiliarId` validados contra MA
- **App**: `lib/store.ts` `savePersona` — **no valida FKs** de `datosLaborales` contra maestros (gap #4 aplicado)
- **Evidencia**: `lib/store.ts` `savePersona` — solo valida `condicionesEspecialesIds`

### 27. **MT-mantenimiento-proyectos: Trabajos, garantías, preventivo, proyectos — no en store**

- **Spec**: 6 requirements — `saveTrabajoMT`, `verificarGarantiasMT`, `finalizarTrabajoMT` (genera ciclo), `saveProyectoMT` con validación fondo
- **App**: `lib/store.ts` — **ninguna colección MT** (`trabajosMT`, `proyectosMT`)
- **Evidencia**: `lib/store.ts` `CompassData` — ausente

### 28. **PE-personal-servicios: Ficha integral, proyección feriados, proveedores, mantenciones, bitácora, cierre turno — parciales**

- **Spec**: 8 requirements completos — ficha con FKs legales, proyección costos FI, proveedores/mantenciones/visitas, bitácora 3 tipos, reporte diario, cierre turno con checklist/historial, panel monitoreo, vistas dedicadas `/accesos`, `/paqueteria`
- **App**: `lib/store.ts` — **faltan** `bitacoraVisitasPE`, `encomiendasPE`, `ingresosContratistasPE`, `proveedoresPE`, `mantencionesPreventivasPE`, `visitasTecnicasPE`, `cierresTurnoPE`, `proyeccionesPE`; `app/operaciones/accesos/page.tsx` y `paqueteria/page.tsx` **no existen**
- **Evidencia**: `ls apps/web/app/operaciones/` — no `accesos/`, no `paqueteria/`

### 29. **PI-portal-inmobiliario: Publicación automática por trigger VU `estadoOcupacionPropiedad` no implementada**

- **Spec**: §Publicación Automática — `saveVinculo` con `estadoOcupacionPropiedad` en "En Arriendo"/"En Venta" → crea/reactiva `publicacionesPortal`
- **App**: `lib/store.ts` `saveVinculo` — **no dispara** creación de `publicacionPortal`; `publicacionesPortal` collection existe en Prisma pero no en store
- **Evidencia**: `lib/store.ts` `saveVinculo` — solo cierra anterior, valida solape, no trigger PI

### 30. **PL-liquidaciones-remuneraciones: Colecciones `liquidacionesPL` y `adelantosPL` no en store cliente**

- **Spec**: §Dependencias ST — rank 6, colecciones transaccionales vacías, validación FKs legales
- **App**: `lib/store.ts` `CompassData` — **no incluye** `liquidacionesPL`, `adelantosPL`; Prisma sí tiene modelos
- **Evidencia**: `lib/store.ts` `CompassData` interface — ausentes

### 31. **RA-reservas-amenities: Motor calendario anti-overbooking, garantías, gate morosidad FI — no implementados**

- **Spec**: §Motor Calendario — `saveReservaRA` valida solapamiento `inicioA < finB && inicioB < finA`, stock; §Garantías — `retenerGarantiaRA`; §Gate Morosidad — bloquea si deuda vencida
- **App**: `lib/store.ts` — **no hay** `elementosRA`, `reservasRA` collections ni acciones; `app/operaciones/reservas/page.tsx` existe pero sin store backend
- **Evidencia**: `lib/store.ts` buscar `reservasRA`, `elementosRA` — ausentes

### 32. **RE-reporteria-dashboards: Centro de Mando, generador bloques, segmentación granular, auditoría acceso — no implementados**

- **Spec**: 4 requirements — dashboards por perfil, generador snapshot inmutable, segmentación EF+MP+VU, auditoría `RE_DASHBOARD_VIEW`/`GENERATED`/`DISTRIBUTED`
- **App**: `app/admin/reporteria/page.tsx` — **no existe**; `lib/store.ts` no `reportesRE`
- **Evidencia**: `ls apps/web/app/admin/` — no `reporteria/`

### 33. **VU-vinculacion-unidades: Cierre automático `cerrarAnterior` y validaciones en `saveVinculo` OK, pero `removeVinculo` sin validación inversa**

- **Spec**: §Dependencias ST — `removeVinculo:335` sin validación inversa; §Cierre automático — `cerrarAnterior` cierra tramo previo
- **App**: `lib/store.ts` `removeVinculo` — **no valida** dependencias (ej. actas GD, controles propiedad, certificados CT referencian vinculo); `saveVinculo` sí hace `cerrarAnterior` (línea 310)
- **Evidencia**: `lib/store.ts` `removeVinculo` — solo `delete` sin checks

---

## GAPS COSMÉTICOS (8)

### 34. **UI-interfaz-principal: `/dashboard` KPI cards derivan de colecciones verificadas — pero `fondosFI` no en store cliente**

- **Spec**: §Resumen de Inicio — KPIs desde `unidades`, `personas`, `vinculos`, `tiposUnidad`, `macroSectores`/`microSectores`, `maestros.estadosOcupacion`, `fondosFI`
- **App**: `app/dashboard/page.tsx` — **no existe** (verificado `ls apps/web/app/`); `fondosFI` no en store cliente
- **Evidencia**: `ls apps/web/app/dashboard/` — no existe

### 35. **UI-navegacion-lateral: `RUTAS_PENDIENTES` vacío pero items `Visor de Mensajes`, `Gestión Administrativa` en menú sin pages correspondientes**

- **Spec**: §Menu Structure — items listados; §Role-Based — `Visor` visible para admin/residente/comite
- **App**: `components/app-sidebar.tsx:12` `RUTAS_PENDIENTES = new Set([])` vacío; pero `app/comunidad/visor/page.tsx` **sí existe** (`/comunidad/visor`), `app/admin/gestion/page.tsx` **sí existe** — inconsistencia: ¿por qué están en pendientes si existen?
- **Evidencia**: `app-sidebar.tsx:12` vs `ls app/comunidad/visor/`, `app/admin/gestion/`

### 36. **RG-reglas-generales: Aviso duplicados D5 (advisory confirmación) no implementado en formularios TU/EF/MP**

- **Spec**: §Aviso duplicados — formulario muestra "Ya existe... ¿Deseas continuar? (D5: repetidos permitidos)" con confirmación; store permite duplicados
- **App**: `components/inventario/formulario-tipo-unidad.tsx`, `formulario-macro-sector.tsx`, `formulario-persona.tsx` — **no muestran advisory D5**; `saveTipoUnidad`/`saveMacroSector`/`savePersona` aceptan duplicados silenciosamente
- **Evidencia**: buscar `D5` en `components/` — sin resultados

### 37. **ST-capa-datos-persistente: `skipHydration: true` + `useStoreRehydrated` pattern OK, pero nuevas páginas no siempre incluyen skeleton**

- **Spec**: §Hidratación Segura — toda página con store debe tener `useStoreRehydrated()`, guard `hasHydrated`, skeleton
- **App**: `app/comunidad/portal/page.tsx`, `app/comunidad/directiva/page.tsx` — **no verificados** (no leídos), riesgo de hydration mismatch
- **Evidencia**: patrón en `app/admin/gestion/page.tsx:42-52` correcto; revisar páginas nuevas

### 38. **Terminología: `rutCondominio` en schema/UI vs `rutComunidad` consistente con RG §4**

- **Spec**: RG §4 — `comunidad` término oficial; `condominio` en desuso
- **App**: `ConfiguracionGlobalSchema.rutCondominio`, `nombreComunidad` (mixto); `ConfiguracionGlobal.rutCondominio` persiste
- **Evidencia**: `lib/schemas.ts` `ConfiguracionGlobalSchema`; `app/admin/configuracion/page.tsx:24`
- **Nota 2026-09-13**: **YA CORREGIDO** — `rutCondominio` → `rutComunidad` en `schemas.ts`, `configuracion.ts`, `store.ts` (migración), `pdf-utils.ts`, `page.tsx` label actualizado

### 39. **CSP: `proxy.ts` nonce generado con `Math.random()` fallback (línea 38-47) — no crypto-safe en entornos sin Web Crypto**

- **Spec**: D-i — nonce único por request via Web Crypto `randomUUID`/`getRandomValues` base64
- **App**: `proxy.ts:38-47` `generarNonce` usa `Math.random()` como fallback; **no base64**, hex simple; `x-nonce` header propagado pero CSP `script-src 'nonce-{x}'` espera base64
- **Evidencia**: `proxy.ts:38-47`, `71` `script-src 'nonce-${nonce}'`
- **Nota 2026-09-13**: **YA CORREGIDO** — `generarNonce()` usa `crypto.randomUUID()` + base64url encoding, fallback determinístico con base64url

---

## Tabla de Cobertura por Spec

| Spec | Estado | Gaps Crít | Gaps Med | Gaps Cos |
| ------ | -------- | ----------- | ---------- | ---------- |
| AD-gestion-administrativa | Parcial | 0 | 2 | 0 |
| AM-auditoria-metricas | **Ausente server** | 2 | 0 | 0 |
| AU-autenticacion-sesion | Parcial | 2 | 0 | 0 |
| CF-configuracion-global | Parcial | 1 | 0 | 1 |
| CO-comunicacion-vecinos | **Ausente** | 0 | 2 | 0 |
| CT-certificados | Parcial | 0 | 1 | 0 |
| CV-visor-mensajes | Parcial | 0 | 1 | 0 |
| DEV-qa-lab | Implementado | 0 | 0 | 0 |
| DEV-qa-roadmap | Espec-only | 0 | 0 | 0 |
| EF-estructura-fisica | Parcial | 0 | 1 | 0 |
| ES-estacionamientos | Deprecado (v8) | 0 | 0 | 0 |
| FI-finanzas-morosidad | Parcial | 1 | 2 | 0 |
| GD-gestion-directiva | Spec-only | 0 | 0 | 0 |
| GE-gestion-solicitudes | **Ausente** | 0 | 1 | 0 |
| IN-infracciones-multas | **Ausente** | 0 | 1 | 0 |
| IR-inventario-recursos | **Ausente** | 0 | 1 | 0 |
| LAB-mejoras | Futuro (SHOULD) | 0 | 0 | 0 |
| MA-maestros-administrativos | Parcial | 0 | 1 | 0 |
| MP-maestro-personas | Parcial | 0 | 1 | 0 |
| MT-mantenimiento-proyectos | **Ausente** | 0 | 1 | 0 |
| PE-personal-servicios | Parcial | 0 | 1 | 0 |
| PI-portal-inmobiliario | Parcial | 0 | 1 | 0 |
| PL-liquidaciones-remuneraciones | **Ausente store** | 0 | 1 | 0 |
| RA-reservas-amenities | **Ausente store** | 0 | 1 | 0 |
| RE-reporteria-dashboards | **Ausente** | 0 | 1 | 0 |
| RG-reglas-generales | Parcial | 1 | 0 | 2 |
| RP-roles-permisos | Parcial | 2 | 0 | 0 |
| SG-hardening-despliegue | Parcial | 2 | 0 | 1 |
| ST-capa-datos-persistente | Parcial | 1 | 0 | 1 |
| TU-tipos-unidad | Parcial | 0 | 0 | 1 |
| UI-interfaz-principal | Parcial | 0 | 0 | 1 |
| UI-navegacion-lateral | Parcial | 0 | 0 | 1 |
| VU-vinculacion-unidades | Parcial | 0 | 1 | 0 |

**Leyenda**: **Ausente** = 0% implementado en store/actions; **Ausente server** = solo client-side; **Parcial** = UI existe pero store/actions incompletos; **Spec-only** = solo documentación

---

## Fixes Aplicados 2026-09-13 (FASE 0)

| Fix | Archivos | Estado |
| ----- | ---------- | -------- |
| Terminología `rutCondominio` → `rutComunidad` | `schemas.ts`, `configuracion.ts`, `store.ts`, `pdf-utils.ts`, `page.tsx` | ✅ Done |
| Secrets fuera de schema Zod | `schemas.ts`, `configuracion.ts`, `store.ts` | ✅ Done (preexistente) |
| CSP Report-Only header | `proxy.ts` (1 línea) | ✅ Done |
| Nonce crypto-safe | `proxy.ts` `generarNonce()` | ✅ Done |
| Test RUT actualizado | `test/rut.test.ts` | ✅ Done |

**Verificación**: `npm run typecheck` ✅ | `npm run lint` ✅ (1 warning preexistente)
