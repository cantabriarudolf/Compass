# Tasks

## 1. Maestro de Tipos

- [x] 1.1 Implementar data store de `TipoUnidad` y `tiposUnidad` en `apps/web/data/inventario/estructura.ts`.
- [x] 1.2 Crear la página principal en `apps/web/app/inventario/tipos/page.tsx`.
- [x] 1.3 Implementar CRUD: crear, editar y desactivar tipos (soft delete con toggle Activo/Inactivo).

## 2. Tarifario e Impacto

- [x] 2.1 Implementar historial de tarifas con fecha de vigencia.
- [x] 2.2 Implementar calculador de impacto (unidades afectadas, variación unitaria, impacto mensual y proyección anual).

## 3. Reglas de Negocio

- [x] 3.1 Asegurar herencia de metraje y monto GC hacia las unidades vinculadas.
- [x] 3.2 Implementar restricción de eliminación si existen unidades físicas vinculadas.

## 4. Especificación y Trazabilidad

- [x] 4.1 Crear la delta spec `TU-tipos-unidad` desde la fuente NSGC `TU - Tipos de Unidad.md`.
- [x] 4.2 Definir eventos de auditoría `TU_CREATE` y `TU_UPDATE_VALUE` hacia el módulo `AM`.
- [x] 4.3 Actualizar el cross-reference en `openspec/specs/project.md`.
