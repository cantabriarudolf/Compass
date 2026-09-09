> **Este archivo ES tu prompt.** Ventana P1 de la serie produccion.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie produccion)

Estado previo: Compass es un proyecto Next.js 16 para gestión de comunidades edificadas. STORE_VERSION=27. Tests: 517 unit (vitest) + 86 e2e (playwright). Lint: 12 warnings. CI: GitHub Actions con unit+e2e. CD: no existe. Hosting target: Vercel. Database: SQLite dev.

Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.

Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult); mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.

Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores) && npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en openspec/SERIE-PRODUCCION/00-plan.md.

## Alcance de esta ventana (P1 — Quick wins mecánicos)

Esta ventana NO toca seguridad, BD, ni arquitectura. Es pura deduplicación mecánica con cero riesgo de regresión.

### Tarea 1: Crear `lib/date-utils.ts` y unificar `hoyISO*()`

1. Busca TODAS las funciones `hoyISO`, `hoyISOConHora`, `hoySoloFecha`, etc. en `lib/store.ts` y `lib/`.
2. Crea `lib/date-utils.ts` con un único conjunto de helpers:
   - `hoyISO(): string` → fecha en ISO (YYYY-MM-DD)
   - `ahoraISO(): string` → fecha+hora en ISO
   - `inicioMesISO(mes?: number, anio?: number): string`
   - `finMesISO(mes?: number, anio?: number): string`
3. Reemplaza TODOS los usos en `lib/store.ts` y otros archivos por imports de `lib/date-utils.ts`.
4. Elimina las funciones duplicadas del store.
5. Añade tests para `lib/date-utils.ts` (al menos 4 casos).

### Tarea 2: Adoptar `generarId()` en `lib/store.ts`

1. `lib/id-utils.ts` ya existe (creado en SERIE-REVISION). Verifica su API.
2. Reemplaza las 27+ repeticiones del patrón `crypto.randomUUID()` o `Date.now().toString(36)` en `lib/store.ts` por `generarId()`.
3. Asegúrate de que `generarId()` se importe correctamente.
4. Si hay otros archivos con el patrón duplicado (busca en `lib/`, `app/`), reemplázalos también.

### Tarea 3: Limpiar lint warnings restantes

1. Corre `cd k0mp4ss_fe/apps/web && npm run lint`.
2. Arregla los 12 warnings (o los que queden). Deben ser mecánicos: unused vars, any implícitos, etc.
3. Objetivo: `npm run lint` con 0 warnings, 0 errores.

### Tarea 4: Validación final

1. `npx tsc --noEmit` → 0 errores
2. `npm test` → 517/517 unit verdes (si falla alguno por fecha hardcodeada como pasó en SERIE-REVISION, arregla con fecha dinámica)
3. `npm run lint` → 0 warnings
4. `openspec validate --all` → sin fallos

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado: P1 HECHA/PARCIAL + motivo.
2. Commits: hash + subject y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION (sin cambio esperado), tests X/Y, tsc/eslint OK, lint warnings restantes.
5. Desviaciones vs el prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: P1 — Unificación hoyISO*() + generarId() + lint limpio (commit <hash>)`.
