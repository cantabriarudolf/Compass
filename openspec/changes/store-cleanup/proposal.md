# Proposal: store-cleanup — poda de acciones sin consumidores del store legacy

## Why

`lib/store.ts` (8.889 líneas) sigue marcado `@deprecated` pero **vivo**: la app ya persiste por
API REST + hooks `lib/api/use-*.ts`, y una parte de las acciones del store legacy quedó sin
consumidores reales. El BACKLOG prometía un `store-cleanup` que "eliminará las acciones que ya
nadie usa" (`openspec/BACKLOG-100.md:216`). Esta ventana lo salda con evidencia medida, sin tocar
lo que sí se usa.

Base de hechos (censo 2026-10-14, 182 miembros): 107 usados por la app · 4 solo por el QA-Lab ·
21 solo por tests · 1 muerto (`toggleActivoTipoUnidad`). Censo fino de esta ventana (P1, por
miembro y con uso **intra-store**, zona app *catch-all* que incluye `components/**`): 180 miembros
(132 propios de `CompassStore` + 48 heredados de `CompassData`) → 79 app · 71 QA-Lab · 26
solo-test · 2 muerto · 2 intra-store.

## What Changes

- **Censo fino por miembro** (script ad-hoc no versionado, TS compiler API): para cada miembro de
  `CompassStore` se cuenta el uso en cinco zonas separadas: intra-store (`lib/store.ts`, sin
  sitios de declaración), app (catch-all de `apps/web` sin el QA-Lab, sin `lib/schemas.ts` y sin
  tests), QA-Lab (`app/admin/qa-lab/**`), tests (`test/**` + `**/*.test.ts(x)`) y e2e (`e2e/**`).
  Excluidos `prisma/**` y `*.md` (colisión de nombres con campos de Prisma).
- **Borrado de 28 acciones** (2 muertas + 26 solo-test sin uso intra-store): se elimina su línea
  de la interface `CompassStore`, su bloque de implementación en el state factory y sus tests
  dedicados (473 líneas en 16 archivos). Lista exacta en `design.md` y en el avance NSGC.
- **Guardas**: `STORE_VERSION` sigue **28**; ningún campo de `CompassData`, ningún miembro con uso
  app/QA-Lab/e2e/intra-store, ninguna referencia en migraciones de Prisma, y `partialize`,
  `migrate`, `ESQUEMAS_COLECCION` y `sanitizarColecciones` intactos.
- **Sin cambios de comportamiento observable**: lo único que desaparece son acciones que ningún
  consumidor invocaba.

## Capabilities

### New Capabilities
- (ninguna)

### Modified Capabilities
- `ST-capa-datos-persistente`: MODIFIED Requirement "Acceso mediante acciones CRUD centralizadas"
  (el store legacy SHALL exponer únicamente los miembros con consumidores vivos; las acciones sin
  consumidores se eliminan de la interface y de la implementación, sin alterar el shape persistido),
  MODIFIED "Colecciones de remuneraciones de PL en el store" (la generación/confirmación de
  liquidaciones pasa a `app/api/liquidaciones/**`) y MODIFIED "Auditoría CF_UPDATE_PARAM de
  parámetros legales" (registra que la emisión queda pendiente del lado servidor).

## Impact

- `k0mp4ss_fe/apps/web/lib/store.ts` (interface + implementación), `k0mp4ss_fe/apps/web/test/**`
  (solo bloques de test de las acciones borradas).
- Sin impacto en Prisma/BD, sin impacto en `app/**` ni en el QA-Lab, sin bump de `STORE_VERSION`.
- Riesgo bajo-medio: es una **poda de contrato interno**; el gate incluye `tsc`, suite completa con
  pisos por área y e2e dirigida del poblado (`crud/poblado-idempotente` + `flujo/poblado`).
