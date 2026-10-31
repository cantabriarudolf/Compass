# Proposal: api-cobertura-fases — subir la cobertura real de `app/api/**` por fases

## Contexto

El change archivado `2026-10-12-ci-verde-ratchet-cobertura` re-baselineó el gate de
cobertura con ratchet por área (piso = medido − 1 pt, **nunca baja**) y dejó la deuda
escrita en su `design.md § Deuda`: la superficie API quedó en **79.40%** de statements
(2.114 sin cubrir, medida el 2026-10-12) con el piso `app/api/**` en **78/63/82/78**.

Medición real de arranque de esta fase (2026-10-15, suite **936/936** verdes, commit
`283dddc`, reporte `coverage/`): `app/api/**` = **79.45 / 64.31 / 83.64 / 79.45** con
**1.588 statements sin cubrir** de 7.726. Las carpetas más bajas de hoy (la prosa
histórica nombraba `personas`/`unidades`/`vinculos`; rige la medición vigente):

| Carpeta | Statements | Sin cubrir | % statements |
|---|---|---|---|
| `app/api/dev-dashboard` | 96 | 66 | **31.25** |
| `app/api/qa-estado` | 46 | 25 | **45.65** |
| `app/api/admin` (`usuarios` + `seed-authz`) | 161 | 87 | **45.96** |

## Objetivo

Subir la cobertura **real** de `app/api/**` en fases, con tests escritos contra la
interfaz pública (los handlers exportados), sin mocks de Prisma y sin editar handlers
para hacerlos testeables. Cada fase re-baselinea el piso `app/api/**` con la regla del
ratchet y deja documentado antes/después.

## Alcance

### Fase 1 (esta ventana — SERIE-NOCHE-3 P6)

1. Tests reales para las 3 carpetas más bajas medidas: `dev-dashboard`, `qa-estado` y
   `admin`. Por cada handler: camino feliz, validación (400) y guardias
   (401 sin sesión, 403 sin permiso, 404 por guard de entorno o scope).
2. Re-baseline del piso `app/api/**` en `k0mp4ss_fe/apps/web/vitest.config.ts`
   (medido − 1 pt; ningún piso existente baja).
3. Spec viva del ratchet de cobertura (nueva requirement en `DEV-qa-lab`), para que
   las fases siguientes tengan una capability viva que MODIFIED en cada re-baseline.

### Fase 2 (ventana P7 de la serie)

Resto de rutas bajas según la medición de P7 (candidatas de hoy: `micro-sectores`,
`ingresos-fi`, `egresos-fi`, `emisiones-gc`, `vinculos`) + segundo re-baseline.

### Fuera de alcance

- Cobertura de `lib/store/**` → change `store-cobertura-fase-b` (P8).
- Edición de handlers, exclusiones del `coverage.include` o `thresholds.autoUpdate`
  (cualquiera de las tres oculta deuda en vez de pagarla).
- Gate e2e (la fase 1 no toca comportamiento observable de la app).

## Criterios de aceptación (fase 1)

- `npx tsc --noEmit` → 0 errores; `npm test` → verde **con los pisos nuevos**;
  `openspec validate --all` → 0 fallos; `check-delta-coverage api-cobertura-fases`
  → 0 que romperían el archive.
- Evidencia numérica del salto: cobertura de `app/api/**` antes/después y por carpeta,
  en el avance NSGC de la ventana.
- `STORE_VERSION = 28` intacta; los tests restauran cualquier archivo que usen
  (`qa-estado.json` es tracked; los temporales se borran) y el worktree queda limpio.
