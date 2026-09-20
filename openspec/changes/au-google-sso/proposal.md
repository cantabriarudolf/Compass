# Proposal: Google SSO (Single Sign-On)

## Contexto

El sistema de autenticación usa Auth.js con provider `Credentials` (email + password
bcrypt) + JWT + rate limit persistente. La SERIE-PRODUCCION-FASE2 P3 ya implementó
2FA/TOTP. El backlog C3 documenta que Google SSO está **EN PAUSA** por falta de
credenciales del owner.

## Objetivo

Añadir Google como provider OAuth 2.0 opcional en Auth.js, manteniendo credentials
como fallback. Solo usuarios ya activados en el sistema pueden vincular su cuenta
Google (no creación automática de cuentas nuevas).

## Alcance

1. **Provider Google en Auth.js**: añadir `Google` provider en `lib/auth.ts`.
2. **Vinculación controlada**: solo para usuarios con `activo=true` y membresía
   existente. No crear cuentas automáticamente.
3. **Fallback credentials**: el login por email+password sigue funcionando igual.
4. **Rate limit por email**: aplicar al login Google también (prevenir abuso).
5. **UI**: botón "Continuar con Google" en `/ingresar` (debajo del form credentials).
6. **Variables de entorno**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## No-alcance

- Creación automática de cuentas al primer login Google.
- Sincronización de datos de perfil desde Google (foto, nombre, etc.).
- Múltiples providers OAuth (solo Google).
- Migración masiva de usuarios existentes a Google SSO.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Cuenta Google sin vínculo en BD | Rechazar login con mensaje "Contacte al administrador para activar su cuenta." |
| Rate limit bypass por OAuth | Aplicar `excedeIntentos` por email antes de procesar callback Google. |
| Secreto `GOOGLE_CLIENT_SECRET` expuesto | `.env` only, nunca en código. `.env.example` sin valores reales. |
| Open redirect en callback OAuth | Auth.js maneja el callback; validar `redirect_uri` en Google Console. |

## Dependencias del owner (bloqueantes)

- [ ] `GOOGLE_CLIENT_ID` — Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client
- [ ] `GOOGLE_CLIENT_SECRET` — mismo lugar, descargar JSON
- [ ] Redirect URIs autorizadas:
  - Dev: `http://localhost:3000/api/auth/callback/google`
  - Prod: `https://<tu-dominio>/api/auth/callback/google`
- [ ] Decisión: ¿rol por defecto al vincular? (sugerencia: `residente`, cambiable por admin)

## Esfuerzo estimado

1 ventana (~2-3h de implementación + tests).

## Referencias

- `openspec/specs/AU-autenticacion-sesion/spec.md` §Autenticación Futura
- `lib/auth.ts` — provider Credentials actual
- `lib/auth.config.ts` — config edge-safe
- `app/ingresar/page.tsx` — UI de login
