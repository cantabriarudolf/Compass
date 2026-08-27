# ST-capa-datos-persistente (delta del change bd-prisma-fundamento)

## ADDED Requirements

### Requirement: Evolución a repositorios server-side con scoping por comunidad (C1b)
El sistema SHALL exponer repositorios server-side en `k0mp4ss_fe/apps/web/lib/repos/` con factory obligatorio `crearRepositorio(comunidadId: string)` que scopée TODA operación por `comunidadId` (D3 tenant compartido). Ningún método SHALL exponer query sin `where: { comunidadId }`. El store cliente en `lib/store.ts` permanece en v25 sin cambios en esta ventana; los repositorios existen server-side listos para ser consumidos por P4/P5. La evolución queda documentada como parte de ST.

#### Scenario: Factory exige comunidadId
- **WHEN** se invoca `crearRepositorio("")` o se intenta query sin scope
- **THEN** lanza error y no ejecuta la query.

#### Scenario: Repositorio scoped por comunidadId
- **WHEN** `repoA = crearRepositorio(comunidadA)` crea una entidad y `repoB = crearRepositorio(comunidadB)` intenta leerla por id
- **THEN** `repoB.findById(id)` retorna `null` y `repoB.findMany()` no lista la entidad de A.

### Requirement: Modelo Prisma con comunidadId indexado (C1)
El sistema SHALL mantener `k0mp4ss_fe/apps/web/prisma/schema.prisma` con provider `sqlite` en dev y `DATABASE_URL` en env, que modele TODA entidad de dominio derivada de `CompassData` (store v25) y `lib/schemas.ts` (incluye estructura, comunidad, portal, notificaciones, controles, actas, CO/GE/IR/IN/MT/RA/CV/FI/PE/PL/CT/RE, eventos, configuración y los 20 maestros MA). Toda entidad SHALL llevar `comunidadId String` con `@@index([comunidadId])` y relación `comunidad Comunidad @relation(fields:[comunidadId], references:[id], onDelete:Cascade)`. `prisma migrate dev` y `prisma generate` SHALL correr limpio y `prisma/migrations` SHALL estar commiteada.

#### Scenario: Migración inicial limpia
- **WHEN** se ejecuta `prisma migrate dev --name init` con `DATABASE_URL=file:./dev.db`
- **THEN** la migración se aplica sin errores y el cliente se genera.

#### Scenario: Toda entidad tiene comunidadId indexado
- **WHEN** se inspecciona `schema.prisma`
- **THEN** cada `model` de dominio (excepto `Comunidad` raíz) declara `comunidadId String` y `@@index([comunidadId])`.

### Requirement: Constraints de unicidad compuesta opcionales (C3b)
El sistema MAY definir constraints de unicidad compuesta `@@unique([comunidadId, campo])` tabla por tabla según decisión D5 (repetidos permitidos en la app, BD decide). Cada constraint añadida SHALL estar documentada en `design.md` con justificación; las tablas sin constraint SHALL estar documentadas como decisión explícita de no-constraint.

#### Scenario: Constraint documentada con justificación
- **WHEN** `TipoUnidad` declara `@@unique([comunidadId, nombre])`
- **THEN** `design.md` explica que evita duplicar nombre por comunidad sin afectar global y que cross-comunidad con mismo nombre sigue permitido.

#### Scenario: No-constraint documentada
- **WHEN** `Unidad` no declara `@@unique([comunidadId, numero])`
- **THEN** `design.md` explica que se omite para no romper D5 (número repetible en distintos microsectores).

