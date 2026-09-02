// Fase 0 — evidencia temporal del gap (P1)
// Antes del fix, app-sidebar.tsx:168 tenia `const currentRole = "admin"` hardcodeado:
// cualquier usuario (ej. residente@test.cl) veia el menu completo de admin.
// Este spec documentaba el gap. Tras implementar rp-menu-sesion, el gap esta cerrado
// y el spec queda en skip como evidencia historica (decision P1: skip, no eliminar,
// para trazabilidad; la matriz definitiva con storageStates llega en P2).
import { test } from "@playwright/test"

test.describe.skip("roles-descubrimiento — gap historico (P1 evidencia temporal, skip)", () => {
  test.skip(true, "Evidencia temporal pre-fix: residente veia grupos admin por currentRole='admin' hardcodeado. Ahora corregido via union de membresias en sesion (lib/auth.ts) + sidebar conectado. Dejar en skip para trazabilidad; matriz definitiva en auth/roles-menu.spec.ts y P2.")
  test("placeholder skip", async () => {
    // no-op: el bloque describe esta en skip
  })
})

// Nota historica: antes del fix, login como residente@test.cl / test1234
// redirigia a /admin y mostraba grupos no autorizados (Finanzas con Remuneraciones,
// Inventario, Personas, Desarrollo AI, Sistema) por filtrado con admin hardcodeado.
// Despues del fix (P1), residente solo ve Inicio/Operaciones/Finanzas/Comunidad (4/8),
// conserjeria Inicio/Operaciones (2/8), admin 8/8. Alias normalizados a authz.
