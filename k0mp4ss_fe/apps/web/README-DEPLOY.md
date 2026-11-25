# README de Deploy — Compass

> Guía de despliegue para ambientes de producción. Última actualización: SERIE-PRODUCCION P6.

## Requisitos previos

- Node.js 24+ (`.nvmrc` = 24; `engines.node` = `>=24`)
- npm 11+ (`engines.npm` = `>=11`; ver más abajo)
- Cuenta en [Vercel](https://vercel.com)
- Base de datos PostgreSQL (cuando migres desde SQLite; ver post-serie)
- Dominio propio (opcional, recomendado para producción)

## Toolchain: Node y npm

Regla de npm local vs CI (SERIE-NOCHE-2 P3):

- `k0mp4ss_fe/package.json` declara `engines`: `node >=24` y `npm >=11`. npm solo
  avisa (`EBADENGINE`) si no calza; no falla salvo `engine-strict` (no está activo:
  el `.npmrc` del monorepo está vacío).
- Node 24.21.0 trae npm 11.19.0 (local) y el CI usa Node 24 → mismo npm 11. Un
  npm 12 futuro es compatible: `package-lock.json` usa `lockfileVersion: 3`
  (formato estable desde npm 9).
- **Nunca regenerar el lockfile** por diferencia de npm: CI corre `npm ci` sobre
  el lock existente; si un npm más nuevo lo toca, descartar el cambio.
- El campo `packageManager: "npm@10.8.2"` es un pin histórico del commit inicial:
  npm no lo interpreta (no hay shim de corepack para npm), la regla efectiva es
  `engines.npm`.

## Variables de entorno obligatorias

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | URL de PostgreSQL | `postgresql://user:pass@host/db` |
| `AUTH_SECRET` | Secreto para JWT (Auth.js) | `minimo-32-caracteres-aleatorios` |
| `NEXT_PUBLIC_APP_ENV` | Entorno explícito | `production` |

## Variables opcionales

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `PUBLIC_DOMAIN` | Dominio para HSTS preload | `compass.ejemplo.cl` |
| `SMTP_PASSWORD` | Password SMTP para notificaciones | (secreto) |
| `CLAVE_ELIMINACION_MAESTRO` | Clave maestra para eliminación | (secreto) |
| `LOG_LEVEL` | Nivel de logging (pino) | `info`, `warn`, `error` |
| `CRON_SECRET` | Secreto que Vercel envía como `Authorization: Bearer` a los dos crons (ver más abajo) | `openssl rand -hex 24` |

> ⚠️ **NUNCA commitear valores reales**. Usa `.env.local` en dev y el dashboard de Vercel en producción.

## Crons de Vercel (`CRON_SECRET`)

`k0mp4ss_fe/vercel.json` declara dos trabajos programados, y los dos se autentican con la misma
variable:

| Cron (UTC) | Ruta | Qué hace |
|------------|------|----------|
| `0 12 * * *` | `GET /api/vigencia-registro/avisos` | Barrido de avisos de vigencia de todas las comunidades con caso |
| `0 13 * * *` | `GET /api/co/cola` | Drena un lote acotado de la cola de salida del correo de CO, por comunidad con trabajo pendiente |

Las dos rutas emiten `GET`, no tienen sesión y exigen el encabezado
`Authorization: Bearer <CRON_SECRET>`. Vercel sólo agrega ese encabezado si la variable existe en el
proyecto; por eso **cargarla es parte del despliegue**, no un extra:

1. Genera un valor aleatorio: `openssl rand -hex 24`.
2. Cárgalo en Vercel → Settings → Environment Variables como `CRON_SECRET` (production, y preview si
   los crons corren ahí). El cambio aplica al siguiente deployment.
3. Verifica la primera corrida en Vercel → Deployments → Cron Jobs (log de la invocación).

Sin la variable, las rutas fallan cerrado y no escriben nada: `GET /api/vigencia-registro/avisos`
responde 500 y `GET /api/co/cola` responde 401. Con la variable cargada pero un bearer distinto, las
dos responden 401 antes de leer la base.

El cron de CO no reemplaza al botón de la consola: `POST /api/co/cola` sigue drenando cuando la
administración lo pide. La corrida programada toma el lote de omisión por comunidad (25 filas), no la
cola entera: lo que sobra espera la corrida siguiente o el botón.

Rotar el secreto no requiere tocar código: se cambia en el dashboard y el siguiente deployment lo usa.

## Deploy automático (CD)

Cada push a `main` dispara el pipeline de GitHub Actions:

1. **Unit tests** (Vitest)
2. **E2E tests** (Playwright)
3. **Deploy a Vercel** (si los tests pasan)

Configura estos secrets en GitHub → Settings → Secrets:

- `VERCEL_TOKEN` — Token de Vercel
- `VERCEL_ORG_ID` — ID de organización
- `VERCEL_PROJECT_ID` — ID del proyecto

> El job `deploy` es **condicional a los secrets**: si no están cargados, el workflow lo saltea con
> un `warning` visible (`Deploy omitido`) y el resto del CI queda verde. Al cargarlos, el job
> corre solo en el próximo push a `main`, sin tocar el workflow.

## Deploy manual (fallback)

```bash
# 1. Asegúrate de tener VERCEL_TOKEN
export VERCEL_TOKEN=tk_xxx

# 2. Deploy
npm run deploy:vercel
```

## Primer arranque en producción

1. Configura las variables de entorno en Vercel dashboard
2. Corre `npx prisma migrate deploy` (la primera vez)
3. Crea el usuario admin inicial (solo en staging/dev; en prod créalo manualmente con seguridad)

## Rollback

En Vercel dashboard:
1. Ve a tu proyecto
2. Selecciona el deployment anterior
3. Click "Promote to Production"

## Health check

Verifica el estado post-deploy:

```bash
curl https://tu-dominio.com/api/health
```

Debe retornar:
```json
{"status":"ok","timestamp":"...","version":"1.0.0","checks":{"database":"ok","auth":"ok"}}
```
