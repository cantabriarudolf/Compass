> **Este archivo ES tu prompt.** Ventana 2 de la serie revision.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie revision)

Project: Compass (Next.js 16 + TypeScript + Prisma + SQLite + Auth.js + Zustand persist).
Método del proyecto: por cada cambio → openspec-propose → implementar con openspec-apply-change
→ validar → commitear (conventional español) → sincronizar specs mains y archivar con
openspec-archive-change → skill nsgc-prepush antes de cualquier push.
Reglas permanentes: dato de dominio solo vía acciones del store (repository + StoreResult);
mocks de data/ son solo seed; D1 media por referencia (sin base64/Blob); secretos jamás en
localStorage ni código; cada cambio de esquema del store = bump STORE_VERSION + migrate + test.
Verificación por ventana: cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores)
&& npm test (suite completa verde) + openspec validate --all sin fallos.
`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
No commitear Untitled.md. Si tu contexto se agota: cierra la tarea en curso + commit + deja
el estado exacto en openspec/SERIE-REVISION/00-plan.md.

Estado previo: STORE_VERSION = 27, tests 515/516 pasan (1 roto en RA), e2e 86/88 pasan,
build limpio, tsc limpio, lint 43 warnings (0 errores), último commit 7108e1c.

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` (tree limpio) y `git status -sb` (sin "ahead": todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite completa verde.
4. Contrasta con `openspec/SERIE-REVISION/00-plan.md`:
   - Fila P1 HECHA y todo OK → marca tu fila EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero (change fix pequeño + test), anótalo en la
     Bitácora, y solo después empieza tu alcance.
   - PARCIAL o repo a medias → completa ESE alcance antes del tuyo (deriva de la Bitácora
     y las specs).
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P2 — Security Audit Parte I: AuthZ)

Objetivo: Revisión OWASP A01 (Broken Access Control) + A07 (Auth failures) enfocada en
authorization y autenticación.

### Tarea 2.1 — Revisión de `lib/authz.ts`

- Leer completamente `lib/authz.ts` y `lib/authz.test.ts`
- Verificar que `puede()` cubra todos los recursos declarados en specs RP
- Verificar que `puedeContextual()` (ABAC) evalúa correctamente: rol + acción + recurso + contexto
- Buscar paths donde `puede()` se llama pero `puedeContextual()` debería usarse
- Verificar que la matriz contextual en `/admin/permisos` no permite bypass
- Buscar IDOR (Insecure Direct Object Reference): ¿algún endpoint usa IDs sin verificar
  comunidad/permiso del usuario?

### Tarea 2.2 — Revisión de middleware y rutas

- Revisar `middleware.ts` (o `proxy.ts` si aplica) para auth checks en rutas admin
- Verificar que `/api/*` sensibles validen sesión antes de procesar
- Revisar `app/admin/*` y `app/api/*` routes: ¿hay handlers sin auth check?
- Verificar que `puede()` / `puedeContextual()` se llamen en server components/actions
- Revisar si hay client-side-only checks que puedan saltarse (nunca confiar en cliente)

### Tarea 2.3 — Auth.js configuration

- Revisar `lib/auth.ts` (o donde esté la config de Auth.js)
- Verificar JWT secret: ¿viene de `AUTH_SECRET` env? ¿no hardcodeado?
- Verificar session strategy (JWT vs database) y timeouts
- Verificar rate limit: ¿persistente en BD? ¿cubre login por IP + email?
- Verificar que el adapter Prisma propio scopée por comunidad

### Tarea 2.4 — Hallazgos y fixes

- Documentar cada hallazgo con: severidad (Critical/High/Medium/Low), archivo:linea,
  descripción del riesgo, fix propuesto.
- Aplicar fixes que sean pequeños y seguros inline.
- Para fixes grandes o riesgosos: documentar en `openspec/changes/revision-seguridad-authz/`
  como change para futura ventana.
- Si algún fix requiere test nuevo, escribirlo.

## Verificación obligatoria antes de reportar

```bash
cd k0mp4ss_fe/apps/web
npx tsc --noEmit
npm run lint
npm test
```

## Reporte final estandarizado (OBLIGATORIO)

1. Ventana y estado (HECHA/PARCIAL + motivo).
2. Commits (hash + subject) y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK, hallazgos por severidad.
5. Desviaciones vs el prompt.
6. Pendientes heredados a la(s) ventana(s) siguiente(s).
7. Última línea exacta: `BITACORA_ENTRY: <resumen 2-3 líneas>`.
