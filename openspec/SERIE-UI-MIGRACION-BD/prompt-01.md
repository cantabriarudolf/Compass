> **Este archivo ES tu prompt.** Ventana P1 de la serie `SERIE-UI-MIGRACION-BD`.
> Léelo completo (incluido `openspec/SERIE-UI-MIGRACION-BD/00-plan.md`) y ejecuta sus bloques en orden.

---

## Contexto común (válido para TODA la serie UI-Migración-BD)

**Estado previo:** La serie `SERIE-BD-FUENTE-VERDAD` (commits `bbfba14` a `0164873`) creó la infraestructura completa de persistencia servidora: 107 API routes, ~30 hooks SWR en `lib/api/`, tests de API 151/151 pasando. El store legacy (`lib/store.ts`, 8.600 líneas) está marcado `@deprecated` con `STORE_VERSION = 28` congelado. Pero 28 páginas de la app aún leen/escriben datos de dominio desde `useCompassStore` en lugar de usar los hooks SWR que hablan con la base de datos.

**Método del proyecto:** Por cada cambio → openspec-propose → implementar con openspec-apply-change → validar → commitear (conventional español) → sincronizar specs mains y archivar con openspec-archive-change → skill nsgc-prepush antes de cualquier push.

**Reglas permanentes:**
- Dato de dominio solo vía hooks SWR (`lib/api/use-*.ts`) o API REST directa; el store legacy (`useCompassStore` para datos de dominio) está deprecado.
- Mocks de `data/` son solo seed; no son fuente de verdad en runtime.
- D1 media por referencia (sin base64/Blob).
- Secretos jamás en localStorage ni código.
- Terminología "comunidad" (jamás "condominio").
- No commitear Untitled.md.

**Verificación por ventana:**
```bash
cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint (0 errores) && npm test (suite completa verde)
```

`next build` puede fallar por red (Google Fonts): ignóralo salvo ventana de deploy.
Si tu contexto se agota: cierra la tarea en curso + commit + deja el estado exacto en `openspec/SERIE-UI-MIGRACION-BD/00-plan.md`.

---

## Arranque (P1 es la primera ventana — no hay anterior que validar)

1. `git status` (tree limpio) y `git status -sb` (sin "ahead": todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite completa verde.
4. Leer `openspec/SERIE-UI-MIGRACION-BD/00-plan.md` y marcar la fila P1 como **EN CURSO**.

---

## Alcance de esta ventana (P1): Dashboard + Admin base

Migrar las siguientes páginas de `useCompassStore` (datos de dominio) a hooks SWR:

### Páginas objetivo

1. **`app/dashboard/page.tsx`**
   - Revisar qué datos de dominio lee del store (probablemente resúmenes de varios módulos).
   - Si lee datos que ya tienen hook SWR (personas, fondos, actas, etc.), reemplazar.
   - Si lee datos agregados que no tienen API dedicada, dejar fallback al store con `// TODO: migrar cuando haya API de dashboard`.

2. **`app/admin/configuracion/page.tsx`** → `useConfiguracion`
   - Reemplazar `useCompassStore((s) => s.configuracion)` y `saveConfiguracion` por el hook.
   - Validar que el formulario de configuración global guarde vía API.

3. **`app/admin/metricas/page.tsx`**
   - Revisar qué métricas lee del store.
   - Posiblemente necesite datos de `EventoAuditoria` (ya tiene API `/api/auditoria`).
   - Si no hay hook dedicado, usar fetch directo o dejar fallback documentado.

4. **`app/admin/reporteria/page.tsx`** → `useReportesRE`
   - Reemplazar lectura/escritura de reportes del store por el hook.

5. **`app/admin/gestion/page.tsx`** → `useControlesPropiedad`
   - Reemplazar lectura/escritura de controles de propiedad.

6. **`app/admin/logs/page.tsx`**
   - Ya lee de `/api/auditoria` (server-side o fetch). Verificar si usa store para algo más (filtros, paginación).
   - Si solo usa store para estado de UI (filtros), eso puede quedarse o migrarse a `store-ui.ts`.

### Patrón de migración

Para cada página:

```typescript
// ANTES (legacy)
import { useCompassStore } from "@/lib/store"
const personas = useCompassStore((s) => s.personas)
const savePersona = useCompassStore((s) => s.savePersona)

// DESPUÉS (BD)
import { usePersonas } from "@/lib/api/use-personas"
const { items: personas, isLoading, create, update, remove } = usePersonas()
```

**Reglas específicas:**
- `hasHydrated` del store → reemplazar por `isLoading` del hook SWR.
- Skeletons de carga: usar el patrón existente pero con `isLoading` en lugar de `!hasHydrated`.
- Si la página hace `useCompassStore.getState()` para acceso directo, reemplazar por llamada a API o por el hook.
- **NO tocar** estado de UI puro (modales abiertos, filtros de tabla, selección de pestaña) a menos que sea trivial.

### Criterios de aceptación

- [ ] Las 6 páginas migradas no usan `useCompassStore` para datos de dominio.
- [ ] `tsc` 0 errores.
- [ ] `npm test` suite completa verde (o los mismos skips que antes).
- [ ] Las páginas funcionan visualmente (verificar con `npm run dev` si es posible, o revisar código).
- [ ] Commitear: `git add ... && git commit -m "feat(ui): P1 migración Dashboard + Admin a hooks SWR/BD"`

---

## Reporte final estandarizado (OBLIGATORIO — el owner lo copia al chat orquestador)

1. **Ventana y estado:** P1 HECHA/PARCIAL + motivo.
2. **Commits:** hash + subject y push sí/no.
3. **Specs creadas/modificadas + changes archivados:** ninguno (esta serie es refactor UI, no change funcional nuevo).
4. **Números:** tests X/Y pass, tsc/eslint OK, páginas migradas N/6.
5. **Desviaciones vs el prompt:** documentar si alguna página no se pudo migrar y por qué.
6. **Pendientes heredados a la(s) ventana(s) siguiente(s):** páginas que quedaron con fallback al store.
7. **Última línea exacta:** `BITACORA_ENTRY: P1 — Dashboard + Admin base migrados a hooks SWR (N/6 páginas), commit <hash>, tests X/Y.`
