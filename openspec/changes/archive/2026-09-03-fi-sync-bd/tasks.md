# Tasks — fi-sync-bd

## 1. Esquema Prisma (ST)

- [x] 1.1 Añadir `saldoInicial Float?` al modelo `FondoFI` y el modelo `IngresoFI` (id, comunidadId, fondoId, fecha, monto, concepto, familia?, createdAt, `@@index([comunidadId])`, `@@index([fondoId])`, FK Comunidad cascade) en `prisma/schema.prisma`
- [x] 1.2 `prisma migrate dev --name fi_sync_bd` + `prisma generate` limpios; migración commiteada en `prisma/migrations`

## 2. API sync + lectura

- [x] 2.1 `app/api/fi/sync/route.ts`: `POST` batch `{ fondos?, egresos?, ingresos? }` (máx 500), `resolverComunidadId` (patrón auditoría), validador estructural por colección, upsert idempotente con `comunidadId` forzado, response `{ ok, recibidos, persistidos, porColeccion }` — 401/403/400 según spec
- [x] 2.2 `app/api/fi/route.ts`: `GET` paginado de egresos e ingresos con filtros `fondoId`, `q`, `page`, `pageSize` (máx 100) + totales por fondo con `COALESCE(saldoInicial,0)`, scoped por membresía
- [x] 2.3 Tests API con Prisma real (`test/api-fi-sync.test.ts`, patrón `api-auditoria-sync.test.ts`): idempotencia del batch punto cero, 403 sin membresía, 400 batch inválido/excesivo, GET paginado con filtros y totales

## 3. Cliente sync

- [x] 3.1 `lib/fi-sync.ts`: delta con 3 Sets + debounce 2s compartido + guard 401 sin bucle, payload `{ fondos, egresos, ingresos }` solo con ids no persistidos; descarga del Set solo de ids `persistidos`
- [x] 3.2 Wiring post-mutación en `lib/store.ts` (marcar ids en delta en acciones FI: fondos, egresos, ingresos; sin tocar lógica de acciones ni STORE_VERSION) + tests unit del cliente (delta, debounce, 401) siguiendo `test/auditoria-sync` existente

## 4. Panel espejo en /finanzas

- [x] 4.1 Componente read-only "Espejo BD (ST)" en `/finanzas`: fetch `GET /api/fi`, muestra egresos/ingresos/saldo por fondo BD vs store, botón refrescar, 0 botones de mutación
- [x] 4.2 e2e `crud/fi-espejo.spec.ts`: login admin → sync dispara (poll hasta ≥226 egresos y ≥44 ingresos en BD) → panel refleja totales BD cuadrados con store → 0 pageerror

## 5. Cierre integral

- [x] 5.1 Suite completa verde: Vitest (481+ nuevos), tsc 0, lint 0, `openspec validate` passed, e2e crud/flujo/smoke sin regresiones
- [x] 5.2 Docs: manual FI (Catálogo Mocks + Data Dump si toca, per Mock Documentation Norm) + avance NSGC + BACKLOG-100 §Punto cero marcado FI→BD HECHO + bitácora del change archivado
