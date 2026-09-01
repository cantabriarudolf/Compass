## 1. Refactor — extraer tabs Visitas y Contratistas a componentes compartidos

- [ ] 1.1 Crear `k0mp4ss_fe/apps/web/components/pe/visitas-panel.tsx` extrayendo JSX/lógica del tab "Visitas" de `app/operaciones/bitacora/page.tsx` (formVisita + tabla del día, `escaneoDNISimulado`, helpers `refUnidad`/`nombrePersona`, acciones `saveBitacoraVisitaPE`/`ingresarBitacoraVisitaPE`/`removeBitacoraVisitaPE`); props `diaReporte` + `onError`/`onSuccess`; preservar ids/labels exactos (`v-nombre`, `v-dni`, Unidad destino, Registrar visita, etc.).
- [ ] 1.2 Crear `k0mp4ss_fe/apps/web/components/pe/contratistas-panel.tsx` extrayendo tab "Contratistas" (formCont + tabla del día, acciones `saveIngresoContratistaPE`/`confirmarIngresoContratistaPE`/`removeIngresoContratistaPE`); mismas props; preservar labels (Empresa *, Motivo específico, Jornada, Agendado por, etc.).
- [ ] 1.3 Refactorizar `k0mp4ss_fe/apps/web/app/operaciones/bitacora/page.tsx` para importar y renderizar `VisitasPanel`/`ContratistasPanel` dentro de `TabsContent value="visitas"/"contratistas"` (composición delgada, estado `diaReporte`/`error`/`okMsg` permanece en page y se pasa por props); verificar `npx tsc --noEmit` 0 y `e2e/crud/bitacora.spec.ts` sigue verde (no-regresión).

## 2. Vista dedicada /operaciones/accesos

- [ ] 2.1 Crear `k0mp4ss_fe/apps/web/app/operaciones/accesos/page.tsx` (client, patrón `/dashboard`/`/personas/residentes`): skeleton si `!hasHydrated`; `useState(hoyISO())` para `diaReporte` con `Input type=date`; header "Accesos y Visitas" + descripción; renderizar `VisitasPanel` y `ContratistasPanel` en stack `gap-6` con `diaReporte`/`onError`/`onSuccess`; mensajes error/okMsg arriba como en bitácora.
- [ ] 2.2 Quitar `"/operaciones/accesos"` de `RUTAS_PENDIENTES` en `k0mp4ss_fe/apps/web/components/app-sidebar.tsx` y verificar navegación sin badge "Próximamente".

## 3. e2e read-oriented

- [ ] 3.1 Crear `k0mp4ss_fe/apps/web/e2e/crud/accesos.spec.ts`: `page.goto("/operaciones/accesos")`, afirmar heading `Accesos y Visitas`, presencia de paneles (label "Nombre *" + "Motivo específico" o equivalente real del código), selector de día visible, `expect(errores).toEqual([])` con `page.on("pageerror")`; patrón quirúrgico existente (timeout 30s).

## 4. Validación y archivo

- [ ] 4.1 `npx tsc --noEmit` 0 errores · `npm run lint` 0 errores · `npx vitest run` 425/425 · `npx playwright test e2e/crud/accesos.spec.ts e2e/crud/bitacora.spec.ts` verde · `openspec validate --all` sin errores · commit · nsgc-prepush · push · `openspec archive pe-accesos-vista --yes` (verificar `git status` limpio tras archive) · Bitácora 00-plan.md P4 HECHA.
