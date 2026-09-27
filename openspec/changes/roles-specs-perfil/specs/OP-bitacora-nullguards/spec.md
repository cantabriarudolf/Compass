## ADDED Requirements

### Requirement: Bitácora y Multas robustas ante nulos del seed
Las vistas `/operaciones/bitacora` y `/finanzas/multas` MUST NOT reventar
(`Application error`) cuando el seed deja JSON en `null`: personal sin
`datosLaborales` (select de Trabajador en cierre de turno) e infracción sin
`montoAplicado` (columna de montos). Los filtros/lecturas SHALL tratar `null`
igual que `undefined` (misma familia del fix P2 en `/admin/gestion`), de modo
que los journeys por perfil (conserjería registra visita) rendericen sin
excepciones de cliente.

#### Scenario: Cierre de turno excluye ficha sin extensión laboral
- **WHEN** un rol con acceso (admin, conserjería) abre `/operaciones/bitacora`
  en una comunidad donde existe al menos una persona con `datosLaborales` en
  `null`
- **THEN** la página SHALL renderizar sin `Application error` y sin `pageerror`,
  excluyendo esa ficha del select de Trabajador (igual que extensión ausente).

#### Scenario: Registro de multas con monto nulo muestra guion
- **WHEN** se carga `/finanzas/multas` con una infracción con `montoAplicado`
  en `null`
- **THEN** la celda SHALL mostrar "—" sin excepciones, igual que con monto
  ausente.
