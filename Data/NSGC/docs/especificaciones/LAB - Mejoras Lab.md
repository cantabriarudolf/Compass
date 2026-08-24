# LAB - Mejoras Lab (Fase 5 - Laboratorio y Automatización)

> 🔌 **Datos:** este módulo es transversal dev-only; no tiene colección propia en `ST` más allá de `LAB-mejoras` como backlog. Vive en `openspec/specs/LAB-mejoras/` y se visualiza en `Fase 5` `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts:66` (`PHASES`).

Fase especial backlog para mejoras del **Laboratorio QA** (`/admin/qa-lab` `k0mp4ss_fe/apps/web/components/app-sidebar.tsx:125`). Agrupa mejoras futuras que no bloquean el core de la comunidad (Fases 0..4): vínculos en nueva ventana, screenshots automatizados y previews.

## 1. Contexto

`qa-lab` ya permite poblar `TEST-*` por `Rank 0..3` `openspec/specs/ST-capa-datos-persistente/spec.md:9` y ver `Cómo va quedando` `Data/NSGC/docs/manuales/34 - Historia de Poblamiento - Relato de Uso.md:1`. Las mejoras pedidas son transversales y no deben ensuciar `Fase 0..4`. Se crea `Fase 5` como contenedor.

## 2. Funcionalidades Principales

### 2.1 Vínculos en nueva ventana

Cada fila de `Cómo va quedando` y cada tarjeta de `Qué se probó` en `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx:1` tiene `¿Dónde verlo?` con botón `Abrir dónde verlo →` que navega a la ruta real (`/admin/maestros`, `/inventario/tipos`, `/comunidad/personas`, `/inventario/estructura`, `/comunidad/personas/[id]`) con `target="_blank"` sin perder el estado del lab.

### 2.2 Screenshots automatizados (futuro)

Automatizar captura de pantallas de cada opción del lab mediante **Playwright + GitHub Actions**: al guardar `Data/NSGC/backups/compass-seed-report-*.json`, una Action levanta `pnpm dev`, captura `/admin/maestros`, `/inventario/tipos`, `/inventario/estructura`, `/comunidad/personas`, `/comunidad/personas/[id]` y deja las imágenes en `Data/NSGC/backups/screenshots/` para mostrar miniatura en el lab y ampliar al pinchar. Este requisito es `SHOULD` hasta implementarse.

## 3. Reglas de Negocio

- `Fase 5` no bloquea `Fase 0..4`; un change en `LAB` no exige bump de `STORE_VERSION`.
- Los vínculos no alteran datos, solo navegan; no requieren validación `ST`.
- Los screenshots son opcionales (`SHOULD`); si no existen, el lab muestra solo el vínculo.

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
