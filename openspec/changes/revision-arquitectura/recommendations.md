# Recommendations — Revisión de Arquitectura (P4)

## Roadmap de mejoras propuestas

### Fase 1 (inmediata, bajo riesgo)
1. **Unificar `hoyISO*`** → `lib/date-utils.ts` (1 ventana)
2. **Adoptar `generarId()`** en `lib/store.ts` (1 ventana, mecánico)
3. **Documentar F1/F2** en fixture + tests (1 ventana)

### Fase 2 (medio plazo)
4. **Extraer acciones del store por dominio** a archivos separados (`lib/store-fi.ts`, `lib/store-pe.ts`, etc.) manteniendo un store compositor. Esto reduce el archivo principal de 5007 a ~2000 líneas. (2-3 ventanas)
5. **Evaluar abstracciones CRUD** en `@workspace/ui` si múltiples módulos comparten patrones de tabla/formulario idénticos.

### Fase 3 (largo plazo)
6. **Considerar migración a slices de Zustand** con persistencia por slice si el store sigue creciendo. Esto requiere investigación de compatibilidad de `zustand/middleware/persist` con slices.

## Riesgos
- **Fase 1**: 0 riesgo — solo deduplicación de helpers.
- **Fase 2**: Medio — requiere validar que `partialize` y `migrate` sigan funcionando correctamente.
- **Fase 3**: Alto — investigación necesaria; no ejecutar sin spike previo.
