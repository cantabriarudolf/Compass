---
description: "Cierre integral de un módulo OpenSpec: validación ST, documentación NSGC y archivado del change en un solo pase"
---

Cierra de forma integral el módulo indicado (o el change activo) en UN solo pase, sin saltarte pasos. Toma el change desde $ARGUMENTS; si viene vacío, infiérelo del contexto; si hay más de un change activo o es ambiguo, lista los activos y pregunta cuál cerrar.

Módulo a cerrar: $ARGUMENTS (doc fuente: `Data/NSGC/docs/especificaciones/`, change: `openspec/changes/`).

## FASE 1 — Validación ST del módulo
Sigue el checklist completo de `.opencode/commands/valida-datos.md` (6 puntos: artefactos, contrato datos, antipatrones, integración, contrato técnico ST, verificación) para este módulo. Incluye checks de terminología (`condominio` prohibido), paleta canónica `BADGE_OPTIONS`/`hexDesdeId`, `import type` vs valores, y coherencia ES→EF v8. Corrige solo lo que esté claramente dentro de la validación. Si hay hallazgos críticos no corregibles en este pase, repórtalos y detente antes de archivar.

## FASE 2 — Verificación técnica
- `npx tsc --noEmit` en `k0mp4ss_fe/apps/web` y `npx turbo lint` (0 errores).
- Si el módulo tocó la capa de datos: verifica el contrato ST (`STORE_VERSION`, `partialize`, `migrate` con limpieza legacy `estacionamientos`/`ubicacionesEstacionamiento` si aplica) y que el seed de `apps/web/data/` sea coherente con las validaciones del store (`validateStoreBackup` sobre un export equivalente: sin vínculos huérfanos, sin versiones futuras, `ubicacionesEstacionamiento` legacy como advertencia).
- **Validador de maestros hardcodeados:** ningún select/formulario del módulo repite opciones de categorías, etiquetas o estados hardcodeadas en la UI. Toda opción administrable DEBE leer de `maestros.*` del store (gestionada por MA en `/admin/maestros`); si el módulo necesitó una etiqueta nueva, DEBE quedar declarada en `Data/NSGC/docs/especificaciones/MA - Maestros Administrativos.md`, sembrada en `data/maestros.ts` y cubierta por `migrate` (subir `STORE_VERSION`) cuando corresponda. Validar también `removeMaestro` con integridad referencial.
- **Terminología RG:** `git diff HEAD -- . | rg -n "condominio" || echo "OK"` debe dar OK en el diff del módulo.

## FASE 3 — Snapshot del store (no bloqueante)
Recuérdale al usuario exportar su backup desde `/admin/dev-dashboard` → "Exportar datos" (o valida uno existente con `.opencode/commands/valida-backup.md`) para no perder lo que probó en el navegador. No bloquea el cierre.

## FASE 4 — Documentación NSGC
Ejecuta el flujo de la skill `nsgc-prepush` (`.agents/skills/nsgc-prepush/SKILL.md`):
1. Mocks: si cambió `apps/web/data/**` → Catálogo de Mocks (`28 - MK - Catálogo de Mocks.md`) + Data Dump por dominio + índice `00-index.md`.
2. Manual del módulo en `Data/NSGC/docs/manuales/` con el cambio.
3. Avance de desarrollo en `Data/NSGC/docs/avances/` (reutiliza el de la sesión si existe).
4. Trazabilidad (`03 - Mapa de Desarrollo y Trazabilidad.md`) e índice si el estado del módulo cambió.

## FASE 5 — Archivado OpenSpec
Ejecuta el flujo de `.opencode/commands/opsx-archive.md` de principio a fin para el change: status de artefactos y tareas, sync de delta specs (inline, con verificación post-sync) y movimiento a `openspec/changes/archive/`. Respeta sus prompts (confirmación ante artefactos/tareas incompletos y decisión de sync) — son las únicas preguntas legítimas del cierre.

## FASE 6 — Resumen final
Checklist explícito antes de terminar:

```
✅ Validación ST (6 puntos: artefactos, contrato datos, antipatrones, integración, contrato técnico ST, verificación)
✅ tsc + lint sin errores
✅ Store: versión/migración coherentes (incluye limpieza legacy estacionamientos/ubicaciones)
✅ Maestros de referencia vía MA (sin listas hardcodeadas, removeMaestro validado, BADGE_OPTIONS)
✅ Terminología RG: "comunidad" (sin "condominio" en diff)
✅ Catálogo de Mocks / Data Dumps actualizados (si aplica)
✅ Manual del módulo actualizado
✅ Avance de desarrollo creado
✅ Trazabilidad e índice actualizados
✅ Change archivado y specs sincronizadas
```

Si algún ítem quedó pendiente, decláralo explícitamente y di qué falta.

## FASE 7 — Publicación (opt-in)
Al terminar el checklist, pregunta explícitamente al usuario:

> "¿Publicar ahora a GitHub con `/nsgc-prepush`? (commit + push con validación NSGC)"

- Si responde que **SÍ**: ejecuta el flujo completo de `.opencode/commands/nsgc-prepush.md` en el mismo pase.
- Si responde que **NO** (o no confirma): termina aquí; todo queda local y listo para publicar cuando quiera.
