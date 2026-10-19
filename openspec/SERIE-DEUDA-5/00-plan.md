# Serie Deuda 5 — Integrar noche-2 y dejar el repositorio limpio

> Toda ventana DEBE leer este archivo al iniciar, marcar su fila **EN CURSO** y actualizarla antes de
> cerrar. **Modo**: delegado con workers desde el chat orquestador. El orquestador pushea, mergea,
> observa el CI y hace la limpieza final.

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| G1 | `noche-2-conflictos` — traer `main` a `noche/serie-noche-2` y resolver los conflictos preservando ambos lados | pendiente | — |
| G2 | `higiene-final` — auditar los 4 changes activos del owner y cerrar la serie | pendiente | — |

**MÁXIMO: 2 ventanas.** Lo que no entre se declara como deuda post-serie en G2.

## Prerrequisito de base

- **Dos líneas de trabajo**:
  - **`main`** = `e15d7bd`: cuatro series de deuda cerradas (27 ventanas), CI verde observado.
  - **`noche/serie-noche-2`** = `733a911` (local y remoto): **46 commits** de trabajo **no integrado**,
    con PR #1 abierto y hoy **`CONFLICTING`** (4 conflictos) porque `main` avanzó.
- **Fingerprint de `main`**: pisos global **93/84/92/93** · `lib/**` **98/93/98/98** · `app/api/**`
  **87/74/88/87** · 7 slices · `STORE_VERSION = 28` · suite **1309** (129 archivos) · `eslint` **0
  problemas** en `apps/web` y en `packages/ui`.
- **El conflicto es de intención**, no de texto: `main` tiene las políticas ya decididas (base
  descartable en `ci.yml`, purga de 120 s en `poblado-idempotente`, prosa de specs sin las 28
  acciones podadas) y noche-2 tiene su funcionalidad propia (purga bulk QA-Lab, higiene e2e,
  `prisma generate`, `au-google-provider-disabled`). La resolución debe conservar **las dos**.

## Reglas duras

1. **G1 trabaja en la rama `noche/serie-noche-2`**; G2 y el cierre, en la rama que corresponda.
   Prohibido pushear a `main` desde un worker: el merge lo hace el orquestador con autorización del
   owner.
2. **Un commit por work-unit**, en español, commiteando solo los archivos del cambio.
3. **Método openspec** + `check-delta-coverage` en 0 para cada change tocado.
4. **`nsgc-prepush`** antes de cada push (avance en `Data/NSGC/docs/avances/`).
5. **El orquestador pushea, mergea, observa el CI y limpia.** Los workers **nunca** corren `git push`
   ni `gh` que escriba.
6. **`STORE_VERSION = 28` congelado**; **nunca** tocar `prisma/dev.db` ni `Data/NSGC/backups/`.
7. **Nunca secretos**; el término oficial es **comunidad** (RG §4).
8. **Gate por ventana**: `tsc` 0 · `lint` 0 problemas (app y `packages/ui`) · `npm test` verde con los
   pisos · `openspec validate --all` sin fallos · `check-delta-coverage` ok.
9. **Gate falla dos veces** → BLOQUEADO con evidencia exacta, commit de lo sano (o `git merge --abort`
   si es un merge a medias) y seguir.
10. **Nunca el spec de rate-limit antes de la lane e2e** (bloquea la IP 15 min).

## Base de hechos (lo que queda por saldar)

- **PR #1 (`noche/serie-noche-2`)**: 46 commits, 95 archivos (+3.572/−444), hoy `CONFLICTING`. Los
  archivos en conflicto son exactamente los puntos donde ambas líneas se tocan:
  `.github/workflows/ci.yml`, `e2e/crud/poblado-idempotente.spec.ts`, `openspec/BACKLOG-100.md`,
  `openspec/specs/DEV-qa-lab/spec.md`, `openspec/specs/PE-personal-servicios/spec.md`,
  `openspec/specs/ST-capa-datos-persistente/spec.md` y las specs de AU/EF/LAB.
- **4 changes activos del owner** (anteriores a esta serie): `a11y-p3-reservas-recursos`,
  `au-google-sso`, `e2e-higiene-determinismo`, `e2e-rojos-flujo-a11y-smoke`. Los dos de e2e **pueden
  haber quedado obsoletos** con lo que se arregló en las series de deuda; G2 los audita y recomienda,
  **sin tocarlos**.
- **Backups viejos de `dev.db`** en `prisma/` (7 archivos, ~38 MB, del 20-Sep y 5-Oct). **Ningún
  script los referencia** (verificado): son snapshots manuales. La limpieza la hace el orquestador.
- **Deuda que NO se paga (decisión de diseño)**: el techo de **99.95 %** de cobertura del store por
  API pública (`lib/store.ts:4323` y `:5131`), documentado en deuda-2 y deuda-3.

## Bitácora
(cada ventana agrega su entrada ANTES de que el orquestador pushee: `- [fecha] G<n> HECHA: resumen (commits)`)
