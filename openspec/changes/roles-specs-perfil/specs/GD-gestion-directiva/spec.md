## ADDED Requirements

### Requirement: Gestión robusta ante extensiones nulas
La vista `/admin/gestion` MUST NOT reventar (`Application error`) cuando una
persona en la comunidad tiene `datosGobernanza` o `datosLaborales` en `null`
(JSON de BD) en vez de ausente. Los filtros de las listas de Directiva y
Personal SHALL tratar `null` igual que `undefined` (solo entran fichas con
extensión presente), de modo que los 6 roles de validación rendericen la
página sin excepciones de cliente.

#### Scenario: Directiva con ficha sin extensión no revienta
- **WHEN** un rol con acceso (admin, comite, residente, arrendatario con login
  residente) abre `/admin/gestion` en una comunidad donde existe al menos una
  persona con `datosGobernanza` en `null`
- **THEN** la página SHALL renderizar el sidebar y las listas sin
  `Application error` y sin `pageerror`, excluyendo esa ficha del cajón de
  Directiva.

#### Scenario: Personal con ficha sin extensión no revienta
- **WHEN** se carga `/admin/gestion` con una persona con `datosLaborales` en
  `null`
- **THEN** la pestaña Personal SHALL excluir esa ficha sin excepciones,
  igual que con extensión ausente.
