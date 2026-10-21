# Proposal: ui-legacy-store-fase1 — store legacy en la UI, fase 1 (lectura + cableado de hooks)

## Contexto

La auditoría read-only del 2026-10-21 (`openspec/BACKLOG-100.md` §"Deuda viva verificada" →
§"Store legacy: mapa de migración") midió **13 archivos / 147 usos** de `useCompassStore` (store
zustand `@deprecated`). Tres son excepciones justificadas (`admin/qa-lab`, `admin/dev-dashboard`,
`admin/mantenimiento`: operan sobre localStorage/semillas). De los 10 restantes, la mitad exige
**endpoints nuevos con contrato de negocio** (fase 2, declarada fuera de alcance) y la otra mitad es
**riesgo bajo**: lectura pura con hook existente, o acciones cuya ruta REST ya está desplegada y solo
falta cablear el hook.

Esta serie ataca **solo la parte de riesgo bajo**, en 5 ventanas (`openspec/SERIE-DEUDA-6/00-plan.md`).

## Objetivo

Que las pantallas de la fase 1 lean y escriban por la API REST (fuente de verdad del servidor) en
lugar del store legacy persistido en `localStorage`, con **paridad estricta** de comportamiento
visible: mismos textos, mismas columnas, mismo orden, mismos permisos, mismas validaciones y mismo
shape persistido.

## Alcance (serie completa, V1–V5)

| Ventana | Pantalla | Cambio |
| --- | --- | --- |
| **V1** | `app/comunidad/certificados/page.tsx` | `liquidacionesPL` y `cobrosFI` del store → `useLiquidaciones()` y `useCobrosFI()`; el gate de carga pasa de `hasHydrated` a los `isLoading` de los hooks |
| **V2** | `app/visor-mensajes/page.tsx` | `caducarAvisosCV` del store → caducidad vía API, reutilizando el contrato existente (`PUT /api/cv/avisos/[id]`) |
| **V3** | `app/finanzas/multas/page.tsx` | cablear en `use-in.ts` las acciones aplicar/desestimar/apelar (rutas ya existentes) y migrar la página |
| **V4** | `app/inventario/proyectos/page.tsx` | cablear en `use-mt.ts` verificar garantías + actualizar pago de trabajo (rutas ya existentes) y migrar la página |
| **V5** | — | cierre: gates completos, `BACKLOG-100.md`, avance NSGC, deuda restante declarada, informe |

## Fuera de alcance (deuda fase 2, declarada)

Transiciones PE (personal), entregar/resolver solicitud IR, reportes RE (generar/distribuir/vista),
adelantos PL, cobranza FI y publicar acta en CV (`comunidad/visor`): **todos exigen endpoints nuevos
con contrato de negocio** y no se improvisan acá. Tampoco se tocan las 3 excepciones justificadas
(`admin/qa-lab`, `admin/dev-dashboard`, `admin/mantenimiento`).

## Justificación de `skip_specs: true`

Ninguna capacidad de `openspec/specs/` declara **de dónde** lee la UI (store local vs API REST): los
specs describen el comportamiento observable del dominio, y este change lo preserva sin cambios.
Es un refactor de mecánica de datos con paridad verificada por tests de fijación por pantalla, así
que no hay delta de spec que escribir ni capacidad que inventar (regla de `openspec/CONVENCION-DELTAS.md`).

## Restricciones duras

1. `STORE_VERSION = 28` congelado: sin cambios de shape persistido ni del contrato de los hooks.
2. Si una migración exige decidir un contrato nuevo o cambiar comportamiento visible → **BLOQUEADO**
   con evidencia, no se improvisa.
3. Un commit por work-unit, convencional en español, commiteando solo los archivos del cambio.
4. Gate por ventana: `npx tsc --noEmit` 0 · `npm run lint` 0 problemas · `npm test` verde con los
   pisos vigentes (e2e no se corre en esta máquina: 2 cores, flakes documentados).
5. Sin push, sin merge, sin PR; `openspec archive` **no** se corre (exige CI verde observado).

## Riesgo y mitigación

- **Deriva silenciosa de datos**: el techo de paginación de `useCrudCollection` (`pageSize=100`) acota
  las colecciones ya en 3 pantallas migradas (`finanzas/pagos`, `finanzas/gastos-comunes`,
  `admin/reporteria`). Se documenta como límite preexistente del hook, no se cambia en esta fase.
- **Regresión funcional**: cada ventana agrega un test de fijación que alimenta el store legacy con
  señuelos y los hooks con los datos reales; si la página volviera al store, el test falla.
