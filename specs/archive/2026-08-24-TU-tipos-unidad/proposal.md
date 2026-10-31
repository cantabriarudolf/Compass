## Why

Los tipos de unidad son la plantilla técnica y tarifaria que estandariza las unidades de la comunidad. Sin un maestro centralizado, la creación masiva de unidades es inconsistente y los cobros de gasto común carecen de una base homogénea. Este cambio incorpora el módulo `TU` bajo OpenSpec, alimentado por la fuente de verdad `Data/NSGC/docs/especificaciones/TU - Tipos de Unidad.md`.

## What Changes

- Implementación del maestro de Tipos de Unidad con atributos base: Nombre, Metraje (m2), Monto Base de Gasto Común y Descripción.
- Herencia automática de metraje y monto GC hacia las unidades físicas vinculadas (soporte a `EF-estructura-fisica`).
- Modificación retroactiva del tarifario con Fecha de Entrada en Vigencia y sincronización con el módulo de Finanzas (`FI`) mediante la lógica de "Actualización de Deuda".
- Calculador de impacto sobre unidades reales (variación unitaria, impacto mensual y proyección anual).
- Restricción de eliminación si existen unidades físicas vinculadas.
- Desactivación lógica (soft delete) mediante toggle de estado Activo/Inactivo.
- Trazabilidad hacia Auditoría y Métricas (`AM`) con eventos `TU_CREATE` y `TU_UPDATE_VALUE`.

## Capabilities

### New Capabilities
- `TU-tipos-unidad`: Maestro de tipos de unidad que estandariza plantillas técnicas y tarifarios base.

### Modified Capabilities
- None

## Impact

- `apps/web/app/inventario/tipos/page.tsx`: Vista de gestión del maestro (CRUD + calculador de impacto).
- `apps/web/data/inventario/estructura.ts`: Data store de `tiposUnidad` y `TipoUnidad`.
- `openspec/specs/project.md`: Actualización del cross-reference `TU-tipos-unidad` ↔ `TU - Tipos de Unidad.md`.
