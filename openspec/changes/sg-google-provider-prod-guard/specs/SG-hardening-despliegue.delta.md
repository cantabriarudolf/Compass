# SG-hardening-despliegue — Delta Specs for sg-google-provider-prod-guard

## Modified Requirement: Secretos de configuración por variables de entorno (C2-final)

Los campos sensibles `smtpPassword` y `claveEliminacionMaestro` SHALL dejar de existir en `ConfiguracionGlobalSchema` (`lib/schemas.ts`) y en `data/admin/configuracion.ts` (seed `configuracionDefault`). El store cliente SHALL persistir `STORE_VERSION = 26` y su `migrate` SHALL eliminar ambos campos del `configuracion` persistido v25 sin romper el resto del estado (patrón v8 limpieza legacy). El `partialize` SHALL simplificarse para no vaciar secretos (ya no existen). La UI `/admin/configuracion` SHALL mostrar ambos secretos como "gestionados por el servidor (variables de entorno SMTP_PASSWORD / CLAVE_ELIMINACION_MAESTRO)" sin input editable. `.env.example` SHALL documentar `SMTP_PASSWORD` y `CLAVE_ELIMINACION_MAESTRO`.

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

---

## Unchanged Requirements (for context)

All other requirements in `openspec/specs/SG-hardening-despliegue/spec.md` remain unchanged:
- Requirement: Modelo Prisma con comunidadId en toda entidad de dominio (C1)
- Requirement: Repositorios con scoping obligatorio por comunidadId y tests de aislamiento (C1b)
- Requirement: Constraints de unicidad compuesta opcionales tabla por tabla (C3b)
- Requirement: CSP estricta en modo report-only con nonce (D-i)
- Requirement: Headers contra dominio configurable y script de verificación (D-ii)
- Requirement: Re-chequeos D-iii scripted repetibles 5/5 (D-iii)