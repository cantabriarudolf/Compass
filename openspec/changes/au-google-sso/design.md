# Design: Google SSO

## Arquitectura

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Usuario   │────▶│ /ingresar   │────▶│ "Continuar  │
│             │     │   (UI)      │     │  con Google"│
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Auth.js     │
                                        │ Google      │
                                        │ Provider    │
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Google      │
                                        │ OAuth 2.0   │
                                        │ (consent)   │
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ Callback    │
                                        │ /api/auth/  │
                                        │ callback/   │
                                        │ google      │
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ authorize   │
                                        │ (nuestro)   │
                                        │ callback    │
                                        └──────┬──────┘
                                               │
                              ┌────────────────┴────────────────┐
                              │                                 │
                              ▼                                 ▼
                        ┌──────────┐                    ┌──────────┐
                        │ Email    │                    │ Email    │
                        │ existe   │                    │ no       │
                        │ en BD    │                    │ existe   │
                        └────┬─────┘                    └────┬─────┘
                             │                              │
                             ▼                              ▼
                        ┌──────────┐                  ┌──────────┐
                        │ Login    │                  │ Error:   │
                        │ exitoso  │                  │ "Contacte│
                        │ (JWT)    │                  │ admin"   │
                        └──────────┘                  └──────────┘
```

## Implementación

### 1. Provider Google en `lib/auth.ts`

```typescript
import Google from "next-auth/providers/google"

// En el array providers, después de Credentials:
Google({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  allowDangerousEmailAccountLinking: false, // NO vincular automáticamente
})
```

### 2. Callback `signIn` en `lib/auth.ts`

```typescript
signIn: async ({ user, account, profile }) => {
  if (account?.provider === "google") {
    const email = user.email?.toLowerCase()
    if (!email) return false

    // Verificar que el usuario existe y está activo
    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: { membresias: true },
    })

    if (!usuario || !usuario.activo) {
      // No revelar si existe o no (fail-closed)
      return "/ingresar?error=OAuthAccountNotLinked"
    }

    // Rate limit por email
    const clave = `google:${email}`
    if (await excedeIntentos(clave)) {
      return "/ingresar?error=rate_limited"
    }

    limpiarIntentos(clave)
    return true
  }
  return true // credentials sigue su flujo normal
}
```

### 3. Callback `jwt` — enriquecer token con datos de BD

Para usuarios Google, el `sub` del JWT debe ser el `Usuario.id` de BD (no el
`sub` de Google). Esto permite que el resto del sistema (authz, sesión, etc.)
funcione sin cambios.

```typescript
jwt: async ({ token, user, account }) => {
  if (account?.provider === "google" && user.email) {
    const u = await prisma.usuario.findUnique({
      where: { email: user.email.toLowerCase() },
    })
    if (u) {
      token.sub = u.id
      token.email = u.email
    }
  }
  // ... resto del callback jwt existente
}
```

### 4. UI en `/ingresar`

Añadir debajo del form de credentials:

```tsx
<div className="relative my-4">
  <div className="absolute inset-0 flex items-center">
    <span className="w-full border-t" />
  </div>
  <div className="relative flex justify-center text-xs uppercase">
    <span className="bg-background px-2 text-muted-foreground">O</span>
  </div>
</div>
<button
  onClick={() => signIn("google", { callbackUrl: destinoSeguro })}
  className="w-full flex items-center justify-center gap-2 ..."
>
  <GoogleIcon />
  Continuar con Google
</button>
```

### 5. Variables de entorno

```bash
# .env (local)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# .env.example (sin valores)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### 6. Tests

- `test/auth/google-sso.test.ts`:
  - Login Google con email existente y activo → éxito
  - Login Google con email inexistente → error genérico
  - Login Google con email inactivo → error genérico
  - Rate limit por email después de N intentos fallidos
  - JWT `sub` = `Usuario.id` (no Google sub)

## Cambios en archivos

| Archivo | Cambio |
|---|---|
| `lib/auth.ts` | Añadir Google provider, callbacks signIn/jwt |
| `app/ingresar/page.tsx` | Botón Google + separador |
| `lib/auth.config.ts` | Verificar que no rompe edge-safe |
| `test/auth/google-sso.test.ts` | Nuevo: tests de integración |
| `.env.example` | Añadir `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
