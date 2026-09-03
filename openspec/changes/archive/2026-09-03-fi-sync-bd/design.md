# Design — fi-sync-bd

## Context

El patrón espejo BD ya está probado en auditoría (SERIE-FRONTERA P2/P3, `1882e98`/`a9cd1b7`): API `POST /api/auditoria/sync` (upsert idempotente, `resolverComunidadId` por header/query con validación de membresía, MAX_BATCH 500, persiste item por item contando éxitos) + cliente `lib/auditoria-sync.ts` (delta con Set de ids, debounce 2s, guard 401) + lectura paginada `GET /api/auditoria`. El store FI (STORE_VERSION 27) ya tiene el punto cero completo en localStorage: `fondosFI` (con `saldoInicial`), `egresosFI` (226 con el seed histórico), `ingresosFI` (44 del punto cero). El esquema Prisma ya modela `FondoFI`/`EgresoFI` pero sin `saldoInicial`, y no existe `IngresoFI`.

## Goals / Non-Goals

**Goals**
- Espejo BD de fondos, egresos e ingresos FI con verificación de integridad del punto cero (totales BD == totales store).
- Reutilizar el patrón auditoría sin generalizarlo (no framework de sync genérico).
- Suite existente 481/481 Vitest + e2e queda verde.

**Non-Goals**
- La UI de `/finanzas` NO pasa a leer BD (el store sigue siendo fuente; eso sería una fase 2 estilo `am-logs-bd`).
- No se sincronizan `cobrosFI`, `emisionesGC` ni módulos PL/MT/RA con `cargoFIReferencia` (quedan como futura extensión del mismo patrón).
- No hay borrado ni reconciliación bidireccional (espejo append/update-only tipo retención, igual que auditoría).

## Decisions

- **D1 — Tres colecciones en un solo endpoint.** `POST /api/fi/sync` acepta `{ fondos?, egresos?, ingresos? }` en un body (máx 500 elementos sumados) en vez de 3 endpoints. *Razón:* un solo batch por ciclo de debounce reduce churning y el guard de membresía se evalúa una vez. *Alternativa:* 3 endpoints espejo de auditoría — más código, misma semántica.
- **D2 — Upsert con guard de comunidad.** El upsert usa `where: { id }` y en `update`/`create` fuerza `comunidadId: cid`. Si el id ya existe en OTRA comunidad, el update lo re-scopiaría — mismo comportamiento aceptado en auditoría (los ids TEST/históricos son únicos globalmente); se documenta y los tests lo cubren. *Alternativa:* `createMany skipDuplicates` + update solo si `comunidadId` coincide — descartado por complejidad sin beneficio real en single-tenant de facto.
- **D3 — Validación de forma server-side mínima (no zod completo).** Igual que auditoría: validador estructural por campo (ids no vacíos, montos numéricos positivos, fechas ISO string) en vez de importar los schemas zod del cliente. *Razón:* los schemas zod viven en `lib/schemas.ts` (client-side, imports de store); duplicar el contrato mínimo evita acoplar la API al bundle del store. El elemento inválido se ignora y se cuenta; el batch se rechaza solo si NADA es válido o excede 500.
- **D4 — Cliente `lib/fi-sync.ts` espejo de `lib/auditoria-sync.ts`.** Tres Sets de delta (fondos/egresos/ingresos), un timer debounce 2s compartido, payload armado al disparar. El wiring se hace vía suscripción a los cambios del store (post-mutación en las acciones FI existentes: `saveFondoFI`, `removeFondoFI`, `registrarEgresoFI`/equivalentes, `registrarIngresoFI`, migraciones) marcando ids en el delta — sin tocar la lógica de las acciones ni `STORE_VERSION`. *Alternativa:* middleware de zustand que observa cualquier cambio de esas colecciones — más frágil (no distingue upsert de delete; deletes no se espejan por diseño).
- **D5 — Panel espejo como sección read-only en `/finanzas`.** Componente cliente que llama `GET /api/fi?page=1&pageSize=50` y muestra totales agregados BD vs store (conteo + suma de montos por fondo). Requiere permiso de vista FI (mismas guardas de la página). Sin botones de mutación (patrón ABAC read-only de `/admin/permisos`).
- **D6 — Migración Prisma aditiva.** `prisma migrate dev --name fi_sync_bd`: `ALTER TABLE fondos_fi ADD saldoInicial REAL` + `CREATE TABLE ingresos_fi`. Sin data-migration (la BD se llena por el propio sync). En tests, el patrón auditoría (Prisma real con `DATABASE_URL` de test, cleanup por TestIDs) se reutiliza.
- **D7 — Marca de sync por colección en el response.** `POST /api/fi/sync` responde `{ ok, recibidos, persistidos, porColeccion: { fondos, egresos, ingresos } }` para que el cliente pueda depurar qué delta falló; el Set solo descarga ids persistidos.

## Risks / Trade-offs

- [Upsert re-scopia comunidad si id colisiona cross-comunidad] → aceptado igual que auditoría; ids TEST/FE/fi-ing-hist son únicos por diseño; test cubre re-sync idempotente.
- [Eventos generados sin sesión activa nunca llegan a BD] → mismo gap aceptado en auditoría (C1); el punto cero carga en el primer hydration con sesión del QA/admin, verificado en e2e.
- [Volumen inicial ~232 filas en el primer debounce] → cabe en 1 batch de 500; MAX_BATCH rechaza con 400 y el cliente mantiene el delta para reintento en el próximo cambio.
- [Fondos con `saldoInicial: undefined` vs 0] → el validador acepta ausencia; la columna `Float?` es nullable; el saldo BD se calcula con `COALESCE(saldoInicial, 0)` en la vista.
- [Re-render del panel espejo durante sync en curso] → el panel es fetch-on-mount con botón manual de refrescar; no se suscribe al store.

## Migration Plan

1. Migración Prisma aditiva (`fi_sync_bd`) + `prisma generate` — commiteada.
2. Despliegue del código: API + cliente + panel. El sync se activa solo con sesión activa; no hay backfill script (el primer login con la app carga el store v27 y el debounce dispara el espejo).
3. Rollback: revert de commit — la tabla `ingresos_fi` puede quedarse (aditiva, sin datos críticos) o `prisma migrate resolve --rolled-back`.

## Open Questions

(ninguna — el patrón está cerrado por C1 y el alcance del BACKLOG-100 es explícito)
