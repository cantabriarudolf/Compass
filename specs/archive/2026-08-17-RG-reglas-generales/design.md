## Context

`RG - Reglas Generales.md` define reglas de cumplimiento obligatorio para todo el proyecto: trazabilidad universal con AM, estándares de documentación (formato `AA - Nombre.md`, español chileno, índice actualizado), plantilla estándar de especificación (Prisma) y consistencia de datos/UX (campos obligatorios marcados, jerarquía TU, validación de configuraciones, capa de datos ST). El dashboard de desarrollo deriva el estado de cada módulo desde `openspec`; sin spec ni change archivado, `RG` queda `pendiente` en Fase 0.

## Goals / Non-Goals

**Goals:**
- Formalizar las reglas de RG como capability de OpenSpec con requirements y scenarios.
- Derivar el estado `completado` de RG en el dashboard vía change archivado.
- Mantener el documento fuente `RG - Reglas Generales.md` como referencia autoritativa de NSGC.

**Non-Goals:**
- Crear o modificar código: RG es una capability normativa, no tiene UI propia (`(Lógica Base)`).
- Cambiar el contenido de las reglas existentes.

## Decisions

- **Capability nueva en lugar de modificación**: RG no tiene spec previo, por lo que el delta agrega todos los requirements (`## ADDED Requirements`).
- **Spec derivado del documento NSGC**: los requirements se redactan a partir de las 4 secciones del documento (Trazabilidad Universal, Estándares de Documentación, Plantilla Estándar, Consistencia de Datos y UX), desglosadas en requirements atómicos con scenarios.
- **Sin cambios de código**: el tracking del dashboard ya funciona por convención de nombres (`RG-reglas-generales` matchea "Reglas Generales" por keywords), por lo que no se toca `dev-dashboard.ts`.

## Risks / Trade-offs

- **Spec normativo sin verificador automático** → El cumplimiento de las reglas se valida por revisión; el spec sirve de contrato para futuros changes.
- **Duplicidad con el documento NSGC** → El spec de OpenSpec es la versión operativa (requirements/scenarios); el documento NSGC sigue siendo la fuente de consulta del equipo.

## Migration Plan

1. Crear el change con proposal, design, tasks y delta spec.
2. Validar con `openspec validate`.
3. Sincronizar el delta spec al spec principal (`openspec/specs/RG-reglas-generales`).
4. Archivar el change con prefijo de fecha.
5. Verificar vía `/api/dev-dashboard` que RG aparece `completado` en Fase 0.

## Open Questions

- Ninguna.
