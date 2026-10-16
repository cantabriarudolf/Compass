# Proposal: fix-put-merge-scope

## Contexto

En P2 de SERIE-NOCHE-3 se registró como deuda accionable un supuesto defecto de la capa API:

> el `PUT` de la página de MT (`/api/mt/trabajos/[id]`) responde **404 "Registro no encontrado"**
> aunque la fila exista en la base, por el chequeo de scope de `lib/api/put-merge.ts:53-57`

Ese diagnóstico se guardó como deuda de la serie deuda-1 (P2) con el mandato de **reproducirlo
(RED) y arreglarlo con el cambio mínimo**. La consecuencia reportada era que el paso "Iniciar" de
`e2e/crud/proyectos.spec.ts` no llegaba a verde.

## Objetivo

1. Reproducir el 404 declarado con un test de integración en `test/api/` (Prisma real) **antes** de
   tocar código.
2. Diagnosticar la causa exacta del chequeo de scope (comunidad / param / fila) y corregir el punto
   correcto con el cambio mínimo, sin romper las guardias de scope de las otras 23 entidades que
   usan el mismo helper.
3. Dejar el comportamiento del scope clavado con tests (caso propio + caso ajeno 404/403).
4. Correr la lane e2e dirigida de MT (`e2e/crud/proyectos.spec.ts`) con paridad CI.

## Hallazgo (resumen; detalle en `design.md`)

**El defecto documentado no se reproduce.** Evidencia:

- El test de integración que encarna el escenario declarado (fila PROPIA existente + sesión de esa
  comunidad) pasa **verde desde el primer intento**: `PUT /api/mt/trabajos/[id]` → **200** con la
  fila actualizada en BD.
- El guard compara `existente.comunidadId !== scope.comunidadId`, y los **24** modelos detrás de
  `createPutMerge` declaran `id String @id` y `comunidadId` (verificado con script sobre
  `schema.prisma`): no hay ninguna entidad donde esa comparación pueda dar falso negativo.
- En la lane e2e real, el intento que falla de `e2e/crud/proyectos.spec.ts` **muere antes de
  llegar al paso "Iniciar"**: `Test timeout of 30000ms exceeded` mientras el spec rellenaba el
  formulario (el snapshot de página muestra la fila ya creada y con el botón "Iniciar" disponible).
  El reintento pasa el flujo completo, incluido el `PUT` de "Iniciar".

La causa real del rojo registrado es un **timeout de test** (30 s de presupuesto para ~40
interacciones de UI en el primer render frío del `next start`), no un 404 de scope. Es la misma
familia de defecto que P1 corrigió en `poblado-idempotente` (espera de purga), pero **no** se
arregla desde el código de producto: vive en `e2e/crud/proyectos.spec.ts` (timeout propio del
spec), archivo **fuera del alcance declarado de esta ventana**.

## Alcance

1. `k0mp4ss_fe/apps/web/test/api/put-merge-scope.test.ts` (nuevo): 4 tests de contrato con Prisma
   real — fila propia → 200 y fila mutada · fila de otra comunidad → 404 sin filtrar existencia y
   sin mutar · rol sin `mt:editar` → 403 sin mutar · id inexistente → 404.
2. Documentación de la ventana: este change + avance NSGC + fila/bitácora de `SERIE-DEUDA-1`.

## No-alcance

- **No se modifica `lib/api/put-merge.ts`**: no hay defecto que corregir y "arreglar" un guard
  correcto degradaría el aislamiento multi-tenant (riesgo de fuga cross-comunidad).
- No se toca `e2e/**` ni `playwright.config.ts` (timeout del spec): fuera del alcance declarado de
  P2. Queda como deuda reasignada (ver `tasks.md`).
- No se toca el store (`STORE_VERSION = 28` congelado), la cobertura ni los pisos de Vitest.
- No se toca `prisma/dev.db` ni `Data/NSGC/backups/`.
