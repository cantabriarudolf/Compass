# Proposal: au-google-provider-disabled

## Problema
El fail-fast de `lib/auth.ts` exige `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` cuando
`NODE_ENV === 'production'` y su mensaje promete "…or disable the Google provider",
pero **esa bandera no existe** (deuda registrada en `openspec/BACKLOG-100.md`, fila
`GOOGLE_PROVIDER_DISABLED`; origen `design.md § D5.5` de
`ci-verde-ratchet-cobertura`). En CI se sortea con credenciales dummy
(`scripts/e2e-fresh.mjs` setea `GOOGLE_CLIENT_ID=ci-dummy` / `GOOGLE_CLIENT_SECRET=ci-dummy`)
solo para poder construir: un build de producción sin esas dummy revienta en el
module-load aunque el entorno no vaya a usar Google SSO.

## Propuesta
1. Bandera `GOOGLE_PROVIDER_DISABLED=1` leída al load de `lib/auth.ts`:
   (a) salta el fail-fast de producción y (b) no registra el provider `Google`
   (queda solo `Credentials`). Cualquier otro valor (incluido vacío/ausente) deja
   el comportamiento actual exacto: dev permite credenciales vacías, producción
   las exige y registra Google.
2. Mensaje de error actualizado para nombrar `GOOGLE_PROVIDER_DISABLED=1`.
3. Tests TDD `test/auth-google-provider.test.ts`: module-load con
   `vi.resetModules()` + import dinámico por test, capturando la config pasada a
   `NextAuth()` con mock de su default (patrón de `test/auth/google-sso-callbacks.test.ts`).
4. Documentación: `.env.example` (junto a `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`)
   + `docs/runbook-operaciones.md` (cuándo sí usarla y cuándo NO).
5. Delta openspec en `AU-autenticacion-sesion`: `MODIFIED` del requirement
   scaffold (mensaje nuevo + salvo-clause de la bandera) y `ADDED` del requirement
   de la bandera. **No se archiva en esta unidad.**

## No-objetivos
- Cablear la bandera en `.github/workflows/ci.yml` (los `ci-dummy` siguen mientras
  el job de build los necesite; cambio de CI aparte).
- Modificar los callbacks `signIn`/`jwt` de Google (con la bandera quedan inertes
  porque ningún provider los dispara; sin cambios).
- Activar/desactivar Google en la UI `/ingresar` (el botón existe hoy siempre;
  es cambio de producto aparte).
- Archivar el change (lo decide el orquestador tras CI verde).
