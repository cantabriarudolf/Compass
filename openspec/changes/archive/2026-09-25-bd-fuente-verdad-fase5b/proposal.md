# Proposal: BD-FUENTE-VERDAD Fase 5B — Specs NSGC, Tests Finales, Script Verificación

## Contexto

La serie `SERIE-BD-FUENTE-VERDAD` migra la fuente de verdad de localStorage (zustand persist) a la base de datos (Prisma/SQLite dev → PostgreSQL/Neon prod). Las fases 0–4 y 5A ya crearon las APIs REST, hooks SWR, `store-ui.ts` y deprecaron `lib/store.ts`.

**Gap**: las especificaciones NSGC aún referenciaban localStorage como fuente de verdad, y no existía una verificación automatizada de que la BD es realmente la fuente de verdad.

## Objetivo

1. Reescribir `ST - Capa de Datos Persistente.md` con la arquitectura de datos actual (UI → Hook → API → Prisma → BD).
2. Actualizar el bloque "🔌 Datos" en los specs de módulo para que referencien las API REST en lugar de localStorage.
3. Crear script de verificación `scripts/verificar-persistencia-db.ts` que pruebe que la BD es la fuente de verdad.
4. Validar que la suite de tests sigue verde y que ningún test nuevo depende de localStorage para persistencia de dominio.

## Alcance

- `Data/NSGC/docs/especificaciones/ST - Capa de Datos Persistente.md` — reescritura completa.
- 21 specs de módulo — actualizar bloque "🔌 Datos".
- `Data/NSGC/docs/especificaciones/RG - Reglas Generales.md` — actualizar sección ST.
- `k0mp4ss_fe/apps/web/scripts/verificar-persistencia-db.ts` — script de verificación Node/Prisma.
- Validación: `tsc 0 errores`, tests unitarios verdes.

## No-alcance

- Migración de páginas UI legacy a hooks SWR (follow-up gradual, documentado en `00-plan.md`).
- Cambios en `lib/store.ts` (ya congelado en `STORE_VERSION=28`).
- Tests e2e (timeout ambiental, no relacionado con este change).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Desviación de specs vs implementación real | Validar que los endpoints referenciados existen (`ls app/api/*/route.ts`). |
| Tests legacy rojos por dependencia localStorage | Se dejaron como están (son tests del store legacy); ninguno nuevo se agregó. |

## Esfuerzo

1 ventana.
