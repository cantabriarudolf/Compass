## Context

P4 introdujo `puedeContextual(rol, accion, recurso, ctx)` puro en `k0mp4ss_fe/apps/web/lib/authz.ts` con paridad 1:1. El motor refinó 4 familias: `mp:propios`/`pl:propia` (personaId), `ct:*` vinculación (`unidadId ∈ unidadIdsVinculadas`), `gd`/`gd:*` (`residenteVeActas`), `mp:morosidad`/`fi:morosidad` (`residenteVeMorosidad`), y `notify:residente`/`pe:notify_residente` (`alertasResidentesActivas`). Solo `gd` se migró a `puedeContextual` en `app/comunidad/directiva/page.tsx:73`; los otros 3 refinamientos quedaron inline por acoplo a store/error message (ver Bitácora P4 y `openspec/changes/archive/2026-09-01-rp-abac-contextual/design.md` D2-D4 inventario). La vista `/admin/permisos` hoy solo muestra la matriz RBAC (`matrizPermisos()`), dejando invisible el ABAC. Ver proposal.md — Why.

## Goals / Non-Goals

**Goals:**
- Exponer ABAC como snapshot read-only derivado del motor, sin datos duros desincronizables.
- Reflejar TODAS las reglas ABAC del sistema (motor + 3 checks locales heredados de P4), marcando "motor" vs "check local" por regla con archivo:línea de referencia.
- Mantener paridad visual con matriz RBAC existente y badge "solo lectura" sin mutaciones.

**Non-Goals:**
- Migrar los 3 checks locales restantes (se documentan, no se migran en esta ventana).
- Cambiar decisiones de permiso o añadir nuevos recursos ABAC.
- Persistencia/API: `reglasContextuales()` es puro en memoria.

## Decisions

**D1 — `reglasContextuales(): EntradaABAC[]` como constante de módulo derivada**

```ts
export interface EntradaABAC {
  rol: Rol
  recurso: string
  condicion: string        // legible: "solo propios", "unidad vinculada", "según privacidad: residenteVeActas"
  descripcion: string      // legible: "Solo ve/edita sus propios datos"
  donde: "motor" | "check local"
  detalle?: string         // archivo:línea del check local o referencia al motor
}
const REGLAS_ABAC: EntradaABAC[] = [ /* derivado del if-tree de puedeContextual + inventario D2 */ ]
export function reglasContextuales(): EntradaABAC[] { return [...REGLAS_ABAC] }
```

- Igual patrón que `matrizPermisos()` / `MATRIZ` (const interna + función que retorna copia ordenada). Nunca datos duros en la vista: `app/admin/permisos/page.tsx` importa `reglasContextuales()` y agrupa por rol.
- Orden: por `rol` según `ROLES` + `recurso` alfabético (determinista para tests/e2e).
- Alternativa descartada: generar desde introspección de `puedeContextual.toString()` — frágil y no tipado; preferimos lista curada que es el snapshot autorizativo y se testea con ≥6 asserts.

**D2 — Inventario completo que debe reflejar `reglasContextuales()` (herencia P4)**

| # | Rol | Recurso | Condición legible | Dónde | Archivo:línea fuente |
|---|---|---|---|---|---|
| 1 | residente/comite/conserjeria/mantencion | `mp:propios` | solo propios | motor | `lib/authz.ts:186` `puedeContextual` mp:propios requiere personaId |
| 2 | conserjeria | `pl:propia` (y `pl`) | solo propia | motor | `lib/authz.ts:190` pl:propia requiere personaId |
| 3 | residente | `ct:propio` | unidad vinculada | motor | `lib/authz.ts:195` ct:propio requiere unidadId ∈ vinculadas |
| 4 | residente | `ct:residencia` | unidad vinculada | motor | `lib/authz.ts:196` + `lib/store.ts:4253 vinculoVigente` (check local legado documentado) |
| 5 | residente | `ct:al_dia` | unidad vinculada | motor (vinculación) + check local (saldo) | `lib/authz.ts:197` + `lib/store.ts:4272 saldoPendienteTotal>0` bloquea (no ABAC) — se marca motor y se anota saldo como check local complementario |
| 6 | conserjeria | `ct:propia` | unidad vinculada | motor | `lib/authz.ts:198` |
| 7 | residente | `ct:estado_cuenta` | unidad vinculada | motor | `lib/authz.ts:199` |
| 8 | residente | `gd` / `gd:*` | según privacidad: residenteVeActas | motor | `lib/authz.ts:211` + migrado en `app/comunidad/directiva/page.tsx:73` |
| 9 | residente | `mp:morosidad` / `fi:morosidad` | según privacidad: residenteVeMorosidad | check local | `app/admin/gestion/page.tsx:176` switch + `lib/schemas.ts:282` flag; `puedeContextual:218` lo modela pero la UI/store aún filtra local — se marca check local |
| 10 | residente | `notify:residente` / `pe:notify_residente` | según privacidad: alertasResidentesActivas | check local | `lib/store.ts:1327 notify` gate; `puedeContextual:226` lo modela con default true — se marca check local |

