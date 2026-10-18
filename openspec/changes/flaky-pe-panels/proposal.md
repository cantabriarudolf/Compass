# Proposal: flaky-pe-panels — presupuesto explícito para el flaky de PE (ventana E3 de SERIE-DEUDA-3)

## Contexto

`k0mp4ss_fe/apps/web/test/componentes/pe-panels.test.tsx` es flaky **preexistente**: ya había sido
observado en las ventanas D1 y D4 de SERIE-DEUDA-2. El caso

```text
EncomiendasPanel (componente, RTL) > retiro de encomienda: dialog exige retiradoPor y marca Retirada
```

falla por **timeout de 30 s cuando la máquina está cargada** y pasa en aislamiento y en re-corridas.
Es la **misma familia** que los dos timeouts ya corregidos en esta rama:

| Serie | Spec | Corrección |
| --- | --- | --- |
| P1 | `e2e/crud/poblado-idempotente.spec.ts` | `test.setTimeout(300_000)` |
| P7 | `e2e/crud/proyectos.spec.ts` | `test.setTimeout(120_000)` |
| **E3** | `test/componentes/pe-panels.test.tsx` | `{ timeout: PRESUPUESTO_CARGA }` por caso |

Diagnóstico: **presupuesto insuficiente bajo carga, no comportamiento**. El caso abre tres comboboxes
Radix (`Select` en jsdom) + un `Dialog`, y cada interacción de `userEvent` espera a que React termine
de re-renderizar; con la máquina ocupada ese trabajo se estira por encima del default.

## Medición de la ventana (evidencia antes/después)

| Escenario | Antes | Después |
| --- | --- | --- |
| Aislado | **4.90 s** ✓ | 5.25 s / 4.97 s ✓ |
| Carga media (2× `yes`, 2 núcleos) | **26.81 s** ✓ (al filo de 30 s) | — |
| Carga alta (16× `yes`) | **`Test timed out in 30000ms`** (31.1 s) ✗ | **67.67 s** ✓ |
| 5 hermanos del archivo bajo carga alta | 3 timers más y 1 `TestingLibraryElementError` ✗ | 7/7 ✓ |

Evidencia textual del rojo (log de la corrida bajo carga alta, pre-fix):

```text
 FAIL  test/componentes/pe-panels.test.tsx > EncomiendasPanel (componente, RTL) > retiro de encomienda: dialog exige retiradoPor y marca Retirada
Error: Test timed out in 30000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
```

## Objetivo

Declarar un **presupuesto explícito** en el propio test, alineado con el hermano que ya lo hacía
(`{ timeout: 20_000 }` en el primer caso del archivo), sin tocar el componente ni la configuración
global de Vitest.

## Decisión

- **Forma**: objeto de opciones como segundo argumento de `it` — `it("...", { timeout: PRESUPUESTO_CARGA }, async () => …)`.
  Es la forma **ya usada** en el archivo (el caso síncrono tenía `{ timeout: 20_000 }`), así que se
  alinea el criterio en vez de introducir un segundo estilo.
- **Valor**: `PRESUPUESTO_CARGA = 120_000`, **una sola constante para los 7 casos del archivo**. El
  valor 20 s del hermano **no alcanza**: bajo carga media el caso ya medía 26.8 s, o sea que alinear
  a 20 s habría empeorado el flake. El criterio queda alineado (misma forma + mismo valor en todos
  los casos) y el valor se fija donde el presupuesto sobra: 120 s cubre el peor número medido
  (67.7 s) con ~1.8× de margen.
- **Prohibido** `test.use({ timeout })`: no es un fixture válido en Vitest y **se ignora en
  silencio** (lección documentada de P7). El presupuesto que no se declare en el `it` o en
  `test.setTimeout(...)` no existe.

## Alcance

1. `test/componentes/pe-panels.test.tsx`: constante `PRESUPUESTO_CARGA` documentada + objeto de
   opciones en los **7** casos del archivo.
2. Change openspec `flaky-pe-panels` con `skip_specs: true` justificado.
3. Avance NSGC con el tiempo medido y la evidencia antes/después.

## Fuera de alcance

- **El componente y el panel**: `components/pe/encomiendas-panel.tsx`, `visitas-panel.tsx` y
  `contratistas-panel.tsx` **no se tocan**. No hay defecto real: el caso pasa siempre que el
  presupuesto alcanza (7/7 en las 3 corridas de verificación, incluida la de carga alta).
- **`vitest.config.ts`**: no se mueven los pisos globales **93/84/92/93**, `lib/**` **98/93/98/98**
  ni `app/api/**` **87/74/88/87**. El `vi.setConfig({ testTimeout: 30_000 })` del archivo queda como
  default; el presupuesto por caso lo sobrescribe.
- `STORE_VERSION = 28` congelado; `prisma/dev.db` y `Data/NSGC/backups/` intocados.

## Criterios de aceptación

- `npx tsc --noEmit` → 0 · `npm run lint` → 0 problemas · `npm test` verde con los pisos vigentes.
- **3 corridas** del archivo (2 aisladas + 1 bajo carga alta, la condición que fallaba) → **7/7 verdes
  siempre**, con tiempos registrados.
- `openspec validate --all` sin fallos · `check-delta-coverage flaky-pe-panels` sin nada que rompería
  el archive (con `skip_specs: true`).
