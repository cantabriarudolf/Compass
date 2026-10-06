# SG-hardening-despliegue — Delta Specs for sg-google-provider-prod-guard

## MODIFIED Requirements

### Requirement: Secretos de configuración por variables de entorno (C2-final)

Los campos sensibles `smtpPassword` y `claveEliminacionMaestro` SHALL dejar de existir en `ConfiguracionGlobalSchema` (`lib/schemas.ts`) y en `data/admin/configuracion.ts` (seed `configuracionDefault`). El store cliente SHALL persistir `STORE_VERSION = 28` y su `migrate` SHALL eliminar ambos campos del `configuracion` de un estado persistido anterior a v26 sin romper el resto del estado (patrón v8 limpieza legacy). El `partialize` SHALL simplificarse para no vaciar secretos (ya no existen). La UI `/admin/configuracion` SHALL mostrar ambos secretos como "gestionados por el servidor (variables de entorno SMTP_PASSWORD / CLAVE_ELIMINACION_MAESTRO)" sin input editable. `.env.example` SHALL documentar `SMTP_PASSWORD` y `CLAVE_ELIMINACION_MAESTRO`.

**Extensión a credenciales Google OAuth**: Adicionalmente, `.env.example` SHALL documentar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` como variables requeridas en producción y opcionales en desarrollo, con comentarios claros indicando su propósito y procedencia (Google Cloud Console > APIs & Services > Credentials). La validación fail-fast de estas variables en producción se implementa en `lib/auth.ts` (ver `AU-autenticacion-sesion` delta spec) y SHALL estar documentada en `.env.example` de forma consistente.

(Previously: secretos SMTP y clave maestra movidos a env vars; store v26, UI informativa, .env.example documenta SMTP_PASSWORD y CLAVE_ELIMINACION_MAESTRO)

#### Scenario: .env.example documenta GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET
- **GIVEN** se lee `k0mp4ss_fe/apps/web/.env.example`
- **THEN** contiene las líneas:
  ```
  # Google SSO (OAuth 2.0) — opcional en dev, REQUERIDO en producción.
  # Requiere credenciales de Google Cloud Console (APIs & Services > Credentials).
  # En producción, la app NO arrancará sin estas variables.
  GOOGLE_CLIENT_ID=
  GOOGLE_CLIENT_SECRET=
  ```
  Y las variables `SMTP_PASSWORD` y `CLAVE_ELIMINACION_MAESTRO` siguen documentadas como antes.

#### Scenario: Schema sin secretos
- **WHEN** se inspecciona `lib/schemas.ts` y `data/admin/configuracion.ts`
- **THEN** `ConfiguracionGlobalSchema` y la interfaz `ConfiguracionGlobal` no contienen `smtpPassword` ni `claveEliminacionMaestro`, y `configuracionDefault` no los define

#### Scenario: Migrate v25→v26 limpia secretos
- **WHEN** existe un persistido v25 con `configuracion: { smtpPassword: "x", claveEliminacionMaestro: "y", nombreComunidad: "...", ... }`
- **THEN** al hidratar con `STORE_VERSION = 28` el migrate ejecuta la rama de limpieza v26 (`version < 26`) y elimina `smtpPassword` y `claveEliminacionMaestro` del estado resultante, preservando todos los demás campos y colecciones

#### Scenario: UI informativa sin inputs
- **WHEN** el administrador abre `/admin/configuracion` tabs SMTP y Operación y Seguridad
- **THEN** ve notas informativas "Gestionado por el servidor (variable de entorno SMTP_PASSWORD / CLAVE_ELIMINACION_MAESTRO)" y no hay `<input type="password">` para esos campos; guardar no envía secretos

#### Scenario: partialize simplificado
- **WHEN** se inspecciona `lib/store.ts` `partialize`
- **THEN** `configuracion` se persiste tal cual sin mapear `smtpPassword: ""` ni `claveEliminacionMaestro: ""`

#### Scenario: .env.example documenta vars
- **WHEN** se lee `k0mp4ss_fe/apps/web/.env.example`
- **THEN** contiene `SMTP_PASSWORD` y `CLAVE_ELIMINACION_MAESTRO` con comentarios indicando que son secretos servidor
