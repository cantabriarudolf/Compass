# Troubleshooting — Compass para Developers

> Guía de problemas comunes durante desarrollo. SERIE-PRODUCCION P6.

## `npm run build` falla por Google Fonts

**Síntoma:** Error de red al descargar fuentes de Google durante build.

**Soluciones:**
1. Ignóralo si es en CI (Vercel tiene red)
2. En local sin red: usa modo offline o comenta las fuentes temporalmente
3. Considera self-hosting de fuentes (descarga y sirve localmente)

## Tests E2E fallan por timeout

**Síntoma:** Playwright timeout en cold-start de Turbopack.

**Solución:** Aumenta `testTimeout` en `playwright.config.ts` (default: 30s → 60s).

```typescript
// playwright.config.ts
export default defineConfig({
  testTimeout: 60000,
})
```

## `prisma generate` no genera el cliente

**Síntoma:** Error "Cannot find module '@prisma/client'".

**Soluciones:**
1. Verifica `DATABASE_URL` en `.env`
2. Corre `npx prisma generate` desde `k0mp4ss_fe/apps/web`
3. Si falla: `rm -rf node_modules/.prisma && npx prisma generate`

## Error "Unauthorized" en APIs

**Checklist:**
1. ¿Tienes sesión activa? (`/ingresar`)
2. ¿Tu rol tiene permiso para ese recurso? (ver `lib/authz.ts`)
3. ¿El token JWT no expiró? (cierra sesión y vuelve a entrar)
4. ¿`AUTH_SECRET` coincide entre build y runtime?

## Pre-commit hooks muy lentos

**Para emergencias** (saltar hooks):
```bash
git commit --no-verify -m "tu mensaje"
```

**Optimización:** Si `tsc --noEmit` es lento, considera quitarlo del pre-commit y dejarlo solo en CI.

## `localStorage` quota exceeded

**Síntoma:** Error en consola al guardar en store.

**Solución:** El store persiste ~40 colecciones. Si excede 5MB:
1. Limpia datos de demo (`npm run seed:authz` con opción de limpiar)
2. Considera no persistir colecciones grandes (ajusta `partialize`)

## Coverage baja en archivo nuevo

**Síntoma:** CI falla porque coverage bajó del threshold.

**Solución:** Añade tests básicos para el archivo nuevo. No es necesario 100%, pero cubre los paths principales.
