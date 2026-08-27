# Spec Delta: SG-hardening-despliegue — C2-final secretos a env

## MODIFIED Requirements

### Requirement: Modelo Prisma con comunidadId en toda entidad de dominio (C1)
El sistema SHALL proveer `k0mp4ss_fe/apps/web/prisma/schema.prisma` con `datasource db { provider = "sqlite" url = env("DATABASE_URL") }` y `generator client { provider = "prisma-client-js" }`, que modele el inventario definitivo de colecciones derivado de `CompassData` en `lib/store.ts` (v26: estructura, comunidad, portal, notificaciones, controles, actas, CO/GE/IR/IN/MT/RA/CV/FI/PE/PL/CT/RE, eventos, configuración sin secretos) y de `lib/schemas.ts`, incluyendo los 20 maestros de `MaestroCollections`. Toda entidad de dominio SHALL llevar `comunidadId String` con `@@index([comunidadId])` y relación a `Comunidad` (D3 tenant compartido). `DATABASE_URL` SHALL vivir en `.env.local` (gitignored) y estar documentado en `.env.example`; archivos `*.db` SHALL estar gitignored y `prisma/migrations` commiteada. `prisma migrate dev` SHALL correr limpio.

#### Scenario: Prisma instalado y migración limpia
- **WHEN** se instala `prisma` + `@prisma/client` (SQLite dev) y se ejecuta `prisma migrate dev --name init` con `DATABASE_URL=file:./dev.db` en `.env.local`
- **THEN** la migración aplica sin errores, `prisma generate` crea el cliente y `openspec validate --all` sigue verde.

#### Scenario: Toda entidad con comunidadId indexado
- **WHEN** se inspecciona `prisma/schema.prisma`
- **THEN** cada `model` de dominio (salvo `Comunidad` raíz) contiene `comunidadId String`, `comunidad Comunidad @relation(...)` y `@@index([comunidadId])`.

## ADDED Requirements

### Requirement: Secretos de configuración por variables de entorno (C2-final)
Los campos sensibles `smtpPassword` y `claveEliminacionMaestro` SHALL dejar de existir en `ConfiguracionGlobalSchema` (`lib/schemas.ts`) y en `data/admin/configuracion.ts` (seed `configuracionDefault`). El store cliente SHALL persistir `STORE_VERSION = 26` y su `migrate` SHALL eliminar ambos campos del `configuracion` persistido v25 sin romper el resto del estado (patrón v8 limpieza legacy). El `partialize` SHALL simplificarse para no vaciar secretos (ya no existen). La UI `/admin/configuracion` SHALL mostrar ambos secretos como "gestionados por el servidor (variables de entorno SMTP_PASSWORD / CLAVE_ELIMINACION_MAESTRO)" sin input editable. `.env.example` SHALL documentar `SMTP_PASSWORD` y `CLAVE_ELIMINACION_MAESTRO`.

#### Scenario: Schema sin secretos
- **WHEN** se inspecciona `lib/schemas.ts` y `data/admin/configuracion.ts`
- **THEN** `ConfiguracionGlobalSchema` y la interfaz `ConfiguracionGlobal` no contienen `smtpPassword` ni `claveEliminacionMaestro`, y `configuracionDefault` no los define

#### Scenario: Migrate v25→v26 limpia secretos
- **WHEN** existe un persistido v25 con `configuracion: { smtpPassword: "x", claveEliminacionMaestro: "y", nombreComunidad: "...", ... }`
- **THEN** al hidratar con `STORE_VERSION=26` el migrate elimina `smtpPassword` y `claveEliminacionMaestro` del estado resultante y preserva todos los demás campos y colecciones

#### Scenario: UI informativa sin inputs
- **WHEN** el administrador abre `/admin/configuracion` tabs SMTP y Operación y Seguridad
- **THEN** ve notas informativas "Gestionado por el servidor (variable de entorno SMTP_PASSWORD / CLAVE_ELIMINACION_MAESTRO)" y no hay `<input type="password">` para esos campos; guardar no envía secretos

#### Scenario: partialize simplificado
- **WHEN** se inspecciona `lib/store.ts` `partialize`
- **THEN** `configuracion` se persiste tal cual sin mapear `smtpPassword: ""` ni `claveEliminacionMaestro: ""`

#### Scenario: .env.example documenta vars
- **WHEN** se lee `k0mp4ss_fe/apps/web/.env.example`
- **THEN** contiene `SMTP_PASSWORD` y `CLAVE_ELIMINACION_MAESTRO` con comentarios indicando que son secretos servidor
