## Context

Actualmente `k0mp4ss_fe/apps/web/app/operaciones/bitacora/page.tsx` concentra tabs incluyendo "Encomiendas" (~80 líneas JSX + lógica `formEnc`, `guardarEncomienda`, tabla `encomiendasDelDia`, diálogo `retiroEnc` con `registrarRetiroEncomiendaPE`, y `removeEncomiendaPE`). La colección es `encomiendasPE` con acciones `saveEncomiendaPE`/`registrarRetiroEncomiendaPE`/`removeEncomiendaPE` (store). La ruta `/operaciones/paqueteria` existe en `RUTAS_PENDIENTES` como última entrada pendiente y debe dejar de ser placeholder. La extracción debe preservar DOM/labels exactos (Courier / App *, Destinatario, Unidad, Descripción del paquete, Foto evidencia, URL foto, Registrar recepción, Registrar retiro, Retirado por *) para que `e2e/crud/bitacora.spec.ts` no regrese. Ver proposal.md — Why.

## Goals / Non-Goals

**Goals:**
- Extraer Encomiendas a `components/pe/encomiendas-panel.tsx` reutilizable sin cambiar comportamiento observable (mismo que P4 con visitas/contratistas).
- Proveer `/operaciones/paqueteria` que renderice el panel con selector de día y heading "Encomiendas", sin bump de esquema.
- Mantener bitácora verde y nueva vista verificada por e2e con flujo real de recepción.

**Non-Goals:**
- Cambiar esquema/store (`STORE_VERSION`), reglas de negocio o eventos AM (`PE_ENCOMIENDA_RECIBIDA/RETIRADA`).
- Incluir Visitas/Contratistas (ya extraídos en P4).
- Rediseño visual mayor; solo layout propio ligero.

## Decisions

- **Componente autocontenido con props mínimas:** `EncomiendasPanel` recibe `diaReporte` (string ISO), `onError` y `onSuccess` callbacks; todo lo demás (store selectors, form state `formEnc`, helpers `refUnidad`/`nombrePersona`, diálogo `retiroEnc`) vive dentro del componente. Imita exactamente el patrón probado de `visitas-panel.tsx`/`contratistas-panel.tsx`. Alternativa de props masivos descartada por acoplamiento. Pasar `diaReporte` desde el padre preserva sincronía con el selector diario del page.
- **Estado movido al componente:** `formEnc` (courierId, destinatarioPersonaId, unidadId, descripcionPaquete, evidenciaNombre, evidenciaUrl) y `retiroEnc` (id, retiradoPor) más el diálogo de retiro se mueven al panel; no quedan en bitácora page. `guardarEncomienda` con validaciones literales ("Seleccione el courier del maestro.", "Indique el destinatario o la unidad", "La evidencia debe ser una URL") y construcción de `EncomiendaPE` con `estado: "recibida"` se copia exacta. Esto evita prop-drilling y mantiene bitácora como composición delgada.
- **Reutilizar acciones del store tal cual:** `saveEncomiendaPE`, `registrarRetiroEncomiendaPE`, `removeEncomiendaPE`. Sin wrapper. Validación de evidencia D1 (`/^https?:\/\//`) preservada.
- **Paqueteria page con su propio `diaReporte` local:** `app/operaciones/paqueteria/page.tsx` es client, maneja `useState(hoyISO())` y renderiza el panel con `Input type=date` (id `dia-paqueteria`). Encabeza con `IconPackage` + "Encomiendas" y descripción "Recepción y retiro de encomiendas — logística de conserjería.". No usa Tabs; estructura `flex flex-col gap-6` idéntica a `/operaciones/accesos`.
- **Preservar labels exactos:** Todos los `Label`/`Input` ids (`enc-desc`, `enc-evn`, `enc-evu`, `ret-por`) y textos de `Select` ("Courier / App *", "Destinatario", "Unidad", "Sin destinatario", "Sin unidad", "Seleccionar") se copian literales para no romper e2e quirúrgicos. Botones "Registrar recepción", "Registrar retiro", "Confirmar retiro" y tabla "Encomiendas del día ({dia})" preservados.
- **Diálogo de retiro dentro del panel:** El `Dialog` de retiro (Retirado por *, Cancelar, Confirmar retiro) vive en `EncomiendasPanel`, no en el page, para autocontención y reuso idéntico en bitácora y paquetería.

## Risks / Trade-offs

- [Duplicación de helpers] `refUnidad`, `nombrePersona` quedan triplicados en 3 paneles → Mitigación: helper local pequeño (~5 líneas), no extraer a lib hasta convergencia futura; consistencia con P4.
- [Regresión e2e bitácora] cambio de estructura puede romper selectores por `getByLabel`/`getByRole` → Mitigación: correr `e2e/crud/bitacora.spec.ts` como gate antes de push; comparar DOM manualmente si falla.
- [Hydration mismatch si panel usa hasHydrated distinto] → Mitigación: cada page hace guard `if (!hasHydrated) skeleton`; panel no hace guard propio.
- [Última ruta pendiente] vaciar `RUTAS_PENDIENTES` cambia `Set` a vacío — verificar que `AppSidebar` renderiza correctamente con Set vacío (no badge residual).

## Migration Plan

1. Crear `components/pe/encomiendas-panel.tsx` con lógica extraída del tab Encomiendas de bitácora (form, tabla, diálogo retiro).
2. Refactor `app/operaciones/bitacora/page.tsx` para importar y renderizar `EncomiendasPanel` dentro de `TabsContent value="encomiendas"` (grid layout preservado o delegado al panel según decisión — panel ya incluye grid `[420px_1fr]`).
3. Crear `app/operaciones/paqueteria/page.tsx` con heading, selector de día, y panel; quitar `/operaciones/paqueteria` de `RUTAS_PENDIENTES` (Set queda vacío).
4. Crear `e2e/crud/paqueteria.spec.ts` con goto + heading + panel labels + flujo recepción TEST-* → fila.
5. Verificaciones: `tsc`, `lint`, `vitest`, `playwright` (paqueteria + bitácora), `openspec validate`.

Rollback: revertir commits y re-agregar ruta a `RUTAS_PENDIENTES`.

## Open Questions

- Ninguna bloqueante; heading "Encomiendas" sigue patrón `/operaciones/accesos` y `/dashboard`.
