## Why

El módulo `RG` (Reglas Generales) existe como documento en `Data/NSGC/docs/especificaciones/RG - Reglas Generales.md` y rige el desarrollo de todo el proyecto (trazabilidad con AM, estándares de documentación, plantilla de especificación y consistencia de datos/UX), pero no tiene spec en `openspec/specs/` ni change asociado. Por eso el dashboard de desarrollo lo muestra en Fase 0 como `pendiente`, a pesar de que el proyecto ya se construye siguiendo estas reglas. Este change formaliza las reglas de RG como capability de OpenSpec.

## What Changes

- Nueva capability `RG-reglas-generales` que captura las reglas transversales obligatorias del proyecto SGC.
- Spec derivado del documento existente `Data/NSGC/docs/especificaciones/RG - Reglas Generales.md` (sin alterar su contenido).
- Cierre del tracking en el dashboard de desarrollo: `RG` pasa de `pendiente` a `completado` al quedar archivado el change.

## Capabilities

### New Capabilities

- `RG-reglas-generales`: Reglas transversales de cumplimiento obligatorio para cualquier desarrollo, modificación o documentación del proyecto (trazabilidad universal con AM, estándares de documentación, plantilla de especificación y consistencia de datos/UX).

### Modified Capabilities

- None

## Impact

- `openspec/specs/RG-reglas-generales/spec.md` (nuevo): spec formal de las reglas generales.
- `apps/web/lib/dev-dashboard.ts`: sin cambios; el estado `completado` se deriva automáticamente del change archivado.
- `Data/NSGC/docs/especificaciones/RG - Reglas Generales.md`: sin cambios (fuente del spec).
