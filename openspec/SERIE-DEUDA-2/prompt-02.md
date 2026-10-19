> **Este archivo ES tu prompt.** Ventana D2 de la serie deuda-2.
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

## Alcance de D2 — `am-emisores-1`: tres emisores de auditoría del lado servidor

Contexto: al podar las acciones del store cliente en `store-cleanup` (noche-3), varios eventos de
auditoría quedaron **sin emisor**. El proyecto **ya tiene el patrón**: 13 rutas crean
`prisma.eventoAuditoria` a mano. Ejemplo canónico en
`k0mp4ss_fe/apps/web/app/api/fondos-fi/[id]/retirar/route.ts` (~línea 155):

```ts
await prisma.eventoAuditoria.create({
  data: {
    id: generarId("ev"),
    comunidadId: scope.comunidadId,
    timestamp: new Date().toISOString(),
    usuario: scope.usuarioId,
    categoria: "FI",
    // ...tipoAccion y descripción del hecho
  },
})
```

**Tareas** (un emisor por vez, con su test y su commit):

1. **`CF_UPDATE_PARAM`** en el `PUT` de `app/api/configuracion/route.ts` (~línea 46): emitir cuando
   cambien los parámetros legales de remuneraciones (`ufMensual`, `ingresoMinimoMensual`,
   `topeGratificacionLegal`, `tasaSIS`), **incluyendo old/new**, conforme al requirement
   "Auditoría CF_UPDATE_PARAM de parámetros legales" de
   `openspec/specs/ST-capa-datos-persistente/spec.md`, que ya describe el contrato.
2. **`FI_INGRESO_REGISTRADO`** en el `POST` de `app/api/ingresos-fi/route.ts`.
3. **`GD_PERIODO_REGISTRADO`** en el `POST` de `app/api/periodos-directiva/route.ts`.

Reglas: **leé la ruta real antes de tocarla** (el handler puede no llamarse como sugiere el evento);
reusá el patrón existente y **no inventes un helper nuevo** en esta ventana; en cada caso agregá el
test de integración en `test/api/` que afirme que el evento se crea con el `tipoAccion` y la
`categoria` correctos, **y que no se crea cuando la operación falla** (400/403).

**Gate**: `npx tsc --noEmit` 0 · `npm run lint` 0 · `npm test` verde con los pisos vigentes ·
`openspec validate --all` sin fallos · `check-delta-coverage` del change · cobertura sin re-baseline
(si sube, anotalo pero **no** toques los pisos en esta ventana).

**Archivos que podés tocar**: `app/api/configuracion/**`, `app/api/ingresos-fi/**`,
`app/api/periodos-directiva/**`, `test/api/**`, `openspec/changes/am-emisores-1/**`,
`openspec/specs/**` (solo si un delta lo exige), `Data/NSGC/docs/avances/**`,
`openspec/SERIE-DEUDA-2/00-plan.md`.

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. Ventana y estado (HECHA / PARCIAL / BLOQUEADO + motivo).
2. Commits (hash + subject) y confirmación de que **NO** pusheaste.
3. Specs creadas/modificadas + changes propuestos.
4. Números: tests X/Y, tsc/eslint OK, y las métricas propias de la ventana.
5. Desviaciones vs este prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`
