> **Este archivo ES tu prompt.** Ventana D4 de la serie deuda-2.
> Léelo completo (incluido `openspec/SERIE-DEUDA-2/00-plan.md`) y ejecutá sus bloques en orden.

## Contexto común (válido para TODA la serie deuda-2)

Proyecto Compass: Next 16 + TypeScript estricto + Prisma, monorepo `k0mp4ss_fe/` (app en
`k0mp4ss_fe/apps/web`). Tests: Vitest (`test/`, 1208 verdes con pisos por área) + Playwright
(`e2e/`, lanes crud/flujo/smoke/auth/a11y). Estado de partida: tip de SERIE-DEUDA-1 (`afe142a`,
apilado sobre `noche/serie-noche-3` `1b23219`): store con 7 slices, `STORE_VERSION = 28`, pisos
global **92/83/92/92** · `lib/**` **97/91/98/97** · `app/api/**` **87/74/88/87**. Tooling e2e ya
materializado por la serie anterior: `npm run e2e:fresh` (base descartable, paridad CI).
Node: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.

Método del proyecto: todo cambio → change openspec (propose → apply → archive). Antes de escribir
cualquier delta: leer `openspec/CONVENCION-DELTAS.md` y correr
`node openspec/scripts/check-delta-coverage.mjs <change>` hasta que dé `0 que romperían el archive`.
Commits convencionales en español, un commit por work-unit, automáticos al cerrar cada trabajo,
commiteando SOLO los archivos del cambio. Skill `nsgc-prepush` obligatoria antes de cada push
(avance en `Data/NSGC/docs/avances/`; manual de módulo si cambia comportamiento o estructura;
Trazabilidad si cambia un estado).

Reglas duras: `STORE_VERSION = 28` congelado; **nunca** tocar `prisma/dev.db` ni
`Data/NSGC/backups/`; nunca secretos en código ni docs; el término oficial es **comunidad**
("condominio" no se usa nunca, RG §4); **no le pidas confirmaciones al owner** (si un gate falla
dos veces: ventana BLOQUEADO con evidencia exacta y seguir).

**NO corras `git push` ni `gh pr edit`**: el harness les pide aprobación interactiva que no podés
contestar (así se colgaron 30 minutos ejecutores anteriores). Cerrá con todo commiteado y reportá
"sin pushear": el orquestador pushea, archiva y observa el CI.
**Commiteá por unidad**, no al final: si te cortás, el trabajo ya commiteado sobrevive.
Sé económico en turnos; las corridas largas van con
`nohup bash -lc '<cmd>' > /tmp/serie-deuda2-<n>-<nombre>.log 2>&1 &` + PID, esperando dentro del
mismo comando en bloques de 2-5 min. **Nunca bloquees un solo bash más de ~10 minutos** y no
poll-ees nada turno a turno.

