## ADDED Requirements

### Requirement: Matriz Contextual visible
El sistema MUST exponer en `/admin/permisos` la matriz contextual ABAC de forma read-only, derivada en tiempo de ejecución del snapshot de `lib/authz.ts` (`reglasContextuales()`). Cada entrada SHALL mostrar por rol: recurso, condición legible (ej. "solo propios", "unidad vinculada", "según privacidad"), descripción y dónde se aplica ("motor" para `puedeContextual` o "check local" para checks inline no migrados). La vista MUST mantener el badge "solo lectura" y cero botones de mutación, y MUST reflejar el snapshot del motor sin datos duros desincronizables.

#### Scenario: Snapshot derivado sin datos duros
- **WHEN** se carga `/admin/permisos`
- **THEN** la sección "Permisos contextuales (ABAC)" SHALL renderizar las entradas retornadas por `reglasContextuales()` (constante de módulo derivada del código de `puedeContextual`, como `matrizPermisos()`), sin duplicar literales en la vista.

#### Scenario: Reglas por rol con condición legible
- **WHEN** un operador inspecciona la sección ABAC
- **THEN** SHALL ver al menos una regla por cada rol con refinamiento ABAC (residente, conserjeria, comite, mantencion) con su recurso y badge de condición legible ("solo propios" | "solo propia" | "unidad vinculada" | "según privacidad: residenteVeActas" | "según privacidad: residenteVeMorosidad" | "según privacidad: alertasResidentesActivas").

#### Scenario: Dónde se aplica — motor vs check local
- **WHEN** se lista cada regla ABAC
- **THEN** cada fila SHALL mostrar un badge "motor" si la regla está implementada en `puedeContextual` (ej. `gd`/`gd:*` con `residenteVeActas`, `mp:propios`, `pl:propia`, `ct:propio`/`ct:residencia`/`ct:al_dia` con vinculación) o "check local" si es un check inline aún no migrado por acoplo a store/UI (ej. `mp:morosidad`/`fi:morosidad` con `residenteVeMorosidad` en switches de `app/admin/gestion`, `notify:residente`/`pe:notify_residente` con `alertasResidentesActivas` en `lib/store.ts:1327`, `ct:al_dia` saldo en `lib/store.ts:4272`, `vinculoVigente` en `lib/store.ts:4253` / filtros `app/comunidad/certificados/page.tsx:177`).

#### Scenario: Solo lectura sin mutaciones
- **WHEN** cualquier usuario abre `/admin/permisos` con la sección ABAC visible
- **THEN** la vista MUST mantener el badge "solo lectura" y MUST NOT ofrecer botones de editar/eliminar/crear/asignar en la sección ABAC (cero mutaciones), igual que la matriz RBAC.

#### Scenario: Paridad con motor
- **WHEN** se añaden nuevas reglas ABAC a `puedeContextual` o cambian condiciones
- **THEN** `reglasContextuales()` SHALL reflejarlas automáticamente (derivado del mismo código), sin requerir edición manual de la vista.
