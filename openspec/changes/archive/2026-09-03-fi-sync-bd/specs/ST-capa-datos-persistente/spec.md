## MODIFIED Requirements

### Requirement: Modelo Prisma con comunidadId indexado (C1)
El sistema SHALL mantener `k0mp4ss_fe/apps/web/prisma/schema.prisma` con provider `sqlite` en dev y `DATABASE_URL` en env, que modele TODA entidad de dominio derivada de `CompassData` (store v25) y `lib/schemas.ts` (incluye estructura, comunidad, portal, notificaciones, controles, actas, CO/GE/IR/IN/MT/RA/CV/FI/PE/PL/CT/RE, eventos, configuración y los 20 maestros MA). Toda entidad SHALL llevar `comunidadId String` con `@@index([comunidadId])` y relación `comunidad Comunidad @relation(fields:[comunidadId], references:[id], onDelete:Cascade)`. `prisma migrate dev` y `prisma generate` SHALL correr limpio y `prisma/migrations` SHALL estar commiteada. El esquema SHALL incluir además el campo `saldoInicial Float?` en el modelo `FondoFI` y el modelo `IngresoFI` (id, comunidadId, fondoId, fecha, monto, concepto, familia opcional, createdAt) con `@@index([comunidadId])` y `@@index([fondoId])`, alineados con `FondoFISchema` e `IngresoFISchema` de `lib/schemas.ts`.

#### Scenario: Migración inicial limpia
- **WHEN** se ejecuta `prisma migrate dev --name init` con `DATABASE_URL=file:./dev.db`
- **THEN** la migración se aplica sin errores y el cliente se genera.

#### Scenario: Toda entidad tiene comunidadId indexado
- **WHEN** se inspecciona `schema.prisma`
- **THEN** cada `model` de dominio (excepto `Comunidad` raíz) declara `comunidadId String` y `@@index([comunidadId])`.

#### Scenario: IngresoFI y saldoInicial presentes en el esquema
- **WHEN** se inspecciona `schema.prisma` tras la migración
- **THEN** `FondoFI` declara `saldoInicial Float?` y existe el modelo `IngresoFI` con comunidadId indexado, fondoId indexado y FK a Comunidad con cascade
