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

1. Revisa GitHub Actions → tab de tu workflow → logs del job `deploy`
2. Verifica secrets configurados (`VERCEL_TOKEN`, etc.)
3. Si es timeout: el build puede ser muy grande; considera `output: standalone`
4. Rollback manual: Vercel dashboard → deployments → promote anterior

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

## Contactos y escalación

- **Owner del proyecto**: (agregar)
- **Proveedor hosting (Vercel)**: https://vercel.com/help
- **Base de datos**: (depende del proveedor elegido)
