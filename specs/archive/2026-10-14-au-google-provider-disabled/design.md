# Design: au-google-provider-disabled

## Contexto
- Guard en `k0mp4ss_fe/apps/web/lib/auth.ts` (module-load, antes de `NextAuth()`):
  fail-fast si `NODE_ENV === 'production'` y faltan `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
- Registro de providers en el mismo archivo: `Credentials(...)` + `Google(...)`.
- `lib/auth.config.ts` es edge-safe: `providers: []` y NO registra Google (no se toca).
- Deuda: mensaje de error que promete una bandera inexistente (`BACKLOG-100.md`
  fila `GOOGLE_PROVIDER_DISABLED`, origen `design.md § D5.5`).

## Decisiones
1. **La bandera es exactamente el string `"1"`.** `process.env.GOOGLE_PROVIDER_DISABLED === "1"`.
   Alternativa considerada (truthy genérico: `"true"`, `"yes"`): rechazada — valores
   accidentales (`"0"` leído como truthy en otros lenguajes, strings basura) no deben
   apagar un guard de seguridad. Documentado: vacío/ausente/otro valor = bandera apagada.
2. **Se lee una sola vez al module-load**, junto al fail-fast (mismo ecosistema de
   module-load que el guard). No se propaga a runtime: es una decisión de build/entorno.
3. **No toca `lib/auth.config.ts`**: esa config es edge-safe y ya trae `providers: []`;
   el provider real vive solo en `lib/auth.ts` (runtime Node). Meter la bandera en el
   archivo edge agregaría lógica de entorno donde no hace falta.
4. **Array de providers construido con spread condicional** sobre la misma constante
   `googleProviderDisabled`: un solo punto de verdad para (a) y (b). Con la bandera,
   los callbacks `signIn`/`jwt` de Google quedan inertes (ningún provider los dispara)
   sin tener que ramificarlos.
5. **Mensaje de error con la bandera nombrada** — `"...or set GOOGLE_PROVIDER_DISABLED=1
   to disable the Google provider."`. El prefijo se mantiene idéntico
   (`GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in production`) para no
   romper `test/lib/auth.prod-guard.test.ts` (assert por prefijo) ni la cita de la spec.
6. **Trap 3 de `openspec/CONVENCION-DELTAS.md`**: `au-google-sso` (activo, ⏸ owner)
   también tiene un `MODIFIED` del mismo requirement
   `Estado implementado del scaffold (§1 — contexto)`. Ambos bloques quedan con la
   **misma prosa y la unión de escenarios** (13), porque el último archive gana: si
   solo este change trajera la prosa nueva, un archive posterior de `au-google-sso`
   la borraría en silencio. Por eso el delta de `au-google-sso` se sincroniza en esta
   unidad (mismo texto, solo en su bloque MODIFIED del requirement scaffold).
7. **CI queda fuera de alcance**: los `ci-dummy` de `scripts/e2e-fresh.mjs` y del
   workflow siguen funcionando con o sin bandera; migrar el CI a la bandera es un
   cambio de CI aparte.

## Verificación
- `npx vitest run test/auth-google-provider.test.ts` (6 tests: rojo previo → verde).
- `npx vitest run test/lib/auth.prod-guard.test.ts` (5) y
  `test/auth/google-sso-callbacks.test.ts` (11) sin regresiones.
- `npx tsc --noEmit` · `npm test` completo · `openspec validate --all` ·
  `node openspec/scripts/check-delta-coverage.mjs au-google-provider-disabled`.
