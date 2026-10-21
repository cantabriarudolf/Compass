# Ventana V5 — Cierre de la serie: gates, documentación y deuda restante

**ARRANQUE**: leé `openspec/SERIE-DEUDA-6/00-plan.md` completo y verificá que V1–V4 estén **HECHAS**.
Marcá tu fila **EN CURSO**.

**Rama**: `noche/deuda-6`. Prohibido `git push`, `gh`, merge, PR y `openspec archive`.

## Alcance

Cierre documental y verificación. **No implementa funcionalidad nueva.**

## Pasos

1. **Auditoría de la serie**: `git log --oneline main..HEAD` y `git diff --stat main...HEAD`. Confirmá
   que solo se tocaron los archivos de las ventanas y que no hay cambios fuera de alcance.
2. **Gates completos** (una corrida cada uno, salidas exactas en el retorno):
   - `npx tsc --noEmit` → 0 errores
   - `npm run lint` → 0 problemas
   - `npm test` → verde con los pisos vigentes; reportá la cobertura global, `lib/**` y `app/api/**`
     comparada con la base (94.31 / 85.99 aprox. → reportá los números reales, no los copies)
   - `node openspec/scripts/check-delta-coverage.mjs ui-legacy-store-fase1` → `0 que romperían el archive`
   - `npx openspec validate --all` → passed/total
3. **Censo final del store legacy**: `grep -rn "useCompassStore" app/ | wc -l` y la lista de archivos.
   Compará contra la base de la serie (13 archivos / 147 usos) y reportá el delta real por archivo.
4. **Documentación**:
   - `openspec/BACKLOG-100.md` §"Deuda viva verificada (2026-10-21)": actualizá el mapa de migración con
     lo efectivamente migrado, y dejá explícita la **deuda fase 2** (transiciones PE, entregar/resolver
     IR, reportes RE, adelantos PL, cobranza FI, publicar acta en CV) con su motivo (requieren endpoints
     nuevos con contrato de negocio).
   - `Data/NSGC/docs/avances/avance - 2026-10-21 <HH-MM>.md` con el formato de los avances existentes:
     resumen, hitos por ventana con commits, gates con números, deuda restante, próxima acción.
   - Si cambió una fila de estado en la Trazabilidad NSGC, actualizala; si no, decilo explícitamente.
5. **Cerrar el 00-plan**: todas las filas con su commit final y una entrada de Bitácora por ventana.
6. **NO archivar** el change (`ui-legacy-store-fase1` queda aplicado y validado): el archive exige CI
   verde observado y esta serie no pushea. Dejalo anotado en el retorno.
7. **Tests**: no corresponde agregar tests en una ventana de cierre; si un gate falla, arreglá solo lo
   necesario para el verde y declará el cambio.

## Retorno

Tabla final del 00-plan · commits de la serie · gates con salidas y cobertura real · censo antes/después
de `useCompassStore` por archivo · deuda fase 2 declarada · qué quedó fuera y por qué · confirmación de
que no se pusheó ni se archivó.
