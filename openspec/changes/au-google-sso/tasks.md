# Tareas — Google SSO

## ✅ HECHO (código listo, pendiente solo credenciales)
- [x] 1.1 Implementar provider Google en `lib/auth.ts`
- [x] 1.2 Callback `signIn` para validar email existente + activo + rate limit
- [x] 1.3 Callback `jwt` para mapear `sub` → `Usuario.id`
- [x] 1.4 UI botón Google en `/ingresar`
- [x] 1.5 Tests de integración (`test/auth/google-sso.test.tsx` — 2/2 verdes)
- [x] 1.6 Actualizar `.env.example`
- [x] 1.7 Manual AU actualizado

## ✅ HECHO
- [x] 2.1 Obtener `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` de Google Cloud Console
- [x] 2.2 Configurar redirect URIs en Google Cloud Console:
  - Dev: `http://localhost:3000/api/auth/callback/google`
  - Prod: `https://<tu-dominio>/api/auth/callback/google`
- [x] 2.3 Pegar credenciales en `.env.local` (local)
- [x] 2.4 Probar login Google con cuenta de usuario existente y activo

## ⏳ Pendiente producción
- [ ] 3.1 Agregar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en Vercel dashboard (Environment Variables)

## Decisiones del owner
- [ ] ¿Rol por defecto al vincular cuenta Google? (sugerencia: `residente`)
- [ ] ¿Migrar usuarios existentes o solo nuevos?

> Estado 2026-10-13 (NOCHE-2 P4): **sigue activo — código en main, bloqueo operativo del
> owner.** Implementado y verificado en repo: provider `Google` + fail-fast en producción
> (`lib/auth.ts:156`, guard líneas 17-26), botón "Continuar con Google" en
> `app/ingresar/page.tsx:415/436`, tests `test/auth/google-sso.test.tsx` y
> `google-sso-callbacks.test.ts`, credenciales dummy en CI (`5ea6c51`). Qué falta: 3.1
> `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` reales en Vercel (Environment Variables) +
> verificación del login Google en producción, y las 2 decisiones de owner de arriba
> (rol por defecto al vincular; tratamiento de usuarios existentes). No se archiva hasta
> que el login Google funcione en producción y las decisiones queden escritas; ver también
> `BACKLOG-100.md §C3`.
