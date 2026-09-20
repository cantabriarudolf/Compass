# Tareas — Google SSO

## ✅ HECHO (código listo, pendiente solo credenciales)
- [x] 1.1 Implementar provider Google en `lib/auth.ts`
- [x] 1.2 Callback `signIn` para validar email existente + activo + rate limit
- [x] 1.3 Callback `jwt` para mapear `sub` → `Usuario.id`
- [x] 1.4 UI botón Google en `/ingresar`
- [x] 1.5 Tests de integración (`test/auth/google-sso.test.tsx` — 2/2 verdes)
- [x] 1.6 Actualizar `.env.example`
- [x] 1.7 Manual AU actualizado

## ⏳ Pendientes (requieren acción del owner)
- [ ] 2.1 Obtener `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` de Google Cloud Console
- [ ] 2.2 Configurar redirect URIs en Google Cloud Console:
  - Dev: `http://localhost:3000/api/auth/callback/google`
  - Prod: `https://<tu-dominio>/api/auth/callback/google`
- [ ] 2.3 Pegar credenciales en `.env` (local) y Vercel dashboard (prod)
- [ ] 2.4 Probar login Google con cuenta de usuario existente y activo

## Decisiones del owner
- [ ] ¿Rol por defecto al vincular cuenta Google? (sugerencia: `residente`)
- [ ] ¿Migrar usuarios existentes o solo nuevos?