Se exponen las 3 familias inline heredadas (9-10 + saldo de 5 + filtros `app/comunidad/certificados/page.tsx:177`) con badge "check local" para cerrar la lección P4.

**D3 — Vista `/admin/permisos` — sección "Permisos contextuales (ABAC)"**

- Ubicación: entre sección "Matriz de permisos (RP)" y "Membresías de la comunidad" (mismo `flex flex-col gap-6`).
- Heading: `h2` "Permisos contextuales (ABAC)" con `IconShieldCheck` o `IconLock` secundario + badge "solo lectura" ya existente arriba se mantiene; no se añaden botones.
- Layout: por rol, `Card` por rol (reusa `MatrizRol` o nueva `SeccionABAC`) — dentro, filas `recurso` (code mono) + badge condición (color sky/amber) + `descripcion` (text-xs muted) + badge `donde` ("motor" emerald, "check local" amber). Sin `Select`, sin mutación.
- Accesibilidad: heading `h2`, lista `ul`/`li` o `div` con `role="list"`; badges con `aria-label`.
- Alternativa descartada: tabla única gigante — menos escaneable por rol; se prefiere tarjetas por rol como matriz RBAC.

**D4 — Tests**

- Vitest: suite `reglasContextuales()` con ≥6 asserts: (1) incluye `mp:propios` con condición "solo propios" y donde motor, (2) incluye `pl:propia` conserjeria, (3) incluye `ct:residencia`/`ct:al_dia` con "unidad vinculada", (4) incluye `gd` con "residenteVeActas" motor, (5) incluye `mp:morosidad` con "residenteVeMorosidad" check local, (6) incluye `notify:residente` con "alertasResidentesActivas" check local. Además verifica que `reglasContextuales()` retorna copia (no referencia) y orden determinista.
- e2e: ampliar `e2e/crud/permisos.spec.ts` — tras matriz RBAC, afirmar heading "Permisos contextuales (ABAC)", ≥3 reglas visibles (ej. `mp:propios`, `gd`, `ct:residencia`), badges "motor"/"check local" visibles, 0 botones de mutación en sección ABAC, 0 pageerror.

## Risks / Trade-offs

- [Riesgo: snapshot desincronizado si se añade regla a `puedeContextual` y se olvida `REGLAS_ABAC`] → Mitigación: `REGLAS_ABAC` vive al lado del if-tree en el mismo archivo `lib/authz.ts`; test de paridad compara que cada rama ABAC tiene entrada correspondiente.
- [Riesgo: vista muestra reglas que no están en matriz RBAC base (ej. `notify:residente` no existe en MATRIZ)] → Aceptado: ABAC puede refinar recursos nocionales; se documentan como semánticos y se marcan check local.
- Trade-off: lista curada vs generación automática — curada es más legible y testeable; costo: mantenimiento manual pero co-locado con motor, mismo archivo.

## Migration Plan

1. Implementar `EntradaABAC` + `REGLAS_ABAC` + `reglasContextuales()` en `lib/authz.ts` (sin tocar `puedeContextual`).
2. Añadir tests Vitest para `reglasContextuales()`.
3. Modificar `app/admin/permisos/page.tsx` para importar y renderizar sección ABAC.
4. Ampliar `e2e/crud/permisos.spec.ts` con sección ABAC.
5. Validar `tsc --noEmit`, `lint`, `vitest run`, `playwright test e2e/crud/permisos.spec.ts`, `openspec validate --all`, archivar con git status limpio.

## Open Questions

- Ninguna bloqueante.
