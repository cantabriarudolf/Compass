# LAB - Mejoras Lab (Fase 5 - Laboratorio y Automatización)

> ⛔ **RETIRADO (F9, 2026-10-31):** el Laboratorio QA (`/admin/qa-lab`) y su dashboard
> (`/admin/qa-dashboard`) ya no existen en la aplicación; se retiraron con
> `openspec/changes/retiro-modulo-qa-dev/`. Este documento queda como registro histórico del
> backlog que tuvieron.
>
> 🔌 **Datos:** este módulo es transversal dev-only; no tiene colección propia en `ST` más allá de `LAB-mejoras` como backlog. Vive en `openspec/specs/LAB-mejoras/` y se visualiza en `Fase 5` `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts:66` (`PHASES`).

Fase especial backlog para mejoras del **Laboratorio QA** (`/admin/qa-lab` `k0mp4ss_fe/apps/web/components/app-sidebar.tsx:125`). Agrupa mejoras futuras que no bloquean el core de la comunidad (Fases 0..4): vínculos en nueva ventana, screenshots automatizados y previews.

## 1. Contexto

`qa-lab` ya permite poblar `TEST-*` por `Rank 0..3` `openspec/specs/ST-capa-datos-persistente/spec.md:9` y ver `Cómo va quedando` `Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md:1`. Las mejoras pedidas son transversales y no deben ensuciar `Fase 0..4`. Se crea `Fase 5` como contenedor.

## 2. Funcionalidades Principales

### 2.1 Vínculos en nueva ventana

Cada fila de `Cómo va quedando` y cada tarjeta de `Qué se probó` en `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx:1` tiene `¿Dónde verlo?` con botón `Abrir dónde verlo →` que navega a la ruta real (`/admin/maestros`, `/inventario/tipos`, `/comunidad/personas`, `/inventario/estructura`, `/comunidad/personas/[id]`) con `target="_blank"` sin perder el estado del lab.

### 2.2 Screenshots automatizados (futuro)

Automatizar captura de pantallas de cada opción del lab mediante **Playwright + GitHub Actions**: al guardar `Data/NSGC/backups/compass-seed-report-*.json`, una Action levanta `pnpm dev`, captura `/admin/maestros`, `/inventario/tipos`, `/inventario/estructura`, `/comunidad/personas`, `/comunidad/personas/[id]` y deja las imágenes en `Data/NSGC/backups/screenshots/` para mostrar miniatura en el lab y ampliar al pinchar. Este requisito es `SHOULD` hasta implementarse.

### 2.3 Poblamiento de Estructura, FI, CT, IN, RA y MT por API REST

Desde el change `qlab-poblamiento-api-rest` (2026-10), las fases del laboratorio que quedaban escribiendo el store legacy poblan **BD vía API REST** (fuente de verdad), con ids fijos `test-*` para que repoblar sea idempotente y espejo transitorio al store mientras los consumidores legacy del propio laboratorio no migren:

- **Estructura (EF/VU)** — prerrequisito: la emisión de Gasto Común lee las unidades de BD, así que FI no puede migrar antes. Unidades y vínculos `test-*` quedan visibles en `/inventario/estructura`.
- **FI** — fondos, egresos, emisiones GC y cobros por API, más las acciones dedicadas de pago, mora y retiro de fondo; períodos TEST dedicados y purga BD TEST-scoped en "Borrar todo".
- **CT** — emisión por API con el gate de deuda/saldo en servidor e historial inmutable (el borrado responde 409 y lo purga la higiene e2e).
- **IN / RA / MT** — máquina de estados de infracciones con multa materializada, ciclo de vida de reservas con folio y cobros, y trabajos/proyectos con folio, preventivo y guard de saldo; las conexiones FI 7-10 leen BD.

Lo poblado se ve en las páginas reales. La verificación de cierre son los e2e `poblado-idempotente` y `flujo/poblamiento`, además de la suite unitaria.

## 3. Reglas de Negocio

- `Fase 5` no bloquea `Fase 0..4`; un change en `LAB` no exige bump de `STORE_VERSION`.
- Los vínculos no alteran datos, solo navegan; no requieren validación `ST`.
- Los screenshots son opcionales (`SHOULD`); si no existen, el lab muestra solo el vínculo.
- El poblamiento de fases por API escribe BD (fuente de verdad) con ids `test-*` fijos: repoblar debe ser idempotente y no debe duplicar filas. El espejo al store es transitorio y tiene criterio de retiro declarado.

## 4. Dependencias de Carga y Seed (ST)

- **Entidades ST:** `LAB-mejoras` como backlog, sin colección en `CompassData` (tipo `vistaDerivada`). No tiene `seed` propio.
- **Depende de:** `[ST-capa-datos-persistente, DEV-qa-lab]` — `Rank 99` (documental, no bloquea carga). Hereda `Rank` de `qa-lab`.
- **Load Order Rank:** `5` (`Fase 5`) — `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts:66` (`PHASES`/`PHASE_ORDER` con `Fase 5:5`).
- **Validación Referencial:** No aplica (sin FKs).
- **Carga Bulk:** No aplica.
- **Migración:** No requiere `STORE_VERSION`.
- **Seed Manifest:** No aplica.

## 5. Integración con Auditoría y Métricas (AM)

- **Evento:** `LAB_VINCULO_OPEN`, `LAB_SCREENSHOT_CAPTURED` (futuro).
- **Data Cuantificable:** clicks en `Abrir dónde verlo`, screenshots generados por reporte.
- **Métrica:** uso del lab (cargas por fase), tasa de adopción de vínculos.
