## Context

P1 (guard idempotente) y P2 (POST /api/auditoria/sync + GET /api/auditoria + cliente sync debounce 2s) están HECHAS (commits 0c9fb6a, 1882e98). `EventoAuditoria` y `repos.eventos` ya existen (schema.prisma:248). `/admin/logs` hoy es client-only sobre `store.eventos` (máx 500, localStorage) y debe migrar a BD sin perder UX. Fuente de verdad: SERIE-FRONTERA 00-plan.md C1.

## Goals / Non-Goals

**Goals:**
- `/admin/logs` consulta `GET /api/auditoria` con filtros `categoria`/`tipoAccion`/`q` + paginación `page`/`pageSize=50` orden `timestamp` desc.
- Mantener exactamente la UX actual: búsqueda debounced 200ms, selects categoria/tipoAccion, export CSV (BOM + header), badge solo lectura, skeleton/empty state, cero mutaciones.
- Contador "X de Y eventos en BD" (Y=total del response) y paginación server-side anterior/siguiente.
- e2e robusto a BD con ruido de otras corridas (filtros acotados + poll).

**Non-Goals:**
- Modificar `lib/store.ts`, `lib/auditoria-sync.ts` ni las APIs.
- Cambiar la retención (ya está en BD 5 años) ni inmutabilidad (sin delete/update).
- Server component ni SSR: se mantiene client con fetch.
- Migración Prisma.

## Decisions

- **Fuente: fetch GET /api/auditoria con estado de carga.** Alternativa server component → descartada: la vista ya es client con debounce y paginación interactiva; fetch mantiene paridad y no introduce RSC.
- **Selects alimentados por la página actual de resultados.** Decisión: `categorias = Set(eventos.map(e=>e.categoria))` y `tiposAccion = Set(eventos.map(e=>e.tipoAccion))` derivados del `eventos` del response. Justificación: sin endpoint distinto de facetas, evita fetch extra; limitación documentada: si la página no contiene una categoría presente en otra página, el select no la listará hasta navegar — aceptado porque la paginación y filtros son progresivos y el caso típico (BD pequeña en dev/test) lo cubre. Alternativa "GET sin filtros inicial para poblar facetas" se evaluó y se deja como evolución si el owner lo pide (no bloquea P3).
- **pageSize fijo 50.** Paridad con `FILAS_POR_PAGINA = 50` actual; el API cap 100 lo permite. Paginación anterior/siguiente con `total` del response.
- **Export CSV del set cargado (página actual).** Paridad con "del resultado filtrado" — ahora el resultado filtrado es la página server-side; el spec Log Export "filtered result set" se interpreta como página cargada (no se hace fetch de todas las páginas para export).
- **Búsqueda `q` mapeada directo.** El `q` del API ya busca `descripcion/tipoAccion/referenciaId` con `contains` (case-sensitive SQLite LIKE); la UI mantiene debounce 200ms y lower-case no es necesario porque el test usa valores exactos.
- **e2e: poll con filtro acotado.** La BD puede tener eventos de corridas previas; el test filtra `tipoAccion=AD_OWNER_CONFIG_CHANGE` y espera ≥2 filas con ese tipo y descripciones de transición (poll 20-30s cubre debounce 2s + POST). No usa "2 de 2" exacto ni `q` con texto único inventado (la descripción la genera el store con ref de unidad seed no única).

## Risks / Trade-offs

- [Facetas parciales] → Si BD grande, selects incompletos. Mitigación: usuario puede quitar filtros o paginar y las facetas se refrescan por página; evolución: endpoint `/api/auditoria/facetas` futuro si se requiere.
- [Export solo página] → Si filtrado total >50, export no contiene todo el histórico filtrado. Mitigación: documentado; P3 mantiene comportamiento práctico; full export requeriría paginar en cliente (futuro).
- [Debounce+sync race en e2e] → Mitigación: poll con timeout generoso (20-30s) y `expect.poll` hasta ver filas, no `waitForTimeout` fijo.
- [GET 401 sin sesión] → El `app/layout.tsx` monta `AuditoriaSyncInit` solo si hay sesión; la vista fetch fallará 401 si el e2e no está logueado — el helper de auth del test ya inicia sesión antes del fetch.

## Migration Plan

- Sin migración. Deploy: la vista nueva lee BD; si BD vacía, empty state. Rollback: revertir page.tsx a store.
