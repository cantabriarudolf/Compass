## Context

El spec AM ya exige la vista (browse/filter/export, orden desc, inmutabilidad, retención) y
`store.eventos` existe: `EventoAuditoria { id, timestamp, usuario, categoria, tipoAccion,
referenciaId, descripcion }`, tope `MAX_EVENTOS = 500`, alimentada por `registrarEvento(set,
tipoAccion, referenciaId, descripcion, categoria)` desde todos los módulos. El patrón de vista
admin read-only ya está probado en `/admin/metricas` (client component + `useCompassStore`).

## Goals / Non-Goals

- **Goals:** vista `/admin/logs` con búsqueda, filtros (categoria/tipoAccion), export CSV y
  orden timestamp desc; quitar placeholder del sidebar; spec e2e en el lane crud.
- **Non-Goals:** mutar o purgar eventos desde la UI (immutabilidad); retención 5 años
  (requisito de capa de datos, fuera de alcance); pasar eventos a Prisma/SQLite.

## Decisions

1. **Client component directo sobre el store** (igual que metricas/qa-dashboard): los eventos
   ya viven en `localStorage`; no se justifica API ni server component. La exportación se hace
   cliente con Blob + `URL.createObjectURL` (BOM UTF-8 para Excel).
2. **Filtros en memoria, no derivados del store**: `useMemo` sobre `eventos` → búsqueda texto
   (descripcion/referenciaId/tipoAccion, case-insensitive, con debounce ~200ms) + selects
   `categoria` y `tipoAccion` cuyas opciones se derivan de los eventos presentes.
3. **Paginación por bloques de 50** con contador "X de Y eventos": evita renderizar 500 filas
   y mantiene la página liviana; sin librería de tabla nueva (Table shadcn existente).
4. **Solo lectura por diseño**: ninguna mutación en la página; badge "solo lectura · pista
   inmutable" comunica el requisito del spec.
5. **Sin `lib/store.ts` ni STORE_VERSION**: solo consumo de la colección existente.

## Risks / Trade-offs

- El tope de 500 eventos es la ventana visible de auditoría (retención real de 5 años queda
  para la capa persistente ST) — se documenta en la vista con el contador.
- `registrarEvento` usa usuario fijo "Admin" hasta integrar NextAuth en el store — la columna
  usuario ya existe para cuando llegue la identidad real.

## Open Questions

(ninguna — alcance cerrado con el owner: vista solo lectura; `/admin/permisos` es la change
siguiente aparte)
