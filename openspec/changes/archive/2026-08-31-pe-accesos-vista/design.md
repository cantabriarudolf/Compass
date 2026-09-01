## Context

Actualmente `k0mp4ss_fe/apps/web/app/operaciones/bitacora/page.tsx` concentra ~720 líneas con 5 tabs (Reporte, Visitas, Encomiendas, Contratistas, Cierre). Los tabs Visitas y Contratistas ya implementan CRUD ligero sobre `bitacoraVisitasPE` e `ingresosContratistasPE` (store). La ruta `/operaciones/accesos` existe en `RUTAS_PENDIENTES` y debe dejar de ser placeholder. La extracción debe preservar DOM/labels exactos para que `e2e/crud/bitacora.spec.ts` no regrese. Ver proposal.md — Why.

## Goals / Non-Goals

**Goals:**
- Extraer Visitas y Contratistas a `components/pe/*-panel.tsx` reutilizables sin cambiar comportamiento observable.
- Proveer `/operaciones/accesos` que renderice ambos paneles con selector de día y heading, sin bump de esquema.
- Mantener bitácora verde y nueva vista read-oriented verificada por e2e.

**Non-Goals:**
- Cambiar esquema/store (`STORE_VERSION`), reglas de negocio o eventos AM.
- Unificar Encomiendas (corresponde a P5 `/operaciones/paqueteria`).
- Rediseño visual mayor; solo layout propio ligero.

## Decisions

- **Componentes autocontenidos con props mínimas:** `VisitasPanel` y `ContratistasPanel` reciben `diaReporte` (string ISO), `onError` y `onSuccess` callbacks; todo lo demás (store selectors, form state, helpers) vive dentro del componente. Alternativa de props masivos descartada por acoplamiento. Pasar `diaReporte` desde el padre preserva sincronía con el selector diario del page.
- **Estado movido al componente:** `formVisita`/`formCont` y derived `visitasDelDia`/`contratistasDelDia` se mueven al panel; no quedan en bitacora page. Esto evita prop-drilling y mantiene bitacora como composición delgada.
- **Reutilizar acciones del store tal cual:** `saveBitacoraVisitaPE`, `ingresarBitacoraVisitaPE`, `removeBitacoraVisitaPE`, `saveIngresoContratistaPE`, `confirmarIngresoContratistaPE`, `removeIngresoContratistaPE`. Sin wrapper.
- **Accesos page con su propio `diaReporte` local:** `app/operaciones/accesos/page.tsx` es client, maneja `useState(hoyISO())` y renderiza ambos paneles en stack `gap-6` con `Input type=date`. No usa Tabs; encabeza con `IconBook2` + "Accesos y Visitas".
- **Preservar labels exactos:** Todos los `Label`/`Input` ids (`v-nombre`, `v-dni`, `ct-motivo` etc.) y textos de `Select` se copian literales para no romper e2e quirúrgicos.

## Risks / Trade-offs

- [Duplicación momentánea de helpers] `escaneoDNISimulado`, `refUnidad`, `nombrePersona` quedan duplicados en paneles → Mitigación: helper local pequeño, no extraer a lib hasta P5 si converge.
- [Regresión e2e bitácora] cambio de estructura puede romper selectores por `getByLabel`/`getByRole` → Mitigación: correr `e2e/crud/bitacora.spec.ts` como gate antes de push; comparar DOM manualmente si falla.
- [Hydration mismatch si panel usa hasHydrated distinto] → Mitigación: cada page hace guard `if (!hasHydrated) skeleton`; paneles no hacen guard propio.

## Migration Plan

1. Crear `components/pe/visitas-panel.tsx` y `contratistas-panel.tsx` con lógica extraída.
2. Refactor `app/operaciones/bitacora/page.tsx` para importar y renderizar paneles dentro de `TabsContent`.
3. Crear `app/operaciones/accesos/page.tsx` con heading, selector de día, y ambos paneles.
4. Quitar `/operaciones/accesos` de `RUTAS_PENDIENTES`.
5. Verificaciones: `tsc`, `lint`, `vitest`, `playwright` (accesos + bitácora), `openspec validate`.

Rollback: revertir commits y re-agregar ruta a `RUTAS_PENDIENTES`.

## Open Questions

- Ninguna bloqueante; estilo de heading sigue patrón `/dashboard` y `/personas/residentes`.
