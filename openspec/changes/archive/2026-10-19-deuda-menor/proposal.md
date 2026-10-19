# Proposal: deuda-menor — el último warning de lint y la robustez de 4 CLIs (ventana F2 de SERIE-DEUDA-4)

## Contexto

Al cerrar SERIE-DEUDA-3 (ventana E1, change `lint-warnings-cero`) quedaron **declaradas y no
forzadas** dos deudas chicas, porque las dos cambiaban comportamiento o excedían el alcance
cerrado de esa ventana:

| Deuda | Ubicación | Qué pasaba |
| --- | --- | --- |
| **1** warning de lint | `k0mp4ss_fe/packages/ui/src/hooks/use-mobile.ts:14` | `react-hooks/set-state-in-effect`: el hook usaba `useState` + `useEffect` y hacía `setState` **sincrónico dentro del efecto** |
| **4** hallazgos de robustez | `apps/web/scripts/{restore-db,deploy-migrar-datos,security-recheck,check-headers}.mjs` | llamadas sin manejo de error: `JSON.parse` del manifest (`restore-db:84`), `execSync` (`deploy-migrar-datos:64`) y `new URL(import.meta.url)` (`security-recheck:21`, `check-headers:14`) |

Es la última deuda de la serie `deuda-4`, que desbloquea el merge final del PR #3.

## Objetivo

1. `npm run lint` del monorepo con **0 problemas** también en `packages/ui`, sin `eslint-disable`
   y **sin cambiar el comportamiento observable** de `useIsMobile` (mismo valor inicial, misma
   reacción al cambio de viewport, mismo cleanup).
2. Los 4 CLIs fallan **claro** (mensaje que dice qué falta o qué está mal) y con **exit code ≠ 0**
   ante un input inválido, **sin cambiar lo que hacen cuando todo está bien** ni agregar
   funcionalidad.

## Alcance

1. **`packages/ui/src/hooks/use-mobile.ts`**: reescritura del hook con `useSyncExternalStore`
   (lectura pura del viewport + suscripción al media query), con snapshot de servidor `false`
   —el valor inicial histórico del hook (`useState(undefined)` → `!!undefined === false`)—.
2. **Test de fijación** en `apps/web/test/use-mobile.test.tsx`: valor inicial mobile/desktop,
   reacción al `change` del `matchMedia` en ambos sentidos, cleanup al desmontar (listener
   removido) y snapshot de servidor.
3. **`restore-db.mjs`**: el `JSON.parse` del manifest nombra el archivo y el motivo, más un
   chequeo de forma (`databaseUrlFile` + `counts`) con mensaje explícito de lo que falta.
4. **`deploy-migrar-datos.mjs`**: `correr()` envuelve el `execSync` agregando qué paso del corte
   falló, dejando pasar el output real de la herramienta (`stdio: "inherit"`) y su causa.
5. **`security-recheck.mjs`** y **`check-headers.mjs`**: `new URL(import.meta.url).pathname` →
   `fileURLToPath(import.meta.url)` (decodifica la URL) + guarda de precondición que aborta con
   mensaje claro si la raíz resuelta no es la app.
6. **Change openspec** (este) con `skip_specs: true` justificado + **avance NSGC** con la tabla
   antes/después del warning y de los 4 CLIs.

## Fuera de alcance

- **Datos y store**: `STORE_VERSION = 28` congelado; sin cambios de dominio.
- **Comportamiento de UI**: el hook devuelve exactamente lo mismo que antes para cada viewport; el
  cambio es de mecánica (misma lectura `window.innerWidth < 768`, misma suscripción al media
  query), no de contrato.
- **CLIs cuando todo está bien**: el happy path de los 4 scripts se mantiene (mismos pasos, misma
  salida, mismos exit codes de éxito).
- **Baches preexistentes** de los archivos tocados: los avisos de análisis estático que no son los
  4 hallazgos (p. ej. `copyFileSync`/`rmSync` en `restore-db.mjs`, `fetch` en `check-headers.mjs`,
  `mod.default.headers()` en `check-headers.mjs`) quedan como están.
- El techo de cobertura **99.95 %** del store (2 ramas defensivas): decisión argumentada de
  `deuda-3`, no se paga.
