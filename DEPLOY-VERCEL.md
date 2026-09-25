# Deploy de Compass en Vercel — Instrucciones actualizadas

## ⚠️ Problema con el proyecto anterior

El proyecto anterior (`compass-iota-rouge`) tiene un bug de región (`Invalid region selector: "scl1"`).
**Eliminalo** y creá uno nuevo.

---

## Paso 1: Eliminar proyecto viejo (si existe)

1. Andá a [vercel.com/dashboard](https://vercel.com/dashboard)
2. Buscá el proyecto con error (ej: `compass-iota-rouge`)
3. Click en **Settings** → **General** → scroll abajo → **Delete Project**

---

## Paso 2: Crear proyecto nuevo

1. Vercel Dashboard → **"Add New Project"**
2. Importá `cantabriarudolf/Compass`
3. Configuración:

| Campo | Valor |
|---|---|
| **Project Name** | `compass` (o el que prefieras) |
| **Framework Preset** | Next.js |
| **Root Directory** | `k0mp4ss_fe/apps/web` |
| **Build Command** | `next build` |
| **Output Directory** | `.next` |
| **Region** | **NO cambies** — dejá el default (`iad1` Washington D.C.) |

4. Click **"Deploy"**

---

## Paso 3: Variables de entorno

Andá a **Settings** → **Environment Variables** y agregá estas 6:

### Variable 1: DATABASE_URL
**Key:** `DATABASE_URL`
**Value:**
```
postgresql://neondb_owner:npg_ljUxkn7z0Cfr@ep-wandering-fire-a51bklbe-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

### Variable 2: AUTH_SECRET
**Key:** `AUTH_SECRET`
**Value:**
```
vnPhS1WUq3bt09TengBWizrmkdJz6KCJOk-MtbWm8DQ
```

### Variable 3: GOOGLE_CLIENT_ID
**Key:** `GOOGLE_CLIENT_ID`
**Value:**
```
304323085214-38s4c84a40ml731ohfdvma1v9tmg2vu1.apps.googleusercontent.com
```

### Variable 4: GOOGLE_CLIENT_SECRET
**Key:** `GOOGLE_CLIENT_SECRET`
**Value:**
```
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
```

### Variable 5: APP_ENV
**Key:** `APP_ENV`
**Value:** `production`

### Variable 6: CLAVE_CIFRADO_DATOS
**Key:** `CLAVE_CIFRADO_DATOS`
**Value:**
```
OZeSgPzSglXPjFn_3nrGntGzElwZCucTSMLeIyVxkTc
```

---

## Paso 4: Deploy

1. Guardá las variables
2. Volvé al dashboard principal
3. Hacé **"Redeploy"** o esperá que se deploye automáticamente

---

## Verificación

Una vez deployado, tu app va a estar en:
`https://compass-[random].vercel.app`

Probar:
- `/ingresar` → login con credentials
- `/ingresar` → botón "Continuar con Google"
- `/admin` → panel administrativo

---

## ⚠️ IMPORTANTE DE SEGURIDAD

**NO commitees este archivo.** Ya está en `.gitignore`.
**Después de usarlo, borralo** de tu máquina. Las claves generadas acá son secretos de producción.
