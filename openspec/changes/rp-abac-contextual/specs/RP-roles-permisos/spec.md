## MODIFIED Requirements

### Requirement: Permisos Contextuales (ABAC)
The system SHALL support Attribute-Based Access Control for resource-specific or context-specific actions via `puedeContextual(rol, accion, recurso, contexto)` where `contexto` includes `personaId` (identidad propia), `unidadId` (unidad reclamada), `unidadIdsVinculadas` (unidades con vínculo vigente) and `privacidad { residenteVeMorosidad, residenteVeActas, alertasResidentesActivas }`. The system SHALL expose it as optional contextual filtering where applicable. The system MUST preserve least privilege and parity 1:1 with current decisions: `puedeContextual = puede() base + refinamiento ABAC` only for granular resources (`:propios`, `:propia`, `:residencia`, `:al_dia`, privacidad); resources without contextual dimension MUST delegate directly to `puede()`. Migration of existing inline checks SHALL NOT change observable decisions.

#### Scenario: Supply Request Context
- **WHEN** a resident requests a maintenance supply
- **THEN** they MUST only see the category "Solicitar Insumo Mantenimiento"
- **AND** the category "Solicitar Insumo Uso Interno" MUST be hidden.

#### Scenario: Identidad propia requerida para mp:propios
- **WHEN** un usuario con rol que tiene `mp:propios` llama `puedeContextual(rol, "ver", "mp:propios", { personaId: "p-1" })`
- **THEN** el sistema SHALL conceder si `puede(rol, "ver", "mp:propios")` es true y `personaId` está presente, y SHALL denegar si `personaId` falta.

#### Scenario: Trabajador solo ve su liquidación (pl:propia)
- **WHEN** un usuario con rol `conserjeria` llama `puedeContextual("conserjeria", "ver", "pl:propia", { personaId: "p-4" })`
- **THEN** el sistema SHALL conceder solo si `puede("conserjeria","ver","pl:propia")` es true y `personaId` está presente (paridad: sin `personaId` no ve ni la propia).

#### Scenario: Certificado residencia exige vínculo vigente a la unidad
- **WHEN** un residente llama `puedeContextual("residente","ver","ct:residencia", { personaId:"p-1", unidadId:"u-A-101", unidadIdsVinculadas:["u-A-101"] })`
- **THEN** el sistema SHALL conceder; si `unidadId` no está en `unidadIdsVinculadas`, SHALL denegar (aunque `puede()` base sea true), preservando la validación `vinculoVigente` de `lib/store.ts:4253`.

#### Scenario: Certificado al día exige unidad vinculada (saldo lo decide CT, no ABAC)
- **WHEN** un residente llama `puedeContextual("residente","crear","ct:al_dia", { unidadId:"u-A-101", unidadIdsVinculadas:["u-A-101"] })`
- **THEN** el sistema SHALL conceder si la unidad está vinculada; la deuda pendiente sigue bloqueando la emisión en `lib/store.ts` (no cambia decisión ABAC).

#### Scenario: Privacidad GD — residente solo ve actas si dueño autorizó
- **WHEN** un residente llama `puedeContextual("residente","ver","gd", { privacidad:{ residenteVeActas:false } })`
- **THEN** el sistema SHALL denegar; con `residenteVeActas:true` SHALL conceder si `puede()` base lo permite. Para roles no residentes, `privacidad` no refina.

#### Scenario: Privacidad FI — residente solo ve morosidad si autorizado
- **WHEN** un residente llama `puedeContextual("residente","ver","mp:morosidad", { privacidad:{ residenteVeMorosidad:false } })`
- **THEN** el sistema SHALL denegar; con `residenteVeMorosidad:true` SHALL conceder si base lo permite (paridad con `controlesPropiedad` en `lib/store.ts:1327` y `app/comunidad/directiva/page.tsx:73`).

#### Scenario: Delegación sin contexto para recursos no granulares
- **WHEN** se llama `puedeContextual("comite","ver","fi:balance", {})` o cualquier recurso sin sufijo ABAC
- **THEN** el sistema SHALL retornar exactamente `puede(rol,accion,recurso)` sin refinamiento adicional.

#### Scenario: Menor privilegio preservado
- **WHEN** un rol sin permiso base llama `puedeContextual` con contexto favorable
- **THEN** el sistema SHALL denegar (contexto nunca amplía permisos base; solo los restringe).
