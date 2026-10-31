# Proposal: sg-secretos-env — C2-final: secretos fuera del store cliente (store v26)

## Why
`ConfiguracionGlobal` persiste hoy `smtpPassword` y `claveEliminacionMaestro` en `lib/schemas.ts:1178,1197` y en `data/admin/configuracion.ts`, ambos vaciados solo en `partialize` vía `lib/store.ts:4558` (patrón SEC-005 temporal). La auditoría consolidada `2026-08-24-b` §1/§3 exige C2-final: los secretos SHALL dejar de existir en el schema cliente y vivir solo como variables de entorno servidor `SMTP_PASSWORD` / `CLAVE_ELIMINACION_MAESTRO`. El store debe migrar v25→v26 eliminando campos del persistido sin romper el resto (patrón v8 limpieza legacy), con test de regresión sobre persistido v25 real. La UI `/admin/configuracion` debe dejar de ofrecer inputs editables para esos campos y documentarlos como gestionados por el servidor. `.env.example` debe documentar las nuevas vars.

## What Changes
- **BREAKING**: `ConfiguracionGlobalSchema` en `lib/schemas.ts` elimina `smtpPassword` y `claveEliminacionMaestro`. `data/admin/configuracion.ts` elimina ambos campos de la interfaz y del `configuracionDefault` seed (semilla sin secretos).
- Bump `STORE_VERSION` 25→26 en `lib/store.ts:300`. `migrate` v26 elimina `smtpPassword` y `claveEliminacionMaestro` del `configuracion` persistido si existen (delete keys), preservando todo lo demás. Patrón idéntico a v8 limpieza `estacionamientos` legacy, sin re-hidratación destructiva.
- `partialize` en `lib/store.ts:4558` se simplifica: ya no vacía los campos (no existen); pasa `configuracion` tal cual. El comentario SEC-005 se actualiza a C2-final: "secretos gestionados por el servidor".
- UI `app/admin/configuracion/page.tsx` tab SMTP y Operación y Seguridad: los campos de secretos se muestran como aviso informativo "gestionado por el servidor (variables de entorno SMTP_PASSWORD / CLAVE_ELIMINACION_MAESTRO)" sin `<Input type="password">` editable. El `handleSave` deja de enviar esos campos. El resto de campos sigue editable.
- `.env.example` documenta `SMTP_PASSWORD` y `CLAVE_ELIMINACION_MAESTRO` con comentario de uso servidor.
- Deltas de spec: `CF-configuracion-global` MODIFIED (campos fuera del schema cliente, persistencia sin secretos) y `SG-hardening-despliegue` MODIFIED (C2-final materializado).
- Tests: regresión migrate v25→v26 con payload persistido real conteniendo los dos campos con valores dummy; tras migrate deben no existir y el resto intacto.

## Capabilities
### New Capabilities
<!-- none -->

### Modified Capabilities
- `CF-configuracion-global`: Configuración Global sin secretos en schema cliente. `smtpPassword` y `claveEliminacionMaestro` salen del contrato; la spec documenta que son vars de entorno servidor y que el cliente solo persiste parámetros no sensibles.
- `SG-hardening-despliegue`: C2-final completado. Añade requisito de secretos por env y bump STORE_VERSION 25→26 con migrate limpieza, test regresión y UI sin inputs secretos.

## Impact
- `k0mp4ss_fe/apps/web/lib/schemas.ts` (elimina 2 campos), `data/admin/configuracion.ts` (elimina 2 campos), `lib/store.ts` (STORE_VERSION 26, partialize simplificado, migrate v26), `app/admin/configuracion/page.tsx` (UI informativa), `.env.example` (vars nuevas), `openspec/specs/CF-configuracion-global/spec.md` + `openspec/specs/SG-hardening-despliegue/spec.md` (evolución al archivar).
- `k0mp4ss_fe/apps/web/test/store-migracion-seed.test.ts` o nuevo `store-secretos-migracion.test.ts` para regresión v25.
- Verificaciones: `tsc --noEmit`, `eslint`, `npm test` verde (incluido nuevo test), `openspec validate --all` sin fallos, `STORE_VERSION` 26.
