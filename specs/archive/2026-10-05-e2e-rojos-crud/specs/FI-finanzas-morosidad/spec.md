## ADDED Requirements
<!-- P2 ROJOS-CRUD: era MODIFIED sin target; el spec nunca lo tuvo -->

### Requirement: Scope canónico único (última membresía) en resolvers legacy
Los resolvers que no usan `withComunidadScope` SHALL resolver la ÚLTIMA
membresía (`createdAt desc, id desc`), no la primera: `fi/sync`, `fi`,
`auditoria/sync`, `auditoria` y `comunidadAncla` (mis-datos). El orden
asc movía fondos/egresos/ingresos a `comunidad-b` en cada sync del layout
(admin), vaciando el scope A (causa raíz del spec punto-cero en rojo:
`GET /api/fondos-fi` devolvía `total: 0` en A).

#### Scenario: Sync no migra datos de comunidad
- **WHEN** el layout dispara `POST /api/fi/sync` como admin (scope A)
- **THEN** los upserts conservan `comunidadId = comunidad-a`.

#### Scenario: Punto cero visible en scope A
- **WHEN** se corre `migrate-punto-cero-a-db --comunidad-id=comunidad-a`
- **THEN** fondo CC + 182 egresos + 44 ingresos quedan en A y el tab
  Fondos muestra "Cuenta Corriente".
