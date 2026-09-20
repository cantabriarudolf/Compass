# Tareas — Google SSO

## Pendientes (requieren credenciales del owner)
- [ ] 1.1 Obtener `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` de Google Cloud Console
- [ ] 1.2 Configurar redirect URIs en Google Cloud Console
- [ ] 1.3 Implementar provider Google en `lib/auth.ts`
- [ ] 1.4 Callback `signIn` para validar email existente + activo + rate limit
- [ ] 1.5 Callback `jwt` para mapear `sub` → `Usuario.id`
- [ ] 1.6 UI botón Google en `/ingresar`
- [ ] 1.7 Tests de integración (`test/auth/google-sso.test.ts`)
- [ ] 1.8 Actualizar `.env.example`
- [ ] 1.9 Manual AU y avance NSGC

## Decisiones del owner
- [ ] ¿Rol por defecto al vincular cuenta Google? (sugerencia: `residente`)
- [ ] ¿Migrar usuarios existientes o solo nuevos?
