# Change: fi-sync-bd

## Why

El punto cero 2023-2024 (fondo Cuenta Corriente, 182 egresos, 44 ingresos, saldoInicial 17.082.694) vive solo en el store localStorage (STORE_VERSION 27). El BACKLOG-100 (§Punto cero financiero, pendiente) pide que la línea base financiera viva también en BD Prisma/SQLite — mismo patrón que el sync de auditoría de C1 (SERIE-FRONTERA P2: `POST /api/auditoria/sync` upsert idempotente + cliente debounce), para que los movimientos históricos sobrevivan al store y sean consultables fuera de la sesión del navegador.

## What Changes

- **Prisma:** añadir columna `saldoInicial Float?` al modelo `FondoFI` existente + nuevo modelo `IngresoFI` (id, comunidadId, fondoId, fecha, monto, concepto, familia?, createdAt) con índice por comunidadId y FK a Comunidad — migración `fi-sync-bd`.
- **API sync:** `POST /api/fi/sync` — ingesta batch idempotente (upsert por id, máx 500, scoped por membresía como `resolverComunidadId` de auditoría) de tres colecciones: `fondos` (con saldoInicial), `egresos`, `ingresos`. Sin delete (retención tipo espejo, igual que auditoría).
- **API lectura:** `GET /api/fi` — lectura paginada del espejo BD (egresos + ingresos con filtros `fondoId`, `q`, `page`, `pageSize`) para verificación de integridad del punto cero.
- **Cliente sync:** `lib/fi-sync.ts` — mismo patrón que `lib/auditoria-sync.ts`: delta por colección con Set de ids ya enviados, debounce 2s tras el último cambio, guard 401 sin loop de reintento.
- **Vista verificación:** panel read-only "Espejo BD (ST)" en `/finanzas` (sección reportería/admin) que consulta `GET /api/fi` y muestra totales BD vs store (egresos, ingresos, saldo por fondo) — verificación de que el punto cero vive en BD.
- **Tests:** tests API con Prisma real (patrón de los 10 tests de auditoría-sync) + e2e del espejo (sync ocurre, totales BD cuadran con store).

No cambia la lógica del store ni `STORE_VERSION`: el store sigue siendo la fuente de la UI; la BD es espejo de retención/consulta (fase 1 del patrón C1; migrar la UI a leer BD queda fuera de este change).

## Capabilities

### New Capabilities

(ninguna — el sync reutiliza capacidades existentes FI + ST)

### Modified Capabilities

- `FI-finanzas-morosidad`: nuevo requirement "Espejo BD de Finanzas (sync ST)" — sync batch idempotente de fondos/egresos/ingresos vía `POST /api/fi/sync`, lectura verificable vía `GET /api/fi`, panel espejo en `/finanzas`. Extiende los requirements "Ingreso manual a fondo", "Saldo de apertura de fondo" y "Punto cero histórico 2023-2024" a persistencia BD.
- `ST-capa-datos-persistente`: delta del requirement "Modelo Prisma con comunidadId indexado (C1)" — se añaden `FondoFI.saldoInicial` y el modelo `IngresoFI` al esquema Prisma con la misma convención (índice comunidadId, FK Comunidad cascade).

## Impact

- **Código:** `k0mp4ss_fe/apps/web/prisma/schema.prisma` (+migración), `app/api/fi/sync/route.ts` y `app/api/fi/route.ts` (nuevos), `lib/fi-sync.ts` (nuevo), página `/finanzas` (panel espejo read-only), wiring del cliente sync en el store (`lib/store.ts` — solo hooks post-mutación, sin tocar lógica de acciones ni STORE_VERSION).
- **Tests:** `test/api-fi-sync.test.ts` (Prisma real, patrón auditoría), e2e `crud/fi-espejo.spec.ts` (o sección en flujo existente), Vitest existente 481/481 debe quedar verde.
- **Riesgos:** volumen del batch inicial (226 movimientos + 4 fondos → 1-2 batches de 500, bajo); upsert no debe pisar `comunidadId` si el id ya existe en otra comunidad (mismo guard que auditoría); el sync corre solo con sesión activa (igual que auditoría — eventos de navegadores sin sesión no se espejan).
- **Dependencias:** ninguna externa. Patrón probado en SERIE-FRONTERA P2/P3 (`1882e98`/`a9cd1b7`).
