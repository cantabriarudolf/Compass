> **Este archivo ES tu prompt.** Ventana P1 de la serie E2E-SIN-GATED.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie E2E-SIN-GATED)

Estado previo: GATED-API-BD P5 PARCIAL — STORE_VERSION 28, unit 85/835, tsc 0,
lint 0 errores, no-GATED 88/89+2 skip, GATED 4/4, validate 41/7 sin-deltas;
main local ahead 19, resguardo en `resguardo/serie-gated-api-bd`. 5 specs con
setup API duplicado: `e2e/crud/pagos|certificados|portal|remuneraciones.spec.ts`
+ `e2e/flujo/poblamiento.spec.ts`. Tag GATED sin significado (tests ya
independientes del orden). Lanes intactos: solo se unifica setup y se elimina
el tag, NO se fusionan specs.
Método del proyecto: por cada cambio → openspec-propose → implementar con
openspec-apply-change → validar → commitear (conventional español) → sincronizar
specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de
cualquier push.
Reglas permanentes: dato de dominio solo vía API REST con scope `comunidadId`
(`withComunidadScope`); mocks de `data/` son solo seed; D1 media por referencia;
secretos jamás en localStorage ni código; cada cambio de esquema Prisma =
migración + tests. Terminología RG §4: "comunidad" (nunca "condominio").
Cuentas TEST (`Test1234!`, comunidad-a): 7 cuentas `*@test.cl`. Seed:
`npm run e2e:reseed-base` + `e2e:higiene -- --apply`. Comandos con
`workdir k0mp4ss_fe/apps/web`. Playwright gestiona el dev server (no levantar
manual). `next build` puede fallar por red (Google Fonts): ignóralo salvo
ventana de deploy. Si tu contexto se agota: cierra la tarea en curso + commit +
deja el estado exacto en `openspec/SERIE-E2E-SIN-GATED/00-plan.md`.

## Alcance P1 — Helper compartido + migrar 5 specs

Eres la primera ventana: marca tu fila EN CURSO en `00-plan.md`.

1. Partí de reseed limpio. Relevá el setup duplicado en los 5 specs: qué
   entidades crea cada uno vía `page.request` (unidad, persona, vínculo, cobro,
   publicación, trabajador+ficha, liquidación...) y qué limpia al final.
2. Crea `e2e/helpers/datos-test.ts` con funciones `crear*TEST` / `limpiar*TEST`
   por entidad (ids `TEST-*` únicos por llamada o por test, patrón ya usado en
   los specs; cleanup idempotente que no falle si falta la fila). Unit tests
   del helper solo si aportan sin BD (puro builder) — no inventes cobertura.
3. Migra los 5 specs al helper, uno por vez, corriendo cada spec tras migrarlo.
   Comportamiento idéntico (mismos asserts, mismos flujos UI); solo cambia de
   dónde sale el setup. Si un spec necesita algo que el helper no cubre,
   extendé el helper, no dupliques.
4. Change openspec `e2e-helper-datos-test` (propose → apply → abierto, archiva
   el cierre) con deltas en los specs e2e que correspondan.
5. Valida: los 5 specs verdes + suite unit completa + tsc 0 + lint 0 errores +
   `openspec validate --all` (contrastá con 41/7). 0 residuos TEST en BD tras
   las corridas (verificá como hizo P1 GATED-API-BD).
6. Commit (conventional español), sin push (solo rama resguardo al cierre si el
   orquestador lo indica; por defecto NO pushees). Actualiza fila P1 y Bitácora.

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo). 2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados. 4. Números finales: STORE_VERSION,
   specs x/y, unit x/y, tsc/eslint OK. 5. Desviaciones vs el prompt.
6. Pendientes fuera de la serie (decisiones del owner).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
