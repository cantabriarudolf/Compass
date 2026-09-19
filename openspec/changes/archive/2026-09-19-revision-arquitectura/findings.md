# Findings — Revisión de Arquitectura y Deuda Técnica (P4)

## Hallazgos Alta Prioridad

### H1. Store monolito (5007 líneas, 140 funciones CRUD)
- **Ubicación**: `k0mp4ss_fe/apps/web/lib/store.ts`
- **Impacto**: Dificulta navegación, review, y testing unitario por dominio. Cambios en un módulo recompilan todo el store.
- **Riesgo de refactor**: Alto — Zustand persist es un store único; dividir en slices requiere cuidado con las migraciones y el `partialize`.
- **Recomendación**: Opción C (menor riesgo): extraer acciones CRUD por dominio a archivos `lib/store-fi.ts`, `lib/store-pe.ts`, etc., e importarlas en el store principal. Sin cambiar la estructura de persistencia.

## Hallazgos Media Prioridad

### H2. Patrón de generación de IDs duplicado (27+ repeticiones)
- **Ubicación**: `lib/store.ts` (líneas 213, 1336, 1382, 1648, 1823, 2105, 2349, 2423, 2590, 2810, 2867, 2933, 3107, 3144, 3237, 3304, 3317, 3406, 3442, 3458, 3547, 3576, 3592, 3924, 4024, 4095, 4139, 4217, 4406, 4412, 4527)
- **Patrón**: `` `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` ``
- **Solución propuesta**: `lib/id-utils.ts` ya creado con `generarId(prefijo, idx?)`. Reemplazar todas las ocurrencias.
- **Esfuerzo**: Medio — cambio mecánico pero toca 31 líneas en el store crítico.

### H3. Funciones `hoyISO*` duplicadas por dominio
- **Ubicación**: `lib/finanzas-utils.ts` (`hoyISO`), `lib/personal-utils.ts` (`hoyISOPE`), `lib/pl-utils.ts` (`hoyISOPL`), `lib/reporteria-utils.ts` (`hoyISORE`)
- **Impacto**: Todas hacen `new Date().toISOString().slice(0, 10)`. Violación DRY clara.
- **Recomendación**: Extraer a `lib/date-utils.ts` una única `hoyISO()` y deprecar las específicas.

### H4. Patrón `new Date().toISOString()` repetido
- **Ubicación**: ~15+ ocurrencias en `lib/store.ts` para timestamps de comentarios, historial de estados, etc.
- **Recomendación**: Usar `hoyISO()` (fecha) o `new Date().toISOString()` centralizado si se necesita timestamp completo.

## Hallazgos Baja Prioridad

### H5. Hallazgos del revisor-fin (F1/F2)
- **F1**: La apertura 17.082.694 del punto cero es DERIVADA (egresos − ingresos), no proviene del libro. El "saldo 0" es tautológico.
  - **Acción**: Añadir comentario en `data/finanzas/punto-cero-2324.json` + test que declare la identidad.
- **F2**: La serie mensual `saldoCC` del fixture sigue la cuenta bancaria del libro y NO reconcilia mes a mes con la derivada (23/24 meses difieren).
  - **Acción**: Declarar semántica en documentación o remover la serie del fixture para evitar doble verdad.

### H6. Componentes CRUD potencialmente duplicados
- **Observación**: No se encontraron abstracciones genéricas como `DataTable`, `ConfirmDialog`, `FormDialog`. Cada página implementa sus propias tablas y formularios.
- **Impacto**: Bajo si cada módulo tiene necesidades UI distintas; medio si hay copia-pega de estructuras similares.
- **Recomendación**: Evaluar si `@workspace/ui` debería proveer componentes de alta-order para CRUD comunes.
