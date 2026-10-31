> **Este archivo ES tu prompt.** Ventana 2 de la serie **frontera**. Lee
> `openspec/SERIE-FRONTERA/00-plan.md` (ARRANQUE + decisiones de diseño C1) y verifica en la
> Bitácora que P1 esté HECHA (git); si no, detente y repórtalo.

## Alcance P2 — change `am-auditoria-sync`: ingesta y consulta de eventos en BD

**Base ya existente:** `model EventoAuditoria` en `prisma/schema.prisma:248` (id, comunidadId,
timestamp, usuario, categoria, tipoAccion, referenciaId, descripcion — con @@index) y
`repos.eventos = scoped(prisma.eventoAuditoria)` en `lib/repos/index.ts:92`. La colección
cliente es `eventos: EventoAuditoria[]` en `lib/store.ts` (registrarEvento en línea ~199;
NOTA: los eventos del store NO tienen comunidadId — el scoping lo decide el endpoint con la
membresía del usuario autenticado).

1. **openspec-propose** `am-auditoria-sync`: capability `AM-auditoria-metricas` (delta ADDED
   requirement "Sincronización de eventos a la capa de datos": ingesta batch idempotente
   upsert por id, scoped por comunidad, sin delete/update (immutabilidad) + consulta paginada
   con filtros). La migración NO es necesaria (la tabla existe) — verifica con
   `npx prisma validate`; si falta algo del modelo, recién ahí migra.
2. **API** (`app/api/auditoria/`):
   - `POST /api/auditoria/sync` — body `{ eventos: EventoAuditoria[] }` (batch, máx ~500):
     para cada evento `prisma.eventoAuditoria.upsert({ where: { id }, ... })` con
     `comunidadId` de la membresía del usuario autenticado (patrón de
     `app/api/admin/usuarios/route.ts`: auth() → usuario → membresía → 401/403). Idempotente
     (re-enviar el mismo evento no duplica). SIN delete/update. Respuesta: `{ ok, recibidos, persistidos }`.
   - `GET /api/auditoria?categoria=&tipoAccion=&q=&page=&pageSize=` — listado desde BD
     ordenado `timestamp` desc, con paginación server-side (`{ total, page, pageSize,
     eventos }`). Scoping por comunidad del usuario autenticado. Filtros opcionales.
   - Tests API con Prisma real + BD temporal (patrón `test/api-admin-usuarios.test.ts`):
     upsert idempotente (2 posts del mismo evento → 1 fila), scoping A/B, 401 sin sesión,
     403 sin membresía, filtros y paginación.
3. **Cliente sync con debounce**: módulo `lib/auditoria-sync.ts` — función `iniciarSyncAuditoria()`
   que suscribe al store (`useCompassStore.subscribe`) detectando cambios en `eventos`
   (length/último id), acumula los eventos NO persistidos (set de ids ya enviados en memoria)
   y a los 2s del último cambio hace POST del delta. Manejo de error silencioso con reintento
   en el próximo cambio (la BD es mejora, nunca bloquea la UI). Invocar
   `iniciarSyncAuditoria()` UNA vez en `app/providers.tsx` (o el layout cliente donde se
   monta el store — localiza el lugar correcto). Guard: solo si hay sesión activa y
   `isWriteApiEnabled()`... no: la sync no escribe rutas de mutación del negocio, corre
   siempre que haya sesión (el endpoint valida). Si el fetch falla 401, no reintenta en loop.
4. **Sin cambiar `/admin/logs` todavía** (eso es P3). Sin tocar `lib/store.ts` (la
   suscripción lee, no muta).

## Verificación

`npx prisma validate` · `npx tsc --noEmit` (0) · `npm run lint` (0 errores) · `npx vitest run`
(425/425 + tests API nuevos — reporta total real) · `openspec validate --all` · commit ·
nsgc-prepush · push · archive (git status limpio) · Bitácora P2 HECHA con hash.
