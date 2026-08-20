---
description: "Valida un backup JSON del store (compass-store) antes de importarlo: estructura, versiones, integridad referencial y coherencia"
---

Valida un backup del store persistente antes de importarlo o documentarlo. NO modifiques el backup ni el store; valida y reporta.

Contexto: la capa de datos (ST) vive en `apps/web/lib/store.ts` (Zustand + persist, key `compass-store`, versión `STORE_VERSION`=8, `migrate`). Un backup exportado desde el dashboard (`/admin/dev-dashboard` → "Exportar datos") es un JSON con forma `{ "state": {...}, "version": N }`. La lógica de validación reutilizable está en `apps/web/lib/store-backup.ts` (`validateStoreBackup`). El seed vive en `apps/web/data/` y solo lo importa `lib/store.ts`. Desde v8, `ES - Estacionamientos` está absorbido como `unidades` en `EF` (no hay colección `estacionamientos` separada ni `ubicacionesEstacionamiento` en `maestros`).

Backup a validar: [RUTA_DEL_JSON] (o pega el contenido a continuación).

## 1) Estructura del archivo
- Es un objeto JSON válido (no array, no primitivo).
- Forma envelope `{ state, version }` o state plano (sin version) — en este último caso se asume versión actual.
- `state` incluye las colecciones requeridas de `CompassData` (v8): `tiposUnidad`, `macroSectores`, `microSectores`, `unidades`, `personas`, `vinculos`, `configuracion`, `maestros`. (Faltar una colección rompe la migración. No se exige `estacionamientos`; si aparece, es legacy v7 y debe reportarse como advertencia migrada.)

## 2) Compatibilidad de versiones
- Si `version` del backup > versión actual del store → NO se puede importar (la app no conoce las migraciones futuras). Reportar como error crítico.
- Si `version` < actual → OK, pero advertir que se aplicarán las migraciones pendientes al rehidratar (`migrate` en `lib/store.ts`).
- Si no declara versión → advertir que se interpreta como la versión actual.

## 3) Integridad referencial
- Todo `vinculos[].personaId` debe existir en `personas[]` y todo `vinculos[].unidadId` en `unidades[]` (vínculos huérfanos = error).
- Si el backup trae `estacionamientos` legacy (v7), reportar advertencia: "colección legacy v7, será ignorada/migrada a `unidades`"; no exigir `estacionamientos[].unidadId`.
- Los IDs respetan el patrón del módulo (ej: `p-`, `u-`, `v-`, `t-`, `est-`, `u-E-`) y no colisionan entre colecciones distintas. Los estacionamientos actuales son `unidades` con ids `u-E-001..`.
- El `maestros` contiene las 15 colecciones v8 (sin `ubicacionesEstacionamiento`) y sus items usan `id` único; `ubicacionesEstacionamiento` legacy se reporta como advertencia.

## 4) Coherencia con migraciones
- Si el backup es de una versión anterior, revisar que los datos presentes sean compatibles con los pasos de `migrate` (ej: unidades con `estadoId`, no `estado` legacy string).
- Verificar que el backup no contenga datos de módulos futuros (colecciones desconocidas) que la app actual ignoraría al migrar.

## 5) Verificación automática
- Ejecutar `validateStoreBackup` (Node + esbuild bundle sobre `apps/web/lib/store-backup.ts`, o en el dashboard al importar) y comparar con este checklist.
- `npx tsc --noEmit` en `apps/web` (0 errores).

## Entregable
Informe en chileno con (a) resultado por punto marcando ✅/❌, (b) errores críticos (bloquean import), (c) advertencias (no bloquean pero deben conocerse: `estacionamientos`/`ubicacionesEstacionamiento` legacy), (d) resumen de conteos (personas, vínculos, unidades —incluye estacionamientos como `u-E-*`—, colecciones de maestros) y versión del backup. No importes, no edites el archivo y no commitees.