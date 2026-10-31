# Design: fix-put-merge-scope

## Pregunta a responder

¿Por qué el `PUT` parcial de `/api/mt/trabajos/[id]` devolvía 404 "Registro no encontrado." con la
fila existente, y qué punto hay que corregir: la comunidad del scope, el `param` de la ruta o la
fila leída de Prisma?

## Contrato que implementa `lib/api/put-merge.ts:53-57`

```ts
const existente = (await model.findUnique({ where: { id } })) as Record<string, unknown> | null
if (!existente || existente.comunidadId !== scope.comunidadId) {
  return jsonError(404, "Registro no encontrado.")
}
```

`scope.comunidadId` viene de `withComunidadScope()` (membresía en BD de la sesión, jamás del body
ni del query) y `existente.comunidadId` de la fila leída por el `id` de la URL. El 404 es la
decisión de diseño "registro de otra comunidad → 404 sin filtrar existencia" (multi-tenant
inescapable, igual que `crud-factory` PUT/POST/GET_ONE).

## Hipótesis y verificación

| # | Hipótesis | Verificación | Resultado |
|---|---|---|---|
| H1 | **comunidad**: la fila pertenece a otra comunidad que la del scope | test de integración con 2 comunidades reales (fila propia → 200; fila ajena → 404) | **falso** para el caso reportado: la fila propia da 200 |
| H2 | **param**: el `id` de `ctx.params` no coincide con lo persistido | test de integración con fila existente y `id` de la URL == PK; más `findUnique({ where: { id } })` sobre 24 modelos | **falso**: 200 con la fila existente, 404 solo con id inexistente (correcto) |
| H3 | **fila**: algún modelo detrás de `createPutMerge` no declara `comunidadId`, así que la comparación da `undefined !== scope` y todo PUT responde 404 | script sobre `prisma/schema.prisma` para los 24 modelos de las 24 routes que usan el helper | **falso**: los 24 declaran `id String @id` + `comunidadId` |
| H4 | el rojo que originó el registro es **otro** defecto, no el 404 | lane e2e real con paridad CI × 3 corridas, con el `error-context.md` de Playwright | **confirmado** (ver abajo) |

Evidencia textual de H4 (corrida 3, máquina sin carga concurrente; la 1 y la 2 fallan igual):

```
Test timeout of 30000ms exceeded.
Error: page.waitForTimeout: Target page, context or browser has been closed
  113 |     if (await dialog.isVisible().catch(() => false)) {
  114 |       await btnGuardar.click({ force: true, noWaitAfter: true }).catch(() => {})
> 115 |       await page.waitForTimeout(600)
```

El `page snapshot` adjunto al fallo muestra el trabajo **ya creado** (`QA-Trabajo-<ts>`,
"Planificado") con el botón "Iniciar" disponible: el test muere **rellenando/guardando el
formulario**, antes de llegar al paso "Iniciar" (el `PUT` que la deuda señalaba). En la corrida 1 el
reintento pasó el flujo completo (incluido "Iniciar" → 200 y badge "En Curso").

## Causa real del rojo registrado

`playwright.config.ts` fija `timeout: process.env.CI ? 30_000 : 120_000` y `e2e:fresh` corre con
`CI=1` (paridad CI) ⇒ **30 s de presupuesto para el test entero**, mientras el spec hace ~40
interacciones de UI (5 GETs de colección al abrir la página —166 unidades, 55 personas—, llenado de
7 campos, 2 diálogos y 7 `waitForTimeout`). El spec declara `test.use({ actionTimeout: 30_000 })`,
que no levanta el timeout del *test*. Resultado: rojo por presupuesto, no por comportamiento.

Es la misma **familia** de defecto que P1 corrigió en `poblado-idempotente` (espera de purga de
30 s → 120 s), pero con otra mecánica: allí era un `expect` interno; acá es el timeout del test.

## Decisión

1. **No se toca `lib/api/put-merge.ts`.** El guard es correcto y necesario: "arreglarlo" para que
   no devuelva 404 sería degradar el aislamiento multi-tenant (fuga cross-comunidad). El cambio
   mínimo correcto sobre este componente es **ninguno**.
2. **Se agrega red de seguridad** (`test/api/put-merge-scope.test.ts`) que clava el contrato
   observado: fila propia → 200 con mutación real en BD; fila de otra comunidad → 404 con el mismo
   mensaje que un id inexistente y sin mutar; rol sin `mt:editar` sobre fila propia → 403 sin mutar;
   id inexistente → 404.
3. **La deuda accionable se reasigna**: `e2e/crud/proyectos.spec.ts` necesita
   `test.use({ timeout: 120_000 })` (o el timeout de CI alineado), archivo **fuera del alcance de
   P2**. Queda declarada con la evidencia exacta para P7 (cierre de serie: auditoría integral + e2e
   final) o para quien aborde la deuda de tooling e2e.

## Por qué no se "arregla" el spec acá

Reglas duras de la serie: "Alcance cerrado: cada ventana toca solo los archivos que declara su
prompt" (`00-plan.md` § Reglas duras 12) y el prompt-02 lista sus archivos permitidos. Tocar `e2e/**`
o `playwright.config.ts` excede el alcance declarado y contamina la atribución del cambio; se
documenta y se escala.
