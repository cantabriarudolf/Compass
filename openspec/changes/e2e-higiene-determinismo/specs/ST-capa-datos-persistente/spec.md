## ADDED Requirements

### Requirement: Seed authz con orden de membresías determinista (scope A)
El seed de autorización SHALL dejar el scope del admin en `comunidad-a` en cada
corrida, sin pasos manuales: tras el upsert idempotente de membresías, SHALL
reescribir `createdAt` en orden canónico (timestamps escalonados, admin-a
ÚLTIMA) de modo que `withComunidadScope` (`orderBy createdAt desc, id desc`,
`take: 1`) resuelva `comunidad-a`. El orden canónico (`comunidad-b` del admin
primero, admin-a última) SHALL estar documentado en el propio seed y coincidir
con `cuentas-funcionales.md §3.4`. El espejo `lib/seed-authz.ts` (QA-Lab) SHALL
mantener el mismo orden y el mismo contrato.

#### Scenario: Reseed reproducible deja scope A
- **WHEN** se restaura el backup P3 y se corre `npm run seed:authz` +
  `npm run seed:mocks -- --comunidad-id=comunidad-a`
- **THEN** el scope del admin es `comunidad-a` sin borrar/recrear membresías a mano.

#### Scenario: Re-corridas idempotentes conservan el orden
- **WHEN** se corre `npm run seed:authz` dos veces seguidas
- **THEN** el scope del admin sigue siendo `comunidad-a` y no se duplican membresías.
