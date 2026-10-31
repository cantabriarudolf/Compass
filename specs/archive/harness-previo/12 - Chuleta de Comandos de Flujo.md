# 🧭 Chuleta Consolidada: Comandos y Flujo de Trabajo (Compass)

Guía rápida única con todos los comandos del flujo: ciclo OpenSpec, respaldos, cierre de módulos y publicación. Reemplaza y consolida las chuletas de los comandos individuales (referencia al [Torpedo de Interacción AI](../Data/NSGC/docs/manuales/00%20-%20Torpedo%20de%20Interaccion%20AI.md) para las reglas de prompting).

---

## 🗺️ Ciclo de vida completo

```
/opsx-propose  →  /opsx-apply  →  (pruebas)  →  /cierra-modulo  →  /nsgc-prepush
                                                     ↑
                        /respaldo-parcial (al cambiar de módulo)
```

| Momento | Comando | ¿Archiva? | ¿Commitea/Pushea? |
| :--- | :--- | :---: | :---: |
| Diseñar módulo nuevo | `/opsx-propose` con prompt estándar SPEC *(abajo)* | ❌ | ❌ |
| Implementar tareas | `/opsx-apply` | ❌ | ❌ |
| Pausa / cambio de módulo | `/respaldo-parcial [ruta-json]` | ❌ | ❌ |
| Validar 1 módulo sin cerrar | `/valida-datos SPEC --partial` *(abajo)* | ❌ | ❌ |
| Validar todos activos | `/valida-datos --all-active --partial` | ❌ | ❌ |
| Validar un backup JSON | `/valida-backup [ruta-json]` | ❌ | ❌ |
| Cerrar módulo terminado | `/cierra-modulo SPEC` *(abajo)* | ✅ | ❌ (pregunta al final) |
| Publicar a GitHub | `/nsgc-prepush` | — | ✅ |

---

## 🧊 `/respaldo-parcial` — snapshot entre módulos

**Para qué:** congelar el punto de retorno al saltar de un módulo a otro. No valida a fondo, no corrige, no archiva, no commitea.

**Cómo:**
1. Exporta datos en `/admin/dev-dashboard` → **"Exportar datos"** → obtienes `compass-backup-YYYY-MM-DD.json`.
2. Invoca: `/respaldo-parcial /ruta/compass-backup-2026-08-17.json` (o sin ruta y te la pide).

**Qué hace:**

| Fase | Acción |
| :--- | :--- |
| 1. Estado | `git status`/`diff` + changes activos con tareas pendientes. |
| 2. Snapshot | Valida el JSON (estructura, versión, vínculos huérfanos) y si es válido lo copia a `Data/NSGC/backups/compass-backup-YYYY-MM-DD-HH-MM.json`. Si falla, no lo copia y lo anota. |
| 3. Checkpoint | Crea/actualiza el avance de sesión con sección "🧊 Respaldo Parcial" (qué quedó pendiente, dónde quedó el backup, cómo retomar). |
| 4. Resumen | Reporta dónde quedó todo. |

---

## 🏁 `/cierra-modulo` — cierre integral

**Para qué:** terminar y archivar un módulo en UN solo pase, sin saltarse pasos.

**Cómo:** `/cierra-modulo <change>` (o `/cierra-modulo` y te pregunta cuál si hay varios activos).

**Fases:**

| # | Fase | Qué hace |
| :--- | :--- | :--- |
| 1 | Validación ST | Checklist completo de `valida-datos`; corrige lo que esté en alcance; se detiene si hay críticos. |
| 2 | Verificación técnica | `tsc` + lint 0 errores; contrato ST (versión, partialize, migrate). |
| 3 | Snapshot | Recuerda exportar el backup del dashboard (no bloquea). |
| 4 | Documentación NSGC | Catálogo de Mocks + Data Dumps, manual del módulo, avance, trazabilidad e índice. |
| 5 | Archivado | Flujo completo de `opsx-archive`: status, sync de specs inline y movimiento a `openspec/changes/archive/`. |
| 6 | Checklist final | ✅/❌ de los 8 puntos; declara lo pendiente. |
| 7 | Publicación (opt-in) | Pregunta: "¿Publicar ahora con `/nsgc-prepush`?" → Sí encadena commit+push; No termina local. |

> Las únicas preguntas que verás: tareas incompletas, sync de specs y la publicación final. Nunca pasos rutinarios olvidables.

---

## 🚀 `/nsgc-prepush` — publicación

**Para qué:** validar que la documentación NSGC esté sincronizada y recién ahí commitear y pushear.

