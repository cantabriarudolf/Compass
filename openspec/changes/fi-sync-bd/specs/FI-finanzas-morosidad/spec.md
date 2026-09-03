## ADDED Requirements

### Requirement: Espejo BD de Finanzas (sync ST)
El sistema SHALL mantener en BD (Prisma/SQLite) un espejo de retención de las colecciones FI `fondosFI` (con `saldoInicial`), `egresosFI` e `ingresosFI` mediante `POST /api/fi/sync`: ingesta batch idempotente (upsert por id, máximo 500 elementos por petición) autenticada, scoped a una comunidad donde el usuario tenga membresía, sin operaciones de delete ni de actualización cruzada de comunidades. El cliente SHALL enviar solo el delta no persistido (Set de ids ya enviados) con debounce de 2 segundos tras el último cambio, sin bloquear la UI; ante respuesta 401 SHALL marcar los ids del batch como fallidos sin reintento en bucle. El sistema SHALL exponer `GET /api/fi` (paginado, filtros `fondoId` y `q`) para verificar el espejo, y un panel read-only en `/finanzas` que muestre totales BD vs store (egresos, ingresos, saldo por fondo) de modo que el punto cero 2023-2024 sea verificable en BD. El store SHALL seguir siendo la fuente de la UI; la BD actúa como espejo de retención.

#### Scenario: Sync batch idempotente del punto cero
- **WHEN** el cliente envía `POST /api/fi/sync` con fondos, egresos e ingresos del punto cero (182 egresos, 44 ingresos, fondo CC con saldoInicial 17082694) y repite el mismo batch
- **THEN** la BD contiene exactamente 182 egresos y 44 ingresos sin duplicados y el fondo Cuenta Corriente conserva su `saldoInicial`

#### Scenario: Cliente sync con debounce y delta
- **WHEN** se registran varios cambios FI consecutivos en menos de 2 segundos
- **THEN** el cliente envía una sola petición con los ids aún no persistidos a los 2 segundos del último cambio, sin bloquear la UI

#### Scenario: Rechazo sin pertenencia a la comunidad
- **WHEN** un usuario autenticado envía `POST /api/fi/sync` con `x-comunidad-id` de una comunidad donde no tiene membresía
- **THEN** la API responde 403 y no persiste ningún elemento del batch

#### Scenario: Batch inválido o excesivo
- **WHEN** el batch supera 500 elementos o ningún elemento tiene forma válida
- **THEN** la API responde 400 sin persistir nada

#### Scenario: 401 sin bucle de reintento
- **WHEN** el POST responde 401 (sesión expirada)
- **THEN** el cliente marca el batch como fallido y no reintenta en bucle; espera el próximo cambio FI

#### Scenario: Verificación del espejo desde /finanzas
- **WHEN** un usuario con sesión consulta el panel "Espejo BD (ST)" en `/finanzas`
- **THEN** ve los totales leídos de BD vía `GET /api/fi` (egresos, ingresos, saldo por fondo) comparados con el store, sin botones de mutación
