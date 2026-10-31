> **Este archivo ES tu prompt.** Ventana P2 de la serie produccion-fase2.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie produccion-fase2)

Estado previo: Compass, Next.js 16, PostgreSQL en Neon. Tests: 552 unit. CI/CD completo. STORE_VERSION=27.

Método: openspec-propose → apply → archive → commit → nsgc-prepush.
Reglas: secretos jamás en localStorage; cambio de esquema store = bump STORE_VERSION + migrate + test.
Verificación: tsc 0 errores, lint 0 errores, npm test verde, openspec validate OK.

## Arranque: verificación de la ventana anterior (P1)

1. git status (tree limpio) y git status -sb y git log --oneline -8.
2. openspec validate --all → sin fallos.
3. cd k0mp4ss_fe/apps/web && npm test → suite completa verde.
4. Contrasta con openspec/SERIE-PRODUCCION-FASE2/00-plan.md:
   - Fila P1 HECHA y todo OK → marca tu fila P2 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero, anótalo en la Bitácora.
   - PARCIAL → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P2 — Password policy + JWT 24h + invalidación de sesiones)

### Tarea 1: Password policy

1. En `lib/auth.ts` (authorize), añadir validación de password:
   - Mínimo 8 caracteres
   - Al menos 1 mayúscula, 1 minúscula, 1 número
   - Opcional: 1 símbolo
2. Mensaje de error amigable en español (no revelar qué regla falló específicamente, solo "La contraseña no cumple con los requisitos de seguridad").
3. Crear `lib/password-policy.ts` con función `validarPassword(password): { valido: boolean, errores: string[] }`
4. Tests: al menos 6 casos (vacía, corta, sin mayúscula, sin número, válida, muy larga).

### Tarea 2: Reducir sesión JWT a 24h con sliding refresh

1. En `lib/auth.config.ts`:
   - Cambiar `session.maxAge` de `30 * 24 * 60 * 60` (30 días) a `24 * 60 * 60` (24 horas)
   - Añadir `session.updateAge: 60 * 60` (1 hora) — sliding refresh: si el usuario está activo, la sesión se extiende
2. En `lib/auth.ts` (jwt callback):
   - Añadir `iat` (issued at) al token
   - Verificar que el token no haya expirado en cada request
3. Documentar el cambio en comentarios.

### Tarea 3: Invalidación de sesiones al cambiar rol/estado

1. En `lib/auth.ts` (jwt callback):
   - Incluir un `sessionVersion` o `tokenVersion` en el JWT
   - Guardar `tokenVersion` en modelo `Usuario` (nuevo campo `tokenVersion Int @default(0)`)
2. Cuando un admin cambia el rol de un usuario o lo desactiva:
   - Incrementar `tokenVersion` del usuario en BD
   - El jwt callback compara `token.tokenVersion` vs `usuario.tokenVersion`: si difieren, invalida la sesión (redirige a login)
3. En `app/api/admin/usuarios/route.ts` (PUT/PATCH):
   - Al cambiar `activo` o `roles`, incrementar `tokenVersion`
4. Migración Prisma para añadir `tokenVersion` a `Usuario`.
5. Tests: al menos 4 casos (token válido, token invalidado por cambio de rol, token invalidado por desactivación, refresh exitoso).

### Tarea 4: Seed de demo seguro

1. En `lib/seed-authz.ts` y `scripts/seed-authz.mjs`:
   - La password `test1234` debe cumplir con la nueva policy (NO cumple: falta mayúscula)
   - Cambiar a `Test1234!` o similar que pase la policy
2. Documentar en comentarios que estas credenciales son SOLO para desarrollo.

### Tarea 5: Validación final

1. `npx prisma migrate deploy` → sin errores
2. `npx tsc --noEmit` → 0 errores
3. `npm test` → suite completa verde
4. `npm run lint` → 0 errores
5. `openspec validate --all` → sin fallos

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado: P2 HECHA/PARCIAL + motivo.
2. Commits: hash + subject y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK.
5. Desviaciones vs el prompt.
6. Pendientes heredados.
7. Última línea exacta: `BITACORA_ENTRY: P2 — Password policy + JWT 24h + invalidación sesiones (commit <hash>)`.
