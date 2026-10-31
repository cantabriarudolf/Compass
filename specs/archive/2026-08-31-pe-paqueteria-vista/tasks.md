## 1. Refactor — extraer tab Encomiendas a componente compartido

- [ ] 1.1 Crear `k0mp4ss_fe/apps/web/components/pe/encomiendas-panel.tsx` extrayendo JSX/lógica del tab "Encomiendas" de `app/operaciones/bitacora/page.tsx` (formEnc con courierId/destinatarioPersonaId/unidadId/descripcionPaquete/evidenciaNombre/evidenciaUrl, `guardarEncomienda` con validaciones literales, tabla "Encomiendas del día", diálogo `retiroEnc` con `registrarRetiroEncomiendaPE` + `removeEncomiendaPE`, helpers `refUnidad`/`nombrePersona`); props `diaReporte` + `onError`/`onSuccess`; preservar ids/labels exactos (`Courier / App *`, `Destinatario`, `Unidad`, `enc-desc`, `enc-evn`, `enc-evu`, "Registrar recepción", "Registrar retiro", "Retirado por *", "Confirmar retiro", etc.).
- [ ] 1.2 Refactorizar `k0mp4ss_fe/apps/web/app/operaciones/bitacora/page.tsx` para importar y renderizar `EncomiendasPanel` dentro de `TabsContent value="encomiendas"` (composición delgada, estado `diaReporte`/`error`/`okMsg` permanece en page y se pasa por props); eliminar JSX duplicado del tab Encomiendas y estado local `formEnc`/`retiroEnc`/`guardarEncomienda` que ahora vive en el panel; verificar `npx tsc --noEmit` 0 y `e2e/crud/bitacora.spec.ts` sigue verde.

## 2. Vista dedicada /operaciones/paqueteria

- [ ] 2.1 Crear `k0mp4ss_fe/apps/web/app/operaciones/paqueteria/page.tsx` (client, patrón `/operaciones/accesos`/`/dashboard`): skeleton si `!hasHydrated`; `useState(hoyISO())` para `diaReporte` con `Input type=date` id `dia-paqueteria`; header "Encomiendas" con `IconPackage` + descripción "Recepción y retiro de encomiendas — logística de conserjería."; renderizar `EncomiendasPanel` con `diaReporte`/`onError`/`onSuccess`; mensajes error/okMsg arriba como en bitácora.
- [ ] 2.2 Quitar `"/operaciones/paqueteria"` de `RUTAS_PENDIENTES` en `k0mp4ss_fe/apps/web/components/app-sidebar.tsx` — al terminar, `RUTAS_PENDIENTES` queda vacío (Set vacío); verificar navegación sin badge "Próximamente".

## 3. e2e

- [ ] 3.1 Crear `k0mp4ss_fe/apps/web/e2e/crud/paqueteria.spec.ts`: `page.goto("/operaciones/paqueteria")`, afirmar heading `Encomiendas`, presencia del panel (label "Courier / App *", Destinatario, Unidad, "Registrar recepción", tabla "Encomiendas del día"), selector de día visible, flujo real recepción: seleccionar courier + destinatario/unidad + describir "TEST-*" + click Registrar recepción → afirmar fila TEST-* con estado Recibida, `expect(errores).toEqual([])` con `page.on("pageerror")`; NO confirmar retiro de datos seed; patrón quirúrgico existente (timeout 30s).

## 4. Validación y archivo

- [ ] 4.1 `npx tsc --noEmit` 0 errores · `npm run lint` 0 errores · `npx vitest run` 425/425 · `npx playwright test e2e/crud/paqueteria.spec.ts e2e/crud/bitacora.spec.ts` verde · `openspec validate --all` sin errores · commit · nsgc-prepush · push · `openspec archive pe-paqueteria-vista --yes` (verificar `git status` limpio tras archive) · Bitácora 00-plan.md P5 HECHA con RUTAS_PENDIENTES vacío.
