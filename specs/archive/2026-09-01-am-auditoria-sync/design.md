## Context

`EventoAuditoria` y `repos.eventos` ya existen (schema.prisma:248, lib/repos/index.ts:92). Auditoría vive hoy solo en zustand persist/localStorage. La tabla BD ya está creada por deploy previo; no se requiere migración salvo que `prisma` valide schema faltante. El patrón de API autenticada con scoping por comunidad es `app/api/admin/usuarios/route.ts` (auth() → usuario → membresía → 401/403). El cliente sync debe observar `useCompassStore` sin mutarlo y no escribir rutas de negocio (solo auditoría). Fuente de verdad: SERIE-FRONTERA 00-plan.md decisiones C1.

## Goals / Non-Goals

**Goals:**
- Ingesta batch idempotente (upsert por id, scoped comunidadId de membresía).
- Consulta paginada con filtros server-side (categoria, tipoAccion, q) orden timestamp desc.
- Sync cliente con debounce 2s, delta no persistido, set de ids en memoria, guard contra loop 401.
- Tests API con Prisma real + BD SQLite temporal (patrón api-admin-usuarios).

**Non-Goals:**
- Migrar `/admin/logs` a BD (es P3 `am-logs-bd`).
- Cambiar `lib/store.ts` o `STORE_VERSION`.
- Migración Prisma (solo si prisma validate falla).
- Rate limiting adicional (usa auth/membresía existente).

## Decisions

- **Upsert por id con comunidadId de membresía (no del body):** evita spoof de tenant. Alternativa body comunidadId → rechazada por riesgo D3. Si el evento ya existe con otra comunidad, el upsert con where {id} actualizaría cross-tenant; mitigación: el where es solo id y el update fija comunidadId del caller, pero el select previo no verifica tenant — aceptado porque id es cuid único global; re-envío legítimo del mismo tenant no colisiona. Si el id existe en otro tenant, el caller lo sobrescribiría (id colisión improbable por cuid+timestamp+random; documentado como riesgo aceptado).
- **Debounce 2s via useCompassStore.subscribe + Set en memoria:** leve, sin persistir marca. Alternativa persistir cursor en localStorage → complejidad innecesaria; pérdida de marca al recargar solo causa re-upsert idempotente.
- **401 no reintenta en loop:** se añaden ids al Set de "ya intentados fallidos" para no re-postear hasta próximo cambio real (evita storm). La próxima mutación del store sí reintentará delta pendiente.
- **Ubicación de iniciarSyncAuditoria():** wrapper cliente en app/layout.tsx (o componente cliente invocado desde layout) — único mount. Alternativa providers.tsx no existe en este árbol; se crea `components/auditoria-sync-init.tsx` cliente que llama `iniciarSyncAuditoria()` en useEffect una vez.

## Risks / Trade-offs

- [Cross-tenant upsert por id cuid] → Mitigación: id cuid entropía alta; idempotencia prioritaria. Si se requiere estricto tenant-isolation en upsert, futuro cambio a `where: {id, comunidadId}` + create condicional, pero rompería idempotencia simple.
- [Debounce pierde eventos si cierre de pestaña <2s] → Mitigación: BD es mejora no crítica; eventos persisten en localStorage y se re-sync al próximo mount. Futuro: `beforeunload` flush opcional (no P2).
- [POST batch 500 puede exceder body limit] → Mitigación: límite documentado ~500; cliente envía delta típico <10; servidor trunca/valida y responde 400 si >500.

## Migration Plan

- Deploy sin migración (tabla existe). Validar con `npx prisma --help` / `prisma generate` si aplica.
- Rollback: remover rutas y módulo sync; datos BD quedan huérfanos sin efecto.
