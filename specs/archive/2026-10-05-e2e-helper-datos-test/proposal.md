# Proposal: e2e-helper-datos-test (SERIE-E2E-SIN-GATED P1)

## Problema
5 specs E2E arman su dato TEST propio vía `page.request` con setup inline
duplicado (GET unidad base del seed + POST por entidad + cleanup manual):
`e2e/crud/pagos.spec.ts`, `e2e/crud/certificados.spec.ts`,
`e2e/crud/portal.spec.ts`, `e2e/crud/remuneraciones.spec.ts` y
`e2e/flujo/poblamiento.spec.ts` (tests MP/EF). El patrón se repite en cada
spec (rutUnico/dvRut, unidad TEST, persona TEST, vínculo, cobro con fondo del
seed, publicación con snapshot previo, trabajador con maestros + params
legales) y cualquier ajuste del setup obliga a tocar N archivos. El tag GATED
ya no significa nada (los tests son independientes del orden) y P2 lo
eliminará; P1 deja el setup unificado para que ese cierre sea mecánico.

## Propuesta
Crear `e2e/helpers/datos-test.ts` con funciones `crear*TEST` /
`limpiar*TEST` por entidad (ids `TEST-*` únicos por llamada, cleanup
idempotente que no falla si falta la fila) y migrar los 5 specs al helper,
uno por vez con su corrida en verde. Comportamiento idéntico (mismos asserts,
mismos flujos UI); solo cambia de dónde sale el setup. Si un spec necesita
algo que el helper no cubre, se extiende el helper, no se duplica. Sin
cambios de app. El change queda abierto (lo archiva el cierre de la serie).

## Alcance
- Nuevo: `e2e/helpers/datos-test.ts`
- Migrados: `e2e/crud/pagos|certificados|portal|remuneraciones.spec.ts`,
  `e2e/flujo/poblamiento.spec.ts` (solo tests MP/EF; el test maestro QA-Lab
  queda intacto)
- Deltas en specs FI-finanzas-morosidad, CT-certificados, PI-portal-inmobiliario,
  PL-liquidaciones-remuneraciones, MP-maestro-personas, EF-estructura-fisica
