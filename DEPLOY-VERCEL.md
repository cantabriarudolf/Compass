# Variables de entorno para Vercel

Copiá estas variables una por una en la sección "Environment Variables" del dashboard de Vercel.

---

## Variable 1: DATABASE_URL

       **Key:** `DATABASE_URL`

**Value:**
```
postgresql://neondb_owner:npg_ljUxkn7z0Cfr@ep-wandering-fire-a51bklbe-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

---

## Variable 2: AUTH_SECRET

**Key:** `AUTH_SECRET`

**Value:** (generá una clave nueva ejecutando esto en tu terminal)
```bash
       node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Ejemplo de cómo se ve una clave válida:
```
MEZkJKwbX7sYxRbL_o1J7wF9jK2mN3pQ8vC4xZ6yA1b
```

---

## Variable 3: GOOGLE_CLIENT_ID

**Key:** `GOOGLE_CLIENT_ID`

**Value:**
```
304323085214-38s4c84a40ml731ohfdvma1v9tmg2vu1.apps.googleusercontent.com
```

---

## Variable 4: GOOGLE_CLIENT_SECRET

**Key:** `GOOGLE_CLIENT_SECRET`

**Value:**
```
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
```

---

## Variable 5: NEXT_PUBLIC_APP_ENV

**Key:** `NEXT_PUBLIC_APP_ENV`

**Value:**
```
production
```

---

## Variable 6: CLAVE_CIFRADO_DATOS

**Key:** `CLAVE_CIFRADO_DATOS`

**Value:** (generá otra clave nueva, igual que AUTH_SECRET)
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Ejemplo de cómo se ve una clave válida:
```
TKmN4pQ8vC4xZ6yA1bMEZkJKwbX7sYxRbL_o1J7wF9jK2
```

---

## Paso final en Vercel

1. Andá a tu proyecto en Vercel
2. Click en **"Settings"** (pestaña arriba)
3. Click en **"Environment Variables"** (menú izquierdo)
4. Agregá una por una las 6 variables de arriba
5. Click en **"Save"**
6. Volvé al dashboard principal y hacé **"Redeploy"**

---

## Nota de seguridad

Este archivo (`DEPLOY-VERCEL.md`) está en tu repo. **No lo commitees con secretos reales.** Ya lo agregué al `.gitignore` para que no se suba a GitHub.

Si ya generaste las claves, borrá este archivo después de usarlo.
