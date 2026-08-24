## ADDED Requirements

### Requirement: Dependencias de Carga y Seed (ST) - VU Rank 3 último del core

Entidad `CompassData.vinculos` `k0mp4ss_fe/apps/web/lib/store.ts:82`, seed `data/comunidad/vinculos.ts:30 vinculos` (55 registros). `Depende de: [MP.personas, EF.unidades, MA.estadosInmobiliarios]` `k0mp4ss_fe/apps/web/lib/store.ts:57`. `Rank 3` último del core. Campos FK: `vinculo.personaId -> personas.id`, `unidadId -> unidades.id`, `estadoOcupacionPropiedad? -> maestros.estadosInmobiliarios.id` `VU-vinculacion-unidades:74`, `permiteVerFinanzas` solo visible si `rol==propietario` `VU:80`. `saveVinculo:278` ya valida `persona exists + activa + no duplicado + no solape arriendo` `ST:80`; además SHALL mantener `cerrarAnterior:310` (cierra tramo `propietario/arrendatario` previo con `fechaFin = fechaInicio-1`). `removeVinculo:335` sin validación inversa.

#### Scenario: Vinculo con persona inexistente
- **WHEN** `saveVinculo({personaId:"no-existe"})`
- **THEN** `{ok:false, error:"La persona no existe"}`.

#### Scenario: Solape arriendo en bulk
- **WHEN** seed `vinculos` contiene dos `arrendatario` solapados en misma `unidadId`
- **THEN** `seedBulkLoad` segundo registro retorna `ok:false: solapa contrato` y se reporta en `SeedValidationReport`.

#### Scenario: Cierre automático en bulk
- **WHEN** seed carga segundo `propietario` para misma `unidadId` sin `fechaFin` en el primero y con `cerrarAnterior!=false`
- **THEN** el primero se cierra con `fechaFin = nueva fechaInicio -1` `k0mp4ss_fe/apps/web/lib/store.ts:310`.

### Requirement: Carga Solo tras EF y MP Completos

`VU` SHALL cargarse tras `EF rank2` y `MP rank1`. `validateSeedOrder` SHALL fallar si `vinculo.unidadId` no existe en `unidades` rank2.

#### Scenario: VU antes que EF
- **WHEN** QA pulsa `Cargar VU` antes de `Cargar EF`
- **THEN** todos los `saveVinculo` fallan con `unidad no existe` y bulk reporta 55 errores.

### Requirement: Eventos AM de Carga VU

Bulk `vinculos` SHALL emitir `VU_SEED_LOADED` y mutaciones `VU_CHANGE_OWNER/VU_NEW_TENANT/VU_MUDANZA_REG` `VU-vinculacion-unidades:108`.

#### Scenario: Bulk VU auditado
- **WHEN** se cargan 55 vínculos
- **THEN** `AM` registra `valorCuantificable:55` y `métrica: rotación = mudanzas/mes`.
