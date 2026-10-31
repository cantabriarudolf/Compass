> **Este archivo ES tu prompt.** Ventana P3 de la serie produccion-fase2.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie produccion-fase2)

Estado previo: Compass, Next.js 16, PostgreSQL en Neon. Tests: 552+ unit. CI/CD completo. STORE_VERSION=27+. Password policy y JWT 24h implementados.

Método: openspec-propose → apply → archive → commit → nsgc-prepush.
Reglas: secretos jamás en localStorage; cambio de esquema store = bump STORE_VERSION + migrate + test.
Verificación: tsc 0 errores, lint 0 errores, npm test verde, openspec validate OK.

## Arranque: verificación de la ventana anterior (P2)

1. git status (tree limpio) y git status -sb y git log --oneline -8.
2. openspec validate --all → sin fallos.
3. cd k0mp4ss_fe/apps/web && npm test → suite completa verde.
4. Contrasta con openspec/SERIE-PRODUCCION-FASE2/00-plan.md:
   - Filas P1-P2 HECHAS y todo OK → marca tu fila P3 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero.
   - PARCIAL → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P3 — 2FA/TOTP con Google Authenticator)

### Tarea 1: Instalar librería TOTP

1. Instala `speakeasy` (generación/verificación TOTP) y `qrcode` (generación de QR):
   ```bash
   npm install speakeasy qrcode
   npm install --save-dev @types/speakeasy @types/qrcode
   ```

### Tarea 2: Schema Prisma para 2FA

1. Añadir campos al modelo `Usuario`:
   ```prisma
   twoFactorSecret    String?   // Base32 secret para TOTP
   twoFactorEnabled   Boolean   @default(false)
   twoFactorBackupCodes String?  // JSON array de códigos de respaldo hasheados
   ```
2. Generar migración: `npx prisma migrate dev --name add_2fa`

### Tarea 3: API para configurar 2FA

1. Crear `app/api/auth/2fa/setup/route.ts`:
   - POST: Genera secret TOTP, guarda en `twoFactorSecret` (temporal, no enabled aún)
   - Retorna: URL para QR code (`otpauth://totp/Compass:{email}?secret={secret}&issuer=Compass`)
   - El usuario escanea el QR con Google Authenticator
2. Crear `app/api/auth/2fa/verify-setup/route.ts`:
   - POST: Recibe código TOTP de 6 dígitos del usuario
   - Verifica con speakeasy contra `twoFactorSecret`
   - Si válido: setea `twoFactorEnabled = true`, genera backup codes
   - Retorna backup codes (solo una vez, el usuario debe guardarlos)
3. Crear `app/api/auth/2fa/disable/route.ts`:
   - POST: Requiere contraseña actual para confirmar
   - Elimina `twoFactorSecret`, setea `twoFactorEnabled = false`

### Tarea 4: Integrar 2FA en login

1. Modificar `lib/auth.ts` (authorize):
   - Después de validar credenciales, si `usuario.twoFactorEnabled`:
     - NO retornar usuario todavía
     - Generar un token temporal de 2FA (JWT corto, 5 minutos)
     - Retornar `{ requires2FA: true, tempToken: "..." }`
2. Crear `app/api/auth/2fa/verify/route.ts`:
   - POST: Recibe `tempToken` + código TOTP
   - Verifica tempToken (JWT corto)
   - Verifica TOTP con speakeasy
   - Si válido: retorna sesión completa (como login normal)
3. Modificar página de login (`/ingresar`) o crear `/ingresar/2fa`:
   - Si el login retorna `requires2FA: true`, mostrar input de 6 dígitos
   - Enviar a `/api/auth/2fa/verify`
   - Por ahora, solo API — la UI puede hacerse en ventana posterior si no hay tiempo

### Tarea 5: Backup codes

1. Generar 10 códigos de respaldo aleatorios (8 caracteres alfanuméricos)
2. Hashear cada uno con bcrypt (cost 10)
3. Guardar array hasheado en `twoFactorBackupCodes`
4. API para usar backup code: `POST /api/auth/2fa/backup`
   - Verifica código contra hashes
   - Si válido: consume el código (eliminar del array) y retorna sesión
   - Si quedan < 3 códigos: advertir al usuario

### Tarea 6: Tests

1. Tests para generación/verificación TOTP (3 casos)
2. Tests para backup codes (3 casos)
3. Tests para flujo de login con 2FA (2 casos)

### Tarea 7: Validación final

1. `npx prisma migrate deploy` → sin errores
2. `npx tsc --noEmit` → 0 errores
3. `npm test` → suite completa verde
4. `npm run lint` → 0 errores
5. `openspec validate --all` → sin fallos

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado: P3 HECHA/PARCIAL + motivo.
2. Commits: hash + subject y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK.
5. Desviaciones vs el prompt.
6. Pendientes heredados.
7. Última línea exacta: `BITACORA_ENTRY: P3 — 2FA/TOTP con Google Authenticator + backup codes (commit <hash>)`.
