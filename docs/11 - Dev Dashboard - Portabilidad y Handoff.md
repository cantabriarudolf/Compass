# 11 - Dev Dashboard: Portabilidad y Handoff

Guía para **cargar el Dev Dashboard en otro lado** (otra máquina, otra copia del repo o como endpoint para un agente como Hermes/OpenCode). Documenta de qué depende, cómo busca las rutas y cómo montarlo desde cero.

---

## 1. Qué hace y cuánto pesa

Herramienta de desarrollo (control de avance OpenSpec). Lee el filesystem del repo y deriva el estado de módulos, changes y capabilities. **No tiene datos manuales ni base de datos.**

Son **4 archivos**:

| Archivo | Rol |
|---|---|
| `k0mp4ss_fe/apps/web/app/admin/dev-dashboard/page.tsx` | UI (pestañas, KPI, checkboxes) |
| `k0mp4ss_fe/apps/web/app/api/dev-dashboard/route.ts` | Endpoint `GET` + `PATCH` |
| `k0mp4ss_fe/apps/web/lib/dev-dashboard.ts` | Capa de datos (lee el filesystem, deriva estado, persiste tareas) |
| `docs/11 - Dev Dashboard: Portabilidad y Handoff.md` | Este documento |

---

## 📍 Supuesto de layout (lo que asume al arrancar)

Para funcionar autónomo, el código busca la **raíz del monorepo** donde conviven:

```
<RAIZ DEL REPO>
├── openspec/
│   ├── specs/                      <- capabilities consolidadas
│   └── changes/
│       ├── <change>/tasks.md       <- changes activos
│       └── archive/                <- historial archivado
├── Data/
│   └── NSGC/docs/especificaciones/ <- 🗺️ CATÁLOGO DE MÓDULOS (26 .md) — FUENTE EXTERNA
└── k0mp4ss_fe/apps/web/            <- la app (cwd de `npm run dev`)
```

`lib/dev-dashboard.ts` resuelve la raíz **caminando hacia arriba** desde `process.cwd()` hasta encontrar una carpeta que contenga a la vez `openspec/` y `Data/`. Si no la halla, retrocede a `process.cwd()/..`.

### 🗺️ Fuente externa de módulos — componente a tener claro al replicar

El **catálogo de módulos del dashboard NO vive dentro de la app**: se lee de
`<RAIZ>/Data/NSGC/docs/especificaciones/*.md` (una carpeta **fuera** de `k0mp4ss_fe`).

Es el "mapa de referencia" contra el que se cruzan los changes de OpenSpec para derivar
estado (En Proceso / Completado / Documentado / Pendiente).

**Consecuencias al replicar en otro proyecto:**
- Si el otro proyecto no tiene esa carpeta, el dashboard no muestra módulos (queda vacío).
- La estructura de nombres esperada es `<CODIGO> - <Nombre>.md` (ej. `VU - Vinculacion Unidades.md`),
  donde las **2–3 primeras letras** son el código que se cruza con `openspec/changes/<codigo>-...` y `openspec/specs/<codigo>-...`.
- El código, fase y ruta por módulo se resuelven con mapas internos (`PHASES`, `ROUTES`) en `lib/dev-dashboard.ts`.
  Al portar a otro proyecto hay que **revisar esos mapas** para que coincidan con el catálogo nuevo.
- Si quieres apuntar a otro directorio (sin renombrar nada), idealmente **parametrizar esa ruta** con una env
  (p. ej. `MODULES_DIR`) en vez de depender del default fijo. Hoy el default es fijo.

### Variables de entorno (opcional)
| Var | Uso |
|---|---|
| `COMPASS_ROOT` | Forzar la raíz del repo si el auto-detector falla (p. ej. repo desplegado en otra ruta). |

> ⚠️ Si usas `COMPASS_ROOT` en un repo Turborepo/pnpm, declárala en `turbo.json` (o en `globalEnv` de la app) para evitar el warning de `turbo/no-undeclared-env-vars`.

---

## 3. Fuentes de datos y algoritmo de estado

### Fuentes
| Ruta | Qué extrae |
|---|---|
| `Data/NSGC/docs/especificaciones/*.md` | **Catálogo de módulos** (fuente externa, ver §2): código, nombre, fase |
| `openspec/changes/<change>/tasks.md` | Secciones `##` + tareas `- [ ]/[] id. título` |
| `openspec/changes/archive/` | Changes archivados (historial) |
| `openspec/specs/<cap>/spec.md` | Capabilities consolidadas → estado "documentado" |

### Estado por módulo (prioridad descendente)
1. **En Proceso**: change activo cuyo id empieza por `<codigo>-` (ej `VU-...`).
2. **Completado**: change archivado asociado — vía `ARCHIVED_OVERRIDES` (mapeo manual conocido, ej `inventario-estructura → EF`) o match de palabras clave contra el nombre del módulo.
3. **Documentado**: existe el dir en `openspec/specs/<codigo>-.../`.
4. **Pendiente**: ningún match.

> 💡 La relación specs↔changes **no es 1:1**: un change puede archivar varias capabilities, y capabilities transversales (`UI-*`, `agents.md`, `project.md`) no corresponden a un módulo ni a un change activo. El mapa 24/26 módulos se arma desde `especificaciones/`, no desde `specs/`.

---

## 4. Endpoint API

- `GET /api/dev-dashboard` → JSON `{ modules, changes, archived, specs, stats }`.
- `PATCH /api/dev-dashboard` con body `{ changeId, taskId }` → **alterna el checkbox en `tasks.md`** (escribe `[ ]`→`[x]`) y devuelve el change actualizado.

Rutas exportan `dynamic = 'force-dynamic'` (siempre el filesystem se lee en cada request).

---

## 5. Puesta en marcha

```bash
cd k0mp4ss_fe
npm run dev
# abre http://localhost:3000/admin/dev-dashboard
```

Los elenco sirven:
- Typecheck: `npx tsc --noEmit`
- Lint: `npx eslint app/admin/dev-dashboard/page.tsx app/api/dev-dashboard/route.ts lib/dev-dashboard.ts`

### Pruebas manuales del endpoint
```bash
curl http://localhost:3000/api/dev-dashboard
curl -X PATCH http://localhost:3000/api/dev-dashboard \
  -H "Content-Type: application/json" \
  -d '{"changeId":"VU-vinculacion-unidades","taskId":"1.1"}'
```

---

## 6. Dependencias

- **Runtime (server)**: solo builtins de Node (`node:fs`, `node:path`) → cero deps.
- **UI**: `@workspace/ui` y `@tabler/icons-react` (**ya presentes** en la app; no hay que instalar nada nuevo).
- No usa base de datos, ORM, ni estado de negocio.

---

## 7. Quitarse (opcional)

1. Borrar `apps/web/app/admin/dev-dashboard/page.tsx` y `apps/web/app/api/dev-dashboard/route.ts`.
2. Borrar `apps/web/lib/dev-dashboard.ts`.
3. Quitar el link en `apps/web/components/app-sidebar.tsx`.

No deja efectos en OpenSpec: los `tasks.md` y specs son independientes.

---

## 8. Avisos / límites conocidos

- El match **archivado→módulo** usa `ARCHIVED_OVERRIDES` + palabras clave; si un change nuevo se archive y no entrena, añadirla a `ARCHIVED_OVERRIDES`.
- Paths: depende del walk hacia la raíz con `openspec/` + `Data/`. Si el repo se mueve y eso rompe, establece `COMPASS_ROOT`.
- Los checkboxes escriben **directo sobre `tasks.md` del repo**: es intencional (el estado vive en el repo), pero implica permisos de escritura en el proceso server.