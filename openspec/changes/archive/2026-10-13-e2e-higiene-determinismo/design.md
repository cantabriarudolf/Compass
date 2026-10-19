# Design: e2e-higiene-determinismo

## Contexto
- Scope de comunidad: `lib/api/with-comunidad-scope.ts` — última membresía por
  `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`, `take: 1`.
- Seed authz: `k0mp4ss_fe/apps/web/scripts/seed-authz.mjs` (primer arranque) +
  espejo `k0mp4ss_fe/apps/web/lib/seed-authz.ts` (QA-Lab fase AU).
- Orden canónico (`membresiasData` en el `.mjs`): comunidad-b del admin primero,
  admin-a ÚLTIMA. Documento maestro: `cuentas-funcionales.md §3.4`.
- QA-Lab "Poblar todo" escribe al store zustand (cliente), no a la BD; el daño a
  la corrida es contaminación del store + datos `TEST-*` residuales.

## Decisiones
1. **Determinismo por `createdAt` escalonado, no por delete+create.**
   Alternativa considerada (borrar y recrear membresías) cambia `id` (cuid) y
   rompe FKs potenciales en tooling externo; además el `@@unique(usuarioId,
   comunidadId)` permite update directo. Tras el upsert clásico, una segunda
   pasada fija `createdAt = base + i·1s` en orden canónico. Ventaja: idempotente,
   conserva `id`, y el desempate `id desc` nunca decide (los `createdAt` difieren
   en segundos). Riesgo: dos seeds concurrentes — no soportado (herramienta dev).
2. **Alinear el espejo `lib/seed-authz.ts` al mismo orden + arrendatario.**
   Hoy diverge (admin-a primera, sin arrendatario). Se lleva al mismo orden
   canónico, misma pasada de `createdAt`, y se añade usuario/arrendatario +
   persona/vínculo `p-arrendatario-1`/`v-arrendatario-1` (first-wins, como el `.mjs`).
3. **GATED = orden + re-seed, no comunidad dedicada.**
   Comunidad dedicada exigiría multi-tenant activo en QA-Lab y partía la receta
   reseed en dos; orden fijo al final + `seed:mocks` posterior restaura el store
   base sin tocar BD. Los 4 GATED ya se autoidentifican con `(GATED)` en el
   describe → el runner filtra por grep sin renombrar archivos.
4. **Convención `TEST-*` vive en el delta `DEV-qa-lab`, no en cada spec.**
   Un solo lugar normativo; los specs P2/P3 la citan. Lo no-limpiable (p. ej.
   certificados con PDF ya emitido, pagos con asiento aplicado) se lista como
   conocido en el delta.

## Cambios
- `scripts/seed-authz.mjs`: pasada de `createdAt` determinista + comentario.
- `lib/seed-authz.ts`: mismo orden + arrendatario + pasada `createdAt`.
- `test/unit/seed-authz-orden.test.ts` (nuevo, vitest): orden canónico termina en
  admin-a (contrato anti-regresión sin BD).
- `package.json`: scripts `e2e:nongated`, `e2e:gated`, `e2e:full-orden`
  (no-GATED → GATED → recordatorio reseed).
- Deltas openspec: `ST-capa-datos-persistente` (seed determinista) +
  `DEV-qa-lab` (convención TEST-* + estrategia GATED).

## Verificación
- `restore P3 + seed:authz + seed:mocks -- --comunidad-id=comunidad-a` → scope
  admin = comunidad-a (chequeo por script tsx, sin receta manual).
- Tras `restore:db` SIEMPRE reiniciar el dev server (`next dev` mantiene el
  handle del `dev.db` pre-restore y el login falla aunque la BD esté bien).
  Lección P1: setup auth 0/6 hasta reiniciar; tras reinicio 19/19.
- `npx playwright test e2e/auth` verde sobre ese estado.
- `npx tsc --noEmit`, lint 0 errores, `openspec validate e2e-higiene-determinismo`.
- Full e2e NO se exige en P1 (es criterio de P4); solo lane auth.

> **Nota 2026-10-13 (saneamiento S4):** la estrategia GATED de las decisiones 3 y 4
> (orden fijo no-GATED → GATED + scripts `e2e:nongated` / `e2e:gated` / `e2e:full-orden`)
> fue reemplazada por SERIE-E2E-SIN-GATED (`b7e88a8`): tag `(GATED)` eliminado de los
> describes, esos scripts ya no existen en `package.json` y CI/local corren
> `npx playwright test` en corrida única con specs autónomos (helper
> `e2e/helpers/datos-test.ts` + cleanup propio). El delta `DEV-qa-lab` se refrescó a ese
> diseño antes de archivar. El resto del design (seed determinista por `createdAt`
> escalonado, convención `TEST-*`) sigue vigente.
