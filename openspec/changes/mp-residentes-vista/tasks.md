## 1. Vista residentes (read-only) sobre MP+VU

- [ ] 1.1 Crear `k0mp4ss_fe/apps/web/app/personas/residentes/page.tsx` (client): skeleton si `!hasHydrated`; `useCompassStore` para `personas`/`vinculos`/`unidades`; `useMemo` filtra `vinculos vigente propietario/arrendatario`; tabla con identidad (nombre+rut+roles badges), contacto, unidad vinculada (badge `etiqueta numero` + rol vínculo), estado (`activa`/`inactiva`/`bloqueada`), acciones con `Link` a `/comunidad/personas/[id]` ("Ver Ficha"); búsqueda por nombre/RUT opcional; empty state "Sin residentes con vínculo vigente".
- [ ] 1.2 Verificar heading `Residentes` + descripción y render de filas según seed; estilos con `Card`/`Table`/`Badge`/`Input` del patrón MP.

## 2. Sidebar — habilitar navegación

- [ ] 2.1 Quitar `"/personas/residentes"` de `RUTAS_PENDIENTES` en `k0mp4ss_fe/apps/web/components/app-sidebar.tsx` y verificar que el item navega sin badge "Próximamente".

## 3. e2e read-oriented

- [ ] 3.1 Crear `k0mp4ss_fe/apps/web/e2e/crud/residentes.spec.ts`: `page.goto("/personas/residentes")`, afirmar `heading "Residentes"`, filas corresponden a personas con vínculo vigente propietario/arrendatario del seed (≥1), link `Ver Ficha` presente, `expect(errores).toEqual([])` con `page.on("pageerror")`; patrón `logs/permisos` con timeout 30s.

## 4. Validación y archivo

- [ ] 4.1 `npx tsc --noEmit` 0 errores · `npm run lint` 0 errores · `npx vitest run` 425/425 · `npx playwright test e2e/crud/residentes.spec.ts` verde · `openspec validate --all` sin errores · commit · nsgc-prepush · push · `openspec archive mp-residentes-vista --yes` · Bitácora 00-plan.md P2 HECHA.
