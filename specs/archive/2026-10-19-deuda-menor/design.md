# Design: deuda-menor

## 1. El último warning de lint — `useIsMobile`

### Decisión

`useSyncExternalStore` con tres piezas:

```ts
function suscribirAlViewport(onCambio: () => void) {      // subscribe
  const mql = window.matchMedia(CONSULTA_VIEWPORT)
  mql.addEventListener("change", onCambio)
  return () => mql.removeEventListener("change", onCambio) // cleanup, idéntico al anterior
}

function leerViewport() { return window.innerWidth < MOBILE_BREAKPOINT }  // getSnapshot
function leerViewportEnServidor() { return false }                        // getServerSnapshot

export function useIsMobile() {
  return React.useSyncExternalStore(suscribirAlViewport, leerViewport, leerViewportEnServidor)
}
```text

El warning (`react-hooks/set-state-in-effect`) existe porque el efecto hacía `setIsMobile(...)`
sincrónico en el cuerpo: React lo lee como "sincronizar estado con un sistema externo por
render", con un render en cascada garantizado en el primer montaje. `useSyncExternalStore` es
exactamente el mecanismo para ese caso: no hay estado propio ni `setState`, hay **lectura** del
sistema externo (`matchMedia` + `window.innerWidth`) y una **suscripción** con cleanup.

### Equivalencia observable (la parte que había que preservar)

| Aspecto | Antes (`useState` + `useEffect`) | Ahora (`useSyncExternalStore`) |
| --- | --- | --- |
| Valor inicial en el cliente | `undefined` → `!!undefined` = `false`, y el efecto lo corrige | `getSnapshot()` desde el primer render |
| Valor inicial en SSR/hidratación | `false` (no hay `window`) | `getServerSnapshot()` = `false` |
| Reacción al viewport | listener `change` del media query + `window.innerWidth < 768` | idéntico |
| Cleanup | `mql.removeEventListener("change", onChange)` | idéntico |
| Tipo devuelto | `boolean` (por `!!isMobile`) | `boolean` |

El único matiz: en un render **solo cliente** (sin SSR) el primer valor ya es el real en vez de
`false`, porque `getSnapshot()` lee el viewport en el render en lugar de esperar al efecto. Es el
efecto de la mecánica correcta —el mismo camino que hace la hidratación de Next después de
montar—, no un cambio de contrato: en SSR el HTML sigue siendo `false` y en el cliente el valor
termina siendo el del viewport, igual que antes. Queda fijado por el test (incluido el snapshot
de servidor con `renderToString`).

### Alternativas descartadas

- **`eslint-disable` de la regla**: prohibido por el prompt, y además oculta un problema real
  (render en cascada en cada montaje del sidebar).
- **Mantener el `useState` y sacar el `setState` del efecto**: el hook quedaría pegado en `false`
  en mobile hasta el primer evento `change` — cambio de comportamiento observable.
- **`useEffect` con `setIsMobile` en un callback de `requestAnimationFrame`/`queueMicrotask`**:
  esquiva el warning sin resolver el problema (sigue habiendo estado redundante) y agrega un
  frame de parpadeo.
- **`matchMedia().matches` en lugar de `window.innerWidth`**: cambiaría el valor en el borde
  exacto del breakpoint y en zooms; el contrato del hook es `window.innerWidth`.
- **Snapshot de servidor `true`**: rompe la equivalencia con el `false` inicial histórico y
  produciría mismatch de hidratación en el sidebar.

## 2. Robustez de los 4 CLIs

Criterio común: **mismo contrato, mejor error**. Cuando todo está bien, ningún script cambia lo
que hace. Con input inválido, el mensaje dice **qué archivo/qué falta/qué paso**, no un
`ENOENT`/`Unexpected token` pelado, y el proceso sale con **exit code ≠ 0**. Nada de
`eslint-disable` y nada de `try/catch` que se trague el error.

### `restore-db.mjs:84` — `JSON.parse` del manifest

El `main().catch` ya existía (`restore:db FALLO: <message>` + `exit 1`), así que el problema era
la **calidad** del mensaje: `Unexpected token } in JSON at position 30` no dice qué backup está
roto. Ahora:

- `try/catch` alrededor del `JSON.parse` que agrega la ruta relativa del manifest y el motivo.
- Chequeo de forma del manifest (`databaseUrlFile` string y `counts` objeto): sin él, un manifest
  `{}` explotaba más adelante con un `ERR_INVALID_ARG_TYPE` de `path.join` (stack sin contexto).
  El mensaje dice qué campos faltan.

### `deploy-migrar-datos.mjs:64` — `execSync`

La trampa del prompt: el `execSync` vive dentro de `correr()` con `stdio: "inherit"`, así que el
output real de `prisma` **ya se imprime** en el terminal (incluido `P1001: Can't reach database
server`). Lo que agregaba ruido era el `Command failed: npx prisma db push` del mensaje final. El
`try/catch` propio de `correr()` agrega solo el contexto útil (qué paso del corte falló) y
re-lanza: el `catch` externo sigue imprimiendo el mensaje y saliendo con `exit 1`. No se
reemplaza la causa ni se silencia el output de la herramienta.

### `security-recheck.mjs:21` y `check-headers.mjs:14` — `new URL(import.meta.url)`

`new URL(import.meta.url).pathname` **no decodifica** la URL: con un espacio en la ruta, el
`.pathname` viene como `%20` y `WEB_ROOT` queda apuntando a un directorio inexistente.
Verificado en la ventana (copia del script en `/tmp/f2 cli.<rand>/`):

- **antes**: `security-recheck` imprimía **5 FAIL** (`falta MAX/413…`) sobre un `WEB_ROOT`
  fantasma; `check-headers` imprimía dos `Error leyendo … '/tmp/f2%20cli…'` y terminaba con
  `=== FIN check:headers — estáticos OK ===` y **exit 0** (falso verde: no verificó nada).
- **después**: `fileURLToPath(import.meta.url)` (mismo mecanismo que ya usaba `restore-db.mjs`)
  + guarda de precondición: si en la raíz resuelta no hay `package.json`, el script nombra el
  directorio y sale con `exit 1`.

La guarda existe porque la resolución de `import.meta.url` es el punto donde la ruta podía quedar
mal sin que nada lo notara: hoy el CLI aborta nombrando lo que falta en lugar de reportar checks
contra una ruta que no existe. El happy path (corrido desde `apps/web`) queda idéntico
(`security-recheck`: 5/5 OK exit 0; `check-headers`: mismos headers y exit 0).

## Riesgos

- **Hidratación del sidebar**: el snapshot de servidor `false` es el mismo valor inicial de antes,
  así que el primer HTML no cambia, y el test lo fija con `renderToString`.
- **jsdom sin `matchMedia`**: el test lo instala con listeners controlables (`vi.stubGlobal`), así
  que la reacción se prueba de verdad, no por omisión.
- **CLIs de operación**: los 4 scripts se corrieron en la ventana (happy path y caso inválido); los
  caminos destructivos (`restore:db` con `--yes` sobre la BD real, `db push` contra una PG real)
  **no** se ejecutan: la evidencia de `restore:db` usa un esqueleto temporal con `openspec/` +
  `Data/NSGC/backups/` falsos, y la de `deploy-migrar-datos` un `DATABASE_URL` PG inalcanzable
  (`127.0.0.1:9`), que falla en 5.7 s sin tocar bases.
