# Proposal: qlab-purga-bulk (SERIE-NOCHE-2 P1)

## Problema
La purga del QA-Lab (`app/admin/qa-lab/page.tsx` → `limpiar()`) borra cada entidad TEST de BD
con una request HTTP propia (GET listado + DELETE por id, en lotes de 6). Tras un poblamiento
completo (cientos de entidades: cobros FI, emisiones, reservas RA, trabajos MT, unidades,
vínculos, maestros) la operación O(n) requests excede los 120 s en el runner de CI (medido
2026-10-12: >120 s en CI vs 5-11 s local con la misma secuencia). Por eso la limpieza de cola
de `e2e/crud/poblado-idempotente.spec.ts` y `e2e/flujo/ciclo.spec.ts` quedó best-effort
documentada (espera 90 s y acepta seguir en curso). Evidencia:
`openspec/changes/archive/2026-10-12-ci-verde-ratchet-cobertura/design.md` § D6 punto 6.

## Propuesta
1. Endpoint server-side `POST /api/qa-lab/purga-test` (ruta nueva, runtime Node) que purga el
   residuo TEST de BD de la comunidad en una sola request: guard de entorno
   (`isWriteApiEnabled()` → 404 fuera de dev/test), sesión + permiso de administración vía
   `withComunidadScope()` + `puede(rol, "eliminar", "qa-lab")` (401/403), borrado solo de ids
   `test-*` (más procedencia TEST documentada, nunca datos reales) en orden hijos→padres,
   respuesta `{ borrados: Record<string, number>, bloqueos: string[] }` e idempotencia
   (segunda corrida = 0 borrados, sin errores).
2. `limpiar()` usa ese endpoint como camino principal; el bucle por entidad actual queda como
   fallback documentado si el endpoint responde error. Mensajes intactos: verde
   `TEST-* limpio correctamente` y rojo `Limpieza con N bloqueos (dependencias): …`.
3. Tests TDD `test/api/qa-lab-purga.test.ts` con BD real: 401 sin sesión, 404 con el guard
   apagado, 403 sin permiso, 200 con conteos correctos, idempotencia y que no borra entidades
   sin prefijo/procedencia `test-*`.
4. Re-endurecer las dos limpiezas de cola e2e a `toBeVisible({ timeout: 120_000 })` estricto
   (quitar el best-effort y su comentario de deuda).

## No-objetivos
- Cambiar la purga del store (client-side, O(1) ya, se mantiene idéntica).
- Purgar certificados CT ni liquidaciones PL confirmadas: inmutables por diseño (residuo
  honesto, lo retira `e2e:higiene` en cada reseed).
- Migrar `scripts/higiene-qa-test.mjs` al endpoint (sigue con su lista explícita de ids).
- Archivar el change en esta ventana (lo decide el owner tras revisar; el archive aplica el
  delta a `openspec/specs/LAB-mejoras/spec.md`).
