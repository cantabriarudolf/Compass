## 1. Contrato cliente sin secretos

- [x] 1.1 Quitar `smtpPassword` y `claveEliminacionMaestro` de `ConfiguracionGlobalSchema` en `k0mp4ss_fe/apps/web/lib/schemas.ts` (y export `ConfiguracionGlobal` se deriva sin esos campos)
- [x] 1.2 Quitar `smtpPassword` y `claveEliminacionMaestro` de `ConfiguracionGlobal` interface y de `configuracionDefault` seed en `k0mp4ss_fe/apps/web/data/admin/configuracion.ts`

## 2. Store v26 con migrate y partialize

- [x] 2.1 Bump `STORE_VERSION` 25→26 en `k0mp4ss_fe/apps/web/lib/store.ts:300`
- [x] 2.2 Añadir migrate `if ((version ?? 0) < 26)` que elimina `smtpPassword` y `claveEliminacionMaestro` de `result.configuracion` sin romper resto (patrón v8), y simplificar `partialize` para persistir `configuracion` tal cual sin vaciar secretos
- [x] 2.3 Añadir test de regresión con persistido v25 real conteniendo ambos secretos: tras migrate a 26 no existen y el resto (`nombreComunidad`, `smtpHost`, etc.) permanece intacto — en `k0mp4ss_fe/apps/web/test/store-secretos-migracion.test.ts` (o ampliación de `store-migracion-seed.test.ts`)

## 3. UI y env

- [x] 3.1 En `k0mp4ss_fe/apps/web/app/admin/configuracion/page.tsx` reemplazar inputs `smtpPassword` y `claveEliminacionMaestro` por notas informativas "Gestionado por el servidor (variables de entorno SMTP_PASSWORD / CLAVE_ELIMINACION_MAESTRO)" sin input editable; `handleSave` no envía secretos
- [x] 3.2 Documentar `SMTP_PASSWORD` y `CLAVE_ELIMINACION_MAESTRO` en `k0mp4ss_fe/apps/web/.env.example` con comentario C2-final

## 4. Validación y cierre

- [x] 4.1 `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test -- --run` verde (incluido nuevo test) y `openspec validate --all` sin fallos; `STORE_VERSION` 26 verificado
