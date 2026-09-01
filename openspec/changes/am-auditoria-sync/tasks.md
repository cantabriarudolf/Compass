## 1. API auditoría (server)

- [x] 1.1 Crear `POST /api/auditoria/sync` con auth→usuario→membresía (401/403), validación body `{ eventos: EventoAuditoria[] }` (máx 500, 400 si excede), upsert idempotente por `id` con `comunidadId` de membresía, sin delete/update, respuesta `{ ok, recibidos, persistidos }`
- [x] 1.2 Crear `GET /api/auditoria` con auth→usuario→membresía (401/403), scoping por comunidad, filtros `categoria`/`tipoAccion`/`q` (ilike en descripcion/tipoAccion/referenciaId), paginación `page`/`pageSize` (defaults 1/20, cap 100), orden `timestamp` desc, respuesta `{ total, page, pageSize, eventos }`
- [x] 1.3 Validar schema Prisma sin migración (`npx prisma generate` o equivalente); documentar que tabla ya existe

## 2. Cliente sync con debounce

- [x] 2.1 Crear `lib/auditoria-sync.ts` con `iniciarSyncAuditoria()` que suscribe a `useCompassStore`, detecta cambios en `eventos` (length/último id), mantiene Set de ids enviados en memoria, debounce 2s, POST delta a `/api/auditoria/sync`, manejo silencioso + marca ids fallidos si 401 sin loop
- [x] 2.2 Crear `components/auditoria-sync-init.tsx` (client) que invoca `iniciarSyncAuditoria()` una vez en `useEffect` y montar en `app/layout.tsx` (detectar layout cliente correcto; no tocar `lib/store.ts`)

## 3. Tests API con Prisma real

- [x] 3.1 Crear `test/api-auditoria-sync.test.ts` (vitest node) con helper sesión Auth.js real: upsert idempotente (2 POST mismo evento → 1 fila), scoping A/B (dato de B no visible en A), 401 sin sesión, 403 sin membresía, filtros categoria/tipoAccion/q y paginación page/pageSize orden desc
- [x] 3.2 Verificación: `npx tsc --noEmit` 0, `npm run lint` 0 errores, `npx vitest run` (reportar total real = 425 + nuevos), `openspec validate --all`
