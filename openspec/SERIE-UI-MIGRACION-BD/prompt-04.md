> **Este archivo ES tu prompt.** Ventana P4 de la serie `SERIE-UI-MIGRACION-BD`.
> Léelo completo (incluido `openspec/SERIE-UI-MIGRACION-BD/00-plan.md`) y ejecuta sus bloques en orden.

---

## Contexto común (válido para TODA la serie UI-Migración-BD)

**Estado previo:** La serie `SERIE-BD-FUENTE-VERDAD` creó la infraestructura completa de persistencia servidora: 107 API routes, ~30 hooks SWR en `lib/api/`, tests de API 151/151 pasando. El store legacy (`lib/store.ts`, 8.600 líneas) está marcado `@deprecated` con `STORE_VERSION = 28` congelado. Pero 28 páginas de la app aún leen/escriben datos de dominio desde `useCompassStore`.

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

## Arranque: verificación de la ventana anterior (antes de tu alcance)

1. `git status` (tree limpio) y `git status -sb` (sin "ahead": todo pusheado) y `git log --oneline -8`.
2. `openspec validate --all` → sin fallos.
3. `cd k0mp4ss_fe/apps/web && npm test` → suite completa verde.
4. Contrastar con `openspec/SERIE-UI-MIGRACION-BD/00-plan.md`:
   - Fila P3 HECHA y todo OK → marca tu fila P4 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero (change fix pequeño + test), anótalo en la Bitácora, y solo después empieza tu alcance.
   - PARCIAL o repo a medias → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

---

## Alcance de esta ventana (P4): Inventario

Migrar las siguientes páginas de `useCompassStore` (datos de dominio) a hooks SWR:

### Páginas objetivo

1. **`app/inventario/estructura/page.tsx`** → `useUnidades`, `useMacroSectores`, `useMicroSectores`
   - Reemplazar lectura de unidades, macro sectores, micro sectores.

2. **`app/inventario/tipos/page.tsx`** → `useTiposUnidad`
   - Reemplazar lectura de tipos de unidad.

3. **`app/inventario/recursos/page.tsx`** → `useIR`
   - Reemplazar lectura de activos IR, solicitudes de insumo, entregas EPP.

4. **`app/inventario/proyectos/page.tsx`** → `useMT`
   - Reemplazar lectura de trabajos MT y proyectos MT.

### Patrón de migración

```typescript
// ANTES
import { useCompassStore } from "@/lib/store"
const unidades = useCompassStore((s) => s.unidades)

// DESPUÉS
import { useUnidades } from "@/lib/api/use-unidades"
const { items: unidades, isLoading } = useUnidades()
```

**Reglas específicas:**
- `hasHydrated` → `isLoading` del hook.
- Skeletons con `isLoading`.
- **NO tocar** estado de UI puro.

### Criterios de aceptación

- [ ] Las 4 páginas migradas no usan `useCompassStore` para datos de dominio.
- [ ] `tsc` 0 errores.
- [ ] `npm test` suite completa verde.
- [ ] Commitear: `git commit -m "feat(ui): P4 migración Inventario a hooks SWR/BD"`

---

## Reporte final estandarizado (OBLIGATORIO)

1. **Ventana y estado:** P4 HECHA/PARCIAL + motivo.
2. **Commits:** hash + subject y push sí/no.
3. **Specs:** ninguna.
4. **Números:** tests X/Y pass, tsc/eslint OK, páginas migradas N/4.
5. **Desviaciones vs el prompt:** documentar.
6. **Pendientes heredados:** páginas con fallback.
7. **Última línea exacta:** `BITACORA_ENTRY: P4 — Inventario migrado a hooks SWR (N/4 páginas), commit <hash>, tests X/Y.`
