# 📊 04 - Auditoría y Métricas (AM)

Este módulo es el "Cerebro" del condominio. Aquí no se viene a meter datos, se viene a ver cómo el sistema está trabajando por ti. La idea es que la administración pueda sacar pecho con números reales sobre la gestión.

## 🚀 ¿Para qué sirve este panel?
Para que el nivel de automatización no haga invisible la tremenda pega que hace el software y la administración. Aquí condensamos el valor de todos los otros módulos.

## 📈 Métricas de Valor (Lo que "brilla")
- **Recaudación Proyectada**: Te dice cuánta plata debería entrar al mes según los precios que pusiste en los Tipos de Unidad. Es el "Norte" financiero.
- **Superficie Auditada**: Suma cada metro cuadrado de departamentos, locales y estacionamientos. Es para saber exactamente cuánto espacio físico estamos administrando.
- **Trazabilidad de Activos**: Muestra cuántas veces se han movido los estacionamientos o se han cambiado dueños. Si hay un problema, aquí se ve la historia.

## 🛠️ Indicadores de Eficiencia
- **Tiempo de Procesamiento**: Muestra qué tan rápido el sistema hace las pegas que antes tomaban horas (como reajustar precios masivamente).
- **Tasa de Ocupación**: Qué tan lleno está el edificio y los estacionamientos en tiempo real.

## 🔄 Sincronización a la BD (C1.1 — 2026-09-01)
Los eventos del store (`eventos: EventoAuditoria[]` en `lib/store.ts`) hoy viven en `localStorage`. Desde P2 se sync a la BD con **debounce 2s**:

- **Cliente:** `lib/auditoria-sync.ts` → `iniciarSyncAuditoria()` suscribe a `useCompassStore`, acumula solo el delta no persistido (Set de ids en memoria) y a los 2s del último cambio hace `POST /api/auditoria/sync` con `{ eventos: delta }`. Si el POST da 401, marca esos ids como fallidos y no reintenta en loop (espera el próximo cambio). Se monta una sola vez en `app/layout.tsx` (`<AuditoriaSyncInit />`).
- **Server:** `POST /api/auditoria/sync` (auth→usuario→membresía→401/403, máx 500, `upsert` por `id` con `comunidadId` de la membresía, `{ ok, recibidos, persistidos }`, idempotente) y `GET /api/auditoria?categoria=&tipoAccion=&q=&page=&pageSize=` (scoping por comunidad, filtros server-side + paginación `total/page/pageSize/eventos` orden `timestamp` desc). Sin `delete`/`update` (inmutable).
- **BD:** tabla `EventoAuditoria` (`prisma/schema.prisma:248`) ya existía (`repos.eventos` en `lib/repos/index.ts:92`); no requirió migración (`prisma generate` valida).

> **P3 (2026-09-01):** `/admin/logs` ahora lee la BD vía `GET /api/auditoria?categoria=&tipoAccion=&q=&page=&pageSize=50` (paginación server-side, contador "X de Y eventos en BD", búsqueda debounce 200ms mapeada a `q`, selects `categoria`/`tipoAccion` derivados de la página actual, export CSV de la página cargada con BOM + header). Skeleton "Cargando…" y empty state "Sin eventos…". `/admin/logs` mantiene badge "solo lectura · pista inmutable" y cero mutaciones. Las facetas del select reflejan solo la página actual (evolución futura: endpoint `/api/auditoria/facetas` si el volumen lo exige).

## 💡 Próximos Pasos
A medida que sumemos módulos (Personas, Finanzas, Gastos Comunes), este panel se va a ir llenando de más tarjetas de valor. La regla es: **si algo se puede contar, tiene que aparecer aquí**.
