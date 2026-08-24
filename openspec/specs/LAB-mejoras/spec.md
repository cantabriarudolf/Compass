# Laboratorio de Mejoras QA Specification

## Purpose

Backlog de la Fase 5 - Laboratorio y Automatizacion: mejoras del lab QA como vinculos externos, screenshots automatizados y previews, sin bloquear el flujo del core.

## Requirements

### Requirement: Fase 5 Laboratorio y Automatización

El sistema SHALL exponer la fase `Fase 5 - Laboratorio y Automatización` en `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts:66` (`PHASES`/`PHASE_ORDER`), `Data/NSGC/docs/manuales/01 - Plan de Avance.md` y `03 - Mapa` como contenedor de mejoras del lab. La capability `LAB-mejoras` SHALL vivir en esta fase.

#### Scenario: Dashboard muestra Fase 5
- **WHEN** se abre `/admin/dev-dashboard`
- **THEN** aparece la columna `Fase 5` con `LAB - Mejoras Lab` en estado `Pendiente` o `En Proceso` según el change activo.

### Requirement: Vínculos en nueva ventana desde Cómo va quedando

Cada fila de `Cómo va quedando` en `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx:1` SHALL tener botón `Abrir dónde verlo →` que navega a la ruta real del módulo (`/admin/maestros`, `/inventario/tipos`, `/comunidad/personas`, `/inventario/estructura`, `/comunidad/personas/[id]`) con `target="_blank"` sin perder el estado del lab.

#### Scenario: Click sin perder lab
- **WHEN** el usuario pulsa `Abrir dónde verlo →` en `1. Diccionario`
- **THEN** se abre `/admin/maestros` en pestaña nueva y el lab queda intacto.

### Requirement: Screenshots automatizados (futuro)

El sistema SHOULD automatizar la captura de pantallas de cada opción del lab mediante Playwright + GitHub Actions: al guardar `Data/NSGC/backups/compass-seed-report-*.json`, una Action levanta `pnpm dev`, captura `/admin/maestros`, `/inventario/tipos`, `/inventario/estructura`, `/comunidad/personas`, `/comunidad/personas/[id]` y deja las imágenes en `Data/NSGC/backups/screenshots/` para mostrar miniatura en el lab y ampliar al pinchar. Este requisito es futuro y SHALL quedar como `SHOULD` hasta implementarse.

#### Scenario: Report con screenshots
- **WHEN** existe `Data/NSGC/backups/screenshots/maestros-*.png`
- **THEN** el lab muestra miniatura junto al vínculo y al pinchar abre la imagen grande.
