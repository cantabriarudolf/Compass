> **Este archivo ES tu prompt.** Ventana P3 de la serie `SERIE-UI-MIGRACION-BD`.
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
   - Fila P2 HECHA y todo OK → marca tu fila P3 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero (change fix pequeño + test), anótalo en la Bitácora, y solo después empieza tu alcance.
   - PARCIAL o repo a medias → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

---

## Alcance de esta ventana (P3): Operaciones

Migrar las siguientes páginas de `useCompassStore` (datos de dominio) a hooks SWR:

### Páginas objetivo

1. **`app/operaciones/bitacora/page.tsx`** → `usePE`
   - Reemplazar lectura de bitácoras de visita, encomiendas, ingresos contratistas.

2. **`app/operaciones/paqueteria/page.tsx`** → `usePE`
   - Reemplazar lectura de encomiendas.

3. **`app/operaciones/accesos/page.tsx`**
   - Revisar qué datos lee (probablemente accesos/permisos).
   - Si no hay hook dedicado, dejar fallback con `// TODO`.

4. **`app/operaciones/proveedores/page.tsx`** → `usePE`
   - Reemplazar lectura de proveedores.

5. **`app/operaciones/reservas/page.tsx`** → `useRA`
   - Reemplazar lectura de elementos RA y reservas.
   - **Atención:** la creación de reservas tiene lógica de concurrencia (solape de horarios). El hook `useRA` ya maneja esto en el servidor.

6. **`app/operaciones/solicitudes/page.tsx`** → `useGE`
   - Reemplazar lectura de solicitudes GE.

### Patrón de migración

```typescript
// ANTES
import { useCompassStore } from "@/lib/store"
const bitacoras = useCompassStore((s) => s.bitacoraVisitasPE)

// DESPUÉS
import { usePE } from "@/lib/api/use-pe"
const { bitacoras, isLoading } = usePE()
```

**Reglas específicas:**
- `hasHydrated` → `isLoading` del hook.
- Skeletons con `isLoading`.
- **NO tocar** estado de UI puro.

### Criterios de aceptación

- [ ] Las 6 páginas migradas no usan `useCompassStore` para datos de dominio.
- [ ] `tsc` 0 errores.
- [ ] `npm test` suite completa verde.
- [ ] Commitear: `git commit -m "feat(ui): P3 migración Operaciones a hooks SWR/BD"`

---

## Reporte final estandarizado (OBLIGATORIO)

1. **Ventana y estado:** P3 HECHA/PARCIAL + motivo.
2. **Commits:** hash + subject y push sí/no.
3. **Specs:** ninguna.
4. **Números:** tests X/Y pass, tsc/eslint OK, páginas migradas N/6.
5. **Desviaciones vs el prompt:** documentar.
6. **Pendientes heredados:** páginas con fallback.
7. **Última línea exacta:** `BITACORA_ENTRY: P3 — Operaciones migradas a hooks SWR (N/6 páginas), commit <hash>, tests X/Y.`
