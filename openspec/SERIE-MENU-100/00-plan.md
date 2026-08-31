# Serie MENU-100 — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.
> Reanudación en chat nuevo: basta "corre la serie SERIE-MENU-100" — el orquestador lee el
> estado desde este archivo + git, NUNCA de texto de otros chats.

**Objetivo:** cerrar el 100% del spec vigente — las últimas 4 rutas del menú marcadas
"Próximamente" (`UI-navegacion-lateral` las exige como MUST) + el Dashboard OpenSpec
reflejando 100% "Completado". Post-serie: ver `openspec/BACKLOG-100.md` (C1-C4, frontera
"futuro" decidida por el owner — NO perder contexto).

**Alcance:** 4 changes de app (uno por ruta) + fix de mapeo del dev-dashboard. Cada change
sigue el método completo: openspec-propose → implementar → validar → commit → nsgc-prepush →
push → archive → Bitácora. **Sin bump de STORE_VERSION** (solo lecturas nuevas de colecciones
existentes; salvo P4/P5 si la extracción requiere mover código — sin cambios de esquema).

## Base de hechos (inventario verificado en código 2026-08-31)

1. **`/personas/residentes`** — MP vive en `/comunidad/personas` (grilla + vista detalle).
   Store: `personas`, `vinculos` (rol propietario/arrendatario), `unidades`. "Residentes" =
   directorio filtrado a personas con vínculo vigente (propietario/arrendatario), reutilizando
   los componentes/patrón de la grilla MP. El item del menú ya existe en `RUTAS_PENDIENTES`.
2. **`/dashboard`** (Resumen) — landing de Inicio. Datos disponibles: `useCompassStore`
   (unidades, personas, eventos, cargos FI), `/admin/metricas` (KPIs por módulo) y
   `/admin/reporteria`. El Resumen agrupa KPIs clave + accesos rápidos a módulos. El grupo
   "Inicio" del sidebar apunta a `/dashboard` y hoy cae en placeholder.
3. **`/operaciones/accesos`** (Accesos y Visitas) — `/operaciones/bitacora` ya renderiza
   tabs "Visitas" y "Contratistas" (colecciones `visitasTecnicasPE`, contratistas PE; eventos
   `PE_VISITA_INGRESADA` etc.). Extraer esos módulos a vista dedicada (componentes
   compartidos) — bitácora conserva sus tabs.
4. **`/operaciones/paqueteria`** (Encomiendas) — bitácora tab "Encomiendas"
   (`encomiendasPE` + `saveEncomiendaPE`/`registrarRetiroEncomiendaPE`/`removeEncomiendaPE`;
   eventos `PE_ENCOMIENDA_RECIBIDA/RETIRADA`, regla "encomienda Archivada no admite ediciones"
   ya en store). Extraer a vista dedicada.
5. **Dashboard OpenSpec** — 6 módulos en "documentado" (UI Navegacion, MA, CF, AM, AU, SG):
   sus changes están archivados pero el mapeo por keyword no los cierra (specs compartidos
   actualizados por archives de otros changes). Fix: `ARCHIVED_OVERRIDES`/keywords en
   `lib/dev-dashboard.ts` (ya existe el mecanismo, ej. GE→AD).

## Quirúrgicos y reglas (heredados)

- Cada change: delta spec del capability correspondiente (MP / UI / PE) con ADDED/MODIFIED
  correctos (ADDED si el requirement no existe — lección de `rp-permisos-visor`).
- Vista read-oriented salvo acciones que el store ya provee (encomiendas sí tiene acciones).
- e2e: patrón read-oriented con quirúrgicos del avance 2026-08-29; si la ruta crea datos
  reales, afirmar en tabla/lista; cierre `expect(errores).toEqual([])`.
- Sidebar: quitar la ruta de `RUTAS_PENDIENTES` en su ventana.
- `next build` puede fallar por red (Google Fonts): ignóralo. No commitear Untitled.md.
- Si el contexto se agota: cierra la tarea en curso, commitea y deja el estado exacto en
  este 00-plan.md.

## Roadmap

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | B — Dashboard OpenSpec 6 documentado → completado (mapeo/overrides + verificación del dashboard con datos reales) | pendiente | — |
| P2 | A2 — change `mp-residentes-vista`: `/personas/residentes` (directorio filtrado MP) + e2e | pendiente | — |
| P3 | A1 — change `ui-resumen-dashboard`: `/dashboard` (Resumen con KPIs del store) + e2e | pendiente | — |
| P4 | A3 — change `pe-accesos-vista`: `/operaciones/accesos` (Visitas + Contratistas dedicadas) + e2e | pendiente | — |
| P5 | A4 — change `pe-paqueteria-vista`: `/operaciones/paqueteria` (Encomiendas dedicada) + e2e | pendiente | — |
| P6 | Cierre integral: suite e2e completa verde + Vitest + avance NSGC + SERIE COMPLETA | pendiente | — |

## Bitácora

(vacía — cada ventana añade antes del push: `- [fecha] P<n> HECHA: resumen (commit hash)`)
