> **Este archivo ES tu prompt.** Ventana P2 de la serie `SERIE-UI-MIGRACION-BD`.
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
   - Fila P1 HECHA y todo OK → marca tu fila P2 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero (change fix pequeño + test), anótalo en la Bitácora, y solo después empieza tu alcance.
   - PARCIAL o repo a medias → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

---

## Alcance de esta ventana (P2): Comunidad restante

Migrar las siguientes páginas de `useCompassStore` (datos de dominio) a hooks SWR:

### Páginas objetivo

1. **`app/comunidad/personas/[id]/page.tsx`** → `usePersonas`, `useVinculos`
   - Revisar qué datos lee del store (probablemente `personas`, `vinculos`, `unidades`).
   - La página padre (`app/comunidad/personas/page.tsx`) ya usa `usePersonas`; verificar que la ficha individual también.
   - Reemplazar `savePersona`, `saveVinculo`, etc. por las funciones del hook.

2. **`app/comunidad/portal/page.tsx`**
   - Revisar qué datos lee (probablemente `publicacionesPortal`, `leadsPortal`).
   - Si no hay hooks dedicados para PI (Portal Inmobiliario), dejar fallback con `// TODO`.

3. **`app/comunidad/visor/page.tsx`** → `useCV` (o `useAvisosCV`)
   - Reemplazar lectura de avisos del store por el hook.

4. **`app/comunidad/certificados/page.tsx`** → `useCertificadosCT`
   - Reemplazar lectura/escritura de certificados.

5. **`app/comunidad/comunicacion/page.tsx`** → `useCO`
   - Reemplazar lectura de mensajes del buzón, envíos, plantillas.

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
- Skeletons de carga: usar el patrón existente pero con `isLoading`.
- Si la página hace `useCompassStore.getState()` para acceso directo, reemplazar por llamada a API o por el hook.
- **NO tocar** estado de UI puro (modales, filtros, selección de pestaña).

### Criterios de aceptación

- [ ] Las 5 páginas migradas no usan `useCompassStore` para datos de dominio.
- [ ] `tsc` 0 errores.
- [ ] `npm test` suite completa verde.
- [ ] Commitear: `git commit -m "feat(ui): P2 migración Comunidad a hooks SWR/BD"`

---

## Reporte final estandarizado (OBLIGATORIO)

1. **Ventana y estado:** P2 HECHA/PARCIAL + motivo.
2. **Commits:** hash + subject y push sí/no.
3. **Specs:** ninguna (refactor UI).
4. **Números:** tests X/Y pass, tsc/eslint OK, páginas migradas N/5.
5. **Desviaciones vs el prompt:** documentar si alguna página no se pudo migrar.
6. **Pendientes heredados:** páginas con fallback al store.
7. **Última línea exacta:** `BITACORA_ENTRY: P2 — Comunidad migrada a hooks SWR (N/5 páginas), commit <hash>, tests X/Y.`
