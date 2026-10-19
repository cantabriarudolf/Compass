# Runbook de Operaciones — Compass

> Procedimientos para incidentes comunes. SERIE-PRODUCCION P6.

## Escenario: Base de datos no responde

1. Verifica `/api/health` — debe retornar `checks.database: "ok"`
2. Revisa logs: `lib/logger.ts` escribe JSON estructurado; busca errores de Prisma
3. Verifica `DATABASE_URL` en Vercel dashboard
4. Si usas PostgreSQL: verifica connection limits y pooling

## Escenario: Error 500 en producción

1. Revisa logs en Vercel dashboard (Functions → Logs)
2. Busca errores de pino con `level: "error"`
3. Si el error es de auth: verifica `AUTH_SECRET` y sesiones JWT
4. Si es de BD: verifica migraciones (`npx prisma migrate status`)

## Escenario: Rate limit activado

1. Identifica la clave bloqueada (IP o email) en logs
2. Para limpiar manualmente (SQLite dev):
   ```bash
   npx prisma db execute --stdin <<< "DELETE FROM RateLimitAttempt WHERE clave = 'la-clave';"
   ```
3. En producción (PostgreSQL): usa el panel de tu proveedor o psql

## Escenario: Deploy falló

1. Míralo en GitHub Actions → job `deploy` del workflow CI
2. Si el run muestra `Deploy omitido` (warning), **no es una falla**: faltan los secrets de
   Vercel (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) y el job se saltea a propósito.
   Cárgalos en Settings → Secrets y el job corre solo en el próximo push a `main`.
3. Si el job corrió y falló, revisa el error del CLI (`vercel pull|build|deploy`) en el log
4. Si es timeout: el build puede ser muy grande; considera `output: standalone`
5. Rollback manual: Vercel dashboard → deployments → promote el anterior

## Escenario: Backup urgente

**Dev (SQLite):**
```bash
npm run backup:db
```
Crea copia en `Data/NSGC/backups/db-<timestamp>/`.

**Producción (PostgreSQL):**
Usa el mecanismo de backups de tu proveedor:
- Vercel Postgres: automático (point-in-time recovery)
- Supabase: backups automáticos diarios
- Neon: branches + point-in-time restore

## Escenario: Lane e2e local (base fresca)

La lane e2e **siempre** arranca con una base descartable fresca: datos viejos de corridas
anteriores producen falsos positivos (duplicados, estados residuales).

```bash
cd k0mp4ss_fe/apps/web
npm run e2e:fresh                       # base prisma/perf-e2e.db desde cero + seed completo
# npm run e2e:fresh -- --db perf-noche.db   # nombre propio (convención perf*.db, gitignored)
# npm run e2e:fresh -- --keep-db --no-build # reusar la base y saltear el build
```

Flags propios (siempre **antes** del separador `--`): `--db <archivo>` (base descartable relativa a
`prisma/`, default `perf-e2e.db`), `--keep-db` (no recrear la base), `--no-build` (saltear el build)
y `--help`. Lo que siga al separador `--` se pasa tal cual a Playwright y dispara la corrida.

El script hace paridad con el job `e2e` del CI: `prisma migrate deploy
--schema=prisma/schema.sqlite.prisma` con `DATABASE_URL=file:./<nombre>.db`, luego
`npx prisma generate --schema=prisma/schema.sqlite.prisma` (regenera el client Prisma
para SQLite: si el último generate fue el default PostgreSQL — p. ej. tras el job
`unit-pg` — el seed fallaría con exit 1; fix R3-missing-prisma-generate), luego
`npm run e2e:reseed-base` (usuarios TEST + mocks), y termina imprimiendo las advertencias
y el comando Playwright exacto con paridad CI (`CI=1 … npx playwright test <specs>
--reporter=list`). **Nunca toca `prisma/dev.db`** (el nombre se valida y `DATABASE_URL` se
fija explícitamente para los subprocesos).

Dos reglas duras de la lane:

1. **Base fresca por corrida**: recreá la base con `npm run e2e:fresh` antes de cada lane.
2. **Nunca correr primero el spec de rate-limit** (`e2e/auth/rate-limit.spec.ts` con
   `E2E_RATE_LIMIT=1`): bloquea la IP 15 minutos y aborta `auth.setup`. Corre SOLO al final
   y aislado, después de la lane normal.

## Escenario: APIs de escritura bloqueadas (env-guard)

Las APIs de escritura (`/api/qa-lab/purga-test`, `/api/backup`, `/api/dev-dashboard`, …)
las controla `isWriteApiEnabled()` (`lib/env-guard.ts`). En un build de producción
(`next start`, `NODE_ENV=production`) están **bloqueadas por defecto** (404), incluso con
`NEXT_PUBLIC_APP_ENV=development`.

Existe un opt-in explícito **solo para el entorno de pruebas/e2e**:

```bash
E2E_ALLOW_WRITE_APIS=1   # solo lane e2e (job `e2e` del CI)
```

Tiene **doble candado**: habilita escrituras solo si además
`NEXT_PUBLIC_APP_ENV=development`. Un entorno con `NEXT_PUBLIC_APP_ENV=production` (como
Vercel/producción) sigue bloqueado aunque el opt-in esté seteado.

**Producción NO debe setear `E2E_ALLOW_WRITE_APIS`** (change `e2e-guard-optin-ci`): es
exclusivo de la lane e2e, donde sin él la limpieza bulk del QA-Lab cae al fallback O(n) y
revienta los 120 s estrictos de las limpiezas de cola.

## Escenario: Build sin credenciales Google (GOOGLE_PROVIDER_DISABLED)

El guard de `lib/auth.ts` es fail-fast en producción: sin `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` la app **no arranca**. La bandera
`GOOGLE_PROVIDER_DISABLED=1` es el opt-out documentado en su propio mensaje de
error (change `au-google-provider-disabled`):

```bash
GOOGLE_PROVIDER_DISABLED=1   # (a) salta el fail-fast de producción
                             # (b) NO registra el provider Google (solo Credentials)
```

- **Aplicación exacta**: solo el valor `1` activa la bandera; vacío, ausente o
  cualquier otro valor dejan el comportamiento normal (dev permite credenciales
  vacías; producción las exige).
- **Cuándo usarla**: builds/entornos sin credenciales Google reales (p. ej. CI,
  donde históricamente se usaban `ci-dummy` solo para poder construir).
- **Cuándo NO usarla**: cualquier entorno de producción con SSO Google activo —
  con la bandera el botón "Continuar con Google" deja de existir porque el
  provider no está registrado.
- Documentada también en `.env.example` (junto a `GOOGLE_CLIENT_ID`/`SECRET`).

## Contactos y escalación

- **Owner del proyecto**: (agregar)
- **Proveedor hosting (Vercel)**: https://vercel.com/help
- **Base de datos**: (depende del proveedor elegido)
