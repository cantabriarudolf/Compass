# Design: e2e-guard-optin-ci

## Contexto

`isWriteApiEnabled()` (`k0mp4ss_fe/apps/web/lib/env-guard.ts`) es el candado único de las
APIs de escritura dev/QA (`/api/qa-lab/purga-test`, `/api/backup`, `/api/dev-dashboard`, …).
Desde el endurecimiento de SERIE-PRODUCCION P2 exige `NODE_ENV=development|test` Y
`getAppEnv() === "development"`. La lane e2e corre el build de producción (`next start` →
`NODE_ENV=production` fijado por el build), por lo que el guard queda apagado aunque el job
CI setee `NEXT_PUBLIC_APP_ENV=development`: `limpiar()` cae al fallback O(n) por entidad y
la limpieza de cola de `poblado-idempotente.spec.ts`/`ciclo.spec.ts` supera los 120 s
estrictos en el runner (CI rojo determinista, run 38396862941, 3/3 intentos).

## Decisión (owner, 2026-10-13): opt-in con doble candado

`isWriteApiEnabled()` pasa a aceptar un opt-in explícito `E2E_ALLOW_WRITE_APIS=1`:

```ts
export function isWriteApiEnabled(): boolean {
  const nodeEnv = process.env.NODE_ENV ?? ""
  const runtimeDev = nodeEnv === "development" || nodeEnv === "test"
  if (runtimeDev && getAppEnv() === "development") return true
  // Doble candado: el opt-in NO basta; el entorno efectivo de la app debe
  // seguir siendo development (NEXT_PUBLIC_APP_ENV/APP_ENV).
  return process.env.E2E_ALLOW_WRITE_APIS === "1" && getAppEnv() === "development"
}
```

Semántica resultante (doble candado):

| NODE_ENV    | getAppEnv()    | E2E_ALLOW_WRITE_APIS | resultado                     |
|-------------|----------------|----------------------|-------------------------------|
| development | development    | (cualquiera)        | true                          |
| test        | development    | (cualquiera)        | true                          |
| production  | development    | `1`                  | **true** (lane e2e)           |
| production  | development    | (sin opt-in)         | false                         |
| production  | production     | `1`                  | **false** (producción intacta) |
| development | production     | (cualquiera)        | false                         |

### Por qué doble candado y no solo el opt-in

El opt-in por sí solo significaría que **cualquier** deploy que setee la variable habilita
escrituras, incluida producción. Con el segundo candado (`getAppEnv() === "development"`),
un deploy en Vercel con `NEXT_PUBLIC_APP_ENV=production` (o `APP_ENV=production`) sigue
bloqueado aunque alguien setee `E2E_ALLOW_WRITE_APIS=1` por error: el entorno efectivo de
la app manda. El valor del opt-in debe ser exactamente `"1"` (no truthy genérico) para que
`E2E_ALLOW_WRITE_APIS=true` u otros valores no cuenten.

### Riesgo aceptado (documentado, decisión owner)

Un deploy con **ambas** condiciones (`NEXT_PUBLIC_APP_ENV=development` Y
`E2E_ALLOW_WRITE_APIS=1`) expondría las APIs de escritura en un proceso con
`NODE_ENV=production`. Es el mismo riesgo de misconfig que ya existía para
`getAppEnv()`-solo antes de P2, ahora con una variable adicional que ningún deploy real
debe setear. Mitigaciones: (1) el opt-in NO se documenta en `.env.example` como default
recomendado; (2) el runbook advierte explícitamente que producción no debe setearlo; (3) el
solo job `e2e` del CI lo cablea; (4) los re-chequeos D-iii (`APP_ENV=production` → 404)
siguen cubriendo el caso de producción.

## Cableado en CI

Solo el job `e2e` de `.github/workflows/ci.yml` (junto a `NEXT_PUBLIC_APP_ENV:
development` que ya setea): `E2E_ALLOW_WRITE_APIS: "1"` con comentario explicando que es
exclusivo de la lane de pruebas porque el build de producción (`next start`) fija
`NODE_ENV=production` y sin el opt-in `limpiar()` cae al fallback O(n) y revienta los 120 s.
Los demás jobs (`unit`, `e2e-rate-limit`, `deploy`) no lo setean.

## Evidencia de que el camino bulk se ejercita

Corrida local con paridad CI (build de producción + `CI=1` + los mismos env del job):
11/11 specs verdes en 4.9 min sobre `perf-saneo.db` descartable. La limpieza de cola
pasó por el camino bulk, no por el fallback, por tres evidencias convergentes:

1. **Timeout estricto de 30 s**: el test "cancelar en el dialog no muta nada" cierra con
   `toBeVisible({ timeout: 30_000 })` sobre `TEST-* limpio correctamente` después de un
   poblado completo; el fallback O(n) medido en `qlab-purga-bulk` fue ~59 s/63 requests
   (no cabe en 30 s), el bulk ~4 s (cabe holgado).
2. **Duración total del test**: 31.3 s para goto + limpieza + poblado completo 22/22 +
   diálogo + limpieza final; imposible con dos purgas fallback (~59 s cada una).
3. **El opt-in llegó al proceso `next start`**: inspección del bundle
   (`.next/server/chunks`): el guard queda como lookup en runtime
   (`"1"===process.env.E2E_ALLOW_WRITE_APIS && getAppEnv()==="development"`); solo
   `NEXT_PUBLIC_*` se inlinea a build (comportamiento P2 pre-existente). Por eso el
   doble candado de la parte `getAppEnv()` se valida en los tests unitarios (18/18)
   y no por curl contra el server: `proxy.ts` responde 401 a `/api/*` sin sesión ANTES
   del guard de la ruta, por lo que un curl sin cookie no distingue 404 de 401.

### Carreras de estado stale expuestas por el camino bulk (fix en specs)

La primera corrida con el opt-in quedó 9/11: dos specs fallaron por carreras de timing
que el fallback lento (~60 s) mascaraba y el bulk rápido (~4 s) expone: (1)
`poblado-idempotente.spec.ts` matcheaba "Carga completa OK"/tarjetas STALE de la corrida
1 mientras `limpiar()` (invocado por "Limpiar y poblar") reseteaba el reporte en
segundo plano; (2) el helper `clickPoblar` de `ciclo.spec.ts` auto-confirma el diálogo
del guard (diseñado para "restos de una corrida caída") y su detector de efecto lee
"🟢 Listo" que la corrida 1 ya dejó en la página, consumiendo el diálogo que el test
necesita vivo para probar Cancelar. Fixes mínimos: punto de sincronía (tarjetas → 0)
tras confirmar, y click crudo sin helper para la segunda corrida. Re-corrida: 11/11.

## Alternativas descartadas

- **Bajar el timeout de las limpiezas o volver best-effort**: tapa el síntoma; la lane
  quedaría sin validación estricta de la purga (regresión de `qlab-purga-bulk`).
- **Correr la lane con `next dev`**: paridad rota con producción (el job se llama
  "build producción" a propósito) y más flakiness por compilación bajo demanda.
- **Opt-in sin el candado de `getAppEnv()`**: expondría escrituras en cualquier deploy
  que setee la variable; inaceptable para producción/Vercel.

## Migration / Rollout

1. Deploy del guard + CI juntos (mismo PR): la lane vuelve verde sin tocar specs e2e.
2. Producción no requiere acción: con `NEXT_PUBLIC_APP_ENV=production` el comportamiento
   es idéntico al de hoy.
3. Rollback: quitar `E2E_ALLOW_WRITE_APIS` del job CI y/o revert del commit del guard;
   ningún dato ni spec e2e depende del opt-in para su validez.
