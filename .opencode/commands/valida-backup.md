---
description: "Valida un backup JSON del store (compass-store) antes de importarlo: estructura, versiones, integridad referencial y coherencia"
---

Valida un backup del store persistente antes de importarlo o documentarlo. NO modifiques el backup ni el store; valida y reporta.

Contexto: la capa de datos (ST) vive en `apps/web/lib/store.ts` (Zustand + persist, key `compass-store`, versión 3, `migrate`). Un backup exportado desde el dashboard (`/admin/dev-dashboard` → "Exportar datos") es un JSON con forma `{ "state": {...}, "version": N }`. La lógica de validación reutilizable está en `apps/web/lib/store-backup.ts` (`validateStoreBackup`). El seed vive en `apps/web/data/` y solo lo importa `lib/store.ts`.

Backup a validar: [RUTA_DEL_JSON] (o pega el contenido a continuación).

## 1) Estructura del archivo
- Es un objeto JSON válido (no array, no primitivo).
- Forma envelope `{ state, version }` o state plano (sin version) — en este último caso se asume versión actual.
- `state` incluye las colecciones requeridas de `CompassData`: `tiposUnidad`, `macroSectores`, `microSectores`, `unidades`, `estacionamientos`, `personas`, `vinculos`, `configuracion`, `maestros`. (Faltar una colección rompe la migración.)

## 2) Compatibilidad de versiones
- Si `version` del backup > versión actual del store → NO se puede importar (la app no conoce las migraciones futuras). Reportar como error crítico.
- Si `version` < actual → OK, pero advertir que se aplicarán las migraciones pendientes al rehidratar (`migrate` en `lib/store.ts`).
- Si no declara versión → advertir que se interpreta como la versión actual.

## 3) Integridad referencial
- Todo `vinculos[].personaId` debe existir en `personas[]` y todo `vinculos[].unidadId` en `unidades[]` (vínculos huérfanos = error).
- Todo `estacionamientos[].unidadId` (si existe) debe apuntar a una `unidades[]` existente.
- Los IDs respetan el patrón del módulo (ej: `p-`, `u-`, `v-`, `t-`, `est-`) y no colisionan entre colecciones distintas.
- El `maestros` contiene al menos las 14 colecciones esperadas y sus items usan `id` único.

## 4) Coherencia con migraciones
- Si el backup es de una versión anterior, revisar que los datos presentes sean compatibles con los pasos de `migrate` (ej: unidades con `estadoId`, no `estado` legacy string).
- Verificar que el backup no contenga datos de módulos futuros (colecciones desconocidas) que la app actual ignoraría al migrar.

## 5) Verificación automática
- Ejecutar `validateStoreBackup` (Node + esbuild bundle sobre `apps/web/lib/store-backup.ts`, o en el dashboard al importar) y comparar con este checklist.
- `npx tsc --noEmit` en `apps/web` (0 errores).

## Entregable
Informe en chileno con (a) resultado por punto marcando ✅/❌, (b) errores críticos (bloquean import), (c) advertencias (no bloquean pero deben conocerse), (d) resumen de conteos (personas, vínculos, unidades, estacionamientos, colecciones de maestros) y versión del backup. No importes, no edites el archivo y no commitees.