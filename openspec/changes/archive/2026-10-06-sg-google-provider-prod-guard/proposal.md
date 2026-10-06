# Proposal: sg-google-provider-prod-guard

## Intent

Google provider en `lib/auth.ts` usa `process.env.GOOGLE_CLIENT_ID ?? ""` y `process.env.GOOGLE_CLIENT_SECRET ?? ""` — el fallback a string vacío permite que el build/startup suceda "exitosamente" pero el callback OAuth falla silenciosamente en producción. Este change hace que la app falle **temprano y ruidosamente** (en build/startup) si faltan las credenciales de Google en producción, en vez de fallar tarde y misteriosamente en el callback.

## Scope

### In Scope
- Modificar `lib/auth.ts` para validar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` al cargar el módulo (antes de `NextAuth()`) cuando `process.env.NODE_ENV === 'production'`; lanzar `Error` descriptivo si faltan
- Actualizar `.env.example` con documentación clara de `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (requeridos en producción, opcionales en dev)
- Añadir test unitario para la lógica de validación (cubre caso prod sin credenciales → throw, prod con credenciales → ok, dev sin credenciales → ok)

### Out of Scope
- Credenciales reales de Google Cloud Console (responsabilidad del owner)
- Cambios al flujo OAuth (callback, account linking, etc.)
- Otros proveedores OAuth (solo Google provider)

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- **AU-autenticacion-sesion**: Requirement "Estado implementado del scaffold (§1 — contexto)" — se añade validación fail-fast de credenciales Google en producción
- **SG-hardening-despliegue**: Requirement "Secretos de configuración por variables de entorno (C2-final)" — se extiende a validar que `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` existan en producción

## Approach

Añadir validación temprana en `lib/auth.ts` **antes** de la llamada a `NextAuth()`:

```typescript
// Validación fail-fast para Google provider en producción
if (process.env.NODE_ENV === 'production') {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production. ' +
      'Set them in your environment or disable the Google provider.'
    )
  }
}
```

En desarrollo (`NODE_ENV !== 'production'`), el comportamiento actual con fallback vacío se mantiene (permite desarrollo sin credenciales Google).

En `.env.example`, cambiar las líneas comentadas a documentadas con comentarios claros:

```bash
# Google SSO (OAuth 2.0) — opcional en dev, REQUERIDO en producción.
# Requiere credenciales de Google Cloud Console (APIs & Services > Credentials).
# En producción, la app NO arrancará sin estas variables.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `k0mp4ss_fe/apps/web/lib/auth.ts` | Modified | Añadir validación fail-fast antes de `NextAuth()` |
| `k0mp4ss_fe/apps/web/.env.example` | Modified | Documentar `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` como requeridos en prod |
| `k0mp4ss_fe/apps/web/test/lib/auth.prod-guard.test.ts` | New | Test unitario de la lógica de validación |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Rompe builds de producción existentes que no tienen las vars | High | El change está diseñado para esto: fallar temprano es el objetivo. El owner debe configurar las vars antes de desplegar. |
| Falsos positivos en CI si `NODE_ENV=production` en tests | Low | Tests usan `NODE_ENV=test` por defecto (Vitest). El test añadido simula `production` explícitamente. |
| Dev local rompe si alguien setea `NODE_ENV=production` | Low | Documentado en `.env.example`; dev normal usa `development`. |

## Rollback Plan

Revertir el bloque de validación en `lib/auth.ts` y restaurar `.env.example` a su estado anterior (comentado). El test se elimina.

## Dependencies

- Ninguna dependencia externa nueva
- Requiere que el owner configure `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en el entorno de producción antes de desplegar

## Success Criteria

- [ ] Build/startup en producción falla con `Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production...` si faltan las vars
- [ ] Build/startup en producción **éxitoso** si ambas vars están presentes y no vacías
- [ ] Dev local (`npm run dev`) funciona sin credenciales Google (fallback vacío mantenido)
- [ ] Test unitario pasa: prod sin vars → throw, prod con vars → ok, dev sin vars → ok
- [ ] `npm test` verde completo