## 1. Inventario y modelo ABAC puro

- [ ] 1.1 Inventariar checks inline reales con archivo:línea y lógica actual (mp:propios, pl:propia, ct:propio/residencia/al_dia, residenteVeMorosidad/residenteVeActas/alertasResidentesActivas) — verificado en design.md §D3
- [ ] 1.2 Implementar `ContextoABAC` y `puedeContextual(rol, accion, recurso, ctx)` en `k0mp4ss_fe/apps/web/lib/authz.ts`: `puede()` base + refinamiento ABAC para `:propios`, `:propia`, `:residencia`, `:al_dia`, privacidad; resto delega

## 2. Paridad testeada (behavior-preserving)

- [ ] 2.1 Añadir suite `puedeContextual` en `lib/authz.test.ts` con ≥12 asserts nuevos: propietario sí/de otra unidad no, conserje sin personaId, residente con morosidad oculta/visible, actas autorizadas/no, delegación sin contexto, menor privilegio
- [ ] 2.2 Verificar que los 435 tests existentes siguen verdes (si falla alguno, corregir migración, no el test)

## 3. Migración segura 1:1

- [ ] 3.1 Migrar `app/comunidad/directiva/page.tsx:73` (residenteVeActas) a `puedeContextual("residente","ver","gd", {privacidad})` manteniendo misma decisión visible
- [ ] 3.2 Intentar envolver `lib/store.ts:1327` notify (alertasResidentesActivas) con `puedeContextual` si es puro y sin cambio de mensaje; si no migrable, dejar inline y anotar en Bitácora
- [ ] 3.3 Evaluar migración de `lib/store.ts:4253` vinculoVigente (ct:residencia) y `app/comunidad/certificados/page.tsx:177` filtro unidades; migrar solo si no cambia error/saldo; anotar no migrables

## 4. Validación y cierre

- [ ] 4.1 `npx tsc --noEmit` 0, `npm run lint` 0, `npx vitest run` (435 + nuevos), `openspec validate --all` verdes
- [ ] 4.2 `npx playwright test e2e/crud/permisos.spec.ts` sin rotura (vista ABAC viene P5)
- [ ] 4.3 Commit conventional español, `nsgc-prepush`, push, `openspec archive` con git status limpio, Bitácora P4 HECHA
