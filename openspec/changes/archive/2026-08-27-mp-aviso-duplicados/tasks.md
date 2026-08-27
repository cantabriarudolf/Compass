## 1. Aviso duplicados D5 en formularios (no bloqueante)

- [x] 1.1 En `k0mp4ss_fe/apps/web/app/inventario/tipos/page.tsx` `handleSave` detectar duplicado `tiposUnidad` por `nombre` (case-insensitive trim, excluye `editingItem.id`) y pedir `window.confirm` advisory D5; confirmar persiste, cancelar aborta
- [x] 1.2 En `k0mp4ss_fe/apps/web/app/inventario/estructura/page.tsx` `handleSaveMacro` detectar duplicado `macroSectores` por `nombre+etiqueta` y `handleSaveMicro` por `nombre+etiqueta` en `microSectores` (filtrado por `macroSectorId` si aplica), con `window.confirm` advisory y misma semántica
- [x] 1.3 En `k0mp4ss_fe/apps/web/components/comunidad/formulario-persona.tsx` `handleSubmit` detectar duplicado `personas` por `nombreCompleto` (`nombres+apellidos` trim lower, excluye `persona.id`) y pedir `window.confirm` advisory D5

## 2. Validación y cierre

- [x] 2.1 `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test -- --run` verde y `openspec validate --all` sin fallos; verificar que `save*` directo del store sigue permitiendo repetidos (D5) y que UI pide confirmación