Verificación por ventana: `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test`
(pisos por área) + `openspec validate --all` sin fallos + `check-delta-coverage` del change tocado.
e2e con paridad CI: `npm run e2e:fresh -- --no-build -- <specs>` y **nunca** corras el spec de
rate-limit antes de la lane (bloquea la IP 15 min y aborta `auth.setup`).

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` limpio y `git status -sb` sin "ahead" (todo pusheado) + `git log --oneline -8`.
2. **Fingerprint**: 7 slices en `lib/store/slices/`, `STORE_VERSION = 28`, pisos vigentes en
   `vitest.config.ts` (global 92/83/92/92 · `lib/**` 97/91/98/97 · `app/api/**` 87/74/88/87) y suite
   ≥ 1208 tests. Si falta, pará y reportá qué base encontraste.
3. **CI, archives y push los maneja el orquestador**: no poll-ees `gh`, no archives, no pushees.
4. `openspec validate --all` → sin fallos.
5. Contrastá con `openspec/SERIE-DEUDA-2/00-plan.md`: fila anterior `HECHA` → marcá la tuya
   `EN CURSO`; `PARCIAL`/`BLOQUEADO` → completá o documentá ese alcance antes del tuyo.
6. La suite completa se corre **una sola vez**, como gate al final (no al arranque).

## Alcance de D4 — `store-cobertura-fase-d`: las 6 acciones más descubiertas del store

Contexto: SERIE-DEUDA-1 P5 cubrió 57 de los 168 statements legacy de `lib/store.ts` y dejó **111**
declarados como deuda. Esta ventana paga **la mitad grande**: las 6 acciones con más statements sin
cubrir.

**Tareas**:

1. **Medí primero** (no confíes en los números de abajo, son del cierre anterior): `npm test -- --coverage`
   y usá el mapa de cobertura de abajo para obtener la lista real por acción.
2. Tests **comportamentales** contra la API pública (`useCompassStore`: acción, `StoreResult`,
   estado resultante, validaciones y errores) en `test/store-cobertura-fase-d.test.ts` (o varios
   archivos, uno por bloque). **Nunca** tests de internals ni "cubrir la línea". Molde:
   `test/store-cobertura-fase-c-legacy.test.ts`.
3. **No leas `lib/store.ts` completo** (5.219 líneas: eso mató a un ejecutor anterior). Localizá la
   acción con `grep -n` y traé **solo la zona** con `read` + `offset`/`limit`.
4. Objetivo declarado (de mayor a menor): `generarCertificadoCT` **15** `st` ·
   `distribuirReporteRE` **13** · `respaldarInfraccionIN` **8** · `desestimarInfraccionIN` **8** ·
   `saveElementoRA` **7** · `saveAdelantoPL` **6** = **57 statements**.
5. Si una rama es **inalcanzable por la API pública**, no la fuerces: anotá su línea y la causa en
   el avance y seguí con la siguiente.
6. Change openspec `store-cobertura-fase-d` (propose → apply) con delta `MODIFIED` del requirement
   "Gate de cobertura por área" en `DEV-qa-lab`, llevando **todos los escenarios vivos con sus
   nombres exactos** (leé `openspec/CONVENCION-DELTAS.md`; molde directo:
   `openspec/changes/archive/2026-10-17-store-cobertura-fase-c/specs/DEV-qa-lab/spec.md`).
7. **No toques los `thresholds`** en esta ventana: el ratchet lo hace D5 con la medición final.
8. Fila **D4 HECHA** + Bitácora + avance NSGC con la cobertura por acción antes/después.

**Gate**: `npx tsc --noEmit` 0 (corrido **después** de agregar los tests) · `npm run lint` 0 errores ·
`npm test` verde con los pisos vigentes · `openspec validate --all` sin fallos ·
`check-delta-coverage` 0 que romperían el archive.

**Archivos que podés tocar**: `k0mp4ss_fe/apps/web/test/store-cobertura-fase-d*.test.ts`,
`openspec/changes/store-cobertura-fase-d/**`, `Data/NSGC/docs/avances/**`,
`openspec/SERIE-DEUDA-2/00-plan.md`. **No** toques `vitest.config.ts` ni `lib/**`.

**Mapa de cobertura (helper que ya usa el orquestador)**: para saber qué acción contiene cada
statement sin cubrir, corré esto dentro de `k0mp4ss_fe/apps/web` (lee el reporte de la última
corrida con `--coverage`):

```bash
node -e '
const c=require("./coverage/coverage-final.json");
const k=Object.keys(c).find(k=>k.endsWith("/lib/store.ts"));
const d=c[k], lines=require("fs").readFileSync("lib/store.ts","utf8").split("\n");
const unc=[];
for(const [id,l] of Object.entries(d.statementMap)) if(!d.s[id]) unc.push(l.start.line);
const re=/^(\s{2,8})([a-zA-Z][A-Za-z0-9]*):\s*(async\s*)?\(/;
const mapa={};
for(const l of unc){ for(let i=l-1;i>=0;i--){ const m=lines[i].match(re); if(m){ (mapa[m[2]]=mapa[m[2]]||[]).push(l); break } } }
for(const [n,v] of Object.entries(mapa).sort((a,b)=>b[1].length-a[1].length))
  console.log(String(v.length).padStart(3)+" st  "+n+"  (lineas "+v[0]+".."+v[v.length-1]+")");
'
```

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Specs creadas/modificadas + changes propuestos.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de la ventana.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
