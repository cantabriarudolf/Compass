## 1. Motor y API

- [x] 1.1 `lib/authz.ts`: agregar helper puro `matrizPermisos(): Record<Rol, { recurso: string; acciones: Accion[] }[]>` derivado de MATRIZ (incluye wildcard `*` del administrador)
- [x] 1.2 `lib/authz.test.ts` (o archivo existente de tests authz): asserts de `matrizPermisos()` — 5 roles presentes, administrador con recurso `*` y 5 acciones, conserjeria sin acceso a `pl` salvo `pl:propia:ver`, menor privilegio (lo no listado no aparece)
- [x] 1.3 `app/api/admin/usuarios/route.ts`: rama sin `comunidadId` → `200 { comunidades: [{ id, nombre, rol }] }` desde membresías del usuario autenticado (sin datos de terceros); mantener contrato actual con `comunidadId` (401/400/403/404/200)

## 2. Vista `/admin/permisos`

- [x] 2.1 Crear `app/admin/permisos/page.tsx` (client component, patrón metricas/logs: `useStoreRehydrated` solo si aplica, skeleton si carga) — header con badge "solo lectura"
- [x] 2.2 Bloque matriz: por rol estándar (5), recursos con badges de acciones; administrador con recurso `*` wildcard visible
- [x] 2.3 Bloque comunidad: selector con comunidades propias (`GET /api/admin/usuarios` sin params); al elegir, tabla de membresías (email, rol, activo) scoping por comunidad; estado vacío con CTA al QA Lab si no hay seed
- [x] 2.4 Garantía solo lectura: sin botones de asignación/edición en toda la página

## 3. Sidebar

- [x] 3.1 `components/app-sidebar.tsx`: quitar `/admin/permisos` de `RUTAS_PENDIENTES` (último placeholder del menú)

## 4. Verificación

- [x] 4.1 `cd k0mp4ss_fe/apps/web && npx tsc --noEmit` → 0 errores
- [x] 4.2 `npm run lint` → 0 errores (warnings heredados permitidos)
- [x] 4.3 `npx vitest run` → suite completa verde (421 + asserts nuevos de matrizPermisos)
- [x] 4.4 Nuevo spec `e2e/crud/permisos.spec.ts` (read-oriented): selector muestra 2 comunidades TEST (A y B), elegir una → membresías del seed visibles (emails test), matriz con wildcard `*`, sin botones de mutación, 0 `pageerror`
- [x] 4.5 `npx playwright test e2e/crud/permisos.spec.ts` verde + `npx playwright test e2e/crud/` completo (25 tests) verde
- [x] 4.6 `openspec validate --all` → sin fallos

## 5. Cierre

- [x] 5.1 Commit conventional en español (feat(admin): vista permisos solo lectura …)
- [x] 5.2 `nsgc-prepush`: manual afectado `09 - RP - Roles y Permisos.md` (sección de la vista) + avance de la sesión
- [x] 5.3 Push a origin/main