**Qué valida:**
1. Mocks: si cambió `apps/web/data/**` → Catálogo de Mocks + Data Dumps + índice.
2. Manual del módulo afectado actualizado.
3. Avance de desarrollo de la sesión existente.
4. Trazabilidad e índice si cambió el estado de un módulo.

**Regla:** no commitea ni pushea hasta que el checklist esté completo (o tú eximas un ítem explícitamente).

---

## ✅ `/valida-datos` y `/valida-backup` (actualizado enhance-rg-st-seed-gears)

| Comando | Valida (7 puntos) | ¿Corrige? |
| :--- | :--- | :---: |
| `/valida-datos SPEC --partial` | 1 Artefactos · 2 Contrato datos (Rank 0..99 + Depende de) · 3 Antipatrones · 4 Integración · 5 Contrato ST (STORE_VERSION/migrate + SeedValidationReport + backups) · 6 Verificación (tsc + `rg condominio`) · 7 Carga ordenada y relato (34 Historia + FK en save* + qa-lab) | ✅ (solo en alcance ST) |
| `/valida-datos --all-active --partial` | Lo mismo pero para **todos** los `openspec/changes/*` activos + chequeo global DAG `Rank` (detecta ciclo/FK a rank mayor entre changes) | ✅ |
| `/valida-backup [json]` | Estructura, compatibilidad versiones, integridad referencial, coherencia migraciones | ❌ (solo informa) |

**Modo sin cerrar:** añade `--partial` / `--sin-cerrar` para validar y seguir con otras specs en paralelo (tu flujo actual). Sin el flag, `cierra-modulo` lo usa como FASE 1 y exige cierre.

---

## 🚀 Prompts Estándar — una sola variable `SPEC`

> **Regla:** reemplaza **`SPEC`** una sola vez por el nombre del archivo en `Data/NSGC/docs/especificaciones/` (ej: `FI - Finanzas y Morosidad`). El agente deriva el `change` kebab (`FI-finanzas-morosidad`) y la ruta `@` automáticamente. Copiar-pegar tal cual.

**1. Llevar una spec a OpenSpec:**
```bash
Lleva a OpenSpec la spec @Data/NSGC/docs/especificaciones/SPEC.md — crea el change (kebab de SPEC: AA-nombre-kebab), con proposal/design/tasks y delta specs que incluyan Dependencias de Carga y Seed (Rank 0..99 + Entidades ST + Seed Manifest + Validación FK en save* + Bulk SeedReport + Migración + eventos AM) y deja Historia 34 al día. Usa solo SPEC como variable.
# Ej: SPEC = FI - Finanzas y Morosidad  →  @Data/NSGC/docs/especificaciones/FI - Finanzas y Morosidad.md  →  change FI-finanzas-morosidad
```

**2. Validar sin cerrar (avance paralelo):**
```bash
/valida-datos SPEC --partial
# Ej: SPEC = FI-finanzas-morosidad  (o FI - Finanzas y Morosidad, el agente lo mapea)
# Para todos los activos en paralelo:
/valida-datos --all-active --partial
# No archiva, solo valida 7 puntos y deja el change abierto por si queda algo en el tintero
```

**3. Cerrar módulo:**
```bash
/cierra-modulo SPEC
# Ej: SPEC = FI-finanzas-morosidad
# Hace valida-datos + tsc/lint + STORE_VERSION/migrate + Mocks/Manual/Avance/Trazabilidad + Archivado + pregunta push
```

> Tip: en `SPEC` puedes pegar `FI - Finanzas y Morosidad` o `FI-finanzas-morosidad`; el agente normaliza a kebab para el `change`.

## 📊 Dashboard (`/admin/dev-dashboard`)

- **Columna "Cierre"**: 🔵 Falta cierre (copia el comando `/cierra-modulo <change>` al clic) · 🟢 Cerrado · — No aplica. Filtro propio + buscador.
- **Exportar/Importar datos**: botones en el header para respaldar/restaurar el store del navegador, con validación de estructura, versión e integridad al importar.

---

## ⚠️ Reglas de oro (del Torpedo)

1. **Chats nuevos** al empezar un módulo, después de archivar y para bugfixing puntual; mantener chat solo mientras se itera el módulo actual.
2. **Los archivos son la memoria**: `Data/NSGC/docs/` y `docs/` — no dependas de que el agente "recuerde".
3. **Trazabilidad siempre**: actualizar `03 - Mapa de Desarrollo y Trazabilidad.md` y crear avance al cerrar cada módulo.
4. **Norma de Mocks** al cerrar: Catálogo (`28 - MK`) + Data Dump por dominio + índice.
5. **Backups**: exporta el JSON del dashboard antes de limpiar el navegador o cambiar de máquina.
